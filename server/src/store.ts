import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

/**
 * 玩家资料与游戏记录的持久化（一个 JSON 文件，无需数据库）。
 * 身份靠浏览器里保存的 deviceId（不是账号密码）：同一浏览器 = 同一个玩家。
 */
export interface GameStat {
  played: number;
  wins: number;
  points: number;
}
export interface Profile {
  deviceId: string;
  nickname: string;
  avatar: string;
  totalScore: number;
  played: number;
  wins: number;
  perGame: Record<string, GameStat>;
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
let timer: NodeJS.Timeout | null = null;

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    profiles = raw.profiles ?? {};
    records = raw.records ?? [];
  } catch {
    profiles = {};
    records = [];
  }
}
load();

function writeNow() {
  timer = null;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ profiles, records }), 'utf8');
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
