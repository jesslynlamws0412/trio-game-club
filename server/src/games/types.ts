export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface GamePlayer {
  id: string;
  nickname: string;
}

import type { Question } from '../bank/types.js';

/** 房主可以调整的房间设置（目前只影响题库类游戏） */
export interface RoomSettings {
  /** 0 = 不限难度，1 简单，2 普通，3 困难 */
  difficulty: number;
  /** 使用的自定义题库 id；null = 使用内置题库 */
  customBank: string | null;
}

export interface AnswerEntry {
  playerId: string;
  bank: string;
  correct: boolean;
}

export interface GameCtx {
  players: GamePlayer[];
  settings?: RoomSettings;
  /** 本房间已经出过的题目 id（跨局避免重复出题），题库类游戏会往里面追加 */
  used?: Set<string>;
  /** 房主选择的自定义题库的题目 */
  customQuestions?: Question[] | null;
  /** 自定义题库的名字，用来在题目上方显示 */
  customName?: string | null;
  /** 已玩局数，用于轮换卧底 / 主持人 */
  rotation: number;
  /** 计时器触发状态变化后，通知房间向所有玩家重新推送视图 */
  notify: () => void;
}

/** 所有游戏都实现这个接口；服务器只通过它与游戏交互。 */
export interface GameEngine {
  /** 玩家操作：服务器在这里做全部验证 */
  handleAction(playerId: string, action: any): Result<{ delta?: unknown }>;
  /** 只包含该玩家有权看到的信息 */
  viewFor(playerId: string): unknown;
  isOver(): boolean;
  /** 本局获得的积分（结束后才有意义） */
  scores(): Record<string, number>;
  /** 游戏内的原始得分（用于最高得分记录）；没有实现的游戏用名次积分代替 */
  rawScores?(): Record<string, number>;
  /** 题库类游戏：本局每位玩家的答题情况，用于累计答题统计 */
  answerLog?(): AnswerEntry[];
  dispose(): void;
}
