import { AwardList, nameOf, useCountdown, type GameProps } from './shared';
import { t } from '../i18n';

const MOVE: Record<string, { icon: string; name: string }> = {
  rock: { icon: '✊', name: '石头' },
  paper: { icon: '✋', name: '布' },
  scissors: { icon: '✌️', name: '剪刀' },
};

export default function Rps({ room, view, act }: GameProps) {
  const left = useCountdown(view.endsInMs ?? 0, view);

  if (view.phase === 'over') {
    return (
      <div>
        <h2>✌️ {t('剪刀石头布')} · {t('最终排名')}</h2>
        <ol className="rank">
          {view.ranking.map((r: any) => (
            <li key={r.id}>
              <span className="medal">{['🥇', '🥈', '🥉'][r.rank - 1]}</span>
              <span>{nameOf(room, r.id)}</span>
              <span className="score">{t('{n} 分', { n: r.points })}</span>
            </li>
          ))}
        </ol>
        <p className="hint">{view.cpu ? t('单人：赢电脑 +3、平局 +1。') : t('名次奖励（第一 +3 / 第二 +2 / 第三 +1）：')}</p>
        <AwardList room={room} />
      </div>
    );
  }

  const revealing = view.phase === 'reveal';
  const picked = view.myMove !== null;
  return (
    <div>
      <h2>✌️ {t('剪刀石头布')} <small>{t('第 {a} / {b} 轮', { a: view.round + 1, b: view.total })}</small></h2>
      {!revealing && <div className="timer">{left}</div>}
      <div className="rps-row">
        {Object.entries(MOVE).map(([k, m]) => (
          <button
            key={k}
            className={'btn opt rps-btn' + (view.myMove === k ? ' chosen' : '')}
            disabled={picked || revealing}
            onClick={() => act({ type: 'pick', round: view.round, move: k })}
          >
            <span className="rps-icon">{m.icon}</span>
            {t(m.name)}
          </button>
        ))}
      </div>
      {!revealing && (
        <p className="hint">
          {picked ? t('已出拳，等待其他人……') : t('选择你的出拳')}（{t('已出拳 {a} / {b}', { a: view.answered.length, b: room.players.length })}）
        </p>
      )}
      {revealing && (
        <ul className="awards">
          {view.players.map((id: string) => (
            <li key={id}>
              <span>{nameOf(room, id)}</span>
              <b>
                {view.moves[id] ? MOVE[view.moves[id]].icon + ' ' + t(MOVE[view.moves[id]].name) : t('弃权')}
                {view.gains[id] > 0 ? `+${view.gains[id]}` : '+0'}　{t('合计')} {view.points[id]}
              </b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
