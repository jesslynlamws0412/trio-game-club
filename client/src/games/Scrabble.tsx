import { useEffect, useState } from 'react';
import { AwardList, nameOf, type GameProps } from './shared';

const PREMIUM_LABEL: Record<string, string> = { TW: '3×词', DW: '2×词', TL: '3×字', DL: '2×字' };
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface Pending {
  id: number;
  letter?: string; // 空白牌选的字母
}

export default function Scrabble({ room, view, act }: GameProps) {
  const myTurn = view.turnId === room.you;
  const [pending, setPending] = useState<Record<string, Pending>>({}); // "r,c" -> 牌
  const [selected, setSelected] = useState<number | null>(null); // 选中的手牌 id
  const [askBlank, setAskBlank] = useState<string | null>(null); // 正在给哪个格子的空白牌选字母
  const [exchanging, setExchanging] = useState<number[] | null>(null);
  const [order, setOrder] = useState<number[]>([]); // 手牌显示顺序（只在本地）

  // 轮到别人，或手牌变了（上一手被接受）→ 清掉本地摆放
  const rackKey = view.rack.map((t: any) => t.id).join(',');
  useEffect(() => {
    setPending({});
    setSelected(null);
    setAskBlank(null);
    setExchanging(null);
  }, [rackKey, view.turnId]);

  const used = new Set(Object.values(pending).map((p) => p.id));
  const rack = [...view.rack].sort((a: any, b: any) => order.indexOf(a.id) - order.indexOf(b.id));
  const tileOf = (id: number) => view.rack.find((t: any) => t.id === id);

  const clickCell = (r: number, c: number) => {
    if (!myTurn || view.over) return;
    const key = `${r},${c}`;
    if (pending[key]) {
      const next = { ...pending };
      delete next[key];
      setPending(next);
      return;
    }
    if (view.board[r][c] || selected === null) return;
    const t = tileOf(selected);
    if (t.ch === '?') {
      setAskBlank(key);
      return;
    }
    setPending({ ...pending, [key]: { id: selected } });
    setSelected(null);
  };

  const chooseLetter = (letter: string) => {
    if (askBlank === null || selected === null) return;
    setPending({ ...pending, [askBlank]: { id: selected, letter } });
    setAskBlank(null);
    setSelected(null);
  };

  const submit = async () => {
    const tiles = Object.entries(pending).map(([k, p]) => {
      const [r, c] = k.split(',').map(Number);
      return { id: p.id, r, c, letter: p.letter };
    });
    await act({ type: 'play', tiles });
  };

  const confirmExchange = async () => {
    if (!exchanging || exchanging.length === 0) return;
    const err = await act({ type: 'exchange', tiles: exchanging });
    if (!err) setExchanging(null);
  };

  const shuffleRack = () => setOrder(view.rack.map((t: any) => t.id).sort(() => Math.random() - 0.5));

  const lastCells = new Set((view.last?.cells ?? []).map(([r, c]: number[]) => `${r},${c}`));
  const ranking = [...room.players].sort((a, b) => view.scores[b.id] - view.scores[a.id]);

  return (
    <div>
      <h2>🔤 拼字游戏 <small>牌袋剩 {view.bag} 张</small></h2>
      {view.over ? (
        <p className="question">游戏结束！{view.wentOut ? `${nameOf(room, view.wentOut)} 用完了所有牌。` : ''}</p>
      ) : (
        <p className="hint">
          {myTurn
            ? exchanging
              ? '选择要换掉的牌，然后点“确认换牌”。'
              : view.empty
                ? '轮到你了：先点手牌，再点棋盘格子放牌，拼出的第一个单词要经过中心 ★。'
                : '轮到你了：点手牌，再点棋盘空格放牌；点已放的牌可以收回。'
            : `等待 ${nameOf(room, view.turnId)}……`}
        </p>
      )}

      <div className="scr-board">
        {view.board.map((row: any[], r: number) =>
          row.map((cell, c) => {
            const key = `${r},${c}`;
            const p = pending[key];
            const prem = view.premium[r][c];
            const center = r === 7 && c === 7;
            const letter = cell ? cell.ch : p ? p.letter ?? tileOf(p.id)?.ch : null;
            const blank = cell ? cell.blank : p ? tileOf(p.id)?.ch === '?' : false;
            return (
              <button
                key={key}
                className={'scr-cell' + (prem ? ' p-' + prem : '') + (cell ? ' placed' : '') + (p ? ' pending' : '') + (cell && lastCells.has(key) ? ' last' : '')}
                onClick={() => clickCell(r, c)}
                aria-label={`${r + 1}行${c + 1}列`}
              >
                {letter ? (
                  <>
                    <b>{letter}</b>
                    {!blank && <i>{view.values[letter]}</i>}
                  </>
                ) : center ? (
                  '★'
                ) : (
                  <small>{prem ? PREMIUM_LABEL[prem] : ''}</small>
                )}
              </button>
            );
          }),
        )}
      </div>

      {askBlank && (
        <div className="scr-blank">
          <span>空白牌当作哪个字母？</span>
          <div className="scr-letters">
            {LETTERS.map((l) => <button key={l} className="btn small ghost" onClick={() => chooseLetter(l)}>{l}</button>)}
          </div>
          <button className="btn small ghost" onClick={() => setAskBlank(null)}>取消</button>
        </div>
      )}

      {view.last && !view.over && (
        <p className="answer-box">
          {nameOf(room, view.last.by)}：{view.last.words.map((w: any) => `${w.word}(${w.points})`).join('、')}{view.last.bingo ? ' ＋50 全部用完！' : ''} = {view.last.total} 分
        </p>
      )}

      <div className="hint">你的字母牌（点选，再点棋盘）：</div>
      <div className="scr-rack">
        {rack.map((t: any) => {
          const placedNow = used.has(t.id);
          const marked = exchanging?.includes(t.id);
          return (
            <button
              key={t.id}
              className={'scr-tile' + (selected === t.id ? ' sel' : '') + (marked ? ' marked' : '')}
              disabled={view.over || (placedNow && !exchanging)}
              style={placedNow ? { opacity: 0.25 } : undefined}
              onClick={() => {
                if (exchanging) setExchanging(marked ? exchanging.filter((x) => x !== t.id) : [...exchanging, t.id]);
                else setSelected(selected === t.id ? null : t.id);
              }}
            >
              <b>{t.ch === '?' ? '␣' : t.ch}</b>
              <i>{t.ch === '?' ? '' : view.values[t.ch]}</i>
            </button>
          );
        })}
      </div>

      {!view.over && myTurn && !exchanging && (
        <div className="actions row">
          <button className="btn small green" disabled={Object.keys(pending).length === 0} onClick={submit}>✔ 提交 ({Object.keys(pending).length})</button>
          <button className="btn small ghost" disabled={Object.keys(pending).length === 0} onClick={() => setPending({})}>收回全部</button>
          <button className="btn small ghost" onClick={shuffleRack}>🔀 打乱</button>
          <button className="btn small ghost" disabled={!view.canExchange} onClick={() => setExchanging([])}>换牌</button>
          <button className="btn small ghost" onClick={() => act({ type: 'pass' })}>跳过</button>
        </div>
      )}
      {!view.over && myTurn && exchanging && (
        <div className="actions row">
          <button className="btn small green" disabled={exchanging.length === 0} onClick={confirmExchange}>确认换牌 ({exchanging.length})</button>
          <button className="btn small ghost" onClick={() => setExchanging(null)}>取消</button>
        </div>
      )}

      <ul className="awards">
        {ranking.map((p) => (
          <li key={p.id}>
            <span>{p.avatar} {p.nickname}{view.turnId === p.id ? ' 👈' : ''}</span>
            <b>{view.scores[p.id]} 分{view.over && view.racks ? ` · 剩 ${view.racks[p.id].join('') || '无'}` : ` · ${view.counts[p.id]} 张`}</b>
          </li>
        ))}
      </ul>
      {!view.over && view.stall > 0 && <p className="hint">连续 {view.stall} 手没人得分，满 {view.stallLimit} 手游戏结束。</p>}

      <ul className="chat-log">
        {view.log.map((l: string, i: number) => <li key={i}>{l}</li>)}
      </ul>
      {view.over && <AwardList room={room} />}
    </div>
  );
}
