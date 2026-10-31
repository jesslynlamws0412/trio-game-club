import { randomUUID } from 'node:crypto';
import { GAME_CATALOG, MODE_LIMITS, findGame, type ModeId } from './games/catalog.js';
import { createEngine } from './games/index.js';
import type { GameEngine, Result } from './games/types.js';
import { recordGame, touchProfile, validDeviceId } from './store.js';

export type { Result };

const MAX_ROOMS = 300; // 公网部署时防止有人批量建房占满内存
export const RECONNECT_GRACE_MS = 120_000;
export const AVATARS = ['🦊', '🐻', '🐱', '🐶', '🦉', '🐼', '🐸', '🦁', '🐰', '🐯', '🦄', '🐧'];

export interface Player {
  id: string;
  token: string; // 重连凭证，只发给本人
  deviceId: string | null; // 浏览器身份，用于累计战绩；永不发给其他玩家
  nickname: string;
  avatar: string;
  ready: boolean;
  connected: boolean;
  socketId: string | null;
  score: number;
  vote: string | null; // 投票选择的游戏 id
  graceTimer: NodeJS.Timeout | null;
}

export interface Room {
  code: string;
  mode: ModeId;
  hostId: string;
  players: Player[];
  phase: 'lobby' | 'playing';
  currentGame: string | null;
  gamesPlayed: number;
  history: { game: string; at: number; results: { nickname: string; avatar: string; points: number }[] }[];
  engine: GameEngine | null;
}

const rooms = new Map<string, Room>();

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

function genCode(): string {
  let code: string;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function cleanProfile(nickname: unknown, avatar: unknown): Result<{ nickname: string; avatar: string }> {
  const nick = typeof nickname === 'string' ? nickname.trim() : '';
  if (nick.length < 1 || nick.length > 8) return { ok: false, error: '昵称需要 1~8 个字' };
  if (typeof avatar !== 'string' || !AVATARS.includes(avatar)) return { ok: false, error: '请选择头像' };
  return { ok: true, nickname: nick, avatar };
}

function newPlayer(nickname: string, avatar: string, deviceId: unknown): Player {
  const dev = validDeviceId(deviceId) ? deviceId : null;
  touchProfile(dev, nickname, avatar);
  return {
    id: randomUUID(),
    token: randomUUID(),
    deviceId: dev,
    nickname,
    avatar,
    ready: false,
    connected: true,
    socketId: null,
    score: 0,
    vote: null,
    graceTimer: null,
  };
}

export function createRoom(
  nickname: unknown,
  avatar: unknown,
  deviceId?: unknown,
  mode: unknown = 'trio', // 不传模式时沿用原来的三人房间
): Result<{ room: Room; player: Player }> {
  const prof = cleanProfile(nickname, avatar);
  if (!prof.ok) return prof;
  if (typeof mode !== 'string' || !(mode in MODE_LIMITS)) return { ok: false, error: '未知的游戏模式' };
  if (rooms.size >= MAX_ROOMS) return { ok: false, error: '服务器上的房间太多了，请稍后再试' };
  const player = newPlayer(prof.nickname, prof.avatar, deviceId);
  const room: Room = {
    code: genCode(),
    mode: mode as ModeId,
    hostId: player.id,
    players: [player],
    phase: 'lobby',
    currentGame: null,
    gamesPlayed: 0,
    history: [],
    engine: null,
  };
  rooms.set(room.code, room);
  return { ok: true, room, player };
}

export function joinRoom(
  code: unknown,
  nickname: unknown,
  avatar: unknown,
  deviceId?: unknown,
): Result<{ room: Room; player: Player }> {
  const prof = cleanProfile(nickname, avatar);
  if (!prof.ok) return prof;
  const room = typeof code === 'string' ? rooms.get(code.trim()) : undefined;
  if (!room) return { ok: false, error: '房间不存在，请检查房间号' };
  if (room.phase !== 'lobby') return { ok: false, error: '游戏已经开始，无法加入' };
  const lim = MODE_LIMITS[room.mode];
  if (room.players.length >= lim.max) return { ok: false, error: `房间已满（${lim.label}房间最多 ${lim.max} 人）` };
  if (room.players.some((p) => p.nickname === prof.nickname)) return { ok: false, error: '该昵称已被使用' };
  if (validDeviceId(deviceId) && room.players.some((p) => p.deviceId === deviceId)) {
    return { ok: false, error: '你已经在这个房间里了（可能在另一个标签页），请直接刷新页面回到房间' };
  }
  const player = newPlayer(prof.nickname, prof.avatar, deviceId);
  room.players.push(player);
  resetReady(room);
  return { ok: true, room, player };
}

export function resumeRoom(code: unknown, token: unknown): Result<{ room: Room; player: Player }> {
  const room = typeof code === 'string' ? rooms.get(code) : undefined;
  const player = room?.players.find((p) => p.token === token);
  if (!room || !player) return { ok: false, error: '房间已失效，请重新进入' };
  if (player.graceTimer) {
    clearTimeout(player.graceTimer);
    player.graceTimer = null;
  }
  player.connected = true;
  return { ok: true, room, player };
}

function resetReady(room: Room) {
  for (const p of room.players) p.ready = false;
}

export function updateProfile(room: Room, player: Player, nickname: unknown, avatar: unknown): Result {
  const prof = cleanProfile(nickname, avatar);
  if (!prof.ok) return prof;
  if (room.phase !== 'lobby') return { ok: false, error: '游戏进行中不能修改资料' };
  if (room.players.some((p) => p.id !== player.id && p.nickname === prof.nickname)) {
    return { ok: false, error: '该昵称已被使用' };
  }
  player.nickname = prof.nickname;
  player.avatar = prof.avatar;
  touchProfile(player.deviceId, player.nickname, player.avatar);
  return { ok: true };
}

export function setReady(room: Room, player: Player, ready: unknown): Result {
  if (room.phase !== 'lobby') return { ok: false, error: '游戏进行中' };
  player.ready = ready === true;
  return { ok: true };
}

export function voteGame(room: Room, player: Player, gameId: unknown): Result {
  if (room.phase !== 'lobby') return { ok: false, error: '游戏进行中' };
  const game = typeof gameId === 'string' ? findGame(gameId) : undefined;
  if (!game) return { ok: false, error: '没有这个游戏' };
  if (!game.modes.includes(room.mode)) return { ok: false, error: `这个游戏不支持${MODE_LIMITS[room.mode].label}模式` };
  player.vote = game.id;
  return { ok: true };
}

/** 三人投票（房主的选择也是一票）：票数最多者当选，平票时以房主的选择为准。 */
export function resolveGame(room: Room): string | null {
  const host = room.players.find((p) => p.id === room.hostId);
  const tally = new Map<string, number>();
  for (const p of room.players) if (p.vote) tally.set(p.vote, (tally.get(p.vote) ?? 0) + 1);
  if (tally.size === 0) return null;
  const max = Math.max(...tally.values());
  const top = [...tally.entries()].filter(([, n]) => n === max).map(([id]) => id);
  if (top.length === 1) return top[0];
  return host?.vote && top.includes(host.vote) ? host.vote : top[0];
}

export function startGame(room: Room, player: Player, notify: () => void): Result {
  if (player.id !== room.hostId) return { ok: false, error: '只有房主可以开始游戏' };
  if (room.phase !== 'lobby') return { ok: false, error: '游戏已经开始' };
  const lim = MODE_LIMITS[room.mode];
  if (room.players.length < lim.min) {
    return { ok: false, error: lim.min === lim.max ? `需要 ${lim.min} 名玩家才能开始` : `至少需要 ${lim.min} 名玩家才能开始` };
  }
  if (room.players.some((p) => !p.connected)) return { ok: false, error: '有玩家处于掉线状态' };
  if (room.players.some((p) => !p.ready)) return { ok: false, error: '还有玩家没有准备' };
  const gameId = resolveGame(room);
  if (!gameId) return { ok: false, error: '请先选择一个游戏' };
  room.engine = createEngine(gameId, {
    players: room.players.map((p) => ({ id: p.id, nickname: p.nickname })),
    rotation: room.gamesPlayed,
    notify,
  });
  room.phase = 'playing';
  room.currentGame = gameId;
  return { ok: true };
}

/** 一局正常结束：积分计入房间排行榜、房间战绩，并写入玩家的长期战绩。 */
function settle(room: Room) {
  if (!room.engine || !room.currentGame) return;
  const scores = room.engine.scores();
  for (const p of room.players) p.score += scores[p.id] ?? 0;
  const results = room.players.map((p) => ({ nickname: p.nickname, avatar: p.avatar, points: scores[p.id] ?? 0 }));
  room.history.push({ game: room.currentGame, at: Date.now(), results });
  room.gamesPlayed += 1;
  recordGame(
    room.code,
    room.currentGame,
    room.players.map((p) => ({ deviceId: p.deviceId, nickname: p.nickname, avatar: p.avatar, points: scores[p.id] ?? 0 })),
  );
}

/**
 * 返回大厅。游戏已正常结束时任何玩家都可以结算返回（积分计入排行榜）；
 * 游戏进行中只有房主可以中止，且不计分。
 */
export function endGame(room: Room, player: Player): Result {
  if (room.phase !== 'playing') return { ok: false, error: '当前没有进行中的游戏' };
  const finished = room.engine?.isOver() ?? false;
  if (!finished && player.id !== room.hostId) return { ok: false, error: '只有房主可以中止游戏' };
  if (finished) settle(room);
  room.engine?.dispose();
  room.engine = null;
  room.phase = 'lobby';
  room.currentGame = null;
  for (const p of room.players) {
    p.ready = false;
    p.vote = null;
  }
  return { ok: true };
}

function deleteRoomIfEmpty(room: Room) {
  if (room.players.length === 0) rooms.delete(room.code);
}

/** 房主移出玩家（只能在大厅阶段）。 */
export function kickPlayer(room: Room, host: Player, targetId: unknown): Result<{ kicked: Player }> {
  if (host.id !== room.hostId) return { ok: false, error: '只有房主可以移出玩家' };
  if (room.phase !== 'lobby') return { ok: false, error: '游戏进行中不能移出玩家' };
  const target = room.players.find((p) => p.id === targetId);
  if (!target) return { ok: false, error: '玩家不存在' };
  if (target.id === host.id) return { ok: false, error: '不能移出自己' };
  removePlayer(room, target);
  return { ok: true, kicked: target };
}

/** 玩家永久离开（主动退出或掉线超时）。 */
export function removePlayer(room: Room, player: Player) {
  if (player.graceTimer) clearTimeout(player.graceTimer);
  // 游戏其实已经打完、还没点“结算”就有人离开：先把这一局算进战绩
  if (room.phase === 'playing' && room.engine?.isOver()) settle(room);
  room.players = room.players.filter((p) => p.id !== player.id);
  if (room.hostId === player.id && room.players.length > 0) {
    const next = room.players.find((p) => p.connected) ?? room.players[0];
    room.hostId = next.id;
  }
  if (room.phase === 'playing') {
    // 有人离开，本局作废，回到大厅（不计分）
    room.engine?.dispose();
    room.engine = null;
    room.phase = 'lobby';
    room.currentGame = null;
  }
  resetReady(room);
  for (const p of room.players) p.vote = null;
  deleteRoomIfEmpty(room);
}

/** 发给某位玩家的房间视图（不含他人的 token、socketId 等私密信息）。 */
export function viewFor(room: Room, viewer: Player) {
  return {
    code: room.code,
    you: viewer.id,
    hostId: room.hostId,
    phase: room.phase,
    mode: room.mode,
    minPlayers: MODE_LIMITS[room.mode].min,
    maxPlayers: MODE_LIMITS[room.mode].max,
    currentGame: room.currentGame,
    gamesPlayed: room.gamesPlayed,
    history: room.history.slice(-8).reverse(),
    selectedGame: resolveGame(room),
    game: room.engine ? room.engine.viewFor(viewer.id) : null,
    gameOver: room.engine?.isOver() ?? false,
    awards: room.engine?.isOver() ? room.engine.scores() : null,
    players: room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      ready: p.ready,
      connected: p.connected,
      score: p.score,
      vote: p.vote,
    })),
    catalog: GAME_CATALOG.filter((g) => g.modes.includes(room.mode)),
    avatars: AVATARS,
  };
}
