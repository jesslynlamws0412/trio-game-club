// 双人本地轮流：房间规则、可选游戏、防外人加入、整局流程
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const URL = process.env.URL ?? 'http://localhost:3001';
const emit = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => {
  const t0 = Date.now();
  while (!fn() && Date.now() - t0 < ms) await wait(50);
  assert.ok(fn(), '等待超时');
};
let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);
const mk = () => {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.state = null;
  s.on('room:state', (v) => (s.state = v));
  return new Promise((res) => s.on('connect', () => res(s)));
};
const [host, guest, outsider] = await Promise.all([mk(), mk(), mk()]);
const DEV = 'devlocal' + Date.now().toString(36);

assert.equal((await emit(host, 'room:create', { nickname: '甲', avatar: '🦊', mode: 'trio', local: true })).ok, false);
ok('本地轮流只支持双人模式');

const c = await emit(host, 'room:create', { nickname: '甲', avatar: '🦊', mode: 'duo', local: true, deviceId: DEV });
assert.ok(c.ok && c.localKey);
await wait();
assert.equal(host.state.local, true);
assert.ok(!JSON.stringify(host.state).includes(c.localKey), '密钥不能出现在房间视图里');
ok('创建本地房间：创建者拿到密钥，房间视图里没有密钥');

const normal = await emit(outsider, 'room:create', { nickname: '路人', avatar: '🐻', mode: 'duo' });
assert.equal(normal.localKey, undefined);
await emit(outsider, 'room:leave');
ok('普通双人房间不会生成密钥');

assert.equal((await emit(outsider, 'room:join', { code: c.code, nickname: '乙', avatar: '🐻' })).ok, false);
assert.equal((await emit(outsider, 'room:join', { code: c.code, nickname: '乙', avatar: '🐻', key: 'wrong' })).ok, false);
ok('外人用房间号（或猜错密钥）都加入不了本地房间');

const g = await emit(guest, 'room:join', { code: c.code, nickname: '乙', avatar: '🐱', key: c.localKey });
assert.ok(g.ok, JSON.stringify(g));
assert.equal(g.localKey, undefined, '第二位玩家不会拿到密钥');
await wait();
assert.equal(host.state.players.length, 2);
ok('持有密钥的设备替第二位玩家加入成功');

assert.deepEqual(host.state.catalog.map((x) => x.id).sort(), ['dice', 'idiom', 'memory', 'number', 'rps', 'tacit', 'truth']);
assert.ok(host.state.catalog.every((x) => x.local && x.modes.includes('duo')));
assert.equal((await emit(host, 'room:vote', { gameId: 'q-cnlit' })).ok, false);
assert.equal((await emit(host, 'room:vote', { gameId: 'draw' })).ok, false);
ok('本地房间只列出 7 款适合轮流的游戏，投票选其他游戏被拒绝');

assert.equal((await emit(host, 'friends:invite', { code: 'AAAAAA' })).ok, false);
ok('本地房间不能邀请好友');

// 打一局剪刀石头布：两个人在同一台设备上轮流秘密出拳
assert.ok((await emit(host, 'room:vote', { gameId: 'rps' })).ok);
for (const s of [host, guest]) await emit(s, 'room:ready', { ready: true });
assert.ok((await emit(host, 'room:start')).ok);
await wait();
const hostId = host.state.you;
const guestId = guest.state.you;
assert.equal(host.state.game.game, 'rps');
await emit(host, 'game:action', { type: 'pick', round: 0, move: 'rock' });
await wait(60);
assert.deepEqual(host.state.game.answered, [hostId]);
assert.ok(!JSON.stringify(guest.state.game).includes('rock'), '甲出的拳在揭晓前，乙的视图里看不到');
await emit(guest, 'game:action', { type: 'pick', round: 0, move: 'scissors' });
await wait(100);
assert.equal(host.state.game.gains[hostId], 1);
ok('同一台设备两人轮流秘密出拳：揭晓前互相看不到，揭晓后结算正确');

// 把剩下的 6 轮打完，然后结算
for (let k = 1; k < 7; k++) {
  await until(() => host.state.game.round === k && host.state.game.phase === 'pick');
  await emit(host, 'game:action', { type: 'pick', round: k, move: 'rock' });
  await emit(guest, 'game:action', { type: 'pick', round: k, move: 'scissors' });
}
await until(() => host.state.gameOver);
assert.equal(host.state.gameOver, true);
assert.ok((await emit(host, 'game:end')).ok);
await wait(100);
const me = (await emit(host, 'me:get', { deviceId: DEV })).me;
assert.equal(me.played, 1);
assert.equal(me.wins, 1);
ok('整局打完：战绩记在房主名下（第二位玩家没有设备身份）');

console.log(`\n全部 ${n} 项通过`);
for (const s of [host, guest, outsider]) s.close();
process.exit(0);
