import type { GameCtx, GameEngine, Result } from './types.js';
import { rankPoints } from './util.js';
import { answerText, checkSubmission, draw, isChoice, judge, localize, publicQuestion, DIFFICULTY_NAMES, TYPE_NAMES, type Question } from '../bank/index.js';
import type { QuizGameCfg } from '../bank/games.js';

const TOTAL = 10;
const REVEAL_MS = Number(process.env.QUIZ_REVEAL_MS ?? 5000);
type Phase = 'question' | 'reveal' | 'over';

/** 每道题的作答时间：一键作答 15 秒，多选 20 秒，需要打字 25 秒 */
const timeFor = (q: Question) => (isChoice(q) ? 15_000 : q.type === 'multi' ? 20_000 : 25_000);

interface Answer {
  sub: { choice?: number; choices?: number[]; text?: string };
  at: number;
}

/**
 * 题库问答（答题竞赛和所有“某某问答”共用）：10 题，按游戏配置从题库抽题，
 * 同一局不重复，同一房间连续玩也尽量不重复。答对 10 分 + 速度加成（最多 5 分）。
 * 支持单选、多选、判断、填空、简答、图片猜题、文字推理。
 */
export class QuizGame implements GameEngine {
  private ids: string[];
  private questions: Question[];
  private idx = 0;
  private phase: Phase = 'question';
  private startedAt = 0;
  private answers = new Map<string, Answer>();
  private correct = new Map<string, boolean>();
  private points: Record<string, number> = {};
  private lastGains: Record<string, number> = {};
  private timer: NodeJS.Timeout | null = null;

  constructor(private ctx: GameCtx, private cfg: QuizGameCfg) {
    this.ids = ctx.players.map((p) => p.id);
    this.questions = draw({
      banks: cfg.banks,
      tag: cfg.tag,
      difficulty: ctx.settings?.difficulty ?? 0,
      choiceOnly: cfg.choiceOnly,
      count: TOTAL,
      exclude: ctx.used,
      english: ctx.english,
    });
    for (const q of this.questions) ctx.used?.add(q.id);
    for (const id of this.ids) this.points[id] = 0;
    this.startQuestion();
  }

  private get q() {
    return this.questions[this.idx];
  }

  private startQuestion() {
    this.phase = 'question';
    this.answers.clear();
    this.correct.clear();
    this.startedAt = Date.now();
    this.timer = setTimeout(() => {
      if (this.phase === 'question') {
        this.reveal();
        this.ctx.notify();
      }
    }, timeFor(this.q));
  }

  private reveal() {
    if (this.timer) clearTimeout(this.timer);
    this.phase = 'reveal';
    this.lastGains = {};
    const total = timeFor(this.q);
    for (const id of this.ids) {
      const ans = this.answers.get(id);
      const ok = !!ans && judge(this.q, ans.sub);
      this.correct.set(id, ok);
      let gain = 0;
      if (ok) {
        const remaining = Math.max(0, total - (ans!.at - this.startedAt));
        gain = 10 + Math.floor((5 * remaining) / total);
      }
      this.lastGains[id] = gain;
      this.points[id] += gain;
    }
    this.timer = setTimeout(() => {
      this.next();
      this.ctx.notify();
    }, REVEAL_MS);
  }

  private next() {
    this.idx++;
    if (this.idx >= this.questions.length) {
      this.phase = 'over';
      this.timer = null;
    } else {
      this.startQuestion();
    }
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    if (a?.type !== 'answer') return { ok: false, error: '未知操作' };
    if (this.phase !== 'question') return { ok: false, error: '现在不能作答' };
    if (this.answers.has(pid)) return { ok: false, error: '这题你已经作答了' };
    if (a.index !== this.idx) return { ok: false, error: '题目已经切换' };
    const err = checkSubmission(this.q, a);
    if (err) return { ok: false, error: err };
    this.answers.set(pid, {
      sub: { choice: a.choice, choices: a.choices, text: typeof a.text === 'string' ? a.text.trim() : undefined },
      at: Date.now(),
    });
    if (this.answers.size === this.ids.length) this.reveal();
    return { ok: true };
  }

  private ranking() {
    return rankPoints(this.points, this.ids);
  }

  /** 揭晓时显示每个人的答案 */
  private shown(id: string, q: Question): string | null {
    const a = this.answers.get(id);
    if (!a) return null;
    if (isChoice(q)) return q.options![a.sub.choice!];
    if (q.type === 'multi') return a.sub.choices!.map((i) => q.options![i]).join('、');
    return a.sub.text ?? null;
  }

  viewFor(pid: string, lang?: 'zh' | 'en') {
    const base = { game: 'quiz', phase: this.phase, total: this.questions.length, index: this.idx, points: this.points };
    if (this.phase === 'over') return { ...base, ranking: this.ranking() };
    const q = localize(this.q, lang); // 英文玩家看到英文题干、选项和解释
    const mine = this.answers.get(pid);
    const pub = publicQuestion(q);
    const view: any = {
      ...base,
      category: pub.bankName,
      difficultyName: DIFFICULTY_NAMES[q.difficulty],
      typeName: TYPE_NAMES[q.type],
      qtype: q.type,
      image: pub.image,
      question: pub.q,
      options: pub.options,
      answered: [...this.answers.keys()],
      myChoice: mine?.sub.choice ?? null,
      myChoices: mine?.sub.choices ?? null,
      myText: mine?.sub.text ?? null,
      endsInMs: this.phase === 'question' ? Math.max(0, this.startedAt + timeFor(q) - Date.now()) : 0,
    };
    if (this.phase === 'reveal') {
      // 只有揭晓后才发送正确答案、解释和每个人的选择
      view.answer = isChoice(q) ? q.answer : null;
      view.answerText = answerText(q);
      view.explain = q.explain;
      view.choices = Object.fromEntries(this.ids.map((id) => [id, this.answers.get(id)?.sub.choice ?? null]));
      view.shown = Object.fromEntries(this.ids.map((id) => [id, this.shown(id, q)]));
      view.correct = Object.fromEntries(this.ids.map((id) => [id, this.correct.get(id) ?? false]));
      view.answerSet = q.type === 'multi' ? q.answer : null;
      view.gains = this.lastGains;
    }
    return view;
  }

  isOver() {
    return this.phase === 'over';
  }

  scores(): Record<string, number> {
    return Object.fromEntries(this.ranking().map((r) => [r.id, r.bonus]));
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }
}
