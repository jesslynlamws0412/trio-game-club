// 大富翁规则单元测试（直接操作游戏引擎，强制构造建造/租金/破产场景）。运行：npx tsx server/test/monopoly.unit.ts
import assert from 'node:assert/strict';
import { MonopolyGame } from '../src/games/monopoly.js';

const players = [
  { id: 'a', nickname: 'A' },
  { id: 'b', nickname: 'B' },
  { id: 'c', nickname: 'C' },
];
const mk = () => new MonopolyGame({ players, rotation: 0, notify: () => {} }) as any;
let n = 0;
const ok = (m: string) => console.log(`  ✓ ${++n}. ${m}`);

// 1. 建造规则与租金
{
  const g = mk();
  g.owner[1] = 'a';
  assert.equal(g.handleAction('a', { type: 'build', tile: 1 }).ok, false);
  ok('只拥有一块地不能建造');
  g.owner[2] = 'a';
  assert.equal(g.rent(1), 120, '整组空地租金翻倍：600 * 0.1 * 2');
  assert.ok(g.handleAction('a', { type: 'build', tile: 1 }).ok);
  assert.equal(g.ps[0].cash, 15000 - 300);
  assert.equal(g.handleAction('a', { type: 'build', tile: 1 }).ok, false);
  ok('均匀建造：同色另一块没升级前不能继续升同一块');
  assert.ok(g.handleAction('a', { type: 'build', tile: 2 }).ok);
  assert.equal(g.rent(1), 180);
  for (let i = 0; i < 3; i++) {
    g.handleAction('a', { type: 'build', tile: 1 });
    g.handleAction('a', { type: 'build', tile: 2 });
  }
  assert.equal(g.level[1], 4);
  assert.equal(g.handleAction('a', { type: 'build', tile: 1 }).ok, false);
  assert.equal(g.rent(1), 960);
  ok('升到酒店后租金 = 地价 × 1.6，不能再升');
  assert.ok(g.handleAction('a', { type: 'sell', tile: 1 }).ok);
  assert.equal(g.level[1], 3);
  assert.equal(g.handleAction('a', { type: 'sell', tile: 2 }).ok, true);
  ok('可以变卖建筑（半价）');
}

// 2. 收租与破产
{
  const g = mk();
  g.owner[25] = 'a';
  g.owner[26] = 'a';
  g.level[25] = 4;
  g.level[26] = 4;
  const b = g.ps[1];
  b.cash = 100;
  b.pos = 25;
  g.land(b);
  assert.equal(b.bankrupt, true);
  assert.equal(g.ps[0].cash, 15000 + 100);
  assert.ok(g.owner.every((o: string | null) => o !== 'b'));
  ok('欠租付不起 → 破产，剩余现金归债权人');
  assert.equal(g.phase === 'over', false);
  g.turn = 1; // 当前恰好是破产者：自动轮换到下一位
  g.phase = 'manage';
  g.handleAction('b', { type: 'end' });
  g.nextTurn();
  assert.equal(g.ps[g.turn].bankrupt, false);
  ok('破产玩家被跳过');
}

// 3. 先变卖建筑再付款，最后一人胜出时结束
{
  const g = mk();
  g.owner[25] = 'a';
  g.owner[26] = 'a';
  g.level[25] = 4;
  g.level[26] = 4;
  g.owner[1] = 'b';
  g.owner[2] = 'b';
  g.level[1] = 2;
  const b = g.ps[1];
  b.cash = 900; // 租金 4320，卖掉 2 级建筑只能凑到 900 + 300 = 1200 → 破产
  b.pos = 25;
  g.land(b);
  assert.equal(b.bankrupt, true);
  ok('现金不足先变卖建筑，仍不足才破产');
  const c = g.ps[2];
  c.cash = 50;
  c.pos = 25;
  g.land(c);
  assert.equal(g.phase, 'over');
  assert.deepEqual(g.final.ranking.map((r: any) => r.id), ['a', 'c', 'b']);
  assert.deepEqual(g.scores(), { a: 3, c: 2, b: 1 });
  ok('只剩一人时游戏结束，后破产者名次更高');
}

// 4. 监狱
{
  const g = mk();
  const a = g.ps[0];
  a.pos = 21;
  g.land(a);
  assert.equal(a.pos, 7);
  assert.equal(a.inJail, true);
  g.phase = 'roll';
  a.cash = 400;
  assert.equal(g.handleAction('a', { type: 'payjail' }).ok, false);
  a.cash = 1000;
  assert.ok(g.handleAction('a', { type: 'payjail' }).ok);
  assert.equal(a.cash, 500);
  assert.equal(a.inJail, false);
  ok('入狱格送进监狱；现金够才能保释');
}

console.log(`\n全部 ${n} 项通过`);

