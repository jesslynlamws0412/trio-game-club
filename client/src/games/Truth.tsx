import { AwardList, nameOf, type GameProps } from './shared';

export default function Truth({ room, view, act }: GameProps) {
  if (view.phase === 'over') {
    return (
      <div>
        <h2>💬 真心话大冒险 · 结束</h2>
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

  const mine = view.playerId === room.you;
  return (
    <div>
      <h2>💬 真心话大冒险 <small>第 {view.turn + 1} / {view.total} 回合</small></h2>
      <p className="question">轮到 <b>{nameOf(room, view.playerId)}</b></p>

      {view.phase === 'choose' &&
        (mine ? (
          <div className="actions row">
            <button className="btn primary" onClick={() => act({ type: 'choose', kind: 'truth' })}>真心话</button>
            <button className="btn green" onClick={() => act({ type: 'choose', kind: 'dare' })}>大冒险</button>
            <button className="btn ghost" onClick={() => act({ type: 'choose', kind: 'skip' })}>跳过</button>
          </div>
        ) : (
          <p className="hint">等待 {nameOf(room, view.playerId)} 选择……</p>
        ))}

      {view.phase === 'judge' && (
        <>
          <p className="question">{view.kind === 'truth' ? '🗣️ 真心话：' : '🎯 大冒险：'}{view.prompt}</p>
          {mine ? (
            <p className="hint">请回答 / 完成，然后等大家投票（完成 +{view.reward} 分）。</p>
          ) : view.myVote === null ? (
            <div className="actions row">
              <button className="btn green" onClick={() => act({ type: 'judge', done: true })}>完成了 👍</button>
              <button className="btn ghost" onClick={() => act({ type: 'judge', done: false })}>没完成 👎</button>
            </div>
          ) : (
            <p className="hint">已投票，等待其他人……</p>
          )}
          <p className="hint">已投票 {view.voted.length} / {room.players.length - 1}</p>
        </>
      )}

      <ul className="awards">
        {room.players.map((p) => (
          <li key={p.id}>
            <span>{p.avatar} {p.nickname}</span>
            <b>{view.points[p.id]} 分</b>
          </li>
        ))}
      </ul>
      {view.history.length > 0 && (
        <ul className="card-log">
          {[...view.history].reverse().map((h: any, i: number) => (
            <li key={i}>
              <b>{nameOf(room, h.playerId)}</b>：
              {h.kind === 'skip' ? '跳过' : `${h.kind === 'truth' ? '真心话' : '大冒险'}「${h.prompt}」${h.done ? ' ✅ 完成' : ' ❌ 未完成'}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
