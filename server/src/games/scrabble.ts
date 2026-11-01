import fs from 'node:fs';
import wordListPath from 'word-list';
import type { GameCtx, GameEngine, Result } from './types.js';
import { rankPoints, shuffle } from './util.js';

const SIZE = 15;
const CENTER = 7;
const RACK = 7;
const BINGO = 50;
const IDLE_PASS_LIMIT = Number(process.env.SCRABBLE_STALL_TURNS ?? 0); // 0 = 自动：max(6, 2×人数)

const DIST: Record<string, [number, number]> = {
  A: [9, 1], B: [2, 3], C: [2, 3], D: [4, 2], E: [12, 1], F: [2, 4], G: [3, 2], H: [2, 4], I: [9, 1], J: [1, 8], K: [1, 5], L: [4, 1], M: [2, 3],
  N: [6, 1], O: [8, 1], P: [2, 3], Q: [1, 10], R: [6, 1], S: [4, 1], T: [6, 1], U: [4, 1], V: [2, 4], W: [2, 4], X: [1, 8], Y: [2, 4], Z: [1, 10],
  '?': [2, 0],
};
export const LETTER_VALUE: Record<string, number> = Object.fromEntries(Object.entries(DIST).map(([k, v]) => [k, v[1]]));

const cells = (list: [number, number][]) => new Set(list.map(([r, c]) => r * SIZE + c));
const TW = cells([[0, 0], [0, 7], [0, 14], [7, 0], [7, 14], [14, 0], [14, 7], [14, 14]]);
const DW = cells([
  [1, 1], [2, 2], [3, 3], [4, 4], [10, 10], [11, 11], [12, 12], [13, 13], [1, 13], [2, 12], [3, 11], [4, 10], [10, 4], [11, 3], [12, 2], [13, 1], [7, 7],
]);
const TL = cells([[1, 5], [1, 9], [5, 1], [5, 5], [5, 9], [5, 13], [9, 1], [9, 5], [9, 9], [9, 13], [13, 5], [13, 9]]);
const DL = cells([
  [0, 3], [0, 11], [2, 6], [2, 8], [3, 0], [3, 7], [3, 14], [6, 2], [6, 6], [6, 8], [6, 12], [7, 3], [7, 11], [8, 2], [8, 6], [8, 8], [8, 12],
  [11, 0], [11, 7], [11, 14], [12, 6], [12, 8], [14, 3], [14, 11],
]);
/** 给客户端画棋盘用：'TW' 三倍词 / 'DW' 二倍词 / 'TL' 三倍字母 / 'DL' 二倍字母 */
export const PREMIUM: string[][] = Array.from({ length: SIZE }, (_, r) =>
  Array.from({ length: SIZE }, (_, c) => {
    const k = r * SIZE + c;
    return TW.has(k) ? 'TW' : DW.has(k) ? 'DW' : TL.has(k) ? 'TL' : DL.has(k) ? 'DL' : '';
  }),
);

let dict: Set<string> | null = null;
/** 英文词典（约 27 万词），第一次开局时才读入内存 */
export function dictionary(): Set<string> {
  if (!dict) dict = new Set(fs.readFileSync(wordListPath, 'utf8').split('\n').filter(Boolean));
  return dict;
}

interface Tile {
  id: number;
  ch: string; // 'A'..'Z'，空白牌是 '?'
}
interface Placed {
  ch: string; // 实际代表的字母
  blank: boolean;
}
type Board = (Placed | null)[][];

interface Move {
  words: { word: string; points: number }[];
  total: number;
  bingo: boolean;
}

/**
 * 拼字游戏（Scrabble）：2~4 人，15×15 棋盘，100 个字母牌（含 2 张空白牌），每人 7 张。
 * 每回合可以：放牌成词（同一行或同一列，第一手必须经过中心星，之后要和已有的牌相连）、
 * 换牌（牌袋里至少还有 7 张）、或跳过。所有形成的单词都必须在词典里，否则整手牌不算。
 * 一个人用完牌且牌袋已空，或连续多次没人得分，游戏结束；剩余字母牌扣分。
 */
export class ScrabbleGame implements GameEngine {
  private ids: string[];
  private nameOf: Record<string, string> = {};
  private board: Board = Array.from({ length: SIZE }, () => Array<Placed | null>(SIZE).fill(null));
  private bag: Tile[];
  private racks: Record<string, Tile[]> = {};
  private score: Record<string, number> = {};
  private turn: number;
  private scoreless = 0;
  private nextId = 0;
  private over = false;
  private wentOut: string | null = null;
  private last: { by: string; words: { word: string; points: number }[]; total: number; bingo: boolean; cells: [number, number][] } | null = null;
  private log: string[] = [];
  private final: Record<string, number> | null = null;

  constructor(ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    for (const p of ctx.players) {
      this.nameOf[p.id] = p.nickname;
      this.score[p.id] = 0;
    }
    const all: Tile[] = [];
    for (const [ch, [n]] of Object.entries(DIST)) for (let i = 0; i < n; i++) all.push({ id: this.nextId++, ch });
    this.bag = shuffle(all);
    for (const id of this.ids) this.racks[id] = [];
    for (const id of this.ids) this.refill(id);
    this.turn = ctx.rotation % this.ids.length;
    dictionary();
    this.say(`游戏开始！${this.nameOf[this.current]} 先手，第一个单词必须经过中心的 ★。`);
  }

  private get current() {
    return this.ids[this.turn];
  }
  private say(s: string) {
    this.log.push(s);
    if (this.log.length > 12) this.log.shift();
  }
  private refill(id: string) {
    const rack = this.racks[id];
    while (rack.length < RACK && this.bag.length > 0) rack.push(this.bag.pop()!);
  }
  private isEmpty() {
    return this.board.every((row) => row.every((c) => c === null));
  }
  private stallLimit() {
    return IDLE_PASS_LIMIT > 0 ? IDLE_PASS_LIMIT : Math.max(6, this.ids.length * 2);
  }

  /** 校验并计算一手牌；不修改任何状态 */
  private evaluate(pid: string, a: any): Result<{ move: Move; placed: { tile: Tile; r: number; c: number; ch: string; blank: boolean }[] }> {
    const list = Array.isArray(a?.tiles) ? a.tiles : null;
    if (!list || list.length === 0) return { ok: false, error: '请先把字母牌放到棋盘上' };
    if (list.length > RACK) return { ok: false, error: '一次最多放 7 张牌' };
    const rack = this.racks[pid];
    const seenTile = new Set<number>();
    const seenPos = new Set<number>();
    const placed: { tile: Tile; r: number; c: number; ch: string; blank: boolean }[] = [];
    for (const t of list) {
      const tile = rack.find((x) => x.id === t?.id);
      if (!tile) return { ok: false, error: '你没有这张牌' };
      if (seenTile.has(tile.id)) return { ok: false, error: '同一张牌不能放两次' };
      seenTile.add(tile.id);
      if (!Number.isInteger(t.r) || !Number.isInteger(t.c) || t.r < 0 || t.r >= SIZE || t.c < 0 || t.c >= SIZE) return { ok: false, error: '位置超出棋盘' };
      if (this.board[t.r][t.c]) return { ok: false, error: '那个格子已经有牌了' };
      const key = t.r * SIZE + t.c;
      if (seenPos.has(key)) return { ok: false, error: '两张牌不能放在同一格' };
      seenPos.add(key);
      let ch = tile.ch;
      const blank = tile.ch === '?';
      if (blank) {
        ch = String(t.letter ?? '').toUpperCase();
        if (!/^[A-Z]$/.test(ch)) return { ok: false, error: '空白牌需要指定一个字母' };
      }
      placed.push({ tile, r: t.r, c: t.c, ch, blank });
    }
    // 同一行或同一列
    const sameRow = placed.every((p) => p.r === placed[0].r);
    const sameCol = placed.every((p) => p.c === placed[0].c);
    if (!sameRow && !sameCol) return { ok: false, error: '所有的牌必须放在同一行或同一列' };

    // 临时落子
    const temp: Board = this.board.map((row) => row.slice());
    for (const p of placed) temp[p.r][p.c] = { ch: p.ch, blank: p.blank };
    const isNew = (r: number, c: number) => seenPos.has(r * SIZE + c);

    // 中间不能有空格
    if (placed.length > 1) {
      if (sameRow) {
        const r = placed[0].r;
        const lo = Math.min(...placed.map((p) => p.c));
        const hi = Math.max(...placed.map((p) => p.c));
        for (let c = lo; c <= hi; c++) if (!temp[r][c]) return { ok: false, error: '放的牌之间不能有空格' };
      } else {
        const c = placed[0].c;
        const lo = Math.min(...placed.map((p) => p.r));
        const hi = Math.max(...placed.map((p) => p.r));
        for (let r = lo; r <= hi; r++) if (!temp[r][c]) return { ok: false, error: '放的牌之间不能有空格' };
      }
    }

    if (this.isEmpty()) {
      if (!placed.some((p) => p.r === CENTER && p.c === CENTER)) return { ok: false, error: '第一个单词必须经过中心的 ★' };
      if (placed.length < 2) return { ok: false, error: '第一个单词至少要 2 个字母' };
    } else {
      const touches = placed.some((p) =>
        [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => {
          const r = p.r + dr;
          const c = p.c + dc;
          return r >= 0 && r < SIZE && c >= 0 && c < SIZE && this.board[r][c] !== null;
        }),
      );
      if (!touches) return { ok: false, error: '新放的牌必须和棋盘上已有的牌相连' };
    }

    // 收集所有新形成的单词（长度 ≥ 2），按起点和方向去重
    const words = new Map<string, { word: string; points: number }>();
    const collect = (r0: number, c0: number, dr: number, dc: number) => {
      let r = r0;
      let c = c0;
      while (r - dr >= 0 && c - dc >= 0 && temp[r - dr][c - dc]) {
        r -= dr;
        c -= dc;
      }
      const startR = r;
      const startC = c;
      let word = '';
      let sum = 0;
      let mult = 1;
      while (r < SIZE && c < SIZE && temp[r][c]) {
        const cell = temp[r][c]!;
        word += cell.ch;
        let v = cell.blank ? 0 : LETTER_VALUE[cell.ch];
        if (isNew(r, c)) {
          const k = r * SIZE + c;
          if (DL.has(k)) v *= 2;
          else if (TL.has(k)) v *= 3;
          else if (DW.has(k)) mult *= 2;
          else if (TW.has(k)) mult *= 3;
        }
        sum += v;
        r += dr;
        c += dc;
      }
      if (word.length < 2) return;
      words.set(`${dr}:${startR}:${startC}`, { word, points: sum * mult });
    };
    for (const p of placed) {
      collect(p.r, p.c, 0, 1);
      collect(p.r, p.c, 1, 0);
    }
    if (words.size === 0) return { ok: false, error: '没有形成单词' };

    const d = dictionary();
    const bad = [...words.values()].filter((w) => !d.has(w.word.toLowerCase()));
    if (bad.length) return { ok: false, error: `${bad.map((w) => w.word).join('、')} 不在词典里` };

    const list2 = [...words.values()];
    const bingo = placed.length === RACK;
    const total = list2.reduce((s, w) => s + w.points, 0) + (bingo ? BINGO : 0);
    return { ok: true, move: { words: list2, total, bingo }, placed };
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    if (this.over) return { ok: false, error: '游戏已经结束' };
    if (pid !== this.current) return { ok: false, error: '还没轮到你' };
    const name = this.nameOf[pid];
    switch (a?.type) {
      case 'play': {
        const r = this.evaluate(pid, a);
        if (!r.ok) return r;
        const { move, placed } = r;
        for (const p of placed) this.board[p.r][p.c] = { ch: p.ch, blank: p.blank };
        const used = new Set(placed.map((p) => p.tile.id));
        this.racks[pid] = this.racks[pid].filter((t) => !used.has(t.id));
        this.refill(pid);
        this.score[pid] += move.total;
        this.scoreless = 0;
        this.last = { by: pid, words: move.words, total: move.total, bingo: move.bingo, cells: placed.map((p) => [p.r, p.c]) };
        this.say(`${name} 拼出 ${move.words.map((w) => `${w.word}(${w.points})`).join('、')}${move.bingo ? ' ＋ 全部用完奖励 50' : ''}，得 ${move.total} 分。`);
        if (this.racks[pid].length === 0 && this.bag.length === 0) {
          this.wentOut = pid;
          return this.finish();
        }
        this.advance();
        return { ok: true };
      }
      case 'exchange': {
        if (this.bag.length < RACK) return { ok: false, error: '牌袋里的牌不足 7 张，不能换牌' };
        const ids: unknown[] = Array.isArray(a.tiles) ? a.tiles : [];
        const chosen = this.racks[pid].filter((t) => ids.includes(t.id));
        if (chosen.length === 0 || chosen.length !== new Set(ids).size) return { ok: false, error: '请选择要换掉的牌' };
        this.racks[pid] = this.racks[pid].filter((t) => !chosen.includes(t));
        for (let i = 0; i < chosen.length; i++) this.racks[pid].push(this.bag.pop()!);
        this.bag = shuffle([...this.bag, ...chosen]);
        this.say(`${name} 换了 ${chosen.length} 张牌。`);
        this.last = null;
        return this.scorelessTurn();
      }
      case 'pass': {
        this.say(`${name} 跳过了这一手。`);
        this.last = null;
        return this.scorelessTurn();
      }
      default:
        return { ok: false, error: '未知操作' };
    }
  }

  private scorelessTurn(): Result {
    this.scoreless++;
    if (this.scoreless >= this.stallLimit()) {
      this.say('连续多手没有人得分，游戏结束。');
      return this.finish();
    }
    this.advance();
    return { ok: true };
  }

  private advance() {
    this.turn = (this.turn + 1) % this.ids.length;
  }

  private finish(): Result {
    this.over = true;
    const final: Record<string, number> = { ...this.score };
    let bonus = 0;
    for (const id of this.ids) {
      const left = this.racks[id].reduce((s, t) => s + LETTER_VALUE[t.ch], 0);
      final[id] -= left;
      bonus += left;
    }
    if (this.wentOut) final[this.wentOut] += bonus;
    this.final = final;
    this.say(this.wentOut ? `${this.nameOf[this.wentOut]} 用完了所有的牌，拿到其他人剩余字母牌的分数 ${bonus}。` : '各人扣掉手里剩余的字母牌分数。');
    return { ok: true };
  }

  /** 轮到的玩家长时间不动：直接跳过（不替人做拼词决定） */
  onIdle() {
    if (this.over) return;
    this.handleAction(this.current, { type: 'pass' });
  }

  viewFor(pid: string) {
    return {
      game: 'scrabble',
      board: this.board,
      premium: PREMIUM,
      values: LETTER_VALUE,
      rack: this.racks[pid] ?? [],
      counts: Object.fromEntries(this.ids.map((id) => [id, this.racks[id].length])),
      scores: this.final ?? this.score,
      bag: this.bag.length,
      turnId: this.over ? null : this.current,
      empty: this.isEmpty(),
      canExchange: this.bag.length >= RACK,
      last: this.last,
      log: this.log,
      over: this.over,
      wentOut: this.wentOut,
      racks: this.over ? Object.fromEntries(this.ids.map((id) => [id, this.racks[id].map((t) => t.ch)])) : undefined,
      stall: this.scoreless,
      stallLimit: this.stallLimit(),
    };
  }

  isOver() {
    return this.over;
  }

  scores(): Record<string, number> {
    if (!this.final) return {};
    return Object.fromEntries(rankPoints(this.final, this.ids).map((r) => [r.id, r.bonus]));
  }

  dispose() {}
}
