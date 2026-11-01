import { useSyncExternalStore } from 'react';
import { loadLang, saveLang, type Lang } from './langStore';
import { extraSockets, socket } from './socket';
import { EN } from './locales/en';

export type { Lang };

/**
 * 界面文字的翻译：代码里直接写中文，用 t('中文') 包起来；选了英文就换成 locales/en.ts 里的英文。
 * 带变量的句子用 {名字} 占位：t('第 {n} 回合', { n: 3 })。找不到英文时显示中文。
 */
let lang: Lang = loadLang();
const listeners = new Set<() => void>();

if (typeof document !== 'undefined') document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';

export const getLang = () => lang;

export function setLang(next: Lang) {
  if (next === lang) return;
  lang = next;
  saveLang(next);
  if (typeof document !== 'undefined') document.documentElement.lang = next === 'en' ? 'en' : 'zh-CN';
  // 告诉服务器，之后发来的文字都用新语言
  for (const s of [socket, ...extraSockets]) if (s.connected) s.emit('lang:set', { lang: next });
  listeners.forEach((f) => f());
}

export function subscribeLang(f: () => void) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang);
}

export function t(zh: string, params?: Record<string, string | number>): string {
  let s = lang === 'en' ? EN[zh] ?? zh : zh;
  if (params) s = s.replace(/\{(\w+)\}/g, (_all, k: string) => String(params[k] ?? ''));
  // 页面字体里的弯引号是全角的，英文里会空一大格，换成直引号
  if (lang === 'en') s = s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  return s;
}
