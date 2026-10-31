import type { GameCtx, GameEngine, Result } from './types.js';
import { cleanText, shuffle } from './util.js';

const NIGHT_MS = 90_000;
const SPEAK_MS = 45_000;
const VOTE_MS = 60_000;
const MAX_DAYS = 3;
type Role = 'wolf' | 'seer' | 'guard';
type Phase = 'night' | 'speak' | 'vote' | 'over';

/**
 * 三人狼人杀：1 狼人 + 1 预言家 + 1 守卫。
 * 夜晚三人同时行动（第 1 夜狼人不能咬人）→ 白天依次发言 → 投票放逐。
 * 狼人被放逐则好人胜；好人只剩 1 人、或 3 个昼夜仍未放逐狼人，则狼人胜。
 */
export class WerewolfGame implements GameEngine {
  private ids: string[];
  private roles: Record<string, Role> = {};
  private alive: Set<string>;
  private day = 1; // 第几个昼夜
  private phase: Phase = 'night';
  private night = new Map<string, string | null>();
  private lastGuard: string | null = null;
  private seerResults: { day: number; target: string; isWolf: boolean }[] = [];
  private events: { day: number; text: string }[] = [];
  private speakOrder: string[] = [];
  private speakIdx = 0;
  private speeches: { day: number; playerId: string; text: string }[] = [];
  private votes = new Map<string, string>();
  private voteHistory: { day: number; votes: Record<string, string>; outId: string | null }[] = [];
  private winner: 'good' | 'wolf' | null = null;
  private timer: NodeJS.Timeout | null = null;
  private deadline = 0;
  private names: Record<string, string> = {};

  constructor(private ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    for (const p of ctx.players) this.names[p.id] = p.nickname;
    const roles: Role[] = shuffle(['wolf', 'seer', 'guard']);
    this.ids.forEach((id, i) => (this.roles[id] = roles[i]));
    this.alive = new Set(this.ids);
    this.startNight();
  }

  private who(role: Role) {
    return this.ids.find((id) => this.roles[id] === role)!;
  }

  private arm(ms: number, onTimeout: () => void) {
    if (this.timer) clearTimeout(this.timer);
    this.deadline = Date.now() + ms;
    this.timer = setTimeout(() => {
      onTimeout();
      this.ctx.notify();
    }, ms);
  }

  private startNight() {
    this.phase = 'night';
    this.night.clear();
    this.arm(NIGHT_MS, () => this.resolveNight());
  }

  private resolveNight() {
    const wolf = this.who('wolf');
    const guard = this.who('guard');
    const seer = this.who('seer');
    // 超时没提交的人视为放弃行动
    const bite = this.alive.has(wolf) && this.day >= 2 ? this.night.get(wolf) ?? null : null;
    const guarded = this.alive.has(guard) ? this.night.get(guard) ?? null : null;
    const check = this.alive.has(seer) ? this.night.get(seer) ?? null : null;
    this.lastGuard = guarded;
    if (check) this.seerResults.push({ day: this.day, target: check, isWolf: this.roles[check] === 'wolf' });
    if (bite && bite !== guarded) {
      this.alive.delete(bite);
      this.events.push({ day: this.day, text: `第 ${this.day} 夜：${this.names[bite]} 被咬死了。` });
      if (this.goodAlive() <= 1) return this.finish('wolf', '好人只剩 1 人，狼人获胜！');
    } else {
      this.events.push({ day: this.day, text: `第 ${this.day} 夜：平安夜，没有人死亡。` });
    }
    this.startSpeak();
  }

  private goodAlive() {
    return [...this.alive].filter((id) => this.roles[id] !== 'wolf').length;
  }

  private startSpeak() {
    this.phase = 'speak';
    const k = (this.day - 1) % this.ids.length;
    const rot = [...this.ids.slice(k), ...this.ids.slice(0, k)];
    this.speakOrder = rot.filter((id) => this.alive.has(id));
    this.speakIdx = 0;
    this.arm(SPEAK_MS, () => this.nextSpeaker('（沉默）'));
  }

  private nextSpeaker(fallback?: string) {
    if (fallback) this.speeches.push({ day: this.day, playerId: this.speakOrder[this.speakIdx], text: fallback });
    this.speakIdx++;
    if (this.speakIdx >= this.speakOrder.length) {
      this.phase = 'vote';
      this.votes.clear();
      this.arm(VOTE_MS, () => this.resolveVote());
    } else {
      this.arm(SPEAK_MS, () => this.nextSpeaker('（沉默）'));
    }
  }

  private resolveVote() {
    const tally = new Map<string, number>();
    for (const t of this.votes.values()) tally.set(t, (tally.get(t) ?? 0) + 1);
    let outId: string | null = null;
    if (tally.size) {
      const max = Math.max(...tally.values());
      const top = [...tally.entries()].filter(([, n]) => n === max).map(([id]) => id);
      if (top.length === 1) outId = top[0];
    }
    this.voteHistory.push({ day: this.day, votes: Object.fromEntries(this.votes), outId });
    if (outId) {
      this.alive.delete(outId);
      this.events.push({ day: this.day, text: `第 ${this.day} 天：${this.names[outId]} 被投票放逐。` });
      if (this.roles[outId] === 'wolf') return this.finish('good', '狼人被放逐，好人获胜！');
      if (this.goodAlive() <= 1) return this.finish('wolf', '好人只剩 1 人，狼人获胜！');
    } else {
      this.events.push({ day: this.day, text: `第 ${this.day} 天：平票，无人被放逐。` });
    }
    if (this.day >= MAX_DAYS) return this.finish('wolf', `${MAX_DAYS} 个昼夜过去，狼人仍未被找出，狼人获胜！`);
    this.day++;
    this.startNight();
  }

  private finish(winner: 'good' | 'wolf', text: string) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.winner = winner;
    this.phase = 'over';
    this.events.push({ day: this.day, text });
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    if (!this.alive.has(pid) && this.phase !== 'over') return { ok: false, error: '你已经出局了' };
    switch (a?.type) {
      case 'night': {
        if (this.phase !== 'night') return { ok: false, error: '现在不是夜晚' };
        if (this.night.has(pid)) return { ok: false, error: '你今晚已经行动过了' };
        const role = this.roles[pid];
        const target: unknown = a.target ?? null;
        if (role === 'wolf' && this.day === 1) {
          this.night.set(pid, null); // 首夜狼人不能咬人，只需确认
        } else {
          if (typeof target !== 'string' || !this.alive.has(target)) return { ok: false, error: '请选择一名存活的玩家' };
          if (role === 'wolf' && target === pid) return { ok: false, error: '狼人不能咬自己' };
          if (role === 'seer' && target === pid) return { ok: false, error: '不能查验自己' };
          if (role === 'guard' && target === this.lastGuard) return { ok: false, error: '不能连续两晚守护同一个人' };
          this.night.set(pid, target);
        }
        if ([...this.alive].every((id) => this.night.has(id))) this.resolveNight();
        return { ok: true };
      }
      case 'speak': {
        if (this.phase !== 'speak') return { ok: false, error: '现在不是发言阶段' };
        if (this.speakOrder[this.speakIdx] !== pid) return { ok: false, error: '还没轮到你发言' };
        const text = cleanText(a.text, 100);
        if (!text) return { ok: false, error: '发言需要 1~100 个字' };
        this.speeches.push({ day: this.day, playerId: pid, text });
        this.nextSpeaker();
        return { ok: true };
      }
      case 'vote': {
        if (this.phase !== 'vote') return { ok: false, error: '现在不是投票阶段' };
        if (this.votes.has(pid)) return { ok: false, error: '你已经投过票了' };
        if (typeof a.target !== 'string' || !this.alive.has(a.target) || a.target === pid) {
          return { ok: false, error: '请选择其他存活的玩家' };
        }
        this.votes.set(pid, a.target);
        if (this.votes.size === this.alive.size) {
          if (this.timer) clearTimeout(this.timer);
          this.resolveVote();
        }
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知操作' };
    }
  }

  viewFor(pid: string) {
    const over = this.phase === 'over';
    const role = this.roles[pid];
    return {
      game: 'werewolf',
      phase: this.phase,
      day: this.day,
      myRole: role,
      alive: [...this.alive],
      // 本人今晚是否已行动；他人是否已行动只公布“已完成名单”，不含行动内容
      nightDone: this.phase === 'night' ? [...this.night.keys()] : [],
      myNightDone: this.night.has(pid),
      seerResults: role === 'seer' ? this.seerResults : [],
      lastGuard: role === 'guard' ? this.lastGuard : null,
      events: this.events,
      speakerId: this.phase === 'speak' ? this.speakOrder[this.speakIdx] : null,
      speeches: this.speeches,
      voted: this.phase === 'vote' ? [...this.votes.keys()] : [],
      myVote: this.votes.get(pid) ?? null,
      voteHistory: this.voteHistory,
      endsInMs: over ? 0 : Math.max(0, this.deadline - Date.now()),
      result: over ? { winner: this.winner, roles: this.roles } : null,
    };
  }

  isOver() {
    return this.phase === 'over';
  }

  scores(): Record<string, number> {
    const s: Record<string, number> = {};
    for (const id of this.ids) {
      const isWolf = this.roles[id] === 'wolf';
      s[id] = this.winner === 'wolf' ? (isWolf ? 4 : 0) : this.winner === 'good' ? (isWolf ? 0 : 2) : 0;
    }
    return s;
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }
}
