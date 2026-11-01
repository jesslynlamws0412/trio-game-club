import { useEffect, useState } from 'react';
import { loadSession, saveLocal, saveSession, send, socket } from './socket';
import type { RoomView } from './types';
import Platform from './pages/Platform';
import Room from './pages/Room';
import LocalRoom from './pages/LocalRoom';
import SoundSettings from './components/SoundSettings';
import { sfx, unlockAudio } from './audio';

export default function App() {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [resuming, setResuming] = useState(!!loadSession());

  // 全局：点任何可用的按钮都有点击声；第一次点击时解锁音频并开始背景音乐
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      unlockAudio();
      const b = (e.target as HTMLElement | null)?.closest('button');
      if (b && !b.disabled && !b.classList.contains('sound-btn')) sfx.click();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    const onState = (v: RoomView) => setRoom(v);
    const tryResume = async () => {
      setConnected(true);
      const s = loadSession();
      if (!s) return setResuming(false);
      const res = await send('room:resume', s);
      if (!res.ok) {
        saveSession(null);
        setRoom(null);
      }
      setResuming(false);
    };
    const onDisconnect = () => setConnected(false);
    const onKicked = () => {
      saveSession(null);
      setRoom(null);
      alert('你已被房主移出房间');
    };
    const onClosed = () => {
      saveSession(null);
      saveLocal(null);
      setRoom(null);
      alert('房主已关闭房间');
    };
    socket.on('room:closed', onClosed);
    socket.on('room:kicked', onKicked);
    socket.on('room:state', onState);
    socket.on('connect', tryResume);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) tryResume();
    return () => {
      socket.off('room:closed', onClosed);
      socket.off('room:kicked', onKicked);
      socket.off('room:state', onState);
      socket.off('connect', tryResume);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const leave = async () => {
    await send('room:leave');
    saveSession(null);
    setRoom(null);
  };

  return (
    <div className="app">
      <SoundSettings />
      {!connected && <div className="banner">与服务器断开连接，正在重连……</div>}
      {resuming ? (
        <div className="center-msg">正在回到你的房间……</div>
      ) : room ? (
        room.local ? <LocalRoom room={room} onLeave={leave} /> : <Room room={room} onLeave={leave} />
      ) : (
        <Platform />
      )}
    </div>
  );
}
