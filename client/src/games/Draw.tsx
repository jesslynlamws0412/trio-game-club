import { useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import { nameOf, useCountdown, type GameProps } from './shared';

// 画布逻辑坐标：x、y 都是 0~1000 的整数（服务器也用这个范围），画布显示为 4:3
const W = 1000;
const H = 750;
const BG = '#fffaf0';
const COLORS = ['#3b2a1e', '#7a1f2b', '#234d3a', '#b8923a', '#2f5d9e', '#d9822b', '#7b4fa0', '#e58aa0'];
const SIZES = [4, 10, 22];

interface Stroke {
  id: string;
  color: string;
  size: number;
  points: [number, number][];
}

function paint(ctx: CanvasRenderingContext2D, s: Stroke, from = 0) {
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pts = s.points;
  if (pts.length === 1 && from === 0) {
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], s.size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(...pts[Math.max(0, from - 1)]);
  for (let i = Math.max(1, from); i < pts.length; i++) ctx.lineTo(...pts[i]);
  ctx.stroke();
}

export default function Draw({ room, view, act }: GameProps) {
  const isDrawer = view.drawerId === room.you;
  const left = useCountdown(view.endsInMs, view);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [eraser, setEraser] = useState(false);
  const [guess, setGuess] = useState('');

  const redraw = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    for (const s of strokes.current) paint(ctx, s);
  };

  // 回合变化（或重连）时，用服务器的完整画布重置；画家本人在回合内不被覆盖，避免丢掉还没发出的笔画
  const roundKey = `${view.round}-${view.phase}`;
  useEffect(() => {
    strokes.current = JSON.parse(JSON.stringify(view.canvas));
    redraw();
  }, [roundKey]);
  useEffect(() => {
    if (!isDrawer) {
      strokes.current = JSON.parse(JSON.stringify(view.canvas));
      redraw();
    }
  }, [view]);

  // 接收画家的实时增量
  useEffect(() => {
    const onDelta = (d: any) => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      if (d.op === 'clear') {
        strokes.current = [];
        redraw();
      } else if (d.op === 'undo') {
        strokes.current.pop();
        redraw();
      } else if (d.op === 'stroke') {
        let s = strokes.current.find((x) => x.id === d.id);
        const from = s ? s.points.length : 0;
        if (!s) {
          s = { id: d.id, color: d.color, size: d.size, points: [] };
          strokes.current.push(s);
        }
        s.points.push(...d.points);
        paint(ctx, s, from);
      }
    };
    socket.on('game:delta', onDelta);
    return () => {
      socket.off('game:delta', onDelta);
    };
  }, []);

  // ---- 画家的绘制 ----
  const current = useRef<{ stroke: Stroke; sent: number } | null>(null);
  const counter = useRef(0);

  const pos = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * W), Math.round(((e.clientY - r.top) / r.height) * H)];
  };
  const flush = () => {
    const cur = current.current;
    if (!cur || cur.sent >= cur.stroke.points.length) return;
    const pts = cur.stroke.points.slice(cur.sent);
    cur.sent = cur.stroke.points.length;
    act({ type: 'stroke', id: cur.stroke.id, color: cur.stroke.color, size: cur.stroke.size, points: pts });
  };
  useEffect(() => {
    const t = setInterval(flush, 60);
    return () => clearInterval(t);
  });

  const down = (e: React.PointerEvent) => {
    if (!isDrawer || view.phase !== 'drawing') return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const s: Stroke = {
      id: `${room.you.slice(0, 6)}-${Date.now()}-${counter.current++}`,
      color: eraser ? BG : color,
      size: eraser ? Math.max(size * 2, 16) : size,
      points: [pos(e)],
    };
    strokes.current.push(s);
    current.current = { stroke: s, sent: 0 };
    const ctx = canvasRef.current!.getContext('2d')!;
    paint(ctx, s);
  };
  const move = (e: React.PointerEvent) => {
    const cur = current.current;
    if (!cur) return;
    const from = cur.stroke.points.length;
    cur.stroke.points.push(pos(e));
    paint(canvasRef.current!.getContext('2d')!, cur.stroke, from);
  };
  const up = () => {
    flush();
    current.current = null;
  };

  const undo = () => {
    strokes.current.pop();
    redraw();
    act({ type: 'undo' });
  };
  const clear = () => {
    strokes.current = [];
    redraw();
    act({ type: 'clear' });
  };

  const submitGuess = async () => {
    const t = guess.trim();
    if (!t) return;
    const err = await act({ type: 'guess', text: t });
    if (!err) setGuess('');
  };

  const solvedMe = view.solved.includes(room.you);
  const drawing = view.phase === 'drawing';

  return (
    <div>
      <h2>
        🎨 你画我猜 <small>第 {view.round + 1} / {view.totalRounds} 回合</small>
      </h2>

      {view.phase !== 'over' && (
        <div className="draw-head">
          <div>
            画家：<b>{nameOf(room, view.drawerId)}</b>
          </div>
          {drawing && <div className="timer small">{left}</div>}
        </div>
      )}

      {view.phase !== 'over' && (
        <div className="word-card">
          {isDrawer && drawing && (
            <>
              <div className="label">请你画</div>
              <div className="word">{view.word}</div>
            </>
          )}
          {!isDrawer && drawing && (
            <>
              <div className="label">提示：{view.category}</div>
              <div className="word">{'？'.repeat(view.wordLen)}</div>
              <div className="hint">共 {view.wordLen} 个字</div>
            </>
          )}
          {view.phase === 'reveal' && (
            <>
              <div className="label">答案是</div>
              <div className="word">{view.word}</div>
            </>
          )}
        </div>
      )}

      {view.phase !== 'over' && (
        <canvas
          ref={canvasRef}
          className={'draw-canvas' + (isDrawer && drawing ? ' active' : '')}
          width={W}
          height={H}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
      )}

      {isDrawer && drawing && (
        <div className="toolbar">
          <div className="swatches">
            {COLORS.map((c) => (
              <button
                key={c}
                aria-label={`颜色 ${c}`}
                className={'swatch' + (!eraser && c === color ? ' on' : '')}
                style={{ background: c }}
                onClick={() => {
                  setColor(c);
                  setEraser(false);
                }}
              />
            ))}
          </div>
          <div className="sizes">
            {SIZES.map((s) => (
              <button key={s} className={'size-btn' + (s === size ? ' on' : '')} onClick={() => setSize(s)} aria-label={`粗细 ${s}`}>
                <span style={{ width: s + 2, height: s + 2 }} />
              </button>
            ))}
          </div>
          <button className={'btn small ' + (eraser ? 'gold' : 'ghost')} onClick={() => setEraser(!eraser)}>橡皮</button>
          <button className="btn small ghost" onClick={undo}>撤销</button>
          <button className="btn small ghost" onClick={clear}>清空</button>
        </div>
      )}

      {view.phase !== 'over' && (
        <div className="panel">
          <ul className="chat-log">
            {view.guesses.length === 0 && <li className="hint">还没有人猜词</li>}
            {view.guesses.map((g: any, i: number) => (
              <li key={i} className={g.correct ? 'right-guess' : ''}>
                <b>{nameOf(room, g.playerId)}</b>：{g.correct ? '🎉 猜对了！' : g.text}
              </li>
            ))}
          </ul>
          {!isDrawer && drawing && !solvedMe && (
            <div className="chat-input">
              <input value={guess} maxLength={20} placeholder="输入你的答案" onChange={(e) => setGuess(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitGuess()} />
              <button className="btn small primary" onClick={submitGuess}>猜！</button>
            </div>
          )}
          {solvedMe && drawing && <p className="hint">你已经猜对了，等待其他人……</p>}
          {isDrawer && drawing && <p className="hint">你是画家，不能说话提示哦。</p>}
        </div>
      )}

      <ul className="awards">
        {room.players.map((p) => (
          <li key={p.id}>
            <span>{p.avatar} {p.nickname}</span>
            <b>{view.points[p.id]} 分</b>
          </li>
        ))}
      </ul>
      {view.phase === 'over' && <p className="turn">三个回合结束！这些分数会计入总积分榜。</p>}
    </div>
  );
}
