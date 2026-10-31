import type { GameCtx, GameEngine } from './types.js';
import { UndercoverGame } from './undercover.js';
import { QuizGame } from './quiz.js';
import { TurtleSoupGame } from './turtlesoup.js';
import { DrawGame } from './draw.js';
import { CardsGame } from './cards.js';
import { WerewolfGame } from './werewolf.js';
import { DetectiveGame } from './detective.js';
import { MonopolyGame } from './monopoly.js';

const factories: Record<string, (ctx: GameCtx) => GameEngine> = {
  undercover: (c) => new UndercoverGame(c),
  quiz: (c) => new QuizGame(c),
  turtlesoup: (c) => new TurtleSoupGame(c),
  draw: (c) => new DrawGame(c),
  cards: (c) => new CardsGame(c),
  werewolf: (c) => new WerewolfGame(c),
  detective: (c) => new DetectiveGame(c),
  monopoly: (c) => new MonopolyGame(c),
};

/** 返回 null 表示该游戏尚未实现 */
export function createEngine(gameId: string, ctx: GameCtx): GameEngine | null {
  return factories[gameId]?.(ctx) ?? null;
}
