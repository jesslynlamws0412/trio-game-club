export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface GamePlayer {
  id: string;
  nickname: string;
}

export interface GameCtx {
  players: GamePlayer[];
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
  dispose(): void;
}
