import type { GameCtx, GameEngine, Result } from './types.js';
import { rankPoints } from './util.js';

const START_LEVELS = 18;
const MAX_PULLS = 40; // 成功抽出这么多块后塔还没倒，大家都算赢
const LOCKED_TOP = 2; // 最上面两层不能抽

/** 一层里三块积木的横向位置（沿这一层的“并排方向”，单位：一块积木的宽度） */
const SLOT_X = [-1, 0, 1];
/** 一块积木的半宽：支撑区域 = 这一层剩下的积木最左边缘到最右边缘 */
const HALF = 0.5;

const SIGMA_BASE = 0.03; // 平时塔的微小晃动
const SIGMA_PULL_BASE = 0.05; // 抽积木时手带来的晃动（不压重量时）
const SIGMA_PER_LOAD = 0.01; // 这块积木上压着的重量越大（单位：积木块数），越难抽、晃得越厉害
const LEAN_STEP = 0.5; // 每次抽积木给塔留下的整体歪斜（相对晃动大小的比例）
const LEAN_DECAY = 0.85; // 玩家会把塔扶正一点

/** 误差函数的补函数（Abramowitz–Stegun 近似，精度足够） */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

const mass = (row: boolean[]) => row.filter(Boolean).length;
const meanOffset = (row: boolean[]) => {
  const n = mass(row);
  return n ? row.reduce((s, has, i) => s + (has ? SLOT_X[i] : 0), 0) / n : 0;
};

/**
 * 塔的受力分析（简化版）。叠叠高每一层的积木和上下层互相垂直，所以：
 *  - 第 k 层的积木并排在某个方向上，它上面所有的积木（重量）压在它们上；
 *  - 垂直于它的那些层，每块积木都横跨整层，重心总在正中间；
 *  - 和它平行的层（隔一层的），重心偏不偏，取决于那一层缺了哪几块。
 * 所以第 k 层承受的“上方重心位置” = 同方向各层的重心偏移，按重量平均，再加上塔整体的歪斜（lean）。
 * 只要这个重心还落在这一层剩下的积木撑起的范围里，塔就不倒；离边缘越近（余量越小），一晃就倒。
 * 返回每一层的“余量”（单位：积木宽度）：负数 = 重心已经落到支撑范围外，塔必倒。最上面一层上面没有东西，余量无限大。
 */
export function margins(levels: boolean[][], lean: [number, number]): number[] {
  const top = levels.length - 1;
  const out: number[] = [];
  for (let k = 0; k <= top; k++) {
    let above = 0;
    let shift = 0;
    for (let j = k + 1; j <= top; j++) {
      const m = mass(levels[j]);
      above += m;
      if ((j - k) % 2 === 0) shift += m * meanOffset(levels[j]);
    }
    if (above === 0) {
      out.push(Infinity);
      continue;
    }
    const xs = levels[k].map((has, i) => (has ? SLOT_X[i] : null)).filter((x): x is number => x !== null);
    if (xs.length === 0) {
      out.push(-1);
      continue;
    }
    const x = shift / above + lean[k % 2];
    out.push(Math.min(x - (Math.min(...xs) - HALF), Math.max(...xs) + HALF - x));
  }
  return out;
}

/**
 * 叠叠高（Jenga）：18 层积木，每层 3 块。轮流抽出一块（最上面两层不能抽），抽出的积木放到塔顶。
 * 塔倒不倒由受力决定，不是掷骰子：每层剩下的积木撑起一个范围，上面所有积木的重心要落在这个范围里；
 * 抽积木时手会带动塔，越下面、压得越重的积木越难抽、塔晃得越厉害。晃动超过“余量”塔就倒。
 * 屏幕上每块积木的百分数 = 抽它之后塔倒的概率（由余量和晃动算出来）；抽走一层的边上积木、
 * 把一层抽到只剩一块，都会让余量急剧变小。
 * 抽倒塔的人输（0 分），其他人按成功抽出的块数排名。抽满 40 块塔还没倒则所有人按块数排名。
 */
export class JengaGame implements GameEngine {
  private ids: string[];
  private levels: boolean[][] = Array.from({ length: START_LEVELS }, () => [true, true, true]);
  private lean: [number, number] = [0, 0];
  private turn: number;
  private pulls: Record<string, number> = {};
  private total = 0;
  private collapsedBy: string | null = null;
  private collapseLevel = -1;
  private log: string[] = [];
  private nameOf: Record<string, string> = {};
  private done = false;

  constructor(ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    for (const p of ctx.players) {
      this.pulls[p.id] = 0;
      this.nameOf[p.id] = p.nickname;
    }
    this.turn = ctx.rotation % this.ids.length;
  }

  private get current() {
    return this.ids[this.turn];
  }
  private get topIndex() {
    return this.levels.length - 1;
  }
  private say(s: string) {
    this.log.push(s);
    if (this.log.length > 8) this.log.shift();
  }

  /** 这一块能不能抽 */
  private canPull(level: number, slot: number) {
    return level >= 0 && level <= this.topIndex - LOCKED_TOP && this.levels[level]?.[slot] === true && mass(this.levels[level]) >= 2;
  }

  /** 抽出的积木放到塔顶：顶层没放满就补上，放满了就新开一层。先放中间，再左右轮流，尽量不让塔偏 */
  private static place(levels: boolean[][], total: number): boolean[][] {
    const out = levels.map((r) => r.slice());
    const top = out[out.length - 1];
    if (top.every(Boolean)) out.push([false, true, false]);
    else if (!top[1]) top[1] = true;
    else if (!top[0] && !top[2]) top[total % 2 ? 0 : 2] = true;
    else top[top.indexOf(false)] = true;
    return out;
  }

  /** 这块积木上压着多少重量（按积木块数算）：这一层的重量由剩下的积木分担，离上方重心越近的承担越多 */
  private load(level: number, slot: number): number {
    const row = this.levels[level];
    let above = 0;
    let shift = 0;
    for (let j = level + 1; j <= this.topIndex; j++) {
      const m = mass(this.levels[j]);
      above += m;
      if ((j - level) % 2 === 0) shift += m * meanOffset(this.levels[j]);
    }
    if (!above) return 0;
    const cm = shift / above + this.lean[level % 2];
    const w = row.map((has, i) => (has ? Math.max(0.15, 1 - 0.5 * Math.abs(SLOT_X[i] - cm)) : 0));
    return above * (w[slot] / w.reduce((s, x) => s + x, 0));
  }

  /** 抽这一块之后塔倒的概率，以及此时最薄弱的一层 */
  private evaluate(level: number, slot: number): { risk: number; weakest: number; margin: number } {
    const after = this.levels.map((r) => r.slice());
    after[level][slot] = false;
    const placed = JengaGame.place(after, this.total + 1);
    const m = margins(placed, this.lean);
    let weakest = 0;
    for (let k = 0; k < m.length; k++) if (m[k] < m[weakest]) weakest = k;
    if (m[weakest] < 0) return { risk: 1, weakest, margin: m[weakest] };
    const sigmaPull = Math.hypot(SIGMA_BASE, SIGMA_PULL_BASE + SIGMA_PER_LOAD * this.load(level, slot));
    let stay = 1;
    for (let k = 0; k < m.length; k++) {
      if (!Number.isFinite(m[k])) continue;
      const sigma = k === level ? sigmaPull : SIGMA_BASE;
      stay *= 1 - erfc(m[k] / (sigma * Math.SQRT2));
    }
    return { risk: Math.min(0.999, Math.max(0, 1 - stay)), weakest, margin: m[weakest] };
  }

  /** 公开给测试：当前塔的整体余量 */
  stability() {
    const m = margins(this.levels, this.lean);
    return Math.min(...m.slice(0, -1));
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    if (this.done) return { ok: false, error: '游戏已经结束' };
    if (pid !== this.current) return { ok: false, error: '还没轮到你' };
    if (a?.type !== 'pull') return { ok: false, error: '未知操作' };
    if (!Number.isInteger(a.level) || !Number.isInteger(a.slot) || !this.canPull(a.level, a.slot)) {
      return { ok: false, error: '这一块不能抽（最上面两层、已经抽走的、或者这层只剩一块的都不行）' };
    }
    this.pull(pid, a.level, a.slot);
    return { ok: true };
  }

  private fmt(r: number) {
    return r >= 0.1 ? Math.round(r * 100) : Math.round(r * 1000) / 10;
  }

  private pull(pid: string, level: number, slot: number) {
    const ev = this.evaluate(level, slot);
    const name = this.nameOf[pid];
    if (Math.random() < ev.risk) {
      this.collapsedBy = pid;
      this.collapseLevel = ev.weakest;
      this.done = true;
      this.say(`💥 ${name} 抽第 ${level + 1} 层的积木时，塔倒了！（风险 ${this.fmt(ev.risk)}%，最先撑不住的是第 ${ev.weakest + 1} 层）`);
      return;
    }
    // 成功抽出：积木放到塔顶；手的晃动给塔留下一点歪斜，之后玩家会把它扶正一些
    const sigmaPull = SIGMA_PULL_BASE + SIGMA_PER_LOAD * this.load(level, slot);
    const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
    this.levels[level][slot] = false;
    this.levels = JengaGame.place(this.levels, this.total + 1);
    const axis = level % 2;
    this.lean[axis] = (this.lean[axis] + gauss() * sigmaPull * LEAN_STEP) * LEAN_DECAY;
    this.lean[1 - axis] *= LEAN_DECAY;
    this.pulls[pid]++;
    this.total++;
    this.say(`${name} 抽出第 ${level + 1} 层的一块，塔还稳稳地立着（风险 ${this.fmt(ev.risk)}%）。`);
    if (this.total >= MAX_PULLS) {
      this.done = true;
      this.say('🎉 塔抽了这么多块还没倒，大家都是高手！');
      return;
    }
    this.turn = (this.turn + 1) % this.ids.length;
  }

  /** 轮到的玩家长时间不动：替他抽风险最小的一块 */
  onIdle() {
    if (this.done) return;
    let best: [number, number, number] | null = null;
    for (let l = 0; l <= this.topIndex - LOCKED_TOP; l++) {
      for (let s = 0; s < 3; s++) {
        if (!this.canPull(l, s)) continue;
        const r = this.evaluate(l, s).risk;
        if (!best || r < best[2]) best = [l, s, r];
      }
    }
    if (best) this.pull(this.current, best[0], best[1]);
    else {
      this.done = true; // 没有能抽的了，塔稳稳立着
    }
  }

  viewFor(_pid: string) {
    const m = margins(this.levels, this.lean);
    const body = m.slice(0, -1);
    const minMargin = body.length ? Math.min(...body) : 99;
    return {
      game: 'jenga',
      levels: this.levels,
      locked: LOCKED_TOP,
      // 每块积木抽走后塔倒的概率（%，小的保留一位小数）
      risk: this.levels.map((row, l) => row.map((_, s) => (this.canPull(l, s) ? this.fmt(this.evaluate(l, s).risk) : null))),
      // 每一层的余量（积木宽度）：越小越危险；最上面几层没有东西压着，显示为 null
      margin: m.map((x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null)),
      stability: Math.max(0, Math.min(100, Math.round((minMargin / 1.5) * 100))),
      weakest: body.length ? body.indexOf(minMargin) : -1,
      lean: [Math.round(this.lean[0] * 100) / 100, Math.round(this.lean[1] * 100) / 100],
      turnId: this.done ? null : this.current,
      pulls: this.pulls,
      total: this.total,
      maxPulls: MAX_PULLS,
      collapsedBy: this.collapsedBy,
      collapseLevel: this.collapseLevel,
      log: this.log,
      over: this.done,
    };
  }

  isOver() {
    return this.done;
  }

  scores(): Record<string, number> {
    const pts = Object.fromEntries(this.ids.map((id) => [id, id === this.collapsedBy ? -1 : this.pulls[id]]));
    return Object.fromEntries(rankPoints(pts, this.ids).map((r) => [r.id, r.bonus]));
  }

  dispose() {}
}
