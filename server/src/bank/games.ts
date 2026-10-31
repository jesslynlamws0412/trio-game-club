/** 所有“从题库抽题”的问答类游戏：每款游戏只是对题库的一个筛选条件。 */
export interface QuizGameCfg {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  category: 'quiz' | 'puzzle';
  banks: string[];
  tag?: string;
  /** 只出一键作答的题型（保持旧版“答题竞赛”的规则） */
  choiceOnly?: boolean;
}

export const QUIZ_GAMES: QuizGameCfg[] = [
  { id: 'quiz', name: '答题竞赛', icon: '📚', tagline: '文史地理常识，快者得分', category: 'quiz', choiceOnly: true,
    banks: ['cn_lit', 'world_lit', 'cn_history', 'world_history', 'world_geo', 'cn_culture', 'science', 'daily'] },
  { id: 'q-common', name: '常识问答', icon: '💡', tagline: '生活、科学、冷知识', category: 'quiz', banks: ['daily', 'science', 'trivia'] },
  { id: 'q-cnhist', name: '中国历史问答', icon: '🏯', tagline: '从先秦到近代', category: 'quiz', banks: ['cn_history'] },
  { id: 'q-whist', name: '世界历史问答', icon: '🗿', tagline: '古代文明到现代', category: 'quiz', banks: ['world_history'] },
  { id: 'q-cnlit', name: '中国文学问答', icon: '📖', tagline: '名著、作家与名篇', category: 'quiz', banks: ['cn_lit'] },
  { id: 'q-wlit', name: '世界文学问答', icon: '📕', tagline: '外国文学名著与作家', category: 'quiz', banks: ['world_lit'] },
  { id: 'q-mylit', name: '马华文学问答', icon: '🌴', tagline: '马来西亚华文文学', category: 'quiz', banks: ['my_lit'] },
  { id: 'q-culture', name: '中国文化问答', icon: '🏮', tagline: '节日、典籍与习俗', category: 'quiz', banks: ['cn_culture'] },
  { id: 'q-geo', name: '世界地理问答', icon: '🌏', tagline: '国家、城市与山川', category: 'quiz', banks: ['world_geo'] },
  { id: 'q-sci', name: '科学知识问答', icon: '🔬', tagline: '物理化学生物天文', category: 'quiz', banks: ['science'] },
  { id: 'q-film', name: '影视知识问答', icon: '🎬', tagline: '电影与动画', category: 'quiz', banks: ['film_music'], tag: 'film' },
  { id: 'q-music', name: '音乐知识问答', icon: '🎵', tagline: '乐器、作曲家与名曲', category: 'quiz', banks: ['film_music'], tag: 'music' },
  { id: 'q-idiom', name: '成语知识问答', icon: '📜', tagline: '成语、词语与汉字', category: 'quiz', banks: ['idiom_char'] },
  { id: 'q-poem', name: '古典诗词问答', icon: '🖋️', tagline: '名句、作者与出处', category: 'quiz', banks: ['poem'] },
  { id: 'q-trivia', name: '趣味冷知识问答', icon: '🧊', tagline: '你可能不知道的小知识', category: 'quiz', banks: ['trivia'] },
  { id: 'q-brain', name: '脑筋急转弯', icon: '🧩', tagline: '换个角度想一想', category: 'quiz', banks: ['brain_teaser'] },
  { id: 'q-logic', name: '逻辑推理', icon: '🧠', tagline: '数列、推理与逻辑题', category: 'puzzle', banks: ['logic'] },
];
