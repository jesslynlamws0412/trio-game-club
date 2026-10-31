import { useEffect, useState } from 'react';
import { getDeviceId, socket } from '../socket';

const GAME_NAMES: Record<string, string> = {
  undercover: '🕵️ 谁是卧底', draw: '🎨 你画我猜', quiz: '📚 答题竞赛', werewolf: '🐺 三人狼人杀',
  monopoly: '🎲 大富翁', cards: '🃏 抽卡游戏', turtlesoup: '🐢 海龟汤', detective: '🔍 谁是侦探',
};

function fmt(at: number) {
  const d = new Date(at);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function Profile({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!socket.connected) return setError('尚未连接服务器，请稍后再试');
    socket.emit('profile:get', { deviceId: getDeviceId() }, (res: any) => {
      if (res?.ok) setData(res);
      else setError('读取失败');
    });
  }, []);

  const me = data?.me?.profile;

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal paper wide-modal" onClick={(e) => e.stopPropagation()}>
        <h2>我的战绩</h2>
        {error && <p className="error">{error}</p>}
        {!data && !error && <p className="hint">读取中……</p>}

        {data && !me && <p className="hint">你还没有玩过任何一局。和朋友玩完一局游戏后，战绩会记在这里。</p>}

        {me && (
          <>
            <div className="stat-head">
              <span className="p-avatar">{me.avatar}</span>
              <div>
                <b>{me.nickname}</b>
                <div className="hint">累计 {me.totalScore} 分 · {me.played} 局 · {me.wins} 胜 · 胜率 {me.played ? Math.round((me.wins / me.played) * 100) : 0}%</div>
              </div>
            </div>

            <div className="label">各游戏成绩</div>
            <ul className="awards">
              {Object.entries(me.perGame as Record<string, any>).map(([g, s]) => (
                <li key={g}>
                  <span>{GAME_NAMES[g] ?? g}</span>
                  <b>{s.played} 局 · {s.wins} 胜 · {s.points} 分</b>
                </li>
              ))}
            </ul>

            <div className="label">最近的对局</div>
            <ul className="card-log">
              {data.me.records.map((r: any) => (
                <li key={r.id}>
                  <b>{GAME_NAMES[r.game] ?? r.game}</b> <span className="hint">{fmt(r.at)} · 房间 {r.roomCode}</span>
                  <div>
                    {r.players.map((p: any, i: number) => (
                      <span key={i} className={'rec-p' + (p.me ? ' me' : '')}>
                        {p.rank === 1 && p.points > 0 ? '🥇' : `#${p.rank}`} {p.avatar}{p.nickname} {p.points}分
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {data && data.top.length > 0 && (
          <>
            <div className="label">全站积分榜 TOP {data.top.length}</div>
            <ol className="rank">
              {data.top.map((p: any, i: number) => (
                <li key={i}>
                  <span className="medal">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
                  <span>{p.avatar} {p.nickname}</span>
                  <span className="score">{p.totalScore}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        <button className="btn primary" onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}
