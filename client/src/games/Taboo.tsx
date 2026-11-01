import { useState } from 'react';
import { AwardList, nameOf, useCountdown, type GameProps } from './shared';

export default function Taboo({ room, view, act }: GameProps) {
  const [text, setText] = useState('');
  const left = useCountdown(view.endsInMs ?? 0, view);

  if (view.phase === 'over') {
    return (
      <div>
        <h2>🚫 禁忌词挑战 · 最终排名</h2>
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

  const me = view.describerId === room.you;
  const revealing = view.phase === 'reveal';
  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    const err = await act({ type: me ? 'hint' : 'guess', text: t });
    if (!err) setText('');
  };

  return (
    <div>
      <h2>🚫 禁忌词挑战 <small>第 {view.round + 1} / {view.total} 回合</small></h2>
      {!revealing && <div className="timer">{left}</div>}
      <p className="question">
        描述者：<b>{nameOf(room, view.describerId)}</b>
        {me && !revealing && <>　你的词语：<b className="taboo-word">{view.word}</b></>}
      </p>
      {me && !revealing && (
        <p className="hint">
          禁忌词：{view.banned.map((b: string) => <span key={b} className="taboo-ban">{b}</span>)}
          违规 {view.fouls} / {view.maxFouls}（描述里不能出现词语本身或禁忌词）
        </p>
      )}
      {!me && !revealing && <p className="hint">词语一共 {view.wordLen} 个字。根据描述者的提示，输入你的答案。</p>}
      {revealing && (
        <p className="answer-box">
          答案：<b>{view.word}</b>　禁忌词：{view.banned?.join('、')}
          <br />
          {view.solvedBy ? `🎉 ${nameOf(room, view.solvedBy)} 猜对了！` : '这个回合没有人猜对。'}
        </p>
      )}

      <ul className="chat-log">
        {view.log.length === 0 && <li className="hint">还没有人发言</li>}
        {view.log.map((e: any, i: number) => (
          <li key={i} className={e.by === room.you ? 'mine' : ''}>
            <b>{nameOf(room, e.by)}</b>
            {e.kind === 'hint' && <>（描述）：{e.text}</>}
            {e.kind === 'guess' && <>（猜）：{e.text}</>}
            {e.kind === 'foul' && <> 说了禁忌词，被扣 1 分！</>}
          </li>
        ))}
      </ul>

      {!revealing && (
        <div className="chat-input">
          <input
            value={text}
            maxLength={me ? 40 : 20}
            placeholder={me ? '用文字描述这个词（不能含禁忌词）' : '输入你猜的词语'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <button className="btn small primary" onClick={submit}>{me ? '发送' : '猜'}</button>
          {me && <button className="btn small ghost" onClick={() => confirm('换一个词要扣 1 分，确定吗？') && act({ type: 'swap' })}>换词 -1</button>}
        </div>
      )}

      <ul className="awards">
        {room.players.map((p) => (
          <li key={p.id}>
            <span>{p.avatar} {p.nickname}{view.describerId === p.id ? ' 🗣️' : ''}</span>
            <b>{view.points[p.id]} 分</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
