import { AwardList, nameOf, type GameProps } from './shared';

const TOKEN_COLORS = ['#c0392b', '#2f4f9a', '#3f8f5a'];

/** 28 格环形：0 号在右下角，顺时针（先向左）；返回 8x8 网格中的行、列（从 1 开始） */
function cell(i: number): [number, number] {
  if (i <= 7) return [8, 8 - i];
  if (i <= 13) return [8 - (i - 7), 1];
  if (i <= 21) return [1, 1 + (i - 14)];
  return [2 + (i - 22), 8];
}

const KIND_ICON: Record<string, string> = { go: '🏁', chance: '❓', fate: '🎴', jail: '⛓️', parking: '🅿️', gojail: '👮', tax: '💰' };

export default function Monopoly({ room, view, act }: GameProps) {
  const me = room.you;
  const myTurn = view.turnId === me;
  const player = (id: string) => room.players.find((p) => p.id === id)!;
  const state = (id: string) => view.players.find((p: any) => p.id === id);
  const mine = state(me);
  const myTiles = view.board.map((t: any, i: number) => ({ t, i })).filter(({ t }: any) => t.owner === me && t.kind === 'prop');
  const buyTile = view.pendingBuy !== null ? view.board[view.pendingBuy] : null;

  return (
    <div>
      <h2>
        🎲 大富翁 <small>第 {view.round} / {view.maxRounds} 回合</small>
      </h2>

      <div className="board">
        {view.board.map((t: any, i: number) => {
          const [r, c] = cell(i);
          const here = view.players.filter((p: any) => p.pos === i && !p.bankrupt);
          const ownerIdx = t.owner ? view.players.findIndex((p: any) => p.id === t.owner) : -1;
          return (
            <div key={i} className={'tile k-' + t.kind + (view.pendingBuy === i ? ' hot' : '')} style={{ gridRow: r, gridColumn: c }}>
              {t.kind === 'prop' && <div className="band" style={{ background: t.color }} />}
              <div className="t-name">{t.kind !== 'prop' ? KIND_ICON[t.kind] : ''} {t.name}</div>
              {t.kind === 'prop' && <div className="t-price">{t.owner ? `租${t.rent}` : t.price}</div>}
              {t.kind === 'tax' && <div className="t-price">{t.amount}</div>}
              {t.level > 0 && <div className="t-level">{t.level === 4 ? '🏨' : '🏠'.repeat(t.level)}</div>}
              {ownerIdx >= 0 && <span className="t-owner" style={{ background: TOKEN_COLORS[ownerIdx] }} />}
              <div className="t-tokens">
                {here.map((p: any) => (
                  <span key={p.id} className="token" style={{ borderColor: TOKEN_COLORS[p.color] }}>{player(p.id).avatar}</span>
                ))}
              </div>
            </div>
          );
        })}

        <div className="board-center">
          {view.lastRoll && (
            <div className="dice">
              {view.lastRoll.map((d: number, i: number) => <span key={i} className="die">{d}</span>)}
            </div>
          )}
          {view.phase === 'over' ? (
            <p className="turn">游戏结束</p>
          ) : (
            <p className="turn">轮到 {nameOf(room, view.turnId)}</p>
          )}
          {myTurn && view.phase === 'roll' && (
            <>
              <button className="btn primary" onClick={() => act({ type: 'roll' })}>🎲 掷骰子</button>
              {mine.inJail && <button className="btn small ghost" onClick={() => act({ type: 'payjail' })}>交 500 保释</button>}
            </>
          )}
          {myTurn && view.phase === 'buy' && buyTile && (
            <>
              <p className="hint">购买 {buyTile.name}（{buyTile.price}）？</p>
              <div className="vote-grid">
                <button className="btn green" onClick={() => act({ type: 'buy' })}>购买</button>
                <button className="btn ghost" onClick={() => act({ type: 'skip' })}>放弃</button>
              </div>
            </>
          )}
          {myTurn && view.phase === 'manage' && <button className="btn primary" onClick={() => act({ type: 'end' })}>结束回合</button>}
          {!myTurn && view.phase !== 'over' && <p className="hint">等待中……</p>}
        </div>
      </div>

      <ul className="awards money">
        {room.players.map((p) => {
          const s = state(p.id);
          return (
            <li key={p.id} className={s.bankrupt ? 'out' : ''}>
              <span><i className="dot" style={{ background: TOKEN_COLORS[s.color] }} /> {p.avatar} {p.nickname}{view.turnId === p.id ? ' 👈' : ''}{s.inJail ? ' ⛓️' : ''}</span>
              <b>{s.bankrupt ? '已破产' : `💵 ${s.cash}　资产 ${s.worth}`}</b>
            </li>
          );
        })}
      </ul>

      {myTiles.length > 0 && !mine.bankrupt && view.phase !== 'over' && (
        <details className="panel">
          <summary>我的地产（{myTiles.length}）· 同色两块都归你才能升级</summary>
          <ul className="card-log">
            {myTiles.map(({ t, i }: any) => (
              <li key={i} className="prop-row">
                <span><i className="dot" style={{ background: t.color }} /> {t.name} · {t.level === 0 ? '空地' : t.level === 4 ? '酒店' : `${t.level} 栋房子`} · 租金 {t.rent}</span>
                {myTurn && (view.phase === 'roll' || view.phase === 'manage') && (
                  <span>
                    <button className="btn small green" disabled={!t.canBuild || t.level >= 4 || mine.cash < t.buildCost} onClick={() => act({ type: 'build', tile: i })}>升级 -{t.buildCost}</button>
                    <button className="btn small ghost" disabled={t.level <= 0} onClick={() => act({ type: 'sell', tile: i })}>变卖</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="panel">
        <div className="label">动态</div>
        <ul className="game-log">
          {[...view.log].reverse().map((l: string, i: number) => <li key={i}>{l}</li>)}
        </ul>
      </div>

      {view.ranking && (
        <div className="panel result">
          <h3>🏆 最终排名</h3>
          <ol className="rank">
            {view.ranking.map((r: any) => (
              <li key={r.id}>
                <span className="medal">{['🥇', '🥈', '🥉'][r.rank - 1]}</span>
                <span>{nameOf(room, r.id)}</span>
                <span className="score">{state(r.id).bankrupt ? '破产' : `${r.worth}`}</span>
              </li>
            ))}
          </ol>
          <AwardList room={room} />
        </div>
      )}
    </div>
  );
}
