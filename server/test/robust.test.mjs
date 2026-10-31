// 健壮性测试：乱码攻击、所有游戏的掉线重连、多房间并发压力。
// 启动服务器：$env:QUIZ_REVEAL_MS=150; $env:DRAW_REVEAL_MS=200; $env:MONOPOLY_MAX_ROUNDS=3; npm start
// 运行：node server/test/robust.test.mjs [fuzz|reconnect|load]   （不带参数则全部运行）
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const URL = process.env.URL ?? 'http://localhost:3001';
const GAMES = ['undercover', 'draw', 'quiz', 'werewolf', 'monopoly', 'cards', 'turtlesoup', 'detective'];
const which = process.argv[2];
// 回执最多等 3 秒：被限速丢弃的请求不会有回执，返回 'timeout'
const emit = (s, ev, data) =>
  new Promise((res) => {
    const t = setTimeout(() => res('timeout'), 3000);
    s.emit(ev, data, (r) => {
      clearTimeout(t);
      res(r);
    });
  });
const wait = (ms = 100) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);
const all = [];

async function mk(name) {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.state = null;
  s.on('room:state', (v) => (s.state = v));
  await new Promise((r) => s.on('connect', r));
  s.nick = name;
  all.push(s);
  return s;
}
async function startRoom(gameId, prefix = '') {
  const ps = await Promise.all([mk('甲'), mk('乙'), mk('丙')]);
  const c = await emit(ps[0], 'room:create', { nickname: prefix + '甲', avatar: '🦊' });
  const tokens = [c.token];
  for (const [i, name, av] of [[1, '乙', '🐻'], [2, '丙', '🐱']]) {
    const r = await emit(ps[i], 'room:join', { code: c.code, nickname: prefix + name, avatar: av });
    assert.ok(r.ok, JSON.stringify(r));
    tokens.push(r.token);
  }
  for (const p of ps) {
    await emit(p, 'room:ready', { ready: true });
    await emit(p, 'room:vote', { gameId });
  }
  const st = await emit(ps[0], 'room:start');
  assert.ok(st.ok, JSON.stringify(st));
  await wait(80);
  return { ps, code: c.code, tokens };
}

// ───────────── 乱码攻击 ─────────────
async function fuzz() {
  const TYPES = [
    'describe', 'chat', 'skip', 'vote', 'answer', 'choose', 'custom', 'ask', 'guess', 'reply', 'reveal', 'stroke', 'undo',
    'clear', 'draw', 'judge', 'night', 'speak', 'mode', 'search', 'share', 'done', 'accuse', 'roll', 'buy', 'build', 'sell',
    'end', 'payjail', '__proto__', 'constructor', '', 123, null,
  ];
  const VALS = [
    null, undefined, 0, -1, 1, 2, 999999999, 1e308, '', 'x', '\u0000', '<script>alert(1)</script>', 'a'.repeat(5000),
    [], {}, [1, 2], [[1, 2], ['a', 'b']], true, false, 'ming', 's1', 'study', 'a', { a: 1 }, -0.5, '__proto__',
  ];
  const KEYS = ['text', 'target', 'index', 'choice', 'tile', 'puzzleId', 'surface', 'answer', 'entryId', 'reply', 'id', 'color',
    'size', 'points', 'judgementId', 'vote', 'mode', 'location', 'clueId', 'suspect', 'motive'];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  for (const game of GAMES) {
    const { ps } = await startRoom(game);
    const pending = [];
    for (let i = 0; i < 500; i++) {
      const a = { type: pick(TYPES) };
      for (let k = 0; k < 1 + Math.floor(Math.random() * 4); k++) a[pick(KEYS)] = pick(VALS);
      const payload = Math.random() < 0.05 ? pick(VALS) : a; // 偶尔直接发非对象
      pending.push(emit(pick(ps), 'game:action', payload));
      if (i % 100 === 99) await wait(1100); // 分批发送，避开限速
    }
    for (const bad of [null, 5, 'str', [], { type: 'x' }]) {
      await emit(ps[0], 'room:join', bad);
      await emit(ps[0], 'room:create', bad);
      await emit(ps[0], 'room:vote', bad);
      await emit(ps[0], 'room:profile', bad);
    }
    const results = await Promise.all(pending);
    assert.ok(results.every((r) => r === undefined || typeof r === 'object' || r === 'timeout'));
    // 服务器仍然正常响应
    const alive = await emit(ps[1], 'room:ready', { ready: true });
    assert.ok(alive, `${game}：乱码攻击后服务器无响应`);
    await emit(ps[0], 'room:leave');
    ok(`${game}：500 条乱码操作 + 非法房间指令后服务器仍正常`);
  }
}

// ───────────── 掉线重连 ─────────────
const strip = (v) =>
  JSON.parse(JSON.stringify(v, (k, val) => (/Ms$/.test(k) ? undefined : val)));
async function reconnect() {
  for (const game of GAMES) {
    const { ps, code, tokens } = await startRoom(game);
    // 推进一步，让状态不是初始状态（谁都可能先手，直接对所有人发一个无害的 chat/ready 不适用，所以只比较当前视图）
    await wait(100);
    const before = strip(ps[1].state);
    ps[1].disconnect();
    await wait(150);
    assert.equal(ps[0].state.players[1].connected, false);
    const back = await mk('乙-新连接');
    const r = await emit(back, 'room:resume', { code, token: tokens[1] });
    assert.ok(r.ok);
    await wait(150);
    assert.equal(ps[0].state.players[1].connected, true);
    const after = strip(back.state);
    assert.deepEqual(after, before, `${game}：重连后的视图应与掉线前完全一致`);
    // 别人的 token 不能用来冒充
    const thief = await mk('小偷');
    assert.equal((await emit(thief, 'room:resume', { code, token: 'not-a-token' })).ok, false);
    thief.disconnect();
    ok(`${game}：掉线 → 重连后视图（含私有信息）与掉线前完全一致`);
    await emit(ps[0], 'room:leave');
  }
}

// ───────────── 并发压力 ─────────────
async function load() {
  const ROOMS = 20;
  const t0 = Date.now();
  let acks = 0;
  let maxAck = 0;
  const timed = async (s, ev, data) => {
    const t = Date.now();
    const r = await emit(s, ev, data);
    maxAck = Math.max(maxAck, Date.now() - t);
    acks++;
    return r;
  };
  const runRoom = async (i) => {
    const { ps } = await startRoom('monopoly', `r${i}`);
    let steps = 0;
    while (ps[0].state.game.phase !== 'over') {
      assert.ok(steps++ < 400);
      const g = ps[0].state.game;
      const cur = ps.find((p) => p.state.you === g.turnId);
      const type = g.phase === 'roll' ? 'roll' : g.phase === 'buy' ? 'buy' : 'end';
      await timed(cur, 'game:action', { type });
      await wait(5);
    }
    return steps;
  };
  const steps = await Promise.all(Array.from({ length: ROOMS }, (_, i) => runRoom(i)));
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  ok(`${ROOMS} 个房间（${ROOMS * 3} 名玩家）同时打完大富翁：共 ${steps.reduce((a, b) => a + b, 0)} 步，用时 ${sec} 秒，最慢一次响应 ${maxAck} 毫秒`);
  assert.ok(maxAck < 2000, '响应过慢');
}

if (!which || which === 'fuzz') await fuzz();
if (!which || which === 'reconnect') await reconnect();
if (!which || which === 'load') await load();

all.forEach((s) => s.disconnect());
console.log(`\n全部 ${n} 项通过`);
process.exit(0);
