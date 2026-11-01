import { AwardList, nameOf, type GameProps } from './shared';
import { t } from '../i18n';

export default function Jenga({ room, view, act }: GameProps) {
  const myTurn = view.turnId === room.you;
  const rows = view.levels.map((row: boolean[], i: number) => ({ row, i })).reverse(); // 最高层在上面

  return (
    <div>
      <h2>🧱 {t('叠叠高')} <small>{t('已抽 {n} / {max} 块', { n: view.total, max: view.maxPulls })}</small></h2>
      {view.over ? (
        <p className="question">
          {view.collapsedBy ? <>💥 {t('{name} 把塔抽倒了！', { name: nameOf(room, view.collapsedBy) })}</> : t('🎉 塔一直没倒，大家都赢了！')}
        </p>
      ) : (
        <p className="hint">{myTurn ? t('轮到你了：点一块积木抽出来（数字是塔倒的风险）') : t('等待 {name} 抽积木……', { name: nameOf(room, view.turnId) })}</p>
      )}
      <div className="jenga-tower">
        {rows.map(({ row, i }: { row: boolean[]; i: number }) => {
          const locked = i > view.levels.length - 1 - view.locked;
          return (
            <div key={i} className={'jenga-row' + (i % 2 ? ' rot' : '')}>
              {row.map((has, s) => {
                const risk = view.risk[i][s];
                const can = myTurn && !view.over && risk !== null;
                return (
                  <button
                    key={s}
                    className={'jenga-block' + (has ? '' : ' gone') + (locked ? ' locked' : '')}
                    disabled={!can}
                    onClick={() => act({ type: 'pull', level: i, slot: s })}
                    aria-label={t('第 {a} 层第 {b} 块', { a: i + 1, b: s + 1 })}
                  >
                    {has && risk !== null ? `${risk}%` : ''}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <ul className="awards">
        {room.players.map((p) => (
          <li key={p.id}>
            <span>{p.avatar} {p.nickname}{view.turnId === p.id ? ' 👈' : ''}</span>
            <b>{t('抽出 {n} 块', { n: view.pulls[p.id] })}</b>
          </li>
        ))}
      </ul>
      <ul className="chat-log">
        {view.log.map((l: string, i: number) => <li key={i}>{l}</li>)}
      </ul>
      {view.over && <AwardList room={room} />}
    </div>
  );
}
