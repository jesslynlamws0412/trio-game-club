import { useState } from 'react';
import { AwardList, nameOf, type GameProps } from './shared';
import { t } from '../i18n';

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
        <h2>🎲 {t('吹牛骰子')} · {t('结束')}</h2>
        <p className="question">🏆 {t('{name} 获胜！', { name: nameOf(room, view.winnerId) })}</p>
        <p className="hint">{t('名次奖励（最后留下 +3 / 最后出局 +2 / 其次 +1）：')}</p>
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
      <h2>🎲 {t('吹牛骰子')} <small>{t('第 {a} 轮 · 全场 {b} 颗', { a: view.round, b: view.total })}</small></h2>
      <ul className="awards">
        {room.players.map((p) => (
          <li key={p.id}>
            <span>{p.avatar} {p.nickname}{view.turnId === p.id ? ' 👈' : ''}</span>
            <b>
              {view.out.includes(p.id) ? t('已出局') : t('{n} 颗', { n: view.counts[p.id] })}
              {view.allDice?.[p.id] && <Dice list={view.allDice[p.id]} />}
            </b>
          </li>
        ))}
      </ul>

      {view.myDice.length > 0 && (
        <p>{t('你的骰子：')}<Dice list={view.myDice} /></p>
      )}

      {view.phase === 'reveal' && view.result ? (
        <div>
          <p className="question">
            {t('{a} 开了 {b} 的“{qty} 个 {face}”：', { a: nameOf(room, view.result.caller), b: nameOf(room, view.result.bid.by), qty: view.result.bid.qty, face: view.result.bid.face })}
            {t('全场实际有 {n} 个（含 1 点）→', { n: view.result.count })} <b>{nameOf(room, view.result.loser)}</b> {t('输掉一颗骰子')}
          </p>
          <p className="hint">{t('马上进入下一轮……')}</p>
        </div>
      ) : (
        <>
          <p className="question">
            {bid ? <>{t('当前叫数：{name} 叫了', { name: nameOf(room, bid.by) })} <b>{t('{qty} 个', { qty: bid.qty })} {FACE[bid.face]}（{bid.face}）</b></> : t('还没有人叫数')}
          </p>
          {myTurn ? (
            <div className="dice-bid">
              <label>{t('数量')}
                <input type="number" min={minQty} max={view.total} value={qty}
                  onChange={(e) => setQty(Math.max(1, Math.min(view.total, Number(e.target.value) || 1)))} />
              </label>
              <label>{t('点数')}
                <select value={face} onChange={(e) => setFace(Number(e.target.value))}>
                  {[2, 3, 4, 5, 6].map((f) => <option key={f} value={f}>{FACE[f]} {f}</option>)}
                </select>
              </label>
              <button className="btn small primary" disabled={!legal} onClick={() => act({ type: 'bid', qty, face })}>{t('叫数')}</button>
              {bid && <button className="btn small gold" onClick={() => act({ type: 'call' })}>{t('开！')}</button>}
              {!legal && <p className="hint">{t('必须比上家更多，或数量相同点数更大')}</p>}
            </div>
          ) : (
            <p className="hint">{t('等待 {name} 行动……（1 点是万能点）', { name: nameOf(room, view.turnId) })}</p>
          )}
        </>
      )}
    </div>
  );
}
