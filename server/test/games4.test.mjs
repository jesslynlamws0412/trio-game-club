// 新增五款游戏测试：谁最有可能 / 默契大考验 / 吹牛骰子 / 猜数字 / 记忆翻牌
// 先启动服务器：PICK_REVEAL_MS=150 DICE_REVEAL_MS=150 MEMORY_HIDE_MS=150 npm start
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const URL = process.env.URL ?? 'http://localhost:3001';
const emit = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const mk = () => {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.state = null;
  s.on('room:state', (v) => (s.state = v));
  return new Promise((res) => s.on('connect', () => res(s)));
};
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);
const socks = await Promise.all([1, 2, 3, 4].map(mk));

/** 建房并开始指定游戏，返回参与的 socket 列表 */
async function start(mode, count, gameId) {
  const list = socks.slice(0, count);
  const r = await emit(list[0], 'room:create', { nickname: 'P0', avatar: '🦊', mode });
  assert.ok(r.ok, JSON.stringify(r));
  for (let i = 1; i < count; i++) assert.ok((await emit(list[i], 'room:join', { code: r.code, nickname: 'P' + i, avatar: '🐻' })).ok);
  for (const s of list) await emit(s, 'room:vote', { gameId });
  for (const s of list) await emit(s, 'room:ready', { ready: true });
  const st = await emit(list[0], 'room:start');
  assert.ok(st.ok, JSON.stringify(st));
  await wait();
  return list;
}
async function finish(list) {
  await emit(list[0], 'game:end');
  for (const s of socks) await emit(s, 'room:leave');
  await wait(50);
}
const byTurn = (list, id) => list.find((s) => s.state.you === id);
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

// ---------- 谁最有可能 ----------
{
  const list = await start('trio', 3, 'likely');
  const [A, B, C] = list;
  const idA = A.state.you, idB = B.state.you;
  let v = A.state.game;
  assert.equal(v.game, 'likely');
  assert.equal(v.options.length, 3);
  assert.equal((await emit(A, 'game:action', { type: 'pick', round: v.round, option: idA })).ok, false);
  ok('谁最有可能：不能投给自己');
  assert.ok((await emit(A, 'game:action', { type: 'pick', round: v.round, option: idB })).ok);
  assert.equal((await emit(A, 'game:action', { type: 'pick', round: v.round, option: idB })).ok, false);
  await wait();
  assert.equal(B.state.game.picks, undefined, '没揭晓前不能把别人的选择发给其他玩家');
  assert.equal(B.state.game.myPick, null);
  ok('不能重复投票；揭晓前别人的选择不外泄');
  await emit(B, 'game:action', { type: 'pick', round: v.round, option: idA });
  await emit(C, 'game:action', { type: 'pick', round: v.round, option: idA });
  await wait(60);
  v = A.state.game;
  assert.equal(v.phase, 'reveal');
  assert.deepEqual(v.gains, { [idA]: 0, [idB]: 1, [A.state.players.find((p) => p.nickname === 'P2').id]: 1 });
  ok('揭晓：得票最多的是 P0（2 票），投给 P0 的两人各得 1 分，其余 0 分');
  // 把剩下 7 轮打完
  for (let r = 1; r < 8; r++) {
    await wait(300);
    const cur = A.state.game;
    assert.equal(cur.round, r);
    for (const s of list) {
      const me = s.state.you;
      const opt = cur.options.find((o) => o.id !== me).id;
      await emit(s, 'game:action', { type: 'pick', round: r, option: opt });
    }
  }
  await wait(300);
  assert.equal(A.state.gameOver, true);
  for (const r of A.state.game.ranking) assert.equal(A.state.awards[r.id], [3, 2, 1][r.rank - 1] ?? 0);
  ok('8 轮打完，进入排名结算');
  await finish(list);
}

// ---------- 默契大考验（双人、三人） ----------
{
  const list = await start('trio', 3, 'tacit');
  const v = list[0].state.game;
  assert.equal(v.options.length, 4);
  for (const s of list) await emit(s, 'game:action', { type: 'pick', round: 0, option: '0' });
  await wait(60);
  const g = list[0].state.game.gains;
  assert.ok(Object.values(g).every((x) => x === 2));
  ok('默契大考验：三人选同一项，每人 +2');
  await finish(list);

  const duo = await start('duo', 2, 'tacit');
  await emit(duo[0], 'game:action', { type: 'pick', round: 0, option: '1' });
  await emit(duo[1], 'game:action', { type: 'pick', round: 0, option: '2' });
  await wait(60);
  assert.ok(Object.values(duo[0].state.game.gains).every((x) => x === 0));
  assert.equal((await emit(duo[0], 'game:action', { type: 'pick', round: 0, option: '9' })).ok, false);
  ok('默契大考验（双人）：选得不同各 +0；无效选项被拒绝');
  await finish(duo);
}

// ---------- 吹牛骰子 ----------
{
  const list = await start('trio', 3, 'dice');
  let v = list[0].state.game;
  assert.equal(v.total, 9);
  assert.equal(list[0].state.game.myDice.length, 3);
  assert.equal(list[0].state.game.allDice, null);
  const first = byTurn(list, v.turnId);
  const other = list.find((s) => s !== first);
  assert.equal((await emit(other, 'game:action', { type: 'bid', qty: 1, face: 2 })).ok, false);
  assert.equal((await emit(first, 'game:action', { type: 'call' })).ok, false);
  assert.equal((await emit(first, 'game:action', { type: 'bid', qty: 1, face: 1 })).ok, false);
  assert.equal((await emit(first, 'game:action', { type: 'bid', qty: 99, face: 3 })).ok, false);
  ok('吹牛骰子：不是你的回合 / 没人叫数就开 / 叫 1 点 / 数量超限，全被拒绝');
  assert.ok((await emit(first, 'game:action', { type: 'bid', qty: 2, face: 4 })).ok);
  await wait();
  const second = byTurn(list, list[0].state.game.turnId);
  assert.equal((await emit(second, 'game:action', { type: 'bid', qty: 2, face: 3 })).ok, false);
  assert.equal((await emit(second, 'game:action', { type: 'bid', qty: 1, face: 6 })).ok, false);
  ok('加注必须更多，或数量相同点数更大');
  assert.ok((await emit(second, 'game:action', { type: 'call' })).ok);
  await wait();
  v = list[0].state.game;
  assert.equal(v.phase, 'reveal');
  const all = Object.values(v.allDice).flat();
  const real = all.filter((d) => d === 4 || d === 1).length;
  assert.equal(v.result.count, real);
  const bidderRight = real >= 2;
  const expectedLoser = bidderRight ? second.state.you : first.state.you;
  assert.equal(v.result.loser, expectedLoser);
  ok(`开骰：实际 ${real} 个（含万能 1 点），输家判定正确`);
  // 其余回合用“有人叫数就开”的策略打到结束
  for (let k = 0; k < 30 && !list[0].state.gameOver; k++) {
    await wait(250);
    const cur = list[0].state.game;
    if (cur.phase !== 'bid') continue;
    const s = byTurn(list, cur.turnId);
    await emit(s, 'game:action', cur.bid ? { type: 'call' } : { type: 'bid', qty: 1, face: 2 });
  }
  await wait(250);
  assert.equal(list[0].state.gameOver, true);
  const aw = list[0].state.awards;
  assert.deepEqual(Object.values(aw).sort(), [1, 2, 3]);
  assert.equal(list[0].state.game.winnerId, Object.keys(aw).find((k) => aw[k] === 3));
  ok('一直打到只剩一人：名次 +3 / +2 / +1');
  await finish(list);
}

// ---------- 猜数字（三人用排除法合作解出） ----------
{
  const list = await start('trio', 3, 'number');
  assert.equal(list[0].state.game.secret, null);
  const first = byTurn(list, list[0].state.game.turnId);
  assert.equal((await emit(first, 'game:action', { type: 'guess', digits: '1123' })).ok, false);
  assert.equal((await emit(first, 'game:action', { type: 'guess', digits: '12' })).ok, false);
  assert.equal((await emit(list.find((s) => s !== first), 'game:action', { type: 'guess', digits: '1234' })).ok, false);
  ok('猜数字：重复数字 / 位数不对 / 不是你的回合，都被拒绝');
  const cands = [];
  for (let i = 0; i < 10000; i++) {
    const t = String(i).padStart(4, '0');
    if (new Set(t).size === 4) cands.push(t);
  }
  const fb = (g, s) => {
    let a = 0, b = 0;
    for (let i = 0; i < 4; i++) g[i] === s[i] ? a++ : s.includes(g[i]) && b++;
    return [a, b];
  };
  for (let k = 0; k < 20 && !list[0].state.gameOver; k++) {
    const st = list[0].state.game;
    const ok2 = cands.filter((c) => st.guesses.every((g) => fb(g.digits, c).join() === [g.a, g.b].join()));
    const s = byTurn(list, st.turnId);
    assert.ok((await emit(s, 'game:action', { type: 'guess', digits: ok2[0] })).ok);
    await wait(80);
  }
  const end = list[0].state;
  assert.equal(end.gameOver, true);
  assert.ok(end.game.winnerId && end.game.secret);
  assert.equal(end.awards[end.game.winnerId], 3);
  ok(`猜数字：${end.game.guesses.length} 次猜中 ${end.game.secret}，猜中者 +3`);
  await finish(list);

  const solo = await start('solo', 1, 'number');
  assert.equal(solo[0].state.game.turnId, solo[0].state.you);
  assert.ok((await emit(solo[0], 'game:action', { type: 'guess', digits: '0123' })).ok);
  await wait(60);
  assert.equal(solo[0].state.game.turnId === solo[0].state.you || solo[0].state.gameOver, true);
  ok('猜数字（单人）：猜完一次仍轮到自己');
  await finish(solo);
}

// ---------- 记忆翻牌 ----------
async function playMemory(list) {
  const known = new Map(); // 位置 → 图案
  for (let k = 0; k < 400 && !list[0].state.gameOver; k++) {
    const st = list[0].state.game;
    for (const s of list) st.cards.forEach((c, i) => c && known.set(i, c));
    if (st.phase !== 'play') {
      await wait(200);
      continue;
    }
    const s = byTurn(list, st.turnId);
    const seen = st.cards.map((c, i) => [c, i]);
    const open = st.up;
    let idx;
    if (open.length === 1) {
      const sym = st.cards[open[0]];
      const mate = [...known].find(([i, c]) => c === sym && i !== open[0] && !st.matched[i]);
      idx = mate ? mate[0] : seen.find(([c, i]) => c === null && !known.has(i))?.[1] ?? seen.find(([c]) => c === null)[1];
    } else {
      const pair = [...known].find(([i, c]) => !st.matched[i] && [...known].some(([j, d]) => j !== i && d === c && !st.matched[j]));
      idx = pair ? pair[0] : seen.find(([c, i]) => c === null && !known.has(i))?.[1] ?? seen.find(([c]) => c === null)[1];
    }
    const res = await emit(s, 'game:action', { type: 'flip', index: idx });
    assert.ok(res.ok, JSON.stringify(res));
    await wait(40);
  }
}
{
  const list = await start('trio', 3, 'memory');
  const v = list[0].state.game;
  assert.equal(v.cards.length, 36);
  assert.ok(v.cards.every((c) => c === null), '开局所有牌面都不能发给客户端');
  const cur = byTurn(list, v.turnId);
  const notCur = list.find((s) => s !== cur);
  assert.equal((await emit(notCur, 'game:action', { type: 'flip', index: 0 })).ok, false);
  assert.ok((await emit(cur, 'game:action', { type: 'flip', index: 0 })).ok);
  assert.equal((await emit(cur, 'game:action', { type: 'flip', index: 0 })).ok, false);
  await wait(60);
  assert.equal(notCur.state.game.cards.filter((c) => c).length, 1, '其他人只能看到已翻开的那一张');
  ok('记忆翻牌：牌面不外泄；非当前玩家不能翻；不能重复翻同一张');
  await playMemory(list);
  assert.equal(list[0].state.gameOver, true);
  const pts = list[0].state.game.points;
  assert.equal(sum(pts), 18, '36 张牌 = 18 对');
  assert.ok(list[0].state.game.matched.every(Boolean));
  ok(`记忆翻牌：三人打完，18 对全部配完（${Object.values(pts).join(' / ')}）`);
  await finish(list);

  const solo = await start('solo', 1, 'memory');
  await playMemory(solo);
  assert.equal(solo[0].state.gameOver, true);
  assert.equal(solo[0].state.awards[solo[0].state.you], 3);
  ok('记忆翻牌（单人）：打完得 +3');
  await finish(solo);
}

// ---------- 模式限制 ----------
{
  await emit(socks[0], 'room:create', { nickname: 'P0', avatar: '🦊', mode: 'solo' });
  assert.equal((await emit(socks[0], 'room:vote', { gameId: 'likely' })).ok, false);
  assert.equal((await emit(socks[0], 'room:vote', { gameId: 'dice' })).ok, false);
  ok('单人房间不能选谁最有可能 / 吹牛骰子');
  await emit(socks[0], 'room:leave');
}

console.log(`\n全部 ${n} 项通过`);
for (const s of socks) s.close();
process.exit(0);
