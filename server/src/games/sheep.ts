import type { GameCtx, GameEngine, Result } from './types.js';
import { rankPoints, shuffle } from './util.js';

const TYPES = ['🐑', '🌽', '🥕', '🍎', '🌿', '🔥', '🪵', '🧶'];
const PER_TYPE = 9; // 每种 9 块 = 3 组
const TRAY = 7;

interface Tile {
  id: number;
  x: number; // 半格单位：一块牌宽 2
  y: number;
  z: number;
}

/** 生成三层叠起来的牌堆：第 0、2 层在偶数格，第 1 层偏移半块，所以会互相压住 */
function layout(): Tile[] {
  const spots = (z: number) => {
    const out: [number, number][] = [];
    const start = z === 1 ? 1 : 0;
    const end = z === 1 ? 11 : 12;
    for (let x = start; x <= end; x += 2) for (let y = start; y <= end; y += 2) out.push([x, y]);
    return shuffle(out);
  };
  const counts = [30, 22, 20];
  const tiles: Tile[] = [];
  let id = 0;
  counts.forEach((n, z) => {
    for (const [x, y] of spots(z).slice(0, n)) tiles.push({ id: id++, x, y, z });
  });
  return tiles; // 72 块
}

interface Player {
  removed: Set<number>;
  types: Map<number, string>; // 每个人的牌面可以被“洗牌”改变，所以各自保存
  tray: { id: number; type: string }[];
  history: { id: number; type: string; cleared: boolean }[];
  cleared: number; // 已消除的牌数（含托盘里消掉的）
  lost: boolean;
  won: boolean;
  power: { undo: boolean; shuffle: boolean; remove: boolean };
}

/**
 * 羊了个羊：三层叠起来的 72 张牌，8 种图案各 9 张。点没有被压住的牌，牌会进入底部的 7 格托盘；
 * 托盘里有 3 张相同的就自动消除；托盘满了 7 张还没有消除，就失败。把所有牌消完就通关。
 * 每人一次道具：撤回上一步、洗牌（打乱场上剩余牌的图案）、移出托盘最前面的 3 张。
 * 多人时大家用同一个牌堆比赛：先通关的人获胜；都没通关则比谁消得多。每个人的牌堆互不影响。
 */
export class SheepGame implements GameEngine {
  private ids: string[];
  private tiles: Tile[];
  private baseTypes: string[];
  private ps: Record<string, Player> = {};
  private done = false;

  constructor(ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    this.tiles = layout();
    this.baseTypes = shuffle(TYPES.flatMap((t) => Array(PER_TYPE).fill(t)));
    for (const id of this.ids) {
      this.ps[id] = {
        removed: new Set(),
        types: new Map(this.tiles.map((t) => [t.id, this.baseTypes[t.id]])),
        tray: [],
        history: [],
        cleared: 0,
        lost: false,
        won: false,
        power: { undo: true, shuffle: true, remove: true },
      };
    }
  }

  private overlap(a: Tile, b: Tile) {
    return Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
  }

  private blocked(p: Player, t: Tile) {
    return this.tiles.some((o) => o.z > t.z && !p.removed.has(o.id) && this.overlap(o, t));
  }

  private finished(p: Player) {
    return p.won || p.lost;
  }

  private checkEnd() {
    if (this.ids.some((id) => this.ps[id].won) || this.ids.every((id) => this.finished(this.ps[id]))) this.done = true;
  }

  handleAction(pid: string, a: any): Result {
    const p = this.ps[pid];
    if (!p) return { ok: false, error: '你不在本局游戏中' };
    if (this.done) return { ok: false, error: '游戏已经结束' };
    if (this.finished(p)) return { ok: false, error: '你的这一局已经结束了' };
    switch (a?.type) {
      case 'pick': {
        const t = this.tiles.find((x) => x.id === a.tile);
        if (!t || p.removed.has(t.id)) return { ok: false, error: '这张牌不在场上' };
        if (this.blocked(p, t)) return { ok: false, error: '这张牌被压住了' };
        const type = p.types.get(t.id)!;
        p.removed.add(t.id);
        // 放到托盘里最后一张同图案的后面
        let at = p.tray.length;
        for (let i = p.tray.length - 1; i >= 0; i--) if (p.tray[i].type === type) { at = i + 1; break; }
        p.tray.splice(at, 0, { id: t.id, type });
        const same = p.tray.filter((x) => x.type === type);
        let cleared = false;
        if (same.length >= 3) {
          p.tray = p.tray.filter((x) => x.type !== type);
          p.cleared += 3;
          cleared = true;
        }
        p.history.push({ id: t.id, type, cleared });
        if (p.removed.size === this.tiles.length && p.tray.length === 0) p.won = true;
        else if (p.tray.length >= TRAY) p.lost = true;
        this.checkEnd();
        return { ok: true };
      }
      case 'undo': {
        if (!p.power.undo) return { ok: false, error: '撤回已经用过了' };
        const h = p.history[p.history.length - 1];
        if (!h) return { ok: false, error: '还没有可以撤回的步骤' };
        if (h.cleared) return { ok: false, error: '上一步消除了牌，不能撤回' };
        p.power.undo = false;
        p.history.pop();
        p.tray = p.tray.filter((x) => x.id !== h.id);
        p.removed.delete(h.id);
        return { ok: true };
      }
      case 'shuffle': {
        if (!p.power.shuffle) return { ok: false, error: '洗牌已经用过了' };
        p.power.shuffle = false;
        const left = this.tiles.filter((t) => !p.removed.has(t.id));
        const types = shuffle(left.map((t) => p.types.get(t.id)!));
        left.forEach((t, i) => p.types.set(t.id, types[i]));
        return { ok: true };
      }
      case 'remove': {
        if (!p.power.remove) return { ok: false, error: '移出已经用过了' };
        if (p.tray.length === 0) return { ok: false, error: '托盘里还没有牌' };
        p.power.remove = false;
        const n = Math.min(3, p.tray.length);
        p.tray.splice(0, n);
        p.cleared += n;
        p.history = [];
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知操作' };
    }
  }

  viewFor(pid: string) {
    const p = this.ps[pid];
    return {
      game: 'sheep',
      tiles: this.tiles
        .filter((t) => !p.removed.has(t.id))
        .map((t) => ({ id: t.id, x: t.x, y: t.y, z: t.z, type: p.types.get(t.id), blocked: this.blocked(p, t) })),
      tray: p.tray,
      trayMax: TRAY,
      power: p.power,
      total: this.tiles.length,
      cleared: p.cleared,
      lost: p.lost,
      won: p.won,
      progress: Object.fromEntries(this.ids.map((id) => [id, { cleared: this.ps[id].cleared, lost: this.ps[id].lost, won: this.ps[id].won, left: this.tiles.length - this.ps[id].removed.size + this.ps[id].tray.length }])),
      over: this.done,
    };
  }

  isOver() {
    return this.done;
  }

  scores(): Record<string, number> {
    if (this.ids.length === 1) return { [this.ids[0]]: this.ps[this.ids[0]].won ? 3 : 0 };
    const pts = Object.fromEntries(this.ids.map((id) => [id, (this.ps[id].won ? 1000 : 0) + this.ps[id].cleared]));
    return Object.fromEntries(rankPoints(pts, this.ids).map((r) => [r.id, r.bonus]));
  }

  dispose() {}
}
