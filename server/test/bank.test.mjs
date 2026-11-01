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

  // 选项顺序：题库里正确答案大多写在第一个，出题时必须打乱，且答案同步
  const pool = draw({ count: 500, choiceOnly: true });
  const oneOf = pool.filter((q) => q.type === 'single' || q.type === 'reasoning');
  const where = [0, 0, 0, 0];
  for (const q of oneOf) {
    const orig = BUILTIN.find((b) => b.id === q.id);
    assert.equal(q.options[q.answer], orig.options[orig.answer], `${q.id} 打乱后答案要对得上`);
    assert.deepEqual([...q.options].sort(), [...orig.options].sort(), `${q.id} 选项不能增减`);
    if (q.options.length === 4) where[q.answer]++;
  }
  const fourTotal = where.reduce((s, x) => s + x, 0);
  assert.ok(where.every((c) => c > fourTotal * 0.12), `正确答案的位置应该大致平均：${where.join('/')}`);
  const tf = pool.filter((q) => q.type === 'truefalse');
  assert.ok(tf.every((q) => q.options[0] === '对' && q.options[1] === '错'), '判断题保持“对 / 错”的顺序');
  const multis = draw({ banks: ['cn_history', 'cn_lit', 'science'], count: 200 }).filter((q) => q.type === 'multi');
  for (const q of multis) {
    const orig = BUILTIN.find((b) => b.id === q.id);
    assert.deepEqual(q.answer.map((i) => q.options[i]).sort(), orig.answer.map((i) => orig.options[i]).sort(), `${q.id} 多选答案要对得上`);
  }
  ok(`出题时打乱选项：答案位置分布 ${where.join('/')}，答案仍然对得上，判断题顺序不变，多选也对得上`);
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
      // 出题时选项顺序会被打乱：按玩家屏幕上看到的选项（v.options）找出正确答案的位置
      const shown = v.options ?? q.options;
      const pos = (i) => shown.indexOf(q.options[i]);
      if (isChoice(q)) {
        const good = pos(q.answer);
        assert.ok(good >= 0, '屏幕上的选项里应该有正确答案');
        a = { choice: right ? good : (good + 1) % shown.length };
      } else if (q.type === 'multi') {
        const good = q.answer.map(pos);
        a = { choices: right ? good : [good.includes(0) ? shown.length - 1 : 0].filter((x) => !good.includes(x) || good.length > 1) };
      } else a = { text: right ? q.answer[0] : '乱答一通' };
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

// ───────────────────────── C. 题库中心（浏览学习模式） ─────────────────────────
{
  const A = socks[0];
  const L = await emit(A, 'bank:list', {});
  assert.equal(L.banks.length, 15);
  assert.ok(L.banks.every((b) => b.total >= 8 && b.byDifficulty[1] > 0 && b.byDifficulty[2] > 0 && b.byDifficulty[3] > 0));
  ok('题库中心：15 个题库及各难度题数');

  const br = await emit(A, 'bank:browse', { bankId: 'poem', difficulty: 3 });
  assert.ok(br.ok && br.questions.length > 0 && br.questions.every((q) => q.difficulty === 3 && q.bank === 'poem'));
  assert.ok(br.questions.every((q) => q.explain && q.answer !== undefined), '学习模式带答案和解释');
  const brT = await emit(A, 'bank:browse', { bankId: 'logic', type: 'reasoning' });
  assert.ok(brT.questions.every((q) => q.type === 'reasoning'));
  assert.equal((await emit(A, 'bank:browse', { bankId: 'nope' })).ok, false);
  assert.equal((await emit(A, 'bank:browse', { bankId: 'favorites' })).ok, false);
  ok('按难度、题型浏览题库（带答案和解释）；不存在的题库被拒绝');
}
console.log(`\n全部 ${n} 项通过`);
for (const s of socks) s.close();
process.exit(0);
