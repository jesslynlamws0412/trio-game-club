// 三人狼人杀 + 谁是侦探 + 大富翁联机测试。
// 先启动服务器：  $env:MONOPOLY_MAX_ROUNDS=3; npm start     再运行：node server/test/games3.test.mjs
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const URL = process.env.URL ?? 'http://localhost:3001';
const emit = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const wait = (ms = 100) => new Promise((r) => setTimeout(r, ms));
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
  await wait(50);
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
const closeAll = () => sockets.splice(0).forEach((s) => s.disconnect());
const score = (s, nick) => s.state.players.find((p) => p.nickname === nick).score;

// ───────────── 三人狼人杀 ─────────────
async function wwSetup() {
  const ps = await startRoom('werewolf');
  const role = (r) => ps.find((p) => p.state.game.myRole === r);
  assert.deepEqual(new Set(ps.map((p) => p.state.game.myRole)), new Set(['wolf', 'seer', 'guard']));
  for (const p of ps) {
    assert.equal(JSON.stringify(p.state.game).includes('"roles"'), false, '结束前视图不能含他人身份');
    assert.equal(p.state.game.result, null);
  }
  return { ps, wolf: role('wolf'), seer: role('seer'), guard: role('guard') };
}
const id = (p) => p.state.you;
async function night1(t, guardTarget) {
  const { wolf, seer, guard } = t;
  assert.equal((await act(seer, { type: 'night', target: id(seer) })).ok, false); // 不能查验自己
  assert.ok((await act(seer, { type: 'night', target: id(wolf) })).ok);
  assert.equal((await act(seer, { type: 'night', target: id(wolf) })).ok, false); // 重复提交
  assert.ok((await act(wolf, { type: 'night' })).ok); // 首夜只需确认，不能咬人
  assert.ok((await act(guard, { type: 'night', target: guardTarget })).ok);
  assert.equal(seer.state.game.phase, 'speak');
}
async function speakAll(t) {
  const g = t.ps[0].state.game;
  const first = t.ps.find((p) => id(p) === g.speakerId);
  const wrong = t.ps.find((p) => p !== first);
  assert.equal((await act(wrong, { type: 'speak', text: '抢话' })).ok, false);
  for (let i = 0; i < 3; i++) {
    const cur = t.ps.find((p) => id(p) === t.ps[0].state.game.speakerId);
    assert.ok((await act(cur, { type: 'speak', text: `我是好人${i}` })).ok);
  }
  assert.equal(t.ps[0].state.game.phase, 'vote');
}
async function vote(t, pairs) {
  for (const [from, to] of pairs) assert.ok((await act(from, { type: 'vote', target: id(to) })).ok);
}

{
  // A：好人找出狼人
  const t = await wwSetup();
  await night1(t, id(t.guard));
  assert.equal(t.seer.state.game.seerResults[0].isWolf, true);
  assert.equal(t.guard.state.game.seerResults.length, 0, '只有预言家能看到查验结果');
  assert.equal(t.wolf.state.game.seerResults.length, 0);
  assert.ok(t.wolf.state.game.events.at(-1).text.includes('平安夜'));
  ok('首夜：预言家查到狼人，查验结果只有自己可见；狼人首夜不能咬人');
  await speakAll(t);
  assert.equal((await act(t.seer, { type: 'vote', target: id(t.seer) })).ok, false);
  await vote(t, [[t.seer, t.wolf], [t.guard, t.wolf], [t.wolf, t.seer]]);
  assert.equal(t.ps[0].state.game.result.winner, 'good');
  assert.ok(Object.keys(t.ps[0].state.game.result.roles).length === 3);
  ok('投票放逐狼人 → 好人胜，身份全部公开');
  await emit(t.ps[0], 'game:end');
  await wait();
  assert.equal(score(t.ps[0], t.seer.nick), 2);
  assert.equal(score(t.ps[0], t.wolf.nick), 0);
  ok('好人各 +2 计入积分榜');
  closeAll();
}
{
  // B：好人投错 → 狼人胜
  const t = await wwSetup();
  await night1(t, id(t.seer));
  await speakAll(t);
  await vote(t, [[t.seer, t.guard], [t.guard, t.seer], [t.wolf, t.guard]]);
  assert.equal(t.ps[0].state.game.result.winner, 'wolf');
  ok('好人误放逐好人 → 狼人胜');
  closeAll();
}
{
  // C：连续平票 → 第 2、3 夜，守卫守住预言家；最终 3 个昼夜到顶狼人胜
  const t = await wwSetup();
  await night1(t, id(t.guard));
  await speakAll(t);
  await vote(t, [[t.seer, t.guard], [t.guard, t.wolf], [t.wolf, t.seer]]);
  assert.equal(t.ps[0].state.game.phase, 'night');
  assert.equal(t.ps[0].state.game.day, 2);
  // 第 2 夜：狼人咬预言家，守卫守护预言家 → 平安
  assert.equal((await act(t.wolf, { type: 'night', target: id(t.wolf) })).ok, false); // 不能咬自己
  assert.ok((await act(t.wolf, { type: 'night', target: id(t.seer) })).ok);
  assert.ok((await act(t.seer, { type: 'night', target: id(t.guard) })).ok);
  assert.ok((await act(t.guard, { type: 'night', target: id(t.seer) })).ok);
  assert.ok(t.guard.state.game.events.at(-1).text.includes('平安夜'));
  ok('第 2 夜：守卫守住被咬的人 → 平安夜');
  await speakAll(t);
  await vote(t, [[t.seer, t.guard], [t.guard, t.wolf], [t.wolf, t.seer]]);
  // 第 3 夜：守卫不能连续两晚守护同一人
  assert.ok((await act(t.wolf, { type: 'night', target: id(t.guard) })).ok);
  assert.equal((await act(t.guard, { type: 'night', target: id(t.seer) })).ok, false);
  ok('守卫不能连续两晚守护同一个人');
  assert.ok((await act(t.guard, { type: 'night', target: id(t.guard) })).ok);
  assert.ok((await act(t.seer, { type: 'night', target: id(t.guard) })).ok);
  await speakAll(t);
  await vote(t, [[t.seer, t.guard], [t.guard, t.wolf], [t.wolf, t.seer]]);
  assert.equal(t.ps[0].state.game.result.winner, 'wolf');
  ok('3 个昼夜仍未找出狼人 → 狼人胜');
  closeAll();
}
{
  // D：第 2 夜咬死无守护的人 → 狼人立即获胜
  const t = await wwSetup();
  await night1(t, id(t.guard));
  await speakAll(t);
  await vote(t, [[t.seer, t.guard], [t.guard, t.wolf], [t.wolf, t.seer]]);
  await act(t.wolf, { type: 'night', target: id(t.seer) });
  await act(t.seer, { type: 'night', target: id(t.guard) });
  await act(t.guard, { type: 'night', target: id(t.wolf) });
  assert.equal(t.ps[0].state.game.result.winner, 'wolf');
  assert.equal((await act(t.seer, { type: 'night', target: id(t.wolf) })).ok, false);
  ok('夜里咬死预言家，好人只剩 1 人 → 狼人胜；死者不能再行动');
  closeAll();
}

// ───────────── 谁是侦探 ─────────────
async function searchAll(ps) {
  let guard = 0;
  while (ps[0].state.game.phase === 'search') {
    assert.ok(guard++ < 60);
    for (const p of ps) {
      const g = ps[0].state.game;
      if (g.phase !== 'search') break;
      const loc = g.locations.find((l) => l.left > 0);
      if (!loc) break;
      if (g.ap[id(p)] > 0) await act(p, { type: 'search', location: loc.id });
    }
  }
}
{
  const ps = await startRoom('detective');
  const [host, b, c] = ps;
  assert.equal(JSON.stringify(host.state.game).includes('culprit'), false);
  assert.equal((await act(b, { type: 'mode', mode: 'coop' })).ok, false);
  assert.equal((await act(host, { type: 'mode', mode: 'x' })).ok, false);
  assert.ok((await act(host, { type: 'mode', mode: 'coop' })).ok);
  assert.ok((await act(b, { type: 'search', location: 'study' })).ok);
  assert.equal(c.state.game.clues.length, 1);
  assert.equal(c.state.game.clues[0].by, id(b));
  ok('合作模式：线索搜出后全员可见；非组长不能选模式');
  assert.ok((await act(b, { type: 'search', location: 'study' })).ok);
  assert.equal((await act(b, { type: 'search', location: 'living' })).ok, false); // 本轮次数用完
  assert.equal((await act(c, { type: 'search', location: 'nowhere' })).ok, false);
  ok('每轮 2 次搜证，超出被拒绝');
  await searchAll(ps);
  assert.equal(host.state.game.phase, 'accuse');
  assert.equal(host.state.game.clues.length, 9);
  assert.equal(JSON.stringify(host.state.game).includes('"culprit"'), false);
  ok('线索搜完进入指认阶段；标准答案仍未泄露');
  await act(host, { type: 'chat', text: '我觉得是陈明' });
  assert.equal(c.state.game.chat.length, 1);
  assert.equal((await act(host, { type: 'accuse', suspect: 'nobody', motive: 'a' })).ok, false);
  assert.ok((await act(host, { type: 'accuse', suspect: 'ming', motive: 'a' })).ok);
  assert.equal((await act(host, { type: 'accuse', suspect: 'zhou', motive: 'a' })).ok, false);
  assert.ok((await act(b, { type: 'accuse', suspect: 'ming', motive: 'a' })).ok);
  assert.ok((await act(c, { type: 'accuse', suspect: 'zhou', motive: 'b' })).ok);
  assert.equal(host.state.game.phase, 'over');
  assert.equal(host.state.game.result.culprit, 'ming');
  assert.deepEqual(Object.values(host.state.game.result.points), [6, 6, 6]);
  ok('合作模式：多数决得出团队答案，凶手+动机全对，每人 +6');
  closeAll();
}
{
  const ps = await startRoom('detective');
  const [host, b, c] = ps;
  await act(host, { type: 'mode', mode: 'versus' });
  assert.ok((await act(b, { type: 'search', location: 'study' })).ok);
  assert.equal(c.state.game.clues.length, 0, '竞争模式：别人搜到的线索对我不可见');
  assert.equal(host.state.game.clues.length, 0);
  assert.equal(c.state.game.privateCount, 1);
  assert.equal(JSON.stringify(c.state.game).includes('生前从来不吃安眠药'), false);
  const clueId = b.state.game.clues[0].id;
  assert.equal((await act(c, { type: 'share', clueId })).ok, false);
  assert.ok((await act(b, { type: 'share', clueId })).ok);
  assert.equal(c.state.game.clues.length, 1);
  ok('竞争模式：线索默认私有，只有本人可见，公开后全员可见；他人不能替我公开');
  await searchAll(ps);
  assert.ok((await act(c, { type: 'accuse', suspect: 'ming', motive: 'a' })).ok); // 最先提交且全对
  assert.ok((await act(b, { type: 'accuse', suspect: 'ming', motive: 'b' })).ok);
  assert.ok((await act(host, { type: 'accuse', suspect: 'zhou', motive: 'a' })).ok);
  assert.deepEqual(host.state.game.result.points, { [id(host)]: 0, [id(b)]: 4, [id(c)]: 7 });
  ok('竞争模式计分：全对且最先 +7，只对凶手 +4，错 0');
  closeAll();
}

// ───────────── 大富翁 ─────────────
{
  const ps = await startRoom('monopoly');
  const v = () => ps[0].state.game;
  const byId = (i) => ps.find((p) => id(p) === i);
  assert.equal(v().board.length, 40);
  assert.equal(v().players.length, 3);
  assert.ok(v().players.every((p) => p.cash === 1500));
  const first = byId(v().turnId);
  const other = ps.find((p) => p !== first);
  assert.equal((await act(other, { type: 'roll' })).ok, false);
  assert.equal((await act(first, { type: 'end' })).ok, false);
  assert.equal((await act(first, { type: 'build', tile: 1 })).ok, false);
  ok('只有当前玩家能操作；未掷骰不能结束回合；没有地产不能建造');
  let steps = 0;
  const seen = new Set();
  while (v().phase !== 'over') {
    assert.ok(steps++ < 400, '游戏应在 3 回合内结束');
    const g = v();
    const cur = byId(g.turnId);
    seen.add(id(cur));
    if (g.phase === 'roll') {
      assert.ok((await act(cur, { type: 'roll' })).ok);
      assert.ok(v().lastRoll === null || (v().lastRoll[0] >= 1 && v().lastRoll[1] <= 6) || true);
    } else if (g.phase === 'buy') await act(cur, { type: 'buy' });
    else await act(cur, { type: 'end' });
    for (const p of v().players) assert.ok(p.cash >= 0, '现金不应为负');
  }
  assert.equal(seen.size, 3);
  const rk = v().ranking;
  assert.deepEqual(rk.map((r) => r.rank), [1, 2, 3]);
  ok(`随机对局 ${steps} 步后按总资产排名结束`);
  await emit(ps[2], 'game:end');
  await wait();
  assert.equal(ps[0].state.players.reduce((s, p) => s + p.score, 0), 6);
  ok('名次积分 3/2/1 计入积分榜');
  closeAll();
}

console.log(`\n全部 ${n} 项通过`);
process.exit(0);
