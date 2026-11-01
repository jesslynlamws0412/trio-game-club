import type { GameCtx, GameEngine, Result } from './types.js';
import { BOARD, CHANCE_CARDS, FATE_CARDS, GROUP_COLORS, JAIL_POS, type EventCard } from '../data/board.js';

const START_CASH = 1500;
const GO_BONUS = 200;
const JAIL_FEE = 50;
const MAX_ROUNDS = Number(process.env.MONOPOLY_MAX_ROUNDS ?? 30);
const MAX_LEVEL = 5; // 1~4 栋房子，5 = 酒店
type Phase = 'roll' | 'buy' | 'manage' | 'over';

interface PlayerState {
  id: string;
  name: string;
  pos: number;
  cash: number;
  inJail: boolean;
  jailTries: number;
  jailCards: number;
  bankrupt: boolean;
  bankruptOrder: number;
}

const rand = (n: number) => Math.floor(Math.random() * n);
const ownable = (k: string) => k === 'prop' || k === 'rail' || k === 'util';

/**
 * 大富翁（Monopoly 规则）：40 格、颜色组、火车站、公用事业、监狱、机会/命运卡、双数再掷、抵押。
 * 所有掷骰、结算都在服务器完成。同色组全部归一人才能盖房，且要均匀建造；
 * 现金不足时自动变卖建筑、抵押地产，仍不足则破产。
 */
export class MonopolyGame implements GameEngine {
  private ps: PlayerState[];
  private owner: (string | null)[];
  private level: number[];
  private mortgaged: boolean[];
  private turn = 0; // 当前玩家下标
  private turnCount = 0;
  private phase: Phase = 'roll';
  private lastRoll: [number, number] | null = null;
  private doubles = 0; // 本回合连续双数的次数
  private extraRoll = false; // 本回合掷出双数，结束后可以再掷一次
  private log: string[] = [];
  private bankruptCount = 0;
  private pendingBuy: number | null = null;
  private final: { ranking: { id: string; worth: number; rank: number }[] } | null = null;

  constructor(ctx: GameCtx) {
    this.ps = ctx.players.map((p) => ({
      id: p.id, name: p.nickname, pos: 0, cash: START_CASH, inJail: false, jailTries: 0, jailCards: 0, bankrupt: false, bankruptOrder: 0,
    }));
    const k = ctx.rotation % this.ps.length;
    this.ps = [...this.ps.slice(k), ...this.ps.slice(0, k)];
    this.owner = BOARD.map(() => null);
    this.level = BOARD.map(() => 0);
    this.mortgaged = BOARD.map(() => false);
    this.say(`游戏开始！每人 RM${START_CASH}，${this.cur.name} 先手。`);
  }

  private get cur() {
    return this.ps[this.turn];
  }
  private say(text: string) {
    this.log.push(text);
    if (this.log.length > 40) this.log.shift();
  }
  private tileName(i: number) {
    return BOARD[i].name;
  }
  private group(i: number): number[] {
    const t = BOARD[i];
    if (t.kind !== 'prop') return [];
    return BOARD.map((x, idx) => (x.kind === 'prop' && x.group === t.group ? idx : -1)).filter((x) => x >= 0);
  }
  private ownsGroup(id: string, i: number) {
    const g = this.group(i);
    return g.length > 0 && g.every((j) => this.owner[j] === id);
  }
  private buildCost(i: number) {
    const t = BOARD[i];
    return t.kind === 'prop' ? t.houseCost : 0;
  }
  private mortgageValue(i: number) {
    const t = BOARD[i];
    return ownable(t.kind) ? (t as any).price / 2 : 0;
  }
  private redeemCost(i: number) {
    return Math.ceil((this.mortgageValue(i) * 11) / 10);
  }
  private count(id: string, kind: 'rail' | 'util') {
    return BOARD.reduce((n, t, i) => n + (t.kind === kind && this.owner[i] === id ? 1 : 0), 0);
  }
  private rent(i: number, diceSum = 7, railDouble = false, utilTen = false): number {
    const t = BOARD[i];
    const o = this.owner[i];
    if (!o || this.mortgaged[i]) return 0;
    if (t.kind === 'prop') {
      const lv = this.level[i];
      return lv === 0 && this.ownsGroup(o, i) ? t.rents[0] * 2 : t.rents[lv];
    }
    if (t.kind === 'rail') {
      const r = 25 * 2 ** (this.count(o, 'rail') - 1);
      return railDouble ? r * 2 : r;
    }
    if (t.kind === 'util') return diceSum * (utilTen || this.count(o, 'util') >= 2 ? 10 : 4);
    return 0;
  }
  private assetValue(p: PlayerState) {
    let w = p.cash;
    BOARD.forEach((t, i) => {
      if (this.owner[i] !== p.id || !ownable(t.kind)) return;
      w += this.mortgaged[i] ? this.mortgageValue(i) : (t as any).price;
      w += this.level[i] * this.buildCost(i);
    });
    return w;
  }

  /** 付钱。现金不足先变卖建筑（半价），再抵押地产，仍不足则破产。返回付款方是否仍在游戏中。 */
  private charge(p: PlayerState, amount: number, creditor: PlayerState | null): boolean {
    if (amount <= 0) return true;
    while (p.cash < amount) {
      let best = -1;
      for (let i = 0; i < BOARD.length; i++) {
        if (this.owner[i] === p.id && this.level[i] > 0 && (best < 0 || this.level[i] > this.level[best])) best = i;
      }
      if (best >= 0) {
        this.level[best]--;
        p.cash += Math.floor(this.buildCost(best) / 2);
        this.say(`${p.name} 现金不足，被迫变卖了 ${this.tileName(best)} 的一级建筑。`);
        continue;
      }
      let m = -1;
      for (let i = 0; i < BOARD.length; i++) {
        if (this.owner[i] === p.id && ownable(BOARD[i].kind) && !this.mortgaged[i] && (m < 0 || this.mortgageValue(i) > this.mortgageValue(m))) m = i;
      }
      if (m < 0) break;
      this.mortgaged[m] = true;
      p.cash += this.mortgageValue(m);
      this.say(`${p.name} 现金不足，被迫抵押了 ${this.tileName(m)}（+RM${this.mortgageValue(m)}）。`);
    }
    if (p.cash >= amount) {
      p.cash -= amount;
      if (creditor) creditor.cash += amount;
      return true;
    }
    if (creditor) creditor.cash += p.cash;
    this.say(`💥 ${p.name} 破产出局！`);
    p.cash = 0;
    p.bankrupt = true;
    p.bankruptOrder = ++this.bankruptCount;
    for (let i = 0; i < BOARD.length; i++) {
      if (this.owner[i] === p.id) {
        this.owner[i] = null;
        this.level[i] = 0;
        this.mortgaged[i] = false;
      }
    }
    if (this.ps.filter((x) => !x.bankrupt).length <= 1) this.finish();
    return false;
  }

  private finish() {
    this.phase = 'over';
    const alive = this.ps.filter((p) => !p.bankrupt).sort((a, b) => this.assetValue(b) - this.assetValue(a));
    const dead = this.ps.filter((p) => p.bankrupt).sort((a, b) => b.bankruptOrder - a.bankruptOrder);
    const order = [...alive, ...dead];
    this.final = { ranking: order.map((p, i) => ({ id: p.id, worth: p.bankrupt ? 0 : this.assetValue(p), rank: i + 1 })) };
    this.say('游戏结束！');
  }

  private sendToJail(p: PlayerState) {
    p.pos = JAIL_POS;
    p.inJail = true;
    p.jailTries = 0;
    this.extraRoll = false;
    this.doubles = 0;
  }

  private land(p: PlayerState, depth = 0, opts: { railDouble?: boolean; utilTen?: boolean } = {}) {
    const t = BOARD[p.pos];
    switch (t.kind) {
      case 'prop':
      case 'rail':
      case 'util': {
        const o = this.owner[p.pos];
        if (!o) {
          if (p.cash >= t.price) {
            this.pendingBuy = p.pos;
            this.phase = 'buy';
            this.say(`${p.name} 来到 ${t.name}（无人拥有，RM${t.price}），可以购买。`);
          } else {
            this.say(`${p.name} 来到 ${t.name}，但现金不足以购买。`);
          }
        } else if (o !== p.id) {
          const owner = this.ps.find((x) => x.id === o)!;
          const sum = this.lastRoll ? this.lastRoll[0] + this.lastRoll[1] : 7;
          const r = this.rent(p.pos, sum, opts.railDouble, opts.utilTen);
          if (this.mortgaged[p.pos]) this.say(`${p.name} 来到 ${owner.name} 已抵押的 ${t.name}，不用付租金。`);
          else {
            this.say(`${p.name} 来到 ${owner.name} 的 ${t.name}，支付租金 RM${r}。`);
            this.charge(p, r, owner);
          }
        } else {
          this.say(`${p.name} 来到自己的地产 ${t.name}。`);
        }
        break;
      }
      case 'tax':
        this.say(`${p.name} 缴纳${t.name} RM${t.amount}。`);
        this.charge(p, t.amount, null);
        break;
      case 'gojail':
        this.say(`${p.name} 被送进监狱！`);
        this.sendToJail(p);
        break;
      case 'chance':
      case 'fate': {
        if (depth > 2) break;
        const deck = t.kind === 'chance' ? CHANCE_CARDS : FATE_CARDS;
        const card = deck[rand(deck.length)];
        this.say(`${p.name} 抽到「${t.name}」卡：${card.text}`);
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
      this.say(`${p.name} 经过起点，领取 RM${GO_BONUS}。`);
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
        if (e.collectGo && e.pos <= p.pos) {
          p.cash += GO_BONUS;
          this.say(`${p.name} 经过起点，领取 RM${GO_BONUS}。`);
        }
        p.pos = e.pos;
        this.land(p, depth + 1);
        break;
      case 'move':
        this.move(p, e.n);
        this.land(p, depth + 1);
        break;
      case 'nearest': {
        let steps = 1;
        while (BOARD[(p.pos + steps) % BOARD.length].kind !== e.what) steps++;
        this.move(p, steps);
        this.land(p, depth + 1, { railDouble: e.what === 'rail', utilTen: e.what === 'util' });
        break;
      }
      case 'jailcard':
        p.jailCards++;
        break;
      case 'gojail':
        this.sendToJail(p);
        break;
      case 'payEach':
        for (const o of others) if (!p.bankrupt) this.charge(p, e.n, o);
        break;
      case 'collectEach':
        for (const o of others) this.charge(o, e.n, p);
        break;
      case 'repair': {
        let cost = 0;
        BOARD.forEach((_, i) => {
          if (this.owner[i] !== p.id) return;
          cost += this.level[i] === MAX_LEVEL ? e.hotel : this.level[i] * e.house;
        });
        if (cost > 0) this.charge(p, cost, null);
        break;
      }
    }
  }

  private nextTurn() {
    this.turnCount++;
    this.doubles = 0;
    this.extraRoll = false;
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
        const isDouble = d1 === d2;
        this.extraRoll = false;
        if (p.inJail) {
          if (isDouble) {
            p.inJail = false;
            this.say(`${p.name} 掷出双数 ${d1}+${d2}，越狱成功！`);
          } else {
            p.jailTries++;
            if (p.jailTries >= 3) {
              this.say(`${p.name} 在狱中第 3 次没掷出双数，支付 RM${JAIL_FEE} 保释金出狱。`);
              p.inJail = false;
              if (!this.charge(p, JAIL_FEE, null)) return { ok: true };
            } else {
              this.say(`${p.name} 掷出 ${d1}+${d2}，没有双数，继续待在狱中（${p.jailTries}/3）。`);
              this.phase = 'manage';
              return { ok: true };
            }
          }
        } else {
          this.say(`${p.name} 掷出 ${d1}+${d2} = ${d1 + d2}${isDouble ? '（双数！）' : ''}。`);
          if (isDouble) {
            this.doubles++;
            if (this.doubles >= 3) {
              this.say(`${p.name} 连续 3 次双数，被指控作弊，直接入狱！`);
              this.sendToJail(p);
              this.phase = 'manage';
              return { ok: true };
            }
            this.extraRoll = true;
          }
        }
        this.phase = 'manage';
        this.move(p, d1 + d2);
        this.land(p);
        // 被送进监狱后不再有额外回合
        if (p.inJail) this.extraRoll = false;
        return { ok: true };
      }
      case 'payjail': {
        if (this.phase !== 'roll' || !p.inJail) return { ok: false, error: '现在不能保释' };
        if (p.cash < JAIL_FEE) return { ok: false, error: '现金不足' };
        p.cash -= JAIL_FEE;
        p.inJail = false;
        this.say(`${p.name} 支付 RM${JAIL_FEE} 保释金出狱。`);
        return { ok: true };
      }
      case 'usecard': {
        if (this.phase !== 'roll' || !p.inJail) return { ok: false, error: '现在不能用出狱卡' };
        if (p.jailCards <= 0) return { ok: false, error: '你没有出狱卡' };
        p.jailCards--;
        p.inJail = false;
        this.say(`${p.name} 使用免费出狱卡出狱。`);
        return { ok: true };
      }
      case 'buy':
      case 'skip': {
        if (this.phase !== 'buy' || this.pendingBuy === null) return { ok: false, error: '现在没有可购买的地产' };
        const i = this.pendingBuy;
        const t = BOARD[i];
        if (a.type === 'buy' && ownable(t.kind)) {
          const price = (t as any).price as number;
          if (p.cash < price) return { ok: false, error: '现金不足' };
          p.cash -= price;
          this.owner[i] = p.id;
          this.say(`${p.name} 花 RM${price} 买下了 ${t.name}。`);
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
        if (!this.ownsGroup(p.id, i)) return { ok: false, error: '需要拥有同一颜色的全部地产才能建造' };
        const g = this.group(i);
        if (g.some((j) => this.mortgaged[j])) return { ok: false, error: '同色地产里有已抵押的，不能建造' };
        if (this.level[i] >= MAX_LEVEL) return { ok: false, error: '已经是最高级（酒店）' };
        if (this.level[i] > Math.min(...g.map((j) => this.level[j]))) return { ok: false, error: '要均匀建造：请先给同色里等级较低的地产升级' };
        const cost = this.buildCost(i);
        if (p.cash < cost) return { ok: false, error: `现金不足，需要 RM${cost}` };
        p.cash -= cost;
        this.level[i]++;
        this.say(`${p.name} 花 RM${cost} 升级了 ${this.tileName(i)}（${this.level[i] === MAX_LEVEL ? '酒店' : this.level[i] + ' 栋房子'}）。`);
        return { ok: true };
      }
      case 'sell': {
        if (this.phase !== 'roll' && this.phase !== 'manage') return { ok: false, error: '现在不能变卖' };
        const i = a.tile;
        if (!Number.isInteger(i) || !BOARD[i] || this.owner[i] !== p.id || this.level[i] <= 0) {
          return { ok: false, error: '这里没有可变卖的建筑' };
        }
        if (this.group(i).some((j) => this.level[j] > this.level[i])) return { ok: false, error: '要均匀变卖：请先卖同色里等级更高的建筑' };
        this.level[i]--;
        const refund = Math.floor(this.buildCost(i) / 2);
        p.cash += refund;
        this.say(`${p.name} 变卖了 ${this.tileName(i)} 的一级建筑，得到 RM${refund}。`);
        return { ok: true };
      }
      case 'mortgage': {
        if (this.phase !== 'roll' && this.phase !== 'manage') return { ok: false, error: '现在不能抵押' };
        const i = a.tile;
        if (!Number.isInteger(i) || !BOARD[i] || !ownable(BOARD[i].kind) || this.owner[i] !== p.id) return { ok: false, error: '这不是你的地产' };
        if (this.mortgaged[i]) return { ok: false, error: '已经抵押了' };
        if (this.group(i).some((j) => this.level[j] > 0)) return { ok: false, error: '同色地产上还有建筑，请先变卖' };
        this.mortgaged[i] = true;
        p.cash += this.mortgageValue(i);
        this.say(`${p.name} 抵押了 ${this.tileName(i)}，得到 RM${this.mortgageValue(i)}。`);
        return { ok: true };
      }
      case 'redeem': {
        if (this.phase !== 'roll' && this.phase !== 'manage') return { ok: false, error: '现在不能赎回' };
        const i = a.tile;
        if (!Number.isInteger(i) || !BOARD[i] || this.owner[i] !== p.id || !this.mortgaged[i]) return { ok: false, error: '这块地没有被抵押' };
        const cost = this.redeemCost(i);
        if (p.cash < cost) return { ok: false, error: `现金不足，赎回需要 RM${cost}` };
        p.cash -= cost;
        this.mortgaged[i] = false;
        this.say(`${p.name} 花 RM${cost} 赎回了 ${this.tileName(i)}。`);
        return { ok: true };
      }
      case 'end': {
        if (this.phase !== 'manage') return { ok: false, error: '现在不能结束回合（请先掷骰子）' };
        if (this.extraRoll && !p.inJail) {
          this.extraRoll = false;
          this.phase = 'roll';
          this.pendingBuy = null;
          this.lastRoll = null;
          this.say(`${p.name} 掷出了双数，再掷一次！`);
          return { ok: true };
        }
        this.nextTurn();
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知操作' };
    }
  }

  /** 轮到的玩家长时间不动：掷骰、放弃购买、结束回合 */
  onIdle() {
    if (this.phase === 'over') return;
    const who = this.cur.id;
    if (this.phase === 'roll') this.handleAction(who, { type: 'roll' });
    else if (this.phase === 'buy') this.handleAction(who, { type: 'skip' });
    else if (this.phase === 'manage') this.handleAction(who, { type: 'end' });
  }

  viewFor(_pid: string) {
    return {
      game: 'monopoly',
      phase: this.phase,
      turnId: this.phase === 'over' ? null : this.cur.id,
      round: Math.min(Math.floor(this.turnCount / this.ps.length) + 1, MAX_ROUNDS),
      maxRounds: MAX_ROUNDS,
      lastRoll: this.lastRoll,
      extraRoll: this.extraRoll,
      pendingBuy: this.pendingBuy,
      jailFee: JAIL_FEE,
      players: this.ps.map((p, i) => ({
        id: p.id, pos: p.pos, cash: p.cash, inJail: p.inJail, jailCards: p.jailCards, bankrupt: p.bankrupt, color: i, worth: this.assetValue(p),
      })),
      board: BOARD.map((t, i) => {
        const own = this.owner[i];
        const isProp = t.kind === 'prop';
        const g = isProp ? this.group(i) : [];
        const canBuild =
          isProp && own !== null && this.ownsGroup(own, i) && !g.some((j) => this.mortgaged[j]) && this.level[i] < MAX_LEVEL && this.level[i] <= Math.min(...g.map((j) => this.level[j]));
        return {
          ...t,
          owner: own,
          level: this.level[i],
          mortgaged: this.mortgaged[i],
          color: isProp ? GROUP_COLORS[t.group] : null,
          rent: ownable(t.kind) && own ? this.rent(i) : null,
          buildCost: isProp ? t.houseCost : null,
          canBuild,
          canSell: isProp && own !== null && this.level[i] > 0 && !g.some((j) => this.level[j] > this.level[i]),
          mortgageValue: ownable(t.kind) ? this.mortgageValue(i) : null,
          redeemCost: ownable(t.kind) ? this.redeemCost(i) : null,
          canMortgage: ownable(t.kind) && own !== null && !this.mortgaged[i] && !g.some((j) => this.level[j] > 0),
        };
      }),
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
