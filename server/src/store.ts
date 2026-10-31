import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Question } from './bank/types.js';
import { MAX_BANKS_PER_PLAYER, MAX_QUESTIONS_PER_BANK, MIN_QUESTIONS_TO_PLAY, validateQuestion, type Visibility } from './bank/custom.js';
import { BUILTIN, getBuiltin } from './bank/index.js';
import type { AnswerEntry } from './games/types.js';
import { ACHIEVEMENT_BY_ID, achievementView, unlockNew, type AchievementDef } from './achievements.js';
import { PLATFORM_GAMES } from './games/platform.js';

/**
 * 玩家资料与游戏记录的持久化（一个 JSON 文件，无需数据库）。
 * 身份靠浏览器里保存的 deviceId（不是账号密码）：同一浏览器 = 同一个玩家。
 */
export interface GameStat {
  played: number;
  wins: number;
  points: number;
  /** 单局最高得分（游戏内原始得分） */
  best?: number;
}
export interface QuizStats {
  answered: number;
  correct: number;
  streak: number; // 当前连续答对
  bestStreak: number;
  byBank: Record<string, { answered: number; correct: number }>;
}
export interface CustomBank {
  id: string;
  owner: string; // deviceId
  ownerName: string;
  name: string;
  visibility: Visibility;
  questions: Question[];
  createdAt: number;
  updatedAt: number;
}
export interface Profile {
  deviceId: string;
  /** 公开的玩家 ID（6 位），用来加好友；和 deviceId 不同，deviceId 永远不外传 */
  code: string;
  nickname: string;
  avatar: string;
  totalScore: number;
  played: number;
  wins: number;
  perGame: Record<string, GameStat>;
  /** 题库答题统计（累计） */
  quiz?: QuizStats;
  friends?: string[]; // 好友的 deviceId
  achievements?: Record<string, number>; // 成就 id -> 解锁时间
  perMode?: Record<string, { played: number; wins: number }>;
  /** 有胜负可言的局数（单人练习不算） */
  contested?: number;
  winStreak?: number;
  bestWinStreak?: number;
  bestScore?: number;
  createdAt: number;
  lastPlayed: number | null;
}
export interface RecordPlayer {
  deviceId: string | null;
  nickname: string;
  avatar: string;
  points: number; // 名次奖励积分
  rank: number;
  raw?: number; // 游戏内原始得分
}
export interface GameRecord {
  id: string;
  at: number;
  roomCode: string;
  game: string;
  mode?: string;
  duration?: number; // 毫秒
  players: RecordPlayer[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.DATA_DIR ?? path.resolve(here, '../storage');
const FILE = path.join(DIR, 'store.json');
const MAX_RECORDS = 5000;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉容易看错的 0 O 1 I
let profiles: Record<string, Profile> = {};
let records: GameRecord[] = [];
let customBanks: Record<string, CustomBank> = {};
let favorites: Record<string, string[]> = {};
let timer: NodeJS.Timeout | null = null;

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    profiles = raw.profiles ?? {};
    for (const p of Object.values(profiles) as Profile[]) if (!p.code) p.code = newCode();
    records = raw.records ?? [];
    customBanks = raw.customBanks ?? {};
    favorites = raw.favorites ?? {};
  } catch {
    profiles = {};
    records = [];
    customBanks = {};
    favorites = {};
  }
}
load();

function newCode(): string {
  const used = new Set(Object.values(profiles).map((p) => p.code));
  let c: string;
  do {
    c = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (used.has(c));
  return c;
}

function writeNow() {
  timer = null;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ profiles, records, customBanks, favorites }), 'utf8');
    fs.renameSync(tmp, FILE); // 先写临时文件再改名，避免写到一半断电损坏
  } catch (e) {
    console.error('保存玩家数据失败：', e);
  }
}
function scheduleSave() {
  if (!timer) timer = setTimeout(writeNow, 400);
}
/** 服务器退出前调用，确保最后的数据落盘 */
export function flushStore() {
  if (timer) {
    clearTimeout(timer);
    writeNow();
  }
}

export function validDeviceId(v: unknown): v is string {
  return typeof v === 'string' && /^[\w-]{8,64}$/.test(v);
}

export function touchProfile(deviceId: string | null, nickname: string, avatar: string) {
  if (!deviceId) return;
  const p = profiles[deviceId];
  if (p) {
    p.nickname = nickname;
    p.avatar = avatar;
  } else {
    profiles[deviceId] = {
      deviceId, code: newCode(), nickname, avatar, totalScore: 0, played: 0, wins: 0, perGame: {}, createdAt: Date.now(), lastPlayed: null,
    };
  }
  scheduleSave();
}

/** 记录一局游戏：按得分排名（同分并列），第 1 名且得分 > 0 算获胜。 */
let achievementListener: ((deviceId: string, fresh: AchievementDef[]) => void) | null = null;
/** 玩家解锁新成就时通知（由 index.ts 注册，用来给在线玩家弹提示） */
export function setAchievementListener(fn: (deviceId: string, fresh: AchievementDef[]) => void) {
  achievementListener = fn;
}

/**
 * 单人模式一般没有“输赢”，只有这些游戏的单人局有明确的胜负：
 * 剪刀石头布（对电脑）和猜数字（猜中算赢）。
 */
const SOLO_HAS_RESULT = new Set(['rps', 'number']);

export function recordGame(
  roomCode: string,
  game: string,
  mode: string,
  duration: number,
  players: Omit<RecordPlayer, 'rank'>[],
): GameRecord {
  const sorted = [...players].sort((a, b) => b.points - a.points);
  const ranked: RecordPlayer[] = sorted.map((p, i) => {
    const rank = i > 0 && p.points === sorted[i - 1].points ? 0 : i + 1;
    return { ...p, rank };
  });
  // 并列时沿用前一名的名次
  for (let i = 1; i < ranked.length; i++) if (ranked[i].rank === 0) ranked[i].rank = ranked[i - 1].rank;
  const rec: GameRecord = { id: randomUUID().slice(0, 8), at: Date.now(), roomCode, game, mode, duration, players: ranked };
  records.push(rec);
  if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
  for (const r of ranked) {
    const p = r.deviceId ? profiles[r.deviceId] : null;
    if (!p) continue;
    const solo = mode === 'solo';
    // 有胜负的局：多人按名次；单人只有部分游戏有明确输赢（拿满 3 分才算赢）
    const hasResult = !solo || SOLO_HAS_RESULT.has(game);
    const win = hasResult && (solo ? r.points >= 3 : r.rank === 1 && r.points > 0);
    const g = (p.perGame[game] ??= { played: 0, wins: 0, points: 0 });
    const m = ((p.perMode ??= {})[mode] ??= { played: 0, wins: 0 });
    p.totalScore += r.points;
    p.played++;
    g.played++;
    m.played++;
    g.points += r.points;
    if (hasResult) {
      p.contested = (p.contested ?? 0) + 1;
      if (win) {
        p.wins++;
        g.wins++;
        m.wins++;
        p.winStreak = (p.winStreak ?? 0) + 1;
        p.bestWinStreak = Math.max(p.bestWinStreak ?? 0, p.winStreak);
      } else {
        p.winStreak = 0;
      }
    }
    if (typeof r.raw === 'number') {
      g.best = Math.max(g.best ?? r.raw, r.raw);
      p.bestScore = Math.max(p.bestScore ?? r.raw, r.raw);
    }
    p.lastPlayed = rec.at;
    const fresh = unlockNew(p, rec.at);
    if (fresh.length && achievementListener) achievementListener(p.deviceId, fresh);
  }
  scheduleSave();
  return rec;
}

/** 发给客户端的记录：不带任何人的 deviceId */
function safeRecord(r: GameRecord, deviceId: string) {
  return {
    id: r.id,
    at: r.at,
    roomCode: r.roomCode,
    game: r.game,
    mode: r.mode ?? 'trio',
    duration: r.duration ?? null,
    players: r.players.map((p) => ({ nickname: p.nickname, avatar: p.avatar, points: p.points, rank: p.rank, raw: p.raw ?? null, me: p.deviceId === deviceId })),
  };
}

export function getProfile(deviceId: string) {
  const profile = profiles[deviceId];
  if (!profile) return null;
  const mine = records.filter((r) => r.players.some((p) => p.deviceId === deviceId)).slice(-15).reverse();
  // 好友列表里是别人的 deviceId，不外传
  return { profile: { ...profile, friends: undefined }, records: mine.map((r) => safeRecord(r, deviceId)) };
}

/** 个人中心：资料、统计、成就 */
export function getMe(deviceId: string) {
  const p = profiles[deviceId];
  if (!p) return null;
  // 旧版数据（还没有 perMode / contested 统计）把每一局都算作有胜负的局
  const contested = p.contested ?? (p.perMode ? 0 : p.played);
  const fav = Object.entries(p.perGame).sort((a, b) => b[1].played - a[1].played)[0];
  return {
    code: p.code,
    nickname: p.nickname,
    avatar: p.avatar,
    played: p.played,
    wins: p.wins,
    contested,
    losses: Math.max(0, contested - p.wins),
    winRate: contested ? Math.round((p.wins / contested) * 100) : 0,
    totalScore: p.totalScore,
    bestScore: p.bestScore ?? null,
    winStreak: p.winStreak ?? 0,
    bestWinStreak: p.bestWinStreak ?? 0,
    favoriteGame: fav ? { id: fav[0], played: fav[1].played } : null,
    perMode: p.perMode ?? {},
    perGame: p.perGame,
    quiz: p.quiz ?? null,
    achievements: achievementView(p),
    friendCount: (p.friends ?? []).length,
    createdAt: p.createdAt,
  };
}

/** 我的游戏记录（最近 limit 条） */
export function myRecords(deviceId: string, limit = 50) {
  return records
    .filter((r) => r.players.some((p) => p.deviceId === deviceId))
    .slice(-limit)
    .reverse()
    .map((r) => safeRecord(r, deviceId));
}

/** 用公开的玩家 ID 找 deviceId（仅服务器内部使用） */
export function deviceByCode(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  const c = code.trim().toUpperCase();
  return Object.values(profiles).find((p) => p.code === c)?.deviceId ?? null;
}

const publicPlayer = (p: Profile) => ({ code: p.code, nickname: p.nickname, avatar: p.avatar, played: p.played, wins: p.wins, totalScore: p.totalScore });

export function addFriend(deviceId: string, code: unknown): R<{ friend: ReturnType<typeof publicPlayer> }> {
  const me = profiles[deviceId];
  if (!me) return { ok: false, error: '请先完成一局游戏或创建房间后再加好友' };
  const other = deviceByCode(code);
  if (!other) return { ok: false, error: '找不到这个玩家 ID，请检查是否输入正确' };
  if (other === deviceId) return { ok: false, error: '不能添加自己为好友' };
  const list = (me.friends ??= []);
  if (list.includes(other)) return { ok: false, error: '已经是好友了' };
  if (list.length >= 100) return { ok: false, error: '好友数量已达上限（100 人）' };
  list.push(other);
  scheduleSave();
  return { ok: true, friend: publicPlayer(profiles[other]) };
}

export function removeFriend(deviceId: string, code: unknown): R {
  const me = profiles[deviceId];
  const other = deviceByCode(code);
  if (!me || !other || !me.friends?.includes(other)) return { ok: false, error: '他不在你的好友列表里' };
  me.friends = me.friends.filter((d) => d !== other);
  scheduleSave();
  return { ok: true };
}

export function isFriend(deviceId: string, otherDevice: string): boolean {
  return !!profiles[deviceId]?.friends?.includes(otherDevice);
}

/** 好友列表 + 最近一起玩过的人 */
export function friendsAndRecent(deviceId: string, isOnline: (d: string) => boolean) {
  const me = profiles[deviceId];
  if (!me) return { friends: [], recent: [] };
  const friends = (me.friends ?? []).map((d) => profiles[d]).filter(Boolean).map((p) => ({ ...publicPlayer(p), online: isOnline(p.deviceId) }));
  const seen = new Map<string, { at: number; count: number }>();
  for (const r of records) {
    if (!r.players.some((p) => p.deviceId === deviceId)) continue;
    for (const p of r.players) {
      if (!p.deviceId || p.deviceId === deviceId) continue;
      const cur = seen.get(p.deviceId);
      seen.set(p.deviceId, { at: Math.max(cur?.at ?? 0, r.at), count: (cur?.count ?? 0) + 1 });
    }
  }
  const recent = [...seen.entries()]
    .filter(([d]) => profiles[d])
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, 20)
    .map(([d, v]) => ({ ...publicPlayer(profiles[d]), lastAt: v.at, count: v.count, isFriend: !!me.friends?.includes(d), online: isOnline(d) }));
  return { friends, recent };
}

export type BoardScope = 'all' | 'week' | 'month' | 'friends';
const DAY = 24 * 3600 * 1000;

/**
 * 排行榜。总榜/好友榜按累计积分；周榜、月榜按最近 7 / 30 天的积分；
 * category 可以限定游戏大类（只统计该类游戏的积分）。
 */
export function leaderboard(deviceId: string | null, scope: BoardScope, category: string) {
  const since = scope === 'week' ? Date.now() - 7 * DAY : scope === 'month' ? Date.now() - 30 * DAY : 0;
  const allowed = category === 'all' ? null : new Set(PLATFORM_GAMES.filter((g) => g.category === category).map((g) => g.id));
  const friendSet = scope === 'friends' && deviceId ? new Set([deviceId, ...(profiles[deviceId]?.friends ?? [])]) : null;
  if (scope === 'friends' && !friendSet) return [];
  const agg = new Map<string, { points: number; played: number; wins: number }>();
  for (const r of records) {
    if (r.at < since || (allowed && !allowed.has(r.game))) continue;
    for (const p of r.players) {
      if (!p.deviceId || !profiles[p.deviceId]) continue;
      if (friendSet && !friendSet.has(p.deviceId)) continue;
      const a = agg.get(p.deviceId) ?? { points: 0, played: 0, wins: 0 };
      a.points += p.points;
      a.played++;
      if (p.rank === 1 && p.points > 0) a.wins++;
      agg.set(p.deviceId, a);
    }
  }
  return [...agg.entries()]
    .sort((a, b) => b[1].points - a[1].points || b[1].wins - a[1].wins || b[1].played - a[1].played)
    .slice(0, 20)
    .map(([d, a], i) => ({ rank: i + 1, nickname: profiles[d].nickname, avatar: profiles[d].avatar, code: profiles[d].code, ...a, me: d === deviceId }));
}

/** 某个游戏的“历史最高分”榜（单局原始得分） */
export function bestScores(deviceId: string | null, game: string) {
  return Object.values(profiles)
    .filter((p) => (p.perGame[game]?.best ?? null) !== null)
    .sort((a, b) => b.perGame[game].best! - a.perGame[game].best!)
    .slice(0, 10)
    .map((p, i) => ({ rank: i + 1, nickname: p.nickname, avatar: p.avatar, best: p.perGame[game].best!, me: p.deviceId === deviceId }));
}
export function topPlayers(n = 10) {
  return Object.values(profiles)
    .filter((p) => p.played > 0)
    .sort((a, b) => b.totalScore - a.totalScore || b.wins - a.wins)
    .slice(0, n)
    .map((p) => ({ nickname: p.nickname, avatar: p.avatar, totalScore: p.totalScore, played: p.played, wins: p.wins }));
}

// ───────────────────────── 题库：自定义题库、收藏、答题统计 ─────────────────────────

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const bankSummary = (b: CustomBank) => ({
  id: b.id,
  name: b.name,
  visibility: b.visibility,
  ownerName: b.ownerName,
  count: b.questions.length,
  updatedAt: b.updatedAt,
});

/** 我的题库（含题目与答案）+ 别人公开的题库（只有概要） */
export function listBanksFor(deviceId: string) {
  const all = Object.values(customBanks);
  return {
    mine: all.filter((b) => b.owner === deviceId).map((b) => ({ ...bankSummary(b), questions: b.questions })),
    publicOthers: all.filter((b) => b.owner !== deviceId && b.visibility === 'public' && b.questions.length > 0).map(bankSummary),
  };
}

export function createBank(deviceId: string, name: string, visibility: Visibility): R<{ bank: ReturnType<typeof bankSummary> }> {
  if (Object.values(customBanks).filter((b) => b.owner === deviceId).length >= MAX_BANKS_PER_PLAYER) {
    return { ok: false, error: `每位玩家最多创建 ${MAX_BANKS_PER_PLAYER} 个自定义题库` };
  }
  const now = Date.now();
  const b: CustomBank = {
    id: 'cb-' + randomUUID().slice(0, 8),
    owner: deviceId,
    ownerName: profiles[deviceId]?.nickname ?? '玩家',
    name,
    visibility,
    questions: [],
    createdAt: now,
    updatedAt: now,
  };
  customBanks[b.id] = b;
  scheduleSave();
  return { ok: true, bank: bankSummary(b) };
}

function ownedBank(deviceId: string, bankId: unknown): CustomBank | null {
  const b = typeof bankId === 'string' ? customBanks[bankId] : undefined;
  return b && b.owner === deviceId ? b : null;
}

export function updateBank(deviceId: string, bankId: unknown, patch: { name?: string; visibility?: Visibility }): R {
  const b = ownedBank(deviceId, bankId);
  if (!b) return { ok: false, error: '题库不存在' };
  if (patch.name) b.name = patch.name;
  if (patch.visibility) b.visibility = patch.visibility;
  b.updatedAt = Date.now();
  scheduleSave();
  return { ok: true };
}

export function deleteBank(deviceId: string, bankId: unknown): R {
  const b = ownedBank(deviceId, bankId);
  if (!b) return { ok: false, error: '题库不存在' };
  delete customBanks[b.id];
  scheduleSave();
  return { ok: true };
}

export function saveQuestion(deviceId: string, bankId: unknown, input: any): R<{ id: string }> {
  const b = ownedBank(deviceId, bankId);
  if (!b) return { ok: false, error: '题库不存在' };
  const v = validateQuestion(input);
  if (!v.ok) return v;
  const existing = typeof input.id === 'string' ? b.questions.find((x) => x.id === input.id) : undefined;
  if (existing) {
    Object.assign(existing, v.q);
  } else {
    if (b.questions.length >= MAX_QUESTIONS_PER_BANK) return { ok: false, error: `每个题库最多 ${MAX_QUESTIONS_PER_BANK} 道题` };
    const id = `${b.id}-${randomUUID().slice(0, 6)}`;
    b.questions.push({ ...v.q, id, bank: b.id, owner: deviceId });
    b.updatedAt = Date.now();
    scheduleSave();
    return { ok: true, id };
  }
  b.updatedAt = Date.now();
  scheduleSave();
  return { ok: true, id: existing.id };
}

export function deleteQuestion(deviceId: string, bankId: unknown, qid: unknown): R {
  const b = ownedBank(deviceId, bankId);
  if (!b) return { ok: false, error: '题库不存在' };
  const n = b.questions.length;
  b.questions = b.questions.filter((q) => q.id !== qid);
  if (b.questions.length === n) return { ok: false, error: '题目不存在' };
  for (const list of Object.values(favorites)) {
    const i = list.indexOf(qid as string);
    if (i >= 0) list.splice(i, 1);
  }
  b.updatedAt = Date.now();
  scheduleSave();
  return { ok: true };
}

/** 公开题库可以被所有人浏览（含答案，作为学习用）；私人题库只有主人能看 */
export function browseCustom(deviceId: string, bankId: unknown): R<{ bank: ReturnType<typeof bankSummary>; questions: Question[] }> {
  const b = typeof bankId === 'string' ? customBanks[bankId] : undefined;
  if (!b || (b.owner !== deviceId && b.visibility !== 'public')) return { ok: false, error: '题库不存在或没有权限' };
  return { ok: true, bank: bankSummary(b), questions: b.questions };
}

/**
 * 房主在房间里选择自定义题库时的权限检查：
 * 仅自己使用 = 只能在单人房间用；仅房间使用 = 只能在自己创建（担任房主）的房间用；公开 = 谁都能用。
 */
export function bankForGame(bankId: unknown, hostDeviceId: string | null, mode: string): R<{ name: string; questions: Question[] }> {
  const b = typeof bankId === 'string' ? customBanks[bankId] : undefined;
  if (!b) return { ok: false, error: '这个题库已经不存在了' };
  const isOwner = !!hostDeviceId && b.owner === hostDeviceId;
  if (b.visibility === 'private' && !(isOwner && mode === 'solo')) return { ok: false, error: '这是“仅自己使用”的题库，只能在你的单人房间里使用' };
  if (b.visibility === 'room' && !isOwner) return { ok: false, error: '这是“仅房间使用”的题库，只有创建者作为房主时才能使用' };
  if (b.questions.length < MIN_QUESTIONS_TO_PLAY) return { ok: false, error: `题库至少需要 ${MIN_QUESTIONS_TO_PLAY} 道题才能开始游戏` };
  return { ok: true, name: b.name, questions: b.questions };
}

/** 房主可选的自定义题库列表（权限同 bankForGame，但不检查题数） */
export function bankChoicesFor(hostDeviceId: string | null, mode: string) {
  return Object.values(customBanks)
    .filter((b) => b.questions.length >= MIN_QUESTIONS_TO_PLAY)
    .filter((b) => {
      const isOwner = !!hostDeviceId && b.owner === hostDeviceId;
      return b.visibility === 'public' || (b.visibility === 'room' && isOwner) || (b.visibility === 'private' && isOwner && mode === 'solo');
    })
    .map((b) => ({ id: b.id, name: b.name, count: b.questions.length, ownerName: b.ownerName }));
}

export function bankName(bankId: string | null): string | null {
  return bankId && customBanks[bankId] ? customBanks[bankId].name : null;
}

function findQuestion(deviceId: string, id: string): Question | undefined {
  const b = getBuiltin(id);
  if (b) return b;
  const bankId = id.split('-').slice(0, 2).join('-');
  const cb = customBanks[bankId];
  return cb && (cb.owner === deviceId || cb.visibility === 'public') ? cb.questions.find((q) => q.id === id) : undefined;
}

/** 收藏 / 取消收藏。返回收藏后的状态。 */
export function toggleFavorite(deviceId: string, qid: unknown): R<{ favorited: boolean }> {
  if (typeof qid !== 'string' || !findQuestion(deviceId, qid)) return { ok: false, error: '题目不存在' };
  const list = (favorites[deviceId] ??= []);
  const i = list.indexOf(qid);
  if (i >= 0) list.splice(i, 1);
  else {
    if (list.length >= 500) return { ok: false, error: '收藏已满（最多 500 道）' };
    list.push(qid);
  }
  scheduleSave();
  return { ok: true, favorited: i < 0 };
}

export function favoriteIds(deviceId: string): string[] {
  return favorites[deviceId] ?? [];
}

export function favoriteQuestions(deviceId: string): Question[] {
  return favoriteIds(deviceId).map((id) => findQuestion(deviceId, id)).filter((q): q is Question => !!q);
}

/** 累计答题统计，同时计算连续答对（跨局累计） */
export function recordAnswers(deviceId: string | null, entries: AnswerEntry[]) {
  const p = deviceId ? profiles[deviceId] : null;
  if (!p || entries.length === 0) return;
  const s = (p.quiz ??= { answered: 0, correct: 0, streak: 0, bestStreak: 0, byBank: {} });
  for (const e of entries) {
    const b = (s.byBank[e.bank] ??= { answered: 0, correct: 0 });
    s.answered++;
    b.answered++;
    if (e.correct) {
      s.correct++;
      b.correct++;
      s.streak++;
      if (s.streak > s.bestStreak) s.bestStreak = s.streak;
    } else {
      s.streak = 0;
    }
  }
  scheduleSave();
}

export const BUILTIN_COUNT = BUILTIN.length;