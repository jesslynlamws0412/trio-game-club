import type { GameCtx, GameEngine, Result } from './types.js';
import { cleanText, rankPoints, shuffle } from './util.js';
import { LIAR_FACTS } from '../data/liarBank.js';

const ROUNDS = 6;
const WRITE_MS = Number(process.env.LIAR_WRITE_MS ?? 45_000);
const VOTE_MS = Number(process.env.LIAR_VOTE_MS ?? 30_000);
const REVEAL_MS = Number(process.env.LIAR_REVEAL_MS ?? 6000);
type Phase = 'write' | 'vote' | 'reveal' | 'over';

const norm = (s: string) => s.replace(/[\s，。,.]/g, '').toLowerCase();

/**
 * 谁是说谎者：每回合一道冷知识，答案被挖空了。
 * 1) 每人偷偷编一个“谎话”答案；2) 真答案和所有谎话混在一起，大家选出自己认为的真答案（不能选自己编的）；
 * 3) 揭晓：选中真答案 +2 分；你编的谎话每骗到一个人 +1 分。共 6 回合。
 */
export class LiarGame implements GameEngine {
  private ids: string[];
  private facts: typeof LIAR_FACTS;
  private round = 0;
  private phase: Phase = 'write';
  private lies = new Map<string, string>();
  private options: { id: string; text: string; authors: string[]; real: boolean }[] = [];
  private votes = new Map<string, string>();
  private points: Record<string, number> = {};
  private gains: Record<string, number> = {};
  private startedAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    this.facts = shuffle(LIAR_FACTS).slice(0, ROUNDS);
    for (const id of this.ids) this.points[id] = 0;
    this.startWrite();
  }

  private get fact() {
    return this.facts[this.round];
  }

  private arm(ms: number, fn: () => void) {
    if (this.timer) clearTimeout(this.timer);
    this.startedAt = Date.now();
    this.timer = setTimeout(() => {
      fn();
      this.ctx.notify();
    }, ms);
  }

  private startWrite() {
    this.phase = 'write';
    this.lies.clear();
    this.votes.clear();
    this.arm(WRITE_MS, () => {
      if (this.phase === 'write') this.startVote();
    });
  }

  private startVote() {
    // 同样的谎话合并成一个选项（作者都算）；没写谎话的人不会出现在选项里
    const byText = new Map<string, string[]>();
    for (const [id, text] of this.lies) {
      const k = norm(text);
      byText.set(k, [...(byText.get(k) ?? []), id]);
    }
    const opts = [...byText.entries()].map(([k, authors]) => ({ id: '', text: this.lies.get(authors[0])!, authors, real: false, k }));
    const all = shuffle([{ id: '', text: this.fact.answer, authors: [] as string[], real: true, k: '' }, ...opts]).map((o, i) => ({
      id: String(i),
      text: o.text,
      authors: o.authors,
      real: o.real,
    }));
    this.options = all;
    this.phase = 'vote';
    // 只有真答案可选（没有人写出谎话）时直接揭晓
    if (this.options.length <= 1) return this.reveal();
    this.arm(VOTE_MS, () => {
      if (this.phase === 'vote') this.reveal();
    });
  }

  private reveal() {
    this.phase = 'reveal';
    this.gains = Object.fromEntries(this.ids.map((id) => [id, 0]));
    const real = this.options.find((o) => o.real);
    for (const [voter, optId] of this.votes) {
      const opt = this.options.find((o) => o.id === optId)!;
      if (opt.real) this.gains[voter] += 2;
      else for (const author of opt.authors) this.gains[author] += 1;
    }
    for (const id of this.ids) this.points[id] += this.gains[id];
    void real;
    this.arm(REVEAL_MS, () => {
      this.round++;
      if (this.round >= this.facts.length) {
        this.phase = 'over';
        this.timer = null;
      } else this.startWrite();
    });
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    if (a?.type === 'lie') {
      if (this.phase !== 'write') return { ok: false, error: '现在不能编谎话' };
      if (this.lies.has(pid)) return { ok: false, error: '你已经提交过了' };
      const text = cleanText(a.text, 12);
      if (!text) return { ok: false, error: '请输入 1~12 个字' };
      if (this.fact.accepted.some((x) => norm(x) === norm(text))) return { ok: false, error: '这就是真答案啦！请编一个别的“谎话”' };
      this.lies.set(pid, text);
      if (this.lies.size === this.ids.length) this.startVote();
      return { ok: true };
    }
    if (a?.type === 'vote') {
      if (this.phase !== 'vote') return { ok: false, error: '现在不能投票' };
      if (this.votes.has(pid)) return { ok: false, error: '你已经投过票了' };
      const opt = this.options.find((o) => o.id === a.option);
      if (!opt) return { ok: false, error: '选项无效' };
      if (opt.authors.includes(pid)) return { ok: false, error: '不能选自己编的谎话' };
      this.votes.set(pid, opt.id);
      // 所有人都投完（或没得投的人不用投）就揭晓
      const needed = this.ids.filter((id) => this.options.some((o) => !o.authors.includes(id)));
      if (needed.every((id) => this.votes.has(id))) this.reveal();
      return { ok: true };
    }
    return { ok: false, error: '未知操作' };
  }

  viewFor(pid: string) {
    const base = { game: 'liar', phase: this.phase, total: this.facts.length, points: this.points };
    if (this.phase === 'over') return { ...base, ranking: rankPoints(this.points, this.ids) };
    const reveal = this.phase === 'reveal';
    return {
      ...base,
      round: this.round,
      question: this.fact.q,
      written: [...this.lies.keys()],
      myLie: this.lies.get(pid) ?? null,
      // 投票阶段：只发选项文字（不暴露哪个是真的、谁写的）；自己编的那个标出来，不能选
      options: this.phase === 'write' ? null : this.options.map((o) => ({ id: o.id, text: o.text, mine: o.authors.includes(pid), real: reveal ? o.real : undefined, authors: reveal ? o.authors : undefined })),
      voted: [...this.votes.keys()],
      myVote: this.votes.get(pid) ?? null,
      votes: reveal ? Object.fromEntries(this.votes) : undefined,
      gains: reveal ? this.gains : undefined,
      note: reveal ? this.fact.note : undefined,
      endsInMs: this.phase === 'write' ? Math.max(0, this.startedAt + WRITE_MS - Date.now()) : this.phase === 'vote' ? Math.max(0, this.startedAt + VOTE_MS - Date.now()) : 0,
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
