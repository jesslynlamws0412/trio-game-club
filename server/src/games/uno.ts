import type { GameCtx, GameEngine, Result } from './types.js';
import { rankPoints, shuffle } from './util.js';

type Color = 'r' | 'y' | 'g' | 'b';
type Kind = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'skip' | 'rev' | 'd2' | 'wild' | 'w4';
export interface UnoCard {
  id: number;
  color: Color | 'w';
  kind: Kind;
}
const COLORS: Color[] = ['r', 'y', 'g', 'b'];
const COLOR_NAME: Record<Color, string> = { r: '红', y: '黄', g: '绿', b: '蓝' };
const START_HAND = 7;

function buildDeck(): UnoCard[] {
  const deck: UnoCard[] = [];
  let id = 0;
  for (const color of COLORS) {
    deck.push({ id: id++, color, kind: '0' });
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', 'd2'] as Kind[]) {
      deck.push({ id: id++, color, kind: k });
      deck.push({ id: id++, color, kind: k });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ id: id++, color: 'w', kind: 'wild' });
    deck.push({ id: id++, color: 'w', kind: 'w4' });
  }
  return deck; // 108 张
}

/**
 * UNO：2~6 人，每人 7 张牌。出牌必须和弃牌堆顶的牌同色、同数字或同符号，万能牌随时可以出。
 * 没有牌可出就摸一张，摸到能出的可以马上出，也可以不出（跳过）。
 * 功能牌：禁止（下家跳过）、反转（改变方向，两人时相当于禁止）、+2（下家摸 2 张并跳过）、
 * 万能牌（选择颜色）、万能 +4（选择颜色，下家摸 4 张并跳过）。不叠加 +2 / +4。
 * 先出完手牌的人获胜（+3）；其余按剩余牌数从少到多排名。手牌剩 1 张时系统自动喊 UNO。
 */
export class UnoGame implements GameEngine {
  private ids: string[];
  private hands: Record<string, UnoCard[]> = {};
  private deck: UnoCard[];
  private discard: UnoCard[] = [];
  private color: Color = 'r';
  private turn: number;
  private dir: 1 | -1 = 1;
  private drawn: UnoCard | null = null; // 刚摸到的牌：可以出，也可以放弃
  private log: string[] = [];
  private winner: string | null = null;
  private nameOf: Record<string, string> = {};

  constructor(ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    for (const p of ctx.players) this.nameOf[p.id] = p.nickname;
    this.deck = shuffle(buildDeck());
    for (const id of this.ids) this.hands[id] = Array.from({ length: START_HAND }, () => this.take());
    // 翻开的第一张必须是数字牌
    let first = this.take();
    while (!/^[0-9]$/.test(first.kind)) {
      this.discard.push(first);
      first = this.take();
    }
    this.discard.push(first);
    this.color = first.color as Color;
    this.turn = ctx.rotation % this.ids.length;
  }

  private get current() {
    return this.ids[this.turn];
  }
  private get top() {
    return this.discard[this.discard.length - 1];
  }
  private say(s: string) {
    this.log.push(s);
    if (this.log.length > 8) this.log.shift();
  }

  private take(): UnoCard {
    if (this.deck.length === 0) {
      // 牌堆用完：把弃牌堆（留下最上面一张）洗了当新牌堆
      const keep = this.discard.pop();
      this.deck = shuffle(this.discard);
      this.discard = keep ? [keep] : [];
    }
    return this.deck.pop()!;
  }

  private playable(c: UnoCard): boolean {
    return c.color === 'w' || c.color === this.color || c.kind === this.top.kind;
  }

  private step(n = 1) {
    this.turn = (this.turn + this.dir * n + this.ids.length * 10) % this.ids.length;
  }

  private draw(id: string, n: number) {
    for (let i = 0; i < n; i++) this.hands[id].push(this.take());
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    if (this.winner) return { ok: false, error: '游戏已经结束' };
    if (pid !== this.current) return { ok: false, error: '还没轮到你' };
    const hand = this.hands[pid];
    const name = this.nameOf[pid];
    switch (a?.type) {
      case 'draw': {
        if (this.drawn) return { ok: false, error: '你已经摸过牌了，请出牌或选择跳过' };
        const c = this.take();
        hand.push(c);
        if (this.playable(c)) {
          this.drawn = c;
          this.say(`${name} 摸了一张牌（可以马上出）。`);
        } else {
          this.say(`${name} 摸了一张牌，没有可以出的，跳过。`);
          this.step();
        }
        return { ok: true };
      }
      case 'pass': {
        if (!this.drawn) return { ok: false, error: '只有摸牌之后才能跳过' };
        this.drawn = null;
        this.say(`${name} 选择不出，跳过。`);
        this.step();
        return { ok: true };
      }
      case 'play': {
        const c = hand.find((x) => x.id === a.card);
        if (!c) return { ok: false, error: '你没有这张牌' };
        if (this.drawn && this.drawn.id !== c.id) return { ok: false, error: '摸牌之后只能出刚摸到的那张牌' };
        if (!this.playable(c)) return { ok: false, error: '这张牌现在不能出（要和上一张同色、同数字或同符号）' };
        if (c.color === 'w' && !COLORS.includes(a.color)) return { ok: false, error: '请选择万能牌的颜色' };
        this.hands[pid] = hand.filter((x) => x.id !== c.id);
        this.drawn = null;
        this.discard.push(c);
        this.color = c.color === 'w' ? (a.color as Color) : c.color;
        this.applyCard(pid, c);
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知操作' };
    }
  }

  private applyCard(pid: string, c: UnoCard) {
    const name = this.nameOf[pid];
    const label = c.color === 'w' ? (c.kind === 'w4' ? '万能 +4' : '万能牌') : `${COLOR_NAME[c.color]}${this.kindName(c.kind)}`;
    this.say(`${name} 出了 ${label}${c.color === 'w' ? `，颜色改为${COLOR_NAME[this.color]}` : ''}。`);
    if (this.hands[pid].length === 0) {
      this.winner = pid;
      this.say(`🏆 ${name} 出完了所有牌！`);
      return;
    }
    if (this.hands[pid].length === 1) this.say(`📣 ${name}：UNO！`);
    switch (c.kind) {
      case 'skip':
        this.step(2);
        break;
      case 'rev':
        this.dir = this.dir === 1 ? -1 : 1;
        this.step(this.ids.length === 2 ? 2 : 1);
        break;
      case 'd2':
      case 'w4': {
        this.step();
        const victim = this.current;
        const n = c.kind === 'd2' ? 2 : 4;
        this.draw(victim, n);
        this.say(`${this.nameOf[victim]} 摸 ${n} 张牌并被跳过。`);
        this.step();
        break;
      }
      default:
        this.step();
    }
  }

  private kindName(k: Kind) {
    return k === 'skip' ? '禁止' : k === 'rev' ? '反转' : k === 'd2' ? ' +2' : k;
  }

  /** 轮到的玩家长时间不动：有牌就出第一张能出的，没有就摸牌（摸到能出的就跳过） */
  onIdle() {
    if (this.winner) return;
    const id = this.current;
    if (this.drawn) {
      this.handleAction(id, { type: 'pass' });
      return;
    }
    const c = this.hands[id].find((x) => this.playable(x));
    if (c) {
      const counts: Record<string, number> = {};
      for (const h of this.hands[id]) if (h.color !== 'w') counts[h.color] = (counts[h.color] ?? 0) + 1;
      const best = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'r') as Color;
      this.handleAction(id, { type: 'play', card: c.id, color: best });
    } else {
      this.handleAction(id, { type: 'draw' });
      if (this.drawn) this.handleAction(id, { type: 'pass' });
    }
  }

  viewFor(pid: string) {
    return {
      game: 'uno',
      hand: this.hands[pid] ?? [],
      counts: Object.fromEntries(this.ids.map((id) => [id, this.hands[id].length])),
      top: this.top,
      color: this.color,
      turnId: this.winner ? null : this.current,
      dir: this.dir,
      deckCount: this.deck.length,
      drawnId: this.drawn && pid === this.current ? this.drawn.id : null,
      playable: pid === this.current && !this.winner ? this.hands[pid].filter((c) => this.playable(c) && (!this.drawn || this.drawn.id === c.id)).map((c) => c.id) : [],
      log: this.log,
      winnerId: this.winner,
      // 结束后公开所有人的剩余手牌
      hands: this.winner ? this.hands : undefined,
    };
  }

  isOver() {
    return this.winner !== null;
  }

  scores(): Record<string, number> {
    const pts = Object.fromEntries(this.ids.map((id) => [id, id === this.winner ? 1000 : -this.hands[id].length]));
    return Object.fromEntries(rankPoints(pts, this.ids).map((r) => [r.id, r.bonus]));
  }

  dispose() {}
}
