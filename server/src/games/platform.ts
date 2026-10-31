/**
 * 平台级游戏配置：模式、分类、每款游戏支持的人数模式。
 * 与 catalog.ts 分离——catalog.ts 只描述“房间里能开始的游戏”（三人模式，保持不变），
 * 这里描述整个大厅要展示的游戏。liveModes 才是目前真正能玩的模式，其余都是规划。
 */
import { findGame, type ModeId } from './catalog.js';

export type { ModeId };

export interface ModeInfo {
  id: ModeId;
  name: string;
  en: string;
  icon: string;
  players: string;
  desc: string;
  /** 该模式的房间/玩法是否已经可用 */
  open: boolean;
}

export interface CategoryInfo {
  id: string;
  name: string;
  icon: string;
}

export interface PlatformGame {
  id: string;
  name: string;
  icon: string;
  category: string;
  /** 按游戏规则设计支持的模式 */
  modes: ModeId[];
  /** 目前已经可以玩的模式（空数组 = 开发中） */
  liveModes: ModeId[];
  minPlayers: number;
  maxPlayers: number;
  ready: boolean;
}

export const MODES: ModeInfo[] = [
  { id: 'solo', name: '单人', en: 'SOLO', icon: '🎯', players: '1 人', desc: '独自挑战、刷最高分', open: true },
  { id: 'duo', name: '双人', en: 'DUO', icon: '🤝', players: '2 人', desc: '双人对战或合作', open: true },
  { id: 'trio', name: '三人', en: 'TRIO', icon: '🎲', players: '3 人', desc: '经典三人联机，房间号邀请', open: true },
  { id: 'party', name: '多人', en: 'PARTY', icon: '🎉', players: '4~8 人', desc: '聚会大房间', open: true },
];

export const CATEGORIES: CategoryInfo[] = [
  { id: 'quiz', name: '知识问答', icon: '📚' },
  { id: 'word', name: '文字与语言', icon: '🔤' },
  { id: 'puzzle', name: '推理与解谜', icon: '🔍' },
  { id: 'classic', name: '经典桌游', icon: '♟️' },
  { id: 'party', name: '聚会互动', icon: '🎉' },
  { id: 'reaction', name: '反应与策略', icon: '⚡' },
];

const CODE: Record<string, ModeId> = { S: 'solo', D: 'duo', T: 'trio', P: 'party' };
const MIN: Record<ModeId, number> = { solo: 1, duo: 2, trio: 3, party: 4 };
const MAX: Record<ModeId, number> = { solo: 1, duo: 2, trio: 3, party: 8 };

/** 已经实现（三人模式可玩）的游戏：id 必须与 catalog.ts 一致 */
const LIVE = new Set([
  'undercover', 'draw', 'quiz', 'werewolf', 'monopoly', 'cards', 'turtlesoup', 'detective',
  'likely', 'tacit', 'dice', 'number', 'memory',
  'truefalse', 'rps', 'idiom', 'truth', 'reaction',
]);

function g(id: string, name: string, icon: string, category: string, codes: string): PlatformGame {
  const modes = [...codes].map((c) => CODE[c]);
  const ready = LIVE.has(id);
  return {
    id,
    name,
    icon,
    category,
    modes,
    liveModes: ready ? (findGame(id)?.modes ?? ['trio']) : [],
    minPlayers: Math.min(...modes.map((m) => MIN[m])),
    maxPlayers: Math.max(...modes.map((m) => MAX[m])),
    ready,
  };
}

const ALL = 'SDTP';

export const PLATFORM_GAMES: PlatformGame[] = [
  // A 知识问答
  g('quiz', '答题竞赛', '📚', 'quiz', ALL),
  g('p-quiz-common', '常识问答', '💡', 'quiz', ALL),
  g('p-quiz-cnhist', '中国历史问答', '🏯', 'quiz', ALL),
  g('p-quiz-whist', '世界历史问答', '🗿', 'quiz', ALL),
  g('p-quiz-cnlit', '中国文学问答', '📖', 'quiz', ALL),
  g('p-quiz-wlit', '世界文学问答', '📕', 'quiz', ALL),
  g('p-quiz-mylit', '马华文学问答', '🌴', 'quiz', ALL),
  g('p-quiz-culture', '中国文化问答', '🏮', 'quiz', ALL),
  g('p-quiz-geo', '世界地理问答', '🌏', 'quiz', ALL),
  g('p-quiz-sci', '科学知识问答', '🔬', 'quiz', ALL),
  g('p-quiz-film', '影视知识问答', '🎬', 'quiz', ALL),
  g('p-quiz-music', '音乐知识问答', '🎵', 'quiz', ALL),
  g('p-quiz-idiom', '成语知识问答', '📜', 'quiz', ALL),
  g('p-quiz-poem', '古典诗词问答', '🖋️', 'quiz', ALL),
  g('p-quiz-trivia', '趣味冷知识问答', '🧊', 'quiz', ALL),
  // B 文字与语言
  g('p-word-guess', '猜词游戏', '🔡', 'word', 'SDTP'),
  g('idiom', '成语接龙', '🐉', 'word', ALL),
  g('p-word-poem', '诗词接龙', '🌸', 'word', ALL),
  g('p-word-assoc', '词语联想', '💭', 'word', 'DTP'),
  g('p-word-bomb', '文字炸弹', '💣', 'word', 'DTP'),
  g('p-word-riddle', '猜字谜', '❓', 'word', ALL),
  g('p-word-split', '汉字拆解', '✂️', 'word', 'SDTP'),
  g('p-word-fill', '词语填空', '✏️', 'word', 'SDTP'),
  g('p-word-join', '文字拼接', '🧩', 'word', 'SDTP'),
  g('p-word-sentence', '限时造句', '⏱️', 'word', 'DTP'),
  g('p-word-xiehouyu', '歇后语挑战', '🗣️', 'word', ALL),
  g('p-word-synonym', '近义词与反义词挑战', '🔁', 'word', 'SDTP'),
  // C 推理与解谜
  g('turtlesoup', '海龟汤', '🐢', 'puzzle', ALL),
  g('undercover', '谁是卧底', '🕵️', 'puzzle', 'TP'),
  g('detective', '侦探推理', '🔍', 'puzzle', 'SDTP'),
  g('truefalse', '真假判断', '⚖️', 'puzzle', 'SDTP'),
  g('p-puz-liar', '找出说谎者', '🤥', 'puzzle', 'TP'),
  g('p-puz-escape', '密室逃脱', '🚪', 'puzzle', 'SDTP'),
  g('p-puz-logic', '逻辑推理', '🧠', 'puzzle', 'SD'),
  g('p-puz-clue', '线索拼图', '🗂️', 'puzzle', 'SDTP'),
  g('p-puz-mystery', '神秘案件', '🕯️', 'puzzle', 'SDTP'),
  g('p-puz-murderer', '谁是凶手', '🔪', 'puzzle', 'TP'),
  g('werewolf', '三人狼人杀', '🐺', 'puzzle', 'T'),
  // D 经典桌游
  g('p-cls-gomoku', '五子棋', '⚫', 'classic', 'SD'),
  g('p-cls-ttt', '井字棋', '❌', 'classic', 'SD'),
  g('p-cls-chess', '国际象棋', '♞', 'classic', 'SD'),
  g('memory', '记忆翻牌', '🃏', 'classic', 'SDTP'),
  g('dice', '吹牛骰子', '🎲', 'classic', 'DTP'),
  g('p-cls-poker', '扑克牌小游戏', '♠️', 'classic', 'SDTP'),
  g('p-cls-slide', '数字华容道', '🔢', 'classic', 'S'),
  g('number', '猜数字', '🔟', 'classic', 'SDTP'),
  g('p-cls-sudoku', '数独', '9️⃣', 'classic', 'S'),
  g('p-cls-reversi', '黑白棋', '⚪', 'classic', 'SD'),
  g('monopoly', '大富翁', '🏠', 'classic', 'T'),
  // E 聚会互动
  g('truth', '真心话大冒险', '💬', 'party', 'DTP'),
  g('draw', '你画我猜', '🎨', 'party', 'DTP'),
  g('likely', '谁最有可能', '👆', 'party', 'TP'),
  g('p-par-quick', '快问快答', '⚡', 'party', 'DTP'),
  g('p-par-taboo', '禁忌词挑战', '🚫', 'party', 'DTP'),
  g('p-par-story', '故事接龙', '📝', 'party', 'DTP'),
  g('p-par-roleplay', '角色扮演推理', '🎭', 'party', 'TP'),
  g('p-par-choice', '选择困难挑战', '🤔', 'party', 'DTP'),
  g('tacit', '默契大考验', '💞', 'party', 'DTP'),
  g('p-par-keyword', '关键词联想', '🔑', 'party', 'DTP'),
  g('cards', '抽卡游戏', '🎴', 'party', 'TP'),
  // F 反应与策略
  g('reaction', '反应速度挑战', '⚡', 'reaction', 'SDTP'),
  g('p-rea-digit', '数字记忆', '🔢', 'reaction', 'SDTP'),
  g('p-rea-pattern', '图案记忆', '🔷', 'reaction', 'SDTP'),
  g('p-rea-calc', '限时计算', '➕', 'reaction', 'SDTP'),
  g('rps', '剪刀石头布', '✌️', 'reaction', 'SDTP'),
  g('p-rea-color', '颜色反应挑战', '🎨', 'reaction', 'SDTP'),
  g('p-rea-order', '记忆顺序', '🔀', 'reaction', 'SDTP'),
  g('p-rea-diff', '快速找不同', '👀', 'reaction', 'SDTP'),
  g('p-rea-maze', '迷宫挑战', '🌀', 'reaction', 'SD'),
  g('p-rea-survive', '限时生存挑战', '🔥', 'reaction', 'SDTP'),
];

export const PLATFORM = { modes: MODES, categories: CATEGORIES, games: PLATFORM_GAMES };
