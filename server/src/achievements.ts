import type { Profile } from './store.js';

/** 游戏所属的大类，用于“推理大师”“文学爱好者”等成就，也用于分类排行榜。 */
export const LITERATURE_GAMES = ['q-cnlit', 'q-wlit', 'q-mylit'];
export const PUZZLE_GAMES = ['undercover', 'werewolf', 'detective', 'turtlesoup', 'truefalse', 'q-logic'];

export interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 当前进度（用于进度条），达到 goal 即解锁 */
  progress: (p: Profile) => number;
  goal: number;
}

const played = (p: Profile, games: string[]) => games.reduce((n, g) => n + (p.perGame[g]?.played ?? 0), 0);

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'debut', name: '初次登场', icon: '🎬', desc: '完成第一场游戏', progress: (p) => p.played, goal: 1 },
  { id: 'quiz10', name: '答题达人', icon: '🎓', desc: '在题库问答中连续答对 10 题', progress: (p) => p.quiz?.bestStreak ?? 0, goal: 10 },
  { id: 'literature', name: '文学爱好者', icon: '📖', desc: '完成一局文学类问答（中国文学、世界文学或马华文学）', progress: (p) => played(p, LITERATURE_GAMES), goal: 1 },
  { id: 'streak5', name: '常胜将军', icon: '🏆', desc: '连续赢得 5 场游戏（单人练习不算）', progress: (p) => p.bestWinStreak ?? 0, goal: 5 },
  { id: 'detective', name: '推理大师', icon: '🔍', desc: '完成 10 场推理与解谜类游戏', progress: (p) => played(p, PUZZLE_GAMES), goal: 10 },
  { id: 'trio10', name: '三人同乐', icon: '🎲', desc: '完成 10 场三人联机游戏', progress: (p) => p.perMode?.trio?.played ?? 0, goal: 10 },
  { id: 'party3', name: '聚会达人', icon: '🎉', desc: '完成 3 场多人（4~8 人）游戏', progress: (p) => p.perMode?.party?.played ?? 0, goal: 3 },
  { id: 'solo5', name: '独自修行', icon: '🎯', desc: '完成 5 场单人游戏', progress: (p) => p.perMode?.solo?.played ?? 0, goal: 5 },
  { id: 'duo5', name: '最佳拍档', icon: '🤝', desc: '完成 5 场双人游戏', progress: (p) => p.perMode?.duo?.played ?? 0, goal: 5 },
  { id: 'veteran', name: '百战老将', icon: '🎖️', desc: '累计完成 50 场游戏', progress: (p) => p.played, goal: 50 },
  { id: 'allround', name: '全能玩家', icon: '🌟', desc: '玩过 10 种不同的游戏', progress: (p) => Object.values(p.perGame).filter((g) => g.played > 0).length, goal: 10 },
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** 检查并写入新解锁的成就，返回这次新解锁的列表。 */
export function unlockNew(p: Profile, now = Date.now()): AchievementDef[] {
  p.achievements ??= {};
  const fresh: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!p.achievements[a.id] && a.progress(p) >= a.goal) {
      p.achievements[a.id] = now;
      fresh.push(a);
    }
  }
  return fresh;
}

/** 发给客户端的成就列表（含进度） */
export function achievementView(p: Profile) {
  return ACHIEVEMENTS.map((a) => ({
    id: a.id,
    name: a.name,
    icon: a.icon,
    desc: a.desc,
    goal: a.goal,
    progress: Math.min(a.goal, a.progress(p)),
    unlockedAt: p.achievements?.[a.id] ?? null,
  }));
}
