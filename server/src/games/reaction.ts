import type { GameCtx, GameEngine, Result } from './types.js';
import { rankPoints } from './util.js';

const ROUNDS = 5;
const GO_TIMEOUT_MS = 3000;
const REVEAL_MS = Number(process.env.REACTION_REVEAL_MS ?? 3500);
type Phase = 'wait' | 'go' | 'reveal' | 'over';

/**
 * 反应速度挑战：共 5 轮。屏幕先显示“等待”，随机 1.5~4 秒后变成“点！”，越快点击越好。
 * 反应时间由服务器计时（从发出“点！”到收到你的点击，包含网络延迟，对所有人一样适用）。
 * 抢跑（“点！”出现前点击）本轮取消成绩并扣 1 分。多人：本轮第 1 / 2 / 3 快的人得 3 / 2 / 1 分。
 * 单人：不到 300 毫秒 3 分，不到 500 毫秒 2 分，其余 1 分。
 */
export class ReactionGame implements GameEngine {
  private ids: string[];
  private round = 0;
  private phase: Phase = 'wait';
  private goAt = 0;
  private times = new Map<string, number>(); // 本轮有效成绩（毫秒）
  private falseStart = new Set<string>();
  private points: Record<string, number> = {};
  private best: Record<string, number | null> = {};
  private roundGains: Record<string, number> = {};
  private timer: NodeJS.Timeout | null = null;

  constructor(private ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    for (const id of this.ids) {
      this.points[id] = 0;
      this.best[id] = null;
    }
    this.startRound();
  }

  private startRound() {
    this.phase = 'wait';
    this.times.clear();
    this.falseStart.clear();
    this.roundGains = {};
    const delay = process.env.REACTION_DELAY_MS ? Number(process.env.REACTION_DELAY_MS) : 1500 + Math.random() * 2500;
    this.timer = setTimeout(() => {
      this.phase = 'go';
      this.goAt = Date.now();
      this.timer = setTimeout(() => {
        this.finishRound();
        this.ctx.notify();
      }, GO_TIMEOUT_MS);
      this.ctx.notify();
    }, delay);
  }

  private finishRound() {
    if (this.timer) clearTimeout(this.timer);
    this.phase = 'reveal';
    const ranked = [...this.times.entries()].sort((a, b) => a[1] - b[1]);
    ranked.forEach(([id, ms], i) => {
      const gain = this.ids.length === 1 ? (ms < 300 ? 3 : ms < 500 ? 2 : 1) : [3, 2, 1][i] ?? 1;
      this.roundGains[id] = gain;
      this.points[id] += gain;
      if (this.best[id] === null || ms < this.best[id]!) this.best[id] = ms;
    });
    for (const id of this.falseStart) {
      this.roundGains[id] = -1;
      this.points[id] -= 1;
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
    if (a?.type !== 'tap') return { ok: false, error: '未知操作' };
    if (this.times.has(pid) || this.falseStart.has(pid)) return { ok: false, error: '这一轮你已经点过了' };
    if (this.phase === 'wait') {
      this.falseStart.add(pid);
    } else if (this.phase === 'go') {
      this.times.set(pid, Date.now() - this.goAt);
    } else {
      return { ok: false, error: '现在不能点击' };
    }
    if (this.times.size + this.falseStart.size === this.ids.length) this.finishRound();
    return { ok: true };
  }

  viewFor(pid: string) {
    const base = { game: 'reaction', phase: this.phase, total: ROUNDS, points: this.points, best: this.best };
    if (this.phase === 'over') return { ...base, ranking: rankPoints(this.points, this.ids) };
    const view: any = {
      ...base,
      round: this.round,
      tapped: this.times.has(pid) || this.falseStart.has(pid),
      falseStart: this.falseStart.has(pid),
    };
    if (this.phase === 'reveal') {
      view.times = Object.fromEntries(this.ids.map((id) => [id, this.times.get(id) ?? null]));
      view.falseStarts = [...this.falseStart];
      view.gains = this.roundGains;
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
