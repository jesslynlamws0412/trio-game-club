import { EN } from './i18n/en/index.js';

/**
 * 英文翻译：游戏引擎和房间代码仍然直接生成中文文字，发给“选了英文”的玩家之前，
 * 在这里按词典翻译。词典的写法（server/src/i18n/en/*.ts）：
 *  - 整句直接对应："掷骰子": "Roll the dice"
 *  - 带变量的句子用 {名字} 占位："{p} 掷出 {a}+{b}。": "{p} rolled {a}+{b}."
 * 变量里如果还有中文（地名、玩家选的游戏名等），会再翻译一次。找不到翻译的文字保持中文。
 */
export type Lang = 'zh' | 'en';
export const normLang = (v: unknown): Lang => (v === 'en' ? 'en' : 'zh');

const CJK = /[一-鿿]/;

interface Template {
  re: RegExp;
  keys: string[];
  en: string;
  weight: number;
}

const exact = new Map<string, string>();
const templates: Template[] = [];

for (const [zh, en] of Object.entries(EN)) {
  if (!/\{\w+\}/.test(zh)) {
    exact.set(zh, en);
    continue;
  }
  const keys: string[] = [];
  let pattern = '';
  let literal = 0;
  for (const part of zh.split(/(\{\w+\})/)) {
    const m = /^\{(\w+)\}$/.exec(part);
    if (m) {
      keys.push(m[1]);
      pattern += '(.+?)';
    } else {
      pattern += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      literal += part.length;
    }
  }
  templates.push({ re: new RegExp('^' + pattern + '$', 's'), keys, en, weight: literal });
}
// 固定文字越多的模板越具体，先匹配
templates.sort((a, b) => b.weight - a.weight);

const cache = new Map<string, string>();

function translate(text: string): string {
  const hit = exact.get(text);
  if (hit !== undefined) return hit;
  for (const t of templates) {
    const m = t.re.exec(text);
    if (!m) continue;
    return t.en.replace(/\{(\w+)\}/g, (_all, k: string) => {
      const i = t.keys.indexOf(k);
      return i >= 0 ? tr(m[i + 1] ?? '') : '';
    });
  }
  return text;
}

/** 翻译一句话（没有中文的文字原样返回） */
export function tr(text: string): string {
  if (!CJK.test(text)) return text;
  let out = cache.get(text);
  if (out === undefined) {
    out = translate(text);
    if (cache.size > 8000) cache.clear();
    cache.set(text, out);
  }
  return out;
}

/** 这个中文词有没有英文说法（没有的词不会出给英文玩家，比如成语） */
export const hasEnglish = (zh: string) => !CJK.test(tr(zh));

/** 一个词的所有说法：中文原词，以及有英文时的英文词 */
export const wordForms = (zh: string): string[] => {
  const en = tr(zh);
  return CJK.test(en) ? [zh] : [zh, en];
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 一段文字里有没有说出这个词（不分大小写）。
 * 中文直接看有没有包含；英文要整个单词匹配（“hot”不会匹配到“photo”）。
 */
export function mentions(text: string, form: string): boolean {
  if (CJK.test(form)) return text.includes(form);
  return new RegExp('(^|[^a-z0-9])' + escapeRe(form.toLowerCase()) + '([^a-z0-9]|$)').test(text.toLowerCase());
}

/** 玩家自己输入的文字（昵称）不翻译 */
const SKIP_KEYS = new Set(['nickname', 'shown', 'myText']); // 玩家自己输入的文字（昵称、填空题的答案）不翻译

/** 把视图里所有的中文文字翻译成英文，返回新对象；中文玩家的视图原样返回。 */
export function translateDeep<T>(value: T, lang: Lang): T {
  if (lang !== 'en') return value;
  return walk(value) as T;
}

/** 玩家发言 / 提问 / 提示 / 猜词：带 playerId 的发言，或者 kind 是 hint / guess / q 的记录里的 text，是玩家自己输入的，不翻译 */
function isPlayerText(k: string, o: Record<string, unknown>) {
  return k === 'text' && ('playerId' in o || o.kind === 'hint' || o.kind === 'guess' || o.kind === 'q');
}

function walk(v: unknown): unknown {
  if (typeof v === 'string') return tr(v);
  if (Array.isArray(v)) return v.map(walk);
  if (v && typeof v === 'object') {
    if (v instanceof Set || v instanceof Map) return v;
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) out[k] = SKIP_KEYS.has(k) || isPlayerText(k, o) ? x : walk(x);
    return out;
  }
  return v;
}

/** 找出翻译后还含中文的文字（测试用：用来发现漏翻的句子） */
export function untranslated(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    if (CJK.test(value)) found.add(value);
  } else if (Array.isArray(value)) {
    for (const x of value) untranslated(x, found);
  } else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const [k, x] of Object.entries(o)) if (!SKIP_KEYS.has(k) && !isPlayerText(k, o)) untranslated(x, found);
  }
  return found;
}

/**
 * 审计模式（环境变量 I18N_AUDIT=1，只在测试里用）：把每个发出去的视图和错误提示都按英文翻译一遍，
 * 记下还含中文的句子（按游戏分类），测试结束时可以通过 /api/i18n-audit 看到有没有漏翻的。
 */
export const audit: Record<string, Set<string>> = {};
export function recordAudit(game: string, value: unknown, names: string[] = [], ignore?: Set<string>) {
  const left = untranslated(translateDeep(value, 'en'));
  for (let s of left) {
    if (ignore?.has(s)) continue; // 没有英文版的中文题目（只会出给中文玩家）
    for (const n of names) if (n) s = s.split(n).join('');
    if (CJK.test(s)) (audit[game] ??= new Set()).add(s);
  }
}
