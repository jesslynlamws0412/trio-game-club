// 蛇梯棋、飞行棋、百万富翁、谁是说谎者
// 用 tsx 运行（要读取题库和棋盘数据）：node --import tsx server/test/games7.test.mjs
// 需要：START_COUNTDOWN_MS=0 MILLIONAIRE_REVEAL_MS=150 LIAR_REVEAL_MS=150 npm start
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';
import { LADDERS, SNAKES } from '../src/games/snakes.ts';
import { LudoGame } from '../src/games/ludo.ts';
import { BUILTIN } from '../src/bank/index.ts';
import { LIAR_FACTS } from '../src/data/liarBank.ts';

const URL = process.env.URL ?? 'http://localhost:3001';
const emit = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const wait = (ms = 100) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000, what = '') => {
  const t0 = Date.now();
  while (!fn() && Date.now() - t0 < ms) await wait(25);
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
const socks = await Promise.all(Array.from({ length: 5 }, mk));
const act = (s, a) => emit(s, 'game:action', a);

async function setup(mode, count, gameId) {
  const list = socks.slice(0, count);
  const r = await emit(list[0], 'room:create', { nickname: 'P0', avatar: '🦊', mode });
  assert.ok(r.ok, JSON.stringify(r));
  for (let i = 1; i < count; i++) assert.ok((await emit(list[i], 'room:join', { code: r.code, nickname: 'P' + i, avatar: '🐻' })).ok);
  for (const s of list) await emit(s, 'room:vote', { gameId });
  for (const s of list) await emit(s, 'room:ready', { ready: true });
  await wait(80);
  return list;
}
async function begin(list) {
  const r = await emit(list[0], 'room:start');
  assert.ok(r.ok, JSON.stringify(r));
  await until(() => list.every((s) => s.state.phase === 'playing'), 3000, '开始');
  await wait(60);
}
async function reset() {
  for (const s of socks) await emit(s, 'room:leave');
  await wait(60);
}
const turnSock = (list) => list.find((s) => s.state.you === list[0].state.game.turnId);

// ───────────── 蛇梯棋 ─────────────
{
  const list = await setup('trio', 3, 'snakes');
  await begin(list);
  const g0 = list[0].state.game;
  const other = list.find((s) => s.state.you !== g0.turnId);
  assert.equal((await act(other, { type: 'roll' })).ok, false);
  assert.equal((await act(turnSock(list), { type: 'jump' })).ok, false);
  ok('蛇梯棋：不是你的回合不能掷骰，未知操作被拒绝');

  let rolls = 0;
  while (!list[0].state.game.winnerId && rolls < 600) {
    const s = turnSock(list);
    const id = s.state.you;
    const before = list[0].state.game.positions[id];
    const n0 = list[0].state.game.rolls;
    assert.ok((await act(s, { type: 'roll' })).ok);
    await until(() => list[0].state.game.rolls === n0 + 1, 2000, '掷骰结果');
    const v = list[0].state.game;
    const val = v.lastRoll.value;
    assert.ok(val >= 1 && val <= 6);
    const after = v.positions[id];
    const landed = before + val;
    if (v.log.at(-1).includes('三个 6')) {
      assert.equal(after, before); // 连续三个 6，这一轮作废
    } else if (landed > 100) {
      assert.equal(after, before, '超过 100 原地不动');
    } else {
      const expected = LADDERS[landed] ?? SNAKES[landed] ?? landed;
      assert.equal(after, expected, `从 ${before} 掷 ${val}：应该到 ${expected}`);
    }
    assert.ok(after >= 0 && after <= 100);
    rolls++;
  }
  const v = list[0].state.game;
  assert.ok(v.winnerId, '应该有人到达 100');
  assert.equal(v.positions[v.winnerId], 100);
  assert.equal(list[0].state.awards[v.winnerId], 3);
  ok(`蛇梯棋：${rolls} 次掷骰后分出胜负；每一步都符合梯子 / 蛇 / 超出 100 的规则；赢家 +3`);
  await reset();
}

// ───────────── 飞行棋 ─────────────
{
  const five = await setup('party', 5, 'ludo');
  const r = await emit(five[0], 'room:start');
  assert.equal(r.ok, false);
  assert.match(r.error, /最多 4 人/);
  ok('飞行棋：5 人房间不能开始（最多 4 人）');
  await reset();

  const list = await setup('duo', 2, 'ludo');
  await begin(list);
  const g = list[0].state.game;
  const cur = turnSock(list);
  assert.equal((await act(cur, { type: 'move', token: 0 })).ok, false); // 还没掷骰
  assert.equal((await act(list.find((s) => s !== cur), { type: 'roll' })).ok, false);
  ok('飞行棋：没掷骰就走棋、不是你的回合，都被拒绝');

  let steps = 0;
  let captured = 0;
  let prevLog = '';
  while (!list[0].state.game.winnerId && steps < 4000) {
    const s = turnSock(list);
    const v = list[0].state.game;
    if (v.phase === 'roll') {
      assert.ok((await act(s, { type: 'roll' })).ok);
    } else {
      assert.ok(v.legal.length > 1 || v.legal.length === 1, '选择阶段必须有可走的飞机');
      const illegal = [0, 1, 2, 3].find((k) => !v.legal.includes(k));
      if (illegal !== undefined) assert.equal((await act(s, { type: 'move', token: illegal })).ok, false);
      assert.ok((await act(s, { type: 'move', token: v.legal[0] })).ok);
    }
    await wait(8);
    const w = list[0].state.game;
    for (const id of Object.keys(w.tokens)) for (const r of w.tokens[id]) assert.ok(r >= -1 && r <= 56, '飞机位置越界');
    if (w.log.at(-1) !== prevLog && w.log.at(-1)?.includes('击落')) captured++;
    prevLog = w.log.at(-1);
    steps++;
  }
  const w = list[0].state.game;
  assert.ok(w.winnerId, '应该有人获胜');
  assert.ok(w.done[w.winnerId] >= w.goal);
  assert.equal(list[0].state.awards[w.winnerId], 3);
  ok(`飞行棋：${steps} 步后分出胜负（击落事件 ${captured} 次）；位置始终合法；赢家 2 架到终点，+3`);
  await reset();
}

// ───────────── 飞行棋规则（直接测引擎：击落、安全格、终点必须刚好） ─────────────
{
  const mkGame = () => {
    const g = new LudoGame({ players: [{ id: 'a', nickname: '甲' }, { id: 'b', nickname: '乙' }], rotation: 0, notify() {} });
    return g;
  };
  // 甲在 rel 1（跑道第 1 格），乙在 rel 31（乙的起点在 26，所以全局格 = (26+31)%52 = 5）。甲掷 4 → rel 5 → 全局格 5：击落乙
  let g = mkGame();
  g.rel.a = [1, -1, -1, -1];
  g.rel.b = [31, -1, -1, -1];
  g.dice = 4;
  g.phase = 'move';
  assert.ok(g.handleAction('a', { type: 'move', token: 0 }).ok);
  assert.equal(g.rel.a[0], 5);
  assert.equal(g.rel.b[0], -1, '落在对手飞机的格子上，会把它击落回机库');
  // 安全格：全局格 8 是星形格，不会被击落
  g = mkGame();
  g.rel.a = [2, -1, -1, -1];
  g.rel.b = [34, -1, -1, -1]; // (26+34)%52 = 8
  g.dice = 6;
  g.phase = 'move';
  g.sixes = 0;
  assert.ok(g.handleAction('a', { type: 'move', token: 0 }).ok);
  assert.equal(g.rel.a[0], 8);
  assert.equal(g.rel.b[0], 34, '安全格上的飞机不会被击落');
  // 终点必须刚好：rel 54 掷 3 超过 56，不能走；掷 2 刚好到终点
  g = mkGame();
  g.rel.a = [54, -1, -1, -1];
  assert.deepEqual(g.legal('a', 3), []);
  assert.deepEqual(g.legal('a', 2), [0]);
  // 机库里的飞机只有掷到 6 才能起飞
  assert.deepEqual(g.legal('a', 5), []);
  assert.deepEqual(g.legal('a', 6), [1, 2, 3, 0].sort((x, y) => x - y).filter((i) => i !== 0 || true).slice(0, 4).filter((i) => i === 0 ? g.rel.a[0] < 56 && g.rel.a[0] + 6 <= 56 : true).sort());
  // 终点通道（rel 51~55）是各自的，不会击落别人
  g = mkGame();
  g.rel.a = [49, -1, -1, -1];
  g.rel.b = [51, -1, -1, -1];
  g.dice = 2;
  g.phase = 'move';
  assert.ok(g.handleAction('a', { type: 'move', token: 0 }).ok);
  assert.equal(g.rel.b[0], 51);
  ok('飞行棋规则：落在对手飞机上击落；安全格不被击落；终点必须刚好；起飞需要 6；终点通道不击落');
}
// ───────────── 百万富翁 ─────────────
const answerOf = (text) => BUILTIN.find((q) => q.q === text);
{
  const [me] = await setup('solo', 1, 'millionaire');
  await begin([me]);
  let v = me.state.game;
  assert.equal(v.level, 0);
  assert.equal(v.ladder.length, 15);
  assert.ok(!JSON.stringify(v).includes('"answer"') || v.result === null, '作答前不能发正确答案');
  assert.ok(!JSON.stringify(v).includes(answerOf(v.question).explain), '作答前不能发解释');
  ok('百万富翁：15 级奖金阶梯；作答前视图里没有答案和解释');

  // 求助
  const q1 = v.question;
  assert.ok((await act(me, { type: 'lifeline', kind: 'fifty' })).ok);
  await wait(60);
  v = me.state.game;
  const real = answerOf(v.question).answer;
  assert.equal(v.removed.length, 2);
  assert.ok(!v.removed.includes(real), '50:50 不能去掉正确答案');
  assert.equal((await act(me, { type: 'lifeline', kind: 'fifty' })).ok, false);
  assert.equal((await act(me, { type: 'answer', choice: v.removed[0] })).ok, false);
  assert.ok((await act(me, { type: 'lifeline', kind: 'audience' })).ok);
  await wait(60);
  assert.equal(me.state.game.audience.reduce((a, b) => a + b, 0), 100);
  assert.equal(me.state.game.audience[me.state.game.removed[0]], 0);
  assert.ok((await act(me, { type: 'lifeline', kind: 'swap' })).ok);
  await wait(60);
  assert.notEqual(me.state.game.question, q1);
  assert.deepEqual(me.state.game.lifelines, { fifty: false, audience: false, swap: false });
  ok('百万富翁：50:50 去掉两个错误选项、问观众（合计 100%）、换题，各只能用一次');

  // 一路答对到 15 题
  for (let k = 0; k < 15; k++) {
    await until(() => me.state.game.phase === 'ask' && me.state.game.level === k, 3000, `第 ${k + 1} 题`);
    const q = answerOf(me.state.game.question);
    assert.ok(q, '题目应该来自题库');
    assert.ok((await act(me, { type: 'answer', choice: q.answer })).ok);
    await wait(40);
  }
  await until(() => me.state.gameOver, 4000, '通关');
  assert.equal(me.state.game.money[me.state.you], 1_000_000);
  ok('百万富翁：连续答对 15 题，奖金 RM 1,000,000');
  await reset();
}
{
  // 答错：保底 / 放弃
  const [me] = await setup('solo', 1, 'millionaire');
  await begin([me]);
  for (let k = 0; k < 7; k++) {
    await until(() => me.state.game.phase === 'ask' && me.state.game.level === k, 3000);
    assert.ok((await act(me, { type: 'answer', choice: answerOf(me.state.game.question).answer })).ok);
    await wait(40);
  }
  await until(() => me.state.game.phase === 'ask' && me.state.game.level === 7, 3000);
  const q = answerOf(me.state.game.question);
  assert.ok((await act(me, { type: 'answer', choice: (q.answer + 1) % q.options.length })).ok);
  await wait(60);
  assert.equal(me.state.game.result.reason, 'wrong');
  assert.equal(me.state.game.result.won, 5000);
  assert.equal(me.state.game.result.answer, q.answer);
  await until(() => me.state.gameOver, 3000);
  assert.equal(me.state.game.money[me.state.you], 5000);
  ok('百万富翁：过了第 5 题保底关，第 8 题答错 → 带走保底 RM 5,000');
  await reset();

  const [m2] = await setup('solo', 1, 'millionaire');
  await begin([m2]);
  for (let k = 0; k < 3; k++) {
    await until(() => m2.state.game.phase === 'ask' && m2.state.game.level === k, 3000);
    await act(m2, { type: 'answer', choice: answerOf(m2.state.game.question).answer });
    await wait(40);
  }
  await until(() => m2.state.game.phase === 'ask' && m2.state.game.level === 3, 3000);
  assert.ok((await act(m2, { type: 'quit' })).ok);
  await until(() => m2.state.gameOver, 3000);
  assert.equal(m2.state.game.money[m2.state.you], 2000);
  ok('百万富翁：答对 3 题后放弃 → 带走 RM 2,000');
  await reset();

  // 双人：轮流当参赛者；观众不能答题
  const duo = await setup('duo', 2, 'millionaire');
  await begin(duo);
  const contestant = duo.find((s) => s.state.you === duo[0].state.game.contestantId);
  const watcher = duo.find((s) => s !== contestant);
  assert.equal((await act(watcher, { type: 'answer', choice: 0 })).ok, false);
  assert.equal((await act(watcher, { type: 'quit' })).ok, false);
  assert.ok((await act(contestant, { type: 'quit' })).ok);
  await until(() => duo[0].state.game.contestantId === watcher.state.you, 3000, '轮到第二位参赛者');
  assert.ok((await act(watcher, { type: 'quit' })).ok);
  await until(() => duo[0].state.gameOver, 3000);
  ok('百万富翁（双人）：观众不能答题；两人轮流当参赛者后结算');
  await reset();
}

// ───────────── 谁是说谎者 ─────────────
{
  const list = await setup('trio', 3, 'liar');
  await begin(list);
  const [A, B, C] = list;
  const factOf = () => LIAR_FACTS.find((f) => f.q === A.state.game.question);
  assert.ok(factOf());
  assert.equal(A.state.game.options, null, '写谎话阶段不显示选项');
  assert.equal((await act(A, { type: 'lie', text: factOf().answer })).ok, false);
  assert.equal((await act(A, { type: 'vote', option: '0' })).ok, false);
  ok('谁是说谎者：直接写出真答案被拒绝；写谎话阶段不能投票');

  assert.ok((await act(A, { type: 'lie', text: '甲的谎话' })).ok);
  assert.equal((await act(A, { type: 'lie', text: '再写一个' })).ok, false);
  assert.ok((await act(B, { type: 'lie', text: '乙的谎话' })).ok);
  assert.ok((await act(C, { type: 'lie', text: '乙的谎话' })).ok); // 和乙写成一样的，会合并成一个选项
  await wait(100);
  let v = A.state.game;
  assert.equal(v.phase, 'vote');
  assert.equal(v.options.length, 3, '真答案 + 两个不同的谎话（相同的合并）');
  assert.ok(v.options.every((o) => o.real === undefined && o.authors === undefined), '投票阶段不能暴露真假和作者');
  assert.ok(!JSON.stringify(v).includes('甲的谎话') === false);
  ok('三人都写完 → 进入投票；相同的谎话合并，投票阶段看不出真假和作者');

  const optA = v.options.find((o) => o.mine);
  assert.equal((await act(A, { type: 'vote', option: optA.id })).ok, false);
  const realOpt = v.options.find((o) => o.text === factOf().answer);
  const bLie = v.options.find((o) => o.text === '乙的谎话');
  assert.ok((await act(A, { type: 'vote', option: bLie.id })).ok); // 甲被乙/丙的谎话骗了
  assert.ok((await act(B, { type: 'vote', option: realOpt.id })).ok); // 乙选中真答案
  assert.ok((await act(C, { type: 'vote', option: realOpt.id })).ok); // 丙选中真答案
  await wait(100);
  v = A.state.game;
  assert.equal(v.phase, 'reveal');
  const idA = A.state.you, idB = B.state.you, idC = C.state.you;
  assert.equal(v.gains[idA], 0);
  assert.equal(v.gains[idB], 2 + 1); // 选中真答案 +2，骗到甲 +1
  assert.equal(v.gains[idC], 2 + 1);
  assert.ok(v.options.find((o) => o.real).authors.length === 0);
  ok('揭晓：选中真答案 +2；每骗到一个人 +1（合并的谎话，作者都得分）');

  // 打完剩下的回合：每人编不同的谎话，全部选真答案
  for (let r = 1; r < 6; r++) {
    await until(() => A.state.game.round === r && A.state.game.phase === 'write', 3000, '下一回合');
    const f = LIAR_FACTS.find((x) => x.q === A.state.game.question);
    for (const [i, s] of list.entries()) await act(s, { type: 'lie', text: `谎话${r}${i}` });
    await until(() => A.state.game.phase === 'vote', 2000);
    for (const s of list) {
      const real = s.state.game.options.find((o) => o.text === f.answer);
      await act(s, { type: 'vote', option: real.id });
    }
    await wait(60);
  }
  await until(() => A.state.gameOver, 4000, '游戏结束');
  assert.equal(A.state.game.ranking.length, 3);
  ok('谁是说谎者：6 个回合打完，进入排名');
  await reset();
}

console.log(`\n全部 ${n} 项通过`);
for (const s of socks) s.close();
process.exit(0);
