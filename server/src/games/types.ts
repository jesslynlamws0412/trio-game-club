export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface GamePlayer {
  id: string;
  nickname: string;
}

import type { Question } from '../bank/types.js';

/** 房主可以调整的房间设置（只影响题库类游戏） */
export interface RoomSettings {
  /** 0 = 不限难度，1 简单，2 普通，3 困难 */
  difficulty: number;
}

export interface GameCtx {
  players: GamePlayer[];
  settings?: RoomSettings;
  /** 本房间已经出过的题目 id（跨局避免重复出题），题库类游戏会往里面追加 */
  used?: Set<string>;
  /** 已玩局数，用于轮换卧底 / 主持人 */
  rotation: number;
  /** 房间里有玩家使用英文：题库类游戏只抽有英文版的题 */
  english?: boolean;
  /** 计时器触发状态变化后，通知房间向所有玩家重新推送视图 */
  notify: () => void;
}

/** 所有游戏都实现这个接口；服务器只通过它与游戏交互。 */
export interface GameEngine {
  /** 玩家操作：服务器在这里做全部验证 */
  handleAction(playerId: string, action: any): Result<{ delta?: unknown }>;
  /** 只包含该玩家有权看到的信息 */
  viewFor(playerId: string, lang?: 'zh' | 'en'): unknown;
  isOver(): boolean;
  /** 本局获得的积分（结束后才有意义） */
  scores(): Record<string, number>;
  /** 轮到的玩家长时间不动时，服务器调用它，由引擎代替他做一个保守的选择（可选） */
  onIdle?(): void;
  dispose(): void;
}
