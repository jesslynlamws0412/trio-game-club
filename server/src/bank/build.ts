import type { Difficulty, QType, Question } from './types.js';

/** 书写题目用的简写，最后由 builtin.ts 统一编号。 */
type Draft = Omit<Question, 'id'>;
const TF = ['对', '错'];

export const S = (bank: string, difficulty: Difficulty, q: string, options: string[], a: number, explain: string, tag?: string): Draft =>
  ({ bank, difficulty, type: 'single', q, options, answer: a, explain, tag });

export const T = (bank: string, difficulty: Difficulty, q: string, a: boolean, explain: string, tag?: string): Draft =>
  ({ bank, difficulty, type: 'truefalse', q, options: TF, answer: a ? 0 : 1, explain, tag });

export const M = (bank: string, difficulty: Difficulty, q: string, options: string[], a: number[], explain: string): Draft =>
  ({ bank, difficulty, type: 'multi', q, options, answer: a, explain });

/** 填空 / 简答：accepted 里列出所有可接受的写法 */
export const F = (bank: string, difficulty: Difficulty, q: string, accepted: string[], explain: string, type: QType = 'fill'): Draft =>
  ({ bank, difficulty, type, q, answer: accepted, explain });

export const R = (bank: string, difficulty: Difficulty, q: string, options: string[], a: number, explain: string): Draft =>
  ({ bank, difficulty, type: 'reasoning', q, options, answer: a, explain });

export const I = (bank: string, difficulty: Difficulty, image: string, q: string, options: string[], a: number, explain: string): Draft =>
  ({ bank, difficulty, type: 'image', q, image, options, answer: a, explain });

export const IF = (bank: string, difficulty: Difficulty, image: string, q: string, accepted: string[], explain: string): Draft =>
  ({ bank, difficulty, type: 'image', q, image, answer: accepted, explain });

export type { Draft, Question };
