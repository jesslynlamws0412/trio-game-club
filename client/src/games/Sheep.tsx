import { AwardList, nameOf, type GameProps } from './shared';

const U = 20; // 半格的像素宽度：一块牌 = 2 个单位 = 40px，棋盘 14 单位 + 牌宽 = 320px，刚好放得进手机屏幕

export default function Sheep({ room, view, act }: GameProps) {
  const done = view.won || view.lost;
  const W = 14 * U + 2 * U;
  return (
    <div>
      <h2>🐑 羊了个羊 <small>消除 {view.cleared} / {view.total}</small></h2>
      {view.won ? (
        <p className="question">🎉 通关！所有牌都消除了！</p>
      ) : view.lost ? (
        <p className="question">托盘满了……挑战失败{room.players.length > 1 ? '，等其他人结束' : ''}。</p>
      ) : (
        <p className="hint">点没有被压住的牌，放进下面的托盘；集齐 3 张相同的自动消除。托盘放满 7 张就输了。</p>
      )}
      <div className="sheep-board" style={{ width: W, height: W, maxWidth: '100%' }}>
        {view.tiles.map((t: any) => (
          <button
            key={t.id}
            className={'sheep-tile' + (t.blocked ? ' blocked' : '')}
            style={{ left: t.x * U, top: t.y * U, zIndex: t.z + 1, width: 2 * U - 2, height: 2 * U - 2, fontSize: U * 1.2 }}
            disabled={t.blocked || done || view.over}
            onClick={() => act({ type: 'pick', tile: t.id })}
          >
            {t.type}
          </button>
        ))}
      </div>
      <div className="sheep-tray">
        {Array.from({ length: view.trayMax }, (_, i) => (
          <span key={i} className="sheep-slot">{view.tray[i]?.type ?? ''}</span>
        ))}
      </div>
      <div className="actions row">
        <button className="btn small gold" disabled={!view.power.undo || done} onClick={() => act({ type: 'undo' })}>↩ 撤回</button>
        <button className="btn small gold" disabled={!view.power.shuffle || done} onClick={() => act({ type: 'shuffle' })}>🔀 洗牌</button>
        <button className="btn small gold" disabled={!view.power.remove || done} onClick={() => act({ type: 'remove' })}>📤 移出 3 张</button>
      </div>
      {room.players.length > 1 && (
        <ul className="awards">
          {room.players.map((p) => {
            const g = view.progress[p.id];
            return (
              <li key={p.id}>
                <span>{p.avatar} {p.nickname}{p.id === room.you ? '（你）' : ''}</span>
                <b>{g.won ? '🎉 通关' : g.lost ? '失败' : `已消除 ${g.cleared}`}</b>
              </li>
            );
          })}
        </ul>
      )}
      {view.over && <AwardList room={room} />}
    </div>
  );
}
