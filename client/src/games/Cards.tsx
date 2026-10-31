import { nameOf, type GameProps } from './shared';

const TYPE_LABEL: Record<string, { name: string; icon: string }> = {
  fate: { name: '命运卡', icon: '🎴' },
  task: { name: '任务卡', icon: '📜' },
  punish: { name: '惩罚卡', icon: '⚡' },
  event: { name: '特殊事件卡', icon: '✨' },
  private: { name: '私人卡', icon: '🂠' },
};

function PlayingCard({ type, title, text, note, priv }: { type: string; title: string | null; text: string | null; note: string | null; priv: boolean }) {
  const t = TYPE_LABEL[type] ?? TYPE_LABEL.fate;
  const hidden = title === null;
  return (
    <div className={`pcard t-${hidden ? 'private' : type}${priv ? ' is-private' : ''}`}>
      <div className="pc-corner">{hidden ? '🂠' : t.icon}</div>
      <div className="pc-type">{hidden ? '一张私人卡' : t.name}{priv && !hidden ? ' · 私人' : ''}</div>
      {hidden ? (
        <div className="pc-text">内容只有抽到的人能看到</div>
      ) : (
        <>
          <div className="pc-title">{title}</div>
          <div className="pc-text">{text}</div>
          {note && <div className="pc-note">{note}</div>}
        </>
      )}
    </div>
  );
}

export default function Cards({ room, view, act }: GameProps) {
  const me = room.you;
  const isDrawer = view.drawerId === me;
  const activeJudge = view.judgements.filter((j: any) => !j.resolved);
  const lastEntry = view.table[view.table.length - 1];

  return (
    <div>
      <h2>
        🃏 抽卡游戏 <small>第 {Math.min(view.turn + 1, view.totalTurns)} / {view.totalTurns} 张 · 卡堆剩余 {view.deckLeft}</small>
      </h2>

      <ul className="awards">
        {room.players.map((p) => (
          <li key={p.id}>
            <span>{p.avatar} {p.nickname}{view.drawerId === p.id ? ' 👈' : ''}</span>
            <b>{view.points[p.id]} 分</b>
          </li>
        ))}
      </ul>
      {view.phase !== 'over' && view.mySecret !== 0 && (
        <p className="hint">🤫 只有你知道：你手里的暗分目前是 <b>{view.mySecret > 0 ? '+' : ''}{view.mySecret}</b>（游戏结束时公布）</p>
      )}

      {view.phase === 'draw' && (
        <div className="panel">
          {isDrawer ? (
            <>
              <p className="turn">轮到你抽卡了！</p>
              <button className="btn primary wide" onClick={() => act({ type: 'draw' })}>🃏 抽一张</button>
            </>
          ) : (
            <p className="hint">等待 {nameOf(room, view.drawerId)} 抽卡……</p>
          )}
        </div>
      )}

      {lastEntry && view.phase !== 'over' && (
        <div className="panel center">
          <p className="hint">{nameOf(room, lastEntry.playerId)} 抽到了：</p>
          <PlayingCard type={lastEntry.type} title={lastEntry.title} text={lastEntry.text} note={lastEntry.note} priv={lastEntry.private} />
        </div>
      )}

      {activeJudge.map((j: any) => (
        <div key={j.id} className="panel">
          <p className="turn">
            {j.secret ? '🤫 秘密任务揭晓' : '📜 任务裁判'}：{nameOf(room, j.subjectId)} —— {j.title}
          </p>
          <p>{j.text}</p>
          {j.subjectId === me ? (
            <p className="hint">等待另外两位玩家投票（至少一人认可即完成，完成得 {j.reward} 分）……</p>
          ) : j.myVote === null ? (
            <div className="vote-grid">
              <button className="btn green" onClick={() => act({ type: 'judge', judgementId: j.id, vote: true })}>完成了 👍</button>
              <button className="btn ghost" onClick={() => act({ type: 'judge', judgementId: j.id, vote: false })}>没完成 👎</button>
            </div>
          ) : (
            <p className="hint">你已投票，等待另一位玩家……</p>
          )}
        </div>
      ))}

      {view.phase === 'over' && (
        <div className="panel result">
          <h3>🏁 游戏结束</h3>
          <p className="hint">暗分公布：</p>
          <ul className="awards">
            {room.players.map((p) => (
              <li key={p.id}>
                <span>{p.avatar} {p.nickname}</span>
                <b>暗分 {view.secretAll[p.id] >= 0 ? '+' : ''}{view.secretAll[p.id]}　总计 {view.points[p.id]}</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.table.length > 0 && (
        <details open={view.phase === 'over'} className="panel">
          <summary>抽卡记录（{view.table.length}）</summary>
          <ul className="card-log">
            {[...view.table].reverse().map((t: any) => (
              <li key={t.turn}>
                <b>{nameOf(room, t.playerId)}</b>：
                {t.title === null ? '一张私人卡（内容保密）' : `${TYPE_LABEL[t.type]?.icon ?? ''} ${t.title}${t.note ? ' · ' + t.note : ''}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
