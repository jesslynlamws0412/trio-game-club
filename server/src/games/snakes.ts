import type { GameCtx, GameEngine, Result } from './types.js';
import { rankPoints } from './util.js';

/** 经典蛇梯棋的梯子和蛇：起点 → 终点 */
export const LADDERS: Record<number, number> = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };
export const SNAKES: Record<number, number> = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };

/**
 * 蛇梯棋：100 格，轮流掷骰前进。落在梯子底部就爬上去，落在蛇头就滑下来。
 * 必须刚好走到 100 才算赢，超过的点数这一步不走。掷到 6 可以再掷一次（连续三个 6 作废）。
 * 先到 100 的人获胜（+3），其余玩家按所在格数排名。
 */
export class SnakesGame implements GameEngine {
  private ids: string[];
  private pos: Record<string, number> = {};
  private turn: number;
  private lastRoll: { by: string; value: number } | null = null;
  private sixes = 0;
  private log: string[] = [];
  private rolls = 0;
  private winner: string | null = null;
  private nameOf: Record<string, string> = {};

  constructor(ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    for (const p of ctx.players) {
      this.pos[p.id] = 0;
      this.nameOf[p.id] = p.nickname;
    }
    this.turn = ctx.rotation % this.ids.length;
  }

  private get current() {
    return this.ids[this.turn];
  }

  private say(s: string) {
    this.log.push(s);
    if (this.log.length > 8) this.log.shift();
  }

  private nextTurn() {
    this.sixes = 0;
    this.turn = (this.turn + 1) % this.ids.length;
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    if (a?.type !== 'roll') return { ok: false, error: '未知操作' };
    if (this.winner) return { ok: false, error: '游戏已经结束' };
    if (pid !== this.current) return { ok: false, error: '还没轮到你' };
    this.roll(pid);
    return { ok: true };
  }

  private roll(pid: string) {
    const value = 1 + Math.floor(Math.random() * 6);
    this.rolls++;
    this.lastRoll = { by: pid, value };
    const name = this.nameOf[pid];
    if (value === 6) this.sixes++;
    if (this.sixes >= 3) {
      this.say(`${name} 连续掷出三个 6，这一轮作废。`);
      this.nextTurn();
      return;
    }
    let to = this.pos[pid] + value;
    if (to > 100) {
      this.say(`${name} 掷出 ${value}，超过 100，原地不动。`);
    } else {
      let msg = `${name} 掷出 ${value}，前进到 ${to}`;
      if (LADDERS[to]) {
        msg += `，爬梯子上到 ${LADDERS[to]}！`;
        to = LADDERS[to];
      } else if (SNAKES[to]) {
        msg += `，被蛇咬了，滑到 ${SNAKES[to]}……`;
        to = SNAKES[to];
      }
      this.pos[pid] = to;
      this.say(msg);
      if (to === 100) {
        this.winner = pid;
        this.say(`🏆 ${name} 到达终点！`);
        return;
      }
    }
    if (value !== 6) this.nextTurn();
    else this.say(`${name} 掷到 6，再掷一次。`);
  }

  /** 轮到的玩家长时间不动：替他掷骰子 */
  onIdle() {
    if (!this.winner) this.roll(this.current);
  }

  viewFor(_pid: string) {
    return {
      game: 'snakes',
      positions: this.pos,
      turnId: this.winner ? null : this.current,
      lastRoll: this.lastRoll,
      rolls: this.rolls,
      log: this.log,
      winnerId: this.winner,
      ladders: LADDERS,
      snakes: SNAKES,
    };
  }

  isOver() {
    return this.winner !== null;
  }

  scores(): Record<string, number> {
    const points = Object.fromEntries(this.ids.map((id) => [id, id === this.winner ? 1000 : this.pos[id]]));
    return Object.fromEntries(rankPoints(points, this.ids).map((r) => [r.id, r.bonus]));
  }

  dispose() {}
}
