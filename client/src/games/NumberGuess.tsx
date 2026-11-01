import { useState } from 'react';
import { AwardList, nameOf, type GameProps } from './shared';

export default function NumberGuess({ room, view, act }: GameProps) {
  const [text, setText] = useState('');
  const myTurn = view.turnId === room.you;

  const submit = async () => {
    if (!/^\d{4}$/.test(text) || new Set(text).size !== 4) return;
    const err = await act({ type: 'guess', digits: text });
    if (!err) setText('');
  };

  return (
    <div>
      <h2>🔢 猜数字 <small>1A2B · 每人最多 {Math.max(...(Object.values(view.left) as number[]))} 次</small></h2>

      {view.over ? (
        <>
          <p className="question">
            {view.winnerId ? <>🏆 {nameOf(room, view.winnerId)} 猜中了！</> : '大家的次数都用完了，平局。'}
            答案是 <b>{view.secret}</b>
          </p>
          <AwardList room={room} />
        </>
      ) : (
        <>
          <p className="hint">
            密码是 4 个互不相同的数字。A = 数字和位置都对，B = 数字对位置不对。
          </p>
          {myTurn ? (
            <div className="chat-input">
              <input
                inputMode="numeric"
                maxLength={4}
                placeholder="输入 4 位不重复数字"
                value={text}
                onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
              <button className="btn small primary" onClick={submit}>猜</button>
            </div>
          ) : (
            <p className="hint">等待 {nameOf(room, view.turnId)} 猜……</p>
          )}
        </>
      )}

      <ul className="guess-log">
        {[...view.guesses].reverse().map((g: any, i: number) => (
          <li key={i} className={g.by === room.you ? 'mine' : ''}>
            <span>{nameOf(room, g.by)}</span>
            <b className="digits">{g.digits}</b>
            <span>{g.digits === '····' ? '超时，跳过' : g.a + 'A' + g.b + 'B'}</span>
          </li>
        ))}
        {view.guesses.length === 0 && <li className="hint">还没有人猜</li>}
      </ul>
    </div>
  );
}
