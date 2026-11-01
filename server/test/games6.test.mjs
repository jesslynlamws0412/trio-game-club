// 井字棋、五子棋（含电脑对手）、禁忌词挑战
// 需要：START_COUNTDOWN_MS=0 TABOO_REVEAL_MS=150 npm start
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const URL = process.env.URL ?? 'http://localhost:3001';
const emit = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 5000, what = '') => {
  const t0 = Date.now();
  while (!fn() && Date.now() - t0 < ms) await wait(30);
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
const socks = await Promise.all([1, 2, 3].map(mk));
const act = (s, a) => emit(s, 'game:action', a);

async function start(mode, count, gameId) {
  const list = socks.slice(0, count);
  const r = await emit(list[0], 'room:create', { nickname: 'P0', avatar: '🦊', mode });
  assert.ok(r.ok, JSON.stringify(r));
  for (let i = 1; i < count; i++) assert.ok((await emit(list[i], 'room:join', { code: r.code, nickname: 'P' + i, avatar: '🐻' })).ok);
  for (const s of list) await emit(s, 'room:vote', { gameId });
  for (const s of list) await emit(s, 'room:ready', { ready: true });
  assert.ok((await emit(list[0], 'room:start')).ok);
  await wait(150);
  return list;
}
async function reset() {
  for (const s of socks) await emit(s, 'room:leave');
  await wait(60);
}
const bySeat = (list) => {
  const v = list[0].state.game;
  return v.seats.map((id) => list.find((s) => s.state.you === id));
};
const stones = (s) => s.state.game.cells.filter((c) => c >= 0).length;

// ───────────── 井字棋（双人） ─────────────
{
  const list = await start('duo', 2, 'tictactoe');
  const [X, O] = bySeat(list);
  assert.equal(list[0].state.game.size, 3);
  assert.equal((await act(O, { type: 'place', x: 0, y: 0 })).ok, false);
  assert.equal((await act(X, { type: 'place', x: 3, y: 0 })).ok, false);
  assert.equal((await act(X, { type: 'place', x: 'a', y: 0 })).ok, false);
  assert.ok((await act(X, { type: 'place', x: 0, y: 0 })).ok);
  assert.equal((await act(O, { type: 'place', x: 0, y: 0 })).ok, false);
  ok('井字棋：不是你的回合 / 越界 / 非法数据 / 占用的格子，全部被拒绝');
  assert.ok((await act(O, { type: 'place', x: 0, y: 1 })).ok);
  assert.ok((await act(X, { type: 'place', x: 1, y: 0 })).ok);
  assert.ok((await act(O, { type: 'place', x: 1, y: 1 })).ok);
  assert.ok((await act(X, { type: 'place', x: 2, y: 0 })).ok);
  await wait(80);
  const v = list[0].state.game;
  assert.equal(v.over, true);
  assert.equal(v.winnerId, X.state.you);
  assert.equal(v.line.length, 3);
  assert.equal((await act(O, { type: 'place', x: 2, y: 2 })).ok, false);
  assert.equal(list[0].state.awards[X.state.you], 3);
  assert.equal(list[0].state.awards[O.state.you], 0);
  ok('井字棋：连成三个获胜，标出连线，结束后不能再落子，+3 / 0');
  await act(list[0], { type: 'noop' });
  assert.ok((await emit(list[0], 'game:end')).ok);
  await wait(100);
  // 第二局先手轮换
  for (const s of list) await emit(s, 'room:vote', { gameId: 'tictactoe' });
  for (const s of list) await emit(s, 'room:ready', { ready: true });
  assert.ok((await emit(list[0], 'room:start')).ok);
  await wait(150);
  assert.equal(list[0].state.game.seats[0], X.state.you === list[0].state.game.seats[0] ? O.state.you : list[0].state.game.seats[0]);
  assert.notEqual(list[0].state.game.seats[0], X.state.you);
  ok('第二局先手轮换');
  await reset();
}

// ───────────── 井字棋（单人对电脑） ─────────────
{
  const [me] = await start('solo', 1, 'tictactoe');
  assert.equal(me.state.game.cpu, true);
  assert.ok(me.state.game.seats.includes('cpu'));
  const mine = me.state.game.seats[0] === me.state.you;
  assert.equal(stones(me), mine ? 0 : 1, '电脑先手时已经下了第一步');
  for (let k = 0; k < 9 && !me.state.game.over; k++) {
    const cells = me.state.game.cells;
    const i = cells.findIndex((c) => c === -1);
    const r = await act(me, { type: 'place', x: i % 3, y: Math.floor(i / 3) });
    assert.ok(r.ok, JSON.stringify(r));
    await wait(50);
  }
  const v = me.state.game;
  assert.equal(v.over, true);
  const win = v.winnerId === me.state.you;
  const cpuWin = v.winnerId === 'cpu';
  assert.equal(me.state.awards[me.state.you], v.draw ? 1 : win ? 3 : 0);
  ok(`井字棋（单人）：电脑每步都会应对，结果${cpuWin ? '电脑赢' : win ? '玩家赢' : '平局'}，积分 ${me.state.awards[me.state.you]} 正确`);
  await reset();
}

// ───────────── 五子棋 ─────────────
{
  const list = await start('duo', 2, 'gomoku');
  const [B, W] = bySeat(list);
  assert.equal(list[0].state.game.size, 15);
  for (let x = 0; x < 4; x++) {
    assert.ok((await act(B, { type: 'place', x, y: 0 })).ok);
    assert.ok((await act(W, { type: 'place', x, y: 1 })).ok);
  }
  assert.equal(list[0].state.game.over, false);
  assert.ok((await act(B, { type: 'place', x: 4, y: 0 })).ok);
  await wait(80);
  const v = list[0].state.game;
  assert.equal(v.over, true);
  assert.equal(v.winnerId, B.state.you);
  assert.equal(v.line.length, 5);
  ok('五子棋：横向连成五个获胜');
  await reset();
}
{
  const [me] = await start('solo', 1, 'gomoku');
  // 玩家在棋盘四周落 3 子（选还空着的位置），电脑每次都要应对（电脑自己连五需要 5 子，这时还不会结束）
  const wanted = [[0, 0], [14, 14], [0, 14], [14, 0], [7, 0], [0, 7], [14, 7], [7, 14]];
  let count = stones(me);
  for (let k = 0; k < 3; k++) {
    const cells = me.state.game.cells;
    const [x, y] = wanted.find(([x, y]) => cells[y * 15 + x] === -1);
    const r1 = await act(me, { type: 'place', x, y });
    assert.ok(r1.ok, JSON.stringify(r1) + ' @' + x + ',' + y);
    await wait(40);
    count += 2;
    assert.equal(stones(me), count, '玩家落一子，电脑回一子');
  }
  assert.equal(me.state.game.over, false);
  ok('五子棋（单人）：玩家每落一子，电脑立刻回应一子');
  await reset();

  // 电脑会进攻：电脑先手时，只要玩家一直不防守，电脑很快就连成五个
  const [m2] = await start('solo', 1, 'gomoku');
  for (let k = 0; k < 40 && !m2.state.game.over; k++) {
    const cells = m2.state.game.cells;
    // 玩家只在远离中心的角落乱放，不防守
    const spots = [[0, 0], [14, 0], [0, 14], [14, 14], [0, 7], [14, 7], [7, 0], [7, 14], [1, 0], [13, 0], [0, 1], [14, 1], [1, 14], [13, 14], [0, 13], [14, 13], [2, 0], [12, 0], [0, 2], [14, 2]];
    const s = spots.find(([x, y]) => cells[y * 15 + x] === -1);
    if (!s) break;
    const r2 = await act(m2, { type: 'place', x: s[0], y: s[1] });
    assert.ok(r2.ok, JSON.stringify(r2) + ' @' + s + ' k=' + k);
    await wait(30);
  }
  const g2 = m2.state.game;
  assert.equal(g2.over, true, '玩家不防守时电脑应该能连成五个');
  assert.equal(g2.winnerId, 'cpu');
  assert.equal(g2.line.length >= 5, true);
  assert.equal(m2.state.awards[m2.state.you], 0);
  ok('五子棋（单人）：电脑会进攻，玩家不防守时电脑连成五个获胜（玩家 0 分）');
  await reset();
}
// ───────────── 禁忌词挑战 ─────────────
{
  const list = await start('duo', 2, 'taboo');
  const v0 = list[0].state.game;
  const desc = list.find((s) => s.state.you === v0.describerId);
  const guess = list.find((s) => s !== desc);
  assert.ok(desc.state.game.word && desc.state.game.banned.length === 3);
  assert.equal(guess.state.game.word, null);
  assert.equal(guess.state.game.banned, null);
  assert.ok(!JSON.stringify(guess.state).includes(desc.state.game.word), '猜词者的视图里没有答案');
  assert.ok(!JSON.stringify(guess.state.game).includes(desc.state.game.banned[0]), '猜词者看不到禁忌词');
  ok('禁忌词：只有描述者看到词语和禁忌词，猜词者的视图里没有');

  assert.equal((await act(guess, { type: 'hint', text: '随便说点什么' })).ok, false);
  assert.equal((await act(desc, { type: 'guess', text: '答案' })).ok, false);
  ok('猜词者不能描述，描述者不能猜');

  const word = desc.state.game.word;
  const ban = desc.state.game.banned[1];
  assert.ok((await act(desc, { type: 'hint', text: `这个东西叫${word}` })).ok);
  assert.ok((await act(desc, { type: 'hint', text: `和${ban}有关` })).ok);
  await wait(80);
  let g = guess.state.game;
  assert.equal(g.fouls, 2);
  assert.equal(g.points[desc.state.you], -2);
  assert.ok(g.log.filter((e) => e.kind === 'foul').every((e) => e.text === null));
  assert.ok(!JSON.stringify(guess.state.game.log).includes(word));
  ok('描述里说出词语或禁忌词：各扣 1 分，违规内容不会发给猜词者');

  assert.ok((await act(desc, { type: 'hint', text: '一种日常会用到的东西' })).ok);
  assert.ok((await act(guess, { type: 'guess', text: '不知道' })).ok);
  await wait(80);
  assert.equal(guess.state.game.log.filter((e) => e.kind === 'hint').length, 1);
  assert.equal(guess.state.game.log.filter((e) => e.kind === 'guess').length, 1);
  ok('合规的描述和错误的猜测都公开显示');

  assert.ok((await act(desc, { type: 'swap' })).ok);
  await wait(80);
  const newWord = desc.state.game.word;
  assert.equal(guess.state.game.log.length, 0);
  assert.equal(desc.state.game.points[desc.state.you], -3);
  ok('换词：扣 1 分，描述记录清空');

  assert.ok((await act(guess, { type: 'guess', text: ` ${newWord} ` })).ok);
  await wait(80);
  g = guess.state.game;
  assert.equal(g.phase, 'reveal');
  assert.equal(g.solvedBy, guess.state.you);
  assert.equal(g.word, newWord, '揭晓后大家都能看到答案');
  assert.equal(g.points[guess.state.you], 3);
  assert.equal(g.points[desc.state.you], -1);
  ok('猜对：猜词者 +3，描述者 +2，揭晓答案');

  // 打完剩下 3 个回合：每回合描述者都直接把词告诉对方（测试用），对方猜对
  for (let r = 1; r < 4; r++) {
    await until(() => list[0].state.game.round === r && list[0].state.game.phase === 'play', 4000, '下一回合');
    const d = list.find((s) => s.state.you === list[0].state.game.describerId);
    const gs = list.find((s) => s !== d);
    assert.ok((await act(gs, { type: 'guess', text: d.state.game.word })).ok);
    await wait(60);
  }
  await until(() => list[0].state.gameOver, 4000, '游戏结束');
  assert.equal(list[0].state.game.ranking.length, 2);
  ok('双人各当两次描述者，4 个回合打完进入排名');
  await reset();
}
{
  // 3 次违规，本回合作废
  const list = await start('trio', 3, 'taboo');
  const desc = list.find((s) => s.state.you === list[0].state.game.describerId);
  const w = desc.state.game.word;
  for (let k = 0; k < 3; k++) await act(desc, { type: 'hint', text: w });
  await wait(100);
  assert.equal(list[0].state.game.phase, 'reveal');
  assert.equal(list[0].state.game.solvedBy, null);
  ok('禁忌词：违规 3 次，本回合作废并揭晓');
  await reset();
}

console.log(`\n全部 ${n} 项通过`);
for (const s of socks) s.close();
process.exit(0);
