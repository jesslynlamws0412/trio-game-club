import type { GameCtx, GameEngine, Result } from './types.js';

const START_DICE = 3;
const REVEAL_MS = Number(process.env.DICE_REVEAL_MS ?? 5000);
type Phase = 'bid' | 'reveal' | 'over';

const roll = () => 1 + Math.floor(Math.random() * 6);

/**
 * 吹牛骰子：每人 3 颗骰子，只能看自己的。轮流叫数（“至少 N 个 X”），1 点是万能点。
 * 下家要么加注（数量更多，或数量相同点数更大），要么“开”：全场数一遍，
 * 叫数成立则开的人输一颗骰子，否则叫数的人输一颗。骰子归零出局，最后留下的人获胜。
 */
export class DiceGame implements GameEngine {
  private ids: string[];
  private dice = new Map<string, number[]>();
  private turnId: string;
  private bid: { by: string; qty: number; face: number } | null = null;
  private phase: Phase = 'bid';
  private round = 1;
  private out: string[] = []; // 出局顺序：先出局的在前
  private result: { caller: string; loser: string; count: number; bid: { by: string; qty: number; face: number } } | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    for (const id of this.ids) this.dice.set(id, Array.from({ length: START_DICE }, roll));
    this.turnId = this.ids[ctx.rotation % this.ids.length];
  }

  private alive() {
    return this.ids.filter((id) => !this.out.includes(id));
  }

  private totalDice() {
    return this.alive().reduce((n, id) => n + this.dice.get(id)!.length, 0);
  }

  private nextAlive(from: string) {
    const order = this.ids;
    let i = order.indexOf(from);
    for (let k = 0; k < order.length; k++) {
      i = (i + 1) % order.length;
      if (!this.out.includes(order[i])) return order[i];
    }
    return from;
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    if (this.phase !== 'bid') return { ok: false, error: '现在不能操作' };
    if (pid !== this.turnId) return { ok: false, error: '还没轮到你' };
    if (a?.type === 'bid') {
      const { qty, face } = a;
      if (!Number.isInteger(qty) || !Number.isInteger(face)) return { ok: false, error: '叫数无效' };
      if (face < 2 || face > 6) return { ok: false, error: '点数只能叫 2~6（1 点是万能点）' };
      if (qty < 1 || qty > this.totalDice()) return { ok: false, error: `数量需要在 1~${this.totalDice()} 之间` };
      if (this.bid && !(qty > this.bid.qty || (qty === this.bid.qty && face > this.bid.face))) {
        return { ok: false, error: '必须比上家叫得更多，或数量相同但点数更大' };
      }
      this.bid = { by: pid, qty, face };
      this.turnId = this.nextAlive(pid);
      return { ok: true };
    }
    if (a?.type === 'call') {
      if (!this.bid) return { ok: false, error: '还没有人叫数，不能开' };
      const bid = this.bid;
      let count = 0;
      for (const id of this.alive()) for (const d of this.dice.get(id)!) if (d === bid.face || d === 1) count++;
      const bidderRight = count >= bid.qty;
      const loser = bidderRight ? pid : bid.by;
      this.result = { caller: pid, loser, count, bid };
      this.phase = 'reveal';
      this.timer = setTimeout(() => {
        this.afterReveal();
        this.ctx.notify();
      }, REVEAL_MS);
      return { ok: true };
    }
    return { ok: false, error: '未知操作' };
  }

  /** 轮到的玩家长时间不动：有人叫数就替他开，没人叫数就叫最小的一注 */
  onIdle() {
    if (this.phase !== 'bid') return;
    this.handleAction(this.turnId, this.bid ? { type: 'call' } : { type: 'bid', qty: 1, face: 2 });
  }

  private afterReveal() {
    const loser = this.result!.loser;
    const left = this.dice.get(loser)!;
    left.pop();
    if (left.length === 0) this.out.push(loser);
    if (this.alive().length <= 1) {
      this.phase = 'over';
      this.timer = null;
      return;
    }
    this.round++;
    for (const id of this.alive()) {
      const n = this.dice.get(id)!.length;
      this.dice.set(id, Array.from({ length: n }, roll));
    }
    this.bid = null;
    this.result = null;
    this.turnId = this.out.includes(loser) ? this.nextAlive(loser) : loser;
    this.phase = 'bid';
  }

  viewFor(pid: string) {
    const showAll = this.phase === 'reveal' || this.phase === 'over';
    return {
      game: 'dice',
      phase: this.phase,
      round: this.round,
      turnId: this.phase === 'bid' ? this.turnId : null,
      bid: this.bid,
      total: this.phase === 'over' ? 0 : this.totalDice(),
      counts: Object.fromEntries(this.ids.map((id) => [id, this.out.includes(id) ? 0 : this.dice.get(id)!.length])),
      myDice: this.out.includes(pid) ? [] : this.dice.get(pid)!,
      // 只有“开”之后才公开所有人的骰子
      allDice: this.phase === 'reveal' ? Object.fromEntries(this.alive().map((id) => [id, this.dice.get(id)!])) : null,
      result: showAll ? this.result : null,
      winnerId: this.phase === 'over' ? this.alive()[0] : null,
      out: this.out,
    };
  }

  isOver() {
    return this.phase === 'over';
  }

  /** 最后留下的人 +3，最后一个出局的 +2，再往前的 +1 */
  scores(): Record<string, number> {
    const s: Record<string, number> = {};
    for (const id of this.ids) s[id] = 0;
    if (this.phase !== 'over') return s;
    const order = [...this.alive(), ...[...this.out].reverse()];
    order.forEach((id, i) => (s[id] = [3, 2, 1][i] ?? 0));
    return s;
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }
}
