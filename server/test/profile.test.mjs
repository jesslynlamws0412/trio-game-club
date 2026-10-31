// 战绩与玩家资料测试。
// 用临时目录启动服务器：  $env:DATA_DIR="$env:TEMP\trio-test"; npm start
// 先 node server/test/profile.test.mjs play ，重启服务器后再 node server/test/profile.test.mjs check
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const URL = process.env.URL ?? 'http://localhost:3001';
const mode = process.argv[2] ?? 'play';
const DEV = { 甲: 'dev-aaaaaaaa-0001', 乙: 'dev-bbbbbbbb-0002', 丙: 'dev-cccccccc-0003' };
const emit = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const wait = (ms = 100) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);

async function mk(name) {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.state = null;
  s.on('room:state', (v) => (s.state = v));
  await new Promise((r) => s.on('connect', r));
  s.nick = name;
  return s;
}
const act = async (s, a) => {
  const r = await emit(s, 'game:action', a);
  await wait(60);
  return r;
};
const profile = async (dev) => {
  const s = await mk('查询');
  const r = await emit(s, 'profile:get', { deviceId: dev });
  s.disconnect();
  return r;
};

if (mode === 'play') {
  const ps = await Promise.all([mk('甲'), mk('乙'), mk('丙')]);
  const av = ['🦊', '🐻', '🐱'];
  const c = await emit(ps[0], 'room:create', { nickname: '甲', avatar: av[0], deviceId: DEV.甲 });
  assert.ok((await emit(ps[1], 'room:join', { code: c.code, nickname: '乙', avatar: av[1], deviceId: DEV.乙 })).ok);
  assert.ok((await emit(ps[2], 'room:join', { code: c.code, nickname: '丙', avatar: av[2], deviceId: DEV.丙 })).ok);
  const dup = await mk('甲2');
  assert.equal((await emit(dup, 'room:join', { code: c.code, nickname: '甲甲', avatar: av[0], deviceId: DEV.甲 })).ok, false);
  dup.disconnect();
  ok('同一个浏览器身份不能在同一房间占两个座位');

  const playSoup = async (hostIdx, guesserIdx) => {
    for (const p of ps) {
      await emit(p, 'room:ready', { ready: true });
      await emit(p, 'room:vote', { gameId: 'turtlesoup' });
    }
    assert.ok((await emit(ps[0], 'room:start')).ok);
    await wait();
    assert.ok((await act(ps[hostIdx], { type: 'choose', puzzleId: 's1' })).ok);
    assert.ok((await act(ps[guesserIdx], { type: 'guess', text: '人肉' })).ok);
    const e = ps[hostIdx].state.game.log.at(-1);
    assert.ok((await act(ps[hostIdx], { type: 'reply', entryId: e.id, reply: '猜对' })).ok);
    assert.ok((await emit(ps[2], 'game:end')).ok);
    await wait();
  };
  await playSoup(0, 2); // 主持人 甲，丙猜对：丙 +3，甲 +1
  await playSoup(1, 0); // 主持人 乙，甲猜对：甲 +3，乙 +1
  const h = ps[0].state.history;
  assert.equal(h.length, 2);
  assert.equal(JSON.stringify(ps[1].state).includes('dev-'), false, '房间视图里不能出现 deviceId');
  ok('房间内“最近战绩”记录了 2 局，且视图里没有任何 deviceId');

  const p = await profile(DEV.甲);
  assert.equal(p.me.profile.totalScore, 4);
  assert.equal(p.me.profile.played, 2);
  assert.equal(p.me.profile.wins, 1);
  assert.equal(p.me.profile.perGame.turtlesoup.points, 4);
  assert.equal(p.me.records.length, 2);
  assert.equal(JSON.stringify(p.me.records).includes('dev-'), false);
  assert.deepEqual(p.top.map((x) => x.nickname), ['甲', '丙', '乙']);
  assert.equal(JSON.stringify(p.top).includes('dev-'), false);
  ok('甲累计 4 分、2 局、1 胜；排行榜 甲 > 丙 > 乙，且不含任何设备身份');
  const none = await profile('dev-unknown-000000');
  assert.equal(none.me, null);
  const bad = await profile('x');
  assert.equal(bad.me, null);
  ok('不存在 / 非法的设备身份查不到任何资料');
  ps.forEach((s) => s.disconnect());
}

if (mode === 'check') {
  const p = await profile(DEV.乙);
  assert.ok(p.me, '服务器重启后资料应该还在');
  assert.equal(p.me.profile.totalScore, 1);
  assert.equal(p.me.profile.nickname, '乙');
  assert.equal(p.me.records[0].players.find((x) => x.me).nickname, '乙');
  assert.deepEqual(p.top.map((x) => `${x.nickname}${x.totalScore}`), ['甲4', '丙3', '乙1']);
  ok('服务器重启后：个人战绩、游戏记录、排行榜全部保留');
}

console.log(`\n全部 ${n} 项通过`);
process.exit(0);
