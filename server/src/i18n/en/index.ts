import { COMMON } from './common.js';
import { CATALOG } from './catalog.js';
import { GAMES } from './games.js';
import { PICK } from './pick.js';
import { WORDS } from './words.js';
import { STORIES } from './stories.js';
import { PARTY } from './party.js';
import { RULES } from './rules.js';

const PARTS: Record<string, Record<string, string>> = { COMMON, CATALOG, GAMES, PICK, WORDS, STORIES, PARTY, RULES };

/** 中文原文 → 英文。带 {变量} 的是模板。 */
export const EN: Record<string, string> = Object.assign({}, ...Object.values(PARTS));

/** 同一个中文原文在不同文件里写了不同的英文（后面的会盖掉前面的）：测试会检查这个列表必须是空的 */
export const CONFLICTS: string[] = (() => {
  const seen = new Map<string, { part: string; en: string }>();
  const out: string[] = [];
  for (const [part, dict] of Object.entries(PARTS)) {
    for (const [zh, en] of Object.entries(dict)) {
      const prev = seen.get(zh);
      if (prev && prev.en !== en) out.push(`${zh}：${prev.part}=“${prev.en}” / ${part}=“${en}”`);
      seen.set(zh, { part, en });
    }
  }
  return out;
})();
