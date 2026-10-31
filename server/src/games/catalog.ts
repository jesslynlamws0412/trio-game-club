export type ModeId = 'solo' | 'duo' | 'trio' | 'party';

/** 各模式的房间人数范围；三人模式固定 3 人（保持原有规则） */
export const MODE_LIMITS: Record<ModeId, { min: number; max: number; label: string }> = {
  solo: { min: 1, max: 1, label: '单人' },
  duo: { min: 2, max: 2, label: '双人' },
  trio: { min: 3, max: 3, label: '三人' },
  party: { min: 4, max: 8, label: '多人' },
};

export interface GameInfo {
  id: string;
  name: string;
  icon: string;
  tagline: string;
  rules: string[];
  /** 该游戏是否已实现（未实现的只能查看规则，不能开始） */
  ready: boolean;
  /** 该游戏能玩的人数模式 */
  modes: ModeId[];
}

/** 默认只支持三人；已适配其他人数的游戏在这里登记 */
const MODES_BY_GAME: Record<string, ModeId[]> = {
  quiz: ['solo', 'duo', 'trio', 'party'],
  draw: ['duo', 'trio', 'party'],
  turtlesoup: ['duo', 'trio', 'party'],
};

const BASE_CATALOG: Omit<GameInfo, 'modes'>[] = [
  {
    id: 'undercover',
    name: '谁是卧底',
    icon: '🕵️',
    tagline: '1 名卧底混在 2 名平民之中',
    ready: true,
    rules: [
      '1 名卧底、2 名平民。平民拿到词 A，卧底拿到相近的词 B，没人知道自己是不是卧底。',
      '每人依次用一句话描述自己的词（不能直接说出原词），然后自由讨论。',
      '同时投票，得票最多者出局。投中卧底则平民胜；投错或平票则进行第二轮，仍未找出卧底则卧底胜。',
      '积分：平民胜各 +2，卧底胜卧底 +4。',
    ],
  },
  {
    id: 'draw',
    name: '你画我猜',
    icon: '🎨',
    tagline: '轮流作画，其余玩家抢答',
    ready: true,
    rules: [
      '每人轮流担任一次画家（回合数 = 玩家人数），画家只能看到题目。',
      '画板支持画笔、橡皮、颜色、清空，画面实时同步给其他玩家。',
      '猜词者在 60 秒内输入答案，越早猜对得分越高（3~1 分），画家每有人猜对 +1 分。',
    ],
  },
  {
    id: 'quiz',
    name: '答题竞赛',
    icon: '📚',
    tagline: '文史地理常识，快者得分',
    ready: true,
    rules: [
      '共 10 题，含单选题与判断题，涵盖文学、历史、地理、文化、常识。',
      '每题 15 秒，所有人同时作答。答对得 10 分，并按答题速度加 0~5 分。',
      '全部结束后显示排名：第一 +3、第二 +2、第三 +1 计入总积分（单人模式只与自己比，得 +3）。',
    ],
  },
  {
    id: 'werewolf',
    name: '三人狼人杀',
    icon: '🐺',
    tagline: '1 狼人 + 预言家 + 守卫',
    ready: true,
    rules: [
      '身份：狼人 1 人、预言家 1 人、守卫 1 人，每人只知道自己的身份。',
      '夜晚：狼人咬人，预言家验人，守卫守人，同时行动。首夜狼人不能咬人。',
      '白天：公布死讯，存活者依次发言，然后投票放逐一人。',
      '胜负：狼人被放逐则好人胜；好人只剩 1 人时狼人胜；3 个昼夜仍无结果则狼人胜。',
    ],
  },
  {
    id: 'monopoly',
    name: '大富翁',
    icon: '🎲',
    tagline: '掷骰买地，收租破产',
    ready: true,
    rules: [
      '28 格环形棋盘，初始资金 15000，经过起点 +2000。',
      '掷骰移动，可购买空地，他人地产自动收租；集齐同色地块可升级建筑。',
      '机会 / 命运格触发随机事件，现金不足时先变卖建筑，仍不足则破产。',
      '只剩 1 人或满 30 回合时，按现金 + 地产价值排名。',
    ],
  },
  {
    id: 'cards',
    name: '抽卡游戏',
    icon: '🃏',
    tagline: '命运、任务、惩罚与特殊事件',
    ready: true,
    rules: [
      '共 3 轮，轮流抽卡：命运卡、任务卡、惩罚卡、特殊事件卡。',
      '公开卡所有人可见，私人卡只有抽到的玩家能看到。',
      '任务卡由另外两人投票判断是否完成。卡片内容可随时扩充。',
    ],
  },
  {
    id: 'turtlesoup',
    name: '海龟汤',
    icon: '🐢',
    tagline: '主持人出题，其余玩家是非题推理',
    ready: true,
    rules: [
      '一人担任主持人（每局轮换），其余玩家推理（双人时 1 人主持、1 人推理）。主持人可从题库选题或自己输入汤面与汤底。',
      '推理者只能问是非题，主持人回答“是 / 不是 / 无关”。',
      '推理者可随时提交答案，猜中者 +3，主持人 +1。',
    ],
  },
  {
    id: 'detective',
    name: '谁是侦探',
    icon: '🔍',
    tagline: '搜集线索，找出真凶与动机',
    ready: true,
    rules: [
      '三人面对同一案件：背景、嫌疑人关系、分散在各地点的线索。',
      '每轮每人有 2 次搜证行动，可选择公开或私藏线索。',
      '合作模式：线索共享，共同提交答案；竞争模式：线索私有，各自提交凶手与动机。',
      '凶手猜对 +4，动机猜对 +2。',
    ],
  },
];

export const GAME_CATALOG: GameInfo[] = BASE_CATALOG.map((g) => ({ ...g, modes: MODES_BY_GAME[g.id] ?? ['trio'] }));

export function findGame(id: string | null | undefined): GameInfo | undefined {
  return GAME_CATALOG.find((g) => g.id === id);
}



