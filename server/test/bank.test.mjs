// 题库系统测试（需要用 tsx 运行，因为要直接检查题库数据）：
//   QUIZ_REVEAL_MS=150 npm start      （另一个窗口）
//   node --import tsx server/test/bank.test.mjs
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';
import { BANKS, BUILTIN, draw, judge, checkSubmission, isChoice } from '../src/bank/index.ts';

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

// ───────────── A. 题库数据质量（直接检查） ─────────────
{
  assert.equal(BANKS.length, 15);
  const ids = new Set(BUILTIN.map((q) => q.id));
  assert.equal(ids.size, BUILTIN.length, '题目 id 不能重复');
  for (const q of BUILTIN) {
    assert.ok(BANKS.some((b) => b.id === q.bank), `未知题库 ${q.bank}`);
    assert.ok([1, 2, 3].includes(q.difficulty), q.id);
    assert.ok(q.q && q.explain, `${q.id} 缺少题目或解释`);
    if (q.options) {
      assert.equal(new Set(q.options).size, q.options.length, `${q.id} 选项重复`);
      assert.ok(q.options.length >= 2 && q.options.length <= 6);
      if (q.type === 'multi') assert.ok(q.answer.every((i) => i >= 0 && i < q.options.length) && q.answer.length >= 1, q.id);
      else assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, `${q.id} 答案下标越界`);
    } else {
      assert.ok(Array.isArray(q.answer) && q.answer.length >= 1 && q.answer.every((a) => typeof a === 'string' && a), q.id);
    }
  }
  ok(`内置题库 ${BUILTIN.length} 题：id 唯一、答案在范围内、每题都有解释`);

  for (const b of BANKS) {
    const list = BUILTIN.filter((q) => q.bank === b.id);
    assert.ok(list.length >= 8, `${b.name} 题目太少：${list.length}`);
    for (const d of [1, 2, 3]) assert.ok(list.some((q) => q.difficulty === d), `${b.name} 缺少难度 ${d}`);
    const texts = list.map((q) => q.q);
    assert.equal(new Set(texts).size, texts.length, `${b.name} 有重复题目`);
  }
  ok('15 个题库每个至少 8 题，且都包含简单 / 普通 / 困难');

  const types = new Set(BUILTIN.map((q) => q.type));
  for (const t of ['single', 'multi', 'truefalse', 'fill', 'image', 'reasoning']) assert.ok(types.has(t), `缺少题型 ${t}`);
  ok(`题型覆盖：${[...types].join('、')}`);

  // 判题
  const multi = BUILTIN.find((q) => q.type === 'multi');
  assert.equal(judge(multi, { choices: [...multi.answer] }), true);
  assert.equal(judge(multi, { choices: [multi.answer[0]] }), multi.answer.length === 1);
  assert.equal(judge(multi, { choices: [0, 1, 2, 3].filter((i) => i < multi.options.length) }), multi.answer.length === multi.options.length);
  const fill = BUILTIN.find((q) => q.type === 'fill');
  assert.equal(judge(fill, { text: ` ${fill.answer[0]} ` }), true);
  assert.equal(judge(fill, { text: '完全不对的答案' }), false);
  const single = BUILTIN.find((q) => q.type === 'single');
  assert.equal(judge(single, { choice: single.answer }), true);
  assert.equal(judge(single, { choice: (single.answer + 1) % single.options.length }), false);
  assert.ok(checkSubmission(single, { choice: 99 }));
  assert.ok(checkSubmission(multi, { choices: [] }));
  assert.ok(checkSubmission(fill, { text: '' }));
  ok('判题：单选、多选（必须全对）、填空（忽略空格）、非法提交被拒绝');

  // 抽题
  const hard = draw({ banks: ['cn_lit'], difficulty: 3, count: 4 });
  assert.ok(hard.every((q) => q.difficulty === 3 && q.bank === 'cn_lit'));
  const noRepeat = draw({ count: 30 });
  assert.equal(new Set(noRepeat.map((q) => q.id)).size, noRepeat.length);
  const first = draw({ banks: ['logic'], count: 5 });
  const second = draw({ banks: ['logic'], count: 4, exclude: new Set(first.map((q) => q.id)) });
  assert.ok(second.every((q) => !first.some((f) => f.id === q.id)), '排除已出过的题');
  assert.ok(draw({ choiceOnly: true, count: 40 }).every(isChoice));
  const film = draw({ banks: ['film_music'], tag: 'film', count: 20 });
  assert.ok(film.length > 0 && film.every((q) => q.tag === 'film'));
  ok('抽题：按题库 / 难度 / 标签筛选、不重复、排除已出过的、仅选择题');
}

// ───────────────────────── B. 联机：题库游戏 ─────────────────────────
const dev = (i) => `devtest${Date.now()}${i}`.slice(0, 40);
const socks = await Promise.all([1, 2, 3].map(mk));
const byText = (text) => BUILTIN.find((q) => q.q === text);
const act = (s, a) => emit(s, 'game:action', a);

async function startRoom(mode, count, gameId, extra = {}) {
  const list = socks.slice(0, count);
  const r = await emit(list[0], 'room:create', { nickname: 'P0', avatar: '🦊', mode, deviceId: dev(0) });
  assert.ok(r.ok, JSON.stringify(r));
  for (let i = 1; i < count; i++) assert.ok((await emit(list[i], 'room:join', { code: r.code, nickname: 'P' + i, avatar: '🐻', deviceId: dev(i) })).ok);
  if (extra.settings) assert.ok((await emit(list[0], 'room:settings', extra.settings)).ok);
  for (const s of list) await emit(s, 'room:vote', { gameId });
  for (const s of list) await emit(s, 'room:ready', { ready: true });
  const st = await emit(list[0], 'room:start');
  assert.ok(st.ok, JSON.stringify(st));
  await wait();
  return list;
}
async function leaveAll() {
  for (const s of socks) await emit(s, 'room:leave');
  await wait(50);
}

/** 用题库数据当“标准答案”，按指定策略答完一局，返回出过的题 */
async function playQuiz(list, policy) {
  const seen = [];
  for (let k = 0; k < 10 && !list[0].state.gameOver; k++) {
    await wait(k === 0 ? 0 : 300);
    const v = list[0].state.game;
    if (v.phase === 'over') break;
    assert.equal(v.index, k);
    const q = byText(v.question) ?? policy.custom?.(v.question);
    assert.ok(q, '题目应能在题库里找到：' + v.question);
    seen.push(q);
    assert.ok(!JSON.stringify(v).includes(q.explain), '作答前不能把解释发出去');
    for (let i = 0; i < list.length; i++) {
      const right = policy.right(i, k);
      let a;
      if (isChoice(q)) a = { choice: right ? q.answer : (q.answer + 1) % q.options.length };
      else if (q.type === 'multi') a = { choices: right ? q.answer : [q.answer.includes(0) ? q.options.length - 1 : 0].filter((x) => !q.answer.includes(x) || q.answer.length > 1) };
      else a = { text: right ? q.answer[0] : '乱答一通' };
      const res = await act(list[i], { type: 'answer', index: k, ...a });
      assert.ok(res.ok, JSON.stringify(res) + ' ' + q.q + ' ' + JSON.stringify(a));
    }
    await wait(60);
    const r = list[0].state.game;
    assert.equal(r.phase, 'reveal');
    assert.ok(r.explain && r.answerText);
    for (let i = 0; i < list.length; i++) {
      const want = policy.right(i, k);
      // 多选的“错误答案”构造可能碰巧也是对的，所以只对非多选严格断言
      if (q.type !== 'multi') assert.equal(r.correct[list[i].state.you], want, q.q);
      assert.equal(r.gains[list[i].state.you] > 0, r.correct[list[i].state.you]);
    }
  }
  await wait(300);
  assert.equal(list[0].state.gameOver, true);
  return seen;
}

{
  const list = await startRoom('trio', 3, 'q-cnlit');
  const seen = await playQuiz(list, { right: (i) => i === 0 }); // 只有 P0 全对
  assert.equal(new Set(seen.map((q) => q.id)).size, seen.length, '同一局不重复');
  assert.ok(seen.every((q) => q.bank === 'cn_lit'), '只从中国文学题库抽题');
  const aw = list[0].state.awards;
  assert.equal(aw[list[0].state.you], 3);
  ok('中国文学问答（三人）：只出中国文学题，同一局不重复，作答前不泄露解释，全对者第一 +3');
  const firstIds = new Set(seen.map((q) => q.id));
  await emit(list[0], 'game:end');
  // 同一房间连续再玩：还没出过的题必须先出
  await emit(list[0], 'room:vote', { gameId: 'q-cnlit' });
  for (const s of list) await emit(s, 'room:vote', { gameId: 'q-cnlit' });
  for (const s of list) await emit(s, 'room:ready', { ready: true });
  assert.ok((await emit(list[0], 'room:start')).ok);
  await wait();
  const seen2 = await playQuiz(list, { right: () => true });
  const total = BUILTIN.filter((q) => q.bank === 'cn_lit').length;
  const freshExpected = Math.min(10, total - firstIds.size);
  const freshGot = seen2.filter((q) => !firstIds.has(q.id)).length;
  assert.equal(freshGot, freshExpected, '第二局应先把没出过的题用完');
  ok(`同一房间连续玩：第二局包含了全部 ${freshExpected} 道没出过的题`);
  await emit(list[0], 'game:end');
  await leaveAll();
}

{
  // 全类型覆盖：反复玩“成语知识问答”“逻辑推理”“脑筋急转弯”等，答题格式全部走一遍
  const typesSeen = new Set();
  // 题型是随机抽到的，所以多玩几轮，直到填空、多选、看图三种都见过（最多 4 轮）
  for (let round = 0; round < 4 && !['fill', 'multi', 'image'].every((x) => typesSeen.has(x)); round++) {
    for (const gameId of ['q-idiom', 'q-sci', 'q-poem', 'q-logic', 'q-brain', 'q-mylit']) {
      const list = await startRoom('duo', 2, gameId);
      const seen = await playQuiz(list, { right: (i) => i === 0 });
      for (const q of seen) typesSeen.add(q.type);
      await emit(list[0], 'game:end');
      await leaveAll();
    }
  }
  assert.ok(typesSeen.has('fill') && typesSeen.has('multi') && typesSeen.has('image'));
  ok(`多种题型（${[...typesSeen].join('、')}）都能正常作答和判题`);
}

{
  // 旧版“答题竞赛”只出一键作答的题
  const list = await startRoom('solo', 1, 'quiz');
  const seen = await playQuiz(list, { right: () => true });
  assert.ok(seen.every(isChoice));
  assert.equal(list[0].state.awards[list[0].state.you], 3);
  ok('答题竞赛（单人）：只出一键作答的题，全对得 +3');
  await emit(list[0], 'game:end');
  await leaveAll();
}

{
  // 难度设置
  const hardCount = BUILTIN.filter((q) => q.bank === 'cn_lit' && q.difficulty === 3).length;
  const list = await startRoom('duo', 2, 'q-cnlit', { settings: { difficulty: 3 } });
  const seen = await playQuiz(list, { right: () => true });
  assert.equal(seen.filter((q) => q.difficulty === 3).length, Math.min(10, hardCount));
  assert.ok(seen.slice(0, 0).length === 0);
  ok(`难度设置“困难”：${hardCount} 道困难题全部出现`);
  await emit(list[0], 'game:end');
  assert.equal((await emit(list[1], 'room:settings', { difficulty: 1 })).ok, false);
  assert.equal((await emit(list[0], 'room:settings', { difficulty: 7 })).ok, false);
  ok('只有房主能改设置；非法难度被拒绝');
  await leaveAll();
}

// ───────────────────────── C. 题库中心 / 自定义题库 / 收藏 / 统计 ─────────────────────────
{
  const [A, B] = socks;
  const dA = dev(10), dB = dev(11);
  const L = await emit(A, 'bank:list', { deviceId: dA });
  assert.equal(L.banks.length, 15);
  assert.ok(L.banks.every((b) => b.total >= 8 && b.byDifficulty[1] > 0));
  ok('题库中心：15 个题库及各难度题数');

  const br = await emit(A, 'bank:browse', { deviceId: dA, bankId: 'poem', difficulty: 3 });
  assert.ok(br.ok && br.questions.length > 0 && br.questions.every((q) => q.difficulty === 3 && q.bank === 'poem'));
  const brT = await emit(A, 'bank:browse', { deviceId: dA, bankId: 'logic', type: 'reasoning' });
  assert.ok(brT.questions.every((q) => q.type === 'reasoning'));
  assert.equal((await emit(A, 'bank:browse', { deviceId: dA, bankId: 'nope' })).ok, false);
  ok('按难度、题型浏览题库（学习模式带答案和解释）');

  // 收藏
  const qid = br.questions[0].id;
  assert.equal((await emit(A, 'bank:fav', { deviceId: dA, questionId: qid })).favorited, true);
  const favs = await emit(A, 'bank:browse', { deviceId: dA, bankId: 'favorites' });
  assert.deepEqual(favs.questions.map((q) => q.id), [qid]);
  assert.equal((await emit(A, 'bank:fav', { deviceId: dA, questionId: qid })).favorited, false);
  assert.equal((await emit(A, 'bank:fav', { deviceId: dA, questionId: 'bogus-1' })).ok, false);
  assert.equal((await emit(A, 'bank:fav', { questionId: qid })).ok, false);
  ok('收藏题目：收藏 / 取消收藏 / 列表；没有设备身份或题目不存在会被拒绝');

  // 自定义题库
  const c = await emit(A, 'bank:create', { deviceId: dA, name: '朋友聚会', visibility: 'room', nickname: 'P0', avatar: '🦊' });
  assert.ok(c.ok);
  const bid = c.bank.id;
  assert.equal((await emit(A, 'bank:create', { deviceId: dA, name: '', visibility: 'room' })).ok, false);
  assert.equal((await emit(A, 'bank:create', { deviceId: dA, name: 'x', visibility: 'secret' })).ok, false);
  const add = (question) => emit(A, 'bank:saveq', { deviceId: dA, bankId: bid, question });
  const good = [
    { type: 'single', q: '我们第一次聚会在哪里？', options: ['咖啡厅', '公园', '家里'], answer: 2, difficulty: 1 },
    { type: 'truefalse', q: '小明喜欢吃榴莲。', answer: 0 },
    { type: 'multi', q: '谁参加了上次聚会？', options: ['小明', '小红', '小刚', '小丽'], answer: [0, 1, 3], explain: '上次三人加小丽。' },
    { type: 'fill', q: '小红的生日在几月？（只写数字）', answer: ['5', '五'] },
    { type: 'single', q: '最爱的游戏？', options: ['A', 'B'], answer: 1, difficulty: 3 },
  ];
  const ids = [];
  for (const g of good) {
    const r = await add(g);
    assert.ok(r.ok, JSON.stringify(r));
    ids.push(r.id);
  }
  for (const bad of [
    { type: 'single', q: '', options: ['a', 'b'], answer: 0 },
    { type: 'single', q: '只有一个选项', options: ['a'], answer: 0 },
    { type: 'single', q: '重复选项', options: ['a', 'a'], answer: 0 },
    { type: 'single', q: '答案越界', options: ['a', 'b'], answer: 5 },
    { type: 'multi', q: '多选只有两项', options: ['a', 'b'], answer: [0] },
    { type: 'fill', q: '填空没答案', answer: [] },
    { type: 'truefalse', q: '判断没答案', answer: 3 },
    { type: 'magic', q: '未知题型', answer: 0 },
    { type: 'single', q: 'x'.repeat(200), options: ['a', 'b'], answer: 0 },
  ]) assert.equal((await add(bad)).ok, false, JSON.stringify(bad));
  ok('自定义题库：创建、添加 5 种合法题目；9 种不合法题目全部被拒绝');

  assert.equal((await emit(B, 'bank:saveq', { deviceId: dB, bankId: bid, question: good[0] })).ok, false);
  assert.equal((await emit(B, 'bank:delete', { deviceId: dB, bankId: bid })).ok, false);
  assert.equal((await emit(B, 'bank:browse', { deviceId: dB, bankId: bid })).ok, false);
  ok('别人不能修改、删除或浏览我的非公开题库');

  // 编辑 / 删除
  assert.ok((await emit(A, 'bank:saveq', { deviceId: dA, bankId: bid, question: { ...good[1], id: ids[1], q: '小明不喜欢吃榴莲。', answer: 1 } })).ok);
  let mine = (await emit(A, 'bank:list', { deviceId: dA })).custom.mine.find((b) => b.id === bid);
  assert.equal(mine.questions.find((q) => q.id === ids[1]).q, '小明不喜欢吃榴莲。');
  assert.equal(mine.questions.length, 5);
  assert.ok((await emit(A, 'bank:saveq', { deviceId: dA, bankId: bid, question: { type: 'fill', q: '临时题', answer: ['a'] } })).ok);
  mine = (await emit(A, 'bank:list', { deviceId: dA })).custom.mine.find((b) => b.id === bid);
  const temp = mine.questions.find((q) => q.q === '临时题');
  assert.ok((await emit(A, 'bank:delq', { deviceId: dA, bankId: bid, questionId: temp.id })).ok);
  assert.equal((await emit(A, 'bank:delq', { deviceId: dA, bankId: bid, questionId: temp.id })).ok, false);
  ok('编辑题目（改题干和答案）、删除题目');

  // 使用权限：room = 只有创建者作为房主可用
  const roomOf = async (host, hostDev, mode = 'solo') => {
    const r = await emit(host, 'room:create', { nickname: 'H', avatar: '🦊', mode, deviceId: hostDev });
    assert.ok(r.ok);
    return r;
  };
  await roomOf(B, dB, 'solo');
  assert.equal((await emit(B, 'room:settings', { customBank: bid })).ok, false);
  await emit(B, 'room:leave');
  ok('“仅房间使用”的题库，别人当房主时不能选用');

  await emit(A, 'bank:update', { deviceId: dA, bankId: bid, visibility: 'private' });
  await roomOf(A, dA, 'trio');
  assert.equal((await emit(A, 'room:settings', { customBank: bid })).ok, false);
  await emit(A, 'room:leave');
  await roomOf(A, dA, 'solo');
  await wait();
  assert.equal(A.state.bankChoices.some((b) => b.id === bid), true);
  assert.ok((await emit(A, 'room:settings', { customBank: bid })).ok);
  ok('“仅自己使用”的题库只能在自己的单人房间里选用');

  // 用自定义题库玩一局（单人，5 题）
  await emit(A, 'room:vote', { gameId: 'q-common' });
  await emit(A, 'room:ready', { ready: true });
  assert.ok((await emit(A, 'room:start')).ok);
  await wait();
  const texts = new Set();
  for (let k = 0; k < 5; k++) {
    await wait(k ? 300 : 0);
    const v = A.state.game;
    assert.equal(v.category, '朋友聚会');
    assert.equal(v.total, 5);
    const q = mine.questions.concat([]).find((x) => x.q === v.question) ?? (await emit(A, 'bank:list', { deviceId: dA })).custom.mine.find((b) => b.id === bid).questions.find((x) => x.q === v.question);
    assert.ok(q, '题目应来自自定义题库：' + v.question);
    texts.add(q.q);
    let a;
    if (q.type === 'multi') a = { choices: q.answer };
    else if (q.options) a = { choice: q.answer };
    else a = { text: q.answer[0] };
    assert.ok((await act(A, { type: 'answer', index: k, ...a })).ok);
    await wait(60);
    assert.equal(A.state.game.correct[A.state.you], true);
  }
  await wait(300);
  assert.equal(A.state.gameOver, true);
  assert.equal(texts.size, 5);
  ok('用自定义题库玩单人：5 题全部来自自定义题库，题型都能判对');
  await emit(A, 'game:end');
  await emit(A, 'room:leave');

  // 答题统计
  const prof = await emit(A, 'profile:get', { deviceId: dA });
  assert.ok(prof.me.profile.quiz.answered >= 5 && prof.me.profile.quiz.bestStreak >= 5);
  ok(`答题统计已记录：共答 ${prof.me.profile.quiz.answered} 题，答对 ${prof.me.profile.quiz.correct} 题，最长连对 ${prof.me.profile.quiz.bestStreak}`);

  // 题库少于 5 题不能使用；公开题库别人可用
  const c2 = await emit(A, 'bank:create', { deviceId: dA, name: '公开小库', visibility: 'public' });
  await emit(A, 'bank:saveq', { deviceId: dA, bankId: c2.bank.id, question: good[0] });
  await roomOf(B, dB, 'solo');
  assert.equal((await emit(B, 'room:settings', { customBank: c2.bank.id })).ok, false);
  for (let i = 0; i < 4; i++) await emit(A, 'bank:saveq', { deviceId: dA, bankId: c2.bank.id, question: { ...good[1], q: `判断第${i}题` } });
  assert.ok((await emit(B, 'room:settings', { customBank: c2.bank.id })).ok);
  const pub = (await emit(B, 'bank:list', { deviceId: dB })).custom.publicOthers;
  assert.ok(pub.some((b) => b.id === c2.bank.id));
  assert.ok((await emit(B, 'bank:browse', { deviceId: dB, bankId: c2.bank.id })).ok);
  await emit(B, 'room:leave');
  ok('题库少于 5 题不能用于游戏；公开题库其他玩家可以选用和浏览');

  // 删除题库
  assert.ok((await emit(A, 'bank:delete', { deviceId: dA, bankId: bid })).ok);
  assert.equal((await emit(A, 'bank:browse', { deviceId: dA, bankId: bid })).ok, false);
  ok('删除自定义题库');
}

console.log(`\n全部 ${n} 项通过`);
for (const s of socks) s.close();
process.exit(0);
