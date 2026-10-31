/** 题库系统的类型。题库和游戏逻辑完全分开：游戏只通过 bank/index.ts 抽题、判题。 */
export type QType = 'single' | 'multi' | 'truefalse' | 'fill' | 'short' | 'image' | 'reasoning';
export type Difficulty = 1 | 2 | 3; // 简单 / 普通 / 困难

export interface Question {
  id: string;
  bank: string;
  difficulty: Difficulty;
  type: QType;
  q: string;
  /** 图片猜题：用表情符号拼成的“图片” */
  image?: string;
  /** 有选项的题型（单选、多选、判断、推理、带选项的图片题）才有 */
  options?: string[];
  /** 选择题：正确选项下标；多选：下标数组；填空 / 简答 / 无选项图片题：可接受的答案文本数组 */
  answer: number | number[] | string[];
  explain: string;
  /** 影视音乐题库里区分 film / music */
  tag?: string;
  /** 自定义题库的题目才有：所属玩家 */
  owner?: string;
}

export interface BankInfo {
  id: string;
  name: string;
  icon: string;
  desc: string;
}

export const DIFFICULTY_NAMES: Record<number, string> = { 1: '简单', 2: '普通', 3: '困难' };
export const TYPE_NAMES: Record<QType, string> = {
  single: '单选题',
  multi: '多选题',
  truefalse: '判断题',
  fill: '填空题',
  short: '简答题',
  image: '图片猜题',
  reasoning: '文字推理题',
};
