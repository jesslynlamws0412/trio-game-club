import type { GameCtx, GameEngine, Result } from './types.js';
import { cleanText } from './util.js';
import { SOUP_BANK } from '../data/soupBank.js';

type Phase = 'pick' | 'play' | 'over';
const QUESTION_REPLIES = ['是', '不是', '无关', '是也不是'];
const GUESS_REPLIES = ['猜对', '没猜对'];

interface Entry {
  id: number;
  kind: 'q' | 'guess';
  by: string;
  text: string;
  reply: string | null;
}

/** 海龟汤：一人主持（每局轮换），其余两人推理。汤底只有主持人（和结束后的所有人）能看到。 */
export class TurtleSoupGame implements GameEngine {
  private ids: string[];
  private hostId: string;
  private phase: Phase = 'pick';
  private surface = '';
  private answer = '';
  private log: Entry[] = [];
  private nextId = 1;
  private solvedBy: string | null = null;

  constructor(ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    this.hostId = this.ids[ctx.rotation % this.ids.length];
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    const isHost = pid === this.hostId;
    switch (a?.type) {
      case 'choose': {
        if (!isHost) return { ok: false, error: '只有主持人可以选题' };
        if (this.phase !== 'pick') return { ok: false, error: '已经选过题了' };
        const p = SOUP_BANK.find((x) => x.id === a.puzzleId);
        if (!p) return { ok: false, error: '题目不存在' };
        this.surface = p.surface;
        this.answer = p.answer;
        this.phase = 'play';
        return { ok: true };
      }
      case 'custom': {
        if (!isHost) return { ok: false, error: '只有主持人可以出题' };
        if (this.phase !== 'pick') return { ok: false, error: '已经选过题了' };
        const surface = cleanText(a.surface, 300);
        const answer = cleanText(a.answer, 600);
        if (!surface || !answer) return { ok: false, error: '汤面（≤300 字）和汤底（≤600 字）都要填写' };
        this.surface = surface;
        this.answer = answer;
        this.phase = 'play';
        return { ok: true };
      }
      case 'ask':
      case 'guess': {
        if (isHost) return { ok: false, error: '主持人不能提问' };
        if (this.phase !== 'play') return { ok: false, error: '现在不能提问' };
        const text = cleanText(a.text, 120);
        if (!text) return { ok: false, error: '请输入 1~120 个字' };
        if (this.log.length >= 120) return { ok: false, error: '提问次数已用完，请主持人公布汤底' };
        const pending = this.log.filter((e) => e.by === pid && e.reply === null).length;
        if (pending >= 3) return { ok: false, error: '你还有 3 个问题没被回答，请先等主持人回答' };
        this.log.push({ id: this.nextId++, kind: a.type === 'ask' ? 'q' : 'guess', by: pid, text, reply: null });
        return { ok: true };
      }
      case 'reply': {
        if (!isHost) return { ok: false, error: '只有主持人可以回答' };
        if (this.phase !== 'play') return { ok: false, error: '现在不能回答' };
        const e = this.log.find((x) => x.id === a.entryId);
        if (!e) return { ok: false, error: '问题不存在' };
        if (e.reply !== null) return { ok: false, error: '这个问题已经回答过了' };
        const allowed = e.kind === 'q' ? QUESTION_REPLIES : GUESS_REPLIES;
        if (!allowed.includes(a.reply)) return { ok: false, error: '回答无效' };
        e.reply = a.reply;
        if (e.kind === 'guess' && a.reply === '猜对') {
          this.solvedBy = e.by;
          this.phase = 'over';
        }
        return { ok: true };
      }
      case 'reveal': {
        if (!isHost) return { ok: false, error: '只有主持人可以公布汤底' };
        if (this.phase !== 'play') return { ok: false, error: '现在不能公布' };
        this.phase = 'over';
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知操作' };
    }
  }

  viewFor(pid: string) {
    const isHost = pid === this.hostId;
    const over = this.phase === 'over';
    return {
      game: 'turtlesoup',
      phase: this.phase,
      hostId: this.hostId,
      surface: this.phase === 'pick' ? null : this.surface,
      // 汤底：主持人随时可见；其他人只在结束后可见
      answer: this.phase !== 'pick' && (isHost || over) ? this.answer : null,
      // 选题阶段主持人可以浏览题库（含汤底），其他人看不到
      bank:
        this.phase === 'pick' && isHost
          ? SOUP_BANK.map((p) => ({ id: p.id, title: p.title, surface: p.surface, answer: p.answer }))
          : null,
      log: this.log,
      solvedBy: this.solvedBy,
    };
  }

  isOver() {
    return this.phase === 'over';
  }

  scores(): Record<string, number> {
    const s: Record<string, number> = {};
    for (const id of this.ids) s[id] = 0;
    if (this.solvedBy) {
      s[this.solvedBy] = 3;
      s[this.hostId] = 1;
    }
    return s;
  }

  dispose() {}
}
