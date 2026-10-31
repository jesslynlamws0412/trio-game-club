import type { GameCtx, GameEngine, Result } from './types.js';
import { cleanText } from './util.js';
import { CASES, type CaseFile } from '../data/cases.js';

const ROUNDS = 3;
const AP = 2; // 每轮每人的搜证次数
type Phase = 'setup' | 'search' | 'accuse' | 'over';
type Mode = 'coop' | 'versus';

interface Found {
  clueId: string;
  text: string;
  locationId: string;
  by: string;
  shared: boolean; // 合作模式下恒为 true
}

/**
 * 谁是侦探：三人调查同一案件。
 * 合作模式：搜到的线索全员共享，最后共同得出一个答案（各自提交，按多数决定）。
 * 竞争模式：搜到的线索是自己的私有情报，可选择公开；各自提交凶手与动机。
 */
export class DetectiveGame implements GameEngine {
  private ids: string[];
  private hostId: string;
  private c: CaseFile;
  private phase: Phase = 'setup';
  private mode: Mode = 'coop';
  private round = 1;
  private ap: Record<string, number> = {};
  private cursor: Record<string, number> = {}; // 每个地点已搜出几条
  private found: Found[] = [];
  private chat: { playerId: string; text: string }[] = [];
  private answers = new Map<string, { suspect: string; motive: string; order: number }>();
  private result: null | {
    teamAnswer: { suspect: string; motive: string } | null;
    points: Record<string, number>;
  } = null;

  constructor(ctx: GameCtx) {
    this.ids = ctx.players.map((p) => p.id);
    this.hostId = this.ids[ctx.rotation % this.ids.length];
    this.c = CASES[ctx.rotation % CASES.length];
    for (const l of this.c.locations) this.cursor[l.id] = 0;
  }

  private cluesLeft() {
    return this.c.locations.reduce((n, l) => n + l.clues.length - this.cursor[l.id], 0);
  }

  handleAction(pid: string, a: any): Result {
    if (!this.ids.includes(pid)) return { ok: false, error: '你不在本局游戏中' };
    switch (a?.type) {
      case 'mode': {
        if (pid !== this.hostId) return { ok: false, error: '只有本局组长可以选择模式' };
        if (this.phase !== 'setup') return { ok: false, error: '模式已经选好了' };
        if (a.mode !== 'coop' && a.mode !== 'versus') return { ok: false, error: '模式无效' };
        this.mode = a.mode;
        this.phase = 'search';
        this.startRound();
        return { ok: true };
      }
      case 'chat': {
        if (this.phase === 'setup' || this.phase === 'over') return { ok: false, error: '现在不能发言' };
        const text = cleanText(a.text, 120);
        if (!text) return { ok: false, error: '请输入 1~120 个字' };
        this.chat.push({ playerId: pid, text });
        if (this.chat.length > 100) this.chat.shift();
        return { ok: true };
      }
      case 'search': {
        if (this.phase !== 'search') return { ok: false, error: '现在不是搜证阶段' };
        if (this.ap[pid] <= 0) return { ok: false, error: '你本轮的搜证次数用完了' };
        const loc = this.c.locations.find((l) => l.id === a.location);
        if (!loc) return { ok: false, error: '没有这个地点' };
        const i = this.cursor[loc.id];
        if (i >= loc.clues.length) return { ok: false, error: '这个地点已经搜不出更多线索了' };
        const clue = loc.clues[i];
        this.cursor[loc.id]++;
        this.ap[pid]--;
        this.found.push({ clueId: clue.id, text: clue.text, locationId: loc.id, by: pid, shared: this.mode === 'coop' });
        this.maybeNextRound();
        return { ok: true };
      }
      case 'share': {
        if (this.mode !== 'versus') return { ok: false, error: '合作模式下线索自动共享' };
        const f = this.found.find((x) => x.clueId === a.clueId);
        if (!f || f.by !== pid) return { ok: false, error: '这不是你搜到的线索' };
        if (this.phase === 'setup' || this.phase === 'over') return { ok: false, error: '现在不能公开线索' };
        f.shared = true;
        return { ok: true };
      }
      case 'done': {
        if (this.phase !== 'search') return { ok: false, error: '现在不是搜证阶段' };
        this.ap[pid] = 0;
        this.maybeNextRound();
        return { ok: true };
      }
      case 'accuse': {
        if (this.phase !== 'accuse') return { ok: false, error: '搜证还没有结束' };
        if (this.answers.has(pid)) return { ok: false, error: '你已经提交过答案了' };
        if (!this.c.suspects.some((s) => s.id === a.suspect)) return { ok: false, error: '请选择嫌疑人' };
        if (!this.c.motives.some((m) => m.id === a.motive)) return { ok: false, error: '请选择动机' };
        this.answers.set(pid, { suspect: a.suspect, motive: a.motive, order: this.answers.size });
        if (this.answers.size === this.ids.length) this.settle();
        return { ok: true };
      }
      default:
        return { ok: false, error: '未知操作' };
    }
  }

  private startRound() {
    for (const id of this.ids) this.ap[id] = AP;
    // 如果线索已经全部搜完，直接进入下一阶段
    if (this.cluesLeft() === 0) this.maybeNextRound(true);
  }

  private maybeNextRound(force = false) {
    const exhausted = this.cluesLeft() === 0;
    if (!force && !exhausted && this.ids.some((id) => this.ap[id] > 0)) return;
    if (this.round >= ROUNDS || exhausted) {
      this.phase = 'accuse';
      for (const id of this.ids) this.ap[id] = 0;
    } else {
      this.round++;
      this.startRound();
    }
  }

  private majority(values: string[]): string {
    const tally = new Map<string, number>();
    for (const v of values) tally.set(v, (tally.get(v) ?? 0) + 1);
    const max = Math.max(...tally.values());
    const top = [...tally.entries()].filter(([, n]) => n === max).map(([v]) => v);
    return top.length === 1 ? top[0] : values[0]; // 平票时以第一个提交的人为准
  }

  private settle() {
    const points: Record<string, number> = {};
    for (const id of this.ids) points[id] = 0;
    let teamAnswer: { suspect: string; motive: string } | null = null;
    if (this.mode === 'coop') {
      const byOrder = [...this.answers.values()].sort((x, y) => x.order - y.order);
      teamAnswer = {
        suspect: this.majority(byOrder.map((x) => x.suspect)),
        motive: this.majority(byOrder.map((x) => x.motive)),
      };
      const good = teamAnswer.suspect === this.c.culprit;
      for (const id of this.ids) {
        if (good) points[id] += 4;
        if (good && teamAnswer.motive === this.c.motive) points[id] += 2;
      }
    } else {
      let bonusGiven = false;
      const byOrder = [...this.answers.entries()].sort((x, y) => x[1].order - y[1].order);
      for (const [id, ans] of byOrder) {
        if (ans.suspect === this.c.culprit) {
          points[id] += 4;
          if (ans.motive === this.c.motive) points[id] += 2;
          if (!bonusGiven) {
            points[id] += 1; // 最先提交正确凶手的人额外 +1
            bonusGiven = true;
          }
        }
      }
    }
    this.result = { teamAnswer, points };
    this.phase = 'over';
  }

  viewFor(pid: string) {
    const over = this.phase === 'over';
    const visible = this.found.filter((f) => f.shared || f.by === pid);
    return {
      game: 'detective',
      phase: this.phase,
      mode: this.phase === 'setup' ? null : this.mode,
      hostId: this.hostId,
      round: this.round,
      totalRounds: ROUNDS,
      ap: this.ap,
      case: { title: this.c.title, intro: this.c.intro, suspects: this.c.suspects, motives: this.c.motives },
      locations: this.c.locations.map((l) => ({ id: l.id, name: l.name, left: l.clues.length - this.cursor[l.id] })),
      // 竞争模式下：别人未公开的线索不会出现在这里
      clues: visible.map((f) => ({ id: f.clueId, text: f.text, locationId: f.locationId, by: f.by, shared: f.shared })),
      privateCount: this.found.filter((f) => !f.shared).length,
      chat: this.chat,
      submitted: [...this.answers.keys()],
      myAnswer: this.answers.get(pid) ?? null,
      result: over
        ? {
            culprit: this.c.culprit,
            motive: this.c.motive,
            solution: this.c.solution,
            teamAnswer: this.result?.teamAnswer ?? null,
            answers: Object.fromEntries([...this.answers.entries()]),
            points: this.result?.points ?? {},
            allClues: this.c.locations.flatMap((l) => l.clues.map((c) => ({ id: c.id, text: c.text, locationId: l.id }))),
          }
        : null,
    };
  }

  isOver() {
    return this.phase === 'over';
  }

  scores(): Record<string, number> {
    return { ...(this.result?.points ?? {}) };
  }

  dispose() {}
}
