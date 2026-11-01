import { useState } from 'react';
import { AwardList, nameOf, type GameProps } from './shared';

const COLOR_CSS: Record<string, string> = { r: '#c0392b', y: '#d4a017', g: '#2e8b57', b: '#2c6fbb', w: '#3b2a1e' };
const COLOR_NAME: Record<string, string> = { r: '红', y: '黄', g: '绿', b: '蓝' };
const label = (k: string) => (k === 'skip' ? '🚫' : k === 'rev' ? '🔄' : k === 'd2' ? '+2' : k === 'wild' ? '🌈' : k === 'w4' ? '+4' : k);

function Card({ c, onClick, disabled, dim }: { c: { id: number; color: string; kind: string }; onClick?: () => void; disabled?: boolean; dim?: boolean }) {
  return (
    <button className={'uno-card' + (dim ? ' dim' : '')} style={{ background: COLOR_CSS[c.color] }} disabled={disabled} onClick={onClick} aria-label={`${COLOR_NAME[c.color] ?? '万能'} ${c.kind}`}>
      {label(c.kind)}
    </button>
  );
}

export default function Uno({ room, view, act }: GameProps) {
  const [picking, setPicking] = useState<number | null>(null); // 正在为哪张万能牌选颜色
  const myTurn = view.turnId === room.you;
  const drawn = view.drawnId !== null;

  const play = (id: number, wild: boolean) => {
    if (wild) setPicking(id);
    else act({ type: 'play', card: id });
  };

  return (
    <div>
      <h2>🃏 UNO <small>牌堆剩 {view.deckCount} 张 · {view.dir === 1 ? '顺时针' : '逆时针'}</small></h2>
      {view.winnerId ? (
        <p className="question">🏆 {nameOf(room, view.winnerId)} 出完了所有牌！</p>
      ) : (
        <p className="hint">{myTurn ? (drawn ? '你摸到一张能出的牌：出它，或者选择跳过' : '轮到你了：出一张牌，或者摸牌') : `等待 ${nameOf(room, view.turnId)}……`}</p>
      )}

      <div className="uno-table">
        <div>
          <div className="hint">弃牌堆</div>
          <Card c={view.top} disabled />
        </div>
        <div className="uno-color" style={{ background: COLOR_CSS[view.color] }}>当前颜色：{COLOR_NAME[view.color]}</div>
      </div>

      <ul className="awards">
        {room.players.map((p) => (
          <li key={p.id}>
            <span>{p.avatar} {p.nickname}{view.turnId === p.id ? ' 👈' : ''}</span>
            <b>{view.counts[p.id]} 张{view.counts[p.id] === 1 ? ' · UNO!' : ''}</b>
          </li>
        ))}
      </ul>

      {picking !== null && (
        <div className="uno-pick">
          <span>选择颜色：</span>
          {['r', 'y', 'g', 'b'].map((c) => (
            <button key={c} className="uno-card small" style={{ background: COLOR_CSS[c] }} onClick={() => { act({ type: 'play', card: picking, color: c }); setPicking(null); }}>
              {COLOR_NAME[c]}
            </button>
          ))}
          <button className="btn small ghost" onClick={() => setPicking(null)}>取消</button>
        </div>
      )}

      {!view.winnerId && myTurn && (
        <div className="actions row">
          {!drawn && <button className="btn small gold" onClick={() => act({ type: 'draw' })}>摸一张牌</button>}
          {drawn && <button className="btn small ghost" onClick={() => act({ type: 'pass' })}>不出，跳过</button>}
        </div>
      )}

      <div className="hint">你的手牌（{view.hand.length} 张）：</div>
      <div className="uno-hand">
        {view.hand.map((c: any) => {
          const ok = myTurn && view.playable.includes(c.id);
          return <Card key={c.id} c={c} disabled={!ok} dim={!ok} onClick={() => play(c.id, c.color === 'w')} />;
        })}
      </div>

      <ul className="chat-log">
        {view.log.map((l: string, i: number) => <li key={i}>{l}</li>)}
      </ul>
      {view.winnerId && <AwardList room={room} />}
    </div>
  );
}
