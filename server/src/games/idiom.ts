import type { GameCtx, GameEngine, Result } from './types.js';
import { rankPoints, shuffle } from './util.js';
import { IDIOMS } from '../data/idioms.js';

const TURN_MS = Number(process.env.IDIOM_TURN_MS ?? 35_000);
const LIVES = 3;
const IDIOM_SET = new Set(IDIOMS);
type Phase = 'play' | 'over';

const first = (s: string) => s[0];
const last = (s: string) => s[s.length - 1];

/**
 * 成语接龙：轮流接上一个成语（首字必须等于上一个成语的末字，同字不同音也算），成语必须在词库里且本局没用过。
 * 每接对一个 +1 分；接完后没有成语可接则 +2 并换新的起始成语。每次限时 35 秒，超时扣一条命（共 3 条），命用完出局。
 * 只剩一人（单人则命用完）时结束。
 */
export class IdiomGame implements GameEngine {
  private ids: string[];
  private lives: Record<string, number> = {};
  private points: Record<string, number> = {};
  private out: string[] = [];
  private used = new Set<string>();
  private chain: { by: string | null; idiom: string; note?: string }[] = [];
  private current = '';
  private turnId: string;
  private phase: Phase = 'play';
  private turnStart = 0;
  private timer: NodeJS.Timeout | null = null;
  private lastEvent = '';

  constructor(private ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    for (const id of this.ids) {
      this.lives[id] = LIVES;
      this.points[id] = 0;
    }
    this.turnId = this.ids[ctx.rotation % this.ids.length];
    this.newStart('开局');
    this.armTimer();
  }

  private options(ch: string) {
    return IDIOMS.filter((i) => first(i) === ch && !this.used.has(i));
  }

  private newStart(reason: string) {
    const pool = shuffle(IDIOMS.filter((i) => !this.used.has(i) && this.options(last(i)).length >= 2));
    const start = pool[0] ?? shuffle(IDIOMS.filter((i) => !this.used.has(i)))[0];
    if (!start) {
      this.phase = 'over';
      return;
    }
    this.used.add(start);
    this.current = start;
    this.chain.push({ by: null, idiom: start, note: reason });
  }

  private alive() {
    return this.ids.filter((id) => !this.out.includes(id));
  }

  private nextAlive(from: string) {
    let i = this.ids.indexOf(from);
    for (let k = 0; k < this.ids.length; k++) {
      i = (i + 1) % this.ids.length;
      if (!this.out.includes(this.ids[i])) return this.ids[i];
    }
    return from;
  }

  private armTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.turnStart = Date.now();
    this.timer = setTimeout(() => {
      if (this.phase !== 'play') return;
      const who = this.turnId;
      this.lives[who]--;
      this.lastEvent = 'timeout:' + who;
      if (this.lives[who] <= 0) this.out.push(who);
      this.afterTurn(this.nextAlive(who));
      this.ctx.notify();
    }, TURN_MS);
  }

  private afterTurn(next: string) {
    const stop = this.ids.length === 1 ? this.alive().length === 0 : this.alive().length <= 1;
    if (stop || this.phase === 'over') {
      this.phase = 'over';
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      return;
    }
    this.turnId = next;
    this.armTimer();
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    if (a?.type !== 'say') return { ok: false, error: '未知操作' };
    if (this.phase !== 'play') return { ok: false, error: '游戏已经结束' };
    if (pid !== this.turnId) return { ok: false, error: '还没轮到你' };
    const text = typeof a.text === 'string' ? a.text.trim() : '';
    if (!/^[一-龥]{4}$/.test(text)) return { ok: false, error: '请输入一个四字成语' };
    if (first(text) !== last(this.current)) return { ok: false, error: `要以“${last(this.current)}”字开头` };
    if (this.used.has(text)) return { ok: false, error: '这个成语本局已经用过了' };
    if (!IDIOM_SET.has(text)) return { ok: false, error: '词库里没有这个成语，换一个试试' };
    this.used.add(text);
    this.current = text;
    this.chain.push({ by: pid, idiom: text });
    this.points[pid] += 1;
    this.lastEvent = '';
    if (this.options(last(text)).length === 0) {
      this.points[pid] += 2;
      this.lastEvent = 'deadend:' + pid;
      this.newStart('接龙已无路可走，换一个新的开头');
    }
    this.afterTurn(this.nextAlive(pid));
    return { ok: true };
  }

  viewFor(_pid: string) {
    const over = this.phase === 'over';
    return {
      game: 'idiom',
      phase: this.phase,
      current: this.current,
      need: last(this.current),
      chain: this.chain.slice(-12),
      turnId: over ? null : this.turnId,
      lives: this.lives,
      points: this.points,
      out: this.out,
      lastEvent: this.lastEvent,
      endsInMs: over ? 0 : Math.max(0, this.turnStart + TURN_MS - Date.now()),
      solo: this.ids.length === 1,
      ranking: over ? this.rank() : null,
    };
  }

  /** 分数相同时，存活到最后的排前面 */
  private rank() {
    const composite: Record<string, number> = {};
    for (const id of this.ids) {
      const outIdx = this.out.indexOf(id);
      composite[id] = this.points[id] * 100 + (outIdx === -1 ? 99 : outIdx);
    }
    const ranked = rankPoints(composite, this.ids);
    return ranked.map((r) => ({ id: r.id, points: this.points[r.id], rank: r.rank }));
  }

  isOver() {
    return this.phase === 'over';
  }

  rawScores(): Record<string, number> {
    return Object.fromEntries(this.ids.map((id) => [id, this.points[id]]));
  }

  scores(): Record<string, number> {
    const s: Record<string, number> = {};
    for (const r of this.rank()) s[r.id] = [3, 2, 1][r.rank - 1] ?? 0;
    return s;
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }
}
