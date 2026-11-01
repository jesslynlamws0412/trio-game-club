import type { GameCtx, GameEngine, Result } from './types.js';
import { shuffle } from './util.js';

const GUESSES_EACH = 8;

interface Guess {
  by: string;
  digits: string;
  a: number; // 数字对、位置也对
  b: number; // 数字对、位置不对
}

/**
 * 猜数字（1A2B）：服务器随机生成 4 个互不相同的数字（可以以 0 开头）。
 * 玩家轮流猜，所有猜测与提示公开。A = 数字和位置都对，B = 数字对但位置不对。
 * 最先猜中的人 +3；每人最多猜 8 次，全部用完仍无人猜中则平局，公布答案。
 */
export class NumberGame implements GameEngine {
  private ids: string[];
  private secret: string;
  private order: string[];
  private turn = 0;
  private guesses: Guess[] = [];
  private winner: string | null = null;
  private over = false;

  constructor(ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    this.secret = shuffle(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']).slice(0, 4).join('');
    const k = ctx.rotation % this.ids.length;
    this.order = [...this.ids.slice(k), ...this.ids.slice(0, k)];
  }

  private get current() {
    return this.order[this.turn % this.order.length];
  }

  private used(id: string) {
    return this.guesses.filter((g) => g.by === id).length;
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    if (a?.type !== 'guess') return { ok: false, error: '未知操作' };
    if (this.over) return { ok: false, error: '游戏已经结束' };
    if (pid !== this.current) return { ok: false, error: '还没轮到你' };
    const digits = a.digits;
    if (typeof digits !== 'string' || !/^\d{4}$/.test(digits)) return { ok: false, error: '请输入 4 位数字' };
    if (new Set(digits).size !== 4) return { ok: false, error: '4 个数字不能重复' };
    let A = 0;
    let B = 0;
    for (let i = 0; i < 4; i++) {
      if (digits[i] === this.secret[i]) A++;
      else if (this.secret.includes(digits[i])) B++;
    }
    this.guesses.push({ by: pid, digits, a: A, b: B });
    if (A === 4) {
      this.winner = pid;
      this.over = true;
      return { ok: true };
    }
    if (this.ids.every((id) => this.used(id) >= GUESSES_EACH)) {
      this.over = true;
      return { ok: true };
    }
    this.advanceTurn();
    return { ok: true };
  }

  private advanceTurn() {
    this.turn++; // 跳过已经用完次数的玩家
    for (let k = 0; k < this.order.length && this.used(this.current) >= GUESSES_EACH; k++) this.turn++;
  }

  /** 轮到的玩家长时间不动：记一次超时（占用一次猜测机会），换下一位 */
  onIdle() {
    if (this.over) return;
    this.guesses.push({ by: this.current, digits: '····', a: 0, b: 0 });
    if (this.ids.every((id) => this.used(id) >= GUESSES_EACH)) {
      this.over = true;
      return;
    }
    this.advanceTurn();
  }

  viewFor(pid: string) {
    return {
      game: 'number',
      turnId: this.over ? null : this.current,
      guesses: this.guesses,
      left: Object.fromEntries(this.ids.map((id) => [id, GUESSES_EACH - this.used(id)])),
      winnerId: this.winner,
      secret: this.over ? this.secret : null,
      over: this.over,
    };
  }

  isOver() {
    return this.over;
  }

  scores(): Record<string, number> {
    const s: Record<string, number> = {};
    for (const id of this.ids) s[id] = id === this.winner ? 3 : 0;
    return s;
  }

  dispose() {}
}
