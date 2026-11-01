import type { GameCtx, GameEngine, Result } from './types.js';
import { cleanText, rankPoints, shuffle } from './util.js';
import { TABOO } from '../data/tabooBank.js';
import { hasEnglish, mentions, wordForms } from '../i18n.js';

const ROUND_MS = 60_000;
const REVEAL_MS = Number(process.env.TABOO_REVEAL_MS ?? 4000);
const MAX_FOULS = 3;
type Phase = 'play' | 'reveal' | 'over';
type Entry = { kind: 'hint' | 'guess' | 'foul'; by: string; text: string | null };

const norm = (s: string) => s.replace(/[\s，。！？、,.!?]/g, '').toLowerCase();

/**
 * 禁忌词挑战：每回合一人当描述者，只有他能看到词语和 3 个禁忌词。
 * 他用文字描述（不能含有词语本身或禁忌词，违规扣 1 分，3 次违规本回合作废），其他人输入答案抢答。
 * 猜对的人 +3，描述者 +2。描述者可以“换词”（扣 1 分）。每人轮流当描述者（双人时各两次）。
 */
export class TabooGame implements GameEngine {
  private ids: string[];
  private order: string[];
  private deck: typeof TABOO;
  private deckIdx = 0;
  private round = 0;
  private phase: Phase = 'play';
  private log: Entry[] = [];
  private fouls = 0;
  private solvedBy: string | null = null;
  private points: Record<string, number> = {};
  private startedAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    const k = ctx.rotation % this.ids.length;
    const rot = [...this.ids.slice(k), ...this.ids.slice(0, k)];
    this.order = this.ids.length === 2 ? [...rot, ...rot] : rot.slice(0, 8);
    // 房间里有英文玩家：只抽词和禁忌词都有英文说法的
    this.deck = shuffle(ctx.english ? TABOO.filter((e) => [e.word, ...e.banned].every(hasEnglish)) : TABOO);
    for (const id of this.ids) this.points[id] = 0;
    this.startRound();
  }

  private get entry() {
    return this.deck[this.deckIdx % this.deck.length];
  }
  private get describer() {
    return this.order[this.round];
  }

  private startRound() {
    this.phase = 'play';
    this.log = [];
    this.fouls = 0;
    this.solvedBy = null;
    this.startedAt = Date.now();
    this.timer = setTimeout(() => {
      if (this.phase === 'play') {
        this.reveal();
        this.ctx.notify();
      }
    }, ROUND_MS);
  }

  private reveal() {
    if (this.timer) clearTimeout(this.timer);
    this.phase = 'reveal';
    this.timer = setTimeout(() => {
      this.round++;
      this.deckIdx++;
      if (this.round >= this.order.length) {
        this.phase = 'over';
        this.timer = null;
      } else {
        this.startRound();
      }
      this.ctx.notify();
    }, REVEAL_MS);
  }

  private violates(text: string): boolean {
    const t = norm(text);
    const { word, banned } = this.entry;
    // 中英文两种说法都不能说（英文要整个单词匹配）
    return [word, ...banned].some((w) => wordForms(w).some((f) => (/[\u4e00-\u9fff]/.test(f) ? t.includes(norm(f)) : mentions(text, f))));
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    if (this.phase !== 'play') return { ok: false, error: '现在不能操作' };
    const isDescriber = pid === this.describer;
    switch (a?.type) {
      case 'hint': {
        if (!isDescriber) return { ok: false, error: '只有描述者可以描述' };
        const text = cleanText(a.text, 40);
        if (!text) return { ok: false, error: '请输入 1~40 个字' };
        if (this.log.length >= 80) this.log.shift();
        if (this.violates(text)) {
          this.fouls++;
          this.points[pid] -= 1;
          this.log.push({ kind: 'foul', by: pid, text: null }); // 违规的内容不公开
          if (this.fouls >= MAX_FOULS) this.reveal();
        } else {
          this.log.push({ kind: 'hint', by: pid, text });
        }
        return { ok: true };
      }
      case 'guess': {
        if (isDescriber) return { ok: false, error: '描述者不能猜' };
        const text = cleanText(a.text, 20);
        if (!text) return { ok: false, error: '请输入 1~20 个字' };
        if (wordForms(this.entry.word).some((w) => norm(text) === norm(w))) {
          this.solvedBy = pid;
          this.points[pid] += 3;
          this.points[this.describer] += 2;
          this.reveal();
        } else {
          if (this.log.length >= 80) this.log.shift();
          this.log.push({ kind: 'guess', by: pid, text });
        }
        return { ok: true };
      }
      case 'swap': {
        if (!isDescriber) return { ok: false, error: '只有描述者可以换词' };
        this.points[pid] -= 1;
        this.deckIdx++;
        this.log = [];
        this.fouls = 0;
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知操作' };
    }
  }

  viewFor(pid: string) {
    const over = this.phase === 'over';
    const secret = !over && (pid === this.describer || this.phase === 'reveal');
    const base = { game: 'taboo', phase: this.phase, points: this.points, total: this.order.length };
    if (over) return { ...base, ranking: rankPoints(this.points, this.ids) };
    return {
      ...base,
      round: this.round,
      describerId: this.describer,
      word: secret ? this.entry.word : null,
      // 只有描述者能看到禁忌词（揭晓后大家都能看到）
      banned: secret ? this.entry.banned : null,
      wordLen: [...this.entry.word].length,
      log: this.log,
      fouls: this.fouls,
      maxFouls: MAX_FOULS,
      solvedBy: this.solvedBy,
      endsInMs: this.phase === 'play' ? Math.max(0, this.startedAt + ROUND_MS - Date.now()) : 0,
    };
  }

  isOver() {
    return this.phase === 'over';
  }

  scores(): Record<string, number> {
    return Object.fromEntries(rankPoints(this.points, this.ids).map((r) => [r.id, r.bonus]));
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }
}
