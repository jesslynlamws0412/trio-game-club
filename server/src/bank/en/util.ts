import type { EnglishQuestion } from '../types.js';

/**
 * 一条英文题：[中文题干, 英文题干, 英文选项（判断题、填空题写 null）, 英文解释, 可接受的英文答案（只有填空题需要）]
 * 英文选项必须和中文选项一一对应：顺序和数量都一样，这样答案下标不用改。
 */
export type Entry = [zh: string, q: string, options: string[] | null, explain: string, answer?: string[]];

export function build(list: Entry[]): Record<string, EnglishQuestion> {
  const out: Record<string, EnglishQuestion> = {};
  for (const [zh, q, options, explain, answer] of list) {
    if (out[zh]) throw new Error('英文题库里有重复的中文题干：' + zh);
    out[zh] = { q, explain, ...(options ? { options } : {}), ...(answer ? { answer } : {}) };
  }
  return out;
}

/** 填空题里“顺序随便写”的所有排列（用空格隔开） */
export const permutations = (words: string[]): string[] => {
  if (words.length <= 1) return [words.join(' ')];
  return words.flatMap((w, i) => permutations([...words.slice(0, i), ...words.slice(i + 1)]).map((rest) => `${w} ${rest}`));
};
