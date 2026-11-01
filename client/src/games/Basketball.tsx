import { AwardList, nameOf, type GameProps } from './shared';
import { t } from '../i18n';
import MeterBar from './MeterBar';

export default function Basketball({ room, view, act }: GameProps) {
  if (view.phase === 'over') {
    return (
      <div>
        <h2>🏀 {t('投篮机')} · {t('最终排名')}</h2>
        <ol className="rank">
          {view.ranking.map((r: any) => (
            <li key={r.id}>
              <span className="medal">{['🥇', '🥈', '🥉'][r.rank - 1]}</span>
              <span>{nameOf(room, r.id)}</span>
              <span className="score">{t('{n} 分（进 {m} 球）', { n: r.points, m: view.made[r.id] })}</span>
            </li>
          ))}
        </ol>
        <p className="hint">{t('名次奖励（第一 +3 / 第二 +2 / 第三 +1）：')}</p>
        <AwardList room={room} />
      </div>
    );
  }
  const myTurn = view.turnId === room.you;
  return (
    <div>
      <h2>🏀 {t('投篮机')} <small>{t('第 {a} / {b} 轮 · {name}（进球 {pts} 分）', { a: view.round + 1, b: view.total, name: view.shot.name, pts: view.shot.pts })}</small></h2>
      <p className="hint">
        {view.phase === 'aim'
          ? myTurn ? t('指针经过中间的绿色区域时，点“投篮”！越靠近正中越好（空心球 +1 分）') : t('等待 {name} 投篮……', { name: nameOf(room, view.turnId) })
          : ''}
      </p>
      <div className="court">🏀</div>
      <MeterBar meter={view.meter} zone={view.shot.w} />
      {view.phase === 'aim' && (
        <button className="btn primary wide" disabled={!myTurn} onClick={() => act({ type: 'shoot' })}>
          {myTurn ? t('投篮！') : t('等待……')}
        </button>
      )}
      {view.last && (
        <p className="answer-box">
          {nameOf(room, view.last.by)}：{view.last.made ? (view.last.swish ? t('🎯 空心球！+{n} 分', { n: view.last.gain }) : t('✅ 进了！+{n} 分', { n: view.last.gain })) : view.last.pos < 0 ? t('⏰ 超时，没有投出去') : t('❌ 没进')}
        </p>
      )}
      <ul className="awards">
        {room.players.map((p) => (
          <li key={p.id}>
            <span>{p.avatar} {p.nickname}{view.turnId === p.id ? ' 👈' : ''}</span>
            <b>{t('{n} 分 · 进 {m} 球', { n: view.points[p.id], m: view.made[p.id] })}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
