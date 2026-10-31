// 第二批新游戏测试：真假判断 / 剪刀石头布 / 成语接龙 / 真心话大冒险 / 反应速度挑战
// 需要用 tsx 运行（要读取成语词库）：
//   PICK_REVEAL_MS=150 RPS_REVEAL_MS=150 IDIOM_TURN_MS=1200 REACTION_DELAY_MS=400 REACTION_REVEAL_MS=150 npm start
//   node --import tsx server/test/games5.test.mjs
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';
import { IDIOMS } from '../src/data/idioms.ts';

const URL = process.env.URL ?? 'http://localhost:3001';
const emit = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const mk = () => {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.state = null;
  s.on('room:state', (v) => (s.state = v));
  return new Promise((res) => s.on('connect', () => res(s)));
};
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);
const socks = await Promise.all([1, 2, 3].map(mk));
const byId = (list, id) => list.find((s) => s.state.you === id);
const act = (s, a) => emit(s, 'game:action', a);

async function start(mode, count, gameId) {
  const list = socks.slice(0, count);
  const r = await emit(list[0], 'room:create', { nickname: 'P0', avatar: '🦊', mode });
  assert.ok(r.ok, JSON.stringify(r));
  for (let i = 1; i < count; i++) assert.ok((await emit(list[i], 'room:join', { code: r.code, nickname: 'P' + i, avatar: '🐻' })).ok);
  for (const s of list) await emit(s, 'room:vote', { gameId });
  for (const s of list) await emit(s, 'room:ready', { ready: true });
  const st = await emit(list[0], 'room:start');
  assert.ok(st.ok, JSON.stringify(st));
  await wait();
  return list;
}
async function finish(list) {
  await emit(list[0], 'game:end');
  for (const s of socks) await emit(s, 'room:leave');
  await wait(50);
}

// ---------- 真假判断 ----------
{
  const list = await start('trio', 3, 'truefalse');
  const [A, B, C] = list;
  let v = A.state.game;
  assert.equal(v.game, 'truefalse');
  assert.equal(v.options.length, 2);
  assert.equal(v.answer, undefined, '作答前不能看到答案');
  await act(A, { type: 'pick', round: 0, option: '0' });
  await act(B, { type: 'pick', round: 0, option: '1' });
  await wait(60);
  assert.equal(C.state.game.answer, undefined);
  await act(C, { type: 'pick', round: 0, option: '0' });
  await wait(60);
  v = A.state.game;
  assert.equal(v.phase, 'reveal');
  assert.ok(v.why && ['0', '1'].includes(v.answer));
  const rightIds = [A, B, C].filter((s, i) => ['0', '1', '0'][i] === v.answer).map((s) => s.state.you);
  for (const s of [A, B, C]) assert.equal(v.gains[s.state.you], rightIds.includes(s.state.you) ? 1 : 0);
  ok('真假判断：揭晓前不泄露答案；揭晓后给出答案和解释，答对 +1');
  for (let r = 1; r < 10; r++) {
    await wait(300);
    for (const s of list) await act(s, { type: 'pick', round: r, option: '0' });
  }
  await wait(300);
  assert.equal(A.state.gameOver, true);
  assert.equal(A.state.game.total, 10);
  ok('10 题打完，进入排名结算');
  await finish(list);
}

// ---------- 剪刀石头布 ----------
{
  const list = await start('trio', 3, 'rps');
  const [A, B, C] = list;
  assert.equal((await act(A, { type: 'pick', round: 0, move: 'fire' })).ok, false);
  assert.ok((await act(A, { type: 'pick', round: 0, move: 'rock' })).ok);
  assert.equal((await act(A, { type: 'pick', round: 0, move: 'paper' })).ok, false);
  await wait(60);
  assert.equal(B.state.game.moves, undefined);
  assert.ok(!JSON.stringify(B.state.game).includes('"rock"'), '揭晓前别人的出拳不能外泄');
  await act(B, { type: 'pick', round: 0, move: 'scissors' });
  await act(C, { type: 'pick', round: 0, move: 'scissors' });
  await wait(60);
  const g = A.state.game.gains;
  assert.equal(g[A.state.you], 2);
  assert.equal(g[B.state.you], 0);
  assert.equal(g[C.state.you], 0);
  ok('剪刀石头布（三人）：出拳保密；石头赢两把剪刀 +2，其余 0');
  await finish(list);

  const solo = await start('solo', 1, 'rps');
  let totalGain = 0;
  for (let r = 0; r < 7; r++) {
    await wait(r === 0 ? 0 : 250);
    assert.equal(solo[0].state.game.round, r);
    await act(solo[0], { type: 'pick', round: r, move: 'rock' });
    await wait(60);
    const v = solo[0].state.game;
    assert.ok(['rock', 'paper', 'scissors'].includes(v.moves.cpu));
    assert.equal(v.gains[solo[0].state.you], v.moves.cpu === 'scissors' ? 1 : 0);
    totalGain += v.gains[solo[0].state.you];
  }
  await wait(300);
  assert.equal(solo[0].state.gameOver, true);
  const vv = solo[0].state.game;
  const me = solo[0].state.you;
  assert.equal(vv.points[me], totalGain);
  const expected = vv.points[me] > vv.points.cpu ? 3 : vv.points[me] === vv.points.cpu ? 1 : 0;
  assert.equal(solo[0].state.awards[me], expected);
  ok(`剪刀石头布（单人 vs 电脑）：7 轮，积分 ${vv.points[me]}:${vv.points.cpu}，奖励 +${expected}`);
  await finish(solo);
}

// ---------- 成语接龙 ----------
const next = (cur, used) => IDIOMS.find((i) => i[0] === cur[cur.length - 1] && !used.has(i));
// 选一个自己接完之后对方仍有路可走的成语（避免触发“无路可走再 +2 分、换新开头”）
const nextSafe = (cur, used) =>
  IDIOMS.find((i) => i[0] === cur[cur.length - 1] && !used.has(i) && IDIOMS.some((j) => j[0] === i[3] && j !== i && !used.has(j)));
{
  const list = await start('duo', 2, 'idiom');
  const [A, B] = list;
  let v = A.state.game;
  assert.equal(v.game, 'idiom');
  const used = new Set([v.current]);
  const cur = byId(list, v.turnId);
  const other = list.find((s) => s !== cur);
  assert.equal((await act(other, { type: 'say', text: next(v.current, used) })).ok, false);
  ok('成语接龙：不是你的回合不能接');
  const bad1 = await act(cur, { type: 'say', text: '一二三' });
  const bad2 = await act(cur, { type: 'say', text: v.need + '一二三' });
  const wrongStart = IDIOMS.find((i) => i[0] !== v.need);
  const bad3 = await act(cur, { type: 'say', text: wrongStart });
  assert.ok(!bad1.ok && !bad2.ok && !bad3.ok);
  assert.match(bad2.error, /词库里没有/);
  assert.match(bad3.error, /开头/);
  ok('接龙校验：不是四字 / 词库没有 / 首字不对，都被拒绝且不扣命');
  const first = nextSafe(v.current, used) ?? next(v.current, used);
  assert.ok((await act(cur, { type: 'say', text: first })).ok);
  used.add(first);
  await wait(80);
  assert.ok([1, 3].includes(A.state.game.points[cur.state.you]), '接对 +1（若接完无路可走再 +2）');
  assert.equal(A.state.game.current, first);
  ok('接对一个成语 +1 分，轮到对方');
  // 对方一直不接 → 连续超时 3 次出局；每次轮到 cur 时 cur 接对
  const idle = other.state.you;
  for (let k = 0; k < 40 && !A.state.gameOver; k++) {
    await wait(250);
    const g = A.state.game;
    if (g.turnId === cur.state.you) {
      const w = next(g.current, used);
      if (!w) break;
      const r = await act(cur, { type: 'say', text: w });
      if (r.ok) used.add(w);
    }
  }
  assert.equal(A.state.gameOver, true);
  assert.deepEqual(A.state.game.out, [idle]);
  assert.equal(A.state.game.lives[idle], 0);
  assert.equal(A.state.game.ranking[0].id, cur.state.you);
  assert.equal(A.state.awards[cur.state.you], 3);
  ok('对方连续 3 次超时出局，接龙的一方获胜 +3');
  await finish(list);

  const solo = await start('solo', 1, 'idiom');
  assert.equal(solo[0].state.game.solo, true);
  for (let k = 0; k < 40 && !solo[0].state.gameOver; k++) await wait(250);
  assert.equal(solo[0].state.gameOver, true);
  ok('成语接龙（单人）：不操作 3 次超时后游戏结束');
  await finish(solo);
}

// ---------- 真心话大冒险 ----------
{
  const list = await start('trio', 3, 'truth');
  let v = list[0].state.game;
  assert.equal(v.total, 6);
  const cur = byId(list, v.playerId);
  const others = list.filter((s) => s !== cur);
  assert.equal((await act(others[0], { type: 'choose', kind: 'truth' })).ok, false);
  assert.ok((await act(cur, { type: 'choose', kind: 'truth' })).ok);
  await wait();
  assert.equal(list[0].state.game.phase, 'judge');
  assert.ok(list[0].state.game.prompt);
  assert.equal((await act(cur, { type: 'judge', done: true })).ok, false);
  assert.ok((await act(others[0], { type: 'judge', done: true })).ok);
  assert.equal((await act(others[0], { type: 'judge', done: false })).ok, false);
  assert.ok((await act(others[1], { type: 'judge', done: false })).ok);
  await wait();
  // 一赞一否：平票不算完成
  assert.equal(list[0].state.game.points[cur.state.you], 0);
  ok('真心话：非本人不能选；本人不能给自己投；平票不算完成');
  // 第二回合：两人都赞成 → +2
  v = list[0].state.game;
  const cur2 = byId(list, v.playerId);
  await act(cur2, { type: 'choose', kind: 'dare' });
  for (const s of list.filter((x) => x !== cur2)) await act(s, { type: 'judge', done: true });
  await wait();
  assert.equal(list[0].state.game.points[cur2.state.you], 2);
  ok('大冒险：两人赞成，+2 分');
  for (let k = 0; k < 6 && !list[0].state.gameOver; k++) {
    const c = byId(list, list[0].state.game.playerId);
    await act(c, { type: 'choose', kind: 'skip' });
    await wait(60);
  }
  assert.equal(list[0].state.gameOver, true);
  assert.equal(list[0].state.game.ranking[0].id, cur2.state.you);
  ok('跳过不扣分；6 回合打完，+2 分的人排第一');
  await finish(list);

  const duo = await start('duo', 2, 'truth');
  assert.equal(duo[0].state.game.total, 4);
  ok('真心话（双人）：4 回合');
  await finish(duo);
}

// ---------- 反应速度挑战 ----------
{
  const list = await start('duo', 2, 'reaction');
  const [A, B] = list;
  assert.equal(A.state.game.phase, 'wait');
  assert.ok((await act(A, { type: 'tap' })).ok); // 抢跑
  assert.equal((await act(A, { type: 'tap' })).ok, false);
  await wait(60);
  assert.equal(A.state.game.falseStart, true);
  ok('反应速度：“点！”之前点击算抢跑，不能重复点击');
  await wait(600); // 等到 go
  assert.equal(B.state.game.phase, 'go');
  assert.ok((await act(B, { type: 'tap' })).ok);
  await wait(60);
  assert.equal(B.state.game.phase, 'reveal');
  const g = B.state.game;
  assert.equal(g.gains[A.state.you], -1);
  assert.equal(g.gains[B.state.you], 3);
  assert.ok(g.times[B.state.you] >= 0 && g.times[B.state.you] < 1000);
  assert.equal(g.points[A.state.you], -1);
  ok(`本轮：抢跑 -1，B 用时 ${g.times[B.state.you]} 毫秒得 +3`);
  // 剩下 4 轮：B 先点，A 后点
  for (let r = 1; r < 5; r++) {
    for (let k = 0; k < 40 && B.state.game.phase !== 'go'; k++) await wait(100);
    assert.equal(B.state.game.phase, 'go');
    await act(B, { type: 'tap' });
    await act(A, { type: 'tap' });
    await wait(60);
    assert.equal(B.state.game.gains[B.state.you], 3);
    assert.equal(B.state.game.gains[A.state.you], 2);
    await wait(250);
  }
  await wait(300);
  assert.equal(A.state.gameOver, true);
  assert.equal(A.state.game.ranking[0].id, B.state.you);
  ok('5 轮打完：B 排第一');
  await finish(list);

  const solo = await start('solo', 1, 'reaction');
  for (let k = 0; k < 40 && solo[0].state.game.phase !== 'go'; k++) await wait(100);
  await act(solo[0], { type: 'tap' });
  await wait(60);
  assert.ok(solo[0].state.game.gains[solo[0].state.you] >= 1);
  ok('反应速度（单人）：按反应时间给分');
  await finish(solo);
}

// ---------- 模式限制 ----------
{
  await emit(socks[0], 'room:create', { nickname: 'P0', avatar: '🦊', mode: 'solo' });
  assert.equal((await emit(socks[0], 'room:vote', { gameId: 'truth' })).ok, false);
  ok('单人房间不能选真心话大冒险');
  await emit(socks[0], 'room:leave');
}

console.log(`\n全部 ${n} 项通过`);
for (const s of socks) s.close();
process.exit(0);
