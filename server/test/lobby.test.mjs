// 三人联机冒烟测试：先启动服务器（npm run dev:server），再运行 node server/test/lobby.test.mjs
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

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

const [a, b, c, d] = await Promise.all([mk(), mk(), mk(), mk()]);

const created = await emit(a, 'room:create', { nickname: '甲', avatar: '🦊' });
assert.ok(created.ok && /^\d{4}$/.test(created.code));
const code = created.code;
ok(`创建房间 ${code}`);

assert.equal((await emit(b, 'room:join', { code: '0000', nickname: '乙', avatar: '🐻' })).ok, false);
ok('错误房间号被拒绝');
assert.equal((await emit(b, 'room:join', { code, nickname: '甲', avatar: '🐻' })).ok, false);
ok('重复昵称被拒绝');

const jb = await emit(b, 'room:join', { code, nickname: '乙', avatar: '🐻' });
const jc = await emit(c, 'room:join', { code, nickname: '丙', avatar: '🐱' });
assert.ok(jb.ok && jc.ok);
assert.equal((await emit(d, 'room:join', { code, nickname: '丁', avatar: '🐶' })).ok, false);
ok('3 人加入成功，第 4 人被拒绝');
await wait();
assert.equal(a.state.players.length, 3);
assert.equal(c.state.players.length, 3);
assert.equal(a.state.hostId, a.state.you);
assert.ok(!JSON.stringify(a.state).includes(jb.token), '状态里不应包含他人 token');
ok('三端状态同步，且不泄露他人 token');

assert.equal((await emit(a, 'room:start')).ok, false);
ok('未准备/未选游戏不能开始');

for (const s of [a, b, c]) await emit(s, 'room:ready', { ready: true });
assert.equal((await emit(a, 'room:start')).ok, false);
ok('全部准备但未选游戏不能开始');

await emit(a, 'room:vote', { gameId: 'quiz' });
await emit(b, 'room:vote', { gameId: 'draw' });
await emit(c, 'room:vote', { gameId: 'draw' });
await wait();
assert.equal(a.state.selectedGame, 'draw');
ok('投票：2 票对 1 票，选中“你画我猜”');
await emit(c, 'room:vote', { gameId: 'cards' });
await wait();
assert.equal(a.state.selectedGame, 'quiz');
ok('三方各一票时以房主选择为准');

assert.equal((await emit(b, 'room:start')).ok, false);
ok('非房主不能开始');

// 断线重连
const bState = b.state;
b.disconnect();
await wait();
assert.equal(a.state.players.find((p) => p.nickname === '乙').connected, false);
ok('乙断线后其他人看到掉线状态');
const b2 = await mk();
b2.state = null;
b2.on('room:state', (v) => (b2.state = v));
assert.ok((await emit(b2, 'room:resume', { code, token: jb.token })).ok);
await wait();
assert.equal(b2.state.you, bState.you);
assert.equal(a.state.players.find((p) => p.nickname === '乙').connected, true);
ok('乙凭 token 重连，恢复原身份');
assert.equal((await emit(d, 'room:resume', { code, token: 'bad' })).ok, false);
ok('错误 token 无法重连');

assert.equal((await emit(a, 'room:start')).ok, true);
await wait();
assert.equal(c.state.phase, 'playing');
ok('房主开始游戏，三端进入游戏阶段');
assert.equal((await emit(d, 'room:join', { code, nickname: '丁', avatar: '🐶' })).ok, false);
ok('游戏中不能加入');

assert.equal((await emit(b2, 'game:end')).ok, false);
assert.equal((await emit(a, 'game:end')).ok, true);
await wait();
assert.equal(a.state.phase, 'lobby');
assert.ok(a.state.players.every((p) => !p.ready));
ok('结束游戏回到大厅，准备状态重置');

// 房主离开 → 转移
await emit(a, 'room:leave');
await wait();
assert.equal(b2.state.players.length, 2);
assert.equal(b2.state.hostId, b2.state.players[0].id);
ok('房主退出后房主权转移');

[a, b2, c, d].forEach((s) => s.disconnect());
console.log(`\n全部 ${n} 项通过`);
process.exit(0);
