import type { GameCtx, GameEngine, Result } from './types.js';
import { rankPoints, shuffle } from './util.js';
import { DARES, TRUTHS } from '../data/partyBank.js';

type Phase = 'choose' | 'judge' | 'over';
const REWARD = 2;

/**
 * 真心话大冒险：每人轮流 2 次（最多 12 回合）。轮到的人选“真心话”或“大冒险”，服务器抽题；
 * 完成后由其他玩家投票是否完成（赞成票多于反对票才算完成；平票不算），完成 +2 分。
 * 可以选择“跳过”，不得分也不扣分。
 */
export class TruthGame implements GameEngine {
  private ids: string[];
  private order: string[];
  private truths: string[];
  private dares: string[];
  private turn = 0;
  private phase: Phase = 'choose';
  private kind: 'truth' | 'dare' | null = null;
  private prompt: string | null = null;
  private votes = new Map<string, boolean>();
  private points: Record<string, number> = {};
  private history: { turn: number; playerId: string; kind: 'truth' | 'dare' | 'skip'; prompt: string | null; done: boolean | null }[] = [];

  constructor(ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    const k = ctx.rotation % this.ids.length;
    this.order = [...this.ids.slice(k), ...this.ids.slice(0, k)];
    this.truths = shuffle(TRUTHS);
    this.dares = shuffle(DARES);
    for (const id of this.ids) this.points[id] = 0;
  }

  private get total() {
    return Math.min(12, this.ids.length * 2);
  }
  private get current() {
    return this.order[this.turn % this.order.length];
  }

  private next() {
    this.turn++;
    this.kind = null;
    this.prompt = null;
    this.votes.clear();
    this.phase = this.turn >= this.total ? 'over' : 'choose';
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    switch (a?.type) {
      case 'choose': {
        if (this.phase !== 'choose') return { ok: false, error: '现在不能选择' };
        if (pid !== this.current) return { ok: false, error: '还没轮到你' };
        if (a.kind === 'skip') {
          this.history.push({ turn: this.turn, playerId: pid, kind: 'skip', prompt: null, done: null });
          this.next();
          return { ok: true };
        }
        if (a.kind !== 'truth' && a.kind !== 'dare') return { ok: false, error: '请选择真心话或大冒险' };
        this.kind = a.kind;
        this.prompt = (a.kind === 'truth' ? this.truths : this.dares).pop() ?? '（题库用完了，随便说一件有趣的事吧）';
        this.phase = 'judge';
        return { ok: true };
      }
      case 'judge': {
        if (this.phase !== 'judge') return { ok: false, error: '现在不能投票' };
        if (pid === this.current) return { ok: false, error: '不能给自己投票' };
        if (this.votes.has(pid)) return { ok: false, error: '你已经投过票了' };
        if (typeof a.done !== 'boolean') return { ok: false, error: '投票无效' };
        this.votes.set(pid, a.done);
        if (this.votes.size === this.ids.length - 1) {
          const yes = [...this.votes.values()].filter(Boolean).length;
          const done = yes > this.votes.size - yes;
          if (done) this.points[this.current] += REWARD;
          this.history.push({ turn: this.turn, playerId: this.current, kind: this.kind!, prompt: this.prompt, done });
          this.next();
        }
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知操作' };
    }
  }

  viewFor(pid: string) {
    const over = this.phase === 'over';
    return {
      game: 'truth',
      phase: this.phase,
      turn: Math.min(this.turn, this.total - 1),
      total: this.total,
      playerId: over ? null : this.current,
      kind: this.kind,
      prompt: this.prompt,
      voted: [...this.votes.keys()],
      myVote: this.votes.get(pid) ?? null,
      points: this.points,
      history: this.history.slice(-6),
      reward: REWARD,
      ranking: over ? rankPoints(this.points, this.ids) : null,
    };
  }

  isOver() {
    return this.phase === 'over';
  }

  scores(): Record<string, number> {
    return Object.fromEntries(rankPoints(this.points, this.ids).map((r) => [r.id, r.bonus]));
  }

  dispose() {}
}
