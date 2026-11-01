import type { GameCtx, GameEngine, Result } from './types.js';

type Kind = 'tictactoe' | 'gomoku';
const CPU = 'cpu';
const CFG: Record<Kind, { size: number; win: number; marks: [string, string] }> = {
  tictactoe: { size: 3, win: 3, marks: ['X', 'O'] },
  gomoku: { size: 15, win: 5, marks: ['黑', '白'] },
};
const DIRS: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]];

/**
 * 井字棋（3×3 连成三个）和五子棋（15×15 连成五个）：两个座位轮流落子，先连成线的人获胜。
 * 一个人玩时对手是电脑（服务器上的简单规则 AI，不会作弊，也不会偷看）。
 * 先手每局轮换。获胜 +3，平局各 +1，输 0。
 */
export class BoardGame implements GameEngine {
  private seats: [string, string];
  private cfg;
  private cells: number[]; // -1 空；0 / 1 = 座位号
  private turn: 0 | 1;
  private winner: number | null = null;
  private line: number[] | null = null;
  private draw = false;
  private last: [number, number] | null = null;

  constructor(ctx: GameCtx, private kind: Kind) {
    const ids = ctx.players.map((p) => p.id);
    const k = ctx.rotation % 2;
    const pair: [string, string] = ids.length === 1 ? [ids[0], CPU] : [ids[0], ids[1]];
    this.seats = k === 0 ? pair : [pair[1], pair[0]];
    this.cfg = CFG[kind];
    this.cells = Array(this.cfg.size * this.cfg.size).fill(-1);
    this.turn = 0;
    this.maybeCpu();
  }

  private get over() {
    return this.winner !== null || this.draw;
  }

  private at(x: number, y: number) {
    const n = this.cfg.size;
    return x < 0 || y < 0 || x >= n || y >= n ? -2 : this.cells[y * n + x];
  }

  private place(x: number, y: number, seat: 0 | 1) {
    const n = this.cfg.size;
    this.cells[y * n + x] = seat;
    this.last = [x, y];
    // 以落子点为中心，四个方向数连子
    for (const [dx, dy] of DIRS) {
      const line = [y * n + x];
      for (const s of [1, -1]) {
        for (let k = 1; this.at(x + dx * s * k, y + dy * s * k) === seat; k++) line.push((y + dy * s * k) * n + x + dx * s * k);
      }
      if (line.length >= this.cfg.win) {
        this.winner = seat;
        this.line = line;
        return;
      }
    }
    if (this.cells.every((c) => c !== -1)) this.draw = true;
  }

  handleAction(pid: string, a: any): Result {
    if (!this.seats.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    if (a?.type !== 'place') return { ok: false, error: '未知操作' };
    if (this.over) return { ok: false, error: '这一局已经结束' };
    if (this.seats[this.turn] !== pid) return { ok: false, error: '还没轮到你' };
    const n = this.cfg.size;
    if (!Number.isInteger(a.x) || !Number.isInteger(a.y) || a.x < 0 || a.y < 0 || a.x >= n || a.y >= n) {
      return { ok: false, error: '位置无效' };
    }
    if (this.at(a.x, a.y) !== -1) return { ok: false, error: '这个位置已经有棋子了' };
    this.place(a.x, a.y, this.turn);
    if (!this.over) {
      this.turn = this.turn === 0 ? 1 : 0;
      this.maybeCpu();
    }
    return { ok: true };
  }

  /** 轮到电脑就立刻落子 */
  private maybeCpu() {
    if (this.over || this.seats[this.turn] !== CPU) return;
    const [x, y] = this.choose(this.turn);
    this.place(x, y, this.turn);
    if (!this.over) this.turn = this.turn === 0 ? 1 : 0;
  }

  /** 玩家长时间不动：替他下一步（和电脑用同样的规则） */
  onIdle() {
    if (this.over) return;
    const [x, y] = this.choose(this.turn);
    this.place(x, y, this.turn);
    if (!this.over) {
      this.turn = this.turn === 0 ? 1 : 0;
      this.maybeCpu();
    }
  }

  // ───── 简单 AI ─────
  private empties() {
    const n = this.cfg.size;
    const out: [number, number][] = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (this.cells[y * n + x] === -1) out.push([x, y]);
    return out;
  }

  private wouldWin(x: number, y: number, seat: number) {
    for (const [dx, dy] of DIRS) {
      let len = 1;
      for (const s of [1, -1]) for (let k = 1; this.at(x + dx * s * k, y + dy * s * k) === seat; k++) len++;
      if (len >= this.cfg.win) return true;
    }
    return false;
  }

  private choose(seat: 0 | 1): [number, number] {
    const empties = this.empties();
    const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
    const mine = empties.find(([x, y]) => this.wouldWin(x, y, seat));
    if (mine) return mine;
    const opp = empties.find(([x, y]) => this.wouldWin(x, y, seat === 0 ? 1 : 0));
    if (opp) return opp;
    const n = this.cfg.size;
    if (this.kind === 'tictactoe') {
      if (Math.random() < 0.15) return pick(empties); // 偶尔失误，让电脑可以被打败
      const center = empties.find(([x, y]) => x === 1 && y === 1);
      if (center) return center;
      const corners = empties.filter(([x, y]) => x !== 1 && y !== 1);
      return corners.length ? pick(corners) : pick(empties);
    }
    // 五子棋：只考虑已有棋子附近 2 格内的空位，按攻防形状打分
    if (empties.length === n * n) return [Math.floor(n / 2), Math.floor(n / 2)];
    const near = empties.filter(([x, y]) => {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (this.at(x + dx, y + dy) >= 0) return true;
      return false;
    });
    const pool = near.length ? near : empties;
    let best = -1;
    let bestCells: [number, number][] = [];
    for (const [x, y] of pool) {
      const s = this.shape(x, y, seat) * 1.1 + this.shape(x, y, seat === 0 ? 1 : 0);
      if (s > best) {
        best = s;
        bestCells = [[x, y]];
      } else if (s === best) bestCells.push([x, y]);
    }
    return pick(bestCells);
  }

  /** 在 (x,y) 落下 seat 的子，四个方向的连子形状得分 */
  private shape(x: number, y: number, seat: number) {
    let total = 0;
    for (const [dx, dy] of DIRS) {
      let len = 1;
      let open = 0;
      for (const s of [1, -1]) {
        let k = 1;
        while (this.at(x + dx * s * k, y + dy * s * k) === seat) {
          len++;
          k++;
        }
        if (this.at(x + dx * s * k, y + dy * s * k) === -1) open++;
      }
      if (len >= 5) total += 100000;
      else if (len === 4) total += open === 2 ? 10000 : open === 1 ? 1000 : 0;
      else if (len === 3) total += open === 2 ? 1000 : open === 1 ? 100 : 0;
      else if (len === 2) total += open === 2 ? 100 : open === 1 ? 10 : 0;
      else total += open;
    }
    return total;
  }

  viewFor(_pid: string) {
    return {
      game: this.kind,
      size: this.cfg.size,
      cells: this.cells,
      seats: this.seats,
      marks: this.cfg.marks,
      turnId: this.over ? null : this.seats[this.turn],
      last: this.last,
      winnerId: this.winner === null ? null : this.seats[this.winner],
      line: this.line,
      draw: this.draw,
      over: this.over,
      cpu: this.seats.includes(CPU),
    };
  }

  isOver() {
    return this.over;
  }

  scores(): Record<string, number> {
    const s: Record<string, number> = {};
    for (const id of this.seats) if (id !== CPU) s[id] = this.draw ? 1 : this.winner !== null && this.seats[this.winner] === id ? 3 : 0;
    return s;
  }

  dispose() {}
}
