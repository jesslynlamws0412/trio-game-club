import { AwardList, nameOf, type GameProps } from './shared';

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
      <h2>🐍 蛇梯棋</h2>
      {view.winnerId ? (
        <p className="question">🏆 {nameOf(room, view.winnerId)} 到达终点！</p>
      ) : (
        <p className="hint">
          {myTurn ? '轮到你了，掷骰子！' : `等待 ${nameOf(room, view.turnId)} 掷骰子……`}
          {view.lastRoll && <>　上一次：{nameOf(room, view.lastRoll.by)} 掷出 <b>{view.lastRoll.value}</b></>}
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
          🎲 掷骰子
        </button>
      )}
      <ul className="chat-log">
        {view.log.map((l: string, i: number) => <li key={i}>{l}</li>)}
      </ul>
      <ul className="awards">
        {room.players.map((p) => (
          <li key={p.id}>
            <span>{p.avatar} {p.nickname}{view.turnId === p.id ? ' 👈' : ''}</span>
            <b>第 {view.positions[p.id]} 格</b>
          </li>
        ))}
      </ul>
      {view.winnerId && <AwardList room={room} />}
    </div>
  );
}
