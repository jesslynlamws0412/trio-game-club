import type { BankInfo, Difficulty, Question } from './types.js';
import { LITERATURE } from './data/literature.js';
import { HISTORY } from './data/history.js';
import { CULTURE } from './data/culture.js';
import { SCIENCE } from './data/science.js';
import { ARTS } from './data/arts.js';
import { MIND } from './data/mind.js';
import { QUIZ_BANK } from '../data/quizBank.js';
import { shuffle } from '../games/util.js';

export * from './types.js';

export const BANKS: BankInfo[] = [
  { id: 'cn_lit', name: '中国文学', icon: '📖', desc: '古代与现当代文学名著、作家' },
  { id: 'world_lit', name: '世界文学', icon: '📕', desc: '外国文学名著与作家' },
  { id: 'my_lit', name: '马华文学', icon: '🌴', desc: '马来西亚华文文学' },
  { id: 'cn_history', name: '中国历史', icon: '🏯', desc: '从先秦到近代' },
  { id: 'world_history', name: '世界历史', icon: '🗿', desc: '古代文明到现代' },
  { id: 'cn_culture', name: '中国文化', icon: '🏮', desc: '节日、典籍、传统习俗' },
  { id: 'world_geo', name: '世界地理', icon: '🌏', desc: '国家、城市、山川河流' },
  { id: 'science', name: '科学常识', icon: '🔬', desc: '物理、化学、生物、天文' },
  { id: 'film_music', name: '影视音乐', icon: '🎬', desc: '电影、动画与音乐' },
  { id: 'idiom_char', name: '成语汉字', icon: '📜', desc: '成语、词语、汉字书写' },
  { id: 'poem', name: '古典诗词', icon: '🖋️', desc: '诗词名句与作者' },
  { id: 'brain_teaser', name: '脑筋急转弯', icon: '🧩', desc: '轻松有趣的转弯题' },
  { id: 'trivia', name: '趣味冷知识', icon: '🧊', desc: '你可能不知道的小知识' },
  { id: 'daily', name: '日常生活常识', icon: '🏠', desc: '生活、健康与安全' },
  { id: 'logic', name: '逻辑推理', icon: '🧠', desc: '数列、推理与逻辑题' },
];
const BANK_NAME = new Map(BANKS.map((b) => [b.id, b.name]));
export const bankName = (id: string) => BANK_NAME.get(id) ?? '自定义题库';

// ───── 旧版答题竞赛题库（62 题）：按内容归入新的题库，难度统一为“简单” ─────
function legacyBank(q: (typeof QUIZ_BANK)[number]): string {
  const s = q.q;
  if (q.c === '文学') return /哈姆雷特|小王子|老人与海/.test(s) ? 'world_lit' : 'cn_lit';
  if (q.c === '历史') return /第二次世界大战|文艺复兴|独立宣言|金字塔|拿破仑/.test(s) ? 'world_history' : 'cn_history';
  if (q.c === '地理') return 'world_geo';
  if (q.c === '文化') return /蒙娜丽莎/.test(s) ? 'trivia' : /贝多芬/.test(s) ? 'film_music' : /奥运会/.test(s) ? 'daily' : 'cn_culture';
  return /光|光合|化学|哺乳|蜘蛛|地球绕|太阳从|可再生|沸点|体温|彩虹/.test(s) ? 'science' : 'daily';
}
const legacyDrafts: Omit<Question, 'id'>[] = QUIZ_BANK.map((q) => ({
  bank: legacyBank(q),
  difficulty: 1 as Difficulty,
  type: q.o.length === 2 && q.o[0] === '对' ? ('truefalse' as const) : ('single' as const),
  q: q.q,
  options: q.o,
  answer: q.a,
  explain: `正确答案是“${q.o[q.a]}”。`,
  tag: legacyBank(q) === 'film_music' ? 'music' : undefined,
}));

/** 内置题库：统一编号。 */
export const BUILTIN: Question[] = (() => {
  const counter: Record<string, number> = {};
  return [...LITERATURE, ...HISTORY, ...CULTURE, ...SCIENCE, ...ARTS, ...MIND, ...legacyDrafts].map((d) => {
    counter[d.bank] = (counter[d.bank] ?? 0) + 1;
    return { ...d, id: `${d.bank}-${counter[d.bank]}` } as Question;
  });
})();
const BY_ID = new Map(BUILTIN.map((q) => [q.id, q]));
export const getBuiltin = (id: string) => BY_ID.get(id);

// ───── 判题 ─────
const norm = (s: string) => s.replace(/[\s，。、,.!！?？:：;；"'“”‘’（）()《》·\-—_]/g, '').toLowerCase();

export const hasOptions = (q: Question) => Array.isArray(q.options);
/** 只需点一个选项的题型 */
export const isChoice = (q: Question) => hasOptions(q) && q.type !== 'multi';
export const isText = (q: Question) => !hasOptions(q);

export interface Submission {
  choice?: unknown;
  choices?: unknown;
  text?: unknown;
}

/** 校验提交格式（不合法返回错误文字），格式正确才进入 judge。 */
export function checkSubmission(q: Question, s: Submission): string | null {
  if (isChoice(q)) {
    if (!Number.isInteger(s.choice) || (s.choice as number) < 0 || (s.choice as number) >= q.options!.length) return '选项无效';
  } else if (q.type === 'multi') {
    const c = s.choices;
    if (!Array.isArray(c) || c.length < 1 || c.length > q.options!.length) return '请至少选择一个选项';
    if (!c.every((i) => Number.isInteger(i) && i >= 0 && i < q.options!.length) || new Set(c).size !== c.length) return '选项无效';
  } else {
    if (typeof s.text !== 'string' || s.text.trim().length < 1 || s.text.length > 40) return '请输入 1~40 个字的答案';
  }
  return null;
}

export function judge(q: Question, s: Submission): boolean {
  if (isChoice(q)) return s.choice === q.answer;
  if (q.type === 'multi') {
    const want = [...(q.answer as number[])].sort();
    const got = [...(s.choices as number[])].sort();
    return want.length === got.length && want.every((v, i) => v === got[i]);
  }
  const t = norm(String(s.text));
  return (q.answer as string[]).some((a) => norm(a) === t);
}

/** 揭晓时给玩家看的“正确答案”文字 */
export function answerText(q: Question): string {
  if (isChoice(q)) return q.options![q.answer as number];
  if (q.type === 'multi') return (q.answer as number[]).map((i) => q.options![i]).join('、');
  return (q.answer as string[])[0];
}

/** 发给玩家的题目（不含答案和解释） */
export function publicQuestion(q: Question) {
  return { id: q.id, bank: q.bank, bankName: bankName(q.bank), difficulty: q.difficulty, type: q.type, q: q.q, image: q.image ?? null, options: q.options ?? null };
}

// ───── 抽题 ─────
export interface DrawOpts {
  banks?: string[];
  tag?: string;
  /** 0 = 不限难度 */
  difficulty?: number;
  /** 只要一键作答的题型（答题竞赛的旧规则） */
  choiceOnly?: boolean;
  count: number;
  /** 本房间已经出过的题，尽量不重复 */
  exclude?: Set<string>;
  /** 自定义题库：有的话只从这里抽 */
  pool?: Question[] | null;
}

export function draw(o: DrawOpts): Question[] {
  let pool = o.pool ?? BUILTIN.filter((q) => (!o.banks || o.banks.includes(q.bank)) && (!o.tag || q.tag === o.tag));
  if (o.choiceOnly) pool = pool.filter(isChoice);
  const fit = (list: Question[]) => (o.difficulty ? list.filter((q) => q.difficulty === o.difficulty) : list);
  const fresh = (list: Question[]) => (o.exclude ? list.filter((q) => !o.exclude!.has(q.id)) : list);
  // 依次放宽：指定难度且没出过 → 没出过 → 指定难度 → 全部
  const tiers = [fit(fresh(pool)), fresh(pool), fit(pool), pool];
  const picked: Question[] = [];
  const seen = new Set<string>();
  for (const tier of tiers) {
    for (const q of shuffle(tier)) {
      if (picked.length >= o.count) break;
      if (!seen.has(q.id)) {
        seen.add(q.id);
        picked.push(q);
      }
    }
    if (picked.length >= o.count) break;
  }
  return shuffle(picked);
}

export function bankStats() {
  return BANKS.map((b) => {
    const list = BUILTIN.filter((q) => q.bank === b.id);
    return { ...b, total: list.length, byDifficulty: { 1: list.filter((q) => q.difficulty === 1).length, 2: list.filter((q) => q.difficulty === 2).length, 3: list.filter((q) => q.difficulty === 3).length } };
  });
}
