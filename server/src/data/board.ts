// 大富翁棋盘（40 格，和真正的 Monopoly 一样：8 个颜色组、4 个火车站、2 个公用事业），下标 0 为起点，顺时针前进。
// 地名取自马来西亚，金额单位 RM。租金、造价沿用经典版本的数字。
export type Tile =
  | { kind: 'go'; name: string }
  | { kind: 'prop'; name: string; group: number; price: number; rents: number[]; houseCost: number }
  | { kind: 'rail'; name: string; price: number }
  | { kind: 'util'; name: string; price: number }
  | { kind: 'chance'; name: string }
  | { kind: 'fate'; name: string }
  | { kind: 'tax'; name: string; amount: number }
  | { kind: 'jail'; name: string }
  | { kind: 'parking'; name: string }
  | { kind: 'gojail'; name: string };

/** 棕、浅蓝、粉、橙、红、黄、绿、深蓝 */
export const GROUP_COLORS = ['#8b5a3c', '#7ec8e3', '#d96aa7', '#e8892b', '#c0392b', '#e5c84a', '#3f8f5a', '#2f4f9a'];
export const GROUP_NAMES = ['棕色', '浅蓝', '粉红', '橙色', '红色', '黄色', '绿色', '深蓝'];

export const JAIL_POS = 10;

const P = (name: string, group: number, price: number, rents: number[], houseCost: number): Tile => ({
  kind: 'prop', name, group, price, rents, houseCost,
});

export const BOARD: Tile[] = [
  { kind: 'go', name: '起点' },
  P('怡保旧街场', 0, 60, [2, 10, 30, 90, 160, 250], 50),
  { kind: 'fate', name: '命运' },
  P('太平湖滨', 0, 60, [4, 20, 60, 180, 320, 450], 50),
  { kind: 'tax', name: '所得税', amount: 200 },
  { kind: 'rail', name: '吉隆坡中央车站', price: 200 },
  P('芙蓉老街', 1, 100, [6, 30, 90, 270, 400, 550], 50),
  { kind: 'chance', name: '机会' },
  P('瓜拉丁加奴', 1, 100, [6, 30, 90, 270, 400, 550], 50),
  P('关丹海滨', 1, 120, [8, 40, 100, 300, 450, 600], 50),
  { kind: 'jail', name: '监狱（探监）' },
  P('马六甲鸡场街', 2, 140, [10, 50, 150, 450, 625, 750], 100),
  { kind: 'util', name: '国家能源公司', price: 150 },
  P('槟城乔治市', 2, 140, [10, 50, 150, 450, 625, 750], 100),
  P('新山柔佛古庙', 2, 160, [12, 60, 180, 500, 700, 900], 100),
  { kind: 'rail', name: '槟城北海车站', price: 200 },
  P('云顶高原', 3, 180, [14, 70, 200, 550, 750, 950], 100),
  { kind: 'fate', name: '命运' },
  P('金马仑高原', 3, 180, [14, 70, 200, 550, 750, 950], 100),
  P('兰卡威', 3, 200, [16, 80, 220, 600, 800, 1000], 100),
  { kind: 'parking', name: '免费停车' },
  P('亚庇', 4, 220, [18, 90, 250, 700, 875, 1050], 150),
  { kind: 'chance', name: '机会' },
  P('古晋', 4, 220, [18, 90, 250, 700, 875, 1050], 150),
  P('诗巫', 4, 240, [20, 100, 300, 750, 925, 1100], 150),
  { kind: 'rail', name: '怡保火车站', price: 200 },
  P('八打灵再也', 5, 260, [22, 110, 330, 800, 975, 1150], 150),
  P('莎阿南', 5, 260, [22, 110, 330, 800, 975, 1150], 150),
  { kind: 'util', name: '水务公司', price: 150 },
  P('布城', 5, 280, [24, 120, 360, 850, 1025, 1200], 150),
  { kind: 'gojail', name: '入狱' },
  P('茨厂街', 6, 300, [26, 130, 390, 900, 1100, 1275], 200),
  P('武吉免登', 6, 300, [26, 130, 390, 900, 1100, 1275], 200),
  { kind: 'fate', name: '命运' },
  P('孟沙', 6, 320, [28, 150, 450, 1000, 1200, 1400], 200),
  { kind: 'rail', name: '新山车站', price: 200 },
  { kind: 'chance', name: '机会' },
  P('城中城', 7, 350, [35, 175, 500, 1100, 1300, 1500], 200),
  { kind: 'tax', name: '奢侈税', amount: 100 },
  P('双子塔', 7, 400, [50, 200, 600, 1400, 1700, 2000], 200),
];

export type CardEffect =
  | { kind: 'money'; n: number }
  | { kind: 'goto'; pos: number; collectGo: boolean }
  | { kind: 'move'; n: number }
  | { kind: 'nearest'; what: 'rail' | 'util' }
  | { kind: 'jailcard' }
  | { kind: 'gojail' }
  | { kind: 'payEach'; n: number }
  | { kind: 'collectEach'; n: number }
  | { kind: 'repair'; house: number; hotel: number };

export interface EventCard {
  text: string;
  effect: CardEffect;
}

export const CHANCE_CARDS: EventCard[] = [
  { text: '前进到起点，领取 RM200。', effect: { kind: 'goto', pos: 0, collectGo: true } },
  { text: '前进到双子塔。如果经过起点，领取 RM200。', effect: { kind: 'goto', pos: 39, collectGo: true } },
  { text: '前进到云顶高原。如果经过起点，领取 RM200。', effect: { kind: 'goto', pos: 16, collectGo: true } },
  { text: '搭 KTM 到吉隆坡中央车站。如果经过起点，领取 RM200。', effect: { kind: 'goto', pos: 5, collectGo: true } },
  { text: '前进到最近的火车站。如果有主人，付双倍租金。', effect: { kind: 'nearest', what: 'rail' } },
  { text: '前进到最近的公用事业。如果有主人，掷骰子付 10 倍点数。', effect: { kind: 'nearest', what: 'util' } },
  { text: '银行付你股息 RM50。', effect: { kind: 'money', n: 50 } },
  { text: '免费出狱卡！可以留着以后用。', effect: { kind: 'jailcard' } },
  { text: '后退 3 格。', effect: { kind: 'move', n: -3 } },
  { text: '直接入狱，不经过起点，不领 RM200。', effect: { kind: 'gojail' } },
  { text: '房屋维修：每栋房子 RM25，每间酒店 RM100。', effect: { kind: 'repair', house: 25, hotel: 100 } },
  { text: '开车超速，罚款 RM15。', effect: { kind: 'money', n: -15 } },
  { text: '你被选为董事长，付给每位玩家 RM50。', effect: { kind: 'payEach', n: 50 } },
  { text: '贷款到期，收到 RM150。', effect: { kind: 'money', n: 150 } },
];

export const FATE_CARDS: EventCard[] = [
  { text: '银行出错，对你有利，获得 RM200。', effect: { kind: 'money', n: 200 } },
  { text: '医药费，付 RM50。', effect: { kind: 'money', n: -50 } },
  { text: '卖出股票，获得 RM50。', effect: { kind: 'money', n: 50 } },
  { text: '免费出狱卡！可以留着以后用。', effect: { kind: 'jailcard' } },
  { text: '直接入狱，不经过起点，不领 RM200。', effect: { kind: 'gojail' } },
  { text: '假期基金到期，获得 RM100。', effect: { kind: 'money', n: 100 } },
  { text: '所得税退款，获得 RM20。', effect: { kind: 'money', n: 20 } },
  { text: '生日快乐！每位玩家送你 RM10。', effect: { kind: 'collectEach', n: 10 } },
  { text: '保险到期，获得 RM100。', effect: { kind: 'money', n: 100 } },
  { text: '住院费，付 RM100。', effect: { kind: 'money', n: -100 } },
  { text: '学费，付 RM50。', effect: { kind: 'money', n: -50 } },
  { text: '咨询费收入，获得 RM25。', effect: { kind: 'money', n: 25 } },
  { text: '街道维修：每栋房子 RM40，每间酒店 RM115。', effect: { kind: 'repair', house: 40, hotel: 115 } },
  { text: '选美比赛获得第二名，获得 RM10。', effect: { kind: 'money', n: 10 } },
  { text: '继承遗产，获得 RM100。', effect: { kind: 'money', n: 100 } },
  { text: '退回怡保旧街场。', effect: { kind: 'goto', pos: 1, collectGo: false } },
];
