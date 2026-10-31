// 三款游戏的联机测试（含防泄密检查）。
// 先用较短的揭晓时间启动服务器：  $env:QUIZ_REVEAL_MS=200; npm start
// 再运行：node server/test/games.test.mjs
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
  s.on('room:state', (v) => (s.state = v));
  await new Promise((r) => s.on('connect', r));
  s.nick = name;
  sockets.push(s);
  return s;
}
const act = async (s, action) => {
  const r = await emit(s, 'game:action', action);
  await wait(60);
  return r;
};

/** 建一个 3 人房间，全部准备、全部投给 gameId，房主开始。返回 [房主, 乙, 丙]（顺序即座位顺序） */
async function startRoom(gameId) {
  const ps = await Promise.all([mk('甲'), mk('乙'), mk('丙')]);
  const c = await emit(ps[0], 'room:create', { nickname: '甲', avatar: '🦊' });
  await emit(ps[1], 'room:join', { code: c.code, nickname: '乙', avatar: '🐻' });
  await emit(ps[2], 'room:join', { code: c.code, nickname: '丙', avatar: '🐱' });
  for (const p of ps) {
    await emit(p, 'room:ready', { ready: true });
    await emit(p, 'room:vote', { gameId });
  }
  const r = await emit(ps[0], 'room:start');
  assert.ok(r.ok, JSON.stringify(r));
  await wait();
  return ps;
}
const byId = (ps, id) => ps.find((p) => p.state.you === id);
const scoreOf = (s, name) => s.state.players.find((p) => p.nickname === name).score;

// ───────────── 谁是卧底 ─────────────
async function undercover(civiliansWin) {
  const ps = await startRoom('undercover');
  assert.ok(ps.every((p) => p.state.phase === 'playing' && p.state.game.game === 'undercover'));
  const words = ps.map((p) => p.state.game.myWord);
  const odd = words.findIndex((w) => words.filter((x) => x === w).length === 1);
  assert.ok(odd >= 0, '应该恰好有 1 人拿到不同的词');
  const uc = ps[odd];
  const civs = ps.filter((p) => p !== uc);
  assert.ok(ps.every((p) => !JSON.stringify(p.state.game).includes('undercoverId')), '结束前不能泄露卧底身份');
  assert.ok(ps.every((p) => p.state.game.result === null));
  ok(`卧底词分配正确，且结束前视图不含卧底身份（卧底是${uc.nick}）`);

  for (const round of [1, 2]) {
    // 描述阶段：乱序/含原词会被拒绝
    const first = byId(ps, ps[0].state.game.turnPlayerId);
    const other = ps.find((p) => p !== first);
    assert.equal((await act(other, { type: 'describe', text: '我先说' })).ok, false);
    assert.equal((await act(first, { type: 'describe', text: first.state.game.myWord })).ok, false);
    if (round === 1) ok('没轮到的人、说出原词的描述都被拒绝');
    for (let i = 0; i < 3; i++) {
      const cur = byId(ps, ps[0].state.game.turnPlayerId);
      assert.ok((await act(cur, { type: 'describe', text: `第${round}轮描述${i}` })).ok);
    }
    assert.equal(ps[0].state.game.phase, 'discuss');
    assert.ok((await act(ps[1], { type: 'chat', text: '我觉得很可疑' })).ok);
    assert.equal(ps[2].state.game.chat.length >= 1, true);
    for (const p of ps) await act(p, { type: 'skip' });
    assert.equal(ps[0].state.game.phase, 'vote');
    if (round === 1) {
      assert.equal((await act(ps[0], { type: 'vote', target: ps[0].state.you })).ok, false);
      ok('描述、讨论、全员跳过后进入投票；不能投自己');
    }

    const wrongRound = round === 1 || !civiliansWin;
    const target = wrongRound ? civs[0] : uc; // 错投：全员投某个平民（该平民投另一个平民）
    for (const p of ps) {
      let t = target;
      if (p === target) t = wrongRound ? civs[1] : civs[0]; // 目标本人不能投自己
      const r = await act(p, { type: 'vote', target: t.state.you });
      assert.ok(r.ok, JSON.stringify(r));
      if (p === ps[0]) assert.equal((await act(p, { type: 'vote', target: t.state.you })).ok, false);
    }
    if (round === 1) {
      assert.equal(ps[0].state.game.phase, 'describe');
      assert.equal(ps[0].state.game.round, 2);
      ok('第 1 轮投错 → 进入第 2 轮；重复投票被拒绝');
    } else break;
  }
  const res = ps[0].state.game.result;
  assert.equal(res.winner, civiliansWin ? 'civilians' : 'undercover');
  assert.equal(res.undercoverId, uc.state.you);
  assert.equal(ps[1].state.gameOver, true);
  ok(`第 2 轮后结果：${civiliansWin ? '平民胜' : '卧底胜'}，真相公开`);
  assert.equal((await emit(ps[2], 'game:end')).ok, true);
  await wait();
  assert.equal(scoreOf(ps[0], uc.nick), civiliansWin ? 0 : 4);
  assert.equal(scoreOf(ps[0], civs[0].nick), civiliansWin ? 2 : 0);
  ok('结算返回大厅，积分正确计入排行榜');
}
await undercover(true);
await undercover(false);

// ───────────── 答题竞赛 ─────────────
{
  const ps = await startRoom('quiz');
  assert.equal(ps[0].state.game.total, 10);
  let seen = 0;
  while (ps[0].state.game.phase !== 'over') {
    const g = ps[0].state.game;
    assert.equal(g.phase, 'question');
    assert.equal(g.answer, undefined, '作答期间不能收到正确答案');
    assert.equal(JSON.stringify(g).includes('"answer"'), false);
    const idx = g.index;
    assert.ok((await act(ps[0], { type: 'answer', index: idx, choice: 0 })).ok);
    assert.equal((await act(ps[0], { type: 'answer', index: idx, choice: 1 })).ok, false); // 重复提交
    assert.equal((await act(ps[1], { type: 'answer', index: idx, choice: 99 })).ok, false); // 非法选项
    assert.ok((await act(ps[1], { type: 'answer', index: idx, choice: 0 })).ok);
    assert.equal((await act(ps[2], { type: 'answer', index: idx + 1, choice: 0 })).ok, false); // 题号不对
    assert.ok((await act(ps[2], { type: 'answer', index: idx, choice: 0 })).ok);
    assert.equal(ps[0].state.game.phase, 'reveal');
    assert.ok(Number.isInteger(ps[0].state.game.answer));
    seen++;
    for (let i = 0; i < 50 && ps[0].state.game.index === idx && ps[0].state.game.phase !== 'over'; i++) await wait(50);
  }
  assert.equal(seen, 10);
  const rk = ps[0].state.game.ranking;
  assert.equal(rk.length, 3);
  assert.equal(rk[0].rank, 1);
  ok('10 题全部完成：重复提交、非法选项、错题号被拒绝；作答期间不泄露答案');
  assert.equal((await emit(ps[1], 'game:end')).ok, true);
  await wait();
  const total = ps[0].state.players.reduce((s, p) => s + p.score, 0);
  assert.ok(total >= 6, `名次奖励应计入排行榜（共 ${total}）`);
  ok(`排名奖励计入积分榜（合计 ${total}）`);
}

// ───────────── 海龟汤 ─────────────
{
  const ps = await startRoom('turtlesoup');
  const [host, g1, g2] = ps;
  assert.equal(host.state.game.hostId, host.state.you);
  assert.ok(host.state.game.bank.length >= 10);
  assert.equal(g1.state.game.bank, null);
  assert.equal(g1.state.game.surface, null);
  assert.equal((await act(g1, { type: 'choose', puzzleId: 's1' })).ok, false);
  assert.equal((await act(g1, { type: 'ask', text: '他是男的吗' })).ok, false);
  assert.ok((await act(host, { type: 'choose', puzzleId: 's1' })).ok);
  assert.ok(g1.state.game.surface.length > 5);
  assert.equal(g1.state.game.answer, null);
  assert.equal(g2.state.game.answer, null);
  assert.ok(host.state.game.answer.length > 5);
  assert.equal(JSON.stringify(g1.state.game).includes(host.state.game.answer), false);
  ok('汤底只有主持人可见；非主持人不能选题；开始前不能提问');

  assert.equal((await act(host, { type: 'ask', text: '我能问吗' })).ok, false);
  assert.ok((await act(g1, { type: 'ask', text: '他是男的吗' })).ok);
  const qid = host.state.game.log[0].id;
  assert.equal((await act(g1, { type: 'reply', entryId: qid, reply: '是' })).ok, false);
  assert.equal((await act(host, { type: 'reply', entryId: qid, reply: '随便' })).ok, false);
  assert.ok((await act(host, { type: 'reply', entryId: qid, reply: '是' })).ok);
  assert.equal((await act(host, { type: 'reply', entryId: qid, reply: '不是' })).ok, false);
  assert.equal(g2.state.game.log[0].reply, '是');
  ok('提问与回答：非主持人不能回答，无效/重复回答被拒绝，三端同步');

  assert.ok((await act(g2, { type: 'guess', text: '海龟汤其实是人肉' })).ok);
  const gid = host.state.game.log[1].id;
  assert.ok((await act(host, { type: 'reply', entryId: gid, reply: '猜对' })).ok);
  assert.equal(g1.state.gameOver, true);
  assert.ok(g1.state.game.answer.length > 5);
  ok('猜对后结束，汤底对所有人公开');
  await emit(g1, 'game:end');
  await wait();
  assert.equal(scoreOf(host, '丙'), 3);
  assert.equal(scoreOf(host, '甲'), 1);
  ok('猜对者 +3、主持人 +1');

  // 轮换主持人：同一房间再来一局，主持人应变成下一位
  for (const p of ps) {
    await emit(p, 'room:ready', { ready: true });
    await emit(p, 'room:vote', { gameId: 'turtlesoup' });
  }
  assert.ok((await emit(host, 'room:start')).ok);
  await wait();
  assert.equal(host.state.game.hostId, g1.state.you);
  ok('第二局主持人轮换为乙');
}

sockets.forEach((s) => s.disconnect());
console.log(`\n全部 ${n} 项通过`);
process.exit(0);
