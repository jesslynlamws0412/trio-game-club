import { useEffect, useState } from 'react';
import { loadSession, saveSession, send, socket } from './socket';
import type { RoomView } from './types';
import Home from './pages/Home';
import Room from './pages/Room';

export default function App() {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [resuming, setResuming] = useState(!!loadSession());

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
    socket.on('room:state', onState);
    socket.on('connect', tryResume);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) tryResume();
    return () => {
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
      {!connected && <div className="banner">与服务器断开连接，正在重连……</div>}
      {resuming ? (
        <div className="center-msg">正在回到你的房间……</div>
      ) : room ? (
        <Room room={room} onLeave={leave} />
      ) : (
        <Home />
      )}
    </div>
  );
}
