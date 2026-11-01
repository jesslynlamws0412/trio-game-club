import { AwardList, nameOf, useCountdown, type GameProps } from './shared';

const rm = (n: number) => 'RM ' + n.toLocaleString('en-US');

export default function Millionaire({ room, view, act }: GameProps) {
  const left = useCountdown(view.endsInMs ?? 0, view);

  if (view.phase === 'over') {
    return (
      <div>
        <h2>💰 百万富翁 · 最终奖金</h2>
        <ol className="rank">
          {view.ranking.map((r: any) => (
            <li key={r.id}>
              <span className="medal">{['🥇', '🥈', '🥉'][r.rank - 1]}</span>
              <span>{nameOf(room, r.id)}</span>
              <span className="score">{rm(r.points)}</span>
            </li>
          ))}
        </ol>
        <p className="hint">名次奖励（第一 +3 / 第二 +2 / 第三 +1）：</p>
        <AwardList room={room} />
      </div>
    );
  }

  const me = view.contestantId === room.you;
  const result = view.result;
  const asking = view.phase === 'ask';
  const L = view.lifelines;

  return (
    <div>
      <h2>💰 百万富翁 <small>第 {view.contestantIndex + 1} / {view.order.length} 位参赛者</small></h2>
      <p className="question">
        参赛者：<b>{nameOf(room, view.contestantId)}</b>　已赢 <b>{rm(view.level === 0 ? 0 : view.ladder[view.level - 1])}</b>　保底 {rm(view.guaranteed)}
      </p>
      <div className="mil-ladder">
        {view.ladder.map((v: number, i: number) => (
          <span key={i} className={'mil-step' + (i === view.level ? ' now' : '') + (i < view.level ? ' done' : '') + (view.safe.includes(i) ? ' safe' : '')}>
            {i + 1}. {rm(v)}
          </span>
        ))}
      </div>
      {asking && <div className="timer">{left}</div>}
      <p className="hint">第 {view.level + 1} 题 · {view.category} · {view.difficultyName}</p>
      {view.image && <div className="q-image">{view.image}</div>}
      <p className="question">{view.question}</p>
      <div className="options">
        {view.options.map((o: string, i: number) => {
          let cls = 'btn opt';
          if (result) {
            if (i === result.answer) cls += ' right';
            else if (i === result.picked) cls += ' wrong';
          }
          const gone = view.removed.includes(i);
          return (
            <button key={i} className={cls} disabled={!asking || !me || gone} style={gone ? { opacity: 0.3 } : undefined} onClick={() => act({ type: 'answer', choice: i })}>
              {'ABCD'[i]}. {gone ? '——' : o}
              {view.audience && !gone && <span className="pickers">{view.audience[i]}%</span>}
            </button>
          );
        })}
      </div>
      {asking && me && (
        <div className="actions row">
          <button className="btn small gold" disabled={!L.fifty} onClick={() => act({ type: 'lifeline', kind: 'fifty' })}>50:50</button>
          <button className="btn small gold" disabled={!L.audience} onClick={() => act({ type: 'lifeline', kind: 'audience' })}>问观众</button>
          <button className="btn small gold" disabled={!L.swap} onClick={() => act({ type: 'lifeline', kind: 'swap' })}>换题</button>
          <button className="btn small ghost" onClick={() => confirm('放弃并带走当前奖金？') && act({ type: 'quit' })}>放弃</button>
        </div>
      )}
      {asking && !me && <p className="hint">现在由 {nameOf(room, view.contestantId)} 答题，你是观众，可以在旁边出主意。</p>}
      {result && (
        <p className="answer-box">
          {result.ended
            ? result.reason === 'win' ? '🎉 通关！百万富翁诞生！' : result.reason === 'wrong' ? '❌ 答错了' : result.reason === 'timeout' ? '⏰ 超时，按放弃结算' : '🏁 放弃了'
            : '✅ 答对了！'}
          　{result.ended ? `最终带走 ${rm(result.won)}` : `当前奖金 ${rm(result.won)}`}
          <br />
          <span className="hint">正确答案：{'ABCD'[result.answer]}。{result.explain}</span>
        </p>
      )}
      <ul className="awards">
        {room.players.map((p) => (
          <li key={p.id}>
            <span>{p.avatar} {p.nickname}{view.contestantId === p.id ? ' 🎤' : ''}</span>
            <b>{rm(view.money[p.id])}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
