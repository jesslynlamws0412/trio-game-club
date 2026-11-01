import { AwardList, nameOf, type GameProps } from './shared';
import { t } from '../i18n';

/** 风险越高越红：0% 绿色，20% 以上红色 */
const riskColor = (risk: number) => `hsl(${Math.max(0, 120 - risk * 6)} 55% 62%)`;

export default function Jenga({ room, view, act }: GameProps) {
  const myTurn = view.turnId === room.you;
  const rows = view.levels.map((row: boolean[], i: number) => ({ row, i })).reverse(); // 最高层在上面

  return (
    <div>
      <h2>🧱 {t('叠叠高')} <small>{t('已抽 {n} / {max} 块', { n: view.total, max: view.maxPulls })}</small></h2>
      {view.over ? (
        <p className="question">
          {view.collapsedBy
            ? <>💥 {t('{name} 把塔抽倒了！', { name: nameOf(room, view.collapsedBy) })} {view.collapseLevel >= 0 && t('最先撑不住的是第 {n} 层。', { n: view.collapseLevel + 1 })}</>
            : t('🎉 塔一直没倒，大家都赢了！')}
        </p>
      ) : (
        <p className="hint">{myTurn ? t('轮到你了：点一块积木抽出来（数字是抽走它之后塔倒的概率）') : t('等待 {name} 抽积木……', { name: nameOf(room, view.turnId) })}</p>
      )}
      {!view.over && (
        <div className="jenga-stable">
          <span>{t('塔的稳定度')}</span>
          <div className="jenga-bar"><i style={{ width: view.stability + '%', background: riskColor(100 - view.stability) }} /></div>
          <b>{view.stability}%</b>
          {view.weakest >= 0 && view.stability < 90 && <small>{t('最薄弱：第 {n} 层', { n: view.weakest + 1 })}</small>}
        </div>
      )}
      <div className="jenga-tower">
        {rows.map(({ row, i }: { row: boolean[]; i: number }) => {
          const locked = i > view.levels.length - 1 - view.locked;
          const weak = view.margin[i] !== null && view.margin[i] < 0.45 && i < view.levels.length - 1;
          return (
            <div key={i} className={'jenga-row' + (i % 2 ? ' rot' : '') + (weak ? ' weak' : '')} title={view.margin[i] === null ? '' : t('这一层的余量：{n}', { n: view.margin[i] })}>
              {row.map((has, s) => {
                const risk = view.risk[i][s];
                const can = myTurn && !view.over && risk !== null;
                return (
                  <button
                    key={s}
                    className={'jenga-block' + (has ? '' : ' gone') + (locked ? ' locked' : '')}
                    style={has && risk !== null ? { background: riskColor(risk) } : undefined}
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
      <p className="hint">{t('提示：抽掉某层两边的积木，或者把一层抽到只剩一块，会让那一层撑不住上面的重量；越靠下压的重量越大，抽的时候塔晃得越厉害。')}</p>
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
