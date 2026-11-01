import { useEffect, useRef } from 'react';
import { sfx } from './audio';
import type { RoomView } from './types';

interface Snap {
  phase: string;
  gameOver: boolean;
  sec: number;
  key: string;
  count: number;
  dice: string;
}

/** 根据房间状态的变化播放音效：倒计时、开始、对错、骰子、翻牌、落子、胜负…… */
export function useGameSounds(room: RoomView) {
  const prev = useRef<Snap | null>(null);

  useEffect(() => {
    const g: any = room.game;
    const you = room.you;
    const p = prev.current;
    const sec = Math.ceil((room.countdownMs ?? 0) / 1000);

    // 取一些随游戏变化的“特征”，和上一次比较
    let key = '';
    let count = 0;
    let dice = '';
    if (g) {
      key = `${g.index ?? g.round ?? g.turn ?? ''}-${g.phase ?? ''}`;
      if (g.game === 'memory') count = g.cards.filter((c: unknown) => c !== null).length;
      if (g.game === 'tictactoe' || g.game === 'gomoku') count = g.cells.filter((c: number) => c >= 0).length;
      if (g.game === 'number') count = g.guesses.length;
      if (g.game === 'idiom') count = g.chain.length;
      if (g.game === 'taboo') count = g.fouls;
      if (g.game === 'dice') dice = (g.myDice ?? []).join('');
    }

    if (room.phase === 'countdown' && p?.sec !== sec && sec > 0) sfx.tick();
    if (p && p.phase !== 'playing' && room.phase === 'playing') sfx.start();

    if (p && !p.gameOver && room.gameOver) {
      const mine = room.awards?.[you] ?? 0;
      const best = Math.max(0, ...Object.values(room.awards ?? {}));
      if (mine > 0 && mine >= best) sfx.win();
      else sfx.lose();
    } else if (p && room.phase === 'playing' && g && key !== p.key) {
      const revealing = g.phase === 'reveal';
      switch (g.game) {
        case 'quiz':
          if (revealing) g.correct?.[you] ? sfx.correct() : sfx.wrong();
          break;
        case 'truefalse':
          if (revealing) (g.gains?.[you] ?? 0) > 0 ? sfx.correct() : sfx.wrong();
          break;
        case 'likely':
        case 'tacit':
          if (revealing) (g.gains?.[you] ?? 0) > 0 ? sfx.coin() : sfx.pop();
          break;
        case 'rps':
          if (revealing) sfx.pop();
          break;
        case 'reaction':
          if (g.phase === 'go') sfx.go();
          else if (revealing) sfx.pop();
          break;
        case 'dice':
          if (revealing) sfx.dice();
          break;
        case 'taboo':
          if (revealing) g.solvedBy ? sfx.correct() : sfx.wrong();
          break;
        default:
      }
    } else if (p && room.phase === 'playing' && g && count !== p.count) {
      switch (g.game) {
        case 'memory':
          count > p.count ? sfx.flip() : sfx.pop();
          break;
        case 'tictactoe':
        case 'gomoku':
        case 'number':
          sfx.pop();
          break;
        case 'idiom':
          count > p.count ? sfx.correct() : sfx.pop();
          break;
        case 'taboo':
          if (count > p.count) sfx.wrong();
          break;
        default:
      }
    } else if (p && room.phase === 'playing' && g?.game === 'dice' && dice !== p.dice && dice) {
      sfx.dice();
    }

    prev.current = { phase: room.phase, gameOver: room.gameOver, sec, key, count, dice };
  }, [room]);
}
