import { useState } from 'react';
import { AwardList, nameOf, type GameProps } from './shared';

const FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function Dice({ list }: { list: number[] }) {
  return <span className="dice-row">{list.map((d, i) => <span key={i} className="die">{FACE[d]}</span>)}</span>;
}

export default function DiceGame({ room, view, act }: GameProps) {
  const [qty, setQty] = useState(1);
  const [face, setFace] = useState(2);
  const myTurn = view.phase === 'bid' && view.turnId === room.you;

  if (view.phase === 'over') {
    return (
      <div>
        <h2>🎲 吹牛骰子 · 结束</h2>
        <p className="question">🏆 {nameOf(room, view.winnerId)} 获胜！</p>
        <p className="hint">名次奖励（最后留下 +3 / 最后出局 +2 / 其次 +1）：</p>
        <AwardList room={room} />
      </div>
    );
  }

  const bid = view.bid;
  const minQty = bid ? bid.qty : 1;
  // 数量相同必须点数更大：自动给出一个合法的默认值
  const legal = !bid || qty > bid.qty || (qty === bid.qty && face > bid.face);

  return (
    <div>
      <h2>🎲 吹牛骰子 <small>第 {view.round} 轮 · 全场 {view.total} 颗</small></h2>
      <ul className="awards">
        {room.players.map((p) => (
          <li key={p.id}>
            <span>{p.avatar} {p.nickname}{view.turnId === p.id ? ' 👈' : ''}</span>
            <b>
              {view.out.includes(p.id) ? '已出局' : `${view.counts[p.id]} 颗`}
              {view.allDice?.[p.id] && <Dice list={view.allDice[p.id]} />}
            </b>
          </li>
        ))}
      </ul>

      {view.myDice.length > 0 && (
        <p>你的骰子：<Dice list={view.myDice} /></p>
      )}

      {view.phase === 'reveal' && view.result ? (
        <div>
          <p className="question">
            {nameOf(room, view.result.caller)} 开了 {nameOf(room, view.result.bid.by)} 的“{view.result.bid.qty} 个 {view.result.bid.face}”：
            全场实际有 {view.result.count} 个（含 1 点）→ <b>{nameOf(room, view.result.loser)}</b> 输掉一颗骰子
          </p>
          <p className="hint">马上进入下一轮……</p>
        </div>
      ) : (
        <>
          <p className="question">
            {bid ? <>当前叫数：{nameOf(room, bid.by)} 叫了 <b>{bid.qty} 个 {FACE[bid.face]}（{bid.face}）</b></> : '还没有人叫数'}
          </p>
          {myTurn ? (
            <div className="dice-bid">
              <label>数量
                <input type="number" min={minQty} max={view.total} value={qty}
                  onChange={(e) => setQty(Math.max(1, Math.min(view.total, Number(e.target.value) || 1)))} />
              </label>
              <label>点数
                <select value={face} onChange={(e) => setFace(Number(e.target.value))}>
                  {[2, 3, 4, 5, 6].map((f) => <option key={f} value={f}>{FACE[f]} {f}</option>)}
                </select>
              </label>
              <button className="btn small primary" disabled={!legal} onClick={() => act({ type: 'bid', qty, face })}>叫数</button>
              {bid && <button className="btn small gold" onClick={() => act({ type: 'call' })}>开！</button>}
              {!legal && <p className="hint">必须比上家更多，或数量相同点数更大</p>}
            </div>
          ) : (
            <p className="hint">等待 {nameOf(room, view.turnId)} 行动……（1 点是万能点）</p>
          )}
        </>
      )}
    </div>
  );
}
