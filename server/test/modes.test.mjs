// 人数模式测试：单人 / 双人 / 多人房间的人数限制、游戏筛选、开始条件、移出玩家，并回归三人默认行为。
// 运行（需先启动服务器，QUIZ_REVEAL_MS=150 DRAW_REVEAL_MS=200）：node server/test/modes.test.mjs
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const URL = process.env.URL ?? 'http://localhost:3001';
const emit = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const mk = () => {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.state = null;
  s.on('room:state', (v) => (s.state = v));
  s.on('room:kicked', () => (s.kicked = true));
  return new Promise((res) => s.on('connect', () => res(s)));
};
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);
const names = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬'];
const socks = await Promise.all(names.map(() => mk()));

const open = async (mode, count) => {
  const host = socks[0];
  const res = await emit(host, 'room:create', { nickname: names[0], avatar: '🦊', mode });
  assert.ok(res.ok, JSON.stringify(res));
  for (let i = 1; i < count; i++) {
    const j = await emit(socks[i], 'room:join', { code: res.code, nickname: names[i], avatar: '🐻' });
    assert.ok(j.ok, JSON.stringify(j));
  }
  await wait();
  return res.code;
};
const readyAll = async (count) => {
  for (let i = 0; i < count; i++) await emit(socks[i], 'room:ready', { ready: true });
  await wait();
};
const closeAll = async () => {
  for (const s of socks) await emit(s, 'room:leave');
  await wait(50);
};

// 1. 不传 mode 仍是三人房间（旧客户端兼容）
{
  const r = await emit(socks[0], 'room:create', { nickname: '甲', avatar: '🦊' });
  assert.ok(r.ok);
  await wait();
  assert.equal(socks[0].state.mode, 'trio');
  assert.equal(socks[0].state.maxPlayers, 3);
  assert.equal(socks[0].state.minPlayers, 3);
  for (const id of ['undercover','draw','quiz','werewolf','monopoly','cards','turtlesoup','detective']) assert.ok(socks[0].state.catalog.some((g) => g.id === id), '三人房间缺少原有游戏 ' + id);
  ok('默认三人房间：3 人、原有 8 款游戏都在');
  await closeAll();
}

// 2. 未知模式被拒绝
assert.equal((await emit(socks[0], 'room:create', { nickname: '甲', avatar: '🦊', mode: 'hack' })).ok, false);
ok('未知模式被拒绝');

// 3. 单人
{
  const code = await open('solo', 1);
  const st = socks[0].state;
  assert.equal(st.mode, 'solo');
  assert.deepEqual([st.minPlayers, st.maxPlayers], [1, 1]);
  assert.ok(st.catalog.every((g) => g.modes.includes('solo')) && st.catalog.some((g) => g.id === 'quiz'));
  assert.equal((await emit(socks[1], 'room:join', { code, nickname: '乙', avatar: '🐻' })).ok, false);
  ok('单人房间：只显示支持单人的游戏，第 2 人无法加入');
  assert.equal((await emit(socks[0], 'room:vote', { gameId: 'monopoly' })).ok, false);
  ok('单人房间不能投不支持的游戏');
  await emit(socks[0], 'room:vote', { gameId: 'quiz' });
  await readyAll(1);
  assert.ok((await emit(socks[0], 'room:start')).ok);
  await wait();
  assert.equal(socks[0].state.game.game, 'quiz');
  assert.match(JSON.stringify(socks[0].state.game), /question/);
  // 答一题（单人答完立即揭晓）
  const g = socks[0].state.game;
  assert.ok((await emit(socks[0], 'game:action', { type: 'answer', index: g.index, choice: 0 })).ok);
  await wait();
  assert.equal(socks[0].state.game.phase, 'reveal');
  assert.equal((await emit(socks[0], 'game:action', { type: 'answer', index: g.index, choice: 1 })).ok, false);
  ok('单人答题：开始、作答、立即揭晓、不能重复提交');
  await emit(socks[0], 'game:end');
  await closeAll();
}

// 4. 双人
{
  const code = await open('duo', 2);
  const st = socks[0].state;
  assert.ok(st.catalog.every((g) => g.modes.includes('duo')) && ['draw', 'quiz', 'turtlesoup'].every((id) => st.catalog.some((g) => g.id === id)));
  assert.equal((await emit(socks[2], 'room:join', { code, nickname: '丙', avatar: '🐱' })).ok, false);
  ok('双人房间：只显示支持双人的游戏，第 3 人无法加入');
  await emit(socks[0], 'room:vote', { gameId: 'draw' });
  assert.equal((await emit(socks[0], 'room:start')).ok, false);
  await readyAll(2);
  assert.ok((await emit(socks[0], 'room:start')).ok);
  await wait();
  const v0 = socks[0].state.game;
  assert.equal(v0.game, 'draw');
  assert.equal(v0.totalRounds, 2);
  // 画家与猜词者分别验证：画家不能猜，猜词者不能画
  const drawer = v0.drawerId === socks[0].state.you ? socks[0] : socks[1];
  const guesser = drawer === socks[0] ? socks[1] : socks[0];
  assert.equal((await emit(guesser, 'game:action', { type: 'stroke', id: 's1', color: '#000000', size: 4, points: [[1, 1]] })).ok, false);
  assert.equal((await emit(drawer, 'game:action', { type: 'guess', text: '随便' })).ok, false);
  const word = drawer.state.game.word;
  assert.ok(word && guesser.state.game.word === null);
  assert.ok((await emit(guesser, 'game:action', { type: 'guess', text: word })).ok);
  await wait(400); // 猜对 → 本回合结束 → 下一回合
  assert.equal(socks[0].state.game.round, 1);
  ok('双人你画我猜：2 回合，权限校验正确，猜对后进入下一回合');
  await emit(socks[0], 'game:end');
  await closeAll();
}

// 5. 双人海龟汤（1 主持 + 1 推理）
{
  await open('duo', 2);
  await emit(socks[0], 'room:vote', { gameId: 'turtlesoup' });
  await emit(socks[1], 'room:vote', { gameId: 'turtlesoup' });
  await readyAll(2);
  assert.ok((await emit(socks[0], 'room:start')).ok);
  await wait();
  const host = socks.slice(0, 2).find((s) => s.state.game.hostId === s.state.you);
  const other = socks[0] === host ? socks[1] : socks[0];
  const bank = host.state.game.bank;
  assert.ok(bank?.length > 0 && other.state.game.bank === null);
  assert.ok((await emit(host, 'game:action', { type: 'choose', puzzleId: bank[0].id })).ok);
  assert.ok((await emit(other, 'game:action', { type: 'ask', text: '他是人吗？' })).ok);
  await wait();
  const entry = host.state.game.log[0];
  assert.ok((await emit(host, 'game:action', { type: 'reply', entryId: entry.id, reply: '是' })).ok);
  assert.equal(other.state.game.answer, null, '推理者看不到汤底');
  ok('双人海龟汤：主持人选题、推理者提问、汤底不外泄');
  await emit(socks[0], 'game:end');
  await closeAll();
}

// 6. 多人（4~8）
{
  const code = await open('party', 4);
  assert.deepEqual([socks[0].state.minPlayers, socks[0].state.maxPlayers], [4, 8]);
  await emit(socks[0], 'room:vote', { gameId: 'quiz' });
  await closeAll();
  const code2 = await open('party', 3);
  await emit(socks[0], 'room:vote', { gameId: 'quiz' });
  await readyAll(3);
  const r = await emit(socks[0], 'room:start');
  assert.equal(r.ok, false);
  assert.match(r.error, /至少需要 4/);
  ok('多人房间：3 人不能开始（提示至少 4 人）');
  await closeAll();

  await open('party', 8);
  assert.equal(socks[0].state.players.length, 8);
  assert.equal((await emit(socks[8], 'room:join', { code: socks[0].state.code, nickname: '癸', avatar: '🐱' })).ok, false);
  ok('多人房间：最多 8 人，第 9 人被拒绝');
  for (const s of socks.slice(0, 8)) await emit(s, 'room:vote', { gameId: 'quiz' });
  await readyAll(8);
  assert.ok((await emit(socks[0], 'room:start')).ok);
  await wait();
  const ids = socks.slice(0, 8).map((s) => s.state.you);
  const q = socks[0].state.game;
  for (let i = 0; i < 8; i++) {
    const r = await emit(socks[i], 'game:action', { type: 'answer', index: q.index, choice: i % q.options.length });
    assert.ok(r.ok, JSON.stringify(r) + ' i=' + i);
  }
  await wait();
  assert.equal(socks[7].state.game.phase, 'reveal');
  assert.equal(Object.keys(socks[7].state.game.choices).length, 8);
  ok('8 人答题竞赛：全部作答后同步揭晓');
  // 打完 10 题
  for (let k = 1; k < 10; k++) {
    await wait(400);
    const cur = socks[0].state.game;
    assert.equal(cur.index, k);
    for (let i = 0; i < 8; i++) await emit(socks[i], 'game:action', { type: 'answer', index: k, choice: 0 });
  }
  await wait(400);
  assert.equal(socks[0].state.gameOver, true);
  assert.equal(socks[0].state.game.ranking.length, 8);
  assert.ok(socks.slice(0, 8).every((s) => ids.includes(s.state.you)));
  ok('8 人答题竞赛打完 10 题，排名包含 8 人');
  await emit(socks[3], 'game:end');
  await wait();
  assert.equal(socks[0].state.phase, 'lobby');
  assert.equal(socks[0].state.gamesPlayed, 1);
  await closeAll();
}

// 7. 房主移出玩家
{
  const code = await open('party', 5);
  const target = socks[2].state.you;
  assert.equal((await emit(socks[1], 'room:kick', { playerId: target })).ok, false);
  ok('非房主不能移出玩家');
  assert.equal((await emit(socks[0], 'room:kick', { playerId: socks[0].state.you })).ok, false);
  ok('房主不能移出自己');
  assert.ok((await emit(socks[0], 'room:kick', { playerId: target })).ok);
  await wait();
  assert.equal(socks[0].state.players.length, 4);
  assert.equal(socks[2].kicked, true);
  const back = await emit(socks[2], 'room:join', { code, nickname: '丙', avatar: '🐱' });
  assert.ok(back.ok);
  ok('房主移出玩家后，该玩家收到通知；之后仍可重新加入');
  await closeAll();
}

// 8. 多人房间掉线重连、游戏中有人离开
{
  const code = await open('party', 4);
  await emit(socks[0], 'room:vote', { gameId: 'quiz' });
  await readyAll(4);
  assert.ok((await emit(socks[0], 'room:start')).ok);
  await wait();
  assert.equal((await emit(socks[8], 'room:join', { code, nickname: '癸', avatar: '🐱' })).ok, false);
  ok('游戏开始后不能再加入');
  await emit(socks[3], 'room:leave');
  await wait();
  assert.equal(socks[0].state.phase, 'lobby');
  assert.equal(socks[0].state.players.length, 3);
  ok('游戏中有人离开：本局作废，回到大厅');
  await closeAll();
}

console.log(`\n全部 ${n} 项通过`);
for (const s of socks) s.close();
process.exit(0);
