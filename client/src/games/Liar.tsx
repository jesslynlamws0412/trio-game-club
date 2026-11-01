import { useState } from 'react';
import { AwardList, nameOf, useCountdown, type GameProps } from './shared';

export default function Liar({ room, view, act }: GameProps) {
  const [text, setText] = useState('');
  const left = useCountdown(view.endsInMs ?? 0, view);

  if (view.phase === 'over') {
    return (
      <div>
        <h2>🤥 谁是说谎者 · 最终排名</h2>
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

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    const err = await act({ type: 'lie', text: t });
    if (!err) setText('');
  };

  return (
    <div>
      <h2>🤥 谁是说谎者 <small>第 {view.round + 1} / {view.total} 回合</small></h2>
      {view.phase !== 'reveal' && <div className="timer">{left}</div>}
      <p className="question">{view.question}</p>

      {view.phase === 'write' && (
        <>
          {view.myLie ? (
            <p className="hint">你编的谎话：<b>{view.myLie}</b>，等待其他人……（已提交 {view.written.length} / {room.players.length}）</p>
          ) : (
            <>
              <p className="hint">编一个看起来像真的答案，骗过别人（不能直接写出真答案）。</p>
              <div className="chat-input">
                <input value={text} maxLength={12} placeholder="你的“谎话”答案" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
                <button className="btn small primary" onClick={submit}>提交</button>
              </div>
            </>
          )}
        </>
      )}

      {view.phase !== 'write' && view.options && (
        <>
          <div className="options">
            {view.options.map((o: any) => {
              const reveal = view.phase === 'reveal';
              let cls = 'btn opt';
              if (reveal && o.real) cls += ' right';
              else if (view.myVote === o.id) cls += reveal ? ' wrong' : ' chosen';
              const voters = reveal ? room.players.filter((p) => view.votes?.[p.id] === o.id) : [];
              return (
                <button key={o.id} className={cls} disabled={reveal || view.myVote !== null || o.mine} onClick={() => act({ type: 'vote', option: o.id })}>
                  {o.text}
                  {o.mine && !reveal && '（你编的）'}
                  {reveal && (
                    <span className="pickers">
                      {o.real ? '✅ 真答案 ' : `🤥 ${o.authors.map((a: string) => nameOf(room, a)).join('、')} 编的 `}
                      {voters.map((p) => p.avatar).join('')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {view.phase === 'vote' && (
            <p className="hint">{view.myVote !== null ? '已投票，等待其他人……' : '选出你认为是真答案的那个（不能选自己编的）'}（已投 {view.voted.length} / {room.players.length}）</p>
          )}
        </>
      )}

      {view.phase === 'reveal' && (
        <>
          <p className="hint">{view.note}</p>
          <ul className="awards">
            {room.players.map((p) => (
              <li key={p.id}>
                <span>{p.avatar} {p.nickname}</span>
                <b>{view.gains[p.id] > 0 ? `+${view.gains[p.id]}` : '+0'}　合计 {view.points[p.id]}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
