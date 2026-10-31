import { QUIZ_GAMES } from '../bank/games.js';

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
  /** 是否适合本地轮流（两人共用一台设备）：每次只有一个人需要操作，或秘密选择可以逐个提交 */
  local: boolean;
  /** 是否从题库抽题（房主可以在大厅里设置难度、选择自定义题库） */
  bank: boolean;
}

/** 默认只支持三人；已适配其他人数的游戏在这里登记 */
const MODES_BY_GAME: Record<string, ModeId[]> = {
  quiz: ['solo', 'duo', 'trio', 'party'],
  draw: ['duo', 'trio', 'party'],
  turtlesoup: ['duo', 'trio', 'party'],
  likely: ['trio', 'party'],
  tacit: ['duo', 'trio', 'party'],
  dice: ['duo', 'trio', 'party'],
  number: ['solo', 'duo', 'trio', 'party'],
  memory: ['solo', 'duo', 'trio', 'party'],
  truefalse: ['solo', 'duo', 'trio', 'party'],
  rps: ['solo', 'duo', 'trio', 'party'],
  idiom: ['solo', 'duo', 'trio', 'party'],
  truth: ['duo', 'trio', 'party'],
  reaction: ['solo', 'duo', 'trio', 'party'],
};

const QUIZ_IDS = new Set(QUIZ_GAMES.map((g) => g.id));

/** 支持本地轮流的游戏。客户端的交接逻辑（client/src/pages/LocalRoom.tsx）要对每款游戏说明现在轮到谁操作。 */
export const LOCAL_GAMES = new Set(['number', 'memory', 'dice', 'idiom', 'rps', 'tacit', 'truth']);

/** 题库类游戏（除了最早的答题竞赛）按 bank/games.ts 的配置统一生成 */
const QUIZ_ENTRIES: Omit<GameInfo, 'modes' | 'bank' | 'local'>[] = QUIZ_GAMES.filter((g) => g.id !== 'quiz').map((g) => ({
  id: g.id,
  name: g.name,
  icon: g.icon,
  tagline: g.tagline,
  ready: true,
  rules: [
    '共 10 题，从对应题库随机抽取，同一局不会重复，同一房间连续玩也尽量不重复。',
    '题型包括单选、多选（必须全对）、判断、填空、简答、图片猜题和文字推理，限时作答（选择题 15 秒，多选 20 秒，打字题 25 秒）。',
    '答对得 10 分，并按速度加 0~5 分。揭晓时显示正确答案和解释。',
    '房主可以在大厅里设置难度，也可以选择自定义题库。',
    '结束后按总分排名：第一 +3、第二 +2、第三 +1 计入总积分。',
  ],
}));

const BASE_CATALOG: Omit<GameInfo, 'modes' | 'bank' | 'local'>[] = [
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
    name: '侦探推理',
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
  {
    id: 'likely',
    name: '谁最有可能',
    icon: '👆',
    tagline: '同时投票，站在多数派得分',
    ready: true,
    rules: [
      '共 8 轮，每轮一个问题，例如“谁最有可能迟到？”。每人同时秘密投给一位其他玩家（不能投自己），25 秒内未投算弃权。',
      '全部投完后公开每个人的选择。得票最多的人当选（并列则都算）。',
      '投给了当选者的人各得 1 分——猜对大家怎么想，就是得分关键。',
      '结束后按总分排名：第一 +3、第二 +2、第三 +1 计入总积分。',
    ],
  },
  {
    id: 'tacit',
    name: '默契大考验',
    icon: '💞',
    tagline: '和朋友选得一样，就是默契',
    ready: true,
    rules: [
      '共 8 轮，每轮一道选择题（没有标准答案），每人同时秘密选一个选项。',
      '揭晓后，每有 1 位其他玩家和你选得一样，你就得 1 分。三人全部一致每人得 2 分。',
      '结束后按总分排名：第一 +3、第二 +2、第三 +1 计入总积分。',
    ],
  },
  {
    id: 'dice',
    name: '吹牛骰子',
    icon: '🎲',
    tagline: '看自己的骰子，猜全场的点数',
    ready: true,
    rules: [
      '每人 3 颗骰子，只有自己能看到。每轮从一位玩家开始轮流叫数：“全场至少有 N 个 X 点”。',
      '1 点是万能点，可以当作任何点数，所以只能叫 2~6 点。',
      '轮到你时可以加注（数量更多，或数量相同但点数更大），或者说“开”，质疑上家。',
      '开：公开所有骰子数一遍。叫数成立，开的人输一颗骰子；不成立，叫数的人输一颗骰子。',
      '骰子归零出局，最后留下的人获胜。名次奖励：第一 +3、第二 +2、第三 +1。',
    ],
  },
  {
    id: 'number',
    name: '猜数字',
    icon: '🔢',
    tagline: '1A2B，轮流猜出密码',
    ready: true,
    rules: [
      '服务器随机生成一个 4 位密码，4 个数字互不重复，可以以 0 开头。',
      '玩家轮流猜一个 4 位数（数字不可重复）。提示 A = 数字和位置都对，B = 数字对但位置不对。',
      '所有猜测和提示公开，可以参考别人的线索。',
      '最先猜中的人 +3 分。每人最多猜 8 次，全部用完仍无人猜中则平局，公布答案。',
    ],
  },
  {
    id: 'memory',
    name: '记忆翻牌',
    icon: '🃏',
    tagline: '轮流翻牌，配对得分',
    ready: true,
    rules: [
      '4×4 共 16 张牌，8 对图案，开局全部盖着。',
      '轮到你时翻开两张：图案相同则配对成功，+1 分并继续翻；不同则盖回去，换下一位。',
      '所有牌配完后按配对数排名：第一 +3、第二 +2、第三 +1 计入总积分（同分并列）。',
    ],
  },
  {
    id: 'truefalse',
    name: '真假判断',
    icon: '⚖️',
    tagline: '10 条陈述，判断对错',
    ready: true,
    rules: [
      '共 10 条陈述，涵盖常识、科学、文学、历史，每条 25 秒内判断“对”或“错”。',
      '所有人同时作答，揭晓时显示正确答案和解释。答对得 1 分。',
      '结束后按总分排名：第一 +3、第二 +2、第三 +1 计入总积分。',
    ],
  },
  {
    id: 'rps',
    name: '剪刀石头布',
    icon: '✌️',
    tagline: '7 轮同时出拳，赢一个对手得 1 分',
    ready: true,
    rules: [
      '共 7 轮，每轮所有人同时秘密出拳（石头、剪刀、布），15 秒内未出算弃权。',
      '每赢一位对手得 1 分。多人时可以同时赢多人，也可能全部平局。',
      '单人模式的对手是电脑，每轮随机出拳。赢电脑 +3、平局 +1。',
      '多人按总分排名：第一 +3、第二 +2、第三 +1。',
    ],
  },
  {
    id: 'idiom',
    name: '成语接龙',
    icon: '🐉',
    tagline: '首字接末字，不能重复',
    ready: true,
    rules: [
      '系统给出一个起始成语，玩家轮流接龙：新成语的第一个字必须等于上一个成语的最后一个字（同字即可，不要求同音）。',
      '成语必须在游戏词库里，且本局没用过。词库里没有的成语会被提示“词库里没有这个成语”，请换一个。',
      '每接对一个 +1 分；接完后已无成语可接，再得 2 分并换新的起始成语。',
      '每次限时 35 秒，超时扣 1 条命（共 3 条），命用完出局。只剩一人（单人则命用完）时结束，按得分排名。',
    ],
  },
  {
    id: 'truth',
    name: '真心话大冒险',
    icon: '💬',
    tagline: '抽题挑战，大家投票判定',
    ready: true,
    rules: [
      '每人轮流 2 次（最多 12 回合）。轮到你时选“真心话”或“大冒险”，系统抽一道题；也可以跳过，不得分也不扣分。',
      '你说出答案或完成挑战后，其他玩家投票“完成/没完成”，赞成多于反对才算完成，+2 分。',
      '题目都很轻松，不想答或做不到可以直接跳过。',
      '结束后按总分排名：第一 +3、第二 +2、第三 +1。',
    ],
  },
  {
    id: 'reaction',
    name: '反应速度挑战',
    icon: '⚡',
    tagline: '看到“点！”立刻点击',
    ready: true,
    rules: [
      '共 5 轮。屏幕先显示“等待”，随机 1.5~4 秒后变成“点！”，立刻点击。',
      '反应时间由服务器计时，包含网络延迟。在“点！”出现前点击算抢跑，本轮成绩作废并扣 1 分。',
      '多人：本轮最快 +3、第二 +2、第三 +1。单人：不到 300 毫秒 3 分，不到 500 毫秒 2 分，其余 1 分。',
      '结束后按总分排名：第一 +3、第二 +2、第三 +1。',
    ],
  },
];

export const GAME_CATALOG: GameInfo[] = [...BASE_CATALOG, ...QUIZ_ENTRIES].map((g) => ({
  ...g,
  bank: QUIZ_IDS.has(g.id),
  local: LOCAL_GAMES.has(g.id),
  modes: QUIZ_IDS.has(g.id) ? (['solo', 'duo', 'trio', 'party'] as ModeId[]) : (MODES_BY_GAME[g.id] ?? ['trio']),
}));

export function findGame(id: string | null | undefined): GameInfo | undefined {
  return GAME_CATALOG.find((g) => g.id === id);
}



