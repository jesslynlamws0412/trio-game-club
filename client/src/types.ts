export interface GameInfo {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  rules: string[];
  ready: boolean;
  modes: string[];
  bank: boolean;
  /** 有完整的英文版 */
  en: boolean;
  local: boolean;
}

export interface PlayerView {
  id: string;
  nickname: string;
  avatar: string;
  ready: boolean;
  connected: boolean;
  score: number;
  vote: string | null;
  lang: 'zh' | 'en';
}

export interface RoomView {
  code: string;
  you: string;
  hostId: string;
  phase: 'lobby' | 'countdown' | 'playing';
  countdownMs: number;
  /** 回合制游戏：轮到的人多少秒不动会被自动代替；0 = 这款游戏没有这个机制 */
  idleSec: number;
  mode: 'solo' | 'duo' | 'trio' | 'party';
  local: boolean;
  minPlayers: number;
  maxPlayers: number;
  currentGame: string | null;
  gamesPlayed: number;
  history: { game: string; at: number; results: { nickname: string; avatar: string; points: number }[] }[];
  selectedGame: string | null;
  settings: { difficulty: number };
  game: any;
  gameOver: boolean;
  awards: Record<string, number> | null;
  players: PlayerView[];
  catalog: GameInfo[];
  avatars: string[];
}

export type Ack = { ok: true; code?: string; token?: string; localKey?: string } | { ok: false; error: string };
