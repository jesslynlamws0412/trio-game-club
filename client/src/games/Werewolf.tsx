import { useState } from 'react';
import { AwardList, nameOf, useCountdown, type GameProps } from './shared';
import { t } from '../i18n';

const ROLE_INFO: Record<string, { name: string; icon: string; desc: string; side: string }> = {
  wolf: { name: '狼人', icon: '🐺', side: '狼人阵营', desc: '从第 2 夜起，每晚可以咬一个人。白天要想办法不被投出去。' },
  seer: { name: '预言家', icon: '🔮', side: '好人阵营', desc: '每晚查验一名玩家，得知他是不是狼人。' },
  guard: { name: '守卫', icon: '🛡️', side: '好人阵营', desc: '每晚守护一名玩家（可以守自己，但不能连续两晚守同一人），被守护的人当晚不会死。' },
};

export default function Werewolf({ room, view, act }: GameProps) {
  const [text, setText] = useState('');
  const left = useCountdown(view.endsInMs, view);
  const me = room.you;
  const role = ROLE_INFO[view.myRole];
  const alive: string[] = view.alive;
  const amAlive = alive.includes(me);
  const others = room.players.filter((p) => p.id !== me && alive.includes(p.id));

  const speak = async () => {
    const err = await act({ type: 'speak', text });
    if (!err) setText('');
  };

  return (
    <div>
      <h2>🐺 {t('三人狼人杀')} <small>{t('第 {n} 个昼夜', { n: view.day })}</small></h2>

      <div className="word-card role-card">
        <div className="label">{t('你的身份（只有你知道）')}</div>
        <div className="word">{role.icon} {t(role.name)}</div>
        <div className="hint">{t(role.side)} · {t(role.desc)}</div>
      </div>

      {!amAlive && <p className="turn">{t('你已经出局，可以继续观战。')}</p>}

      {view.phase !== 'over' && (
        <div className="phase-bar">
          {view.phase === 'night' && '🌙 ' + t('夜晚')}
          {view.phase === 'speak' && '☀️ ' + t('白天 · 发言')}
          {view.phase === 'vote' && '☀️ ' + t('白天 · 投票')}
          <span className="timer small">{left}</span>
        </div>
      )}

      {view.phase === 'night' && amAlive && (
        <div className="panel">
          {view.myNightDone ? (
            <p className="hint">{t('你已完成今晚的行动，等待其他人……（已完成 {a} / {b}）', { a: view.nightDone.length, b: alive.length })}</p>
          ) : view.myRole === 'wolf' && view.day === 1 ? (
            <>
              <p className="turn">{t('首夜狼人不能咬人。确认一下，等天亮吧。')}</p>
              <button className="btn primary" onClick={() => act({ type: 'night' })}>{t('确认')}</button>
            </>
          ) : (
            <>
              <p className="turn">
                {view.myRole === 'wolf' && t('选择今晚要咬的人：')}
                {view.myRole === 'seer' && t('选择今晚要查验的人：')}
                {view.myRole === 'guard' && t('选择今晚要守护的人：')}
              </p>
              <div className="vote-grid">
                {(view.myRole === 'guard' ? room.players.filter((p) => alive.includes(p.id)) : others).map((p) => (
                  <button
                    key={p.id}
                    className="btn green"
                    disabled={view.myRole === 'guard' && p.id === view.lastGuard}
                    onClick={() => act({ type: 'night', target: p.id })}
                  >
                    {p.avatar} {p.id === me ? t('自己') : p.nickname}
                  </button>
                ))}
              </div>
              {view.myRole === 'guard' && view.lastGuard && <p className="hint">{t('昨晚你守护了 {name}，今晚不能再守护同一个人。', { name: nameOf(room, view.lastGuard) })}</p>}
            </>
          )}
        </div>
      )}

      {view.seerResults.length > 0 && (
        <div className="panel">
          <div className="label">🔮 {t('你的查验记录（只有你能看到）')}</div>
          {view.seerResults.map((r: any) => (
            <p key={r.day}>{t('第 {n} 夜：', { n: r.day })}{nameOf(room, r.target)} {r.isWolf ? <b className="bad">{t('是狼人！')}</b> : <b>{t('是好人')}</b>}</p>
          ))}
        </div>
      )}

      {view.phase === 'speak' && (
        <div className="panel">
          <p className="turn">{t('轮到 {name} 发言', { name: nameOf(room, view.speakerId) })}</p>
          {view.speakerId === me ? (
            <div className="chat-input">
              <input value={text} maxLength={100} placeholder={t('说说你的看法（可以说真话，也可以撒谎）')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && speak()} />
              <button className="btn small primary" onClick={speak}>{t('发言')}</button>
            </div>
          ) : (
            <p className="hint">{t('请听他发言……')}</p>
          )}
        </div>
      )}

      {view.phase === 'vote' && amAlive && (
        <div className="panel">
          <p className="turn">{t('投票放逐：你认为谁是狼人？')}</p>
          <div className="vote-grid">
            {others.map((p) => (
              <button key={p.id} className={'btn ' + (view.myVote === p.id ? 'gold' : 'green')} disabled={!!view.myVote} onClick={() => act({ type: 'vote', target: p.id })}>
                {p.avatar} {p.nickname}
              </button>
            ))}
          </div>
          <p className="hint">{t('已投票 {a} / {b}', { a: view.voted.length, b: alive.length })}</p>
        </div>
      )}

      {view.speeches.length > 0 && (
        <div className="panel">
          <div className="label">{t('发言记录')}</div>
          <ul className="desc-list">
            {view.speeches.map((s: any, i: number) => (
              <li key={i}><span className="rd">{t('第 {n} 天', { n: s.day })}</span> <b>{nameOf(room, s.playerId)}</b>：{s.text}</li>
            ))}
          </ul>
        </div>
      )}

      {view.voteHistory.map((h: any) => (
        <p key={h.day} className="hint">
          {t('第 {n} 天投票：', { n: h.day })}{Object.entries(h.votes).map(([f, to]) => `${nameOf(room, f)}→${nameOf(room, to as string)}`).join(', ') || t('无人投票')}
        </p>
      ))}

      <div className="panel">
        <div className="label">{t('事件')}</div>
        {view.events.length === 0 ? <p className="hint">{t('夜幕降临……')}</p> : view.events.map((e: any, i: number) => <p key={i}>{e.text}</p>)}
      </div>

      {view.result && (
        <div className="panel result">
          <h3>{view.result.winner === 'good' ? t('🎉 好人获胜！') : t('🐺 狼人获胜！')}</h3>
          <ul className="awards">
            {room.players.map((p) => (
              <li key={p.id}><span>{p.avatar} {p.nickname}</span><b>{ROLE_INFO[view.result.roles[p.id]].icon} {t(ROLE_INFO[view.result.roles[p.id]].name)}</b></li>
            ))}
          </ul>
          <AwardList room={room} />
        </div>
      )}
    </div>
  );
}
