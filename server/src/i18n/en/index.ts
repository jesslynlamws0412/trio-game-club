import { COMMON } from './common.js';
import { CATALOG } from './catalog.js';
import { GAMES } from './games.js';

/** 中文原文 → 英文。带 {变量} 的是模板。 */
export const EN: Record<string, string> = { ...COMMON, ...CATALOG, ...GAMES };
