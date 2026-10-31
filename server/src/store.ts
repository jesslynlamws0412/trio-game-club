import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Question } from './bank/types.js';
import { MAX_BANKS_PER_PLAYER, MAX_QUESTIONS_PER_BANK, MIN_QUESTIONS_TO_PLAY, validateQuestion, type Visibility } from './bank/custom.js';
import { BUILTIN, getBuiltin } from './bank/index.js';
import type { AnswerEntry } from './games/types.js';

/**
 * 玩家资料与游戏记录的持久化（一个 JSON 文件，无需数据库）。
 * 身份靠浏览器里保存的 deviceId（不是账号密码）：同一浏览器 = 同一个玩家。
 */
export interface GameStat {
  played: number;
  wins: number;
  points: number;
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
  nickname: string;
  avatar: string;
  totalScore: number;
  played: number;
  wins: number;
  perGame: Record<string, GameStat>;
  /** 题库答题统计（累计） */
  quiz?: QuizStats;
  createdAt: number;
  lastPlayed: number | null;
}
export interface RecordPlayer {
  deviceId: string | null;
  nickname: string;
  avatar: string;
  points: number;
  rank: number;
}
export interface GameRecord {
  id: string;
  at: number;
  roomCode: string;
  game: string;
  players: RecordPlayer[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.DATA_DIR ?? path.resolve(here, '../storage');
const FILE = path.join(DIR, 'store.json');
const MAX_RECORDS = 500;

let profiles: Record<string, Profile> = {};
let records: GameRecord[] = [];
let customBanks: Record<string, CustomBank> = {};
let favorites: Record<string, string[]> = {};
let timer: NodeJS.Timeout | null = null;

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    profiles = raw.profiles ?? {};
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
      deviceId, nickname, avatar, totalScore: 0, played: 0, wins: 0, perGame: {}, createdAt: Date.now(), lastPlayed: null,
    };
  }
  scheduleSave();
}

/** 记录一局游戏：按得分排名（同分并列），第 1 名且得分 > 0 算获胜。 */
export function recordGame(roomCode: string, game: string, players: Omit<RecordPlayer, 'rank'>[]): GameRecord {
  const sorted = [...players].sort((a, b) => b.points - a.points);
  const ranked: RecordPlayer[] = sorted.map((p, i) => {
    const rank = i > 0 && p.points === sorted[i - 1].points ? 0 : i + 1;
    return { ...p, rank };
  });
  // 并列时沿用前一名的名次
  for (let i = 1; i < ranked.length; i++) if (ranked[i].rank === 0) ranked[i].rank = ranked[i - 1].rank;
  const rec: GameRecord = { id: randomUUID().slice(0, 8), at: Date.now(), roomCode, game, players: ranked };
  records.push(rec);
  if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
  for (const r of ranked) {
    const p = r.deviceId ? profiles[r.deviceId] : null;
    if (!p) continue;
    const win = r.rank === 1 && r.points > 0;
    const g = (p.perGame[game] ??= { played: 0, wins: 0, points: 0 });
    p.totalScore += r.points;
    p.played++;
    g.played++;
    g.points += r.points;
    if (win) {
      p.wins++;
      g.wins++;
    }
    p.lastPlayed = rec.at;
  }
  scheduleSave();
  return rec;
}

export function getProfile(deviceId: string) {
  const profile = profiles[deviceId];
  if (!profile) return null;
  const mine = records.filter((r) => r.players.some((p) => p.deviceId === deviceId)).slice(-15).reverse();
  // 发给客户端的记录里不带别人的 deviceId
  const safe = mine.map((r) => ({
    ...r,
    players: r.players.map((p) => ({ nickname: p.nickname, avatar: p.avatar, points: p.points, rank: p.rank, me: p.deviceId === deviceId })),
  }));
  return { profile, records: safe };
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