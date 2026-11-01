export type Lang = 'zh' | 'en';
const KEY = 'trio-lang';

/** 读取玩家选的语言；没选过就按浏览器语言：中文浏览器默认中文，其余默认英文 */
export function loadLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'zh' || v === 'en') return v;
  } catch {
    /* 隐私模式下可能不可用 */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function saveLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
}
