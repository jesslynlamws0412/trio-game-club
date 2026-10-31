// 抽卡游戏卡库。往 CARDS 末尾添加新卡即可扩充。
//
// type：   fate 命运卡 / task 任务卡 / punish 惩罚卡 / event 特殊事件卡
// private：私人卡，只有抽到的人能看到；其积分变化是“暗分”，游戏结束时才公布
// secretTask：私人秘密任务，游戏结束时由另外两人投票是否完成（完成 +3）
// effect：
//   self  n   抽卡者得分 n（可为负）
//   all   n   所有人得分 n
//   steal n   从当前领先的其他玩家那里抢 n 分
//   give  n   送给当前最落后的其他玩家 n 分
//   swap      与当前领先者交换分数
// task 的 reward：另外两人多数投“完成”则抽卡者获得 reward 分（默认 2）

export type CardType = 'fate' | 'task' | 'punish' | 'event';
export type Effect =
  | { kind: 'self'; n: number }
  | { kind: 'all'; n: number }
  | { kind: 'steal'; n: number }
  | { kind: 'give'; n: number }
  | { kind: 'swap' };

export interface Card {
  id: string;
  type: CardType;
  title: string;
  text: string;
  private?: boolean;
  secretTask?: boolean;
  effect?: Effect;
  reward?: number;
}

export const CARDS: Card[] = [
  // 命运卡
  { id: 'f1', type: 'fate', title: '天降横财', text: '捡到一个钱包，获得 3 分。', effect: { kind: 'self', n: 3 } },
  { id: 'f2', type: 'fate', title: '好运连连', text: '今天出门遇到了幸运星，获得 2 分。', effect: { kind: 'self', n: 2 } },
  { id: 'f3', type: 'fate', title: '意外之财', text: '抽奖中了小奖，获得 1 分。', effect: { kind: 'self', n: 1 } },
  { id: 'f4', type: 'fate', title: '雨天没带伞', text: '被淋成落汤鸡，失去 1 分。', effect: { kind: 'self', n: -1 } },
  { id: 'f5', type: 'fate', title: '丢了钥匙', text: '折腾了一晚上，失去 2 分。', effect: { kind: 'self', n: -2 } },
  { id: 'f6', type: 'fate', title: '朋友请客', text: '这一轮大家都吃得很开心，所有人各得 1 分。', effect: { kind: 'all', n: 1 } },
  { id: 'f7', type: 'fate', title: '平平淡淡', text: '风平浪静的一天，什么都没发生。' },
  { id: 'f8', type: 'fate', title: '贵人相助', text: '遇到贵人帮忙，获得 2 分。', effect: { kind: 'self', n: 2 } },
  // 任务卡（公开，由另外两人投票是否完成）
  { id: 't1', type: 'task', title: '动物模仿秀', text: '模仿一种动物的叫声和动作，让大家猜是什么。' },
  { id: 't2', type: 'task', title: '绕口令', text: '连续说三遍：“四是四，十是十，十四是十四，四十是四十。”' },
  { id: 't3', type: 'task', title: '水果速报', text: '10 秒内说出 5 种不同的水果。' },
  { id: 't4', type: 'task', title: '冷笑话', text: '讲一个冷笑话，至少让一个人笑出来。', reward: 3 },
  { id: 't5', type: 'task', title: '方言时间', text: '用你最拿手的方言说：“今天天气真好，我们去玩吧。”' },
  { id: 't6', type: 'task', title: '歌唱家', text: '清唱一句你最喜欢的歌词，让大家猜歌名。', reward: 3 },
  { id: 't7', type: 'task', title: '鬼脸挑战', text: '做一个最夸张的鬼脸并坚持 5 秒，不许笑场。' },
  { id: 't8', type: 'task', title: '成语接龙', text: '说一个成语，让另外两人依次接龙，至少接够 3 个。', reward: 3 },
  // 惩罚卡
  { id: 'p1', type: 'punish', title: '倒霉蛋', text: '踩到香蕉皮，失去 1 分。', effect: { kind: 'self', n: -1 } },
  { id: 'p2', type: 'punish', title: '大声宣布', text: '大声说“我是全世界最可爱的人”，并失去 1 分。', effect: { kind: 'self', n: -1 } },
  { id: 'p3', type: 'punish', title: '罚款通知', text: '收到一张罚单，失去 2 分。', effect: { kind: 'self', n: -2 } },
  { id: 'p4', type: 'punish', title: '破财消灾', text: '把 1 分分给目前分数最少的玩家。', effect: { kind: 'give', n: 1 } },
  { id: 'p5', type: 'punish', title: '真心话', text: '回答大家提出的一个问题（可以拒绝回答，但要失去 1 分）。', effect: { kind: 'self', n: -1 } },
  { id: 'p6', type: 'punish', title: '赔礼道歉', text: '对右手边的玩家说一句真诚的夸奖，并失去 1 分。', effect: { kind: 'self', n: -1 } },
  // 特殊事件卡
  { id: 'e1', type: 'event', title: '妙手空空', text: '从目前领先的玩家那里偷走 2 分。', effect: { kind: 'steal', n: 2 } },
  { id: 'e2', type: 'event', title: '乾坤大挪移', text: '与目前领先的玩家交换分数。', effect: { kind: 'swap' } },
  { id: 'e3', type: 'event', title: '普天同庆', text: '节日到了，所有人各得 2 分。', effect: { kind: 'all', n: 2 } },
  { id: 'e4', type: 'event', title: '劫富济贫', text: '从目前领先的玩家那里拿 1 分。', effect: { kind: 'steal', n: 1 } },
  { id: 'e5', type: 'event', title: '全员破费', text: '大家一起交了一笔费用，所有人各失去 1 分。', effect: { kind: 'all', n: -1 } },
  // 私人卡（只有抽到的人能看到）
  { id: 's1', type: 'fate', private: true, title: '秘密红包', text: '悄悄收到一个红包，暗得 3 分（游戏结束才公布）。', effect: { kind: 'self', n: 3 } },
  { id: 's2', type: 'fate', private: true, title: '秘密罚单', text: '被偷偷记了一笔，暗扣 2 分（游戏结束才公布）。', effect: { kind: 'self', n: -2 } },
  { id: 's3', type: 'event', private: true, title: '暗中保管', text: '你替别人保管了一笔钱，暗得 2 分（游戏结束才公布）。', effect: { kind: 'self', n: 2 } },
  { id: 's4', type: 'task', private: true, secretTask: true, title: '秘密任务：口头禅', text: '在剩下的游戏里，想办法让另一名玩家说出“其实”这个词。游戏结束时由另外两人投票是否达成，达成得 3 分。' },
  { id: 's5', type: 'task', private: true, secretTask: true, title: '秘密任务：装无辜', text: '在剩下的游戏里，装出一次“我什么都不知道”的表情。游戏结束时由另外两人投票是否看出来过，没有人看出来则达成，得 3 分。' },
];
