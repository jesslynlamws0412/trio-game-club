// 大富翁棋盘（28 格，环形，下标 0 为起点，顺时针前进）。可修改名称、价格和卡片。
export type Tile =
  | { kind: 'go'; name: string }
  | { kind: 'prop'; name: string; group: number; price: number }
  | { kind: 'chance'; name: string }
  | { kind: 'fate'; name: string }
  | { kind: 'tax'; name: string; amount: number }
  | { kind: 'jail'; name: string }
  | { kind: 'parking'; name: string }
  | { kind: 'gojail'; name: string };

export const GROUP_COLORS = ['#8b5a3c', '#5aa9c8', '#d17fa5', '#e0922f', '#c0392b', '#e5c84a', '#3f8f5a', '#2f4f9a'];

const P = (name: string, group: number): Tile => ({ kind: 'prop', name, group, price: 600 + group * 300 });

export const BOARD: Tile[] = [
  { kind: 'go', name: '起点' },
  P('老街', 0), P('古城路', 0),
  { kind: 'chance', name: '机会' },
  P('梅园路', 1), P('竹林巷', 1),
  { kind: 'tax', name: '所得税', amount: 800 },
  { kind: 'jail', name: '监狱' },
  P('书院街', 2), P('学府路', 2),
  { kind: 'fate', name: '命运' },
  P('花市路', 3), P('茶馆巷', 3),
  { kind: 'chance', name: '机会' },
  { kind: 'parking', name: '免费停车' },
  P('码头路', 4), P('渔人街', 4),
  { kind: 'fate', name: '命运' },
  P('商业街', 5), P('金融路', 5),
  { kind: 'tax', name: '奢侈税', amount: 1200 },
  { kind: 'gojail', name: '入狱' },
  P('山景路', 6), P('湖滨路', 6),
  { kind: 'chance', name: '机会' },
  P('帝都大道', 7), P('皇家花园', 7),
  { kind: 'fate', name: '命运' },
];

export type CardEffect =
  | { kind: 'money'; n: number }
  | { kind: 'goto'; pos: number; collectGo: boolean }
  | { kind: 'move'; n: number }
  | { kind: 'gojail' }
  | { kind: 'payEach'; n: number }
  | { kind: 'collectEach'; n: number }
  | { kind: 'repair'; perHouse: number };

export interface EventCard {
  text: string;
  effect: CardEffect;
}

export const CHANCE_CARDS: EventCard[] = [
  { text: '前进到起点，领取 2000。', effect: { kind: 'goto', pos: 0, collectGo: true } },
  { text: '银行出错，对你有利，获得 1500。', effect: { kind: 'money', n: 1500 } },
  { text: '前进 3 格。', effect: { kind: 'move', n: 3 } },
  { text: '开车超速，罚款 600。', effect: { kind: 'money', n: -600 } },
  { text: '请每位玩家吃饭，每人支付 300。', effect: { kind: 'payEach', n: 300 } },
  { text: '被误认为嫌犯，直接入狱！', effect: { kind: 'gojail' } },
  { text: '房屋维修：每栋房子 200（酒店算 5 栋）。', effect: { kind: 'repair', perHouse: 200 } },
  { text: '股票分红，获得 1000。', effect: { kind: 'money', n: 1000 } },
];

export const FATE_CARDS: EventCard[] = [
  { text: '生日快乐！每位玩家送你 400。', effect: { kind: 'collectEach', n: 400 } },
  { text: '彩票中奖，获得 2000。', effect: { kind: 'money', n: 2000 } },
  { text: '生病住院，支付医药费 800。', effect: { kind: 'money', n: -800 } },
  { text: '后退 3 格。', effect: { kind: 'move', n: -3 } },
  { text: '帮助朋友，收到感谢金 500。', effect: { kind: 'money', n: 500 } },
  { text: '去免费停车场休息一下。', effect: { kind: 'goto', pos: 14, collectGo: false } },
  { text: '缴纳学费 1000。', effect: { kind: 'money', n: -1000 } },
  { text: '收到一笔遗产，获得 1200。', effect: { kind: 'money', n: 1200 } },
];
