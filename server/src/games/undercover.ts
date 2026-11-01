import type { GameCtx, GameEngine, GamePlayer, Result } from './types.js';
import { cleanText, randomItem, shuffle } from './util.js';
import { WORD_PAIRS } from '../data/wordPairs.js';
import { hasEnglish, mentions, wordForms } from '../i18n.js';

const DISCUSS_MS = 90_000;
type Phase = 'describe' | 'discuss' | 'vote' | 'over';

/**
 * 谁是卧底（三人版）：1 卧底 + 2 平民。
 * 每轮：依次描述 → 讨论 → 同时投票。投中卧底平民胜；
 * 第 1 轮投错/平票则进入第 2 轮，第 2 轮仍未投中卧底则卧底胜。
 */
export class UndercoverGame implements GameEngine {
  private ids: string[];
  private undercoverId: string;
  private civWord: string;
  private undWord: string;
  private phase: Phase = 'describe';
  private round = 1;
  private order: string[];
  private turn = 0;
  private descriptions: { round: number; playerId: string; text: string }[] = [];
  private chat: { playerId: string; text: string }[] = [];
  private discussEndsAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private skip = new Set<string>();
  private votes = new Map<string, string>();
  private voteHistory: { round: number; votes: Record<string, string>; outId: string | null }[] = [];
  private winner: 'civilians' | 'undercover' | null = null;

  constructor(private ctx: GameCtx) {
    this.ids = ctx.players.map((p: GamePlayer) => p.id);
    this.undercoverId = this.ids[ctx.rotation % this.ids.length];
    // 房间里有英文玩家：只抽两个词都有英文说法的
    const [a, b] = randomItem(ctx.english ? WORD_PAIRS.filter(([x, y]) => hasEnglish(x) && hasEnglish(y)) : WORD_PAIRS);
    [this.civWord, this.undWord] = Math.random() < 0.5 ? [a, b] : [b, a];
    this.order = shuffle(this.ids);
  }

  private wordOf(id: string) {
    return id === this.undercoverId ? this.undWord : this.civWord;
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    switch (a?.type) {
      case 'describe': {
        if (this.phase !== 'describe') return { ok: false, error: '现在不是描述阶段' };
        if (this.order[this.turn] !== pid) return { ok: false, error: '还没轮到你' };
        const text = cleanText(a.text, 40);
        if (!text) return { ok: false, error: '描述需要 1~40 个字' };
        if (wordForms(this.wordOf(pid)).some((w) => mentions(text, w))) return { ok: false, error: '不能直接说出你的词语' };
        this.descriptions.push({ round: this.round, playerId: pid, text });
        this.turn++;
        if (this.turn >= this.order.length) this.startDiscuss();
        return { ok: true };
      }
      case 'chat': {
        if (this.phase !== 'discuss' && this.phase !== 'vote') return { ok: false, error: '现在不能发言' };
        const text = cleanText(a.text, 100);
        if (!text) return { ok: false, error: '请输入 1~100 个字' };
        this.chat.push({ playerId: pid, text });
        if (this.chat.length > 80) this.chat.shift();
        return { ok: true };
      }
      case 'skip': {
        if (this.phase !== 'discuss') return { ok: false, error: '现在不是讨论阶段' };
        this.skip.add(pid);
        if (this.skip.size === this.ids.length) this.startVote();
        return { ok: true };
      }
      case 'vote': {
        if (this.phase !== 'vote') return { ok: false, error: '现在不是投票阶段' };
        if (this.votes.has(pid)) return { ok: false, error: '你已经投过票了' };
        if (typeof a.target !== 'string' || !this.ids.includes(a.target) || a.target === pid) {
          return { ok: false, error: '请选择其他玩家' };
        }
        this.votes.set(pid, a.target);
        if (this.votes.size === this.ids.length) this.resolveVote();
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知操作' };
    }
  }

  private startDiscuss() {
    this.phase = 'discuss';
    this.skip.clear();
    this.discussEndsAt = Date.now() + DISCUSS_MS;
    this.timer = setTimeout(() => {
      if (this.phase === 'discuss') {
        this.startVote();
        this.ctx.notify();
      }
    }, DISCUSS_MS);
  }

  private startVote() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.phase = 'vote';
    this.votes.clear();
  }

  private resolveVote() {
    const tally = new Map<string, number>();
    for (const t of this.votes.values()) tally.set(t, (tally.get(t) ?? 0) + 1);
    const max = Math.max(...tally.values());
    const top = [...tally.entries()].filter(([, n]) => n === max).map(([id]) => id);
    const outId = top.length === 1 ? top[0] : null;
    this.voteHistory.push({ round: this.round, votes: Object.fromEntries(this.votes), outId });
    if (outId === this.undercoverId) {
      this.winner = 'civilians';
      this.phase = 'over';
    } else if (this.round >= 2) {
      this.winner = 'undercover';
      this.phase = 'over';
    } else {
      this.round = 2;
      this.phase = 'describe';
      this.turn = 0;
      this.order = shuffle(this.ids);
      this.votes.clear();
    }
  }

  viewFor(pid: string) {
    const over = this.phase === 'over';
    return {
      game: 'undercover',
      phase: this.phase,
      round: this.round,
      myWord: this.wordOf(pid),
      order: this.order,
      turnPlayerId: this.phase === 'describe' ? this.order[this.turn] : null,
      descriptions: this.descriptions,
      chat: this.chat,
      discussEndsInMs: this.phase === 'discuss' ? Math.max(0, this.discussEndsAt - Date.now()) : 0,
      skipped: [...this.skip],
      voted: [...this.votes.keys()],
      myVote: this.votes.get(pid) ?? null,
      voteHistory: this.voteHistory,
      result: over
        ? { winner: this.winner, undercoverId: this.undercoverId, civWord: this.civWord, undWord: this.undWord }
        : null,
    };
  }

  isOver() {
    return this.phase === 'over';
  }

  scores(): Record<string, number> {
    const s: Record<string, number> = {};
    if (!this.winner) return s;
    for (const id of this.ids) {
      if (this.winner === 'civilians') s[id] = id === this.undercoverId ? 0 : 2;
      else s[id] = id === this.undercoverId ? 4 : 0;
    }
    return s;
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }
}
