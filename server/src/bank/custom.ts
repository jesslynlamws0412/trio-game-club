import type { Difficulty, Question } from './types.js';

export type Visibility = 'private' | 'room' | 'public';
export const VISIBILITY_NAMES: Record<Visibility, string> = {
  private: '仅自己使用（单人房间）',
  room: '仅我创建的房间使用',
  public: '公开（所有人可用）',
};

export const MAX_BANKS_PER_PLAYER = 10;
export const MAX_QUESTIONS_PER_BANK = 200;
export const MIN_QUESTIONS_TO_PLAY = 5;

const str = (v: unknown, min: number, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length >= min && t.length <= max ? t : null;
};

export function cleanBankName(v: unknown) {
  return str(v, 1, 20);
}
export function cleanVisibility(v: unknown): Visibility | null {
  return v === 'private' || v === 'room' || v === 'public' ? v : null;
}

/**
 * 校验并整理玩家提交的自定义题目。只开放编辑器里支持的 4 种题型：单选、判断、多选、填空。
 * 返回整理好的题目（不含 id / bank / owner），或错误文字。
 */
export function validateQuestion(input: any): { ok: true; q: Omit<Question, 'id' | 'bank' | 'owner'> } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: '题目格式不对' };
  const q = str(input.q, 1, 120);
  if (!q) return { ok: false, error: '题目需要 1~120 个字' };
  const explain = input.explain === undefined || input.explain === '' ? '' : str(input.explain, 1, 200);
  if (explain === null) return { ok: false, error: '解释最多 200 个字' };
  const difficulty = (input.difficulty === undefined ? 2 : input.difficulty) as Difficulty;
  if (![1, 2, 3].includes(difficulty)) return { ok: false, error: '难度无效' };

  const cleanOptions = (min: number): string[] | null => {
    if (!Array.isArray(input.options) || input.options.length < min || input.options.length > 6) return null;
    const opts = input.options.map((o: unknown) => str(o, 1, 40));
    if (opts.some((o: string | null) => o === null)) return null;
    if (new Set(opts).size !== opts.length) return null;
    return opts as string[];
  };

  switch (input.type) {
    case 'single': {
      const options = cleanOptions(2);
      if (!options) return { ok: false, error: '单选题需要 2~6 个不重复的选项（每个 1~40 字）' };
      if (!Number.isInteger(input.answer) || input.answer < 0 || input.answer >= options.length) return { ok: false, error: '请选择正确答案' };
      return { ok: true, q: { difficulty, type: 'single', q, options, answer: input.answer, explain: explain || `正确答案是“${options[input.answer]}”。` } };
    }
    case 'truefalse': {
      if (input.answer !== 0 && input.answer !== 1) return { ok: false, error: '请选择“对”或“错”' };
      return { ok: true, q: { difficulty, type: 'truefalse', q, options: ['对', '错'], answer: input.answer, explain: explain || (input.answer === 0 ? '这句话是对的。' : '这句话是错的。') } };
    }
    case 'multi': {
      const options = cleanOptions(3);
      if (!options) return { ok: false, error: '多选题需要 3~6 个不重复的选项（每个 1~40 字）' };
      const a = input.answer;
      if (!Array.isArray(a) || a.length < 1 || a.length >= options.length + 1 || new Set(a).size !== a.length || !a.every((i: unknown) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < options.length)) {
        return { ok: false, error: '请选择至少一个正确答案' };
      }
      return { ok: true, q: { difficulty, type: 'multi', q, options, answer: [...a].sort(), explain: explain || `正确答案是：${a.map((i: number) => options[i]).join('、')}。` } };
    }
    case 'fill': {
      const raw = Array.isArray(input.answer) ? input.answer : [input.answer];
      const accepted = raw.map((x: unknown) => str(x, 1, 20));
      if (accepted.length < 1 || accepted.length > 5 || accepted.some((x: string | null) => x === null)) {
        return { ok: false, error: '填空题需要 1~5 个可接受的答案（每个 1~20 字）' };
      }
      return { ok: true, q: { difficulty, type: 'fill', q, answer: accepted as string[], explain: explain || `参考答案：${accepted[0]}。` } };
    }
    default:
      return { ok: false, error: '题型无效' };
  }
}
