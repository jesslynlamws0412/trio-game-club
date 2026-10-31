import { useEffect, useState } from 'react';
import { getDeviceId, loadProfile, loadSession, request, saveProfile, saveSession, send, socket } from './socket';
import type { RoomView } from './types';
import Platform from './pages/Platform';
import Room from './pages/Room';
import LocalRoom from './pages/LocalRoom';

interface Invite { nickname: string; avatar: string; code: string; mode: string }
interface Toast { id: number; icon: string; name: string; desc: string }
const MODE_NAME: Record<string, string> = { solo: '单人', duo: '双人', trio: '三人', party: '多人' };

export default function App() {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [resuming, setResuming] = useState(!!loadSession());
  const [invite, setInvite] = useState<Invite | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [inviteMsg, setInviteMsg] = useState('');

  useEffect(() => {
    const onState = (v: RoomView) => setRoom(v);
    const tryResume = async () => {
      setConnected(true);
      // 让服务器知道这个浏览器在线，好友才能邀请到你
      request('me:get');
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
    const onInvite = (v: Invite) => {
      setInvite(v);
      setInviteMsg('');
    };
    const onAch = (list: { id: string; name: string; icon: string; desc: string }[]) => {
      const mine = list.map((a, i) => ({ id: Date.now() + i, icon: a.icon, name: a.name, desc: a.desc }));
      setToasts((t) => [...t, ...mine]);
      setTimeout(() => setToasts((t) => t.filter((x) => !mine.some((m) => m.id === x.id))), 6000);
    };
    socket.on('room:kicked', onKicked);
    socket.on('room:state', onState);
    socket.on('invite:received', onInvite);
    socket.on('achievement:unlocked', onAch);
    socket.on('connect', tryResume);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) tryResume();
    return () => {
      socket.off('room:kicked', onKicked);
      socket.off('room:state', onState);
      socket.off('invite:received', onInvite);
      socket.off('achievement:unlocked', onAch);
      socket.off('connect', tryResume);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const leave = async () => {
    await send('room:leave');
    saveSession(null);
    setRoom(null);
  };

  const acceptInvite = async () => {
    if (!invite) return;
    if (room) return setInviteMsg('你已经在一个房间里了，请先退出当前房间再加入。');
    let p = loadProfile();
    if (!p) {
      const nick = prompt('请输入你的昵称（最多 8 个字）')?.trim();
      if (!nick) return;
      p = { nickname: nick.slice(0, 8), avatar: '🦊' };
      saveProfile(p);
    }
    const res = await send('room:join', { code: invite.code, nickname: p.nickname, avatar: p.avatar, deviceId: getDeviceId() });
    if (!res.ok) return setInviteMsg(res.error);
    saveSession({ code: res.code!, token: res.token! });
    setInvite(null);
  };

  return (
    <div className="app">
      {!connected && <div className="banner">与服务器断开连接，正在重连……</div>}
      {invite && (
        <div className="invite-bar" role="alert">
          <span>{invite.avatar} <b>{invite.nickname}</b> 邀请你加入{MODE_NAME[invite.mode] ?? ''}房间 <b>{invite.code}</b></span>
          <span className="invite-actions">
            <button className="btn small green" onClick={acceptInvite}>加入</button>
            <button className="btn small ghost" onClick={() => setInvite(null)}>忽略</button>
          </span>
          {inviteMsg && <span className="invite-msg">{inviteMsg}</span>}
        </div>
      )}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast">🏅 解锁成就 {t.icon} <b>{t.name}</b><div className="hint">{t.desc}</div></div>
        ))}
      </div>
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
