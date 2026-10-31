import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { PLATFORM } from './games/platform.js';
import { flushStore, getProfile, topPlayers, validDeviceId } from './store.js';
import {
  RECONNECT_GRACE_MS,
  createRoom,
  endGame,
  getRoom,
  joinRoom,
  kickPlayer,
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
