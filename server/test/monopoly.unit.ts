// 大富翁规则单元测试（直接操作游戏引擎，强制构造建造/租金/抵押/破产/监狱/双数场景）。运行：npx tsx server/test/monopoly.unit.ts
import assert from 'node:assert/strict';
import { MonopolyGame } from '../src/games/monopoly.js';
import { BOARD, GROUP_COLORS } from '../src/data/board.js';

const players = [
  { id: 'a', nickname: 'A' },
  { id: 'b', nickname: 'B' },
  { id: 'c', nickname: 'C' },
];
const mk = () => new MonopolyGame({ players, rotation: 0, notify: () => {} }) as any;
let n = 0;
const ok = (m: string) => console.log(`  ✓ ${++n}. ${m}`);

// 0. 棋盘结构：40 格、8 个颜色组、4 个火车站、2 个公用事业
{
  assert.equal(BOARD.length, 40);
  assert.equal(BOARD.filter((t) => t.kind === 'rail').length, 4);
  assert.equal(BOARD.filter((t) => t.kind === 'util').length, 2);
  assert.equal(BOARD.filter((t) => t.kind === 'chance').length, 3);
  assert.equal(BOARD.filter((t) => t.kind === 'fate').length, 3);
  assert.equal(BOARD[10].kind, 'jail');
  assert.equal(BOARD[30].kind, 'gojail');
  const groups = new Set(BOARD.flatMap((t) => (t.kind === 'prop' ? [t.group] : [])));
  assert.equal(groups.size, 8);
  assert.equal(GROUP_COLORS.length, 8);
  assert.equal(BOARD.filter((t) => t.kind === 'prop').length, 22);
  ok('棋盘：40 格 / 22 块地产 / 8 个颜色组 / 4 个火车站 / 2 个公用事业 / 监狱 10、入狱 30');
}

// 1. 建造规则与租金
{
  const g = mk();
  g.owner[1] = 'a';
  assert.equal(g.handleAction('a', { type: 'build', tile: 1 }).ok, false);
  ok('只拥有同色组的一部分不能建造');
  g.owner[3] = 'a';
  assert.equal(g.rent(1), 4, '整组空地租金翻倍：2 × 2');
  assert.ok(g.handleAction('a', { type: 'build', tile: 1 }).ok);
  assert.equal(g.ps[0].cash, 1500 - 50);
  assert.equal(g.handleAction('a', { type: 'build', tile: 1 }).ok, false);
  ok('均匀建造：同色另一块没升级前不能继续升同一块');
  assert.ok(g.handleAction('a', { type: 'build', tile: 3 }).ok);
  assert.equal(g.rent(1), 10);
  for (let i = 0; i < 4; i++) {
    g.handleAction('a', { type: 'build', tile: 1 });
    g.handleAction('a', { type: 'build', tile: 3 });
  }
  assert.equal(g.level[1], 5);
  assert.equal(g.handleAction('a', { type: 'build', tile: 1 }).ok, false);
  assert.equal(g.rent(1), 250);
  ok('升到酒店（5 级）后租金按表计算，不能再升');
  assert.ok(g.handleAction('a', { type: 'sell', tile: 1 }).ok);
  assert.equal(g.level[1], 4);
  assert.equal(g.handleAction('a', { type: 'sell', tile: 1 }).ok, false, '要均匀变卖');
  assert.ok(g.handleAction('a', { type: 'sell', tile: 3 }).ok);
  ok('可以变卖建筑（半价），变卖也要均匀');
}
{
  const g = mk();
  g.owner[6] = 'a';
  g.owner[8] = 'a';
  assert.equal(g.handleAction('a', { type: 'build', tile: 6 }).ok, false);
  g.owner[9] = 'a';
  assert.ok(g.handleAction('a', { type: 'build', tile: 6 }).ok);
  ok('三块地的颜色组要集齐 3 块才能建造');
}

// 2. 火车站与公用事业租金
{
  const g = mk();
  g.owner[5] = 'a';
  assert.equal(g.rent(5), 25);
  g.owner[15] = 'a';
  assert.equal(g.rent(5), 50);
  g.owner[25] = 'a';
  g.owner[35] = 'a';
  assert.equal(g.rent(5), 200);
  g.owner[12] = 'a';
  assert.equal(g.rent(12, 8), 32, '一个公用事业：点数 × 4');
  g.owner[28] = 'a';
  assert.equal(g.rent(12, 8), 80, '两个公用事业：点数 × 10');
  ok('火车站租金 25/50/100/200；公用事业 4 倍 / 10 倍点数');
}

// 3. 收租与破产
{
  const g = mk();
  g.owner[37] = 'a';
  g.owner[39] = 'a';
  g.level[37] = 5;
  g.level[39] = 5;
  const b = g.ps[1];
  b.cash = 100;
  b.pos = 39;
  g.land(b);
  assert.equal(b.bankrupt, true);
  assert.equal(g.ps[0].cash, 1500 + 100);
  assert.ok(g.owner.every((o: string | null) => o !== 'b'));
  ok('欠租付不起 → 破产，剩余现金归债权人');
  assert.equal(g.phase === 'over', false);
  g.turn = 1;
  g.phase = 'manage';
  g.handleAction('b', { type: 'end' });
  g.nextTurn();
  assert.equal(g.ps[g.turn].bankrupt, false);
  ok('破产玩家被跳过');
}

// 4. 先变卖建筑、再抵押，仍不足才破产
{
  const g = mk();
  g.owner[37] = 'a';
  g.owner[39] = 'a';
  g.level[37] = 5;
  g.level[39] = 5;
  const b = g.ps[1];
  g.owner[1] = 'b';
  g.owner[3] = 'b';
  g.level[1] = 1;
  b.cash = 0;
  b.pos = 39; // 租金 2000，b 全部家当只有 30 + 30 + 30(抵押) ……
  g.land(b);
  assert.equal(b.bankrupt, true);
  assert.equal(g.mortgaged[1], false, '破产后地产回到银行，抵押状态清零');
  ok('现金不足时变卖建筑、抵押地产，仍不足才破产');
  const c = g.ps[2];
  c.cash = 50;
  c.pos = 39;
  g.land(c);
  assert.equal(g.phase, 'over');
  assert.deepEqual(g.final.ranking.map((r: any) => r.id), ['a', 'c', 'b']);
  assert.deepEqual(g.scores(), { a: 3, c: 2, b: 1 });
  ok('只剩一人时游戏结束，后破产者名次更高');
}
{
  const g = mk();
  g.owner[5] = 'b'; // b 有一个火车站可抵押（RM100）
  g.owner[39] = 'a';
  g.level[39] = 0;
  g.owner[37] = 'a';
  const b = g.ps[1];
  b.cash = 0;
  b.pos = 39; // 租金 100
  g.land(b);
  assert.equal(b.bankrupt, false);
  assert.equal(g.mortgaged[5], true);
  assert.equal(b.cash, 0);
  ok('抵押火车站刚好够付租金 → 不破产');
}

// 5. 抵押与赎回
{
  const g = mk();
  g.owner[6] = 'a';
  g.phase = 'manage';
  assert.ok(g.handleAction('a', { type: 'mortgage', tile: 6 }).ok);
  assert.equal(g.ps[0].cash, 1500 + 50);
  assert.equal(g.rent(6), 0);
  assert.equal(g.handleAction('a', { type: 'mortgage', tile: 6 }).ok, false);
  assert.equal(g.handleAction('a', { type: 'mortgage', tile: 1 }).ok, false, '不是自己的地产');
  ok('抵押得到地价的一半，抵押后不收租');
  assert.ok(g.handleAction('a', { type: 'redeem', tile: 6 }).ok);
  assert.equal(g.ps[0].cash, 1500 + 50 - 55);
  assert.equal(g.mortgaged[6], false);
  ok('赎回要付 110%');
  g.owner[1] = 'a';
  g.owner[3] = 'a';
  g.level[1] = 1;
  assert.equal(g.handleAction('a', { type: 'mortgage', tile: 3 }).ok, false);
  ok('同色组上有建筑时不能抵押');
  g.level[1] = 0;
  g.mortgaged[3] = true;
  assert.equal(g.handleAction('a', { type: 'build', tile: 1 }).ok, false);
  ok('同色组里有抵押的地产时不能建造');
}

// 6. 监狱
{
  const g = mk();
  const a = g.ps[0];
  a.pos = 30;
  g.land(a);
  assert.equal(a.pos, 10);
  assert.equal(a.inJail, true);
  g.phase = 'roll';
  a.cash = 40;
  assert.equal(g.handleAction('a', { type: 'payjail' }).ok, false);
  a.cash = 100;
  assert.ok(g.handleAction('a', { type: 'payjail' }).ok);
  assert.equal(a.cash, 50);
  assert.equal(a.inJail, false);
  ok('入狱格送进监狱；现金够才能保释');
  a.inJail = true;
  assert.equal(g.handleAction('a', { type: 'usecard' }).ok, false);
  a.jailCards = 1;
  assert.ok(g.handleAction('a', { type: 'usecard' }).ok);
  assert.equal(a.inJail, false);
  assert.equal(a.jailCards, 0);
  ok('有出狱卡才能用，用后出狱');
}

// 7. 双数再掷、连续 3 次双数入狱（把随机数固定为 0，骰子永远是 1+1）
{
  const g = mk();
  const real = Math.random;
  Math.random = () => 0;
  try {
    const a = g.ps[0];
    assert.ok(g.handleAction('a', { type: 'roll' }).ok);
    assert.equal(g.phase === 'buy' || g.phase === 'manage', true);
    assert.equal(g.extraRoll, true);
    if (g.phase === 'buy') g.handleAction('a', { type: 'skip' });
    assert.ok(g.handleAction('a', { type: 'end' }).ok);
    assert.equal(g.phase, 'roll');
    assert.equal(g.turn, 0, '双数后还是同一个人再掷');
    ok('掷出双数 → 结束回合后同一个人再掷一次');
    g.handleAction('a', { type: 'roll' });
    if (g.phase === 'buy') g.handleAction('a', { type: 'skip' });
    g.handleAction('a', { type: 'end' });
    assert.equal(g.phase, 'roll');
    g.handleAction('a', { type: 'roll' });
    assert.equal(a.inJail, true);
    assert.equal(a.pos, 10);
    assert.equal(g.extraRoll, false);
    g.handleAction('a', { type: 'end' });
    assert.equal(g.turn, 1);
    ok('连续 3 次双数 → 入狱，回合结束');
  } finally {
    Math.random = real;
  }
}
{
  const g = mk();
  const real = Math.random;
  Math.random = () => 0;
  try {
    const a = g.ps[0];
    a.inJail = true;
    g.handleAction('a', { type: 'roll' });
    assert.equal(a.inJail, false);
    assert.equal(g.extraRoll, false, '从狱中掷出双数出狱，不再额外掷一次');
    ok('在监狱里掷出双数 → 出狱并按点数前进，没有额外回合');
  } finally {
    Math.random = real;
  }
}

// 8. 卡片：前进到最近的火车站付双倍
{
  const g = mk();
  g.owner[15] = 'a';
  const b = g.ps[1];
  b.pos = 7;
  b.cash = 1000;
  g.applyCard(b, { text: '', effect: { kind: 'nearest', what: 'rail' } }, 0);
  assert.equal(b.pos, 15);
  assert.equal(b.cash, 1000 - 50, '一个火车站 25，双倍 50');
  assert.equal(g.ps[0].cash, 1550);
  ok('机会卡：前进到最近的火车站，有主人则付双倍租金');
  const c = g.ps[2];
  c.pos = 36;
  c.cash = 1000;
  g.applyCard(c, { text: '', effect: { kind: 'goto', pos: 5, collectGo: true } }, 0);
  assert.equal(c.pos, 5);
  assert.equal(c.cash, 1000 + 200, '经过起点领 RM200（5 号火车站无人拥有，所以进入购买阶段）');
  assert.equal(g.phase, 'buy');
  ok('机会卡：前进到某格，经过起点领 RM200，并可购买');
}
{
  const g = mk();
  const a = g.ps[0];
  g.owner[1] = 'a';
  g.level[1] = 2;
  g.owner[3] = 'a';
  g.level[3] = 5;
  g.applyCard(a, { text: '', effect: { kind: 'repair', house: 25, hotel: 100 } }, 0);
  assert.equal(a.cash, 1500 - 50 - 100);
  ok('维修卡：每栋房子和每间酒店分别计费');
  g.applyCard(a, { text: '', effect: { kind: 'jailcard' } }, 0);
  assert.equal(a.jailCards, 1);
  ok('出狱卡可以留着');
}

console.log(`\n全部 ${n} 项通过`);
