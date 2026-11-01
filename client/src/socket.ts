import { io } from 'socket.io-client';
import type { Ack } from './types';
import { loadLang } from './langStore';

/** 每次连接（包括断线重连）都把当前选的语言告诉服务器 */
export const langAuth = (cb: (data: { lang: string }) => void) => cb({ lang: loadLang() });

export const socket = io({ autoConnect: true, auth: langAuth });

/** 本地轮流时第二位玩家使用的连接：切换语言时也要通知服务器 */
export const extraSockets = new Set<typeof socket>();

/** 当前负责发送操作的连接。平时就是 socket；本地轮流时在两位玩家的连接之间切换。 */
let current = socket;
export function setActiveSocket(s: typeof socket) {
  current = s;
}

/** 本地轮流：创建房间后，把第二位玩家的信息交给 LocalRoom 去加入 */
export const localSetup: { pending: { nickname: string; avatar: string; key: string } | null } = { pending: null };

const LOCAL_KEY = 'trio-local';
export function loadLocal(): { code: string; token: string } | null {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null');
  } catch {
    return null;
  }
}
export function saveLocal(v: { code: string; token: string } | null) {
  try {
    if (v) localStorage.setItem(LOCAL_KEY, JSON.stringify(v));
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
}

export function send(event: string, data?: unknown): Promise<Ack> {
  const sock = current;
  return new Promise((resolve) => {
    const en = loadLang() === 'en';
    if (!sock.connected) return resolve({ ok: false, error: en ? 'Not connected to the server yet. Please try again shortly.' : '尚未连接服务器，请稍候再试' });
    const timer = setTimeout(() => resolve({ ok: false, error: en ? 'The server is not responding' : '服务器无响应' }), 8000);
    sock.emit(event, data, (res: Ack) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

const KEY = 'trio-session';
export interface Session {
  code: string;
  token: string;
}
export function loadSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}
export function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* 隐私模式下可能不可用 */
  }
}

/** 这个浏览器的长期身份，用来累计战绩（不是密码，清除浏览器数据后会变成新玩家） */
export function getDeviceId(): string {
  const KEY = 'trio-device';
  try {
    const old = localStorage.getItem(KEY);
    if (old) return old;
    const id = 'dev-' + (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return 'dev-session-' + Math.random().toString(36).slice(2, 12);
  }
}

const PROFILE_KEY = 'trio-profile';
export function loadProfile(): { nickname: string; avatar: string } | null {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null');
  } catch {
    return null;
  }
}
export function saveProfile(p: { nickname: string; avatar: string }) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
