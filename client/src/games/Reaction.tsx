import { AwardList, nameOf, type GameProps } from './shared';

export default function Reaction({ room, view, act }: GameProps) {
  if (view.phase === 'over') {
    return (
      <div>
        <h2>⚡ 反应速度挑战 · 最终排名</h2>
        <ol className="rank">
          {view.ranking.map((r: any) => (
            <li key={r.id}>
              <span className="medal">{['🥇', '🥈', '🥉'][r.rank - 1]}</span>
              <span>{nameOf(room, r.id)}</span>
              <span className="score">
                {r.points} 分{view.best[r.id] !== null ? ` · 最快 ${view.best[r.id]} 毫秒` : ''}
              </span>
            </li>
          ))}
        </ol>
        <p className="hint">名次奖励（第一 +3 / 第二 +2 / 第三 +1）：</p>
        <AwardList room={room} />
      </div>
    );
  }

  const revealing = view.phase === 'reveal';
  const go = view.phase === 'go';
  const cls = 'react-pad ' + (revealing ? 'rev' : go ? 'go' : view.falseStart ? 'bad' : 'wait');
  return (
    <div>
      <h2>⚡ 反应速度挑战 <small>第 {view.round + 1} / {view.total} 轮</small></h2>
      <button
        className={cls}
        disabled={revealing || view.tapped}
        onClick={() => act({ type: 'tap' })}
      >
        {revealing ? '本轮结束' : view.falseStart ? '抢跑了！-1 分' : go ? (view.tapped ? '已记录' : '点！') : view.tapped ? '已记录' : '等待……（别点）'}
      </button>
      <p className="hint">变绿“点！”出现后立刻点击；提前点击算抢跑。</p>
      {revealing && (
        <ul className="awards">
          {room.players.map((p) => (
            <li key={p.id}>
              <span>{p.avatar} {p.nickname}</span>
              <b>
                {view.falseStarts.includes(p.id) ? '抢跑' : view.times[p.id] === null ? '没点' : `${view.times[p.id]} 毫秒`}
                {view.gains[p.id] !== undefined ? (view.gains[p.id] > 0 ? `+${view.gains[p.id]}` : `${view.gains[p.id]}`) : '+0'}
                　合计 {view.points[p.id]}
              </b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
