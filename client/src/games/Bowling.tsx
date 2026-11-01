import { AwardList, nameOf, type GameProps } from './shared';
import { t } from '../i18n';
import MeterBar from './MeterBar';

/** 10 个球瓶的三角形排列（后排在上）：行里的下标 */
const ROWS = [[6, 7, 8, 9], [3, 4, 5], [1, 2], [0]];

export default function Bowling({ room, view, act }: GameProps) {
  const card = (id: string) => view.cards[id];
  const cell = (id: string, f: number) => {
    const c = card(id);
    // 把 rolls 按格拆开显示：X 全中，/ 补中
    let i = 0;
    const out: string[] = [];
    for (let k = 0; k < 10; k++) {
      const a = c.rolls[i];
      if (a === undefined) {
        out.push('');
        continue;
      }
      if (k < 9) {
        if (a === 10) {
          out.push('X');
          i += 1;
        } else {
          const b = c.rolls[i + 1];
          out.push(b === undefined ? `${a}` : a + b === 10 ? `${a}/` : `${a}${b}`);
          i += 2;
        }
      } else {
        const r = c.rolls.slice(i);
        out.push(r.map((v: number, j: number) => (v === 10 ? 'X' : j > 0 && r[j - 1] !== 10 && r[j - 1] + v === 10 ? '/' : String(v))).join(' '));
      }
    }
    return out[f];
  };

  const board = (
    <div className="bowl-sheet">
      {room.players.map((p) => (
        <div key={p.id} className="bowl-row">
          <b>{p.avatar} {p.nickname}</b>
          <div className="bowl-frames">
            {Array.from({ length: 10 }, (_, f) => (
              <span key={f} className={'bowl-frame' + (view.turnId === p.id && view.frame === f ? ' now' : '')}>
                <i>{cell(p.id, f)}</i>
                <b>{card(p.id).frames[f] ?? ''}</b>
              </span>
            ))}
            <span className="bowl-total">{card(p.id).total}</span>
          </div>
        </div>
      ))}
    </div>
  );

  if (view.phase === 'over') {
    return (
      <div>
        <h2>🎳 {t('保龄球')} · {t('最终成绩')}</h2>
        {board}
        <ol className="rank">
          {view.ranking.map((r: any) => (
            <li key={r.id}>
              <span className="medal">{['🥇', '🥈', '🥉'][r.rank - 1]}</span>
              <span>{nameOf(room, r.id)}</span>
              <span className="score">{t('{n} 分', { n: r.points })}</span>
            </li>
          ))}
        </ol>
        <AwardList room={room} />
      </div>
    );
  }

  const myTurn = view.turnId === room.you;
  return (
    <div>
      <h2>🎳 {t('保龄球')} <small>{t('第 {a} / 10 格 · 第 {b} 球', { a: view.frame + 1, b: view.throwNo + 1 })}</small></h2>
      <p className="hint">
        {view.phase === 'aim'
          ? myTurn ? t('指针越靠近正中间，击倒的球瓶越多。点“投球”！') : t('等待 {name} 投球……', { name: nameOf(room, view.turnId) })
          : ''}
      </p>
      <div className="pins">
        {ROWS.map((row, r) => (
          <div key={r} className="pin-row">
            {row.map((i) => <span key={i} className={'pin' + (view.standing[i] ? '' : ' down')}>🎳</span>)}
          </div>
        ))}
      </div>
      <MeterBar meter={view.meter} zone={0.06} />
      {view.phase === 'aim' && (
        <button className="btn primary wide" disabled={!myTurn} onClick={() => act({ type: 'throw' })}>
          {myTurn ? t('投球！') : t('等待……')}
        </button>
      )}
      {view.last && (
        <p className="answer-box">
          {nameOf(room, view.last.by)}：{view.last.strike ? t('🎉 全中 Strike！') : view.last.spare ? t('✨ 补中 Spare！') : view.last.gutter ? t('洗澡（一个都没倒）') : t('击倒 {n} 个', { n: view.last.knocked })}
        </p>
      )}
      {board}
    </div>
  );
}
