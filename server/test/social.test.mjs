// 玩家系统测试：资料、成就、游戏记录、好友、邀请、排行榜、自定义头像
// 先启动服务器（用全新的临时数据目录）：
//   $env:DATA_DIR="$env:TEMP\trio-social"; $env:RPS_REVEAL_MS=150; $env:MEMORY_HIDE_MS=150; npm start
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const URL = process.env.URL ?? 'http://localhost:3001';
const emit = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);
const stamp = Date.now().toString(36);
const DA = `devsocialA${stamp}`;
const DB = `devsocialB${stamp}`;
const DC = `devsocialC${stamp}`;

const mk = () => {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.state = null;
  s.events = [];
  s.on('room:state', (v) => (s.state = v));
  s.on('achievement:unlocked', (v) => s.events.push(['ach', v]));
  s.on('invite:received', (v) => s.events.push(['invite', v]));
  return new Promise((res) => s.on('connect', () => res(s)));
};
const [A, B, B2, C] = await Promise.all([mk(), mk(), mk(), mk()]);
const act = (s, a) => emit(s, 'game:action', a);
const leaveAll = async () => {
  for (const s of [A, B, B2, C]) await emit(s, 'room:leave');
  await wait(50);
};

// ───── 自定义头像 ─────
{
  for (const av of ['ab', 'A😀', 'hello', '😀😀😀', '']) {
    const r = await emit(A, 'room:create', { nickname: '甲', avatar: av, deviceId: DA, mode: 'duo' });
    assert.equal(r.ok, false, `头像 ${JSON.stringify(av)} 应该被拒绝`);
  }
  const good = await emit(A, 'room:create', { nickname: '甲', avatar: '🥭', deviceId: DA, mode: 'duo' });
  assert.ok(good.ok, JSON.stringify(good));
  await wait(60);
  assert.equal(A.state.players[0].avatar, '🥭');
  ok('自定义头像：1~2 个表情可以，文字 / 混合 / 过多 / 空的会被拒绝');
  await emit(A, 'room:leave');
}

// ───── 打一局双人剪刀石头布，A 每轮都赢 ─────
async function playRps(host = A, guest = B, hostDev = DA, guestDev = DB) {
  const r = await emit(host, 'room:create', { nickname: host === A ? '甲' : '丙', avatar: '🦊', deviceId: hostDev, mode: 'duo' });
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok((await emit(guest, 'room:join', { code: r.code, nickname: guest === B ? '乙' : '丁', avatar: '🐻', deviceId: guestDev })).ok);
  for (const s of [host, guest]) await emit(s, 'room:vote', { gameId: 'rps' });
  for (const s of [host, guest]) await emit(s, 'room:ready', { ready: true });
  assert.ok((await emit(host, 'room:start')).ok);
  await wait();
  for (let k = 0; k < 7; k++) {
    await wait(k ? 300 : 0);
    await act(host, { type: 'pick', round: k, move: 'rock' });
    await act(guest, { type: 'pick', round: k, move: 'scissors' });
  }
  await wait(400);
  assert.equal(host.state.gameOver, true);
  assert.ok((await emit(host, 'game:end')).ok);
  await wait(100);
  await leaveAll();
  return r.code;
}

const me0 = await emit(A, 'me:get', { deviceId: DA });
assert.equal(me0.me.played, 0);
assert.match(me0.me.code, /^[A-HJ-NP-Z2-9]{6}$/);
ok('新玩家：0 局，并有公开的 6 位玩家 ID');

await playRps();
let a = (await emit(A, 'me:get', { deviceId: DA })).me;
let b = (await emit(B, 'me:get', { deviceId: DB })).me;
assert.equal(a.played, 1);
assert.equal(a.wins, 1);
assert.equal(a.losses, 0);
assert.equal(a.winRate, 100);
assert.equal(a.totalScore, 3);
assert.equal(a.bestScore, 7);
assert.equal(a.winStreak, 1);
assert.deepEqual(a.favoriteGame, { id: 'rps', played: 1 });
assert.equal(a.perMode.duo.played, 1);
assert.equal(b.wins, 0);
assert.equal(b.losses, 1);
assert.equal(b.winRate, 0);
assert.equal(b.totalScore, 2);
assert.equal(b.bestScore, 0);
ok('个人资料：局数 / 胜场 / 败场 / 胜率 / 积分 / 最高得分 / 连胜 / 最喜欢的游戏 / 各模式统计');

assert.ok(a.achievements.find((x) => x.id === 'debut').unlockedAt);
assert.equal(a.achievements.find((x) => x.id === 'trio10').unlockedAt, null);
assert.equal(a.achievements.find((x) => x.id === 'duo5').progress, 1);
assert.ok(A.events.some(([t, v]) => t === 'ach' && v.some((x) => x.id === 'debut')));
assert.ok(B.events.some(([t, v]) => t === 'ach' && v.some((x) => x.id === 'debut')));
ok('成就：完成第一场解锁“初次登场”并实时推送；未达成的成就显示进度');

// ───── 游戏记录 ─────
{
  const r = (await emit(A, 'records:get', { deviceId: DA })).records;
  assert.equal(r.length, 1);
  assert.equal(r[0].game, 'rps');
  assert.equal(r[0].mode, 'duo');
  assert.ok(r[0].duration > 0);
  assert.equal(r[0].players.length, 2);
  const me = r[0].players.find((p) => p.me);
  assert.equal(me.nickname, '甲');
  assert.equal(me.rank, 1);
  assert.equal(me.raw, 7);
  assert.equal(JSON.stringify(r).includes('devsocial'), false, '记录里不能出现任何 deviceId');
  assert.deepEqual((await emit(A, 'records:get', { deviceId: 'nobody-nobody-1' })).records, []);
  ok('游戏记录：游戏、模式、时长、参与者、名次、原始得分都有，且没有 deviceId');
}

// ───── 单人模式：不计胜负，但记录最高得分 ─────
{
  const r = await emit(C, 'room:create', { nickname: '丙', avatar: '🐱', deviceId: DC, mode: 'solo' });
  assert.ok(r.ok);
  await emit(C, 'room:vote', { gameId: 'memory' });
  await emit(C, 'room:ready', { ready: true });
  assert.ok((await emit(C, 'room:start')).ok);
  await wait();
  // 随便翻到结束：记住已知牌面配对
  const known = new Map();
  for (let k = 0; k < 300 && !C.state.gameOver; k++) {
    const g = C.state.game;
    g.cards.forEach((c, i) => c && known.set(i, c));
    if (g.phase !== 'play') {
      await wait(180);
      continue;
    }
    const up = g.up;
    let idx;
    if (up.length === 1) {
      const sym = g.cards[up[0]];
      const mate = [...known].find(([i, c]) => c === sym && i !== up[0] && !g.matched[i]);
      idx = mate ? mate[0] : g.cards.findIndex((c, i) => c === null && !known.has(i));
    } else {
      const pair = [...known].find(([i, c]) => !g.matched[i] && [...known].some(([j, d]) => j !== i && d === c && !g.matched[j]));
      idx = pair ? pair[0] : g.cards.findIndex((c, i) => c === null && !known.has(i));
    }
    if (idx < 0) idx = g.cards.findIndex((c) => c === null);
    await act(C, { type: 'flip', index: idx });
    await wait(30);
  }
  assert.equal(C.state.gameOver, true);
  await emit(C, 'game:end');
  await wait(100);
  const c = (await emit(C, 'me:get', { deviceId: DC })).me;
  assert.equal(c.played, 1);
  assert.equal(c.contested, 0);
  assert.equal(c.wins, 0);
  assert.equal(c.losses, 0);
  assert.equal(c.winRate, 0);
  assert.equal(c.bestScore, 8);
  assert.equal(c.perMode.solo.played, 1);
  assert.equal(c.achievements.find((x) => x.id === 'solo5').progress, 1);
  ok('单人模式：计局数，不计胜负和连胜；记录最高得分（记忆翻牌 8 对）');
  await leaveAll();
}

// ───── 好友 ─────
{
  assert.equal((await emit(A, 'friends:add', { deviceId: DA, code: 'ZZZZZZ' })).ok, false);
  assert.equal((await emit(A, 'friends:add', { deviceId: DA, code: a.code })).ok, false);
  assert.equal((await emit(A, 'friends:add', { code: b.code })).ok, false);
  ok('加好友：不存在的 ID / 加自己 / 没有设备身份，都被拒绝');

  const recent = await emit(A, 'friends:list', { deviceId: DA });
  assert.equal(recent.friends.length, 0);
  assert.equal(recent.recent.length, 1);
  assert.equal(recent.recent[0].nickname, '乙');
  assert.equal(recent.recent[0].isFriend, false);
  assert.equal(recent.recent[0].count, 1);
  ok('最近一起玩过的玩家：显示乙，还不是好友');

  const add = await emit(A, 'friends:add', { deviceId: DA, code: b.code.toLowerCase() });
  assert.ok(add.ok, JSON.stringify(add));
  assert.equal(add.friend.nickname, '乙');
  assert.equal((await emit(A, 'friends:add', { deviceId: DA, code: b.code })).ok, false);
  const list = await emit(A, 'friends:list', { deviceId: DA });
  assert.equal(list.friends.length, 1);
  assert.equal(list.recent[0].isFriend, true);
  assert.equal(JSON.stringify(list).includes('devsocial'), false, '好友列表里不能出现 deviceId');
  assert.deepEqual(Object.keys(list.friends[0]).sort(), ['avatar', 'code', 'nickname', 'online', 'played', 'totalScore', 'wins']);
  ok('用玩家 ID 添加好友（不区分大小写）；不能重复添加；列表不泄露 deviceId');

  // 邀请：B2 是乙的另一个标签页 / 设备，保持在线
  await emit(B2, 'me:get', { deviceId: DB });
  const inRoom = await emit(A, 'room:create', { nickname: '甲', avatar: '🦊', deviceId: DA, mode: 'duo' });
  assert.ok(inRoom.ok);
  assert.equal((await emit(A, 'friends:invite', { code: 'ZZZZZZ' })).ok, false);
  assert.equal((await emit(A, 'friends:invite', { code: (await emit(C, 'me:get', { deviceId: DC })).me.code })).ok, false);
  ok('邀请：只能邀请自己的好友');
  const inv = await emit(A, 'friends:invite', { code: b.code });
  assert.ok(inv.ok, JSON.stringify(inv));
  await wait(100);
  const got = B2.events.find(([t]) => t === 'invite');
  assert.ok(got);
  assert.equal(got[1].code, inRoom.code);
  assert.equal(got[1].nickname, '甲');
  assert.equal(got[1].mode, 'duo');
  assert.equal((await emit(A, 'friends:invite', { code: b.code })).ok, false);
  ok('邀请：在线好友收到房间号；20 秒内不能重复邀请');
  const joined = await emit(B2, 'room:join', { code: inRoom.code, nickname: '乙', avatar: '🐻', deviceId: DB });
  assert.ok(joined.ok);
  await wait(60);
  assert.equal((await emit(A, 'friends:invite', { code: b.code })).ok, false);
  ok('好友已在房间里，不能再邀请');
  await leaveAll();

  // 好友不在线
  B.disconnect();
  B2.disconnect();
  await wait(150);
  await emit(A, 'room:create', { nickname: '甲', avatar: '🦊', deviceId: DA, mode: 'duo' });
  const off = await emit(A, 'friends:invite', { code: b.code });
  assert.equal(off.ok, false);
  assert.match(off.error, /不在线/);
  assert.equal((await emit(A, 'friends:list', { deviceId: DA })).friends[0].online, false);
  ok('好友不在线时不能邀请，列表显示离线');
  await emit(A, 'room:leave');

  assert.ok((await emit(A, 'friends:remove', { deviceId: DA, code: b.code })).ok);
  assert.equal((await emit(A, 'friends:remove', { deviceId: DA, code: b.code })).ok, false);
  assert.equal((await emit(A, 'friends:list', { deviceId: DA })).friends.length, 0);
  assert.ok((await emit(A, 'friends:add', { deviceId: DA, code: b.code })).ok);
  ok('删除好友；再重新添加');
}

// ───── 排行榜（数据目录里可能还有别的测试留下的玩家，所以只看我们这 3 位）─────
{
  const cMe = (await emit(C, 'me:get', { deviceId: DC })).me;
  const ours = new Set([a.code, b.code, cMe.code]);
  const board = async (scope, category = 'all') => (await emit(A, 'leaderboard:get', { deviceId: DA, scope, category })).rows;
  const mine = (rows) => rows.filter((r) => ours.has(r.code));
  const all = await board('all');
  const order = mine(all).map((r) => r.nickname);
  assert.deepEqual(order, ['甲', '丙', '乙']); // 甲 丙 同为 3 分，甲胜场多
  assert.equal(all.find((r) => r.code === a.code).points, 3);
  assert.equal(all.find((r) => r.code === a.code).me, true);
  assert.equal(all.some((r) => 'deviceId' in r), false);
  ok('总榜：按积分排序，标出自己，不含 deviceId');
  assert.equal(mine(await board('week')).length, 3);
  assert.equal(mine(await board('month')).length, 3);
  ok('周榜 / 月榜（近 7 / 30 天）');
  assert.deepEqual((await board('friends')).map((r) => r.nickname), ['甲', '乙']);
  ok('好友榜：只有我和我的好友');
  assert.equal(mine(await board('all', 'reaction')).length, 2);
  assert.equal(mine(await board('all', 'quiz')).length, 0);
  ok('分类榜：剪刀石头布属于“反应与策略”类，知识问答类榜单里没有我们');
  const best = (await emit(A, 'leaderboard:get', { deviceId: DA, scope: 'best', game: 'rps' })).rows;
  assert.equal(best.find((r) => r.me).best, 7);
  const bestMem = (await emit(A, 'leaderboard:get', { deviceId: DA, scope: 'best', game: 'memory' })).rows;
  assert.ok(bestMem.some((r) => r.nickname === '丙' && r.best === 8));
  ok('历史最高分榜：按游戏分别排名（单局原始得分）');
}
console.log(`\n全部 ${n} 项通过`);
for (const s of [A, C]) s.close();
process.exit(0);
