// 保龄球 / 投篮机的精准度与延迟补偿单元测试。运行：npx tsx server/test/precision.unit.ts
import assert from 'node:assert/strict';
import { Meter, compensation, COMP_MAX_MS } from '../src/games/meter.js';
import { GUTTER_ERR, STRIKE_ERR, hitFraction, knockPins, scoreFrames } from '../src/games/bowling.js';
import { shotResult } from '../src/games/basketball.js';

let n = 0;
const ok = (m: string) => console.log(`  ✓ ${++n}. ${m}`);
const all = Array(10).fill(true) as boolean[];

// ───── 力度条与延迟补偿 ─────
{
  const m = new Meter(1000) as any;
  m.start = 10_000;
  // 三角波：0 → 1 → 0；0.5 是正中间的最佳位置
  assert.equal(m.pos(10_000), 0);
  assert.equal(m.pos(10_250), 0.5);
  assert.equal(m.pos(10_500), 1);
  assert.equal(m.pos(10_750), 0.5);
  assert.equal(m.pos(11_000), 0);
  assert.equal(m.pos(9_000), 0, '开始之前不会出现负数时间');
  ok('力度条：三角波，1000 毫秒一个周期，250 / 750 毫秒时在正中间');

  // 延迟补偿：玩家在屏幕上看到指针在正中间（真实时间 10_250）点击，点击 80 毫秒后才到服务器
  const arrival = 10_250 + 80;
  assert.notEqual(m.pos(arrival), 0.5, '不补偿的话，判定位置会偏掉');
  const t = m.tap(80, arrival);
  assert.equal(t.comp, 80);
  assert.equal(t.pos, 0.5, '补偿一个往返延迟之后，判定的就是玩家点下去时看到的位置');
  assert.equal(compensation(0), 0);
  assert.equal(compensation(undefined), 0);
  assert.equal(compensation(-5), 0);
  assert.equal(compensation(120.4), 120);
  assert.equal(compensation(99_999), COMP_MAX_MS, '补偿量有上限，不能靠谎报延迟作弊');
  ok(`延迟补偿：往返 80 毫秒的玩家，判定回到他点击那一刻的位置；补偿上限 ${COMP_MAX_MS} 毫秒，负数和缺失按 0`);
}

// ───── 保龄球：精准度 → 击倒数量 ─────
{
  assert.equal(hitFraction(0), 1);
  assert.equal(hitFraction(STRIKE_ERR), 1);
  assert.equal(hitFraction(GUTTER_ERR), 0);
  assert.equal(hitFraction(0.5), 0);
  let prev = 1;
  for (let e = STRIKE_ERR; e <= GUTTER_ERR; e += 0.01) {
    const f = hitFraction(e);
    assert.ok(f <= prev + 1e-9 && f >= 0 && f <= 1, '偏得越远，击倒比例越小（单调不增）');
    prev = f;
  }
  ok(`击倒比例：偏差 ≤ ${STRIKE_ERR} 全倒，≥ ${GUTTER_ERR} 一个不倒，中间平滑下降`);

  // 正中全倒；每次都是确定的，不靠运气
  for (let i = 0; i < 200; i++) assert.equal(knockPins(all, 0.5).length, 10);
  for (let i = 0; i < 200; i++) assert.equal(knockPins(all, 0.5 + STRIKE_ERR * 0.9).length, 10);
  assert.deepEqual(knockPins(all, 0.5 + GUTTER_ERR + 0.01), []);
  assert.deepEqual(knockPins(all, 0.02), []);
  assert.deepEqual(knockPins(all, null), [], '超时 = 脱靶');
  ok('指针在正中间：每次都是全中（不再有“明明点准了还留一个”）；偏太多或超时：一个都不倒');

  // 数量随偏差变小：统计 2000 次的平均
  const avg = (pos: number) => Array.from({ length: 2000 }, () => knockPins(all, pos).length).reduce((a, b) => a + b, 0) / 2000;
  const a1 = avg(0.5 + 0.12);
  const a2 = avg(0.5 + 0.18);
  const a3 = avg(0.5 + 0.25);
  assert.ok(a1 > a2 && a2 > a3 && a3 > 0, `平均击倒数应该随偏差变小：${a1.toFixed(1)} > ${a2.toFixed(1)} > ${a3.toFixed(1)}`);
  assert.ok(a1 >= 6 && a1 <= 9.5, '稍微偏一点还能打倒大部分：' + a1.toFixed(1));
  ok(`偏差 0.12 / 0.18 / 0.25 时平均击倒 ${a1.toFixed(1)} / ${a2.toFixed(1)} / ${a3.toFixed(1)} 个`);

  // 球走哪边，倒哪边：指针偏左 → 左边的球瓶（6、7 号）更容易倒；偏右 → 右边（8、9 号）
  const freq = (pos: number) => {
    const c = Array(10).fill(0);
    for (let i = 0; i < 3000; i++) for (const k of knockPins(all, pos)) c[k]++;
    return c;
  };
  const left = freq(0.5 - 0.17);
  const right = freq(0.5 + 0.17);
  assert.ok(left[6] > left[9] * 2, `偏左时左后角的瓶比右后角的更容易倒：${left[6]} vs ${left[9]}`);
  assert.ok(right[9] > right[6] * 2, `偏右时右后角的瓶更容易倒：${right[9]} vs ${right[6]}`);
  ok('球走哪边就倒哪边：指针偏左时左边的球瓶更容易倒，偏右时右边的更容易倒');

  // 只会打倒还立着的球瓶，不会重复
  const standing = all.map((_, i) => i % 2 === 0);
  for (let i = 0; i < 300; i++) {
    const down = knockPins(standing, 0.5 + 0.1);
    assert.ok(down.every((k) => standing[k]));
    assert.equal(new Set(down).size, down.length);
  }
  assert.deepEqual(knockPins(all.map(() => false), 0.5), []);
  ok('只会打倒还立着的球瓶，一个球瓶不会倒两次');

  // 计分没变：全中 12 次 = 300
  assert.equal(scoreFrames(Array(12).fill(10)).total, 300);
  ok('标准计分不变（12 次全中 = 300 分）');
}

// ───── 投篮机：判定与“差一点” ─────
{
  const shot = { pts: 3, w: 0.1 };
  assert.deepEqual(shotResult(0, shot), { made: true, swish: true, close: false, gain: 4 });
  assert.deepEqual(shotResult(0.04, shot), { made: true, swish: true, close: false, gain: 4 });
  assert.deepEqual(shotResult(0.05, shot), { made: true, swish: false, close: false, gain: 3 });
  assert.deepEqual(shotResult(0.1, shot), { made: true, swish: false, close: false, gain: 3 });
  assert.deepEqual(shotResult(0.11, shot), { made: false, swish: false, close: true, gain: 0 });
  assert.deepEqual(shotResult(0.125, shot), { made: false, swish: false, close: true, gain: 0 });
  assert.deepEqual(shotResult(0.2, shot), { made: false, swish: false, close: false, gain: 0 });
  ok('投篮：绿区正中 40% 内空心球 +1，绿区内得分，擦出边缘 25% 内提示“差一点”，更偏就是没进');
}

console.log(`\n全部 ${n} 项通过`);
