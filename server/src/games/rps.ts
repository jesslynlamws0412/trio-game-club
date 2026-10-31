import type { GameCtx, GameEngine, Result } from './types.js';
import { rankPoints } from './util.js';

const ROUNDS = 7;
const PICK_MS = 15_000;
const REVEAL_MS = Number(process.env.RPS_REVEAL_MS ?? 3000);
const CPU = 'cpu';
type Move = 'rock' | 'paper' | 'scissors';
const MOVES: Move[] = ['rock', 'paper', 'scissors'];
const BEATS: Record<Move, Move> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
type Phase = 'pick' | 'reveal' | 'over';

/**
 * 剪刀石头布：共 7 轮，所有人同时秘密出拳。每赢一位对手 +1 分。
 * 单人模式的对手是电脑（每轮随机出拳，服务器在揭晓时才决定，不会偷看你的选择）。
 */
export class RpsGame implements GameEngine {
  private ids: string[];
  private all: string[]; // 含电脑
  private round = 0;
  private phase: Phase = 'pick';
  private picks = new Map<string, Move>();
  private points: Record<string, number> = {};
  private gains: Record<string, number> = {};
  private startedAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    this.all = this.ids.length === 1 ? [...this.ids, CPU] : [...this.ids];
    for (const id of this.all) this.points[id] = 0;
    this.startRound();
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
    if (this.all.includes(CPU)) this.picks.set(CPU, MOVES[Math.floor(Math.random() * 3)]);
    this.phase = 'reveal';
    this.gains = {};
    for (const id of this.all) {
      const mine = this.picks.get(id);
      let g = 0;
      if (mine) for (const other of this.all) if (other !== id && this.picks.get(other) === BEATS[mine]) g++;
      this.gains[id] = g;
      this.points[id] += g;
    }
    this.timer = setTimeout(() => {
      this.round++;
      if (this.round >= ROUNDS) {
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
    if (this.phase !== 'pick') return { ok: false, error: '现在不能出拳' };
    if (a.round !== this.round) return { ok: false, error: '回合已经切换' };
    if (!MOVES.includes(a.move)) return { ok: false, error: '出拳无效' };
    if (this.picks.has(pid)) return { ok: false, error: '这一轮你已经出过了' };
    this.picks.set(pid, a.move);
    if (this.ids.every((id) => this.picks.has(id))) this.reveal();
    return { ok: true };
  }

  viewFor(pid: string) {
    const base = { game: 'rps', phase: this.phase, total: ROUNDS, points: this.points, cpu: this.all.includes(CPU) };
    if (this.phase === 'over') {
      return { ...base, ranking: rankPoints(this.points, this.all) };
    }
    const view: any = {
      ...base,
      round: this.round,
      players: this.all,
      answered: this.ids.filter((id) => this.picks.has(id)),
      myMove: this.picks.get(pid) ?? null,
      endsInMs: this.phase === 'pick' ? Math.max(0, this.startedAt + PICK_MS - Date.now()) : 0,
    };
    if (this.phase === 'reveal') {
      view.moves = Object.fromEntries(this.all.map((id) => [id, this.picks.get(id) ?? null]));
      view.gains = this.gains;
    }
    return view;
  }

  isOver() {
    return this.phase === 'over';
  }

  rawScores(): Record<string, number> {
    return Object.fromEntries(this.ids.map((id) => [id, this.points[id]]));
  }

  scores(): Record<string, number> {
    if (this.all.includes(CPU)) {
      // 单人：赢电脑 +3，平局 +1，输 0
      const me = this.ids[0];
      return { [me]: this.points[me] > this.points[CPU] ? 3 : this.points[me] === this.points[CPU] ? 1 : 0 };
    }
    return Object.fromEntries(rankPoints(this.points, this.ids).map((r) => [r.id, r.bonus]));
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }
}
