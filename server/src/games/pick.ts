import type { GameCtx, GameEngine, Result } from './types.js';
import { rankPoints, shuffle } from './util.js';
import { LIKELY_PROMPTS, TACIT_QUESTIONS } from '../data/pickBank.js';
import { TRUE_FALSE } from '../data/partyBank.js';

const ROUNDS = 8;
const PICK_MS = 25_000;
const REVEAL_MS = Number(process.env.PICK_REVEAL_MS ?? 4500);
type Kind = 'likely' | 'tacit' | 'truefalse';
type Phase = 'pick' | 'reveal' | 'over';

interface Item {
  q: string;
  /** 选项 id → 显示文字；谁最有可能的选项是玩家（按人数生成） */
  options: { id: string; label: string }[];
  /** 真假判断才有：正确选项和解释 */
  answer?: string;
  why?: string;
}

/**
 * 同时作答类游戏，两种玩法共用一套流程（每轮所有人秘密选择，全部选完或超时后揭晓）：
 * - likely 谁最有可能：每人投一位其他玩家；投中得票最多者（含并列）的人各得 1 分（站在多数派）。
 * - tacit 默契大考验：每人从选项里选一个；每有 1 位其他玩家和你选得一样，你得 1 分。
 * - truefalse 真假判断：10 条陈述，判断对错，答对得 1 分，揭晓时给出解释。
 */
export class PickGame implements GameEngine {
  private ids: string[];
  private items: Item[];
  private round = 0;
  private phase: Phase = 'pick';
  private picks = new Map<string, string>();
  private points: Record<string, number> = {};
  private gains: Record<string, number> = {};
  private tally: Record<string, number> = {};
  private startedAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private ctx: GameCtx, private kind: Kind) {
    this.ids = ctx.players.map((p) => p.id);
    for (const id of this.ids) this.points[id] = 0;
    if (kind === 'likely') {
      this.items = shuffle(LIKELY_PROMPTS)
        .slice(0, ROUNDS)
        .map((q) => ({ q, options: ctx.players.map((p) => ({ id: p.id, label: p.nickname })) }));
    } else if (kind === 'truefalse') {
      this.items = shuffle(TRUE_FALSE).slice(0, 10).map((x) => ({
        q: x.q,
        options: [{ id: '0', label: '对' }, { id: '1', label: '错' }],
        answer: x.a ? '0' : '1',
        why: x.why,
      }));
    } else {
      this.items = shuffle(TACIT_QUESTIONS)
        .slice(0, ROUNDS)
        .map((x) => ({ q: x.q, options: x.o.map((label, i) => ({ id: String(i), label })) }));
    }
    this.startRound();
  }

  private get item() {
    return this.items[this.round];
  }

  private startRound() {
    this.phase = 'pick';
    this.picks.clear();
    this.startedAt = Date.now();
    this.timer = setTimeout(() => {
      if (this.phase === 'pick') {
        this.reveal();
        this.ctx.notify();
      }
    }, PICK_MS);
  }

  private reveal() {
    if (this.timer) clearTimeout(this.timer);
    this.phase = 'reveal';
    this.tally = {};
    for (const choice of this.picks.values()) this.tally[choice] = (this.tally[choice] ?? 0) + 1;
    const top = Math.max(0, ...Object.values(this.tally));
    this.gains = {};
    for (const id of this.ids) {
      const mine = this.picks.get(id);
      let gain = 0;
      if (mine !== undefined) {
        if (this.kind === 'tacit') gain = this.tally[mine] - 1;
        else if (this.kind === 'truefalse') gain = mine === this.item.answer ? 1 : 0;
        else if (top > 0 && this.tally[mine] === top) gain = 1;
      }
      this.gains[id] = gain;
      this.points[id] += gain;
    }
    this.timer = setTimeout(() => {
      this.round++;
      if (this.round >= this.items.length) {
        this.phase = 'over';
        this.timer = null;
      } else {
        this.startRound();
      }
      this.ctx.notify();
    }, REVEAL_MS);
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    if (a?.type !== 'pick') return { ok: false, error: '未知操作' };
    if (this.phase !== 'pick') return { ok: false, error: '现在不能选择' };
    if (this.picks.has(pid)) return { ok: false, error: '这一轮你已经选过了' };
    if (a.round !== this.round) return { ok: false, error: '题目已经切换' };
    if (typeof a.option !== 'string' || !this.item.options.some((o) => o.id === a.option)) {
      return { ok: false, error: '选项无效' };
    }
    if (this.kind === 'likely' && a.option === pid) return { ok: false, error: '不能投给自己' };
    this.picks.set(pid, a.option);
    if (this.picks.size === this.ids.length) this.reveal();
    return { ok: true };
  }

  viewFor(pid: string) {
    const base = { game: this.kind, phase: this.phase, total: this.items.length, points: this.points };
    if (this.phase === 'over') return { ...base, ranking: rankPoints(this.points, this.ids) };
    const view: any = {
      ...base,
      round: this.round,
      question: this.item.q,
      options: this.item.options,
      answered: [...this.picks.keys()],
      myPick: this.picks.get(pid) ?? null,
      endsInMs: this.phase === 'pick' ? Math.max(0, this.startedAt + PICK_MS - Date.now()) : 0,
    };
    if (this.phase === 'reveal') {
      // 揭晓之后才发送每个人的选择
      view.picks = Object.fromEntries(this.ids.map((id) => [id, this.picks.get(id) ?? null]));
      view.tally = this.tally;
      view.gains = this.gains;
      if (this.kind === 'truefalse') {
        view.answer = this.item.answer;
        view.why = this.item.why;
      }
    }
    return view;
  }

  isOver() {
    return this.phase === 'over';
  }

  scores(): Record<string, number> {
    return Object.fromEntries(rankPoints(this.points, this.ids).map((r) => [r.id, r.bonus]));
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }
}
