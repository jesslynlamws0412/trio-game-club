import { AwardList, nameOf, type GameProps } from './shared';
import { t } from '../i18n';

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
      <h2>{gomoku ? '⚫ ' + t('五子棋') : '❌ ' + t('井字棋')}</h2>
      <p className="hint">
        {view.seats.map((id: string, i: number) => (
          <span key={id} className="seat-tag">{view.marks[i]}：{nameOf(room, id)}　</span>
        ))}
      </p>
      {view.over ? (
        <p className="question">
          {view.draw ? t('平局！') : <>🏆 {t('{name} 获胜！', { name: nameOf(room, view.winnerId) })}</>}
        </p>
      ) : (
        <p className="hint">{myTurn ? t('轮到你了，点一个空位落子') : view.turnId === 'cpu' ? t('电脑思考中……') : t('等待 {name} 落子……', { name: nameOf(room, view.turnId) })}</p>
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
              aria-label={t('第 {r} 行第 {c} 列', { r: y + 1, c: x + 1 })}
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
