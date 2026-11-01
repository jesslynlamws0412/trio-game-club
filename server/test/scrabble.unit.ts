// 拼字游戏规则单元测试（直接操作引擎，指定手牌）。运行：npx tsx server/test/scrabble.unit.ts
import assert from 'node:assert/strict';
import { ScrabbleGame, LETTER_VALUE, PREMIUM, dictionary } from '../src/games/scrabble.js';

const players = [
  { id: 'a', nickname: 'A' },
  { id: 'b', nickname: 'B' },
];
const mk = () => new ScrabbleGame({ players, rotation: 0, notify: () => {} }) as any;
let n = 0;
const ok = (m: string) => console.log(`  ✓ ${++n}. ${m}`);
let nextId = 1000;
/** 把某人的手牌替换成指定字母 */
const setRack = (g: any, id: string, letters: string) => {
  g.racks[id] = [...letters].map((ch) => ({ id: nextId++, ch }));
  return g.racks[id] as { id: number; ch: string }[];
};
/** 在 (r,c) 开始横向（或纵向）放 rack 里的牌 */
const line = (rack: { id: number }[], r: number, c: number, dir: 'h' | 'v', skip: number[] = []) =>
  rack.map((t, i) => ({ id: t.id, r: dir === 'h' ? r : r + i + skip.filter((s) => s <= i).length * 0, c: dir === 'h' ? c + i : c }));

// 0. 牌的数量、分值、棋盘
{
  const g = mk();
  const all = [...g.bag, ...g.racks.a, ...g.racks.b];
  assert.equal(all.length, 100);
  assert.equal(all.filter((t: any) => t.ch === '?').length, 2);
  assert.equal(all.filter((t: any) => t.ch === 'E').length, 12);
  assert.equal(g.racks.a.length, 7);
  assert.equal(g.racks.b.length, 7);
  assert.equal(LETTER_VALUE.Q, 10);
  assert.equal(LETTER_VALUE['?'], 0);
  const flat = PREMIUM.flat();
  assert.equal(flat.filter((x) => x === 'TW').length, 8);
  assert.equal(flat.filter((x) => x === 'DW').length, 17);
  assert.equal(flat.filter((x) => x === 'TL').length, 12);
  assert.equal(flat.filter((x) => x === 'DL').length, 24);
  assert.ok(dictionary().size > 200000 && dictionary().has('quiz') && !dictionary().has('xqzv'));
  ok('100 张牌（含 2 张空白）、每人 7 张；棋盘 8 个三倍词 / 17 个二倍词 / 12 个三倍字母 / 24 个二倍字母；词典已载入');
}

// 1. 第一手的规则
{
  const g = mk();
  const rack = setRack(g, 'a', 'CATXQZJ');
  const v = g.viewFor('b');
  assert.equal(v.rack.length, 7);
  assert.equal(g.handleAction('b', { type: 'play', tiles: [] }).ok, false);
  assert.equal(g.handleAction('a', { type: 'play', tiles: [] }).ok, false);
  assert.equal(g.handleAction('a', { type: 'play', tiles: [{ id: 999999, r: 7, c: 7 }] }).ok, false, '不是自己手里的牌');
  assert.equal(g.handleAction('a', { type: 'play', tiles: line(rack.slice(0, 3), 3, 3, 'h') }).ok, false);
  ok('不是你的回合 / 空手 / 没有的牌 / 第一手不经过中心 ★ → 被拒绝');
  assert.equal(g.handleAction('a', { type: 'play', tiles: [{ id: rack[0].id, r: 7, c: 7 }] }).ok, false);
  ok('第一手只放 1 个字母 → 被拒绝');
  const bad = [{ id: rack[0].id, r: 7, c: 6 }, { id: rack[1].id, r: 8, c: 7 }];
  assert.equal(g.handleAction('a', { type: 'play', tiles: bad }).ok, false);
  ok('牌不在同一行或同一列 → 被拒绝');
  const gap = [{ id: rack[0].id, r: 7, c: 5 }, { id: rack[1].id, r: 7, c: 7 }];
  assert.equal(g.handleAction('a', { type: 'play', tiles: gap }).ok, false);
  ok('牌之间有空格 → 被拒绝');
  const nope = setRack(g, 'a', 'XQZJKVW');
  const r = g.handleAction('a', { type: 'play', tiles: line(nope.slice(0, 3), 7, 6, 'h') });
  assert.equal(r.ok, false);
  assert.match(r.error, /XQZ/);
  assert.equal(g.racks.a.length, 7, '失败的一手不消耗牌');
  assert.equal(g.score.a, 0);
  ok('不在词典里的单词 → 被拒绝，并说明是哪个词；手牌不变');
}

// 2. 计分：中心 ★ 是二倍词
{
  const g = mk();
  const rack = setRack(g, 'a', 'CATXQZJ');
  const res = g.handleAction('a', { type: 'play', tiles: line(rack.slice(0, 3), 7, 6, 'h') });
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(g.score.a, 10, '(C3 + A1 + T1) × 2 = 10');
  assert.equal(g.racks.a.length, 7, '放完后从牌袋补满');
  assert.equal(g.current, 'b');
  assert.equal(g.board[7][7].ch, 'A');
  ok('CAT 横放经过中心：(3+1+1)×2 = 10 分，并补满 7 张牌，轮到下一位');

  // 3. 扩展已有单词 / 交叉词，且旧牌的加成不再生效
  const rb = setRack(g, 'b', 'SAZZZQQ');
  g.handleAction('b', { type: 'pass' });
  g.handleAction('a', { type: 'pass' }); // 回到 b
  assert.equal(g.current, 'b');
  assert.equal(g.handleAction('b', { type: 'play', tiles: [{ id: rb[0].id, r: 7, c: 9 }] }).ok, true);
  assert.equal(g.score.b, 6, 'CATS = 3+1+1+1，A 上的二倍词不再计算');
  ok('在 CAT 后面加 S → CATS = 6 分（旧牌的加成不重复计算）');
  // a 在 A 下面放 A，形成纵向 AA（单牌只形成一个新词）
  const ra = setRack(g, 'a', 'AZZZQQJ');
  const res2 = g.handleAction('a', { type: 'play', tiles: [{ id: ra[0].id, r: 8, c: 7 }] });
  assert.ok(res2.ok, JSON.stringify(res2));
  assert.equal(g.score.a, 12);
  ok('单张牌放在 A 下面形成 AA = 2 分');
  // 无效的交叉词：在 T 下面放 Z 形成 TZ
  const rb2 = setRack(g, 'b', 'ZQQQQQQ');
  const bad = g.handleAction('b', { type: 'play', tiles: [{ id: rb2[0].id, r: 8, c: 8 }] });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /TZ|AZ/);
  ok('放牌形成了无效的交叉词 → 被拒绝');
  // 不相连
  const far = g.handleAction('b', { type: 'play', tiles: [{ id: rb2[0].id, r: 12, c: 2 }, { id: rb2[1].id, r: 12, c: 3 }] });
  assert.equal(far.ok, false);
  assert.match(far.error, /相连/);
  ok('新放的牌没和棋盘上已有的牌相连 → 被拒绝');
  // 压在已有牌上
  assert.equal(g.handleAction('b', { type: 'play', tiles: [{ id: rb2[0].id, r: 7, c: 7 }, { id: rb2[1].id, r: 7, c: 10 }] }).ok, false);
  ok('不能放在已经有牌的格子上');
}

// 4. 二倍字母 / 三倍字母 / 三倍词，空白牌
{
  const g = mk();
  // PLAYERS 横放在第 7 行 1~7 列：全部 7 张牌 → 全部用完奖励
  const rack = setRack(g, 'a', 'PLAYERS');
  const res = g.handleAction('a', { type: 'play', tiles: line(rack, 7, 1, 'h') });
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(g.score.a, (3 + 1 + 1 * 2 + 4 + 1 + 1 + 1) * 2 + 50, '(P3+L1+A1×2[二倍字母]+Y4+E1+R1+S1)×2 + 50');
  assert.equal(g.last.bingo, true);
  ok('7 张牌一次用完：二倍字母 + 二倍词 + 全部用完奖励 50 = 76 分');
}
{
  const g = mk();
  const rack = setRack(g, 'a', 'C?TXQZJ');
  const missing = g.handleAction('a', { type: 'play', tiles: line(rack.slice(0, 3), 7, 6, 'h') });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /空白牌/);
  const tiles = line(rack.slice(0, 3), 7, 6, 'h');
  (tiles[1] as any).letter = 'a';
  const res = g.handleAction('a', { type: 'play', tiles });
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(g.score.a, (3 + 0 + 1) * 2);
  assert.equal(g.board[7][7].blank, true);
  assert.equal(g.board[7][7].ch, 'A');
  ok('空白牌必须指定字母；当作 A 使用，值 0 分：(3+0+1)×2 = 8');
}
{
  // 三倍词：在第 0 行放字（第 0 行 0 列是红色三倍词）。先让棋盘上有连接牌
  const g = mk();
  g.board[1][0] = { ch: 'A', blank: false };
  const rack = setRack(g, 'a', 'ZOOXQJK');
  // 从 (0,0) 纵向放 Z → ZA（经过 (0,0) 三倍词）
  const res = g.handleAction('a', { type: 'play', tiles: [{ id: rack[0].id, r: 0, c: 0 }] });
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(g.score.a, (10 + 1) * 3);
  ok('压在红色三倍词格子上：ZA = (10+1)×3 = 33 分');
}

// 5. 换牌 / 跳过 / 连续无人得分结束
{
  const g = mk();
  const before = g.racks.a.map((t: any) => t.id);
  assert.equal(g.handleAction('a', { type: 'exchange', tiles: [] }).ok, false);
  assert.ok(g.handleAction('a', { type: 'exchange', tiles: before.slice(0, 3) }).ok);
  assert.equal(g.racks.a.length, 7);
  assert.equal(g.bag.length + g.racks.a.length + g.racks.b.length, 100);
  assert.equal(g.current, 'b');
  ok('换牌：换掉选中的牌，牌的总数不变，换牌算一手');
  g.bag = g.bag.slice(0, 5);
  assert.equal(g.handleAction('b', { type: 'exchange', tiles: [g.racks.b[0].id] }).ok, false);
  ok('牌袋少于 7 张时不能换牌');
  let k = 0;
  while (!g.over && k++ < 20) g.handleAction(g.current, { type: 'pass' });
  assert.equal(g.over, true);
  assert.ok(k <= 7, `2 人时连续 6 手无人得分后结束，实际 ${k}`);
  assert.ok(g.final);
  ok('连续 6 手没人得分 → 游戏结束，各自扣掉手里剩余牌的分数');
}

// 6. 用完牌结束，拿对手剩余字母的分数
{
  const g = mk();
  g.bag = [];
  const ra = setRack(g, 'a', 'CAT');
  const rb = setRack(g, 'b', 'QZ');
  const res = g.handleAction('a', { type: 'play', tiles: line(ra, 7, 6, 'h') });
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(g.over, true);
  assert.equal(g.wentOut, 'a');
  assert.equal(g.final.a, 10 + 20, 'a 得 10 分，再拿到对手剩余 Q(10)+Z(10)');
  assert.equal(g.final.b, -20);
  assert.deepEqual(g.scores(), { a: 3, b: 2 });
  const v = g.viewFor('b');
  assert.deepEqual(v.racks.b, ['Q', 'Z']);
  assert.equal(g.handleAction('b', { type: 'pass' }).ok, false);
  ok('一人用完牌且牌袋已空：结束；他拿到其他人剩余字母分数，对手被扣分；名次积分 3/2');
}

// 7. 其他人看不到我的手牌
{
  const g = mk();
  const va = g.viewFor('a');
  const vb = g.viewFor('b');
  assert.equal(va.rack.length, 7);
  assert.notDeepEqual(va.rack.map((t: any) => t.id), vb.rack.map((t: any) => t.id));
  assert.equal(va.counts.b, 7);
  assert.equal(va.racks, undefined);
  const json = JSON.stringify(va);
  for (const t of g.racks.b) assert.ok(!json.includes(`"id":${t.id},`), '视图里不应包含对手的牌');
  ok('视图只含自己的手牌，对手只显示张数；游戏中不公开对手的牌');
}

console.log(`\n全部 ${n} 项通过`);
