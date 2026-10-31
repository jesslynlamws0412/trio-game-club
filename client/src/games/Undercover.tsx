import { useState } from 'react';
import { AwardList, ChatBox, nameOf, useCountdown, type GameProps } from './shared';

export default function Undercover({ room, view, act }: GameProps) {
  const [text, setText] = useState('');
  const left = useCountdown(view.discussEndsInMs, view);
  const me = room.you;
  const myTurn = view.turnPlayerId === me;

  const describe = async () => {
    const err = await act({ type: 'describe', text });
    if (!err) setText('');
  };

  return (
    <div>
      <h2>🕵️ 谁是卧底 <small>第 {view.round} 轮</small></h2>
      <div className="word-card">
        <div className="label">你的词语</div>
        <div className="word">{view.myWord}</div>
        <div className="hint">你可能是平民，也可能是卧底——听别人的描述来判断。</div>
      </div>

      {view.descriptions.length > 0 && (
        <ul className="desc-list">
          {view.descriptions.map((d: any, i: number) => (
            <li key={i}><span className="rd">第{d.round}轮</span> <b>{nameOf(room, d.playerId)}</b>：{d.text}</li>
          ))}
        </ul>
      )}

      {view.phase === 'describe' && (
        <div className="panel">
          <p>
            发言顺序：{view.order.map((id: string) => nameOf(room, id)).join(' → ')}
          </p>
          {myTurn ? (
            <>
              <p className="turn">轮到你了！用一句话描述你的词（不能直接说出词语）。</p>
              <div className="chat-input">
                <input value={text} maxLength={40} placeholder="例如：冬天喝起来很暖" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && describe()} />
                <button className="btn small primary" onClick={describe}>提交</button>
              </div>
            </>
          ) : (
            <p className="hint">等待 {nameOf(room, view.turnPlayerId)} 描述……</p>
          )}
        </div>
      )}

      {view.phase === 'discuss' && (
        <div className="panel">
          <p className="turn">自由讨论 · 剩余 {left} 秒</p>
          <ChatBox room={room} messages={view.chat} onSend={(t) => act({ type: 'chat', text: t })} />
          <button
            className="btn small ghost"
            disabled={view.skipped.includes(me)}
            onClick={() => act({ type: 'skip' })}
          >
            {view.skipped.includes(me) ? `已申请投票（${view.skipped.length}/3）` : '我说完了，进入投票'}
          </button>
        </div>
      )}

      {view.phase === 'vote' && (
        <div className="panel">
          <p className="turn">投票：你认为谁是卧底？</p>
          <div className="vote-grid">
            {room.players.filter((p) => p.id !== me).map((p) => (
              <button
                key={p.id}
                className={'btn ' + (view.myVote === p.id ? 'gold' : 'green')}
                disabled={!!view.myVote}
                onClick={() => act({ type: 'vote', target: p.id })}
              >
                {p.avatar} {p.nickname}
              </button>
            ))}
          </div>
          <p className="hint">已投票：{view.voted.length} / 3 {view.myVote && '（你已投票，等待其他人）'}</p>
        </div>
      )}

      {view.voteHistory.length > 0 && (
        <div className="panel">
          {view.voteHistory.map((h: any) => (
            <p key={h.round}>
              第 {h.round} 轮投票：
              {Object.entries(h.votes).map(([from, to]) => `${nameOf(room, from)}→${nameOf(room, to as string)}`).join('，')}
              ；{h.outId ? `${nameOf(room, h.outId)} 得票最多` : '平票'}
            </p>
          ))}
        </div>
      )}

      {view.result && (
        <div className="panel result">
          <h3>{view.result.winner === 'civilians' ? '🎉 平民获胜！' : '😈 卧底获胜！'}</h3>
          <p>卧底是 <b>{nameOf(room, view.result.undercoverId)}</b></p>
          <p>平民的词：<b>{view.result.civWord}</b>　卧底的词：<b>{view.result.undWord}</b></p>
          <AwardList room={room} />
        </div>
      )}
    </div>
  );
}
