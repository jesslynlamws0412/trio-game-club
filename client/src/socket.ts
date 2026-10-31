import { io } from 'socket.io-client';
import type { Ack } from './types';

export const socket = io({ autoConnect: true });

export function send(event: string, data?: unknown): Promise<Ack> {
  return new Promise((resolve) => {
    if (!socket.connected) return resolve({ ok: false, error: '尚未连接服务器，请稍候再试' });
    const timer = setTimeout(() => resolve({ ok: false, error: '服务器无响应' }), 8000);
    socket.emit(event, data, (res: Ack) => {
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
