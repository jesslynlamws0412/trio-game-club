import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { PLATFORM } from './games/platform.js';
import { BANKS, BUILTIN, bankStats, hasOptions } from './bank/index.js';
import { cleanBankName, cleanVisibility } from './bank/custom.js';
import { MODE_LIMITS } from './games/catalog.js';
import {
  browseCustom, createBank, deleteBank, deleteQuestion, favoriteIds, favoriteQuestions, flushStore, getProfile,
  listBanksFor, saveQuestion, toggleFavorite, topPlayers, touchProfile, updateBank, validDeviceId,
  addFriend, bestScores, deviceByCode, friendsAndRecent, getMe, isFriend, leaderboard, myRecords, removeFriend, setAchievementListener,
} from './store.js';
import {
  RECONNECT_GRACE_MS,
  createRoom,
  endGame,
  getRoom,
  joinRoom,
  kickPlayer,
  setSettings,
  removePlayer,
  resumeRoom,
  setReady,
  startGame,
  updateProfile,
  viewFor,
  voteGame,
  type Player,
  type Room,
  type Result,
} from './rooms.js';

const PORT = Number(process.env.PORT ?? 3001);
const MAX_EVENTS_PER_SEC = 150; // 画笔约 17 次/秒，正常操作远低于此
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true }, maxHttpBufferSize: 100_000 });

app.get('/healthz', (_req, res) => res.send('ok'));
app.get('/api/platform', (_req, res) => res.json(PLATFORM));

// 生产环境：同时托管前端打包文件
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

function broadcast(room: Room) {
  for (const p of room.players) {
    if (p.socketId) io.to(p.socketId).emit('room:state', viewFor(room, p));
  }
}

type Ack = (res: unknown) => void;

// ───── 在线状态：哪些设备（浏览器）现在连着服务器，用于“好友在线”和邀请 ─────
const online = new Map<string, Set<string>>();
const isOnline = (deviceId: string) => (online.get(deviceId)?.size ?? 0) > 0;
function unmarkOnline(socket: Socket) {
  const d = socket.data.deviceId as string | undefined;
  if (!d) return;
  const set = online.get(d);
  set?.delete(socket.id);
  if (set && set.size === 0) online.delete(d);
  socket.data.deviceId = undefined;
}
function markOnline(socket: Socket, deviceId: string | null) {
  if (!deviceId || socket.data.deviceId === deviceId) return;
  unmarkOnline(socket);
  socket.data.deviceId = deviceId;
  if (!online.has(deviceId)) online.set(deviceId, new Set());
  online.get(deviceId)!.add(socket.id);
}
const emitToDevice = (deviceId: string, event: string, payload: unknown) => {
  for (const sid of online.get(deviceId) ?? []) io.to(sid).emit(event, payload);
};

// 解锁新成就时，立刻提示在线的玩家
setAchievementListener((deviceId, fresh) => {
  emitToDevice(deviceId, 'achievement:unlocked', fresh.map((a) => ({ id: a.id, name: a.name, icon: a.icon, desc: a.desc })));
});
const lastInvite = new Map<string, number>();

function attach(socket: Socket, room: Room, player: Player) {
  player.socketId = socket.id;
  player.connected = true;
  socket.data.code = room.code;
  socket.data.playerId = player.id;
}

function ctx(socket: Socket): { room: Room; player: Player } | null {
  const room = getRoom(socket.data.code);
  const player = room?.players.find((p) => p.id === socket.data.playerId);
  return room && player ? { room, player } : null;
}

function reply(ack: Ack | undefined, res: unknown) {
  if (typeof ack === 'function') ack(res);
}

io.on('connection', (socket) => {
  // 简单限速：一秒内事件过多的连接，多余的事件直接丢弃（防止刷屏拖垮服务器）
  let windowStart = Date.now();
  let count = 0;
  socket.use((_packet, next) => {
    const now = Date.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      count = 0;
    }
    if (++count > MAX_EVENTS_PER_SEC) return; // 丢弃，不调用 next
    next();
  });

  /** 注册事件处理函数；任何异常都只会让这一次请求失败，不会让服务器崩溃。 */
  const on = (event: string, handler: (data: any, ack?: Ack) => void) => {
    socket.on(event, (data: any, ack?: Ack) => {
      try {
        handler(data, ack);
      } catch (e) {
        console.error(`处理 ${event} 时出错：`, e);
        reply(ack, { ok: false, error: '服务器内部错误，请重试' });
      }
    });
  };

  const joined = (res: Result<{ room: Room; player: Player }>, ack?: Ack) => {
    if (!res.ok) return reply(ack, res);
    // 这个连接之前还坐在别的房间里：先让旧座位离开，避免留下“幽灵玩家”
    const prev = ctx(socket);
    if (prev && prev.player.id !== res.player.id) {
      removePlayer(prev.room, prev.player);
      broadcast(prev.room);
    }
    attach(socket, res.room, res.player);
    markOnline(socket, res.player.deviceId);
    reply(ack, { ok: true, code: res.room.code, token: res.player.token });
    broadcast(res.room);
  };

  on('room:create', (data, ack) => joined(createRoom(data?.nickname, data?.avatar, data?.deviceId, data?.mode), ack));
  on('room:join', (data, ack) => joined(joinRoom(data?.code, data?.nickname, data?.avatar, data?.deviceId), ack));
  on('room:resume', (data, ack) => joined(resumeRoom(data?.code, data?.token), ack));
  // 我的战绩 + 全服排行榜（只凭自己的 deviceId 查自己；排行榜不含任何身份凭证）
  on('profile:get', (data, ack) => {
    const mine = validDeviceId(data?.deviceId) ? getProfile(data.deviceId) : null;
    reply(ack, { ok: true, me: mine, top: topPlayers(10) });
  });

  // ───── 题库中心 / 自定义题库（身份同样只凭自己的 deviceId）─────
  const device = (d: any): string | null => {
    if (!validDeviceId(d?.deviceId)) return null;
    // 创建题库时用来显示“作者”的昵称
    markOnline(socket, d.deviceId);
    if (typeof d.nickname === 'string' && d.nickname.trim() && d.nickname.length <= 8) touchProfile(d.deviceId, d.nickname.trim(), typeof d.avatar === 'string' ? d.avatar.slice(0, 8) : '🦊');
    return d.deviceId;
  };
  const needDevice = (d: any, ack?: Ack): string | null => {
    const id = device(d);
    if (!id) reply(ack, { ok: false, error: '无法识别你的浏览器，请刷新页面重试' });
    return id;
  };

  on('bank:list', (d, ack) => {
    const id = device(d);
    reply(ack, { ok: true, banks: bankStats(), favorites: id ? favoriteIds(id) : [], custom: listBanksFor(id ?? '') });
  });
  on('bank:browse', (d, ack) => {
    const id = device(d);
    const bankId = d?.bankId;
    let questions: any[];
    let title: string;
    if (bankId === 'favorites') {
      if (!id) return reply(ack, { ok: false, error: '无法识别你的浏览器，请刷新页面重试' });
      questions = favoriteQuestions(id);
      title = '我的收藏';
    } else if (typeof bankId === 'string' && bankId.startsWith('cb-')) {
      const res = browseCustom(id ?? '', bankId);
      if (!res.ok) return reply(ack, res);
      questions = res.questions;
      title = res.bank.name;
    } else {
      const info = BANKS.find((b) => b.id === bankId);
      if (!info) return reply(ack, { ok: false, error: '题库不存在' });
      questions = BUILTIN.filter((q) => q.bank === bankId);
      title = info.name;
    }
    if ([1, 2, 3].includes(d?.difficulty)) questions = questions.filter((q) => q.difficulty === d.difficulty);
    if (typeof d?.type === 'string' && d.type) questions = questions.filter((q) => q.type === d.type);
    reply(ack, { ok: true, title, questions: questions.slice(0, 300), favorites: id ? favoriteIds(id) : [] });
  });
  on('bank:fav', (d, ack) => {
    const id = needDevice(d, ack);
    if (id) reply(ack, toggleFavorite(id, d?.questionId));
  });
  on('bank:create', (d, ack) => {
    const id = needDevice(d, ack);
    if (!id) return;
    const name = cleanBankName(d?.name);
    const vis = cleanVisibility(d?.visibility);
    if (!name) return reply(ack, { ok: false, error: '题库名称需要 1~20 个字' });
    if (!vis) return reply(ack, { ok: false, error: '请选择公开范围' });
    reply(ack, createBank(id, name, vis));
  });
  on('bank:update', (d, ack) => {
    const id = needDevice(d, ack);
    if (!id) return;
    const patch: { name?: string; visibility?: 'private' | 'room' | 'public' } = {};
    if (d?.name !== undefined) {
      const n = cleanBankName(d.name);
      if (!n) return reply(ack, { ok: false, error: '题库名称需要 1~20 个字' });
      patch.name = n;
    }
    if (d?.visibility !== undefined) {
      const v = cleanVisibility(d.visibility);
      if (!v) return reply(ack, { ok: false, error: '请选择公开范围' });
      patch.visibility = v;
    }
    reply(ack, updateBank(id, d?.bankId, patch));
  });
  on('bank:delete', (d, ack) => {
    const id = needDevice(d, ack);
    if (id) reply(ack, deleteBank(id, d?.bankId));
  });
  on('bank:saveq', (d, ack) => {
    const id = needDevice(d, ack);
    if (id) reply(ack, saveQuestion(id, d?.bankId, d?.question));
  });
  on('bank:delq', (d, ack) => {
    const id = needDevice(d, ack);
    if (id) reply(ack, deleteQuestion(id, d?.bankId, d?.questionId));
  });

  // ───── 个人中心：资料 / 记录 / 好友 / 排行榜 ─────
  on('me:get', (d, ack) => {
    const id = device(d);
    reply(ack, { ok: true, me: id ? getMe(id) : null });
  });
  on('records:get', (d, ack) => {
    const id = device(d);
    reply(ack, { ok: true, records: id ? myRecords(id, Math.min(100, Math.max(1, Number(d?.limit) || 50))) : [] });
  });
  on('friends:list', (d, ack) => {
    const id = needDevice(d, ack);
    if (id) reply(ack, { ok: true, ...friendsAndRecent(id, isOnline) });
  });
  on('friends:add', (d, ack) => {
    const id = needDevice(d, ack);
    if (id) reply(ack, addFriend(id, d?.code));
  });
  on('friends:remove', (d, ack) => {
    const id = needDevice(d, ack);
    if (id) reply(ack, removeFriend(id, d?.code));
  });
  // 邀请好友加入我现在所在的房间（对方在线才会收到）
  on('friends:invite', (d, ack) => {
    const c = ctx(socket);
    if (!c || !c.player.deviceId) return reply(ack, { ok: false, error: '你需要先在一个房间里' });
    if (c.room.phase !== 'lobby') return reply(ack, { ok: false, error: '游戏进行中，不能邀请' });
    if (c.room.players.length >= MODE_LIMITS[c.room.mode].max) return reply(ack, { ok: false, error: '房间已满' });
    const target = deviceByCode(d?.code);
    if (!target || !isFriend(c.player.deviceId, target)) return reply(ack, { ok: false, error: '只能邀请你的好友' });
    if (c.room.players.some((p) => p.deviceId === target)) return reply(ack, { ok: false, error: '他已经在房间里了' });
    if (!isOnline(target)) return reply(ack, { ok: false, error: '好友现在不在线' });
    const key = `${c.player.deviceId}>${target}`;
    if (Date.now() - (lastInvite.get(key) ?? 0) < 20_000) return reply(ack, { ok: false, error: '刚刚已经邀请过了，请稍等一会儿' });
    lastInvite.set(key, Date.now());
    emitToDevice(target, 'invite:received', { nickname: c.player.nickname, avatar: c.player.avatar, code: c.room.code, mode: c.room.mode });
    reply(ack, { ok: true });
  });
  on('leaderboard:get', (d, ack) => {
    const id = device(d);
    if (d?.scope === 'best') {
      return reply(ack, { ok: true, rows: bestScores(id, typeof d?.game === 'string' ? d.game : '') });
    }
    const scope = ['all', 'week', 'month', 'friends'].includes(d?.scope) ? d.scope : 'all';
    const category = typeof d?.category === 'string' && d.category ? d.category : 'all';
    reply(ack, { ok: true, rows: leaderboard(id, scope, category) });
  });

  // 需要已在房间内的操作，统一用 act() 包装：执行 → 成功则广播
  const act = (event: string, fn: (room: Room, player: Player, data: any) => Result) => {
    on(event, (data, ack) => {
      const c = ctx(socket);
      if (!c) return reply(ack, { ok: false, error: '你不在任何房间中' });
      const res = fn(c.room, c.player, data);
      reply(ack, res);
      if (res.ok) broadcast(c.room);
    });
  };

  // 房主移出玩家：被移出的人收到 room:kicked，客户端据此回到首页
  on('room:kick', (data, ack) => {
    const c = ctx(socket);
    if (!c) return reply(ack, { ok: false, error: '你不在任何房间中' });
    const res = kickPlayer(c.room, c.player, data?.playerId);
    reply(ack, res.ok ? { ok: true } : res);
    if (!res.ok) return;
    if (res.kicked.socketId) {
      const s = io.sockets.sockets.get(res.kicked.socketId);
      if (s) {
        s.data.code = undefined;
        s.data.playerId = undefined;
      }
      io.to(res.kicked.socketId).emit('room:kicked');
    }
    broadcast(c.room);
  });
  act('room:settings', (r, p, d) => setSettings(r, p, d));
  act('room:profile', (r, p, d) => updateProfile(r, p, d?.nickname, d?.avatar));
  act('room:ready', (r, p, d) => setReady(r, p, d?.ready));
  act('room:vote', (r, p, d) => voteGame(r, p, d?.gameId));
  act('room:start', (r, p) => startGame(r, p, () => broadcast(r)));
  act('game:end', (r, p) => endGame(r, p));

  // 游戏操作：普通操作会向所有人推送各自的视图；带 delta 的高频操作（画笔）只把增量转发给其他玩家
  on('game:action', (data, ack) => {
    const c = ctx(socket);
    if (!c) return reply(ack, { ok: false, error: '你不在任何房间中' });
    if (c.room.phase !== 'playing' || !c.room.engine) return reply(ack, { ok: false, error: '当前没有进行中的游戏' });
    const res = c.room.engine.handleAction(c.player.id, data);
    reply(ack, res.ok ? { ok: true } : res);
    if (!res.ok) return;
    if (res.delta !== undefined) {
      for (const p of c.room.players) {
        if (p.id !== c.player.id && p.socketId) io.to(p.socketId).emit('game:delta', res.delta);
      }
    } else {
      broadcast(c.room);
    }
  });

  on('room:leave', (_data, ack) => {
    const c = ctx(socket);
    if (c) {
      removePlayer(c.room, c.player);
      socket.data.code = undefined;
      socket.data.playerId = undefined;
      broadcast(c.room);
    }
    reply(ack, { ok: true });
  });

  socket.on('disconnect', () => {
    unmarkOnline(socket);
    const c = ctx(socket);
    if (!c || c.player.socketId !== socket.id) return;
    c.player.connected = false;
    c.player.socketId = null;
    c.player.graceTimer = setTimeout(() => {
      removePlayer(c.room, c.player);
      broadcast(c.room);
    }, RECONNECT_GRACE_MS);
    broadcast(c.room);
  });
});

// 兜底：计时器等异步代码里的意外错误只记录日志，不让整个服务器退出
process.on('uncaughtException', (e) => console.error('未捕获的异常：', e));
process.on('unhandledRejection', (e) => console.error('未处理的 Promise 错误：', e));

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    flushStore();
    process.exit(0);
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`三人游戏俱乐部服务器已启动：http://localhost:${PORT}`);
});
