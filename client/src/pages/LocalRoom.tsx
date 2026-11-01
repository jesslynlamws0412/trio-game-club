import { useEffect, useLayoutEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { extraSockets, langAuth, loadLocal, localSetup, saveLocal, saveSession, setActiveSocket, socket } from '../socket';
import { t } from '../i18n';
import type { RoomView } from '../types';
import Room from './Room';

/**
 * 现在轮到谁操作？返回玩家 id；返回 null 表示现在不需要交接（大厅、揭晓、结束，或两人都可以操作）。
 * 只有 catalog.ts 里 LOCAL_GAMES 列出的游戏需要在这里说明。
 */
function nextActor(game: string | null, view: any, ids: string[]): string | null {
  if (!game || !view) return null;
  switch (game) {
    case 'number':
    case 'memory':
    case 'dice':
    case 'idiom':
    case 'tictactoe':
    case 'gomoku':
    case 'snakes':
    case 'ludo':
    case 'uno':
    case 'jenga':
    case 'scrabble':
      return view.turnId ?? null;
    case 'millionaire':
      return view.phase === 'ask' ? view.contestantId ?? null : null;
    case 'liar':
      // 写谎话 / 投票都是秘密的：谁还没提交，就轮到谁
      if (view.phase === 'write') return ids.find((id) => !view.written.includes(id)) ?? null;
      if (view.phase === 'vote') return ids.find((id) => !view.voted.includes(id)) ?? null;
      return null;
    case 'rps':
    case 'tacit':
      // 秘密选择：谁还没选，就轮到谁；两人都选完后进入揭晓，不需要再交接
      return view.phase === 'pick' ? (ids.find((id) => !view.answered.includes(id)) ?? null) : null;
    case 'truth':
      if (view.phase === 'choose') return view.playerId ?? null;
      if (view.phase === 'judge') return ids.find((id) => id !== view.playerId && !view.voted.includes(id)) ?? null;
      return null;
    default:
      return null;
  }
}

/**
 * 本地轮流：两位玩家共用这台设备。这里额外开一个连接代表第二位玩家，
 * 轮到谁操作就切到谁的视角；换人时先盖住屏幕，避免看到对方的骰子、选择等私密信息。
 */
export default function LocalRoom({ room, onLeave }: { room: RoomView; onLeave: () => void }) {
  const [guest, setGuest] = useState<Socket | null>(null);
  const [guestView, setGuestView] = useState<RoomView | null>(null);
  const [active, setActive] = useState<0 | 1>(0);
  const [error, setError] = useState('');

  // 第二位玩家的连接：加入同一个房间（用创建时拿到的密钥），断线后用 token 自动重连
  useEffect(() => {
    const g = io({ forceNew: true, auth: langAuth });
    extraSockets.add(g);
    setGuest(g);
    g.on('room:state', (v: RoomView) => setGuestView(v));
    let joined = false;
    const join = () => {
      const stored = loadLocal();
      if (stored && stored.code === room.code) {
        g.emit('room:resume', stored, (res: any) => {
          if (res?.ok) joined = true;
          else {
            saveLocal(null);
            setError(t('本地对局已中断，请退出房间后重新开始。'));
          }
        });
        return;
      }
      const p = localSetup.pending;
      if (!p) return;
      g.emit('room:join', { code: room.code, nickname: p.nickname, avatar: p.avatar, key: p.key }, (res: any) => {
        if (res?.ok) {
          joined = true;
          localSetup.pending = null;
          saveLocal({ code: res.code, token: res.token });
        } else setError(res?.error ?? t('第二位玩家加入失败'));
      });
    };
    const onConnect = () => join();
    g.on('connect', onConnect);
    // Home 在创建房间的回复之后才写入 pending，所以没拿到时稍等一下再试
    const wait = setInterval(() => {
      if (!joined && g.connected && localSetup.pending) join();
    }, 200);
    const giveUp = setTimeout(() => {
      if (!joined && !loadLocal()) setError(t('本地对局已中断，请退出房间后重新开始。'));
    }, 5000);
    return () => {
      clearInterval(wait);
      clearTimeout(giveUp);
      extraSockets.delete(g);
      g.close();
    };
  }, [room.code]);

  // 第二位玩家自动准备（他没有自己的屏幕去点准备）
  useEffect(() => {
    if (!guest || !guestView || guestView.phase !== 'lobby') return;
    const me = guestView.players.find((p) => p.id === guestView.you);
    if (me && !me.ready) guest.emit('room:ready', { ready: true });
  }, [guest, guestView]);

  // 回到大厅时默认由房主操作（准备、选游戏、开始都在房主这边）
  useEffect(() => {
    if (room.phase === 'lobby') setActive(0);
  }, [room.phase]);

  // 发送操作的连接跟着当前玩家走
  useLayoutEffect(() => {
    if (guest) setActiveSocket(active === 0 ? socket : guest);
    return () => setActiveSocket(socket);
  }, [active, guest]);

  const ids = [room.you, guestView?.you ?? ''];
  const views = [room, guestView];
  const view = views[active] ?? room;
  const next = guestView ? nextActor(view.currentGame, view.game, ids) : null;
  const needCover = view.phase === 'playing' && next !== null && next !== view.you;

  const leave = async () => {
    guest?.emit('room:leave');
    saveLocal(null);
    saveSession(null);
    localSetup.pending = null;
    onLeave();
  };

  if (error) {
    return (
      <main className="room">
        <section className="paper card">
          <p className="error">{error}</p>
          <button className="btn primary" onClick={leave}>{t('退出房间')}</button>
        </section>
      </main>
    );
  }
  if (!guestView) return <div className="center-msg">{t('正在准备本地对局……')}</div>;

  if (needCover) {
    const target = room.players.find((p) => p.id === next) ?? guestView.players.find((p) => p.id === next);
    const idx = ids.indexOf(next!) as 0 | 1;
    return (
      <main className="room">
        <section className="paper card handoff">
          <div className="big-icon">🔒</div>
          <h2>{t('请把设备交给')} {target?.avatar} {target?.nickname}</h2>
          <p className="hint">{t('轮到 TA 操作了。换人之前，上一位玩家看不到的信息不会显示在屏幕上。')}</p>
          <button className="btn primary wide" onClick={() => setActive(idx)}>
            {t('我是 {name}，继续', { name: target?.nickname ?? '' })}
          </button>
        </section>
      </main>
    );
  }

  const other = view.players.find((p) => p.id !== view.you);
  const me = view.players.find((p) => p.id === view.you);
  return (
    <>
      <div className="local-bar">
        🎴 {t('本地轮流 · 当前玩家：')}{me?.avatar} <b>{me?.nickname}</b>
        {view.phase === 'lobby' && (
          <button className="btn small ghost" onClick={() => setActive(active === 0 ? 1 : 0)}>
            {t('切换到 {name}', { name: other?.nickname ?? '' })}
          </button>
        )}
      </div>
      <Room room={view} onLeave={leave} />
    </>
  );
}
