import { AwardList, nameOf, type GameProps } from './shared';

/** 井字棋 / 五子棋：同一个棋盘组件 */
export default function Board({ room, view, act }: GameProps) {
  const n: number = view.size;
  const myTurn = view.turnId === room.you;
  const gomoku = view.game === 'gomoku';
  const lineSet = new Set<number>(view.line ?? []);
  const lastIdx = view.last ? view.last[1] * n + view.last[0] : -1;
  const markOf = (c: number) => (c < 0 ? '' : view.marks[c]);

  return (
    <div>
      <h2>{gomoku ? '⚫ 五子棋' : '❌ 井字棋'}</h2>
      <p className="hint">
        {view.seats.map((id: string, i: number) => (
          <span key={id} className="seat-tag">{view.marks[i]}：{nameOf(room, id)}　</span>
        ))}
      </p>
      {view.over ? (
        <p className="question">
          {view.draw ? '平局！' : <>🏆 {nameOf(room, view.winnerId)} 获胜！</>}
        </p>
      ) : (
        <p className="hint">{myTurn ? '轮到你了，点一个空位落子' : view.turnId === 'cpu' ? '电脑思考中……' : `等待 ${nameOf(room, view.turnId)} 落子……`}</p>
      )}
      <div className={'board ' + (gomoku ? 'gomoku' : 'ttt')} style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {view.cells.map((c: number, i: number) => {
          const x = i % n;
          const y = Math.floor(i / n);
          return (
            <button
              key={i}
              className={'cell' + (c >= 0 ? ' s' + c : '') + (lineSet.has(i) ? ' win' : '') + (i === lastIdx ? ' last' : '')}
              disabled={!myTurn || c >= 0 || view.over}
              aria-label={`第 ${y + 1} 行第 ${x + 1} 列`}
              onClick={() => act({ type: 'place', x, y })}
            >
              {gomoku ? (c >= 0 ? '●' : '') : markOf(c)}
            </button>
          );
        })}
      </div>
      {view.over && <AwardList room={room} />}
    </div>
  );
}
