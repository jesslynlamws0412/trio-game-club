import type { GameCtx, GameEngine, Result } from './types.js';
import { rankPoints } from './util.js';
import { Meter } from './meter.js';

const REVEAL_MS = Number(process.env.BOWL_REVEAL_MS ?? 1800);
const THROW_MS = Number(process.env.BOWL_THROW_MS ?? 15_000);
type Phase = 'aim' | 'result' | 'over';

/** 标准保龄球计分：返回每一格的累计得分（还算不出来的是 null）和总分 */
export function scoreFrames(rolls: number[]): { frames: (number | null)[]; total: number } {
  const frames: (number | null)[] = [];
  let i = 0;
  let sum = 0;
  for (let f = 0; f < 10; f++) {
    if (rolls[i] === undefined) {
      frames.push(null);
      continue;
    }
    if (rolls[i] === 10) {
      // 全中：10 + 后两球
      if (rolls[i + 1] === undefined || rolls[i + 2] === undefined) {
        frames.push(null);
        i += 1;
        continue;
      }
      sum += 10 + rolls[i + 1] + rolls[i + 2];
      frames.push(sum);
      i += 1;
    } else if (rolls[i + 1] !== undefined && rolls[i] + rolls[i + 1] === 10) {
      // 补中：10 + 后一球
      if (rolls[i + 2] === undefined) {
        frames.push(null);
        i += 2;
        continue;
      }
      sum += 10 + rolls[i + 2];
      frames.push(sum);
      i += 2;
    } else if (rolls[i + 1] !== undefined) {
      sum += rolls[i] + rolls[i + 1];
      frames.push(sum);
      i += 2;
    } else {
      frames.push(null);
    }
  }
  const known = frames.filter((x): x is number => x !== null);
  return { frames, total: known.length ? known[known.length - 1] : 0 };
}

interface PlayerState {
  rolls: number[];
  frame: number; // 0..9，10 = 打完
  throwNo: number; // 这一格的第几球（从 0 开始）
  standing: boolean[]; // 10 个球瓶是否还立着
}

/**
 * 保龄球：每人 10 格，每格最多两球（第 10 格最多三球）。每次投球要点一次“投球”：
 * 指针（力度条）越接近正中间，击倒的球瓶越多。标准计分：全中（Strike）加后两球，补中（Spare）加后一球。
 * 指针位置由服务器按时间计算，不能作弊；每球限时 15 秒，超时随便扔一球。每个人打完一格后换下一位。
 */
export class BowlingGame implements GameEngine {
  private ids: string[];
  private nameOf: Record<string, string> = {};
  private st: Record<string, PlayerState> = {};
  private turn: number;
  private phase: Phase = 'aim';
  private meter = new Meter(1300);
  private last: { by: string; knocked: number; strike: boolean; spare: boolean; gutter: boolean } | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    for (const p of ctx.players) {
      this.nameOf[p.id] = p.nickname;
      this.st[p.id] = { rolls: [], frame: 0, throwNo: 0, standing: Array(10).fill(true) };
    }
    this.turn = ctx.rotation % this.ids.length;
    this.startThrow();
  }

  private get current() {
    return this.ids[this.turn];
  }

  private startThrow() {
    this.phase = 'aim';
    this.meter.arm();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.phase === 'aim') {
        this.doThrow(this.current, null);
        this.ctx.notify();
      }
    }, THROW_MS);
  }

  private doThrow(pid: string, pos: number | null) {
    if (this.timer) clearTimeout(this.timer);
    const s = this.st[pid];
    const err = pos === null ? 0.5 : Math.abs(pos - 0.5);
    const F = Math.max(0, 1 - err * 3);
    const p = Math.min(0.99, F * 0.95 + 0.04);
    const standingIdx = s.standing.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    const before = standingIdx.length;
    let knocked = 0;
    for (const i of standingIdx) {
      if (Math.random() < p) {
        s.standing[i] = false;
        knocked++;
      }
    }
    s.rolls.push(knocked);
    const remaining = before - knocked;
    const strike = s.throwNo === 0 && knocked === 10 && before === 10;
    const spare = !strike && remaining === 0 && before > 0 && knocked > 0;
    this.last = { by: pid, knocked, strike, spare, gutter: knocked === 0 };

    // 这一格是否打完？
    let frameDone = false;
    if (s.frame < 9) {
      frameDone = strike || s.throwNo === 1;
      s.throwNo = frameDone ? 0 : 1;
    } else {
      // 第 10 格：全中或补中有奖励球；最多 3 球
      const r = s.rolls.slice(this.frameStart(s));
      if (r.length === 1) {
        s.throwNo = 1;
        if (r[0] === 10) s.standing = Array(10).fill(true);
      } else if (r.length === 2) {
        if (r[0] === 10 || r[0] + r[1] === 10 || (r[0] === 10 && r[1] === 10)) {
          s.throwNo = 2;
          if (s.standing.every((v) => !v)) s.standing = Array(10).fill(true);
        } else frameDone = true;
      } else frameDone = true;
    }
    this.phase = 'result';
    this.timer = setTimeout(() => {
      if (frameDone) {
        s.frame++;
        s.throwNo = 0;
        s.standing = Array(10).fill(true);
        this.turn = this.nextPlayer();
      }
      if (this.ids.every((id) => this.st[id].frame >= 10)) {
        this.phase = 'over';
        this.timer = null;
      } else this.startThrow();
      this.ctx.notify();
    }, REVEAL_MS);
  }

  /** 玩家 s 当前这一格第一球在 rolls 里的下标 */
  private frameStart(s: PlayerState): number {
    // 前 9 格每格 1~2 球；第 10 格从剩下的球开始
    let i = 0;
    for (let f = 0; f < 9; f++) i += s.rolls[i] === 10 ? 1 : 2;
    return i;
  }

  private nextPlayer(): number {
    for (let k = 1; k <= this.ids.length; k++) {
      const t = (this.turn + k) % this.ids.length;
      if (this.st[this.ids[t]].frame < 10) return t;
    }
    return this.turn;
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    if (a?.type !== 'throw') return { ok: false, error: '未知操作' };
    if (this.phase !== 'aim') return { ok: false, error: '现在不能投球' };
    if (pid !== this.current) return { ok: false, error: '还没轮到你' };
    this.doThrow(pid, this.meter.pos());
    return { ok: true };
  }

  private total(id: string) {
    return scoreFrames(this.st[id].rolls).total;
  }

  viewFor(_pid: string) {
    const cards = Object.fromEntries(this.ids.map((id) => [id, { rolls: this.st[id].rolls, ...scoreFrames(this.st[id].rolls), frame: this.st[id].frame }]));
    const base = { game: 'bowling', phase: this.phase, cards };
    if (this.phase === 'over') {
      const pts = Object.fromEntries(this.ids.map((id) => [id, this.total(id)]));
      return { ...base, ranking: rankPoints(pts, this.ids) };
    }
    const cur = this.st[this.current];
    return {
      ...base,
      turnId: this.current,
      frame: cur.frame,
      throwNo: cur.throwNo,
      standing: cur.standing,
      meter: this.phase === 'aim' ? this.meter.view() : null,
      last: this.phase === 'result' ? this.last : null,
    };
  }

  isOver() {
    return this.phase === 'over';
  }

  scores(): Record<string, number> {
    const pts = Object.fromEntries(this.ids.map((id) => [id, this.total(id)]));
    return Object.fromEntries(rankPoints(pts, this.ids).map((r) => [r.id, r.bonus]));
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }
}
