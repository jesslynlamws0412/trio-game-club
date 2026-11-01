import { AwardList, nameOf, type GameProps } from './shared';
import { t } from '../i18n';

/** 蛇梯棋：10×10，按“之”字形编号，从左下角 1 到 100 */
export default function Snakes({ room, view, act }: GameProps) {
  const myTurn = view.turnId === room.you;
  const cells: number[] = [];
  for (let r = 0; r < 10; r++) {
    const boardRow = 9 - r;
    for (let c = 0; c < 10; c++) cells.push(boardRow % 2 === 0 ? boardRow * 10 + c + 1 : boardRow * 10 + (10 - c));
  }
  const at = (n: number) => room.players.filter((p) => view.positions[p.id] === n);

  return (
    <div>
      <h2>🐍 {t('蛇梯棋')}</h2>
      {view.winnerId ? (
        <p className="question">🏆 {t('{name} 到达终点！', { name: nameOf(room, view.winnerId) })}</p>
      ) : (
        <p className="hint">
          {myTurn ? t('轮到你了，掷骰子！') : t('等待 {name} 掷骰子……', { name: nameOf(room, view.turnId) })}
          {view.lastRoll && <>　{t('上一次：{name} 掷出', { name: nameOf(room, view.lastRoll.by) })} <b>{view.lastRoll.value}</b></>}
        </p>
      )}
      <div className="sl-board">
        {cells.map((n) => {
          const ladder = view.ladders[n];
          const snake = view.snakes[n];
          return (
            <div key={n} className={'sl-cell' + (ladder ? ' ladder' : '') + (snake ? ' snake' : '') + (n === 100 ? ' goal' : '')}>
              <span className="sl-n">{n}</span>
              {ladder && <span className="sl-tag">🪜{ladder}</span>}
              {snake && <span className="sl-tag">🐍{snake}</span>}
              <span className="sl-pieces">{at(n).map((p) => <i key={p.id}>{p.avatar}</i>)}</span>
            </div>
          );
        })}
      </div>
      {!view.winnerId && (
        <button className="btn primary wide" disabled={!myTurn} onClick={() => act({ type: 'roll' })}>
          🎲 {t('掷骰子')}
        </button>
      )}
      <ul className="chat-log">
        {view.log.map((l: string, i: number) => <li key={i}>{l}</li>)}
      </ul>
      <ul className="awards">
        {room.players.map((p) => (
          <li key={p.id}>
            <span>{p.avatar} {p.nickname}{view.turnId === p.id ? ' 👈' : ''}</span>
            <b>{t('第 {n} 格', { n: view.positions[p.id] })}</b>
          </li>
        ))}
      </ul>
      {view.winnerId && <AwardList room={room} />}
    </div>
  );
}
