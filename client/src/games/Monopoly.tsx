import { useState } from 'react';
import { AwardList, nameOf, type GameProps } from './shared';
import { t } from '../i18n';

const TOKEN_COLORS = ['#c0392b', '#2f4f9a', '#3f8f5a', '#8e44ad', '#d68910', '#16a085'];

/** 40 格环形：0 号在右下角，顺时针（先向左）；返回 11x11 网格中的行、列（从 1 开始） */
function cell(i: number): [number, number] {
  if (i <= 10) return [11, 11 - i];
  if (i <= 19) return [11 - (i - 10), 1];
  if (i <= 30) return [1, 1 + (i - 20)];
  return [1 + (i - 30), 11];
}

const KIND_ICON: Record<string, string> = { go: '🏁', chance: '❓', fate: '🎴', jail: '⛓️', parking: '🅿️', gojail: '👮', tax: '💰', rail: '🚆', util: '💡' };
const LEVEL_NAMES = ['空地', '1 栋房子', '2 栋房子', '3 栋房子', '4 栋房子', '酒店'];

export default function Monopoly({ room, view, act }: GameProps) {
  const me = room.you;
  const myTurn = view.turnId === me;
  const player = (id: string) => room.players.find((p) => p.id === id)!;
  const state = (id: string) => view.players.find((p: any) => p.id === id);
  const mine = state(me);
  const [sel, setSel] = useState<number | null>(null);
  const myTiles = view.board.map((tl: any, i: number) => ({ tl, i })).filter(({ tl }: any) => tl.owner === me);
  const buyTile = view.pendingBuy !== null ? view.board[view.pendingBuy] : null;
  const canManage = myTurn && (view.phase === 'roll' || view.phase === 'manage');
  const detail = sel !== null ? view.board[sel] : null;
  const ownerName = (id: string | null) => (id ? player(id)?.nickname ?? '' : '');

  return (
    <div>
      <h2>
        🎲 {t('大富翁')} <small>{t('第 {round} / {max} 回合', { round: view.round, max: view.maxRounds })}</small>
      </h2>

      <div className="mono-board">
        {view.board.map((tl: any, i: number) => {
          const [r, c] = cell(i);
          const here = view.players.filter((p: any) => p.pos === i && !p.bankrupt);
          const ownerIdx = tl.owner ? view.players.findIndex((p: any) => p.id === tl.owner) : -1;
          const corner = i % 10 === 0;
          return (
            <button
              key={i}
              className={'mono-tile k-' + tl.kind + (corner ? ' corner' : '') + (view.pendingBuy === i ? ' hot' : '') + (sel === i ? ' sel' : '') + (tl.mortgaged ? ' mortgaged' : '')}
              style={{ gridRow: r, gridColumn: c }}
              onClick={() => setSel(sel === i ? null : i)}
            >
              {tl.kind === 'prop' && <span className="band" style={{ background: tl.color }} />}
              <span className="t-name">{tl.kind !== 'prop' ? KIND_ICON[tl.kind] : ''}{tl.name}</span>
              {tl.level > 0 && <span className="t-level">{tl.level === 5 ? '🏨' : '🏠'.repeat(tl.level)}</span>}
              {ownerIdx >= 0 && <span className="t-owner" style={{ background: TOKEN_COLORS[ownerIdx] }} />}
              {here.length > 0 && (
                <span className="t-tokens">
                  {here.map((p: any) => (
                    <span key={p.id} className="token" style={{ borderColor: TOKEN_COLORS[p.color] }}>{player(p.id).avatar}</span>
                  ))}
                </span>
              )}
            </button>
          );
        })}

        <div className="mono-center">
          {view.lastRoll && (
            <div className="dice">
              {view.lastRoll.map((d: number, i: number) => <span key={i} className="die">{d}</span>)}
            </div>
          )}
          {view.phase === 'over' ? (
            <p className="turn">{t('游戏结束')}</p>
          ) : (
            <p className="turn">{t('轮到 {name}', { name: nameOf(room, view.turnId) })}{view.extraRoll && ' · ' + t('双数再掷')}</p>
          )}
          {myTurn && view.phase === 'roll' && (
            <>
              <button className="btn primary" onClick={() => act({ type: 'roll' })}>🎲 {t('掷骰子')}</button>
              {mine.inJail && (
                <div className="row">
                  <button className="btn small ghost" disabled={mine.cash < view.jailFee} onClick={() => act({ type: 'payjail' })}>{t('交 RM{fee} 保释', { fee: view.jailFee })}</button>
                  {mine.jailCards > 0 && <button className="btn small ghost" onClick={() => act({ type: 'usecard' })}>{t('用出狱卡（{n}）', { n: mine.jailCards })}</button>}
                </div>
              )}
            </>
          )}
          {myTurn && view.phase === 'buy' && buyTile && (
            <>
              <p className="hint">{t('购买 {name}（RM{price}）？', { name: buyTile.name, price: buyTile.price })}</p>
              <div className="vote-grid">
                <button className="btn green" onClick={() => act({ type: 'buy' })}>{t('购买')}</button>
                <button className="btn ghost" onClick={() => act({ type: 'skip' })}>{t('放弃')}</button>
              </div>
            </>
          )}
          {myTurn && view.phase === 'manage' && (
            <button className="btn primary" onClick={() => act({ type: 'end' })}>{view.extraRoll && !mine.inJail ? t('再掷一次') : t('结束回合')}</button>
          )}
          {!myTurn && view.phase !== 'over' && <p className="hint">{t('等待中……')}</p>}
          <ul className="mono-log">
            {[...view.log].reverse().slice(0, 3).map((l: string, i: number) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      </div>

      {detail && (
        <div className="panel mono-detail">
          <div className="label">
            {detail.color && <i className="dot" style={{ background: detail.color }} />}
            {KIND_ICON[detail.kind] ?? ''} {detail.name}
            {detail.mortgaged && t('（已抵押）')}
          </div>
          {detail.kind === 'prop' && (
            <table className="rent-table">
              <tbody>
                <tr><td>{t('地价')}</td><td>RM{detail.price}</td><td>{t('每栋造价')}</td><td>RM{detail.buildCost}</td></tr>
                {detail.rents.map((r: number, k: number) => (
                  <tr key={k} className={detail.level === k ? 'now' : ''}><td colSpan={3}>{k === 0 ? t('空地租金（集齐同色翻倍）') : t('{level}租金', { level: t(LEVEL_NAMES[k]) })}</td><td>RM{r}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {detail.kind === 'rail' && <p className="hint">{t('地价 RM{price}。拥有 1/2/3/4 个火车站，租金 RM25/50/100/200。', { price: detail.price })}</p>}
          {detail.kind === 'util' && <p className="hint">{t('地价 RM{price}。拥有 1 个公用事业：租金 = 点数 × 4；拥有 2 个：点数 × 10。', { price: detail.price })}</p>}
          {detail.kind === 'tax' && <p className="hint">{t('经过时缴纳 RM{n}。', { n: detail.amount })}</p>}
          {detail.kind === 'go' && <p className="hint">{t('每次经过或停在起点领取 RM200。')}</p>}
          {detail.kind === 'jail' && <p className="hint">{t('只是探监时什么都不会发生；被送进来要付 RM50、用出狱卡或掷出双数才能出去。')}</p>}
          {detail.kind === 'gojail' && <p className="hint">{t('停在这里会被直接送进监狱。')}</p>}
          {detail.kind === 'parking' && <p className="hint">{t('免费停车，休息一下。')}</p>}
          {(detail.kind === 'chance' || detail.kind === 'fate') && <p className="hint">{t('抽一张卡，听天由命。')}</p>}
          {detail.owner && <p className="hint">{t('拥有者：')}{ownerName(detail.owner)}{detail.kind === 'prop' ? ` · ${t(LEVEL_NAMES[detail.level])}` : ''} · {t('当前租金 RM{n}', { n: detail.mortgaged ? 0 : detail.rent })}</p>}
        </div>
      )}

      <ul className="awards money">
        {room.players.map((p) => {
          const s = state(p.id);
          return (
            <li key={p.id} className={s.bankrupt ? 'out' : ''}>
              <span><i className="dot" style={{ background: TOKEN_COLORS[s.color] }} /> {p.avatar} {p.nickname}{view.turnId === p.id ? ' 👈' : ''}{s.inJail ? ' ⛓️' : ''}{s.jailCards > 0 ? ` 🎟️×${s.jailCards}` : ''}</span>
              <b>{s.bankrupt ? t('已破产') : `RM${s.cash}　${t('资产')} ${s.worth}`}</b>
            </li>
          );
        })}
      </ul>

      {myTiles.length > 0 && !mine.bankrupt && view.phase !== 'over' && (
        <details className="panel">
          <summary>{t('我的地产（{n}）· 集齐同色全部地产才能盖房', { n: myTiles.length })}</summary>
          <ul className="card-log">
            {myTiles.map(({ tl, i }: any) => (
              <li key={i} className="prop-row">
                <span>
                  <i className="dot" style={{ background: tl.color ?? '#999' }} /> {tl.name}
                  {tl.mortgaged ? ' · ' + t('已抵押') : tl.kind === 'prop' ? ` · ${t(LEVEL_NAMES[tl.level])}` : ''} · {t('租金 RM{n}', { n: tl.mortgaged ? 0 : tl.rent })}
                </span>
                {canManage && (
                  <span>
                    {tl.kind === 'prop' && (
                      <>
                        <button className="btn small green" disabled={!tl.canBuild || mine.cash < tl.buildCost} onClick={() => act({ type: 'build', tile: i })}>{t('升级 -{n}', { n: tl.buildCost })}</button>
                        <button className="btn small ghost" disabled={!tl.canSell} onClick={() => act({ type: 'sell', tile: i })}>{t('变卖')}</button>
                      </>
                    )}
                    {tl.mortgaged ? (
                      <button className="btn small ghost" disabled={mine.cash < tl.redeemCost} onClick={() => act({ type: 'redeem', tile: i })}>{t('赎回 -{n}', { n: tl.redeemCost })}</button>
                    ) : (
                      <button className="btn small ghost" disabled={!tl.canMortgage} onClick={() => act({ type: 'mortgage', tile: i })}>{t('抵押 +{n}', { n: tl.mortgageValue })}</button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="panel">
        <div className="label">{t('动态')}</div>
        <ul className="game-log">
          {[...view.log].reverse().map((l: string, i: number) => <li key={i}>{l}</li>)}
        </ul>
      </div>

      {view.ranking && (
        <div className="panel result">
          <h3>🏆 {t('最终排名')}</h3>
          <ol className="rank">
            {view.ranking.map((r: any) => (
              <li key={r.id}>
                <span className="medal">{['🥇', '🥈', '🥉'][r.rank - 1]}</span>
                <span>{nameOf(room, r.id)}</span>
                <span className="score">{state(r.id).bankrupt ? t('破产') : `RM${r.worth}`}</span>
              </li>
            ))}
          </ol>
          <AwardList room={room} />
        </div>
      )}
    </div>
  );
}
