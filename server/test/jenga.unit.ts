// 叠叠高受力模型单元测试（直接操作引擎，指定积木的位置）。运行：npx tsx server/test/jenga.unit.ts
import assert from 'node:assert/strict';
import { JengaGame, erfc, margins } from '../src/games/jenga.js';

let n = 0;
const ok = (m: string) => console.log(`  ✓ ${++n}. ${m}`);
const players = [
  { id: 'a', nickname: 'A' },
  { id: 'b', nickname: 'B' },
];
const mk = () => new JengaGame({ players, rotation: 0, notify: () => {} }) as any;
const full = (levels: number) => Array.from({ length: levels }, () => [true, true, true]);

// ───── 数学工具 ─────
{
  assert.ok(Math.abs(erfc(0) - 1) < 1e-6);
  assert.ok(Math.abs(erfc(1) - 0.1573) < 1e-3);
  assert.ok(Math.abs(erfc(2) - 0.00468) < 1e-4);
  assert.ok(erfc(-1) > 1.8);
  ok('误差函数 erfc 数值正确');
}

// ───── 受力余量 ─────
{
  const m = margins(full(10), [0, 0]);
  // 完整的塔：每一层都撑得住，下面的层余量最大 ≈ 1.5（重心在正中，支撑范围 ±1.5）
  assert.ok(m.slice(0, -1).every((x) => Math.abs(x - 1.5) < 1e-9), '完整的塔每层余量都是 1.5');
  assert.equal(m[9], Infinity, '最上面一层上面没有东西');
  ok('完整的塔：每一层的余量都是 1.5 个积木宽度');

  // 第 3 层只剩中间一块：支撑范围 ±0.5，余量 0.5
  const t = full(10);
  t[3] = [false, true, false];
  assert.ok(Math.abs(margins(t, [0, 0])[3] - 0.5) < 1e-9);
  // 只剩一边：重心（正中）在支撑范围外，余量为负 → 必倒
  const u = full(10);
  u[3] = [true, false, false];
  assert.ok(margins(u, [0, 0])[3] < 0);
  // 抽掉中间留两边：支撑范围不变（±1.5）
  const v = full(10);
  v[3] = [true, false, true];
  assert.ok(Math.abs(margins(v, [0, 0])[3] - 1.5) < 1e-9);
  ok('一层只剩中间：余量 0.5；只剩一边：重心落到范围外（负数，必倒）；抽掉中间留两边：范围不变');

  // 平行层的缺口会让重心偏：第 5 层（和第 3 层同方向）只剩左边两块，第 3 层的余量变小
  const w = full(10);
  w[5] = [true, true, false];
  const base = margins(full(10), [0, 0])[3];
  const shifted = margins(w, [0, 0])[3];
  assert.ok(shifted < base, '上面平行的层缺一边，下面这一层的余量变小');
  // 垂直的层（第 4 层）缺一边：不影响第 3 层（重心仍在正中）
  const x = full(10);
  x[4] = [true, true, false];
  assert.ok(Math.abs(margins(x, [0, 0])[3] - base) < 1e-9, '垂直方向的层缺块不影响这一层');
  ok('同方向的上层缺一边会让下层余量变小；垂直方向的层缺块不影响');

  // 整体歪斜（lean）直接吃掉余量
  const lean = margins(full(10), [0, 0.4])[3];
  assert.ok(Math.abs(lean - (1.5 - 0.4)) < 1e-9);
  ok('塔整体歪斜 0.4，同方向各层的余量少 0.4');
}

// ───── 抽积木的风险 ─────
{
  const g = mk();
  const rMid = g.evaluate(0, 1).risk;
  const rSide = g.evaluate(0, 0).risk;
  assert.ok(rMid < 0.001 && rSide < 0.05, `完整的塔上抽一块几乎没风险：${rMid} / ${rSide}`);
  assert.ok(rMid <= rSide, '抽中间比抽边上更稳');

  // 越靠下压得越重 → 同样的块更难抽、风险更大
  g.levels[2][0] = false; // 先让第 2 层缺一块，后面比较抽它的邻居
  const low = g.evaluate(2, 2).risk; // 这层只剩中间会很危险
  assert.ok(low > 0.005 && low > rSide * 2, '把一层抽到只剩中间一块（余量只剩 0.5），风险明显升高：' + low);

  // 抽到会让重心落到范围外：风险 = 100%
  g.levels[4] = [true, true, false];
  assert.equal(g.evaluate(4, 1).risk, 1, '把一层抽到只剩一个边上的块：必倒');
  ok(`风险：完整的塔抽中间 ${(rMid * 100).toFixed(4)}%、抽边上 ${(rSide * 100).toFixed(2)}%；抽到只剩中间 ${(low * 100).toFixed(0)}%；抽到只剩边上 100%`);

  // 重量：同一层，上面压得越多越难抽
  const h = mk();
  const bottom = h.load(0, 1);
  const midTower = h.load(9, 1);
  assert.ok(bottom > midTower * 2, `最底层的积木承重更大：${bottom.toFixed(1)} vs ${midTower.toFixed(1)}`);
  ok(`承重：最底层的积木承受 ${bottom.toFixed(1)} 块的重量，第 10 层只承受 ${midTower.toFixed(1)} 块`);
}

// ───── 规则 ─────
{
  const g = mk();
  assert.equal(g.handleAction('b', { type: 'pull', level: 0, slot: 0 }).ok, false, '还没轮到');
  assert.equal(g.handleAction('a', { type: 'pull', level: 17, slot: 0 }).ok, false, '最上面两层不能抽');
  assert.equal(g.handleAction('a', { type: 'pull', level: 16, slot: 0 }).ok, false);
  assert.equal(g.handleAction('a', { type: 'pull', level: 0, slot: 9 }).ok, false);
  assert.equal(g.handleAction('a', { type: 'nope' }).ok, false);
  const real = Math.random;
  Math.random = () => 0.9999; // 不倒
  try {
    assert.ok(g.handleAction('a', { type: 'pull', level: 0, slot: 1 }).ok);
    assert.equal(g.total, 1);
    assert.equal(g.levels.flat().filter(Boolean).length, 54, '抽出的积木放到塔顶，总数不变');
    assert.deepEqual(g.levels[18], [false, true, false], '新开一层，先放在正中间');
    assert.equal(g.current, 'b');
    g.pull('b', 0, 0);
    g.pull('a', 1, 1);
    assert.equal(g.levels[18].filter(Boolean).length, 3, '顶层放满三块');
  } finally {
    Math.random = real;
  }
  ok('只有轮到的人能抽；最上面两层、越界、未知操作被拒绝；抽出的积木放到塔顶（先中间，再两边）');

  // 必倒的抽法：塔一定会倒，抽的人输
  const h = mk();
  h.levels[5] = [true, true, false];
  h.levels[6] = [true, true, true];
  const real2 = Math.random;
  Math.random = () => 0.0;
  try {
    assert.ok(h.handleAction('a', { type: 'pull', level: 5, slot: 1 }).ok);
  } finally {
    Math.random = real2;
  }
  assert.equal(h.done, true);
  assert.equal(h.collapsedBy, 'a');
  assert.equal(h.collapseLevel, 5, '最先撑不住的是被抽的这一层');
  const sc = h.scores();
  assert.ok(sc.b > sc.a, '抽倒塔的人排最后');
  ok('抽到只剩边上一块 → 塔倒，抽的人排最后，并说明是哪一层先撑不住');
}

// ───── 视图 ─────
{
  const g = mk();
  const v = g.viewFor('a');
  assert.equal(v.stability, 100);
  assert.equal(v.margin.length, 18);
  assert.equal(v.margin[17], null);
  assert.equal(v.risk[17][0], null);
  assert.ok(v.risk[0].every((r: number | null) => typeof r === 'number'));
  assert.equal(v.levels.length, 18);
  g.levels[3] = [false, true, false];
  const w = g.viewFor('a');
  assert.equal(w.weakest, 3);
  assert.ok(w.stability < 50, '有一层只剩中间，整体稳定度大幅下降：' + w.stability);
  ok(`视图：完整的塔稳定度 100%；一层只剩中间后稳定度 ${w.stability}%，最薄弱的是第 4 层`);
}

// ───── 自动代抽 ─────
{
  const g = mk();
  const real = Math.random;
  Math.random = () => 0.9999;
  try {
    for (let i = 0; i < 10; i++) g.onIdle();
  } finally {
    Math.random = real;
  }
  assert.equal(g.total, 10);
  assert.ok(g.stability() > 0.4, '自动代抽选风险最小的块，塔仍然稳：' + g.stability());
  ok('长时间不动：系统替他抽风险最小的一块，连抽 10 块塔依然很稳');
}

console.log(`\n全部 ${n} 项通过`);
