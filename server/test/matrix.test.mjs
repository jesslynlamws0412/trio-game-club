// 全平台矩阵测试：每一款“已完成”的游戏 × 它支持的每一种人数模式
// 每个组合检查：能创建房间并开始 → 视图不泄露别人的 token / deviceId →
//   对乱发的操作（空对象、错误类型、超长文本、负数……）全部返回明确的错误而不是崩溃或无响应 →
//   一名玩家断线后用 token 重连，仍能回到同一局 → 房主中止游戏回到大厅。
// 用法：服务器已启动时  node server/test/matrix.test.mjs
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const URL = process.env.URL ?? 'http://localhost:3001';
const emit = (s, ev, data) =>
  new Promise((res) => {
    const t = setTimeout(() => res({ __timeout: true }), 4000);
    s.emit(ev, data, (r) => {
      clearTimeout(t);
      res(r);
    });
  });
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const PLAYERS = { solo: 1, duo: 2, trio: 3, party: 4 };
const stamp = Date.now().toString(36);

const mk = () => {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.state = null;
  s.on('room:state', (v) => (s.state = v));
  return new Promise((res) => s.on('connect', () => res(s)));
};

const platform = await (await fetch(URL + '/api/platform')).json();
const games = platform.games.filter((g) => g.ready);
console.log(`共 ${games.length} 款已完成的游戏`);

const garbage = [
  {},
  null,
  'string',
  42,
  { type: 'nope' },
  { type: 'answer', index: -1, choice: 'a', text: 123 },
  { type: 'answer', index: 0, choices: 'x' },
  { type: 'stroke', id: 1, color: 2, size: 'big', points: 'many' },
  { type: 'say', text: 'x'.repeat(5000) },
  { type: 'guess', digits: { a: 1 } },
  { type: 'bid', qty: 1e9, face: -5 },
  { type: 'flip', index: 'zero' },
  { type: 'pick', round: {}, option: [] },
  { type: 'choose', puzzleId: { $ne: 1 } },
  { type: '__proto__', constructor: 'x' },
];

let combos = 0;
const failures = [];
const perMode = {};

for (const g of games) {
  for (const mode of g.liveModes) {
    const count = PLAYERS[mode];
    const label = `${g.name}（${mode}）`;
    const socks = await Promise.all(Array.from({ length: count }, mk));
    const tokens = [];
    const devs = socks.map((_, i) => `devmatrix${stamp}${combos}${i}`.slice(0, 40));
    try {
      const c = await emit(socks[0], 'room:create', { nickname: 'P0', avatar: '🦊', deviceId: devs[0], mode });
      assert.ok(c.ok, '创建房间：' + JSON.stringify(c));
      tokens.push(c.token);
      for (let i = 1; i < count; i++) {
        const j = await emit(socks[i], 'room:join', { code: c.code, nickname: 'P' + i, avatar: '🐻', deviceId: devs[i] });
        assert.ok(j.ok, '加入房间：' + JSON.stringify(j));
        tokens.push(j.token);
      }
      // 大厅里和房间里看到的是同一个游戏名和图标
      await wait(80);
      const inRoom = socks[0].state.catalog.find((x) => x.id === g.id);
      assert.ok(inRoom, '房间里没有这款游戏');
      assert.equal(inRoom.name, g.name, '大厅和房间里的游戏名不一致');
      assert.equal(inRoom.icon, g.icon, '大厅和房间里的图标不一致');
      for (const s of socks) {
        const v = await emit(s, 'room:vote', { gameId: g.id });
        assert.ok(v.ok, '投票：' + JSON.stringify(v));
      }
      for (const s of socks) assert.ok((await emit(s, 'room:ready', { ready: true })).ok);
      const st = await emit(socks[0], 'room:start');
      assert.ok(st.ok, '开始游戏：' + JSON.stringify(st));
      await wait(180);
      for (const s of socks) {
        assert.equal(s.state.phase, 'playing');
        assert.ok(s.state.game && typeof s.state.game === 'object', '没有游戏视图');
      }

      // 视图里不能出现其他玩家的 token / deviceId
      for (let i = 0; i < count; i++) {
        const json = JSON.stringify(socks[i].state);
        for (let k = 0; k < count; k++) {
          if (k === i) continue;
          assert.ok(!json.includes(tokens[k]), `玩家 ${i} 的视图里出现了玩家 ${k} 的 token`);
          assert.ok(!json.includes(devs[k]), `玩家 ${i} 的视图里出现了玩家 ${k} 的 deviceId`);
        }
      }

      // 乱发操作：必须每次都得到明确回复，并且服务器仍然活着
      for (const s of socks) {
        for (const bad of garbage) {
          const r = await emit(s, 'game:action', bad);
          assert.ok(!r?.__timeout, `乱发操作 ${JSON.stringify(bad)?.slice(0, 40)} 没有回复`);
          assert.equal(typeof r?.ok, 'boolean', '回复格式不对');
        }
      }
      const alive = await (await fetch(URL + '/healthz')).text();
      assert.equal(alive, 'ok');

      // 断线重连：最后一名玩家断线，用 token 回来
      const who = count - 1;
      const you = socks[who].state.you;
      socks[who].disconnect();
      await wait(120);
      const back = await mk();
      const rs = await emit(back, 'room:resume', { code: c.code, token: tokens[who] });
      assert.ok(rs.ok, '重连：' + JSON.stringify(rs));
      await wait(150);
      assert.equal(back.state.you, you, '重连后身份不对');
      assert.equal(back.state.phase, 'playing');
      assert.equal(back.state.currentGame, g.id);
      socks[who] = back;

      // 房主中止，回到大厅
      const end = await emit(socks[0], 'game:end');
      assert.ok(end.ok, '中止游戏：' + JSON.stringify(end));
      await wait(120);
      assert.equal(socks[0].state.phase, 'lobby');
      perMode[mode] = (perMode[mode] ?? 0) + 1;
      process.stdout.write('.');
    } catch (e) {
      failures.push(`${label}：${e.message}`);
      process.stdout.write('F');
    } finally {
      for (const s of socks) {
        try {
          await emit(s, 'room:leave');
        } catch {}
        s.close();
      }
      combos++;
    }
  }
}

console.log(`\n\n共测试 ${combos} 个“游戏 × 模式”组合，通过 ${combos - failures.length} 个`);
console.log('各模式通过数：', JSON.stringify(perMode));
if (failures.length) {
  console.log('\n失败的组合：');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('全部通过');
process.exit(0);
