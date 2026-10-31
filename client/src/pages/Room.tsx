import { useState } from 'react';
import { send } from '../socket';
import AvatarPicker from '../components/AvatarPicker';
import type { GameInfo, RoomView } from '../types';
import Undercover from '../games/Undercover';
import Quiz from '../games/Quiz';
import TurtleSoup from '../games/TurtleSoup';
import Draw from '../games/Draw';
import Cards from '../games/Cards';
import Werewolf from '../games/Werewolf';
import Detective from '../games/Detective';
import Monopoly from '../games/Monopoly';
import Pick from '../games/Pick';
import DiceGame from '../games/Dice';
import NumberGuess from '../games/NumberGuess';
import Memory from '../games/Memory';
import Rps from '../games/Rps';
import Idiom from '../games/Idiom';
import Truth from '../games/Truth';
import Reaction from '../games/Reaction';
import { useAct, type GameProps } from '../games/shared';

const GAME_COMPONENTS: Record<string, (p: GameProps) => JSX.Element> = {
  undercover: Undercover,
  quiz: Quiz,
  turtlesoup: TurtleSoup,
  draw: Draw,
  cards: Cards,
  werewolf: Werewolf,
  detective: Detective,
  monopoly: Monopoly,
  likely: Pick,
  tacit: Pick,
  dice: DiceGame,
  number: NumberGuess,
  memory: Memory,
  truefalse: Pick,
  rps: Rps,
  idiom: Idiom,
  truth: Truth,
  reaction: Reaction,
};
const useActFn = useAct;

interface Props {
  room: RoomView;
  onLeave: () => void;
}

export default function Room({ room, onLeave }: Props) {
  const [error, setError] = useState('');
  const [rulesFor, setRulesFor] = useState<GameInfo | null>(null);
  const [editing, setEditing] = useState(false);

  const me = room.players.find((p) => p.id === room.you)!;
  const isHost = room.hostId === room.you;
  const enough = room.players.length >= room.minPlayers;
  const allReady = enough && room.players.every((p) => p.ready);
  const MODE_NAME = { solo: '单人', duo: '双人', trio: '三人', party: '多人' }[room.mode];
  const selected = room.catalog.find((g) => g.id === room.selectedGame) ?? null;

  const call = async (event: string, data?: unknown) => {
    setError('');
    const res = await send(event, data);
    if (!res.ok) setError(res.error);
  };

  if (room.phase === 'playing') {
    const game = room.catalog.find((g) => g.id === room.currentGame);
    const act = useActFn(setError);
    const Comp = room.game ? GAME_COMPONENTS[room.game.game] : undefined;
    return (
      <main className="room">
        <section className="paper card playing">
          {Comp ? (
            <Comp room={room} view={room.game} act={act} />
          ) : (
            <>
              <div className="big-icon">{game?.icon}</div>
              <h2>{game?.name}</h2>
              <p>本游戏的玩法将在后续开发阶段加入。</p>
            </>
          )}
          {error && <p className="error">{error}</p>}
          <div className="end-bar">
            {room.gameOver ? (
              <button className="btn primary" onClick={() => call('game:end')}>
                结算并返回大厅
              </button>
            ) : isHost ? (
              <button className="btn ghost small" onClick={() => confirm('中止游戏不会计分，确定吗？') && call('game:end')}>
                中止游戏
              </button>
            ) : (
              <p className="hint">房主可以中止游戏。</p>
            )}
            <button className="btn ghost small" onClick={() => confirm('退出后本局游戏将作废，确定吗？') && onLeave()}>
              退出房间
            </button>
          </div>
        </section>
      </main>
    );
  }

  const slots = Array.from({ length: room.maxPlayers }, (_, i) => room.players[i] ?? null);
  const ranking = [...room.players].sort((a, b) => b.score - a.score);

  return (
    <main className="room">
      <header className="room-head">
        <div>
          <div className="label">房间号</div>
          <div className="room-code">{room.code}</div>
        </div>
        <button className="btn ghost" onClick={onLeave}>
          退出房间
        </button>
      </header>

      <section className="paper card">
        <h2>
          玩家名单 <small>{room.players.length} / {room.maxPlayers}</small>
        </h2>
        <ul className="players">
          {slots.map((p, i) =>
            p ? (
              <li key={p.id} className={'player' + (p.connected ? '' : ' offline')}>
                <span className="p-avatar">{p.avatar}</span>
                <span className="p-name">
                  {p.nickname}
                  {p.id === room.hostId && <em className="tag gold">房主</em>}
                  {p.id === room.you && <em className="tag">你</em>}
                </span>
                <span className={'p-state' + (p.ready ? ' ok' : '')}>
                  {!p.connected ? '掉线中' : p.ready ? '已准备' : '未准备'}
                </span>
                {isHost && p.id !== room.you && (
                  <button
                    className="btn ghost small"
                    onClick={() => confirm(`确定把 ${p.nickname} 移出房间吗？`) && call('room:kick', { playerId: p.id })}
                  >
                    移出
                  </button>
                )}
              </li>
            ) : (
              <li key={'empty' + i} className="player empty">
                <span className="p-avatar">?</span>
                <span className="p-name">等待玩家加入…</span>
              </li>
            ),
          )}
        </ul>
        {!enough && (
          <p className="hint">
            把房间号 <b>{room.code}</b> 发给朋友，
            {room.minPlayers === room.maxPlayers ? `满 ${room.minPlayers} 人` : `至少 ${room.minPlayers} 人（最多 ${room.maxPlayers} 人）`}
            才能开始。
          </p>
        )}
        <p className="hint">当前是 {MODE_NAME}模式房间。</p>
        <div className="actions row">
          <button className={'btn ' + (me.ready ? 'ghost' : 'green')} onClick={() => call('room:ready', { ready: !me.ready })}>
            {me.ready ? '取消准备' : '准备'}
          </button>
          <button className="btn ghost" onClick={() => setEditing(true)}>
            修改资料
          </button>
        </div>
      </section>

      <section className="paper card">
        <h2>游戏选择大厅</h2>
        <p className="hint">
          点击“选它”投出你的一票；{isHost ? '你是房主，平票时以你的选择为准。' : '平票时以房主的选择为准。'}
        </p>
        <ul className="games">
          {room.catalog.map((g) => {
            const votes = room.players.filter((p) => p.vote === g.id);
            const mine = me.vote === g.id;
            return (
              <li key={g.id} className={'game' + (g.id === room.selectedGame ? ' picked' : '')}>
                <div className="g-icon">{g.icon}</div>
                <div className="g-body">
                  <div className="g-name">{g.name}</div>
                  <div className="g-tag">{g.tagline}</div>
                  {votes.length > 0 && (
                    <div className="g-votes">{votes.map((v) => v.avatar).join(' ')} 投票 {votes.length}</div>
                  )}
                </div>
                <div className="g-actions">
                  <button className="btn small ghost" onClick={() => setRulesFor(g)}>
                    规则
                  </button>
                  <button className={'btn small ' + (mine ? 'gold' : 'green')} onClick={() => call('room:vote', { gameId: g.id })}>
                    {mine ? '已选' : '选它'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="selected-line">
          {selected ? <>当前选中：<b>{selected.icon} {selected.name}</b></> : '还没有人选择游戏'}
        </p>
        {selected?.bank && (
          <div className="settings-box">
            <b>题库设置</b>
            {isHost ? (
              <div className="settings-row">
                <label>
                  难度
                  <select value={room.settings.difficulty} onChange={(e) => call('room:settings', { difficulty: Number(e.target.value) })}>
                    <option value={0}>不限</option>
                    <option value={1}>简单</option>
                    <option value={2}>普通</option>
                    <option value={3}>困难</option>
                  </select>
                </label>
              </div>
            ) : (
              <p className="hint">
                难度：{['不限', '简单', '普通', '困难'][room.settings.difficulty]}　（由房主设置）
              </p>
            )}
          </div>
        )}
        {isHost ? (
          <button className="btn primary wide" disabled={!allReady || !selected} onClick={() => call('room:start')}>
            开始游戏
          </button>
        ) : (
          <p className="hint">只有房主可以开始游戏。</p>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="paper card">
        <h2>本房间积分榜 <small>已玩 {room.gamesPlayed} 局</small></h2>
        <ol className="rank">
          {ranking.map((p, i) => (
            <li key={p.id}>
              <span className="medal">{['🥇', '🥈', '🥉'][i]}</span>
              <span>{p.avatar} {p.nickname}</span>
              <span className="score">{p.score}</span>
            </li>
          ))}
        </ol>
      </section>

      {room.history.length > 0 && (
        <section className="paper card">
          <h2>本房间战绩</h2>
          <ul className="card-log">
            {room.history.map((h, i) => {
              const g = room.catalog.find((x) => x.id === h.game);
              return (
                <li key={i}>
                  <b>{g?.icon} {g?.name ?? h.game}</b>
                  <div>
                    {h.results.map((r, j) => (
                      <span key={j} className="rec-p">{r.avatar}{r.nickname} +{r.points}</span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {rulesFor && (
        <div className="modal-back" onClick={() => setRulesFor(null)}>
          <div className="modal paper" onClick={(e) => e.stopPropagation()}>
            <h2>{rulesFor.icon} {rulesFor.name}</h2>
            <ol className="rules">
              {rulesFor.rules.map((r, i) => <li key={i}>{r}</li>)}
            </ol>
            <button className="btn primary" onClick={() => setRulesFor(null)}>知道了</button>
          </div>
        </div>
      )}

      {editing && (
        <ProfileEditor
          room={room}
          me={me}
          onClose={() => setEditing(false)}
          onError={setError}
        />
      )}
    </main>
  );
}

function ProfileEditor({ room, me, onClose, onError }: { room: RoomView; me: { nickname: string; avatar: string }; onClose: () => void; onError: (e: string) => void }) {
  const [nickname, setNickname] = useState(me.nickname);
  const [avatar, setAvatar] = useState(me.avatar);
  const [err, setErr] = useState('');
  const save = async () => {
    const res = await send('room:profile', { nickname, avatar });
    if (!res.ok) return setErr(res.error);
    onError('');
    onClose();
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal paper" onClick={(e) => e.stopPropagation()}>
        <h2>修改资料</h2>
        <label className="field">
          <span>昵称</span>
          <input value={nickname} maxLength={8} onChange={(e) => setNickname(e.target.value)} />
        </label>
        <AvatarPicker value={avatar} onChange={setAvatar} />
        {err && <p className="error">{err}</p>}
        <div className="actions row">
          <button className="btn primary" onClick={save}>保存</button>
          <button className="btn ghost" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}
