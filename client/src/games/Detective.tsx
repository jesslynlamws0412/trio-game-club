import { useState } from 'react';
import { ChatBox, nameOf, type GameProps } from './shared';

export default function Detective({ room, view, act }: GameProps) {
  const me = room.you;
  const c = view.case;
  const [suspect, setSuspect] = useState('');
  const [motive, setMotive] = useState('');
  const suspectName = (id: string) => c.suspects.find((s: any) => s.id === id)?.name ?? id;
  const motiveText = (id: string) => c.motives.find((m: any) => m.id === id)?.text ?? id;
  const locName = (id: string) => view.locations.find((l: any) => l.id === id)?.name ?? '';

  if (view.phase === 'setup') {
    return (
      <div>
        <h2>🔍 侦探推理 · {c.title}</h2>
        <p className="surface">{c.intro}</p>
        {view.hostId === me ? (
          <div className="panel">
            <p className="turn">你是本局组长，请选择玩法：</p>
            <div className="vote-grid">
              <button className="btn green" onClick={() => act({ type: 'mode', mode: 'coop' })}>
                🤝 合作破案<br /><small>线索共享，共同得出答案</small>
              </button>
              <button className="btn primary" onClick={() => act({ type: 'mode', mode: 'versus' })}>
                ⚔️ 竞争模式<br /><small>线索私有，各自指认</small>
              </button>
            </div>
          </div>
        ) : (
          <p className="hint">等待 {nameOf(room, view.hostId)} 选择玩法……</p>
        )}
      </div>
    );
  }

  const myAp = view.ap[me];
  const versus = view.mode === 'versus';

  return (
    <div>
      <h2>
        🔍 {c.title} <small>{versus ? '竞争模式' : '合作模式'} · 第 {view.round} / {view.totalRounds} 轮</small>
      </h2>
      <details className="panel" open={view.phase === 'search' && view.round === 1}>
        <summary>案件背景与嫌疑人</summary>
        <p className="surface">{c.intro}</p>
        <ul className="suspects">
          {c.suspects.map((s: any) => (
            <li key={s.id}><b>{s.name}</b>：{s.desc}</li>
          ))}
        </ul>
      </details>

      {view.phase === 'search' && (
        <div className="panel">
          <p className="turn">
            搜证：你本轮还有 {myAp} 次机会
            {versus && '（搜到的线索只有你自己知道，可选择公开）'}
          </p>
          <div className="vote-grid">
            {view.locations.map((l: any) => (
              <button key={l.id} className="btn green" disabled={myAp <= 0 || l.left <= 0} onClick={() => act({ type: 'search', location: l.id })}>
                {l.name}<br /><small>{l.left > 0 ? `还有 ${l.left} 条线索` : '已搜空'}</small>
              </button>
            ))}
          </div>
          <button className="btn small ghost" disabled={myAp <= 0} onClick={() => act({ type: 'done' })}>我搜完了，结束本轮</button>
          <p className="hint">
            其他人搜证次数：{room.players.filter((p) => p.id !== me).map((p) => `${p.nickname} ${view.ap[p.id]} 次`).join('，')}
          </p>
        </div>
      )}

      <div className="panel">
        <div className="label">{versus ? '线索（我的私有线索 + 已公开线索）' : '已找到的线索'}</div>
        {view.clues.length === 0 ? (
          <p className="hint">还没有线索，快去搜证吧。</p>
        ) : (
          <ul className="clue-list">
            {view.clues.map((cl: any) => (
              <li key={cl.id}>
                <span className="rd">{locName(cl.locationId)}</span> {cl.text}
                <div className="hint">
                  由 {nameOf(room, cl.by)} 找到
                  {versus && cl.shared && ' · 已公开'}
                  {versus && !cl.shared && cl.by === me && (
                    <> · 仅你可见 <button className="btn small ghost" onClick={() => act({ type: 'share', clueId: cl.id })}>公开给大家</button></>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {versus && view.privateCount > 0 && <p className="hint">场上还有 {view.privateCount} 条未公开的私有线索。</p>}
      </div>

      {view.phase === 'accuse' && (
        <div className="panel">
          <p className="turn">指认阶段：提交你认为的凶手和作案动机</p>
          {view.myAnswer ? (
            <p className="hint">你已提交（{suspectName(view.myAnswer.suspect)}）。等待其他人……（{view.submitted.length} / 3）</p>
          ) : (
            <>
              <div className="field"><span>凶手</span></div>
              <div className="options">
                {c.suspects.map((s: any) => (
                  <button key={s.id} className={'btn opt' + (suspect === s.id ? ' chosen' : '')} onClick={() => setSuspect(s.id)}>{s.name}</button>
                ))}
              </div>
              <div className="field" style={{ marginTop: 12 }}><span>作案动机</span></div>
              <div className="options">
                {c.motives.map((m: any) => (
                  <button key={m.id} className={'btn opt' + (motive === m.id ? ' chosen' : '')} onClick={() => setMotive(m.id)}>{m.text}</button>
                ))}
              </div>
              <button className="btn primary wide" disabled={!suspect || !motive} onClick={() => act({ type: 'accuse', suspect, motive })}>
                提交（提交后不能修改）
              </button>
              {!versus && <p className="hint">合作模式：三人各自提交，按多数意见得出团队答案。</p>}
            </>
          )}
        </div>
      )}

      {view.phase !== 'over' && (
        <div className="panel">
          <div className="label">讨论</div>
          <ChatBox room={room} messages={view.chat} onSend={(t) => act({ type: 'chat', text: t })} placeholder="和同伴讨论推理（也可以语音聊天）" />
        </div>
      )}

      {view.result && (
        <div className="panel result">
          <h3>🔎 真相大白</h3>
          <p>凶手：<b>{suspectName(view.result.culprit)}</b></p>
          <p>动机：<b>{motiveText(view.result.motive)}</b></p>
          <p className="surface">{view.result.solution}</p>
          {view.result.teamAnswer && (
            <p>团队答案：{suspectName(view.result.teamAnswer.suspect)} / {motiveText(view.result.teamAnswer.motive)}</p>
          )}
          <ul className="awards">
            {room.players.map((p) => {
              const ans = view.result.answers[p.id];
              return (
                <li key={p.id}>
                  <span>{p.avatar} {p.nickname}：{ans ? `${suspectName(ans.suspect)}` : '-'}</span>
                  <b>+{view.result.points[p.id] ?? 0} 分</b>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
