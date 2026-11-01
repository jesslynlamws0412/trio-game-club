import type { GameCtx, GameEngine, Result } from './types.js';
import { rankPoints } from './util.js';
import { Meter } from './meter.js';

const REVEAL_MS = Number(process.env.BASKET_REVEAL_MS ?? 1800);
const SHOT_MS = Number(process.env.BASKET_SHOT_MS ?? 15_000);
type Phase = 'aim' | 'result' | 'over';

/** 10 次投篮：近距离 3 次（2 分）、中距离 4 次（2 分）、三分线 3 次（3 分）。越远绿色区域越窄、指针越快。 */
const SHOTS = [
  { name: '近距离', pts: 2, w: 0.2, period: 1600 },
  { name: '近距离', pts: 2, w: 0.2, period: 1600 },
  { name: '近距离', pts: 2, w: 0.2, period: 1600 },
  { name: '中距离', pts: 2, w: 0.14, period: 1400 },
  { name: '中距离', pts: 2, w: 0.14, period: 1400 },
  { name: '中距离', pts: 2, w: 0.14, period: 1400 },
  { name: '中距离', pts: 2, w: 0.14, period: 1400 },
  { name: '三分线', pts: 3, w: 0.1, period: 1200 },
  { name: '三分线', pts: 3, w: 0.1, period: 1200 },
  { name: '三分线', pts: 3, w: 0.1, period: 1200 },
];

/**
 * 投篮机：每人 10 次投篮，轮流投。指针来回摆动，在指针经过中间的绿色区域时点“投篮”。
 * 进球得分（近 / 中距离 2 分，三分线 3 分）；落在绿色区域正中（区域的 40%）算“空心球”，再加 1 分。
 * 指针位置由服务器按时间计算，不能作弊；每次投篮限时 15 秒，超时算没投进。
 */
export class BasketballGame implements GameEngine {
  private ids: string[];
  private nameOf: Record<string, string> = {};
  private round = 0;
  private turn = 0;
  private phase: Phase = 'aim';
  private meter = new Meter(1600);
  private points: Record<string, number> = {};
  private made: Record<string, number> = {};
  private last: { by: string; made: boolean; swish: boolean; pos: number; gain: number } | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    for (const p of ctx.players) {
      this.nameOf[p.id] = p.nickname;
      this.points[p.id] = 0;
      this.made[p.id] = 0;
    }
    this.turn = ctx.rotation % this.ids.length;
    this.startShot();
  }

  private get shot() {
    return SHOTS[this.round];
  }
  private get current() {
    return this.ids[this.turn];
  }

  private startShot() {
    this.phase = 'aim';
    this.meter.arm(this.shot.period);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.phase === 'aim') {
        this.resolve(this.current, null);
        this.ctx.notify();
      }
    }, SHOT_MS);
  }

  private resolve(pid: string, pos: number | null) {
    if (this.timer) clearTimeout(this.timer);
    const err = pos === null ? 1 : Math.abs(pos - 0.5);
    const made = err <= this.shot.w;
    const swish = made && err <= this.shot.w * 0.4;
    const gain = made ? this.shot.pts + (swish ? 1 : 0) : 0;
    this.points[pid] += gain;
    if (made) this.made[pid]++;
    this.last = { by: pid, made, swish, pos: pos ?? -1, gain };
    this.phase = 'result';
    this.timer = setTimeout(() => this.next(), REVEAL_MS);
  }

  private next() {
    this.turn++;
    if (this.turn >= this.ids.length) {
      this.turn = 0;
      this.round++;
    }
    if (this.round >= SHOTS.length) {
      this.phase = 'over';
      this.timer = null;
    } else this.startShot();
    this.ctx.notify();
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    if (a?.type !== 'shoot') return { ok: false, error: '未知操作' };
    if (this.phase !== 'aim') return { ok: false, error: '现在不能投篮' };
    if (pid !== this.current) return { ok: false, error: '还没轮到你' };
    this.resolve(pid, this.meter.pos());
    return { ok: true };
  }

  viewFor(_pid: string) {
    const base = { game: 'basketball', phase: this.phase, points: this.points, made: this.made, total: SHOTS.length };
    if (this.phase === 'over') return { ...base, ranking: rankPoints(this.points, this.ids) };
    return {
      ...base,
      round: this.round,
      shot: this.shot,
      turnId: this.current,
      meter: this.phase === 'aim' ? this.meter.view() : null,
      last: this.phase === 'result' ? this.last : null,
    };
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
