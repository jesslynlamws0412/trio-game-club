import type { GameCtx, GameEngine, Result } from './types.js';
import { cleanText, shuffle } from './util.js';
import { DRAW_WORDS } from '../data/drawWords.js';

const ROUND_MS = 60_000;
const REVEAL_MS = Number(process.env.DRAW_REVEAL_MS ?? 4000);
const MAX_STROKES = 400;
const MAX_POINTS = 12_000;
const GUESS_POINTS = [3, 2];
type Phase = 'drawing' | 'reveal' | 'over';

interface Stroke {
  id: string;
  color: string;
  size: number;
  points: [number, number][];
}

const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/**
 * 每个人当画家的次数：人少时多画几轮（两人 3 次、3~5 人 2 次、6 人以上 1 次），
 * 这样总回合数在 6~10 之间。环境变量 DRAW_ROUNDS_PER_PLAYER 可以强制指定（测试用）。
 */
export function roundsPerPlayer(players: number): number {
  const forced = Number(process.env.DRAW_ROUNDS_PER_PLAYER);
  if (forced >= 1) return Math.floor(forced);
  return players <= 2 ? 3 : players <= 5 ? 2 : 1;
}

/** 你画我猜：大家轮流当画家，每人多画几次（见 roundsPerPlayer），笔画以增量实时转发，不经过整体状态广播。 */
export class DrawGame implements GameEngine {
  private ids: string[];
  private drawOrder: string[];
  private words: [string, string][];
  private round = 0;
  private phase: Phase = 'drawing';
  private strokes: Stroke[] = [];
  private pointCount = 0;
  private guesses: { playerId: string; text: string | null; correct: boolean }[] = [];
  private solved: string[] = [];
  private points: Record<string, number> = {};
  private startedAt = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    const k = ctx.rotation % this.ids.length;
    const lap = [...this.ids.slice(k), ...this.ids.slice(0, k)];
    // 轮流画：甲乙丙甲乙丙……，不会连着画两次
    this.drawOrder = Array.from({ length: roundsPerPlayer(this.ids.length) }, () => lap).flat();
    this.words = shuffle(DRAW_WORDS).slice(0, this.drawOrder.length);
    for (const id of this.ids) this.points[id] = 0;
    this.startRound();
  }

  private get drawerId() {
    return this.drawOrder[this.round];
  }
  private get word() {
    return this.words[this.round][0];
  }

  private startRound() {
    this.phase = 'drawing';
    this.strokes = [];
    this.pointCount = 0;
    this.guesses = [];
    this.solved = [];
    this.startedAt = Date.now();
    this.timer = setTimeout(() => {
      if (this.phase === 'drawing') {
        this.endRound();
        this.ctx.notify();
      }
    }, ROUND_MS);
  }

  private endRound() {
    if (this.timer) clearTimeout(this.timer);
    this.phase = 'reveal';
    this.timer = setTimeout(() => {
      this.round++;
      if (this.round >= this.drawOrder.length) {
        this.phase = 'over';
        this.timer = null;
      } else {
        this.startRound();
      }
      this.ctx.notify();
    }, REVEAL_MS);
  }

  handleAction(pid: string, a: any): Result<{ delta?: unknown }> {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    switch (a?.type) {
      case 'stroke': {
        if (this.phase !== 'drawing' || pid !== this.drawerId) return { ok: false, error: '现在不能作画' };
        const { id, color, size, points } = a;
        if (typeof id !== 'string' || id.length < 1 || id.length > 40) return { ok: false, error: '笔画无效' };
        if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) return { ok: false, error: '颜色无效' };
        if (!Number.isFinite(size) || size < 1 || size > 60) return { ok: false, error: '粗细无效' };
        if (!Array.isArray(points) || points.length < 1 || points.length > 300) return { ok: false, error: '笔画无效' };
        const clean: [number, number][] = [];
        for (const p of points) {
          if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return { ok: false, error: '笔画无效' };
          clean.push([Math.max(0, Math.min(1000, Math.round(p[0]))), Math.max(0, Math.min(1000, Math.round(p[1])))]);
        }
        if (this.pointCount + clean.length > MAX_POINTS) return { ok: false, error: '画得太多了，请清空画布' };
        let s = this.strokes.find((x) => x.id === id);
        if (!s) {
          if (this.strokes.length >= MAX_STROKES) return { ok: false, error: '笔画太多了，请清空画布' };
          s = { id, color, size, points: [] };
          this.strokes.push(s);
        }
        s.points.push(...clean);
        this.pointCount += clean.length;
        return { ok: true, delta: { op: 'stroke', id, color: s.color, size: s.size, points: clean } };
      }
      case 'undo': {
        if (this.phase !== 'drawing' || pid !== this.drawerId) return { ok: false, error: '现在不能作画' };
        const s = this.strokes.pop();
        if (s) this.pointCount -= s.points.length;
        return { ok: true, delta: { op: 'undo' } };
      }
      case 'clear': {
        if (this.phase !== 'drawing' || pid !== this.drawerId) return { ok: false, error: '现在不能作画' };
        this.strokes = [];
        this.pointCount = 0;
        return { ok: true, delta: { op: 'clear' } };
      }
      case 'guess': {
        if (this.phase !== 'drawing') return { ok: false, error: '现在不能猜词' };
        if (pid === this.drawerId) return { ok: false, error: '画家不能猜词' };
        if (this.solved.includes(pid)) return { ok: false, error: '你已经猜对了' };
        const text = cleanText(a.text, 20);
        if (!text) return { ok: false, error: '请输入 1~20 个字' };
        const correct = normalize(text) === normalize(this.word);
        if (this.guesses.length >= 100) this.guesses.shift();
        // 猜对的内容不记录，避免被另一位猜词者直接抄答案
        this.guesses.push({ playerId: pid, text: correct ? null : text, correct });
        if (correct) {
          this.solved.push(pid);
          this.points[pid] += GUESS_POINTS[this.solved.length - 1] ?? 1;
          this.points[this.drawerId] += 1;
          if (this.solved.length === this.ids.length - 1) this.endRound();
        }
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知操作' };
    }
  }

  viewFor(pid: string) {
    const over = this.phase === 'over';
    const showWord = !over && (pid === this.drawerId || this.phase === 'reveal');
    const word = over ? '' : this.word;
    return {
      game: 'draw',
      phase: this.phase,
      round: Math.min(this.round, this.drawOrder.length - 1),
      totalRounds: this.drawOrder.length,
      drawerId: over ? null : this.drawerId,
      word: showWord ? word : null,
      wordLen: [...word].length,
      category: over ? '' : this.words[this.round][1],
      endsInMs: this.phase === 'drawing' ? Math.max(0, this.startedAt + ROUND_MS - Date.now()) : 0,
      canvas: over ? [] : this.strokes,
      guesses: this.guesses,
      solved: this.solved,
      points: this.points,
    };
  }

  isOver() {
    return this.phase === 'over';
  }

  scores() {
    return { ...this.points };
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }
}
