import type { GameCtx, GameEngine, Result } from './types.js';
import { shuffle } from './util.js';
import { CARDS, type Card, type Effect } from '../data/cardLibrary.js';

const ROUNDS = 3;
const SECRET_TASK_REWARD = 3;
type Phase = 'draw' | 'judge' | 'settle' | 'over';

interface Judgement {
  id: number;
  card: Card;
  subjectId: string;
  secret: boolean; // 游戏结束时才判定的私人秘密任务
  votes: Record<string, boolean>;
  resolved: boolean;
  success: boolean;
}

interface TableEntry {
  turn: number;
  playerId: string;
  card: Card;
  note: string | null;
}

/**
 * 抽卡游戏：每人每轮抽一张，共 3 轮。
 * 公开卡所有人可见；私人卡只有抽到的人能看到，其积分变化是“暗分”，游戏结束才公布。
 * 任务卡由另外两人投票（至少一人认可即完成）。
 */
export class CardsGame implements GameEngine {
  private ids: string[];
  private order: string[];
  private deck: Card[];
  private turn = 0;
  private phase: Phase = 'draw';
  private pub: Record<string, number> = {};
  private secret: Record<string, number> = {};
  private table: TableEntry[] = [];
  private judgements: Judgement[] = [];
  private nextJudgementId = 1;
  private names: Record<string, string> = {};

  constructor(ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    for (const p of ctx.players) this.names[p.id] = p.nickname;
    const k = ctx.rotation % this.ids.length;
    this.order = [...this.ids.slice(k), ...this.ids.slice(0, k)];
    this.deck = shuffle(CARDS);
    for (const id of this.ids) {
      this.pub[id] = 0;
      this.secret[id] = 0;
    }
  }

  private get total() {
    return ROUNDS * this.ids.length;
  }
  private get drawerId() {
    return this.order[this.turn % this.order.length];
  }

  /** 当前公开分数最高 / 最低的其他玩家（平分时随机取一个） */
  private extreme(except: string, highest: boolean): string | null {
    const others = this.ids.filter((id) => id !== except);
    if (!others.length) return null;
    const best = highest ? Math.max(...others.map((o) => this.pub[o])) : Math.min(...others.map((o) => this.pub[o]));
    const tied = others.filter((o) => this.pub[o] === best);
    return tied[Math.floor(Math.random() * tied.length)];
  }

  private apply(card: Card, who: string): string | null {
    const e: Effect | undefined = card.effect;
    if (!e) return null;
    const rec = card.private ? this.secret : this.pub;
    switch (e.kind) {
      case 'self':
        rec[who] += e.n;
        return `${e.n >= 0 ? '+' : ''}${e.n} 分`;
      case 'all':
        for (const id of this.ids) this.pub[id] += e.n;
        return `所有人 ${e.n >= 0 ? '+' : ''}${e.n} 分`;
      case 'steal': {
        const t = this.extreme(who, true);
        if (!t) return null;
        const n = Math.min(e.n, Math.max(0, this.pub[t]));
        this.pub[t] -= n;
        this.pub[who] += n;
        return n > 0 ? `从 ${this.names[t]} 手里抢走 ${n} 分` : '对方一分都没有，什么也没抢到';
      }
      case 'give': {
        const t = this.extreme(who, false);
        if (!t) return null;
        this.pub[who] -= e.n;
        this.pub[t] += e.n;
        return `送给 ${this.names[t]} ${e.n} 分`;
      }
      case 'swap': {
        const t = this.extreme(who, true);
        if (!t) return null;
        [this.pub[who], this.pub[t]] = [this.pub[t], this.pub[who]];
        return `与 ${this.names[t]} 交换了分数`;
      }
    }
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    switch (a?.type) {
      case 'draw': {
        if (this.phase !== 'draw') return { ok: false, error: '现在不能抽卡' };
        if (pid !== this.drawerId) return { ok: false, error: '还没轮到你抽卡' };
        const card = this.deck.pop();
        if (!card) return { ok: false, error: '卡堆已经空了' };
        const note = card.type === 'task' ? null : this.apply(card, pid);
        // 效果里的玩家 id 在视图层替换为昵称之前先保存原文
        this.table.push({ turn: this.turn, playerId: pid, card, note });
        if (card.type === 'task' && !card.secretTask) {
          this.judgements.push(this.newJudgement(card, pid, false));
          this.phase = 'judge';
        } else {
          this.advance();
        }
        return { ok: true };
      }
      case 'judge': {
        if (this.phase !== 'judge' && this.phase !== 'settle') return { ok: false, error: '现在不能投票' };
        const j = this.judgements.find((x) => x.id === a.judgementId);
        if (!j || j.resolved) return { ok: false, error: '没有需要投票的任务' };
        if (j.subjectId === pid) return { ok: false, error: '不能给自己的任务投票' };
        if (j.votes[pid] !== undefined) return { ok: false, error: '你已经投过票了' };
        if (typeof a.vote !== 'boolean') return { ok: false, error: '投票无效' };
        j.votes[pid] = a.vote;
        if (Object.keys(j.votes).length === this.ids.length - 1) this.resolve(j);
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知操作' };
    }
  }

  private newJudgement(card: Card, subjectId: string, secret: boolean): Judgement {
    return { id: this.nextJudgementId++, card, subjectId, secret, votes: {}, resolved: false, success: false };
  }

  private resolve(j: Judgement) {
    j.resolved = true;
    j.success = Object.values(j.votes).some((v) => v);
    if (j.success) {
      if (j.secret) this.secret[j.subjectId] += SECRET_TASK_REWARD;
      else this.pub[j.subjectId] += j.card.reward ?? 2;
    }
    if (this.judgements.every((x) => x.resolved)) {
      if (this.phase === 'settle') this.phase = 'over';
      else this.advance();
    }
  }

  private advance() {
    this.turn++;
    if (this.turn < this.total) {
      this.phase = 'draw';
      return;
    }
    // 所有人抽完：结算私人秘密任务
    for (const t of this.table) {
      if (t.card.secretTask) this.judgements.push(this.newJudgement(t.card, t.playerId, true));
    }
    this.phase = this.judgements.some((j) => !j.resolved) ? 'settle' : 'over';
  }

  viewFor(pid: string) {
    const over = this.phase === 'over';
    return {
      game: 'cards',
      phase: this.phase,
      turn: Math.min(this.turn, this.total - 1),
      totalTurns: this.total,
      drawerId: this.phase === 'draw' || this.phase === 'judge' ? this.drawerId : null,
      deckLeft: this.deck.length,
      points: over ? this.finalPoints() : this.pub,
      mySecret: this.secret[pid],
      secretAll: over ? this.secret : null,
      table: this.table.map((t) => {
        const visible = !t.card.private || t.playerId === pid || over;
        return {
          turn: t.turn,
          playerId: t.playerId,
          type: visible ? t.card.type : 'private',
          private: !!t.card.private,
          // 其他人看不到私人卡的任何内容，包括卡名与效果
          title: visible ? t.card.title : null,
          text: visible ? t.card.text : null,
          note: visible ? t.note : null,
        };
      }),
      judgements: this.judgements
        .filter((j) => !j.secret || this.phase === 'settle' || over)
        .map((j) => ({
          id: j.id,
          subjectId: j.subjectId,
          secret: j.secret,
          title: j.card.title,
          text: j.card.text,
          voted: Object.keys(j.votes),
          myVote: j.votes[pid] ?? null,
          resolved: j.resolved,
          success: j.resolved ? j.success : null,
          reward: j.secret ? SECRET_TASK_REWARD : j.card.reward ?? 2,
        })),
    };
  }

  private finalPoints(): Record<string, number> {
    const f: Record<string, number> = {};
    for (const id of this.ids) f[id] = this.pub[id] + this.secret[id];
    return f;
  }

  isOver() {
    return this.phase === 'over';
  }

  scores(): Record<string, number> {
    const s: Record<string, number> = {};
    for (const [id, v] of Object.entries(this.finalPoints())) s[id] = Math.max(0, v);
    return s;
  }

  dispose() {}
}

