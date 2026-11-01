import { AwardList, nameOf, type GameProps } from './shared';
import { t } from '../i18n';

const COLOR = ['#c0392b', '#d4a017', '#2c6fbb', '#2e8b57'];
const R = 135;
const C = 160;
const pt = (i: number) => {
  const a = (i / 52) * Math.PI * 2 - Math.PI / 2;
  return [C + R * Math.cos(a), C + R * Math.sin(a)] as const;
};

/** 飞行棋：52 格公共跑道画成一个圆环，起飞点用各色圆点标出 */
export default function Ludo({ room, view, act }: GameProps) {
  const myTurn = view.turnId === room.you;
  const seatOf = (id: string) => view.seats[id] as number;
  const status = (r: number) => (r === -1 ? t('机库') : r === 56 ? t('已到终点') : r > 50 ? t('终点通道 {n}/5', { n: r - 50 }) : t('跑道第 {n} 步', { n: r + 1 }));

  return (
    <div>
      <h2>✈️ {t('飞行棋')} <small>{t('先 {n} 架到终点获胜', { n: view.goal })}</small></h2>
      {view.winnerId ? (
        <p className="question">🏆 {t('{name} 获胜！', { name: nameOf(room, view.winnerId) })}</p>
      ) : (
        <p className="hint">
          {myTurn
            ? view.phase === 'roll' ? t('轮到你了，掷骰子！') : t('你掷出了 {n}，请选择要走的飞机', { n: view.dice })
            : t(view.phase === 'move' ? '等待 {name} 选飞机……' : '等待 {name} 掷骰子……', { name: nameOf(room, view.turnId) })}
          {view.dice > 0 && <>　{t('骰子：')}<b>{view.dice}</b></>}
        </p>
      )}
      <svg viewBox="0 0 320 320" className="ludo-ring" role="img" aria-label={t('飞行棋跑道')}>
        {Array.from({ length: 52 }, (_, i) => {
          const [x, y] = pt(i);
          const start = [0, 13, 26, 39].indexOf(i);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={7} fill={start >= 0 ? COLOR[start] : '#fffaf0'} stroke="#3b2a1e" strokeWidth={1} opacity={start >= 0 ? 0.9 : 1} />
              {view.safe.includes(i) && start < 0 && <text x={x} y={y + 3} fontSize={9} textAnchor="middle" fill="#b8923a">★</text>}
            </g>
          );
        })}
        {room.players.flatMap((p) =>
          (view.globals[p.id] as (number | null)[]).map((g, k) => {
            if (g === null) return null;
            const [x, y] = pt(g);
            // 同一格有多架飞机时稍微错开
            const dx = (k % 2) * 6 - 3;
            return (
              <g key={p.id + k}>
                <circle cx={x + dx} cy={y - 1} r={6} fill={COLOR[seatOf(p.id)]} stroke="#fff" strokeWidth={1.5} />
                <text x={x + dx} y={y + 2} fontSize={8} textAnchor="middle" fill="#fff" fontWeight={700}>{k + 1}</text>
              </g>
            );
          }),
        )}
        <text x={C} y={C - 4} textAnchor="middle" fontSize={14} fill="#7a1f2b">{t('飞行棋')}</text>
        <text x={C} y={C + 14} textAnchor="middle" fontSize={11} fill="#6b5240">{view.turnId ? nameOf(room, view.turnId) : ''}</text>
      </svg>

      {!view.winnerId && myTurn && view.phase === 'roll' && (
        <button className="btn primary wide" onClick={() => act({ type: 'roll' })}>🎲 {t('掷骰子')}</button>
      )}

      {room.players.map((p) => (
        <div key={p.id} className="ludo-player" style={{ borderLeftColor: COLOR[seatOf(p.id)] }}>
          <b>{p.avatar} {p.nickname}（{view.colors[seatOf(p.id)]}）　{t('到达终点')} {view.done[p.id]}/{view.goal}</b>
          <div className="ludo-tokens">
            {(view.tokens[p.id] as number[]).map((r, k) => (
              <span key={k} className="ludo-token" style={{ borderColor: COLOR[seatOf(p.id)] }}>
                {t('第 {n} 架：', { n: k + 1 })}{status(r)}
                {p.id === room.you && myTurn && view.phase === 'move' && view.legal.includes(k) && (
                  <button className="btn small primary" onClick={() => act({ type: 'move', token: k })}>{t('走这架')}</button>
                )}
              </span>
            ))}
          </div>
        </div>
      ))}
      <ul className="chat-log">
        {view.log.map((l: string, i: number) => <li key={i}>{l}</li>)}
      </ul>
      {view.winnerId && <AwardList room={room} />}
    </div>
  );
}
