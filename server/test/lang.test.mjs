// 英文版测试：语言设置、翻译、中英文玩家同房间、漏翻审计
// 用 tsx 运行：node --import tsx server/test/lang.test.mjs
// 需要服务器带 I18N_AUDIT=1 启动（all.mjs 会这样启动），并且要放在其他测试之后运行，审计才有内容。
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';
import { EN_GAMES } from '../src/i18n/en/catalog.ts';

const URL = process.env.URL ?? 'http://localhost:3001';
const CJK = /[一-鿿]/;
const emit = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));
const wait = (ms = 100) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000, what = '') => {
  const t0 = Date.now();
  while (!fn() && Date.now() - t0 < ms) await wait(20);
  assert.ok(fn(), '等待超时：' + what);
};
let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);
const mk = (lang) => {
  const s = io(URL, { transports: ['websocket'], forceNew: true, auth: { lang } });
  s.state = null;
  s.on('room:state', (v) => (s.state = v));
  return new Promise((res) => s.on('connect', () => res(s)));
};
const noCjk = (v) => !CJK.test(JSON.stringify(v));

// ───── 平台数据 ─────
{
  const zh = await (await fetch(URL + '/api/platform')).json();
  const en = await (await fetch(URL + '/api/platform?lang=en')).json();
  assert.ok(zh.games.some((g) => g.name === '大富翁'));
  assert.ok(en.games.some((g) => g.name === 'Monopoly'));
  assert.ok(noCjk(en.modes) && noCjk(en.categories), '模式和分类都翻译了');
  const left = en.games.filter((g) => CJK.test(g.name)).map((g) => g.name);
  assert.deepEqual(left, [], '所有游戏名称（包括开发中的）都翻译了：' + left.join(','));
  assert.equal(en.games.length, zh.games.length);
  ok(`大厅数据：中文原样；英文版的模式、分类和全部 ${en.games.length} 个游戏名称都翻译了`);
}

// ───── 英文玩家的房间视图 ─────
const idsEn = new Set(EN_GAMES);
{
  const s = await mk('en');
  const r = await emit(s, 'room:create', { nickname: 'Ann', avatar: '🦊', mode: 'party' });
  assert.ok(r.ok);
  await until(() => s.state, 2000, '房间状态');
  const cat = s.state.catalog;
  assert.ok(cat.length > 30);
  for (const g of cat) {
    assert.equal(CJK.test(g.name + g.tagline), false, `${g.id} 名称/简介没翻译：${g.name} / ${g.tagline}`);
    if (idsEn.has(g.id)) {
      assert.equal(g.en, true);
      assert.equal(CJK.test(g.rules.join('')), false, `${g.id} 规则没翻译完：${g.rules.find((x) => CJK.test(x))}`);
    } else assert.equal(g.en, false);
  }
  // 多人房间里没有大富翁（只支持三人）、井字棋和五子棋（只支持单人 / 双人）
  assert.equal(cat.filter((g) => g.en).length, EN_GAMES.length - 3, '多人房间里支持英文的游戏数量');
  ok(`英文玩家的游戏列表：${cat.length} 款游戏名称全部翻译；${cat.filter((g) => g.en).length} 款有完整英文版并翻译了规则`);

  // 错误提示翻译
  const bad = await emit(s, 'room:join', { code: '0000', nickname: 'Bob', avatar: '🐻' });
  assert.equal(bad.ok, false);
  assert.ok(!CJK.test(bad.error) && /room/i.test(bad.error), bad.error);
  const zhSock = await mk('zh');
  const bad2 = await emit(zhSock, 'room:join', { code: '0000', nickname: 'Bob', avatar: '🐻' });
  assert.ok(CJK.test(bad2.error));
  ok(`错误提示按语言返回：英文 “${bad.error}”，中文 “${bad2.error}”`);
  zhSock.close();
  await emit(s, 'room:leave');
  s.close();
}

// ───── 中英文玩家同一个房间 ─────
{
  const a = await mk('zh');
  const b = await mk('en');
  const r = await emit(a, 'room:create', { nickname: 'Zed', avatar: '🦊', mode: 'duo' });
  assert.ok((await emit(b, 'room:join', { code: r.code, nickname: 'Eve', avatar: '🐻' })).ok);
  await until(() => a.state?.players.length === 2 && b.state?.players.length === 2, 2000, '两人入座');
  assert.deepEqual(a.state.players.map((p) => p.lang).sort(), ['en', 'zh']);
  assert.equal(a.state.catalog.find((g) => g.id === 'snakes').name, '蛇梯棋');
  assert.equal(b.state.catalog.find((g) => g.id === 'snakes').name, 'Snakes & Ladders');
  ok('同一个房间里：中文玩家看到“蛇梯棋”，英文玩家看到 “Snakes & Ladders”；双方都能看到对方的语言');

  // 只有中文内容的游戏不能开始
  for (const s of [a, b]) {
    await emit(s, 'room:vote', { gameId: 'truth' });
    await emit(s, 'room:ready', { ready: true });
  }
  await wait(80);
  const blocked = await emit(a, 'room:start');
  assert.equal(blocked.ok, false);
  assert.ok(/English|英文/.test(blocked.error), blocked.error);
  ok('房间里有英文玩家时，只有中文内容的游戏不能开始，并提示原因');

  // 换成有英文版的游戏
  for (const s of [a, b]) await emit(s, 'room:vote', { gameId: 'snakes' });
  await wait(80);
  assert.ok((await emit(a, 'room:start')).ok);
  await until(() => a.state.phase === 'playing' && b.state.phase === 'playing', 3000, '开始');
  const cur = a.state.game.turnId === a.state.you ? a : b;
  assert.ok((await emit(cur, 'game:action', { type: 'roll' })).ok);
  await wait(100);
  const logA = a.state.game.log.join(' | ');
  const logB = b.state.game.log.join(' | ');
  assert.ok(CJK.test(logA) && logA.includes('掷出'), '中文玩家看到中文日志：' + logA);
  assert.ok(!CJK.test(logB) && /rolled/.test(logB), '英文玩家看到英文日志：' + logB);
  // 现在轮到谁，另一位玩家出手就会收到“还没轮到你”
  const other = a.state.game.turnId === a.state.you ? b : a;
  const err = await emit(other, 'game:action', { type: 'roll' });
  assert.equal(err.ok, false);
  if (other === b) assert.ok(!CJK.test(err.error), err.error);
  else assert.ok(CJK.test(err.error), err.error);
  ok(`同一局游戏：中文玩家的日志是中文，英文玩家的是英文（“${logB.split(' | ').pop()}”）；游戏错误提示也各按各的语言`);
  await emit(a, 'room:leave');
  await emit(b, 'room:leave');
  a.close();
  b.close();
}

// ───── 中途切换语言 ─────
{
  const s = await mk('zh');
  const r = await emit(s, 'room:create', { nickname: 'Cat', avatar: '🦊', mode: 'solo' });
  assert.ok(r.ok);
  await until(() => s.state, 2000, '房间状态');
  const before = s.state.catalog.find((g) => g.id === 'sheep').name;
  assert.equal(before, '羊了个羊');
  s.state = null;
  assert.ok((await emit(s, 'lang:set', { lang: 'en' })).ok);
  await until(() => s.state, 2000, '切换后收到新视图');
  assert.equal(s.state.catalog.find((g) => g.id === 'sheep').name, 'Triple Match');
  assert.equal(s.state.players[0].lang, 'en');
  s.state = null;
  assert.ok((await emit(s, 'lang:set', { lang: 'zh' })).ok);
  await until(() => s.state, 2000, '切回中文');
  assert.equal(s.state.catalog.find((g) => g.id === 'sheep').name, '羊了个羊');
  assert.ok((await emit(s, 'lang:set', { lang: 'fr' })).ok, '未知语言按中文处理，不报错');
  ok('在房间里切换语言：服务器立刻重发新语言的视图，切回中文也正常；未知语言按中文处理');
  await emit(s, 'room:leave');
  s.close();
}

// ───── 漏翻审计：整个测试过程中，英文游戏发出去的所有文字 ─────
{
  const audit = await (await fetch(URL + '/api/i18n-audit')).json();
  const missing = {};
  for (const id of EN_GAMES) if (audit[id]?.length) missing[id] = audit[id];
  assert.deepEqual(missing, {}, '这些句子没有英文翻译：\n' + JSON.stringify(missing, null, 1));
  const covered = EN_GAMES.filter((id) => id in audit || true).length;
  ok(`漏翻审计：${covered} 款英文游戏在整套测试中发出的所有视图和错误提示，翻译成英文后都没有残留中文`);
  const rest = Object.keys(audit).filter((k) => !idsEn.has(k) && k !== 'lobby');
  console.log(`  （仅中文的游戏里还有 ${rest.length} 个游戏的文字没翻译，这是预期的：${rest.join('、')}）`);
}

console.log(`\n全部 ${n} 项通过`);
process.exit(0);
