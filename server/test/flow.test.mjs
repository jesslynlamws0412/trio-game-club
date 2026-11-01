// 开始倒计时、取消、关闭房间、超时自动行动
// 需要用这两个环境变量启动服务器：START_COUNTDOWN_MS=500 IDLE_TURN_MS=700 npm start
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const URL = process.env.URL ?? 'http://localhost:3001';
const emit = (s, ev, data) =>
  new Promise((res) => {
    const t = setTimeout(() => res({ __timeout: true }), 4000);
    s.emit(ev, data, (r) => {
      clearTimeout(t);
      res(r);
    });
  });
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000, what = '') => {
  const t0 = Date.now();
  while (!fn() && Date.now() - t0 < ms) await wait(40);
  assert.ok(fn(), '等待超时：' + what);
};
let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);
const mk = () => {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.state = null;
  s.closed = false;
  s.on('room:state', (v) => (s.state = v));
  s.on('room:closed', () => (s.closed = true));
  return new Promise((res) => s.on('connect', () => res(s)));
};
const socks = await Promise.all(Array.from({ length: 4 }, mk));
const act = (s, a) => emit(s, 'game:action', a);

/** 建房、选游戏、准备，并点开始（不等待游戏真正开始） */
async function setup(mode, count, gameId, opts = {}) {
  const list = socks.slice(0, count);
  const r = await emit(list[0], 'room:create', { nickname: 'P0', avatar: '🦊', mode, local: opts.local });
  assert.ok(r.ok, JSON.stringify(r));
  for (let i = 1; i < count; i++) {
    const j = await emit(list[i], 'room:join', { code: r.code, nickname: 'P' + i, avatar: '🐻', key: r.localKey });
    assert.ok(j.ok, JSON.stringify(j));
  }
  for (const s of list) await emit(s, 'room:vote', { gameId });
  for (const s of list) await emit(s, 'room:ready', { ready: true });
  await wait(100);
  return { list, code: r.code };
}
async function startAndWait(list) {
  assert.ok((await emit(list[0], 'room:start')).ok);
  await until(() => list.every((s) => s.state.phase === 'playing'), 4000, '游戏开始');
  await wait(60);
}
async function reset() {
  for (const s of socks) await emit(s, 'room:leave');
  await wait(60);
}
const byTurn = (list, id) => list.find((s) => s.state.you === id);

// ───────────── 开始倒计时 ─────────────
{
  const { list, code } = await setup('duo', 2, 'rps');
  const [A, B] = list;
  assert.ok((await emit(A, 'room:start')).ok);
  await wait(80);
  assert.equal(A.state.phase, 'countdown');
  assert.ok(A.state.countdownMs > 0 && A.state.countdownMs <= 500);
  assert.equal(B.state.phase, 'countdown');
  ok('点开始后进入倒计时，所有人都看到');

  assert.equal((await emit(A, 'room:ready', { ready: false })).ok, false);
  assert.equal((await emit(A, 'room:vote', { gameId: 'dice' })).ok, false);
  assert.equal((await emit(A, 'room:settings', { difficulty: 2 })).ok, false);
  assert.equal((await emit(socks[2], 'room:join', { code, nickname: 'P9', avatar: '🐱' })).ok, false);
  assert.equal((await emit(B, 'room:cancel')).ok, false);
  ok('倒计时期间不能改准备、改投票、改设置、加入；非房主不能取消');

  assert.ok((await emit(A, 'room:cancel')).ok);
  await wait(80);
  assert.equal(A.state.phase, 'lobby');
  assert.ok(A.state.players.every((p) => !p.ready), '取消后需要重新准备');
  await wait(600);
  assert.equal(A.state.phase, 'lobby', '取消后不会自己开始');
  ok('房主取消倒计时：回到大厅，需要重新准备，不会自己开始');

  for (const s of list) await emit(s, 'room:ready', { ready: true });
  assert.ok((await emit(A, 'room:start')).ok);
  await until(() => A.state.phase === 'playing', 3000, '倒计时结束后开始');
  assert.equal(A.state.currentGame, 'rps');
  ok('倒计时结束后游戏自动开始');
  await reset();
}
{
  const { list } = await setup('duo', 2, 'rps');
  assert.ok((await emit(list[0], 'room:start')).ok);
  await wait(100);
  await emit(list[1], 'room:leave');
  await wait(100);
  assert.equal(list[0].state.phase, 'lobby');
  await wait(700);
  assert.equal(list[0].state.phase, 'lobby', '有人离开后倒计时取消，不会开始');
  ok('倒计时期间有人离开：倒计时取消');
  await reset();
}
{
  const { list } = await setup('solo', 1, 'memory');
  assert.ok((await emit(list[0], 'room:start')).ok);
  await wait(80);
  assert.equal(list[0].state.phase, 'playing');
  await reset();
  const loc = await setup('duo', 2, 'rps', { local: true });
  assert.ok((await emit(loc.list[0], 'room:start')).ok);
  await wait(80);
  assert.equal(loc.list[0].state.phase, 'playing');
  ok('单人和本地轮流房间不倒计时，直接开始');
  await reset();
}

// ───────────── 关闭房间 ─────────────
{
  const { list, code } = await setup('trio', 3, 'likely');
  const [A, B, C] = list;
  assert.equal((await emit(B, 'room:close')).ok, false);
  assert.ok(A.state.hostId === A.state.you);
  await startAndWait(list);
  assert.ok((await emit(A, 'room:close')).ok);
  await wait(150);
  assert.ok(A.closed && B.closed && C.closed, '所有人都收到房间关闭通知');
  assert.equal((await emit(socks[3], 'room:join', { code, nickname: 'P9', avatar: '🐱' })).ok, false);
  assert.equal((await act(B, { type: 'pick', round: 0, option: 'x' })).ok, false);
  ok('房主在游戏中关闭房间：所有人收到通知，房间消失，不能再加入或操作；非房主不能关闭');
  for (const s of socks) s.closed = false;
  await reset();
}

// ───────────── 超时自动行动 ─────────────
{
  const { list } = await setup('duo', 2, 'dice');
  await startAndWait(list);
  assert.ok(list[0].state.idleSec >= 1, '有超时机制的游戏会告诉客户端');
  const first = list[0].state.game.turnId;
  assert.equal(list[0].state.game.bid, null);
  await until(() => list[0].state.game.bid !== null, 3000, '吹牛骰子：自动叫数');
  const g = list[0].state.game;
  assert.equal(g.bid.by, first);
  assert.notEqual(g.turnId, first);
  assert.deepEqual([g.bid.qty, g.bid.face], [1, 2]);
  ok('吹牛骰子：不动 → 自动叫最小的一注，轮到对方');
  await until(() => list[0].state.game.phase === 'reveal' || list[0].state.game.bid?.by !== first, 3000, '对方也不动 → 自动开');
  ok('吹牛骰子：对方也不动 → 自动开骰');
  await reset();
}
{
  const { list } = await setup('duo', 2, 'number');
  await startAndWait(list);
  const first = list[0].state.game.turnId;
  await until(() => list[0].state.game.guesses.length === 1, 3000, '猜数字：自动跳过');
  assert.equal(list[0].state.game.guesses[0].digits, '····');
  assert.equal(list[0].state.game.guesses[0].by, first);
  assert.notEqual(list[0].state.game.turnId, first);
  const left = list[0].state.game.left;
  assert.equal(left[first], 7);
  ok('猜数字：不动 → 记一次超时（用掉一次机会），换下一位');
  await reset();
}
{
  const { list } = await setup('duo', 2, 'memory');
  await startAndWait(list);
  const first = list[0].state.game.turnId;
  assert.ok((await act(byTurn(list, first), { type: 'flip', index: 0 })).ok);
  await until(() => list[0].state.game.up.length === 1, 1000, '翻了一张');
  await until(() => list[0].state.game.turnId !== first, 3000, '记忆翻牌：自动换人');
  assert.equal(list[0].state.game.up.length, 0);
  ok('记忆翻牌：翻了一张后不动 → 牌盖回去，换下一位');
  await reset();
}
{
  const { list } = await setup('duo', 2, 'truth');
  await startAndWait(list);
  const first = list[0].state.game.playerId;
  await until(() => list[0].state.game.history.length === 1, 3000, '真心话：自动跳过');
  assert.equal(list[0].state.game.history[0].kind, 'skip');
  assert.notEqual(list[0].state.game.playerId, first);
  ok('真心话大冒险：该选的人不动 → 当作跳过');
  const cur = byTurn(list, list[0].state.game.playerId);
  assert.ok((await act(cur, { type: 'choose', kind: 'truth' })).ok);
  await until(() => list[0].state.game.history.length === 2, 3000, '没人投票 → 自动判定');
  const h = list[0].state.game.history[1];
  assert.equal(h.done, false);
  assert.equal(list[0].state.game.points[cur.state.you], 0);
  ok('真心话大冒险：投票的人不动 → 当作没完成');
  await reset();
}
{
  const { list } = await setup('trio', 3, 'cards');
  await startAndWait(list);
  assert.equal(list[0].state.game.table.length, 0);
  await until(() => list[0].state.game.table.length >= 1, 3000, '抽卡：自动抽');
  ok('抽卡游戏：轮到的人不动 → 自动抽卡');
  await reset();
}
{
  const { list } = await setup('trio', 3, 'monopoly');
  await startAndWait(list);
  const first = list[0].state.game.turnId;
  await until(() => list[0].state.game.turnId !== first, 8000, '大富翁：自动走完回合');
  ok('大富翁：轮到的人不动 → 自动掷骰、放弃购买、结束回合，换下一位');
  await reset();
}
{
  const { list } = await setup('solo', 1, 'q-cnlit');
  await startAndWait(list);
  assert.equal(list[0].state.idleSec, 0);
  ok('有自己计时器的游戏（如答题）不使用超时代行动');
  await reset();
}

console.log(`\n全部 ${n} 项通过`);
for (const s of socks) s.close();
process.exit(0);
