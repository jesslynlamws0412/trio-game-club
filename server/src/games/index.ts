import type { GameCtx, GameEngine } from './types.js';
import { UndercoverGame } from './undercover.js';
import { QuizGame } from './quiz.js';
import { TurtleSoupGame } from './turtlesoup.js';
import { DrawGame } from './draw.js';
import { CardsGame } from './cards.js';
import { WerewolfGame } from './werewolf.js';
import { DetectiveGame } from './detective.js';
import { MonopolyGame } from './monopoly.js';
import { PickGame } from './pick.js';
import { DiceGame } from './dice.js';
import { NumberGame } from './number.js';
import { MemoryGame } from './memory.js';
import { RpsGame } from './rps.js';
import { IdiomGame } from './idiom.js';
import { TruthGame } from './truth.js';
import { ReactionGame } from './reaction.js';
import { QUIZ_GAMES } from '../bank/games.js';

const factories: Record<string, (ctx: GameCtx) => GameEngine> = {
  undercover: (c) => new UndercoverGame(c),
  turtlesoup: (c) => new TurtleSoupGame(c),
  draw: (c) => new DrawGame(c),
  cards: (c) => new CardsGame(c),
  werewolf: (c) => new WerewolfGame(c),
  detective: (c) => new DetectiveGame(c),
  monopoly: (c) => new MonopolyGame(c),
  likely: (c) => new PickGame(c, 'likely'),
  tacit: (c) => new PickGame(c, 'tacit'),
  dice: (c) => new DiceGame(c),
  number: (c) => new NumberGame(c),
  memory: (c) => new MemoryGame(c),
  truefalse: (c) => new PickGame(c, 'truefalse'),
  rps: (c) => new RpsGame(c),
  idiom: (c) => new IdiomGame(c),
  truth: (c) => new TruthGame(c),
  reaction: (c) => new ReactionGame(c),
};

// 所有题库类游戏共用一个引擎，只是题库筛选条件不同
for (const cfg of QUIZ_GAMES) factories[cfg.id] = (c) => new QuizGame(c, cfg);

/** 返回 null 表示该游戏尚未实现 */
export function createEngine(gameId: string, ctx: GameCtx): GameEngine | null {
  return factories[gameId]?.(ctx) ?? null;
}
