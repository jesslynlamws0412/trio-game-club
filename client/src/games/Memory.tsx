import { AwardList, nameOf, type GameProps } from './shared';
import { t } from '../i18n';

export default function Memory({ room, view, act }: GameProps) {
  const myTurn = view.turnId === room.you && view.phase === 'play';
  return (
    <div>
      <h2>🃏 {t('记忆翻牌')}</h2>
      {view.phase === 'over' ? (
        <>
          <ol className="rank">
            {view.ranking.map((r: any) => (
              <li key={r.id}>
                <span className="medal">{['🥇', '🥈', '🥉'][r.rank - 1]}</span>
                <span>{nameOf(room, r.id)}</span>
                <span className="score">{t('{n} 对', { n: r.points })}</span>
              </li>
            ))}
          </ol>
          <p className="hint">{t('名次奖励（第一 +3 / 第二 +2 / 第三 +1）：')}</p>
          <AwardList room={room} />
        </>
      ) : (
        <p className="hint">
          {myTurn ? t('轮到你了：翻开两张牌') : view.phase === 'hide' ? t('没配上，牌即将盖回……') : t('等待 {name} 翻牌……', { name: nameOf(room, view.turnId) })}
        </p>
      )}
      <div className="mem-grid">
        {view.cards.map((c: string | null, i: number) => (
          <button
            key={i}
            className={'mem-card' + (c ? ' open' : '') + (view.matched[i] ? ' done' : '')}
            disabled={!myTurn || c !== null}
            onClick={() => act({ type: 'flip', index: i })}
            aria-label={c ?? t('未翻开的牌')}
          >
            {c ?? '？'}
          </button>
        ))}
      </div>
      <ul className="awards">
        {room.players.map((p) => (
          <li key={p.id}>
            <span>{p.avatar} {p.nickname}{view.turnId === p.id ? ' 👈' : ''}</span>
            <b>{t('{n} 对', { n: view.points[p.id] })}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
