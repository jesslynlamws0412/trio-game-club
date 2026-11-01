import type { GameCtx, GameEngine, Result } from './types.js';
import { rankPoints } from './util.js';

const TRACK = 52; // 公共跑道格数
const FINISH = 56; // 相对步数：0~50 在公共跑道上，51~55 是自己的终点通道，56 = 到达终点
const GOAL = 2; // 先有 2 架飞机到达终点的人获胜（缩短一局的时间）
const TOKENS = 4;
const SAFE = new Set([0, 13, 26, 39, 8, 21, 34, 47]); // 各色起飞点和星形安全格：停在上面不会被击落
const COLORS = ['红', '黄', '蓝', '绿'];

type Phase = 'roll' | 'move' | 'over';

/**
 * 飞行棋（简化版）：2~4 人，每人 4 架飞机。
 * 掷到 6 才能起飞；掷到 6 可以再掷一次（连续三个 6 作废）。飞机沿 52 格公共跑道绕一圈，
 * 再进入自己的终点通道，必须刚好走到终点。落在对手飞机所在的格子（安全格除外）会把对手击落回机库。
 * 先让 2 架飞机到达终点的人获胜。
 */
export class LudoGame implements GameEngine {
  private ids: string[];
  private seatOf: Record<string, number> = {}; // 玩家 → 颜色座位（决定起点）
  private rel: Record<string, number[]> = {}; // 每架飞机：-1 机库，0..56 相对步数
  private nameOf: Record<string, string> = {};
  private turn: number;
  private phase: Phase = 'roll';
  private dice = 0;
  private sixes = 0;
  private log: string[] = [];
  private winner: string | null = null;

  constructor(ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    // 两人时坐在对面，三人时用前三个颜色
    const seats = this.ids.length === 2 ? [0, 2] : [0, 1, 2, 3];
    this.ids.forEach((id, i) => {
      this.seatOf[id] = seats[i];
      this.rel[id] = Array(TOKENS).fill(-1);
    });
    for (const p of ctx.players) this.nameOf[p.id] = p.nickname;
    this.turn = ctx.rotation % this.ids.length;
  }

  private get current() {
    return this.ids[this.turn];
  }
  private say(s: string) {
    this.log.push(s);
    if (this.log.length > 8) this.log.shift();
  }
  private global(id: string, r: number) {
    return (this.seatOf[id] * 13 + r) % TRACK;
  }
  private done(id: string) {
    return this.rel[id].filter((r) => r === FINISH).length;
  }

  /** 这个点数下，当前玩家能动哪几架飞机 */
  private legal(id: string, dice: number): number[] {
    const out: number[] = [];
    this.rel[id].forEach((r, i) => {
      if (r === -1) {
        if (dice === 6) out.push(i);
      } else if (r < FINISH && r + dice <= FINISH) out.push(i);
    });
    return out;
  }

  private endTurn(extra: boolean) {
    this.phase = 'roll';
    this.dice = extra ? this.dice : 0;
    if (!extra) {
      this.sixes = 0;
      this.turn = (this.turn + 1) % this.ids.length;
    }
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    if (this.phase === 'over') return { ok: false, error: '游戏已经结束' };
    if (pid !== this.current) return { ok: false, error: '还没轮到你' };
    if (a?.type === 'roll') {
      if (this.phase !== 'roll') return { ok: false, error: '请先选择要走的飞机' };
      this.rollDice(pid);
      return { ok: true };
    }
    if (a?.type === 'move') {
      if (this.phase !== 'move') return { ok: false, error: '现在不能走棋' };
      if (!Number.isInteger(a.token) || !this.legal(pid, this.dice).includes(a.token)) return { ok: false, error: '这架飞机现在不能走' };
      this.moveToken(pid, a.token);
      return { ok: true };
    }
    return { ok: false, error: '未知操作' };
  }

  private rollDice(pid: string) {
    this.dice = 1 + Math.floor(Math.random() * 6);
    const name = this.nameOf[pid];
    if (this.dice === 6) this.sixes++;
    if (this.sixes >= 3) {
      this.say(`${name} 连续掷出三个 6，这一轮作废。`);
      this.dice = 0;
      this.endTurn(false);
      return;
    }
    const moves = this.legal(pid, this.dice);
    if (moves.length === 0) {
      this.say(`${name} 掷出 ${this.dice}，没有能走的飞机。`);
      this.endTurn(false);
    } else if (moves.length === 1) {
      this.moveToken(pid, moves[0]); // 只有一种走法，直接走
    } else {
      this.phase = 'move';
    }
  }

  private moveToken(pid: string, i: number) {
    const name = this.nameOf[pid];
    const from = this.rel[pid][i];
    const to = from === -1 ? 0 : from + this.dice;
    this.rel[pid][i] = to;
    this.say(from === -1 ? `${name} 掷出 6，第 ${i + 1} 架飞机起飞！` : `${name} 的第 ${i + 1} 架飞机前进 ${this.dice} 步。`);
    // 击落：只在公共跑道（相对步数 0~50）上，且不是安全格
    if (to <= 50) {
      const g = this.global(pid, to);
      if (!SAFE.has(g)) {
        for (const other of this.ids) {
          if (other === pid) continue;
          this.rel[other].forEach((r, k) => {
            if (r >= 0 && r <= 50 && this.global(other, r) === g) {
              this.rel[other][k] = -1;
              this.say(`💥 ${name} 击落了 ${this.nameOf[other]} 的一架飞机！`);
            }
          });
        }
      }
    }
    if (to === FINISH) this.say(`🛬 ${name} 有一架飞机到达终点（${this.done(pid)}/${GOAL}）。`);
    if (this.done(pid) >= GOAL) {
      this.winner = pid;
      this.phase = 'over';
      this.say(`🏆 ${name} 获胜！`);
      return;
    }
    this.endTurn(this.dice === 6);
  }

  /** 轮到的玩家长时间不动：掷骰、选第一架能走的飞机 */
  onIdle() {
    if (this.phase === 'over') return;
    const id = this.current;
    if (this.phase === 'roll') this.rollDice(id);
    if (this.phase === 'move') this.moveToken(id, this.legal(id, this.dice)[0]);
  }

  private progress(id: string) {
    return this.rel[id].reduce((s, r) => s + Math.max(0, r + 1), 0);
  }

  viewFor(_pid: string) {
    const cur = this.phase === 'over' ? null : this.current;
    return {
      game: 'ludo',
      phase: this.phase,
      turnId: cur,
      dice: this.dice,
      legal: cur && this.phase === 'move' ? this.legal(cur, this.dice) : [],
      tokens: this.rel,
      seats: this.seatOf,
      globals: Object.fromEntries(this.ids.map((id) => [id, this.rel[id].map((r) => (r >= 0 && r <= 50 ? this.global(id, r) : null))])),
      done: Object.fromEntries(this.ids.map((id) => [id, this.done(id)])),
      goal: GOAL,
      colors: COLORS,
      safe: [...SAFE],
      log: this.log,
      winnerId: this.winner,
    };
  }

  isOver() {
    return this.phase === 'over';
  }

  scores(): Record<string, number> {
    const points = Object.fromEntries(this.ids.map((id) => [id, id === this.winner ? 100000 : this.done(id) * 1000 + this.progress(id)]));
    return Object.fromEntries(rankPoints(points, this.ids).map((r) => [r.id, r.bonus]));
  }

  dispose() {}
}
