import { AwardList, nameOf, useCountdown, type GameProps } from './shared';

export default function Quiz({ room, view, act }: GameProps) {
  const left = useCountdown(view.endsInMs ?? 0, view);

  if (view.phase === 'over') {
    return (
      <div>
        <h2>📚 答题竞赛 · 最终排名</h2>
        <ol className="rank">
          {view.ranking.map((r: any) => (
            <li key={r.id}>
              <span className="medal">{['🥇', '🥈', '🥉'][r.rank - 1]}</span>
              <span>{nameOf(room, r.id)}</span>
              <span className="score">{r.points} 分</span>
            </li>
          ))}
        </ol>
        <p className="hint">名次奖励（第一 +3 / 第二 +2 / 第三 +1）：</p>
        <AwardList room={room} />
      </div>
    );
  }

  const revealing = view.phase === 'reveal';
  const answered = view.myChoice !== null;

  return (
    <div>
      <h2>
        📚 答题竞赛 <small>第 {view.index + 1} / {view.total} 题 · {view.category}</small>
      </h2>
      {!revealing && <div className="timer">{left}</div>}
      <p className="question">{view.question}</p>
      <div className="options">
        {view.options.map((o: string, i: number) => {
          let cls = 'btn opt';
          if (revealing) {
            if (i === view.answer) cls += ' right';
            else if (i === view.myChoice) cls += ' wrong';
          } else if (view.myChoice === i) cls += ' chosen';
          return (
            <button key={i} className={cls} disabled={answered || revealing} onClick={() => act({ type: 'answer', index: view.index, choice: i })}>
              {view.options.length === 4 ? 'ABCD'[i] + '. ' : ''}{o}
              {revealing && (
                <span className="pickers">
                  {room.players.filter((p) => view.choices[p.id] === i).map((p) => p.avatar).join('')}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {!revealing && (
        <p className="hint">
          {answered ? '已提交，等待其他人……' : '越快答对，加分越多'}（已作答 {view.answered.length} / 3）
        </p>
      )}
      {revealing && (
        <ul className="awards">
          {room.players.map((p) => (
            <li key={p.id}>
              <span>{p.avatar} {p.nickname}</span>
              <b>{view.gains[p.id] > 0 ? `+${view.gains[p.id]}` : '答错/未答'}　合计 {view.points[p.id]}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
