// 机器人对手：一个人也能体验三人游戏。
// 用法：node server/test/bots.mjs <undercover|quiz|turtlesoup>
// 机器人会创建房间并自动准备、投票选游戏、开始游戏，然后自动操作；你用浏览器加入它打印出的房间号并点“准备”即可。
import { io } from 'socket.io-client';

const game = process.argv[2] ?? 'quiz';
const URL = process.env.URL ?? 'http://localhost:3001';
const emit = (s, ev, data) => new Promise((res) => s.emit(ev, data, res));

function mk(name, avatar) {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.nick = name;
  s.avatar = avatar;
  s.state = null;
  s.busy = false;
  s.on('room:state', (v) => {
    s.state = v;
    setTimeout(() => play(s), 700 + Math.random() * 800);
  });
  return new Promise((r) => s.on('connect', () => r(s)));
}

const bots = [await mk('机器人甲', '🐼'), await mk('机器人乙', '🐸')];
const created = await emit(bots[0], 'room:create', { nickname: bots[0].nick, avatar: bots[0].avatar });
await emit(bots[1], 'room:join', { code: created.code, nickname: bots[1].nick, avatar: bots[1].avatar });
for (const b of bots) {
  await emit(b, 'room:ready', { ready: true });
  await emit(b, 'room:vote', { gameId: game });
}
console.log(`\n房间号：${created.code}\n请在浏览器打开 ${URL} ，输入这个房间号加入，点“准备”。机器人（房主）会在你准备后自动开始游戏。\n`);

const act = (s, a) => emit(s, 'game:action', a);

async function play(s) {
  const st = s.state;
  if (!st || s.busy) return;
  s.busy = true;
  try {
    if (st.phase === 'lobby') {
      const me = st.players.find((p) => p.id === st.you);
      if (!me.ready) await emit(s, 'room:ready', { ready: true });
      if (!me.vote) await emit(s, 'room:vote', { gameId: game });
      const isHost = st.hostId === st.you;
      if (isHost && st.players.length === 3 && st.players.every((p) => p.ready)) await emit(s, 'room:start');
      return;
    }
    const g = st.game;
    if (!g) return;
    if (st.gameOver) return; // 结束后由你点“结算并返回大厅”
    const others = st.players.filter((p) => p.id !== st.you);
    if (g.game === 'undercover') {
      if (g.phase === 'describe' && g.turnPlayerId === st.you) await act(s, { type: 'describe', text: '这是一个很常见的东西' });
      else if (g.phase === 'discuss') {
        if (!g.chat.some((m) => m.playerId === st.you)) await act(s, { type: 'chat', text: '我觉得有点可疑，大家怎么看？' });
        // 给真人 20 秒以上的讨论时间：机器人晚一点再申请投票
        if (g.discussEndsInMs < 60000 && !g.skipped.includes(st.you)) await act(s, { type: 'skip' });
      } else if (g.phase === 'vote' && !g.myVote) await act(s, { type: 'vote', target: others[Math.floor(Math.random() * 2)].id });
    } else if (g.game === 'quiz') {
      if (g.phase === 'question' && g.myChoice === null) {
        await new Promise((r) => setTimeout(r, 1500 + Math.random() * 4000));
        await act(s, { type: 'answer', index: g.index, choice: Math.floor(Math.random() * g.options.length) });
      }
    } else if (g.game === 'monopoly') {
      if (g.turnId === st.you) {
        if (g.phase === 'roll') await act(s, { type: 'roll' });
        else if (g.phase === 'buy') await act(s, { type: 'buy' });
        else if (g.phase === 'manage') await act(s, { type: 'end' });
      }
    } else if (g.game === 'werewolf') {
      const alive = st.players.filter((p) => g.alive.includes(p.id));
      const pick = (list) => list[Math.floor(Math.random() * list.length)].id;
      const others2 = alive.filter((p) => p.id !== st.you);
      if (g.phase === 'night' && !g.myNightDone) {
        if (g.myRole === 'wolf') await act(s, g.day === 1 ? { type: 'night' } : { type: 'night', target: pick(others2) });
        else if (g.myRole === 'seer') await act(s, { type: 'night', target: pick(others2) });
        else await act(s, { type: 'night', target: pick(alive.filter((p) => p.id !== g.lastGuard)) });
      } else if (g.phase === 'speak' && g.speakerId === st.you) await act(s, { type: 'speak', text: '我是好人，大家相信我。' });
      else if (g.phase === 'vote' && !g.myVote && g.alive.includes(st.you)) await act(s, { type: 'vote', target: pick(others2) });
    } else if (g.game === 'detective') {
      if (g.phase === 'setup' && g.hostId === st.you) await act(s, { type: 'mode', mode: 'coop' });
      else if (g.phase === 'search' && g.ap[st.you] > 0) {
        const loc = g.locations.find((l) => l.left > 0);
        if (loc) await act(s, { type: 'search', location: loc.id });
        else await act(s, { type: 'done' });
      } else if (g.phase === 'accuse' && !g.myAnswer) {
        await act(s, { type: 'accuse', suspect: g.case.suspects[0].id, motive: g.case.motives[0].id });
      }
    } else if (g.game === 'cards') {
      if (g.phase === 'draw' && g.drawerId === st.you) await act(s, { type: 'draw' });
      for (const j of g.judgements) {
        if (!j.resolved && j.subjectId !== st.you && j.myVote === null) await act(s, { type: 'judge', judgementId: j.id, vote: true });
      }
    } else if (g.game === 'draw') {
      if (g.phase === 'drawing' && g.drawerId === st.you && !s.drewRound?.has(g.round)) {
        (s.drewRound ??= new Set()).add(g.round);
        console.log(`[${s.nick}] 我是画家，题目是：${g.word}（请在浏览器里输入这个答案）`);
        // 画一个圆，分 12 次逐步发送，模拟实时作画
        const id = `bot-${Date.now()}`;
        for (let i = 0; i < 12; i++) {
          const pts = [];
          for (let k = 0; k < 4; k++) {
            const a = ((i * 4 + k) / 48) * Math.PI * 2;
            pts.push([500 + Math.round(260 * Math.cos(a)), 375 + Math.round(260 * Math.sin(a))]);
          }
          await act(s, { type: 'stroke', id, color: '#7a1f2b', size: 10, points: pts });
          await new Promise((r) => setTimeout(r, 400));
        }
      } else if (g.phase === 'drawing' && g.drawerId !== st.you && !s.guessedRound?.has(g.round)) {
        (s.guessedRound ??= new Set()).add(g.round);
        await new Promise((r) => setTimeout(r, 3000));
        await act(s, { type: 'guess', text: '不知道' });
      }
    } else if (g.game === 'turtlesoup') {
      if (g.phase === 'pick' && g.hostId === st.you) await act(s, { type: 'choose', puzzleId: 's1' });
      else if (g.phase === 'play' && g.hostId === st.you) {
        for (const e of g.log.filter((x) => x.reply === null)) {
          await act(s, { type: 'reply', entryId: e.id, reply: e.kind === 'q' ? '是' : '没猜对' });
        }
      } else if (g.phase === 'play' && g.hostId !== st.you && g.log.filter((e) => e.by === st.you).length < 2) {
        await act(s, { type: 'ask', text: '他是在海边吗？' });
      }
    }
  } finally {
    s.busy = false;
  }
}
