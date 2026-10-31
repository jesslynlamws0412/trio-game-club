import type { GameCtx, GameEngine, Result } from './types.js';
import { shuffle } from './util.js';
import { QUIZ_BANK, type QuizQuestion } from '../data/quizBank.js';

const TOTAL = 10;
const Q_MS = 15_000;
const REVEAL_MS = Number(process.env.QUIZ_REVEAL_MS ?? 5000);
type Phase = 'question' | 'reveal' | 'over';

/** 答题竞赛：10 题，每题 15 秒。答对 10 分 + 速度加成（最多 5 分）。 */
export class QuizGame implements GameEngine {
  private ids: string[];
  private questions: QuizQuestion[];
  private idx = 0;
  private phase: Phase = 'question';
  private startedAt = 0;
  private answers = new Map<string, { choice: number; at: number }>();
  private points: Record<string, number> = {};
  private lastGains: Record<string, number> = {};
  private timer: NodeJS.Timeout | null = null;

  constructor(private ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    this.questions = shuffle(QUIZ_BANK).slice(0, TOTAL);
    for (const id of this.ids) this.points[id] = 0;
    this.startQuestion();
  }

  private get q() {
    return this.questions[this.idx];
  }

  private startQuestion() {
    this.phase = 'question';
    this.answers.clear();
    this.startedAt = Date.now();
    this.timer = setTimeout(() => {
      if (this.phase === 'question') {
        this.reveal();
        this.ctx.notify();
      }
    }, Q_MS);
  }

  private reveal() {
    if (this.timer) clearTimeout(this.timer);
    this.phase = 'reveal';
    this.lastGains = {};
    for (const id of this.ids) {
      const ans = this.answers.get(id);
      let gain = 0;
      if (ans && ans.choice === this.q.a) {
        const remaining = Math.max(0, Q_MS - (ans.at - this.startedAt));
        gain = 10 + Math.floor((5 * remaining) / Q_MS);
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
    if (!Number.isInteger(a.choice) || a.choice < 0 || a.choice >= this.q.o.length) {
      return { ok: false, error: '选项无效' };
    }
    this.answers.set(pid, { choice: a.choice, at: Date.now() });
    if (this.answers.size === this.ids.length) this.reveal();
    return { ok: true };
  }

  private ranking() {
    const sorted = [...this.ids].sort((x, y) => this.points[y] - this.points[x]);
    let rank = 0;
    return sorted.map((id, i) => {
      if (i === 0 || this.points[id] !== this.points[sorted[i - 1]]) rank = i + 1; // 同分并列
      return { id, points: this.points[id], rank };
    });
  }

  viewFor(pid: string) {
    const base = {
      game: 'quiz',
      phase: this.phase,
      total: TOTAL,
      index: this.idx,
      points: this.points,
    };
    if (this.phase === 'over') return { ...base, ranking: this.ranking() };
    const q = this.q;
    const view: any = {
      ...base,
      category: q.c,
      question: q.q,
      options: q.o,
      answered: [...this.answers.keys()],
      myChoice: this.answers.get(pid)?.choice ?? null,
      endsInMs:
        this.phase === 'question' ? Math.max(0, this.startedAt + Q_MS - Date.now()) : 0,
    };
    if (this.phase === 'reveal') {
      // 只有揭晓后才发送正确答案和每个人的选择
      view.answer = q.a;
      view.choices = Object.fromEntries(this.ids.map((id) => [id, this.answers.get(id)?.choice ?? null]));
      view.gains = this.lastGains;
    }
    return view;
  }

  isOver() {
    return this.phase === 'over';
  }

  scores(): Record<string, number> {
    const bonus = [3, 2, 1];
    const s: Record<string, number> = {};
    for (const r of this.ranking()) s[r.id] = bonus[r.rank - 1] ?? 0;
    return s;
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }
}
