// 你画我猜 + 抽卡游戏联机测试（含防泄密、画笔增量同步）。
// 先启动服务器：  $env:DRAW_REVEAL_MS=200; npm start     再运行：node server/test/games2.test.mjs
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const URL = process.env.URL ?? 'http://localhost:3001';
const emit = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);
const sockets = [];

async function mk(name) {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.state = null;
  s.deltas = [];
  s.on('room:state', (v) => (s.state = v));
  s.on('game:delta', (d) => s.deltas.push(d));
  await new Promise((r) => s.on('connect', r));
  s.nick = name;
  sockets.push(s);
  return s;
}
const act = async (s, action) => {
  const r = await emit(s, 'game:action', action);
  await wait(120);
  return r;
};
async function startRoom(gameId) {
  const ps = await Promise.all([mk('甲'), mk('乙'), mk('丙')]);
  const c = await emit(ps[0], 'room:create', { nickname: '甲', avatar: '🦊' });
  await emit(ps[1], 'room:join', { code: c.code, nickname: '乙', avatar: '🐻' });
  await emit(ps[2], 'room:join', { code: c.code, nickname: '丙', avatar: '🐱' });
  for (const p of ps) {
    await emit(p, 'room:ready', { ready: true });
    await emit(p, 'room:vote', { gameId });
  }
  assert.ok((await emit(ps[0], 'room:start')).ok);
  await wait();
  return ps;
}
const byId = (ps, id) => ps.find((p) => p.state.you === id);

// ───────────── 你画我猜 ─────────────
{
  const ps = await startRoom('draw');
  const seenDrawers = new Set();
  let totalPoints = 0;
  for (let round = 0; round < 3; round++) {
    const g = ps[0].state.game;
    assert.equal(g.phase, 'drawing');
    assert.equal(g.round, round);
    const drawer = byId(ps, g.drawerId);
    seenDrawers.add(drawer.nick);
    const guessers = ps.filter((p) => p !== drawer);
    const word = drawer.state.game.word;
    assert.ok(word && word.length >= 2);
    for (const gu of guessers) {
      assert.equal(gu.state.game.word, null);
      assert.equal(JSON.stringify(gu.state.game).includes(word), false, '猜词者视图不能含有答案');
      assert.equal(gu.state.game.wordLen, [...word].length);
    }
    if (round === 0) ok('画家能看到题目，猜词者的视图里没有答案');

    // 画笔：非画家不能画；画家的增量只转发给其他人
    assert.equal((await act(guessers[0], { type: 'stroke', id: 'x1', color: '#000000', size: 4, points: [[1, 1]] })).ok, false);
    assert.equal((await act(drawer, { type: 'stroke', id: 'x1', color: 'red', size: 4, points: [[1, 1]] })).ok, false);
    assert.equal((await act(drawer, { type: 'guess', text: word })).ok, false);
    const before = guessers.map((p) => p.deltas.length);
    const dBefore = drawer.deltas.length;
    assert.ok((await act(drawer, { type: 'stroke', id: `s${round}a`, color: '#7a1f2b', size: 6, points: [[100, 100], [200, 220]] })).ok);
    assert.ok((await act(drawer, { type: 'stroke', id: `s${round}a`, color: '#7a1f2b', size: 6, points: [[300, 300]] })).ok);
    assert.ok((await act(drawer, { type: 'stroke', id: `s${round}b`, color: '#234d3a', size: 3, points: [[10, 20], [5000, -4]] })).ok);
    guessers.forEach((p, i) => assert.equal(p.deltas.length, before[i] + 3));
    assert.equal(drawer.deltas.length, dBefore, '画家不应收到自己的增量回传');
    assert.deepEqual(guessers[0].deltas.at(-1).points[1], [1000, 0]); // 坐标被限制在范围内
    if (round === 0) ok('画笔权限校验、非法数据被拒绝、增量只转发给其他玩家');

    // 一次普通广播后，猜词者的完整状态里要带有已画的笔画（断线重连/晚加入时用）
    const wrong = word === '错误答案' ? '另一个答案' : '错误答案';
    assert.ok((await act(guessers[0], { type: 'guess', text: wrong })).ok);
    assert.equal(guessers[1].state.game.canvas.length, 2);
    assert.equal(guessers[1].state.game.canvas[0].points.length, 3);
    assert.equal(guessers[1].state.game.guesses.at(-1).text, wrong);
    // 撤销 / 清空
    assert.ok((await act(drawer, { type: 'undo' })).ok);
    assert.equal(guessers[0].deltas.at(-1).op, 'undo');
    assert.ok((await act(drawer, { type: 'clear' })).ok);
    assert.equal(guessers[0].deltas.at(-1).op, 'clear');
    await act(guessers[0], { type: 'guess', text: wrong + '2' }); // 触发广播以读取完整状态
    assert.equal(guessers[1].state.game.canvas.length, 0);
    if (round === 0) ok('完整状态包含画布；撤销、清空同步');

    // 猜对：内容不公开，先后得分 3 / 2，画家每人 +1
    assert.ok((await act(guessers[1], { type: 'guess', text: ` ${word} ` })).ok);
    const entry = ps[0].state.game.guesses.at(-1);
    assert.equal(entry.correct, true);
    assert.equal(entry.text, null);
    assert.equal(ps[0].state.game.phase, 'drawing');
    assert.equal((await act(guessers[1], { type: 'guess', text: word })).ok, false);
    assert.ok((await act(guessers[0], { type: 'guess', text: word })).ok);
    assert.equal(ps[0].state.game.phase, 'reveal');
    assert.equal(guessers[0].state.game.word, word);
    assert.equal(drawer.state.game.points[drawer.state.you] >= 2, true);
    if (round === 0) ok('猜对内容不外泄、重复猜对被拒绝、两人都猜对后提前结束并公布答案');
    totalPoints += 3 + 2 + 2;
    for (let i = 0; i < 40 && ps[0].state.game.phase === 'reveal'; i++) await wait(50);
  }
  assert.equal(seenDrawers.size, 3);
  assert.equal(ps[0].state.game.phase, 'over');
  assert.equal(Object.values(ps[0].state.game.points).reduce((a, b) => a + b, 0), totalPoints);
  ok(`三回合三位画家各一次，总分 ${totalPoints} 分正确`);
  assert.ok((await emit(ps[2], 'game:end')).ok);
  await wait();
  assert.equal(ps[0].state.players.reduce((s, p) => s + p.score, 0), totalPoints);
  ok('结算计入积分榜');
}

// ───────────── 抽卡游戏 ─────────────
let sawPrivate = 0;
let sawSecretTask = 0;
for (let game = 0; game < 6; game++) {
  const ps = await startRoom('cards');
  assert.equal(ps[0].state.game.totalTurns, 9);
  const bystander = ps[2];
  assert.equal((await act(bystander, { type: 'draw' })).ok, false);
  let guard = 0;
  while (ps[0].state.game.phase === 'draw' || ps[0].state.game.phase === 'judge') {
    assert.ok(guard++ < 40);
    const g = ps[0].state.game;
    const drawer = byId(ps, g.drawerId);
    if (g.phase === 'draw') {
      const other = ps.find((p) => p !== drawer);
      assert.equal((await act(other, { type: 'draw' })).ok, false);
      assert.ok((await act(drawer, { type: 'draw' })).ok);
      const entry = drawer.state.game.table.at(-1);
      if (entry.private) {
        sawPrivate++;
        assert.ok(entry.title && entry.text, '抽到的人能看到私人卡');
        for (const p of ps.filter((x) => x !== drawer)) {
          if (p.state.game.phase === 'over') continue; // 最后一张抽完游戏立即结束，按规则此时私人卡全部公开
          const e = p.state.game.table.at(-1);
          assert.equal(e.title, null);
          assert.equal(e.text, null);
          assert.equal(e.note, null);
          assert.equal(e.type, 'private');
          // 最后一张若是秘密任务，会立刻进入“结算”阶段，按规则此时要公开任务内容让另外两人投票，不算泄露
          if (!['settle', 'over'].includes(p.state.game.phase)) {
            assert.equal(JSON.stringify(p.state.game).includes(entry.text), false, '私人卡内容不能发给别人');
          }
        }
      }
    } else {
      const j = g.judgements.find((x) => !x.resolved);
      const voters = ps.filter((p) => p !== drawer);
      assert.equal((await act(drawer, { type: 'judge', judgementId: j.id, vote: true })).ok, false); // 不能给自己投
      assert.ok((await act(voters[0], { type: 'judge', judgementId: j.id, vote: false })).ok);
      assert.equal((await act(voters[0], { type: 'judge', judgementId: j.id, vote: true })).ok, false); // 重复
      assert.ok((await act(voters[1], { type: 'judge', judgementId: j.id, vote: true })).ok);
    }
  }
  // 结算私人秘密任务
  let loops = 0;
  while (ps[0].state.game.phase === 'settle') {
    assert.ok(loops++ < 10);
    const j = ps[0].state.game.judgements.find((x) => !x.resolved);
    assert.ok(j.secret);
    sawSecretTask++;
    const voters = ps.filter((p) => p.state.you !== j.subjectId);
    for (const v of voters) assert.ok((await act(v, { type: 'judge', judgementId: j.id, vote: true })).ok);
  }
  assert.equal(ps[0].state.game.phase, 'over');
  assert.ok(ps[1].state.game.secretAll, '游戏结束后公布暗分');
  const fin = ps[0].state.game.points;
  assert.ok((await emit(ps[0], 'game:end')).ok);
  await wait();
  for (const p of ps[0].state.players) {
    assert.equal(p.score, Math.max(0, fin[p.id]));
  }
  sockets.splice(0).forEach((s) => s.disconnect());
}
assert.ok(sawPrivate > 0, '6 局里应至少出现一次私人卡');
ok(`抽卡 6 局：轮流抽卡、任务投票、私人卡对他人完全隐藏（共出现 ${sawPrivate} 张私人卡，${sawSecretTask} 次秘密任务结算）、积分计入`);

sockets.forEach((s) => s.disconnect());
console.log(`\n全部 ${n} 项通过`);
process.exit(0);
