import type { GameCtx, GameEngine, Result } from './types.js';
import { rankPoints, shuffle } from './util.js';

// 18 种图案 → 18 对 → 6×6 共 36 张牌
const SYMBOLS = ['🍎', '🍋', '🍇', '🍒', '🍓', '🍉', '🐱', '🐶', '🐼', '🦊', '🚗', '🚀', '⭐', '🌙', '🎈', '🔔', '🍀', '🎲'];
const HIDE_MS = Number(process.env.MEMORY_HIDE_MS ?? 1500);
type Phase = 'play' | 'hide' | 'over';

/**
 * 记忆翻牌：6×6 共 36 张牌、18 对图案，轮流翻两张。翻到一对 +1 分并继续翻；翻错则牌盖回去，换下一位。
 * 未翻开的牌面只存在服务器上，客户端拿不到。
 */
export class MemoryGame implements GameEngine {
  private ids: string[];
  private cards: string[];
  private matched: boolean[];
  private up: number[] = [];
  private turn: number;
  private phase: Phase = 'play';
  private points: Record<string, number> = {};
  private timer: NodeJS.Timeout | null = null;

  constructor(private ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    this.cards = shuffle([...SYMBOLS, ...SYMBOLS]);
    this.matched = this.cards.map(() => false);
    this.turn = ctx.rotation % this.ids.length;
    for (const id of this.ids) this.points[id] = 0;
  }

  private get current() {
    return this.ids[this.turn];
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    if (a?.type !== 'flip') return { ok: false, error: '未知操作' };
    if (this.phase !== 'play') return { ok: false, error: '现在不能翻牌' };
    if (pid !== this.current) return { ok: false, error: '还没轮到你' };
    const i = a.index;
    if (!Number.isInteger(i) || i < 0 || i >= this.cards.length) return { ok: false, error: '没有这张牌' };
    if (this.matched[i] || this.up.includes(i)) return { ok: false, error: '这张牌已经翻开了' };
    this.up.push(i);
    if (this.up.length < 2) return { ok: true };
    const [x, y] = this.up;
    if (this.cards[x] === this.cards[y]) {
      this.matched[x] = this.matched[y] = true;
      this.points[pid] += 1;
      this.up = [];
      if (this.matched.every(Boolean)) this.phase = 'over'; // 配对成功的人继续翻
      return { ok: true };
    }
    this.phase = 'hide';
    this.timer = setTimeout(() => {
      this.up = [];
      this.turn = (this.turn + 1) % this.ids.length;
      this.phase = 'play';
      this.ctx.notify();
    }, HIDE_MS);
    return { ok: true };
  }

  /** 轮到的玩家长时间不动：把翻开的牌盖回去，换下一位 */
  onIdle() {
    if (this.phase !== 'play') return;
    this.up = [];
    this.turn = (this.turn + 1) % this.ids.length;
  }

  viewFor(_pid: string) {
    return {
      game: 'memory',
      phase: this.phase,
      turnId: this.phase === 'over' ? null : this.current,
      cards: this.cards.map((c, i) => (this.matched[i] || this.up.includes(i) ? c : null)),
      matched: this.matched,
      up: this.up,
      points: this.points,
      ranking: this.phase === 'over' ? rankPoints(this.points, this.ids) : null,
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
