import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { PLATFORM } from './games/platform.js';
import { audit, hasEnglish, normLang, recordAudit, translateDeep, type Lang } from './i18n.js';
import { DRAW_WORDS } from './data/drawWords.js';
import { BANKS, BUILTIN, bankStats } from './bank/index.js';
import {
  RECONNECT_GRACE_MS,
  createRoom,
  endGame,
  getRoom,
  joinRoom,
  kickPlayer,
  cancelStart,
  closeRoom,
  touchIdle,
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
const AUDIT = process.env.I18N_AUDIT === '1';
/** 审计用：没有英文版的中文题目的所有文字（它们只会出给中文玩家，不算漏翻） */
let zhOnlyText: Set<string> | null = null;
function zhOnlyQuestionText() {
  if (!zhOnlyText) {
    zhOnlyText = new Set();
    for (const q of BUILTIN) {
      if (q.en) continue;
      for (const s of [q.q, q.explain, q.image ?? '', ...(q.options ?? []), ...(Array.isArray(q.answer) ? q.answer.filter((x) => typeof x === 'string') : [])]) zhOnlyText.add(s as string);
    }
    // 没有英文说法的画画词（成语）只会出给中文玩家
    for (const [w, cat] of DRAW_WORDS) if (!hasEnglish(w)) zhOnlyText.add(w).add(cat);
  }
  return zhOnlyText;
}
if (AUDIT) app.get('/api/i18n-audit', (_req, res) => res.json(Object.fromEntries(Object.entries(audit).map(([k, v]) => [k, [...v]]))));
app.get('/api/platform', (req, res) => res.json(translateDeep(PLATFORM, normLang(req.query.lang))));

// 生产环境：同时托管前端打包文件
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

function broadcast(room: Room) {
  for (const p of room.players) {
    if (!p.socketId) continue;
    const view = viewFor(room, p);
    if (AUDIT) {
      // 游戏列表里有所有游戏的规则（还没翻译的不算漏翻），所以单独处理：只检查已有英文版的游戏。
      // 游戏画面按“英文玩家会看到的样子”检查（题库题目会换成英文版）。
      const { catalog, ...rest } = viewFor(room, { ...p, lang: 'en' });
      const names = room.players.map((x) => x.nickname);
      recordAudit(room.currentGame ?? 'lobby', rest, names, zhOnlyQuestionText());
      for (const g of catalog) if (g.en) recordAudit(g.id, g, names);
    }
    io.to(p.socketId).emit('room:state', translateDeep(view, p.lang));
  }
}

type Ack = (res: unknown) => void;

function attach(socket: Socket, room: Room, player: Player) {
  player.socketId = socket.id;
  player.connected = true;
  player.lang = (socket.data.lang as Lang | undefined) ?? 'zh';
  socket.data.code = room.code;
  socket.data.playerId = player.id;
}

function ctx(socket: Socket): { room: Room; player: Player } | null {
  const room = getRoom(socket.data.code);
  const player = room?.players.find((p) => p.id === socket.data.playerId);
  return room && player ? { room, player } : null;
}

function replyWith(ack: Ack | undefined, res: unknown, lang: Lang, game = 'errors') {
  if (AUDIT && game !== 'errors' && (res as { ok?: boolean })?.ok === false) recordAudit(game, res);
  // 错误提示按这位玩家的语言翻译；成功的回复里没有需要翻译的文字
  if (typeof ack === 'function') ack(lang === 'en' && (res as { ok?: boolean })?.ok === false ? translateDeep(res, lang) : res);
}

/** 这个连接最近几次往返延迟的中位数（毫秒）；还没测到返回 0 */
function medianRtt(socket: Socket): number {
  const a: number[] = [...((socket.data.rtts as number[] | undefined) ?? [])].sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : 0;
}

io.on('connection', (socket) => {
  // 每 1.5 秒测一次往返延迟（客户端收到 latency:ping 立刻回执）。保龄球和投篮机用它补偿网络延迟，让判定和玩家看到的画面一致
  socket.data.rtts = [] as number[];
  const ping = () => {
    const t0 = Date.now();
    socket.timeout(2000).emit('latency:ping', (err: unknown) => {
      if (err) return;
      const a = socket.data.rtts as number[];
      a.push(Date.now() - t0);
      if (a.length > 7) a.shift();
    });
  };
  ping();
  const pinger = setInterval(ping, 1500);
  socket.on('disconnect', () => clearInterval(pinger));
  socket.data.lang = normLang(socket.handshake.auth?.lang);
  // 这个连接上所有的回复都按它的语言翻译
  const lang = () => socket.data.lang as Lang;
  const reply = (ack: Ack | undefined, res: unknown) => replyWith(ack, res, lang());

  // 玩家切换语言：之后发给他的所有文字都用新语言
  socket.on('lang:set', (data: any, ack?: Ack) => {
    socket.data.lang = normLang(data?.lang);
    const c = ctx(socket);
    if (c) {
      c.player.lang = lang();
      broadcast(c.room);
    }
    replyWith(ack, { ok: true }, lang());
  });
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
    // 本地轮流房间：把密钥只交给创建者，让他的设备替第二位玩家加入
    const localKey = res.room.local && res.player.id === res.room.hostId ? res.room.localKey : undefined;
    reply(ack, { ok: true, code: res.room.code, token: res.player.token, localKey });
    broadcast(res.room);
  };

  on('room:create', (data, ack) => joined(createRoom(data?.nickname, data?.avatar, data?.deviceId, data?.mode, data?.local === true), ack));
  on('room:join', (data, ack) => joined(joinRoom(data?.code, data?.nickname, data?.avatar, data?.deviceId, data?.key), ack));
  on('room:resume', (data, ack) => joined(resumeRoom(data?.code, data?.token), ack));

  // ───── 题库中心：浏览内置题库（学习模式，带答案和解释）─────
  on('bank:list', (_d, ack) => reply(ack, { ok: true, banks: bankStats() }));
  on('bank:browse', (d, ack) => {
    const info = BANKS.find((b) => b.id === d?.bankId);
    if (!info) return reply(ack, { ok: false, error: '题库不存在' });
    let questions = BUILTIN.filter((q) => q.bank === info.id);
    if ([1, 2, 3].includes(d?.difficulty)) questions = questions.filter((q) => q.difficulty === d.difficulty);
    if (typeof d?.type === 'string' && d.type) questions = questions.filter((q) => q.type === d.type);
    reply(ack, { ok: true, title: info.name, questions: questions.slice(0, 300) });
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
  act('room:cancel', (r, p) => cancelStart(r, p));

  // 房主关闭房间：所有人收到 room:closed，回到首页
  on('room:close', (_data, ack) => {
    const c = ctx(socket);
    if (!c) return reply(ack, { ok: false, error: '你不在任何房间中' });
    const res = closeRoom(c.room, c.player);
    if (!res.ok) return reply(ack, res);
    for (const p of res.players) {
      if (!p.socketId) continue;
      const s = io.sockets.sockets.get(p.socketId);
      if (s) {
        s.data.code = undefined;
        s.data.playerId = undefined;
      }
      io.to(p.socketId).emit('room:closed');
    }
    reply(ack, { ok: true });
  });

  // 游戏操作：普通操作会向所有人推送各自的视图；带 delta 的高频操作（画笔）只把增量转发给其他玩家
  on('game:action', (data, ack) => {
    const c = ctx(socket);
    if (!c) return reply(ack, { ok: false, error: '你不在任何房间中' });
    if (c.room.phase !== 'playing' || !c.room.engine) return reply(ack, { ok: false, error: '当前没有进行中的游戏' });
    const res = c.room.engine.handleAction(c.player.id, data, { rttMs: medianRtt(socket) });
    replyWith(ack, res.ok ? { ok: true } : res, lang(), c.room.currentGame ?? 'errors');
    if (!res.ok) return;
    touchIdle(c.room);
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
  process.on(sig, () => process.exit(0));
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`复古桌游俱乐部服务器已启动：http://localhost:${PORT}`);
});
