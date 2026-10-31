import { useEffect, useState } from 'react';
import { send } from '../socket';
import type { RoomView } from '../types';

export interface GameProps {
  room: RoomView;
  view: any;
  /** 发送游戏操作；失败时返回错误文字 */
  act: (action: unknown) => Promise<string | null>;
}

export function useAct(setError: (e: string) => void) {
  return async (action: unknown) => {
    const res = await send('game:action', action);
    if (!res.ok) {
      setError(res.error);
      return res.error;
    }
    setError('');
    return null;
  };
}

/** 以服务器发来的“剩余毫秒”为准，在本地倒数。view 每次变化都会重新校准。 */
export function useCountdown(endsInMs: number, resetKey: unknown): number {
  const [left, setLeft] = useState(Math.ceil(endsInMs / 1000));
  useEffect(() => {
    const deadline = Date.now() + endsInMs;
    setLeft(Math.ceil(endsInMs / 1000));
    if (endsInMs <= 0) return;
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 250);
    return () => clearInterval(t);
  }, [endsInMs, resetKey]);
  return left;
}

export function nameOf(room: RoomView, id: string | null | undefined) {
  const p = room.players.find((x) => x.id === id);
  return p ? `${p.avatar} ${p.nickname}` : '?';
}

export function ChatBox({
  room, messages, onSend, placeholder,
}: {
  room: RoomView;
  messages: { playerId: string; text: string }[];
  onSend: (text: string) => Promise<string | null>;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    const err = await onSend(t);
    if (!err) setText('');
  };
  return (
    <div className="chat">
      <ul className="chat-log">
        {messages.length === 0 && <li className="hint">还没有人发言</li>}
        {messages.map((m, i) => (
          <li key={i} className={m.playerId === room.you ? 'mine' : ''}>
            <b>{nameOf(room, m.playerId)}：</b>{m.text}
          </li>
        ))}
      </ul>
      <div className="chat-input">
        <input
          value={text}
          maxLength={100}
          placeholder={placeholder ?? '输入内容后回车发送'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="btn small green" onClick={submit}>发送</button>
      </div>
    </div>
  );
}

export function AwardList({ room }: { room: RoomView }) {
  if (!room.awards) return null;
  return (
    <ul className="awards">
      {room.players.map((p) => (
        <li key={p.id}>
          <span>{p.avatar} {p.nickname}</span>
          <b>+{room.awards![p.id] ?? 0} 分</b>
        </li>
      ))}
    </ul>
  );
}
