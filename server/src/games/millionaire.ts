import type { GameCtx, GameEngine, Result } from './types.js';
import { rankPoints, shuffle } from './util.js';
import { bankName, draw, localize, DIFFICULTY_NAMES, type Question } from '../bank/index.js';

/** 15 级奖金阶梯（令吉 RM） */
export const LADDER = [500, 1000, 2000, 3000, 5000, 10000, 20000, 40000, 80000, 160000, 250000, 350000, 500000, 750000, 1000000];
const SAFE_LEVELS = [4, 9]; // 答对第 5、10 题后，即使之后答错也能保住这一档奖金
const QUESTION_MS = Number(process.env.MILLIONAIRE_MS ?? 60_000);
const RESULT_MS = Number(process.env.MILLIONAIRE_REVEAL_MS ?? 3500);
type Phase = 'ask' | 'result' | 'over';

/**
 * 百万富翁：像电视节目一样，玩家轮流当“参赛者”，从第 1 题答到第 15 题，奖金一路翻倍，最高 RM 1,000,000。
 * 前 5 题简单、中间 5 题普通、最后 5 题困难。答对第 5、10 题是保底关，之后答错也能保住这一档奖金，其他答错则只拿保底。
 * 三个求助：50:50（去掉两个错误选项）、问观众（给出观众投票比例，不一定准）、换题。每题限时 60 秒，超时按“放弃”结算。
 * 随时可以“放弃”带走当前奖金。所有人都当过参赛者后，按奖金排名。
 */
export class MillionaireGame implements GameEngine {
  private ids: string[];
  private order: string[];
  private contestant = 0;
  private level = 0;
  private q!: Question;
  private removed: number[] = [];
  private audience: number[] | null = null;
  private life: Record<string, { fifty: boolean; audience: boolean; swap: boolean }> = {};
  private money: Record<string, number> = {};
  private phase: Phase = 'ask';
  private startedAt = 0;
  private last: { correct: boolean; picked: number | null; answer: number; explain: string; won: number; ended: boolean; reason: string } | null = null;
  private used = new Set<string>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    const k = ctx.rotation % this.ids.length;
    this.order = [...this.ids.slice(k), ...this.ids.slice(0, k)];
    for (const id of this.ids) {
      this.money[id] = 0;
      this.life[id] = { fifty: true, audience: true, swap: true };
    }
    this.nextQuestion();
  }

  private get who() {
    return this.order[this.contestant];
  }

  private pick(): Question {
    const difficulty = this.level < 5 ? 1 : this.level < 10 ? 2 : 3;
    const exclude = new Set([...this.used, ...(this.ctx.used ?? [])]);
    // 只出 4 个选项的单选题（判断题和只有两个选项的题没法 50:50）
    const cands = draw({ difficulty, choiceOnly: true, count: 30, exclude, english: this.ctx.english });
    const q = cands.find((c) => (c.options?.length ?? 0) >= 4) ?? cands[0];
    this.used.add(q.id);
    this.ctx.used?.add(q.id);
    return q;
  }

  private nextQuestion() {
    this.q = this.pick();
    this.removed = [];
    this.audience = null;
    this.phase = 'ask';
    this.startedAt = Date.now();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.phase === 'ask') {
        this.finish('timeout');
        this.ctx.notify();
      }
    }, QUESTION_MS);
  }

  /** 保底奖金：已经答对的最高保底关 */
  private guaranteed() {
    const passed = SAFE_LEVELS.filter((l) => l < this.level);
    return passed.length ? LADDER[passed[passed.length - 1]] : 0;
  }

  private current() {
    return this.level === 0 ? 0 : LADDER[this.level - 1];
  }

  private finish(reason: 'quit' | 'timeout' | 'wrong' | 'win', picked: number | null = null) {
    if (this.timer) clearTimeout(this.timer);
    const won = reason === 'wrong' ? this.guaranteed() : reason === 'win' ? LADDER[14] : this.current();
    this.money[this.who] = won;
    this.last = { correct: reason === 'win', picked, answer: this.q.answer as number, explain: '', won, ended: true, reason };
    this.phase = 'result';
    this.timer = setTimeout(() => this.advanceContestant(), RESULT_MS);
  }

  private advanceContestant() {
    this.contestant++;
    if (this.contestant >= this.order.length) {
      this.phase = 'over';
      this.timer = null;
    } else {
      this.level = 0;
      this.last = null;
      this.nextQuestion();
    }
    this.ctx.notify();
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    if (this.phase !== 'ask') return { ok: false, error: '现在不能操作' };
    if (pid !== this.who) return { ok: false, error: '现在是别人在答题，你来当观众吧' };
    switch (a?.type) {
      case 'answer': {
        const n = (this.q.options ?? []).length;
        if (!Number.isInteger(a.choice) || a.choice < 0 || a.choice >= n) return { ok: false, error: '选项无效' };
        if (this.removed.includes(a.choice)) return { ok: false, error: '这个选项已经被去掉了' };
        if (a.choice !== this.q.answer) {
          this.finish('wrong', a.choice);
          return { ok: true };
        }
        this.level++;
        if (this.level >= LADDER.length) {
          this.finish('win', a.choice);
          return { ok: true };
        }
        // 答对：短暂显示结果，再进入下一题
        if (this.timer) clearTimeout(this.timer);
        this.last = { correct: true, picked: a.choice, answer: this.q.answer as number, explain: '', won: LADDER[this.level - 1], ended: false, reason: 'right' };
        this.phase = 'result';
        this.timer = setTimeout(() => {
          this.last = null;
          this.nextQuestion();
          this.ctx.notify();
        }, RESULT_MS);
        return { ok: true };
      }
      case 'quit':
        this.finish('quit');
        return { ok: true };
      case 'lifeline': {
        const l = this.life[pid];
        if (a.kind === 'fifty') {
          if (!l.fifty) return { ok: false, error: '50:50 已经用过了' };
          l.fifty = false;
          const wrong = (this.q.options ?? []).map((_, i) => i).filter((i) => i !== this.q.answer);
          this.removed = shuffle(wrong).slice(0, 2);
        } else if (a.kind === 'audience') {
          if (!l.audience) return { ok: false, error: '问观众已经用过了' };
          l.audience = false;
          this.audience = this.askAudience();
        } else if (a.kind === 'swap') {
          if (!l.swap) return { ok: false, error: '换题已经用过了' };
          l.swap = false;
          this.nextQuestion();
        } else return { ok: false, error: '没有这个求助' };
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知操作' };
    }
  }

  /** 观众投票：正确答案得票最多的概率随难度降低，但不保证；已去掉的选项得 0 */
  private askAudience(): number[] {
    const n = (this.q.options ?? []).length;
    const base = this.level < 5 ? 0.7 : this.level < 10 ? 0.55 : 0.4;
    const confident = Math.random() < base + 0.25;
    const weights = Array.from({ length: n }, (_, i) => (this.removed.includes(i) ? 0 : 5 + Math.random() * 25));
    weights[this.q.answer as number] = confident ? 45 + Math.random() * 35 : 10 + Math.random() * 20;
    const total = weights.reduce((s, w) => s + w, 0);
    const pct = weights.map((w) => Math.round((w / total) * 100));
    pct[pct.indexOf(Math.max(...pct))] += 100 - pct.reduce((s, v) => s + v, 0);
    return pct;
  }

  /** 参赛者长时间不动：按放弃结算 */
  onIdle() {
    if (this.phase === 'ask') this.finish('quit');
  }

  viewFor(pid: string, lang?: 'zh' | 'en') {
    const lq = localize(this.q, lang); // 英文玩家看到英文题干、选项和解释
    const base = { game: 'millionaire', phase: this.phase, ladder: LADDER, safe: SAFE_LEVELS, money: this.money, order: this.order, contestantIndex: this.contestant };
    if (this.phase === 'over') return { ...base, ranking: rankPoints(this.money, this.ids) };
    return {
      ...base,
      contestantId: this.who,
      level: this.level,
      category: bankName(this.q.bank),
      difficultyName: DIFFICULTY_NAMES[this.level < 5 ? 1 : this.level < 10 ? 2 : 3],
      question: lq.q,
      image: this.q.image ?? null,
      options: lq.options,
      removed: this.removed,
      audience: this.audience,
      lifelines: this.life[this.who],
      endsInMs: this.phase === 'ask' ? Math.max(0, this.startedAt + QUESTION_MS - Date.now()) : 0,
      guaranteed: this.guaranteed(),
      // 只有出结果之后才公布正确答案和解释
      result: this.phase === 'result' && this.last ? { ...this.last, explain: lq.explain } : null,
    };
  }

  isOver() {
    return this.phase === 'over';
  }

  scores(): Record<string, number> {
    return Object.fromEntries(rankPoints(this.money, this.ids).map((r) => [r.id, r.bonus]));
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }
}
