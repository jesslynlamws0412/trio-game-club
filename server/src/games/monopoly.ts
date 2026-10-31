import type { GameCtx, GameEngine, Result } from './types.js';
import { BOARD, CHANCE_CARDS, FATE_CARDS, GROUP_COLORS, type EventCard } from '../data/board.js';

const START_CASH = 15000;
const GO_BONUS = 2000;
const JAIL_POS = 7;
const JAIL_FEE = 500;
const MAX_ROUNDS = Number(process.env.MONOPOLY_MAX_ROUNDS ?? 30);
const RENT_LEVELS = [0.1, 0.3, 0.6, 1.0, 1.6]; // 空地 / 1~3 栋房子 / 酒店，占地价的比例
const MAX_LEVEL = 4;
type Phase = 'roll' | 'buy' | 'manage' | 'over';

interface PlayerState {
  id: string;
  name: string;
  pos: number;
  cash: number;
  inJail: boolean;
  jailTries: number;
  bankrupt: boolean;
  bankruptOrder: number;
}

const round10 = (n: number) => Math.round(n / 10) * 10;
const rand = (n: number) => Math.floor(Math.random() * n);

/**
 * 大富翁：28 格，三人同一棋盘。所有掷骰、结算都在服务器完成。
 * 同色组的两块地都被同一人拥有后才能盖房；现金不足时先自动变卖建筑，仍不足则破产。
 */
export class MonopolyGame implements GameEngine {
  private ps: PlayerState[];
  private owner: (string | null)[];
  private level: number[];
  private turn = 0; // 当前玩家下标
  private turnCount = 0;
  private phase: Phase = 'roll';
  private lastRoll: [number, number] | null = null;
  private log: string[] = [];
  private bankruptCount = 0;
  private pendingBuy: number | null = null;
  private final: { ranking: { id: string; worth: number; rank: number }[] } | null = null;

  constructor(ctx: GameCtx) {
    this.ps = ctx.players.map((p) => ({
      id: p.id, name: p.nickname, pos: 0, cash: START_CASH, inJail: false, jailTries: 0, bankrupt: false, bankruptOrder: 0,
    }));
    const k = ctx.rotation % this.ps.length;
    this.ps = [...this.ps.slice(k), ...this.ps.slice(0, k)];
    this.owner = BOARD.map(() => null);
    this.level = BOARD.map(() => 0);
    this.say(`游戏开始！每人 ${START_CASH} 元，${this.cur.name} 先手。`);
  }

  private get cur() {
    return this.ps[this.turn];
  }
  private say(text: string) {
    this.log.push(text);
    if (this.log.length > 40) this.log.shift();
  }
  private buildCost(i: number) {
    const t = BOARD[i];
    return t.kind === 'prop' ? round10(t.price * 0.5) : 0;
  }
  private partner(i: number): number | null {
    const t = BOARD[i];
    if (t.kind !== 'prop') return null;
    const j = BOARD.findIndex((x, idx) => idx !== i && x.kind === 'prop' && x.group === t.group);
    return j >= 0 ? j : null;
  }
  private ownsGroup(id: string, i: number) {
    const j = this.partner(i);
    return this.owner[i] === id && j !== null && this.owner[j] === id;
  }
  private rent(i: number): number {
    const t = BOARD[i];
    if (t.kind !== 'prop') return 0;
    const lv = this.level[i];
    let r = round10(t.price * RENT_LEVELS[lv]);
    if (lv === 0 && this.owner[i] && this.ownsGroup(this.owner[i]!, i)) r *= 2; // 整组空地租金翻倍
    return r;
  }
  private worth(p: PlayerState) {
    let w = p.cash;
    BOARD.forEach((t, i) => {
      if (this.owner[i] === p.id && t.kind === 'prop') w += t.price + this.level[i] * this.buildCost(i);
    });
    return w;
  }

  /** 付钱。现金不足先变卖建筑（半价），仍不足则破产。返回付款方是否仍在游戏中。 */
  private charge(p: PlayerState, amount: number, creditor: PlayerState | null): boolean {
    if (amount <= 0) return true;
    while (p.cash < amount) {
      // 卖掉等级最高的建筑
      let best = -1;
      for (let i = 0; i < BOARD.length; i++) {
        if (this.owner[i] === p.id && this.level[i] > 0 && (best < 0 || this.level[i] > this.level[best])) best = i;
      }
      if (best < 0) break;
      this.level[best]--;
      p.cash += Math.floor(this.buildCost(best) / 2);
      this.say(`${p.name} 现金不足，被迫变卖了 ${BOARD[best].name} 的一级建筑。`);
    }
    if (p.cash >= amount) {
      p.cash -= amount;
      if (creditor) creditor.cash += amount;
      return true;
    }
    // 破产：剩余现金给债权人，地产回收
    if (creditor) creditor.cash += p.cash;
    this.say(`💥 ${p.name} 破产出局！`);
    p.cash = 0;
    p.bankrupt = true;
    p.bankruptOrder = ++this.bankruptCount;
    for (let i = 0; i < BOARD.length; i++) {
      if (this.owner[i] === p.id) {
        this.owner[i] = null;
        this.level[i] = 0;
      }
    }
    if (this.ps.filter((x) => !x.bankrupt).length <= 1) this.finish();
    return false;
  }

  private finish() {
    this.phase = 'over';
    const alive = this.ps.filter((p) => !p.bankrupt).sort((a, b) => this.worth(b) - this.worth(a));
    const dead = this.ps.filter((p) => p.bankrupt).sort((a, b) => b.bankruptOrder - a.bankruptOrder);
    const order = [...alive, ...dead];
    this.final = { ranking: order.map((p, i) => ({ id: p.id, worth: p.bankrupt ? 0 : this.worth(p), rank: i + 1 })) };
    this.say('游戏结束！');
  }

  private land(p: PlayerState, depth = 0) {
    const t = BOARD[p.pos];
    switch (t.kind) {
      case 'prop': {
        const o = this.owner[p.pos];
        if (!o) {
          if (p.cash >= t.price) {
            this.pendingBuy = p.pos;
            this.phase = 'buy';
            this.say(`${p.name} 来到 ${t.name}（空地，${t.price} 元），可以购买。`);
          } else {
            this.say(`${p.name} 来到 ${t.name}，但现金不足以购买。`);
          }
        } else if (o !== p.id) {
          const owner = this.ps.find((x) => x.id === o)!;
          const r = this.rent(p.pos);
          this.say(`${p.name} 来到 ${owner.name} 的 ${t.name}，支付租金 ${r}。`);
          this.charge(p, r, owner);
        } else {
          this.say(`${p.name} 来到自己的地产 ${t.name}。`);
        }
        break;
      }
      case 'tax':
        this.say(`${p.name} 缴纳${t.name} ${t.amount}。`);
        this.charge(p, t.amount, null);
        break;
      case 'gojail':
        this.say(`${p.name} 被送进监狱！`);
        p.pos = JAIL_POS;
        p.inJail = true;
        p.jailTries = 0;
        break;
      case 'chance':
      case 'fate': {
        if (depth > 2) break;
        const deck = t.kind === 'chance' ? CHANCE_CARDS : FATE_CARDS;
        const card = deck[rand(deck.length)];
        this.say(`${p.name} 抽到${t.name}卡：${card.text}`);
        this.applyCard(p, card, depth);
        break;
      }
      default:
        break;
    }
  }

  private move(p: PlayerState, steps: number) {
    const n = BOARD.length;
    const old = p.pos;
    p.pos = (((old + steps) % n) + n) % n;
    if (steps > 0 && p.pos < old) {
      p.cash += GO_BONUS;
      this.say(`${p.name} 经过起点，领取 ${GO_BONUS}。`);
    }
  }

  private applyCard(p: PlayerState, card: EventCard, depth: number) {
    const e = card.effect;
    const others = this.ps.filter((x) => x !== p && !x.bankrupt);
    switch (e.kind) {
      case 'money':
        if (e.n >= 0) p.cash += e.n;
        else this.charge(p, -e.n, null);
        break;
      case 'goto':
        if (e.collectGo && e.pos <= p.pos) p.cash += GO_BONUS;
        p.pos = e.pos;
        this.land(p, depth + 1);
        break;
      case 'move':
        this.move(p, e.n);
        this.land(p, depth + 1);
        break;
      case 'gojail':
        p.pos = JAIL_POS;
        p.inJail = true;
        p.jailTries = 0;
        break;
      case 'payEach':
        for (const o of others) if (!p.bankrupt) this.charge(p, e.n, o);
        break;
      case 'collectEach':
        for (const o of others) this.charge(o, e.n, p);
        break;
      case 'repair': {
        let houses = 0;
        BOARD.forEach((_, i) => {
          if (this.owner[i] === p.id) houses += this.level[i] === 4 ? 5 : this.level[i];
        });
        if (houses > 0) this.charge(p, houses * e.perHouse, null);
        break;
      }
    }
  }

  private nextTurn() {
    this.turnCount++;
    if (this.turnCount >= MAX_ROUNDS * this.ps.length) {
      this.say(`已满 ${MAX_ROUNDS} 回合，按总资产排名。`);
      return this.finish();
    }
    do {
      this.turn = (this.turn + 1) % this.ps.length;
    } while (this.cur.bankrupt);
    this.phase = 'roll';
    this.pendingBuy = null;
    this.lastRoll = null;
  }

  handleAction(pid: string, a: any): Result {
    const res = this.handle(pid, a);
    // 当前玩家在本次操作中破产了：自动轮到下一位
    if (res.ok && this.phase !== 'over' && this.cur.bankrupt) this.nextTurn();
    return res;
  }

  private handle(pid: string, a: any): Result {
    const p = this.ps.find((x) => x.id === pid);
    if (!p) return { ok: false, error: '你不在本局游戏中' };
    if (this.phase === 'over') return { ok: false, error: '游戏已经结束' };
    if (p.bankrupt) return { ok: false, error: '你已经破产了' };
    if (p !== this.cur) return { ok: false, error: '还没轮到你' };

    switch (a?.type) {
      case 'roll': {
        if (this.phase !== 'roll') return { ok: false, error: '现在不能掷骰子' };
        const d1 = 1 + rand(6);
        const d2 = 1 + rand(6);
        this.lastRoll = [d1, d2];
        const doubles = d1 === d2;
        if (p.inJail) {
          if (doubles) {
            p.inJail = false;
            this.say(`${p.name} 掷出双数 ${d1}+${d2}，越狱成功！`);
          } else {
            p.jailTries++;
            if (p.jailTries >= 3) {
              this.say(`${p.name} 在狱中第 3 次没掷出双数，支付 ${JAIL_FEE} 保释金出狱。`);
              p.inJail = false;
              if (!this.charge(p, JAIL_FEE, null)) return { ok: true };
            } else {
              this.say(`${p.name} 掷出 ${d1}+${d2}，没有双数，继续待在狱中（${p.jailTries}/3）。`);
              this.phase = 'manage';
              return { ok: true };
            }
          }
        } else {
          this.say(`${p.name} 掷出 ${d1}+${d2} = ${d1 + d2}。`);
        }
        this.phase = 'manage';
        this.move(p, d1 + d2);
        this.land(p);
        return { ok: true };
      }
      case 'payjail': {
        if (this.phase !== 'roll' || !p.inJail) return { ok: false, error: '现在不能保释' };
        if (p.cash < JAIL_FEE) return { ok: false, error: '现金不足' };
        p.cash -= JAIL_FEE;
        p.inJail = false;
        this.say(`${p.name} 支付 ${JAIL_FEE} 保释金出狱。`);
        return { ok: true };
      }
      case 'buy':
      case 'skip': {
        if (this.phase !== 'buy' || this.pendingBuy === null) return { ok: false, error: '现在没有可购买的地产' };
        const i = this.pendingBuy;
        const t = BOARD[i];
        if (a.type === 'buy' && t.kind === 'prop') {
          if (p.cash < t.price) return { ok: false, error: '现金不足' };
          p.cash -= t.price;
          this.owner[i] = p.id;
          this.say(`${p.name} 花 ${t.price} 买下了 ${t.name}。`);
        } else {
          this.say(`${p.name} 放弃购买 ${t.name}。`);
        }
        this.pendingBuy = null;
        this.phase = 'manage';
        return { ok: true };
      }
      case 'build': {
        if (this.phase !== 'roll' && this.phase !== 'manage') return { ok: false, error: '现在不能建造' };
        const i = a.tile;
        if (!Number.isInteger(i) || !BOARD[i] || BOARD[i].kind !== 'prop') return { ok: false, error: '这里不能建造' };
        if (!this.ownsGroup(p.id, i)) return { ok: false, error: '需要同时拥有同色的两块地才能建造' };
        const j = this.partner(i)!;
        if (this.level[i] >= MAX_LEVEL) return { ok: false, error: '已经是最高级（酒店）' };
        if (this.level[i] > this.level[j]) return { ok: false, error: '请先给同色的另一块地升级（要均匀建造）' };
        const cost = this.buildCost(i);
        if (p.cash < cost) return { ok: false, error: `现金不足，需要 ${cost}` };
        p.cash -= cost;
        this.level[i]++;
        this.say(`${p.name} 花 ${cost} 升级了 ${BOARD[i].name}（${this.level[i] === 4 ? '酒店' : this.level[i] + ' 栋房子'}）。`);
        return { ok: true };
      }
      case 'sell': {
        if (this.phase !== 'roll' && this.phase !== 'manage') return { ok: false, error: '现在不能变卖' };
        const i = a.tile;
        if (!Number.isInteger(i) || !BOARD[i] || this.owner[i] !== p.id || this.level[i] <= 0) {
          return { ok: false, error: '这里没有可变卖的建筑' };
        }
        const j = this.partner(i);
        if (j !== null && this.owner[j] === p.id && this.level[j] > this.level[i]) {
          return { ok: false, error: '请先变卖同色另一块地更高级的建筑' };
        }
        this.level[i]--;
        const refund = Math.floor(this.buildCost(i) / 2);
        p.cash += refund;
        this.say(`${p.name} 变卖了 ${BOARD[i].name} 的一级建筑，得到 ${refund}。`);
        return { ok: true };
      }
      case 'end': {
        if (this.phase !== 'manage') return { ok: false, error: '现在不能结束回合（请先掷骰子）' };
        this.nextTurn();
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知操作' };
    }
  }

  viewFor(_pid: string) {
    return {
      game: 'monopoly',
      phase: this.phase,
      turnId: this.phase === 'over' ? null : this.cur.id,
      round: Math.min(Math.floor(this.turnCount / this.ps.length) + 1, MAX_ROUNDS),
      maxRounds: MAX_ROUNDS,
      lastRoll: this.lastRoll,
      pendingBuy: this.pendingBuy,
      players: this.ps.map((p, i) => ({
        id: p.id, pos: p.pos, cash: p.cash, inJail: p.inJail, bankrupt: p.bankrupt, color: i, worth: this.worth(p),
      })),
      board: BOARD.map((t, i) => ({
        ...t,
        owner: this.owner[i],
        level: this.level[i],
        color: t.kind === 'prop' ? GROUP_COLORS[t.group] : null,
        rent: t.kind === 'prop' ? this.rent(i) : null,
        buildCost: t.kind === 'prop' ? this.buildCost(i) : null,
        canBuild: t.kind === 'prop' && this.owner[i] !== null && this.ownsGroup(this.owner[i]!, i),
      })),
      log: this.log.slice(-14),
      ranking: this.final?.ranking ?? null,
    };
  }

  isOver() {
    return this.phase === 'over';
  }

  scores(): Record<string, number> {
    const s: Record<string, number> = {};
    for (const r of this.final?.ranking ?? []) s[r.id] = [3, 2, 1][r.rank - 1] ?? 0;
    return s;
  }

  dispose() {}
}
