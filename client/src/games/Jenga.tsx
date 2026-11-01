import { AwardList, nameOf, type GameProps } from './shared';

export default function Jenga({ room, view, act }: GameProps) {
  const myTurn = view.turnId === room.you;
  const rows = view.levels.map((row: boolean[], i: number) => ({ row, i })).reverse(); // 最高层在上面

  return (
    <div>
      <h2>🧱 叠叠高 <small>已抽 {view.total} / {view.maxPulls} 块</small></h2>
      {view.over ? (
        <p className="question">
          {view.collapsedBy ? <>💥 {nameOf(room, view.collapsedBy)} 把塔抽倒了！</> : '🎉 塔一直没倒，大家都赢了！'}
        </p>
      ) : (
        <p className="hint">{myTurn ? '轮到你了：点一块积木抽出来（数字是塔倒的风险）' : `等待 ${nameOf(room, view.turnId)} 抽积木……`}</p>
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
                    aria-label={`第 ${i + 1} 层第 ${s + 1} 块`}
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
            <b>抽出 {view.pulls[p.id]} 块</b>
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
