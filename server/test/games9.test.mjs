// 拼字游戏联机测试：房间流程、手牌保密、拒绝/跳过/换牌、本地轮流
// 需要：START_COUNTDOWN_MS=0 npm start
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const URL = process.env.URL ?? 'http://localhost:3001';
const emit = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const wait = (ms = 100) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000, what = '') => {
  const t0 = Date.now();
  while (!fn() && Date.now() - t0 < ms) await wait(20);
  assert.ok(fn(), '等待超时：' + what);
};
let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);
const mk = () => {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.state = null;
  s.on('room:state', (v) => (s.state = v));
  return new Promise((res) => s.on('connect', () => res(s)));
};
const socks = await Promise.all(Array.from({ length: 4 }, mk));
const act = (s, a) => emit(s, 'game:action', a);

async function setup(mode, count) {
  const list = socks.slice(0, count);
  const r = await emit(list[0], 'room:create', { nickname: 'P0', avatar: '🦊', mode });
  assert.ok(r.ok, JSON.stringify(r));
  for (let i = 1; i < count; i++) assert.ok((await emit(list[i], 'room:join', { code: r.code, nickname: 'P' + i, avatar: '🐻' })).ok);
  for (const s of list) await emit(s, 'room:vote', { gameId: 'scrabble' });
  for (const s of list) await emit(s, 'room:ready', { ready: true });
  await wait(80);
  assert.ok((await emit(list[0], 'room:start')).ok);
  await until(() => list.every((s) => s.state.phase === 'playing'), 3000, '开始');
  await wait(60);
  return list;
}
async function reset() {
  for (const s of socks) await emit(s, 'room:leave');
  await wait(60);
}

// ───── 三人房间 ─────
{
  const list = await setup('trio', 3);
  const v = list[0].state.game;
  assert.equal(v.board.length, 15);
  assert.equal(v.rack.length, 7);
  assert.equal(v.bag, 100 - 21);
  const ids = list.map((s) => s.state.game.rack.map((t) => t.id).join());
  assert.equal(new Set(ids).size, 3, '每人手牌不同');
  assert.ok(list.every((s) => s.state.game.counts[list[0].state.you] === 7));
  assert.ok(!JSON.stringify(list[1].state.game).includes(JSON.stringify(list[0].state.game.rack[0])), '看不到别人的牌');
  ok('三人拼字：15×15 棋盘，每人 7 张不同的牌，牌袋 79 张，看不到别人的牌');

  const cur = list.find((s) => s.state.you === v.turnId);
  const other = list.find((s) => s !== cur);
  assert.equal((await act(other, { type: 'pass' })).ok, false);
  assert.equal((await act(cur, { type: 'play', tiles: [] })).ok, false);
  const r = cur.state.game.rack;
  const bad = await act(cur, { type: 'play', tiles: [{ id: r[0].id, r: 0, c: 0 }, { id: r[1].id, r: 0, c: 1 }] });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /中心|空白牌/); // 手牌里恰好抽到空白牌时，会先提示要指定字母
  assert.equal((await act(cur, { type: 'play', tiles: [{ id: r[0].id, r: 99, c: 0 }] })).ok, false);
  assert.equal((await act(cur, { type: 'play', tiles: 'x' })).ok, false);
  assert.equal((await act(cur, { type: 'play', tiles: [{ id: r[0].id, r: 7, c: 7 }, { id: r[0].id, r: 7, c: 8 }] })).ok, false);
  assert.equal((await act(cur, { type: 'bad' })).ok, false);
  ok('不是你的回合 / 空手 / 第一手不过中心 / 越界 / 乱发数据 / 同一张牌放两次 / 未知操作，都被拒绝');

  const ex = await act(cur, { type: 'exchange', tiles: [r[0].id, r[1].id] });
  assert.ok(ex.ok, JSON.stringify(ex));
  await until(() => cur.state.game.turnId !== cur.state.you, 2000, '换牌后换人');
  assert.equal(cur.state.game.rack.length, 7);
  assert.equal(cur.state.game.bag, 79);
  assert.equal(cur.state.game.log.some((l) => l.includes('换了 2 张')), true);
  ok('换牌后轮到下一位，牌袋数量不变');

  // 换牌也算没人得分的一手，所以再跳过 5 手就满 6 手
  for (let k = 0; k < 5; k++) {
    const s = list.find((x) => x.state.you === list[0].state.game.turnId);
    assert.ok(s, '游戏不应提前结束');
    await act(s, { type: 'pass' });
    await wait(30);
  }
  await until(() => list[0].state.game.over, 3000, '连续跳过后结束');
  assert.ok(list[0].state.game.racks, '结束后公开所有人剩余的牌');
  assert.equal(Object.keys(list[0].state.awards).length, 3);
  ok('连续 6 手没人得分，游戏结束，公开剩余字母牌，发放名次积分');
  await reset();
}

// ───── 单人练习 ─────
{
  const [me] = await setup('solo', 1);
  assert.equal(me.state.game.rack.length, 7);
  assert.equal((await act(me, { type: 'pass' })).ok, true);
  ok('单人模式可以练习拼字');
  await reset();
}

console.log(`\n全部 ${n} 项通过`);
for (const s of socks) s.close();
process.exit(0);
