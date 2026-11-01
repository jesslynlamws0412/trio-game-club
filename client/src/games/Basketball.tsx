import { AwardList, nameOf, type GameProps } from './shared';
import MeterBar from './MeterBar';

export default function Basketball({ room, view, act }: GameProps) {
  if (view.phase === 'over') {
    return (
      <div>
        <h2>🏀 投篮机 · 最终排名</h2>
        <ol className="rank">
          {view.ranking.map((r: any) => (
            <li key={r.id}>
              <span className="medal">{['🥇', '🥈', '🥉'][r.rank - 1]}</span>
              <span>{nameOf(room, r.id)}</span>
              <span className="score">{r.points} 分（进 {view.made[r.id]} 球）</span>
            </li>
          ))}
        </ol>
        <p className="hint">名次奖励（第一 +3 / 第二 +2 / 第三 +1）：</p>
        <AwardList room={room} />
      </div>
    );
  }
  const myTurn = view.turnId === room.you;
  return (
    <div>
      <h2>🏀 投篮机 <small>第 {view.round + 1} / {view.total} 轮 · {view.shot.name}（进球 {view.shot.pts} 分）</small></h2>
      <p className="hint">
        {view.phase === 'aim'
          ? myTurn ? '指针经过中间的绿色区域时，点“投篮”！越靠近正中越好（空心球 +1 分）' : `等待 ${nameOf(room, view.turnId)} 投篮……`
          : ''}
      </p>
      <div className="court">🏀</div>
      <MeterBar meter={view.meter} zone={view.shot.w} />
      {view.phase === 'aim' && (
        <button className="btn primary wide" disabled={!myTurn} onClick={() => act({ type: 'shoot' })}>
          {myTurn ? '投篮！' : '等待……'}
        </button>
      )}
      {view.last && (
        <p className="answer-box">
          {nameOf(room, view.last.by)}：{view.last.made ? (view.last.swish ? `🎯 空心球！+${view.last.gain} 分` : `✅ 进了！+${view.last.gain} 分`) : view.last.pos < 0 ? '⏰ 超时，没有投出去' : '❌ 没进'}
        </p>
      )}
      <ul className="awards">
        {room.players.map((p) => (
          <li key={p.id}>
            <span>{p.avatar} {p.nickname}{view.turnId === p.id ? ' 👈' : ''}</span>
            <b>{view.points[p.id]} 分 · 进 {view.made[p.id]} 球</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
