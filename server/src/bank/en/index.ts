import type { EnglishQuestion } from '../types.js';
import { SCIENCE } from './science.js';
import { WORLD_GEO } from './geo.js';
import { WORLD_HISTORY } from './history.js';
import { TRIVIA } from './trivia.js';
import { DAILY } from './daily.js';
import { LOGIC } from './logic.js';
import { FILM_MUSIC } from './film.js';
import { WORLD_LIT } from './worldlit.js';

/**
 * 英文版题库：键是中文题干。有英文版的题库：科学、世界地理、世界历史、趣味冷知识、日常常识、逻辑推理、影视音乐、世界文学。
 * 成语、古诗词、中国文学、马华文学、脑筋急转弯等本身就是中文内容，不翻译。
 */
export const EN_QUESTIONS: Record<string, EnglishQuestion> = {
  ...SCIENCE,
  ...WORLD_GEO,
  ...WORLD_HISTORY,
  ...TRIVIA,
  ...DAILY,
  ...LOGIC,
  ...FILM_MUSIC,
  ...WORLD_LIT,
};
