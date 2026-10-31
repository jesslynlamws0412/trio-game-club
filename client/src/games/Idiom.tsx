import { useState } from 'react';
import { AwardList, nameOf, useCountdown, type GameProps } from './shared';

export default function Idiom({ room, view, act }: GameProps) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const left = useCountdown(view.endsInMs ?? 0, view);
  const myTurn = view.turnId === room.you;

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    const e = await act({ type: 'say', text: t });
    setErr(e ?? '');
    if (!e) setText('');
  };

  if (view.phase === 'over') {
    return (
      <div>
        <h2>🐉 成语接龙 · 结束</h2>
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

  const event = view.lastEvent as string;
  return (
    <div>
      <h2>🐉 成语接龙</h2>
      <div className="timer">{left}</div>
      <p className="question">
        当前成语：<b>{view.current}</b>
        <br />
        请接以“<b>{view.need}</b>”开头的成语
      </p>
      {event.startsWith('timeout:') && <p className="hint">⏰ {nameOf(room, event.slice(8))} 超时，扣 1 条命</p>}
      {event.startsWith('deadend:') && <p className="hint">🎉 {nameOf(room, event.slice(8))} 接完后无成语可接，额外 +2 分，换新的开头</p>}
      {myTurn ? (
        <div className="chat-input">
          <input
            maxLength={4}
            placeholder="输入四字成语"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <button className="btn small primary" onClick={submit}>接龙</button>
        </div>
      ) : (
        <p className="hint">等待 {nameOf(room, view.turnId)} 接龙……</p>
      )}
      {err && <p className="error">{err}</p>}
      <ul className="awards">
        {room.players.map((p) => (
          <li key={p.id}>
            <span>{p.avatar} {p.nickname}{view.turnId === p.id ? ' 👈' : ''}</span>
            <b>{view.out.includes(p.id) ? '已出局' : '❤'.repeat(view.lives[p.id])}　{view.points[p.id]} 分</b>
          </li>
        ))}
      </ul>
      <p className="hint">最近的接龙：{view.chain.map((c: any) => c.idiom).join(' → ')}</p>
    </div>
  );
}
