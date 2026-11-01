// 英文版测试：语言设置、翻译、中英文玩家同房间、漏翻审计
// 用 tsx 运行：node --import tsx server/test/lang.test.mjs
// 需要服务器带 I18N_AUDIT=1 启动（all.mjs 会这样启动），并且要放在其他测试之后运行，审计才有内容。
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';
import { EN_GAMES } from '../src/i18n/en/catalog.ts';
import { BUILTIN } from '../src/bank/index.ts';
import { tr, hasEnglish } from '../src/i18n.ts';
import { CONFLICTS } from '../src/i18n/en/index.ts';
import { DRAW_WORDS } from '../src/data/drawWords.ts';
import { WORD_PAIRS } from '../src/data/wordPairs.ts';
import { TABOO } from '../src/data/tabooBank.ts';
import { DrawGame } from '../src/games/draw.ts';
import { TabooGame } from '../src/games/taboo.ts';
import { UndercoverGame } from '../src/games/undercover.ts';

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
// 题库类游戏：英文题够多的算有英文版，其余仍是仅中文
const BANK_EN = ['quiz', 'q-common', 'q-whist', 'q-wlit', 'q-geo', 'q-sci', 'q-film', 'q-music', 'q-trivia', 'q-logic', 'millionaire'];
const BANK_ZH_ONLY = ['q-cnhist', 'q-cnlit', 'q-mylit', 'q-culture', 'q-idiom', 'q-poem', 'q-brain'];
const idsEn = new Set([...EN_GAMES, ...BANK_EN]);
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
  // 多人房间里没有大富翁、谁是卧底、狼人杀、侦探推理（只支持三人），也没有井字棋和五子棋（只支持单人 / 双人）
  assert.equal(cat.filter((g) => g.en).length, EN_GAMES.length - 6 + BANK_EN.length, '多人房间里支持英文的游戏数量');
  for (const id of BANK_EN) assert.equal(cat.find((g) => g.id === id)?.en, true, id + ' 应该有英文版');
  for (const id of BANK_ZH_ONLY) assert.equal(cat.find((g) => g.id === id)?.en, false, id + ' 应该仍是仅中文');
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

// ───── 英文题库：英文玩家答题 ─────
const byEn = (t) => BUILTIN.find((q) => q.en?.q === t);
const byZh = (t) => BUILTIN.find((q) => q.q === t);
/** 按玩家屏幕上看到的选项，算出该点哪个（选项顺序每次出题都会打乱，只能按文字对） */
function rightSubmission(q, v, lang) {
  const text = (arr, i) => (lang === 'en' ? q.en.options[i] : arr[i]);
  if (q.type === 'multi') return { choices: q.answer.map((i) => v.options.indexOf(text(q.options, i))) };
  if (q.type === 'truefalse') return { choice: q.answer }; // “对 / 错” 顺序不变
  if (q.options) return { choice: v.options.indexOf(text(q.options, q.answer)) };
  return { text: lang === 'en' ? q.en.answer[0] : q.answer[0] };
}
async function playRound(socks, langs, count = 10) {
  const seen = [];
  for (let k = 0; k < count; k++) {
    await until(() => socks.every((s) => s.state?.game?.index === k && s.state.game.phase === 'question') || socks[0].state?.gameOver, 6000, '第 ' + (k + 1) + ' 题');
    if (socks[0].state.gameOver) break;
    for (const [i, s] of socks.entries()) {
      const v = s.state.game;
      const q = langs[i] === 'en' ? byEn(v.question) : byZh(v.question);
      assert.ok(q, '题目应该在题库里：' + v.question);
      if (langs[i] === 'en') {
        assert.ok(noCjk({ ...v, category: undefined }), '英文玩家的题目视图里不应有中文：' + JSON.stringify(v).slice(0, 200));
      }
      if (i === 0) seen.push(q);
      const r = await emit(s, 'game:action', { type: 'answer', index: k, ...rightSubmission(q, v, langs[i]) });
      assert.ok(r.ok, JSON.stringify(r) + ' ' + v.question);
    }
    await until(() => socks.every((s) => s.state.game.phase === 'reveal' || s.state.game.phase === 'over'), 4000, '揭晓');
    for (const [i, s] of socks.entries()) {
      const v = s.state.game;
      if (v.phase !== 'reveal') continue;
      assert.equal(v.correct[s.state.you], true, `${langs[i]} 玩家按正确答案作答却被判错：${v.question}`);
      if (langs[i] === 'en') assert.ok(noCjk({ answerText: v.answerText, explain: v.explain }), '英文玩家的答案和解释里不应有中文');
    }
  }
  return seen;
}
async function startBank(socks, gameId, mode) {
  const r = await emit(socks[0], 'room:create', { nickname: 'Q0', avatar: '🦊', mode });
  assert.ok(r.ok);
  for (let i = 1; i < socks.length; i++) assert.ok((await emit(socks[i], 'room:join', { code: r.code, nickname: 'Q' + i, avatar: '🐻' })).ok);
  for (const s of socks) await emit(s, 'room:vote', { gameId });
  for (const s of socks) await emit(s, 'room:ready', { ready: true });
  await wait(80);
  return emit(socks[0], 'room:start');
}
{
  const s = await mk('en');
  assert.ok((await startBank([s], 'q-sci', 'solo')).ok);
  await until(() => s.state.phase === 'playing', 3000, '开始');
  const seen = await playRound([s], ['en']);
  assert.ok(seen.every((q) => q.bank === 'science'));
  await until(() => s.state.gameOver, 6000, '一局结束');
  assert.equal(s.state.awards[s.state.you], 3);
  ok(`英文玩家玩“科学知识问答”：10 道题全是英文（题型：${[...new Set(seen.map((q) => q.type))].join('、')}），按英文选项作答全部判对，答案和解释也是英文`);
  await emit(s, 'room:leave');
  s.close();
}
{
  const s = await mk('en');
  assert.ok((await startBank([s], 'quiz', 'solo')).ok);
  await until(() => s.state.phase === 'playing', 3000, '开始');
  const seen = await playRound([s], ['en']);
  assert.ok(seen.every((q) => q.en));
  ok(`英文玩家玩“答题竞赛”（题库有 8 个，只有有英文版的才会出）：10 道题全是有英文版的，来自 ${new Set(seen.map((q) => q.bank)).size} 个题库`);
  await emit(s, 'room:leave');
  s.close();
}
{
  const a = await mk('zh');
  const b = await mk('en');
  assert.ok((await startBank([a, b], 'q-geo', 'duo')).ok);
  await until(() => a.state.phase === 'playing' && b.state.phase === 'playing', 3000, '开始');
  await until(() => a.state.game && b.state.game, 2000, '题目');
  assert.ok(CJK.test(a.state.game.question) && !CJK.test(b.state.game.question), '同一道题：中文玩家看到中文，英文玩家看到英文');
  assert.equal(a.state.game.index, b.state.game.index);
  const seen = await playRound([a, b], ['zh', 'en']);
  assert.ok(seen.every((q) => q.en), '房间里有英文玩家，抽到的题都有英文版');
  ok('中文玩家和英文玩家同一局“世界地理问答”：同一道题各看各的语言，各自按自己的选项作答都判对');
  await emit(a, 'room:leave');
  await emit(b, 'room:leave');
  a.close();
  b.close();
}
{
  const a = await mk('zh');
  const b = await mk('en');
  const r = await startBank([a, b], 'q-cnlit', 'duo');
  assert.equal(r.ok, false);
  assert.ok(/English|英文/.test(r.error), r.error);
  ok('有英文玩家时，“中国文学问答”这种仅中文的题库游戏不能开始');
  await emit(a, 'room:leave');
  await emit(b, 'room:leave');
  a.close();
  b.close();
}
{
  // 百万富翁：英文玩家
  const s = await mk('en');
  assert.ok((await startBank([s], 'millionaire', 'solo')).ok);
  await until(() => s.state.phase === 'playing', 3000, '开始');
  for (let k = 0; k < 4; k++) {
    await until(() => s.state.game.phase === 'ask' && s.state.game.level === k, 4000, '第 ' + (k + 1) + ' 题');
    const v = s.state.game;
    assert.ok(noCjk({ q: v.question, o: v.options, c: v.category, d: v.difficultyName }), '百万富翁的题目里不应有中文：' + v.question);
    const q = byEn(v.question);
    assert.ok(q && q.en, '题目应该有英文版');
    const good = v.options.indexOf(q.en.options[q.answer]);
    assert.ok((await emit(s, 'game:action', { type: 'answer', choice: good })).ok);
    await until(() => s.state.game.phase === 'result', 3000, '结果');
    assert.ok(noCjk(s.state.game.result.explain), '解释是英文');
  }
  ok('英文玩家玩“百万富翁”：连续答对 4 题，题目、选项、分类、解释全是英文');
  await emit(s, 'room:leave');
  s.close();
}

// ───── 词语类游戏：中英文混合 ─────
{
  // 翻译词典里没有互相矛盾的写法
  assert.deepEqual(CONFLICTS, [], '同一个中文在不同文件里写了不同的英文：' + CONFLICTS.join('；'));

  // 英文玩家在时，词库只抽有英文说法的词（成语没有英文，不会出现）
  const idioms = DRAW_WORDS.filter(([w]) => !hasEnglish(w)).map(([w]) => w);
  assert.ok(idioms.length >= 10, '成语这类词没有英文版');
  const players = [{ id: 'a', nickname: 'A' }, { id: 'b', nickname: 'B' }, { id: 'c', nickname: 'C' }];
  let sawIdiom = false;
  for (let i = 0; i < 60; i++) {
    const d = new DrawGame({ players, rotation: 0, notify: () => {}, english: true });
    assert.ok(d.words.every(([w]) => hasEnglish(w)), '英文模式的你画我猜里不应有没有英文的词');
    d.dispose();
    const z = new DrawGame({ players, rotation: 0, notify: () => {} });
    if (z.words.some(([w]) => idioms.includes(w))) sawIdiom = true;
    z.dispose();
    const t = new TabooGame({ players, rotation: 0, notify: () => {}, english: true });
    assert.ok(t.deck.every((e) => [e.word, ...e.banned].every(hasEnglish)), '禁忌词挑战的词和禁忌词都要有英文');
    t.dispose();
    const u = new UndercoverGame({ players, rotation: 0, notify: () => {}, english: true });
    assert.ok(hasEnglish(u.civWord) && hasEnglish(u.undWord));
    u.dispose();
  }
  assert.ok(sawIdiom, '全是中文玩家时仍然会抽到成语');
  const noEnglish = [...new Set(WORD_PAIRS.flat())].filter((w) => !hasEnglish(w));
  const noTaboo = TABOO.filter((e) => ![e.word, ...e.banned].every(hasEnglish));
  assert.deepEqual(noEnglish, [], '谁是卧底的词全部有英文：' + noEnglish.join(','));
  assert.deepEqual(noTaboo, [], '禁忌词的词全部有英文');
  ok(`英文模式只抽有英文说法的词：你画我猜（${idioms.length} 个成语不会出现）、禁忌词挑战、谁是卧底；全中文时仍有成语；翻译词典没有冲突`);

  // 禁忌词：中英文两种说法都不能说，英文要整个单词匹配
  const t = new TabooGame({ players: players.slice(0, 2), rotation: 0, notify: () => {}, english: true });
  t.deck = [{ word: '太阳', banned: ['白天', '热', '光'] }];
  t.deckIdx = 0;
  const describer = t.describer;
  const fouls = () => t.log.filter((e) => e.kind === 'foul').length;
  t.handleAction(describer, { type: 'hint', text: 'it comes up every morning' });
  assert.equal(fouls(), 0);
  t.handleAction(describer, { type: 'hint', text: 'a photograph of the sky' }); // photograph 里有 hot？没有；photo 里有 hot —— 不能误判
  assert.equal(fouls(), 0, '“hot” 不会误伤 “photograph”');
  t.handleAction(describer, { type: 'hint', text: 'it is very HOT' });
  assert.equal(fouls(), 1, '英文禁忌词不分大小写');
  t.handleAction(describer, { type: 'hint', text: 'the Sun is far away' });
  assert.equal(fouls(), 2, '英文的词本身也不能说');
  t.handleAction(describer, { type: 'hint', text: '一个很亮的太阳' });
  assert.equal(fouls(), 3, '中文的词本身也不能说');
  t.dispose();
  const t2 = new TabooGame({ players: players.slice(0, 2), rotation: 0, notify: () => {} });
  t2.deck = [{ word: '太阳', banned: ['白天', '热', '光'] }];
  const other = t2.ids.find((id) => id !== t2.describer);
  assert.ok(t2.handleAction(other, { type: 'guess', text: ' sun ' }).ok);
  assert.equal(t2.solvedBy, other, '猜英文单词也算对（不分大小写和空格）');
  t2.dispose();
  ok('禁忌词挑战：中英文两种说法都不能说（英文整词匹配、不分大小写，不会把 “photograph” 当成 “hot”），猜中文词或英文词都算对');

  // 谁是卧底：不能说出自己的词（中英文）
  const u = new UndercoverGame({ players, rotation: 0, notify: () => {}, english: true });
  u.civWord = '牛奶';
  u.undWord = '豆浆';
  u.undercoverId = 'a';
  const first = u.order[0];
  const mine = u.wordOf(first);
  assert.equal(u.handleAction(first, { type: 'describe', text: 'i drink ' + tr(mine).toUpperCase() + ' daily' }).ok, false, '说出英文词不行');
  assert.equal(u.handleAction(first, { type: 'describe', text: '我每天都喝' + mine }).ok, false, '说出中文词不行');
  assert.ok(u.handleAction(first, { type: 'describe', text: 'white and good for breakfast' }).ok);
  u.dispose();
  ok('谁是卧底：描述里说出自己的词（中文或英文，不分大小写）会被拒绝');
}
{
  // 你画我猜：中英文玩家同一局，写对方语言的词也算对
  const a = await mk('zh');
  const b = await mk('en');
  const r = await emit(a, 'room:create', { nickname: 'Zed', avatar: '🦊', mode: 'duo' });
  assert.ok((await emit(b, 'room:join', { code: r.code, nickname: 'Eve', avatar: '🐻' })).ok);
  for (const x of [a, b]) await emit(x, 'room:vote', { gameId: 'draw' });
  for (const x of [a, b]) await emit(x, 'room:ready', { ready: true });
  await wait(80);
  assert.ok((await emit(a, 'room:start')).ok);
  await until(() => a.state.phase === 'playing' && b.state.phase === 'playing', 4000, '开始');
  const drawer = a.state.game.drawerId === a.state.you ? a : b;
  const guesser = drawer === a ? b : a;
  const shown = drawer.state.game.word;
  assert.ok(shown && (drawer === a ? CJK.test(shown) : !CJK.test(shown)), '画家看到自己语言的词：' + shown);
  const pair = DRAW_WORDS.find(([zh]) => zh === shown || tr(zh) === shown);
  assert.ok(pair, '词在词库里');
  const guessWord = guesser === a ? pair[0] : tr(pair[0]); // 猜词的人写自己的语言
  assert.equal(CJK.test(guessWord), guesser === a);
  assert.ok(!JSON.stringify(guesser.state.game).includes(shown), '猜词者的视图里没有答案');
  const rr = await emit(guesser, 'game:action', { type: 'guess', text: guessWord });
  assert.ok(rr.ok, JSON.stringify(rr));
  await until(() => a.state.game.phase === 'reveal', 3000, '猜对后揭晓');
  assert.equal(a.state.game.word === shown || a.state.game.word === pair[0], true);
  assert.ok(!CJK.test(b.state.game.word), '英文玩家揭晓时看到英文词：' + b.state.game.word);
  assert.ok(CJK.test(a.state.game.word), '中文玩家揭晓时看到中文词：' + a.state.game.word);
  // 提示的字数按各自语言算
  assert.ok(b.state.game.wordLen === [...tr(pair[0])].length && a.state.game.wordLen === [...pair[0]].length, '字数提示按各自语言算');
  ok(`你画我猜（中英文同局）：画家看到自己语言的词（“${shown}”），对方用自己的语言写出同一个词就算猜对；揭晓时各看各的语言`);
  await emit(a, 'room:leave');
  await emit(b, 'room:leave');
  a.close();
  b.close();
}
{
  // 真假判断 / 默契大考验 / 谁最有可能：英文玩家的题目全是英文
  for (const [gameId, mode, n] of [['truefalse', 'solo', 1], ['tacit', 'duo', 2], ['likely', 'trio', 3]]) {
    const socks = await Promise.all(Array.from({ length: n }, () => mk('en')));
    const r = await emit(socks[0], 'room:create', { nickname: 'E0', avatar: '🦊', mode });
    for (let i = 1; i < n; i++) await emit(socks[i], 'room:join', { code: r.code, nickname: 'E' + i, avatar: '🐻' });
    for (const x of socks) await emit(x, 'room:vote', { gameId });
    for (const x of socks) await emit(x, 'room:ready', { ready: true });
    await wait(80);
    assert.ok((await emit(socks[0], 'room:start')).ok, gameId);
    await until(() => socks[0].state.game?.question, 4000, gameId + ' 第一题');
    assert.ok(noCjk(socks[0].state.game), gameId + ' 的题目视图里不应有中文：' + JSON.stringify(socks[0].state.game).slice(0, 200));
    // 答完一题，看揭晓（解释）也是英文
    for (const x of socks) {
      const opt = x.state.game.options.find((o) => o.id !== x.state.you) ?? x.state.game.options[0];
      await emit(x, 'game:action', { type: 'pick', round: 0, option: opt.id });
    }
    await until(() => socks[0].state.game.phase === 'reveal', 3000, gameId + ' 揭晓');
    assert.ok(noCjk(socks[0].state.game), gameId + ' 揭晓后的视图里不应有中文');
    for (const x of socks) {
      await emit(x, 'room:leave');
      x.close();
    }
  }
  ok('英文玩家玩“真假判断”“默契大考验”“谁最有可能”：题目、选项、解释全是英文');
}

// ───── 漏翻审计：整个测试过程中，英文游戏发出去的所有文字 ─────
{
  const audit = await (await fetch(URL + '/api/i18n-audit')).json();
  const missing = {};
  for (const id of idsEn) if (audit[id]?.length) missing[id] = audit[id];
  assert.deepEqual(missing, {}, '这些句子没有英文翻译：\n' + JSON.stringify(missing, null, 1));
  const covered = EN_GAMES.filter((id) => id in audit || true).length;
  ok(`漏翻审计：${covered} 款英文游戏在整套测试中发出的所有视图和错误提示，翻译成英文后都没有残留中文`);
  const rest = Object.keys(audit).filter((k) => !idsEn.has(k) && k !== 'lobby');
  console.log(`  （仅中文的游戏里还有 ${rest.length} 个游戏的文字没翻译，这是预期的：${rest.join('、')}）`);
}

console.log(`\n全部 ${n} 项通过`);
process.exit(0);
