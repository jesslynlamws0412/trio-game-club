import { randomUUID } from 'node:crypto';
import { GAME_CATALOG, LOCAL_GAMES, MODE_LIMITS, findGame, type ModeId } from './games/catalog.js';
import { createEngine } from './games/index.js';
import type { GameEngine, Result, RoomSettings } from './games/types.js';

export type { Result };

/** 房主点开始后的倒计时（毫秒）。0 = 立即开始（测试用）。单人和本地轮流房间不倒计时 */
const COUNTDOWN_MS = Number(process.env.START_COUNTDOWN_MS ?? 3000);
/** 轮到谁、谁就长时间不动时，多久后自动代替他行动（毫秒） */
const IDLE_MS = Number(process.env.IDLE_TURN_MS ?? 60_000);
const MAX_ROOMS = 300; // 公网部署时防止有人批量建房占满内存
export const RECONNECT_GRACE_MS = 120_000;
export const AVATARS = [
  '🦊', '🐻', '🐱', '🐶', '🦉', '🐼', '🐸', '🦁', '🐰', '🐯', '🦄', '🐧',
  '🐵', '🐨', '🐮', '🐷', '🐔', '🐙', '🦋', '🐢', '🐬', '🦖', '🐲', '🦈',
  '🌸', '🌻', '🍀', '🌈', '⭐', '🔥', '🎩', '🎲', '🎯', '🎸', '🚀', '👑',
];

/** 自定义头像：允许玩家输入一个表情符号（最多 2 个字符簇），只接受表情，不接受文字 */
export function validAvatar(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  if (AVATARS.includes(v)) return true;
  if (v.length < 1 || v.length > 16) return false;
  const parts = [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(v)];
  return parts.length >= 1 && parts.length <= 2 && parts.every((s) => /\p{Extended_Pictographic}/u.test(s.segment));
}

/** 浏览器身份：只用来防止同一个浏览器在同一房间占两个座位，不保存任何东西 */
function validDeviceId(v: unknown): v is string {
  return typeof v === 'string' && /^[\w-]{8,64}$/.test(v);
}

export interface Player {
  id: string;
  token: string; // 重连凭证，只发给本人
  deviceId: string | null; // 浏览器身份，只用于防重复入座；永不发给其他玩家
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
  phase: 'lobby' | 'countdown' | 'playing';
  currentGame: string | null;
  gamesPlayed: number;
  history: { game: string; at: number; results: { nickname: string; avatar: string; points: number }[] }[];
  engine: GameEngine | null;
  /** 房主设置（题库难度） */
  settings: RoomSettings;
  /** 本房间已出过的题库题目，连续玩时尽量不重复 */
  usedQuestions: Set<string>;
  /** 当前这局开始的时间，用来记录游戏时长 */
  gameStartedAt: number;
  /** 本地轮流：两位玩家共用一台设备。加入需要房主设备持有的密钥，外人不能凭房间号加入 */
  local: boolean;
  localKey: string | null;
  countdownTimer: NodeJS.Timeout | null;
  countdownEndsAt: number;
  idleTimer: NodeJS.Timeout | null;
  notify: (() => void) | null;
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
  if (!validAvatar(avatar)) return { ok: false, error: '请选择头像' };
  return { ok: true, nickname: nick, avatar };
}

function newPlayer(nickname: string, avatar: string, deviceId: unknown): Player {
  const dev = validDeviceId(deviceId) ? deviceId : null;
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
  local: unknown = false,
): Result<{ room: Room; player: Player }> {
  const prof = cleanProfile(nickname, avatar);
  if (!prof.ok) return prof;
  if (typeof mode !== 'string' || !(mode in MODE_LIMITS)) return { ok: false, error: '未知的游戏模式' };
  if (local === true && mode !== 'duo') return { ok: false, error: '本地轮流只支持双人模式' };
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
    settings: { difficulty: 0 },
    usedQuestions: new Set(),
    gameStartedAt: 0,
    local: local === true,
    localKey: local === true ? randomUUID().slice(0, 12) : null,
    countdownTimer: null,
    countdownEndsAt: 0,
    idleTimer: null,
    notify: null,
  };
  rooms.set(room.code, room);
  return { ok: true, room, player };
}

export function joinRoom(
  code: unknown,
  nickname: unknown,
  avatar: unknown,
  deviceId?: unknown,
  key?: unknown,
): Result<{ room: Room; player: Player }> {
  const prof = cleanProfile(nickname, avatar);
  if (!prof.ok) return prof;
  const room = typeof code === 'string' ? rooms.get(code.trim()) : undefined;
  if (!room) return { ok: false, error: '房间不存在，请检查房间号' };
  if (room.phase !== 'lobby') return { ok: false, error: '游戏已经开始，无法加入' };
  if (room.local && key !== room.localKey) return { ok: false, error: '这是一个本地轮流房间（两人共用一台设备），不能从其他设备加入' };
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
  if (room.local && !LOCAL_GAMES.has(game.id)) return { ok: false, error: '这个游戏暂时不支持本地轮流' };
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

/** 房主在大厅里设置题库难度（只影响题库类游戏）。 */
export function setSettings(room: Room, player: Player, data: any): Result {
  if (player.id !== room.hostId) return { ok: false, error: '只有房主可以修改设置' };
  if (room.phase !== 'lobby') return { ok: false, error: '游戏进行中不能修改设置' };
  const next: RoomSettings = { ...room.settings };
  if (data?.difficulty !== undefined) {
    if (![0, 1, 2, 3].includes(data.difficulty)) return { ok: false, error: '难度无效' };
    next.difficulty = data.difficulty;
  }
  room.settings = next;
  return { ok: true };
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
  room.notify = notify;
  // 多人联网房间：先倒数几秒，让大家有准备；单人和本地轮流直接开始
  if (COUNTDOWN_MS > 0 && !room.local && room.players.length >= 2) {
    room.phase = 'countdown';
    room.countdownEndsAt = Date.now() + COUNTDOWN_MS;
    room.countdownTimer = setTimeout(() => {
      room.countdownTimer = null;
      if (room.phase === 'countdown') {
        beginGame(room, gameId);
        notify();
      }
    }, COUNTDOWN_MS);
    return { ok: true };
  }
  beginGame(room, gameId);
  return { ok: true };
}

function beginGame(room: Room, gameId: string) {
  room.engine = createEngine(gameId, {
    players: room.players.map((p) => ({ id: p.id, nickname: p.nickname })),
    rotation: room.gamesPlayed,
    notify: () => room.notify?.(),
    settings: room.settings,
    used: room.usedQuestions,
  });
  room.phase = 'playing';
  room.currentGame = gameId;
  room.gameStartedAt = Date.now();
  armIdle(room);
}

/** 房主在倒计时期间取消开始，回到大厅。 */
export function cancelStart(room: Room, player: Player): Result {
  if (player.id !== room.hostId) return { ok: false, error: '只有房主可以取消' };
  if (room.phase !== 'countdown') return { ok: false, error: '现在没有在倒计时' };
  clearCountdown(room);
  room.phase = 'lobby';
  for (const p of room.players) p.ready = false;
  return { ok: true };
}

function clearCountdown(room: Room) {
  if (room.countdownTimer) clearTimeout(room.countdownTimer);
  room.countdownTimer = null;
}

// ───── 超时自动行动：回合制游戏里有人一直不动时，由服务器代替他做一个保守的选择 ─────
function clearIdle(room: Room) {
  if (room.idleTimer) clearTimeout(room.idleTimer);
  room.idleTimer = null;
}

function armIdle(room: Room) {
  clearIdle(room);
  if (!room.engine?.onIdle || room.phase !== 'playing') return;
  room.idleTimer = setTimeout(() => {
    room.idleTimer = null;
    if (room.phase !== 'playing' || !room.engine || room.engine.isOver()) return;
    room.engine.onIdle?.();
    room.notify?.();
    armIdle(room);
  }, IDLE_MS);
}

/** 有玩家成功操作后调用：重新开始计时 */
export function touchIdle(room: Room) {
  if (room.phase === 'playing') armIdle(room);
}

/** 房主关闭房间：所有人回到首页，房间和进行中的游戏都消失。返回被关闭房间里的玩家，由调用方通知他们。 */
export function closeRoom(room: Room, player: Player): Result<{ players: Player[] }> {
  if (player.id !== room.hostId) return { ok: false, error: '只有房主可以关闭房间' };
  clearCountdown(room);
  clearIdle(room);
  room.engine?.dispose();
  room.engine = null;
  for (const p of room.players) if (p.graceTimer) clearTimeout(p.graceTimer);
  rooms.delete(room.code);
  return { ok: true, players: room.players };
}
/** 一局正常结束：积分计入本房间的积分榜和本房间战绩（只保存在内存里，房间关闭就没有了）。 */
function settle(room: Room) {
  if (!room.engine || !room.currentGame) return;
  const scores = room.engine.scores();
  for (const p of room.players) p.score += scores[p.id] ?? 0;
  const results = room.players.map((p) => ({ nickname: p.nickname, avatar: p.avatar, points: scores[p.id] ?? 0 }));
  room.history.push({ game: room.currentGame, at: Date.now(), results });
  room.gamesPlayed += 1;
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
  clearIdle(room);
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
  if (room.phase === 'countdown') {
    clearCountdown(room);
    room.phase = 'lobby';
  }
  if (room.phase === 'playing') {
    // 有人离开，本局作废，回到大厅（不计分）
    clearIdle(room);
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
    countdownMs: room.phase === 'countdown' ? Math.max(0, room.countdownEndsAt - Date.now()) : 0,
    idleSec: room.engine?.onIdle ? Math.round(IDLE_MS / 1000) : 0,
    mode: room.mode,
    minPlayers: MODE_LIMITS[room.mode].min,
    maxPlayers: MODE_LIMITS[room.mode].max,
    currentGame: room.currentGame,
    gamesPlayed: room.gamesPlayed,
    history: room.history.slice(-8).reverse(),
    selectedGame: resolveGame(room),
    settings: room.settings,
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
    local: room.local,
    catalog: GAME_CATALOG.filter((g) => g.modes.includes(room.mode) && (!room.local || g.local)),
    avatars: AVATARS,
  };
}
