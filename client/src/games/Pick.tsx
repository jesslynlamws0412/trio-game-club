import { AwardList, nameOf, useCountdown, type GameProps } from './shared';
import { t } from '../i18n';

/** 谁最有可能 / 默契大考验：同一套“同时选择”界面 */
export default function Pick({ room, view, act }: GameProps) {
  const left = useCountdown(view.endsInMs ?? 0, view);
  const likely = view.game === 'likely';
  const tf = view.game === 'truefalse';
  const title = likely ? '👆 ' + t('谁最有可能') : tf ? '⚖️ ' + t('真假判断') : '💞 ' + t('默契大考验');

  if (view.phase === 'over') {
    return (
      <div>
        <h2>{title} · {t('最终排名')}</h2>
        <ol className="rank">
          {view.ranking.map((r: any) => (
            <li key={r.id}>
              <span className="medal">{['🥇', '🥈', '🥉'][r.rank - 1]}</span>
              <span>{nameOf(room, r.id)}</span>
              <span className="score">{t('{n} 分', { n: r.points })}</span>
            </li>
          ))}
        </ol>
        <p className="hint">{t('名次奖励（第一 +3 / 第二 +2 / 第三 +1）：')}</p>
        <AwardList room={room} />
      </div>
    );
  }

  const revealing = view.phase === 'reveal';
  const picked = view.myPick !== null;
  const top = revealing ? Math.max(0, ...Object.values<number>(view.tally)) : 0;

  return (
    <div>
      <h2>
        {title} <small>{t('第 {a} / {b} 轮', { a: view.round + 1, b: view.total })}</small>
      </h2>
      {!revealing && <div className="timer">{left}</div>}
      <p className="question">{view.question}</p>
      <div className="options">
        {view.options.map((o: { id: string; label: string }) => {
          const self = likely && o.id === room.you;
          let cls = 'btn opt';
          if (revealing) {
            if (tf ? o.id === view.answer : likely ? view.tally[o.id] === top && top > 0 : view.tally[o.id] === top && top > 1) cls += ' right';
            else if (view.picks[room.you] === o.id) cls += ' wrong';
          } else if (view.myPick === o.id) cls += ' chosen';
          const voters = revealing ? room.players.filter((p) => view.picks[p.id] === o.id) : [];
          return (
            <button
              key={o.id}
              className={cls}
              disabled={picked || revealing || self}
              onClick={() => act({ type: 'pick', round: view.round, option: o.id })}
            >
              {likely ? (room.players.find((p) => p.id === o.id)?.avatar ?? '') + ' ' : ''}
              {o.label}
              {self ? t('（你自己）') : ''}
              {revealing && (
                <span className="pickers">
                  {voters.map((p) => p.avatar).join('')} {view.tally[o.id] ?? 0}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {!revealing && (
        <p className="hint">
          {picked ? t('已提交，等待其他人……') : tf ? t('判断这句话是对还是错') : likely ? t('投给你认为最有可能的人（不能投自己）') : t('选一个你觉得大家也会选的')}
          {t('（已选择 {a} / {b}）', { a: view.answered.length, b: room.players.length })}
        </p>
      )}
      {revealing && tf && <p className="hint">{t('解释：')}{view.why}</p>}
      {revealing && (
        <ul className="awards">
          {room.players.map((p) => (
            <li key={p.id}>
              <span>{p.avatar} {p.nickname}</span>
              <b>{view.gains[p.id] > 0 ? `+${view.gains[p.id]}` : '+0'}　{t('合计')} {view.points[p.id]}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
