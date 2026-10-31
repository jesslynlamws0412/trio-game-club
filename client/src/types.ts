export interface GameInfo {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  rules: string[];
  ready: boolean;
  modes: string[];
  bank: boolean;
}

export interface PlayerView {
  id: string;
  nickname: string;
  avatar: string;
  ready: boolean;
  connected: boolean;
  score: number;
  vote: string | null;
}

export interface RoomView {
  code: string;
  you: string;
  hostId: string;
  phase: 'lobby' | 'playing';
  mode: 'solo' | 'duo' | 'trio' | 'party';
  minPlayers: number;
  maxPlayers: number;
  currentGame: string | null;
  gamesPlayed: number;
  history: { game: string; at: number; results: { nickname: string; avatar: string; points: number }[] }[];
  selectedGame: string | null;
  settings: { difficulty: number; customBank: string | null };
  customBankName: string | null;
  bankChoices: { id: string; name: string; count: number; ownerName: string }[];
  game: any;
  gameOver: boolean;
  awards: Record<string, number> | null;
  players: PlayerView[];
  catalog: GameInfo[];
  avatars: string[];
}

export type Ack = { ok: true; code?: string; token?: string } | { ok: false; error: string };
