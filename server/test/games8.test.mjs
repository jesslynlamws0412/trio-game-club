// UNO、叠叠高、保龄球、投篮机、羊了个羊
// 用 tsx 运行：node --import tsx server/test/games8.test.mjs
// 需要：START_COUNTDOWN_MS=0 BOWL_REVEAL_MS=100 BASKET_REVEAL_MS=100 npm start
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';
import { scoreFrames } from '../src/games/bowling.ts';

const URL = process.env.URL ?? 'http://localhost:3001';
const emit = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const wait = (ms = 100) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000, what = '') => {
  const t0 = Date.now();
  while (!fn() && Date.now() - t0 < ms) await wait(20);
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
const socks = await Promise.all(Array.from({ length: 4 }, mk));
const act = (s, a) => emit(s, 'game:action', a);

async function setup(mode, count, gameId) {
  const list = socks.slice(0, count);
  const r = await emit(list[0], 'room:create', { nickname: 'P0', avatar: '🦊', mode });
  assert.ok(r.ok, JSON.stringify(r));
  for (let i = 1; i < count; i++) assert.ok((await emit(list[i], 'room:join', { code: r.code, nickname: 'P' + i, avatar: '🐻' })).ok);
  for (const s of list) await emit(s, 'room:vote', { gameId });
  for (const s of list) await emit(s, 'room:ready', { ready: true });
  await wait(80);
  assert.ok((await emit(list[0], 'room:start')).ok);
  await until(() => list.every((s) => s.state.phase === 'playing'), 3000, '开始');
  await wait(80);
  return list;
}
async function reset() {
  for (const s of socks) await emit(s, 'room:leave');
  await wait(60);
}
const turnSock = (list) => list.find((s) => s.state.you === list[0].state.game.turnId);

// ───────────── 保龄球计分（标准算法） ─────────────
{
  assert.equal(scoreFrames(Array(12).fill(10)).total, 300);
  assert.equal(scoreFrames(Array(21).fill(5)).total, 150);
  assert.equal(scoreFrames(Array(20).fill(0)).total, 0);
  assert.equal(scoreFrames([10, 7, 3, 9, 0, 10, 0, 8, 8, 2, 0, 6, 10, 10, 10, 8, 1]).total, 167);
  const partial = scoreFrames([10, 7]); // 全中后面还没打完，这一格暂时算不出
  assert.equal(partial.frames[0], null);
  ok('保龄球计分：满分 300、全补中 150、全洗澡 0、经典例子 167、没打完的格子暂时算不出');
}

// ───────────── UNO ─────────────
{
  const list = await setup('trio', 3, 'uno');
  const [A, B, C] = list;
  for (const s of list) assert.equal(s.state.game.hand.length, 7);
  assert.equal(A.state.game.hands, undefined, '游戏中不能看到别人的手牌');
  const idsA = new Set(A.state.game.hand.map((c) => c.id));
  assert.ok(B.state.game.hand.every((c) => !idsA.has(c.id)), '三个人的手牌互不重复');
  assert.ok(!JSON.stringify(B.state.game).split('"hand"')[0].includes(JSON.stringify(A.state.game.hand[0])), '别人的视图里没有我的牌');
  assert.equal(A.state.game.counts[B.state.you], 7);
  ok('UNO：每人 7 张，只能看到自己的手牌，其他人只显示张数');

  const cur = turnSock(list);
  const other = list.find((s) => s !== cur);
  assert.equal((await act(other, { type: 'draw' })).ok, false);
  assert.equal((await act(cur, { type: 'play', card: 99999 })).ok, false);
  assert.equal((await act(cur, { type: 'pass' })).ok, false);
  const g = cur.state.game;
  const bad = g.hand.find((c) => !g.playable.includes(c.id));
  if (bad) assert.equal((await act(cur, { type: 'play', card: bad.id, color: 'r' })).ok, false);
  ok('UNO：不是你的回合 / 没有的牌 / 没摸牌就跳过 / 不符合规则的牌，都被拒绝');

  // 万能牌必须选颜色
  let steps = 0;
  let sawWild = false;
  while (!list[0].state.game.winnerId && steps < 2500) {
    const s = turnSock(list);
    const v = s.state.game;
    let a;
    if (v.drawnId !== null) {
      const c = v.hand.find((x) => x.id === v.drawnId);
      a = { type: 'play', card: c.id, color: 'y' };
    } else if (v.playable.length) {
      const c = v.hand.find((x) => x.id === v.playable[0]);
      if (c.color === 'w' && !sawWild) {
        sawWild = true;
        assert.equal((await act(s, { type: 'play', card: c.id })).ok, false, '万能牌不带颜色不能出');
        assert.equal((await act(s, { type: 'play', card: c.id, color: 'x' })).ok, false);
      }
      a = { type: 'play', card: c.id, color: 'g' };
    } else a = { type: 'draw' };
    const before = list[0].state.game.log.length + ':' + list[0].state.game.log.at(-1);
    const r = await act(s, a);
    assert.ok(r.ok, JSON.stringify(r) + JSON.stringify(a));
    await until(() => list[0].state.game.log.length + ':' + list[0].state.game.log.at(-1) !== before || list[0].state.game.winnerId || true, 200).catch(() => {});
    await wait(6);
    steps++;
  }
  const v = list[0].state.game;
  assert.ok(v.winnerId, `${steps} 步后应该有人出完牌`);
  assert.equal(v.counts[v.winnerId], 0);
  assert.ok(v.hands, '结束后公开所有人剩下的牌');
  assert.equal(list[0].state.awards[v.winnerId], 3);
  ok(`UNO：${steps} 步后有人出完所有牌；赢家 +3；结束后公开剩余手牌`);
  await reset();
}
{
  const [x, y] = await setup('duo', 2, 'uno');
  assert.equal(x.state.game.hand.length, 7);
  ok('UNO（双人）可以开始');
  await reset();
}

// ───────────── 叠叠高 ─────────────
{
  const list = await setup('trio', 3, 'jenga');
  let v = list[0].state.game;
  assert.equal(v.levels.length, 18);
  const top = v.levels.length - 1;
  const s0 = turnSock(list);
  assert.equal((await act(s0, { type: 'pull', level: top, slot: 0 })).ok, false);
  assert.equal((await act(s0, { type: 'pull', level: top - 1, slot: 1 })).ok, false);
  assert.equal((await act(s0, { type: 'pull', level: -1, slot: 0 })).ok, false);
  assert.equal((await act(s0, { type: 'pull', level: 0, slot: 5 })).ok, false);
  assert.equal((await act(list.find((s) => s !== s0), { type: 'pull', level: 0, slot: 0 })).ok, false);
  assert.ok(v.risk[0][0] >= 1 && v.risk[0][0] <= 95);
  assert.equal(v.risk[top][0], null, '最上面两层不显示风险（不能抽）');
  ok('叠叠高：最上面两层 / 越界 / 不是你的回合都不能抽；能抽的积木显示风险');

  let pulls = 0;
  while (!list[0].state.game.over && pulls < 60) {
    const s = turnSock(list);
    const w = list[0].state.game;
    // 选风险最低的一块
    let best = null;
    w.risk.forEach((row, l) => row.forEach((r, k) => { if (r !== null && (!best || r < best[2])) best = [l, k, r]; }));
    assert.ok(best, '总有能抽的积木');
    const total0 = w.total;
    assert.ok((await act(s, { type: 'pull', level: best[0], slot: best[1] })).ok);
    await wait(12);
    const x = list[0].state.game;
    if (!x.over) {
      assert.equal(x.total, total0 + 1);
      assert.equal(x.levels[best[0]][best[1]], false, '抽走的积木位置空了');
      const blocks = x.levels.flat().filter(Boolean).length;
      assert.equal(blocks, 54, '抽出的积木放到塔顶，总块数不变');
    }
    pulls++;
  }
  const x = list[0].state.game;
  assert.ok(x.over);
  if (x.collapsedBy) {
    const a = list[0].state.awards;
    const mine = Math.min(...Object.values(a));
    assert.equal(a[x.collapsedBy], mine, '抽倒塔的人排最后');
    ok(`叠叠高：抽了 ${x.total} 块后 塔倒了；抽倒的人排最后；每一步总块数不变`);
  } else {
    assert.equal(x.total, x.maxPulls);
    ok(`叠叠高：抽满 ${x.maxPulls} 块塔没倒，大家按块数排名`);
  }
  await reset();
}

// ───────────── 保龄球 ─────────────
{
  const list = await setup('duo', 2, 'bowling');
  const [A, B] = list;
  const cur = turnSock(list);
  assert.equal((await act(list.find((s) => s !== cur), { type: 'throw' })).ok, false);
  assert.equal((await act(cur, { type: 'bounce' })).ok, false);
  assert.ok(list[0].state.game.meter.period > 0);
  ok('保龄球：不是你的回合 / 未知操作被拒绝；视图带力度条');

  let throws = 0;
  while (!list[0].state.gameOver && throws < 80) {
    // 等到下一球开始瞄准（结果展示期间视图里没有力度条）
    await until(() => list.every((x) => x.state.gameOver || (x.state.game.phase === 'aim' && x.state.game.meter)), 4000, '下一球开始瞄准');
    if (list[0].state.gameOver) break;
    const s = turnSock(list);
    const before = list[0].state.game.cards[s.state.you].rolls.length;
    // 在指针经过正中间时投球（这样大概率击倒很多球瓶）
    const m = s.state.game.meter;
    const t = (m.sinceMs % m.period) / m.period;
    const target = t < 0.25 ? 0.25 : t < 0.75 ? 0.75 : 1.25;
    await wait(Math.max(0, (target - t) * m.period - 15));
    const r = await act(s, { type: 'throw' });
    assert.ok(r.ok, JSON.stringify(r));
    await until(() => list[0].state.game.cards?.[s.state.you]?.rolls.length === before + 1 || list[0].state.gameOver, 2000, '投球结果');
    const rolls = list[0].state.game.cards[s.state.you].rolls;
    assert.ok(rolls.at(-1) >= 0 && rolls.at(-1) <= 10);
    throws++;
    await until(() => list[0].state.game.phase !== 'result', 2000, '等下一球');
  }
  assert.equal(list[0].state.gameOver, true);
  const cards = list[0].state.game.cards;
  for (const id of Object.keys(cards)) {
    const c = cards[id];
    assert.deepEqual(scoreFrames(c.rolls).total, c.total);
    assert.ok(c.rolls.length >= 10 && c.rolls.length <= 21);
  }
  const best = Math.max(...Object.values(cards).map((c) => c.total));
  assert.ok(best > 0, '瞄准正中间投球，总分应该大于 0');
  assert.equal(Object.keys(list[0].state.awards).length, 2);
  ok(`保龄球（双人）：${throws} 次投球打完 10 格；总分 ${Object.values(cards).map((c) => c.total).join(' / ')}；球数和计分都符合规则`);
  await reset();
}

// ───────────── 投篮机 ─────────────
{
  const [me] = await setup('solo', 1, 'basketball');
  const aimAt = async (u) => {
    // 等到指针走到一个周期里的位置 u（0~1）再点击
    const m = me.state.game.meter;
    const t = (m.sinceMs % m.period) / m.period;
    let d = (u - t) * m.period;
    if (d < 40) d += m.period;
    await wait(d - 12);
  };
  assert.equal(me.state.game.shot.pts, 2);
  await aimAt(0.25); // 指针正好在正中间
  assert.ok((await act(me, { type: 'shoot' })).ok);
  await wait(60);
  assert.equal(me.state.game.last.made, true);
  assert.ok(me.state.game.last.gain >= 2);
  ok('投篮机：指针在正中间点击 → 进球');

  await until(() => me.state.game.phase === 'aim' && me.state.game.round === 1, 2000, '第 2 次');
  await aimAt(0.0); // 指针在最边上
  assert.ok((await act(me, { type: 'shoot' })).ok);
  await wait(60);
  assert.equal(me.state.game.last.made, false);
  ok('投篮机：指针在最边上点击 → 没进');

  assert.equal((await act(me, { type: 'shoot' })).ok, false, '结果展示期间不能再投');
  for (let k = 2; k < 10; k++) {
    await until(() => me.state.game.phase === 'aim' && me.state.game.round === k, 2000, `第 ${k + 1} 次`);
    await aimAt(0.25);
    assert.ok((await act(me, { type: 'shoot' })).ok);
    await wait(40);
  }
  await until(() => me.state.gameOver, 3000, '结束');
  assert.ok(me.state.game.points[me.state.you] >= 14, '8 次瞄准正中间，至少进 7 球');
  ok(`投篮机：10 次投篮打完，总分 ${me.state.game.points[me.state.you]}，进 ${me.state.game.made[me.state.you]} 球`);
  await reset();
}

// ───────────── 羊了个羊 ─────────────
{
  const list = await setup('duo', 2, 'sheep');
  const [A, B] = list;
  let v = A.state.game;
  assert.equal(v.tiles.length, 72);
  assert.equal(v.total, 72);
  const blockedTile = v.tiles.find((t) => t.blocked);
  const free = v.tiles.filter((t) => !t.blocked);
  assert.ok(blockedTile && free.length > 0);
  assert.equal((await act(A, { type: 'pick', tile: blockedTile.id })).ok, false);
  assert.equal((await act(A, { type: 'pick', tile: 9999 })).ok, false);
  assert.equal((await act(A, { type: 'pick', tile: 'a' })).ok, false);
  ok('羊了个羊：被压住的牌 / 不存在的牌不能点；每人 72 张牌');

  assert.ok((await act(A, { type: 'pick', tile: free[0].id })).ok);
  await wait(60);
  assert.equal(A.state.game.tray.length, 1);
  assert.equal(B.state.game.tray.length, 0, '两个人的牌堆互不影响');
  assert.equal(B.state.game.tiles.length, 72);
  assert.equal(A.state.game.tiles.length, 71);
  assert.ok((await act(A, { type: 'undo' })).ok);
  await wait(60);
  assert.equal(A.state.game.tray.length, 0);
  assert.equal(A.state.game.tiles.length, 72);
  assert.equal((await act(A, { type: 'undo' })).ok, false, '撤回只能用一次');
  ok('羊了个羊：点牌进托盘；撤回把牌放回去，只能用一次；两个人的牌堆互不影响');

  assert.ok((await act(A, { type: 'shuffle' })).ok);
  assert.equal((await act(A, { type: 'shuffle' })).ok, false);
  await wait(60);
  const counts = {};
  for (const t of A.state.game.tiles) counts[t.type] = (counts[t.type] ?? 0) + 1;
  assert.ok(Object.values(counts).every((c) => c === 9), '洗牌之后每种图案仍然是 9 张');
  ok('羊了个羊：洗牌只能用一次，且每种图案数量不变');

  // 用一个简单策略玩：优先点能凑成三个的牌，直到通关或托盘放满
  let picks = 0;
  const play = async (s) => {
    while (!s.state.game.won && !s.state.game.lost && picks < 400) {
      const g = s.state.game;
      const freeTiles = g.tiles.filter((t) => !t.blocked);
      const trayTypes = g.tray.map((x) => x.type);
      const byType = {};
      for (const t of freeTiles) (byType[t.type] ??= []).push(t);
      const match = freeTiles.find((t) => trayTypes.includes(t.type)) ?? Object.values(byType).sort((a, b) => b.length - a.length)[0]?.[0] ?? freeTiles[0];
      if (!match) break;
      const r = await act(s, { type: 'pick', tile: match.id });
      assert.ok(r.ok || s.state.game.over, JSON.stringify(r));
      assert.ok(s.state.game.tray.length <= 7);
      await wait(8);
      picks++;
    }
  };
  await play(A);
  await wait(80);
  const ga = A.state.game;
  assert.ok(ga.won || ga.lost, '玩到最后要么通关要么托盘放满');
  assert.ok(ga.cleared % 3 === 0 || ga.cleared > 0 || ga.lost);
  assert.equal(B.state.game.progress[A.state.you].lost || B.state.game.progress[A.state.you].won, true);
  ok(`羊了个羊：${picks} 次点牌后${ga.won ? '通关' : '托盘放满失败'}（消除 ${ga.cleared} 张）；对手能看到你的进度`);
  await reset();
}

console.log(`\n全部 ${n} 项通过`);
for (const s of socks) s.close();
process.exit(0);
