import type { GameCtx, GameEngine, Result } from './types.js';
import { rankPoints } from './util.js';

const START_LEVELS = 18;
const MAX_PULLS = 40; // 成功抽出这么多块后塔还没倒，大家都算赢
const LOCKED_TOP = 2; // 最上面两层不能抽

/**
 * 叠叠高（Jenga）：18 层积木，每层 3 块。轮流抽出一块（最上面两层不能抽），抽出的积木放到塔顶。
 * 每次抽积木都有“塔倒”的风险（会显示百分比）：抽得越多越危险；越靠下越危险；
 * 一层只剩 1~2 块时再抽它们最危险（尤其是把中间的抽走、或留下一块在边上）。
 * 抽倒塔的人输（0 分），其他人按成功抽出的块数排名。抽满 40 块塔还没倒则所有人按块数排名。
 */
export class JengaGame implements GameEngine {
  private ids: string[];
  private levels: boolean[][] = Array.from({ length: START_LEVELS }, () => [true, true, true]);
  private turn: number;
  private pulls: Record<string, number> = {};
  private total = 0;
  private collapsedBy: string | null = null;
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
    return level >= 0 && level <= this.topIndex - LOCKED_TOP && this.levels[level]?.[slot] === true && this.levels[level].filter(Boolean).length >= 2;
  }

  /** 抽这一块时塔倒的概率 */
  private risk(level: number, slot: number): number {
    const row = this.levels[level];
    const left = row.filter(Boolean).length - 1; // 抽走之后这层剩几块
    let f = 1;
    if (left === 2) f = slot === 1 ? 0.8 : 1; // 抽走中间留下两边，比较稳
    else if (left === 1) f = row[1] && slot !== 1 ? 2.5 : 4; // 只剩中间 / 只剩一边，很危险
    const heavy = 0.6 + 0.8 * (1 - level / Math.max(1, this.topIndex)); // 越靠下承重越大
    const base = 0.015 + 0.012 * this.total;
    return Math.min(0.95, Math.max(0.01, base * f * heavy));
  }

  private stack() {
    // 抽出的积木放到塔顶：顶层没放满就补上，放满了就新开一层
    const top = this.levels[this.topIndex];
    if (top.every(Boolean)) this.levels.push([true, false, false]);
    else top[top.indexOf(false)] = true;
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

  private pull(pid: string, level: number, slot: number) {
    const r = this.risk(level, slot);
    const name = this.nameOf[pid];
    if (Math.random() < r) {
      this.collapsedBy = pid;
      this.done = true;
      this.say(`💥 ${name} 抽第 ${level + 1} 层的积木时，塔倒了！（风险 ${Math.round(r * 100)}%）`);
      return;
    }
    this.levels[level][slot] = false;
    this.stack();
    this.pulls[pid]++;
    this.total++;
    this.say(`${name} 抽出第 ${level + 1} 层的一块，塔还稳稳地立着（风险 ${Math.round(r * 100)}%）。`);
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
        const r = this.risk(l, s);
        if (!best || r < best[2]) best = [l, s, r];
      }
    }
    if (best) this.pull(this.current, best[0], best[1]);
    else {
      this.done = true; // 没有能抽的了，塔稳稳立着
    }
  }

  viewFor(_pid: string) {
    return {
      game: 'jenga',
      levels: this.levels,
      locked: LOCKED_TOP,
      risk: this.levels.map((row, l) => row.map((has, s) => (this.canPull(l, s) ? Math.round(this.risk(l, s) * 100) : null))),
      turnId: this.done ? null : this.current,
      pulls: this.pulls,
      total: this.total,
      maxPulls: MAX_PULLS,
      collapsedBy: this.collapsedBy,
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
