import { AwardList, nameOf, type GameProps } from './shared';
import { t } from '../i18n';

export default function Reaction({ room, view, act }: GameProps) {
  if (view.phase === 'over') {
    return (
      <div>
        <h2>⚡ {t('反应速度挑战')} · {t('最终排名')}</h2>
        <ol className="rank">
          {view.ranking.map((r: any) => (
            <li key={r.id}>
              <span className="medal">{['🥇', '🥈', '🥉'][r.rank - 1]}</span>
              <span>{nameOf(room, r.id)}</span>
              <span className="score">
                {t('{n} 分', { n: r.points })}{view.best[r.id] !== null ? ` · ${t('最快 {n} 毫秒', { n: view.best[r.id] })}` : ''}
              </span>
            </li>
          ))}
        </ol>
        <p className="hint">{t('名次奖励（第一 +3 / 第二 +2 / 第三 +1）：')}</p>
        <AwardList room={room} />
      </div>
    );
  }

  const revealing = view.phase === 'reveal';
  const go = view.phase === 'go';
  const cls = 'react-pad ' + (revealing ? 'rev' : go ? 'go' : view.falseStart ? 'bad' : 'wait');
  return (
    <div>
      <h2>⚡ {t('反应速度挑战')} <small>{t('第 {a} / {b} 轮', { a: view.round + 1, b: view.total })}</small></h2>
      <button
        className={cls}
        disabled={revealing || view.tapped}
        onClick={() => act({ type: 'tap' })}
      >
        {revealing ? t('本轮结束') : view.falseStart ? t('抢跑了！-1 分') : go ? (view.tapped ? t('已记录') : t('点！')) : view.tapped ? t('已记录') : t('等待……（别点）')}
      </button>
      <p className="hint">{t('变绿“点！”出现后立刻点击；提前点击算抢跑。')}</p>
      {revealing && (
        <ul className="awards">
          {room.players.map((p) => (
            <li key={p.id}>
              <span>{p.avatar} {p.nickname}</span>
              <b>
                {view.falseStarts.includes(p.id) ? t('抢跑') : view.times[p.id] === null ? t('没点') : t('{n} 毫秒', { n: view.times[p.id] })}
                {view.gains[p.id] !== undefined ? (view.gains[p.id] > 0 ? `+${view.gains[p.id]}` : `${view.gains[p.id]}`) : '+0'}
                　{t('合计')} {view.points[p.id]}
              </b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
