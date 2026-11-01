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
import Board from '../games/Board';
import Taboo from '../games/Taboo';
import Snakes from '../games/Snakes';
import Ludo from '../games/Ludo';
import Millionaire from '../games/Millionaire';
import Liar from '../games/Liar';
import Uno from '../games/Uno';
import Scrabble from '../games/Scrabble';
import Jenga from '../games/Jenga';
import Bowling from '../games/Bowling';
import Basketball from '../games/Basketball';
import Sheep from '../games/Sheep';
import { useAct, useCountdown, type GameProps } from '../games/shared';
import { useGameSounds } from '../useGameSounds';
import { getLang, t } from '../i18n';

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
  tictactoe: Board,
  gomoku: Board,
  taboo: Taboo,
  snakes: Snakes,
  ludo: Ludo,
  millionaire: Millionaire,
  liar: Liar,
  uno: Uno,
  scrabble: Scrabble,
  jenga: Jenga,
  bowling: Bowling,
  basketball: Basketball,
  sheep: Sheep,
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
  const countdown = useCountdown(room.countdownMs ?? 0, room.phase);
  useGameSounds(room);

  const me = room.players.find((p) => p.id === room.you)!;
  const isHost = room.hostId === room.you;
  const enough = room.players.length >= room.minPlayers;
  const allReady = enough && room.players.every((p) => p.ready);
  const MODE_NAME = t({ solo: '单人', duo: '双人', trio: '三人', party: '多人' }[room.mode]);
  const anyEnglish = room.players.some((p) => p.lang === 'en');
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
              <p>{t('本游戏的玩法将在后续开发阶段加入。')}</p>
            </>
          )}
          {error && <p className="error">{error}</p>}
          {room.idleSec > 0 && !room.gameOver && (
            <p className="hint">⏳ {t('轮到的玩家 {n} 秒不操作，系统会自动替他行动。', { n: room.idleSec })}</p>
          )}
          <div className="end-bar">
            {room.gameOver ? (
              <button className="btn primary" onClick={() => call('game:end')}>
                {t('结算并返回大厅')}
              </button>
            ) : isHost ? (
              <button className="btn ghost small" onClick={() => confirm(t('中止游戏不会计分，确定吗？')) && call('game:end')}>
                {t('中止游戏')}
              </button>
            ) : (
              <p className="hint">{t('房主可以中止游戏。')}</p>
            )}
            <button className="btn ghost small" onClick={() => confirm(t('退出后本局游戏将作废，确定吗？')) && onLeave()}>
              {t('退出房间')}
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
          <div className="label">{t('房间号')}</div>
          <div className="room-code">{room.code}</div>
        </div>
        <div className="head-btns">
          <button className="btn ghost" onClick={onLeave}>
            {t('退出房间')}
          </button>
          {isHost && !room.local && (
            <button className="btn ghost" onClick={() => confirm(t('关闭房间后所有人都会回到首页，确定吗？')) && call('room:close')}>
              {t('关闭房间')}
            </button>
          )}
        </div>
      </header>

      {room.phase === 'countdown' && (
        <div className="modal-back">
          <div className="modal paper countdown-box">
            <h2>{t('游戏即将开始')}</h2>
            <div className="big-count">{Math.max(1, countdown)}</div>
            <p className="hint">{t('请准备好，开始后不能再改选游戏。')}</p>
            {isHost && (
              <button className="btn ghost" onClick={() => call('room:cancel')}>
                {t('取消开始')}
              </button>
            )}
          </div>
        </div>
      )}

      <section className="paper card">
        <h2>
          {t('玩家名单')} <small>{room.players.length} / {room.maxPlayers}</small>
        </h2>
        <ul className="players">
          {slots.map((p, i) =>
            p ? (
              <li key={p.id} className={'player' + (p.connected ? '' : ' offline')}>
                <span className="p-avatar">{p.avatar}</span>
                <span className="p-name">
                  {p.nickname}
                  {p.id === room.hostId && <em className="tag gold">{t('房主')}</em>}
                  {p.id === room.you && <em className="tag">{t('你')}</em>}
                </span>
                <span className={'p-state' + (p.ready ? ' ok' : '')}>
                  {!p.connected ? t('掉线中') : p.ready ? t('已准备') : t('未准备')}
                </span>
                {isHost && p.id !== room.you && (
                  <button
                    className="btn ghost small"
                    onClick={() => confirm(t('确定把 {name} 移出房间吗？', { name: p.nickname })) && call('room:kick', { playerId: p.id })}
                  >
                    {t('移出')}
                  </button>
                )}
              </li>
            ) : (
              <li key={'empty' + i} className="player empty">
                <span className="p-avatar">?</span>
                <span className="p-name">{t('等待玩家加入…')}</span>
              </li>
            ),
          )}
        </ul>
        {!enough && (
          <p className="hint">
            {t('把房间号')} <b>{room.code}</b> {t('发给朋友，')}
            {room.minPlayers === room.maxPlayers ? t('满 {n} 人', { n: room.minPlayers }) : t('至少 {a} 人（最多 {b} 人）', { a: room.minPlayers, b: room.maxPlayers })}
            {t('才能开始。')}
          </p>
        )}
        <p className="hint">{t('当前是 {mode}模式房间。', { mode: MODE_NAME })}</p>
        {anyEnglish && <p className="hint">🌐 {t('房间里有玩家使用英文：只有带 English 标记的游戏可以开始。')}</p>}
        <div className="actions row">
          <button className={'btn ' + (me.ready ? 'ghost' : 'green')} onClick={() => call('room:ready', { ready: !me.ready })}>
            {me.ready ? t('取消准备') : t('准备')}
          </button>
          <button className="btn ghost" onClick={() => setEditing(true)}>
            {t('修改资料')}
          </button>
        </div>
      </section>

      <section className="paper card">
        <h2>{t('游戏选择大厅')}</h2>
        <p className="hint">
          {t('点击“选它”投出你的一票；')}{isHost ? t('你是房主，平票时以你的选择为准。') : t('平票时以房主的选择为准。')}
        </p>
        <ul className="games">
          {room.catalog.map((g) => {
            const votes = room.players.filter((p) => p.vote === g.id);
            const mine = me.vote === g.id;
            return (
              <li key={g.id} className={'game' + (g.id === room.selectedGame ? ' picked' : '')}>
                <div className="g-icon">{g.icon}</div>
                <div className="g-body">
                  <div className="g-name">
                    {g.name}
                    {g.en ? <em className="tag en-ok">English</em> : anyEnglish || getLang() === 'en' ? <em className="tag zh-only">{t('仅中文')}</em> : null}
                  </div>
                  <div className="g-tag">{g.tagline}</div>
                  {votes.length > 0 && (
                    <div className="g-votes">{votes.map((v) => v.avatar).join(' ')} {t('投票')} {votes.length}</div>
                  )}
                </div>
                <div className="g-actions">
                  <button className="btn small ghost" onClick={() => setRulesFor(g)}>
                    {t('规则')}
                  </button>
                  <button className={'btn small ' + (mine ? 'gold' : 'green')} onClick={() => call('room:vote', { gameId: g.id })}>
                    {mine ? t('已选') : t('选它')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="selected-line">
          {selected ? <>{t('当前选中：')}<b>{selected.icon} {selected.name}</b></> : t('还没有人选择游戏')}
        </p>
        {selected?.bank && (
          <div className="settings-box">
            <b>{t('题库设置')}</b>
            {isHost ? (
              <div className="settings-row">
                <label>
                  {t('难度')}
                  <select value={room.settings.difficulty} onChange={(e) => call('room:settings', { difficulty: Number(e.target.value) })}>
                    <option value={0}>{t('不限')}</option>
                    <option value={1}>{t('简单')}</option>
                    <option value={2}>{t('普通')}</option>
                    <option value={3}>{t('困难')}</option>
                  </select>
                </label>
              </div>
            ) : (
              <p className="hint">
                {t('难度：')}{[t('不限'), t('简单'), t('普通'), t('困难')][room.settings.difficulty]}　{t('（由房主设置）')}
              </p>
            )}
          </div>
        )}
        {isHost ? (
          <button className="btn primary wide" disabled={!allReady || !selected} onClick={() => call('room:start')}>
            {t('开始游戏')}
          </button>
        ) : (
          <p className="hint">{t('只有房主可以开始游戏。')}</p>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="paper card">
        <h2>{t('本房间积分榜')} <small>{t('已玩 {n} 局', { n: room.gamesPlayed })}</small></h2>
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
          <h2>{t('本房间战绩')}</h2>
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
            <button className="btn primary" onClick={() => setRulesFor(null)}>{t('知道了')}</button>
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
        <h2>{t('修改资料')}</h2>
        <label className="field">
          <span>{t('昵称')}</span>
          <input value={nickname} maxLength={8} onChange={(e) => setNickname(e.target.value)} />
        </label>
        <AvatarPicker value={avatar} onChange={setAvatar} />
        {err && <p className="error">{err}</p>}
        <div className="actions row">
          <button className="btn primary" onClick={save}>{t('保存')}</button>
          <button className="btn ghost" onClick={onClose}>{t('取消')}</button>
        </div>
      </div>
    </div>
  );
}
