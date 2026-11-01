import { useState } from 'react';
import { ChatBox, nameOf, type GameProps } from './shared';
import { t } from '../i18n';

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
        <h2>🔍 {t('侦探推理')} · {c.title}</h2>
        <p className="surface">{c.intro}</p>
        {view.hostId === me ? (
          <div className="panel">
            <p className="turn">{t('你是本局组长，请选择玩法：')}</p>
            <div className="vote-grid">
              <button className="btn green" onClick={() => act({ type: 'mode', mode: 'coop' })}>
                🤝 {t('合作破案')}<br /><small>{t('线索共享，共同得出答案')}</small>
              </button>
              <button className="btn primary" onClick={() => act({ type: 'mode', mode: 'versus' })}>
                ⚔️ {t('竞争模式')}<br /><small>{t('线索私有，各自指认')}</small>
              </button>
            </div>
          </div>
        ) : (
          <p className="hint">{t('等待 {name} 选择玩法……', { name: nameOf(room, view.hostId) })}</p>
        )}
      </div>
    );
  }

  const myAp = view.ap[me];
  const versus = view.mode === 'versus';

  return (
    <div>
      <h2>
        🔍 {c.title} <small>{versus ? t('竞争模式') : t('合作模式')} · {t('第 {a} / {b} 轮', { a: view.round, b: view.totalRounds })}</small>
      </h2>
      <details className="panel" open={view.phase === 'search' && view.round === 1}>
        <summary>{t('案件背景与嫌疑人')}</summary>
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
            {t('搜证：你本轮还有 {n} 次机会', { n: myAp })}
            {versus && t('（搜到的线索只有你自己知道，可选择公开）')}
          </p>
          <div className="vote-grid">
            {view.locations.map((l: any) => (
              <button key={l.id} className="btn green" disabled={myAp <= 0 || l.left <= 0} onClick={() => act({ type: 'search', location: l.id })}>
                {l.name}<br /><small>{l.left > 0 ? t('还有 {n} 条线索', { n: l.left }) : t('已搜空')}</small>
              </button>
            ))}
          </div>
          <button className="btn small ghost" disabled={myAp <= 0} onClick={() => act({ type: 'done' })}>{t('我搜完了，结束本轮')}</button>
          <p className="hint">
            {t('其他人搜证次数：')}{room.players.filter((p) => p.id !== me).map((p) => `${p.nickname} ${view.ap[p.id]}`).join(', ')}
          </p>
        </div>
      )}

      <div className="panel">
        <div className="label">{versus ? t('线索（我的私有线索 + 已公开线索）') : t('已找到的线索')}</div>
        {view.clues.length === 0 ? (
          <p className="hint">{t('还没有线索，快去搜证吧。')}</p>
        ) : (
          <ul className="clue-list">
            {view.clues.map((cl: any) => (
              <li key={cl.id}>
                <span className="rd">{locName(cl.locationId)}</span> {cl.text}
                <div className="hint">
                  {t('由 {name} 找到', { name: nameOf(room, cl.by) })}
                  {versus && cl.shared && ' · ' + t('已公开')}
                  {versus && !cl.shared && cl.by === me && (
                    <> · {t('仅你可见')} <button className="btn small ghost" onClick={() => act({ type: 'share', clueId: cl.id })}>{t('公开给大家')}</button></>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {versus && view.privateCount > 0 && <p className="hint">{t('场上还有 {n} 条未公开的私有线索。', { n: view.privateCount })}</p>}
      </div>

      {view.phase === 'accuse' && (
        <div className="panel">
          <p className="turn">{t('指认阶段：提交你认为的凶手和作案动机')}</p>
          {view.myAnswer ? (
            <p className="hint">{t('你已提交（{name}）。等待其他人……（{n} / 3）', { name: suspectName(view.myAnswer.suspect), n: view.submitted.length })}</p>
          ) : (
            <>
              <div className="field"><span>{t('凶手')}</span></div>
              <div className="options">
                {c.suspects.map((s: any) => (
                  <button key={s.id} className={'btn opt' + (suspect === s.id ? ' chosen' : '')} onClick={() => setSuspect(s.id)}>{s.name}</button>
                ))}
              </div>
              <div className="field" style={{ marginTop: 12 }}><span>{t('作案动机')}</span></div>
              <div className="options">
                {c.motives.map((m: any) => (
                  <button key={m.id} className={'btn opt' + (motive === m.id ? ' chosen' : '')} onClick={() => setMotive(m.id)}>{m.text}</button>
                ))}
              </div>
              <button className="btn primary wide" disabled={!suspect || !motive} onClick={() => act({ type: 'accuse', suspect, motive })}>
                {t('提交（提交后不能修改）')}
              </button>
              {!versus && <p className="hint">{t('合作模式：三人各自提交，按多数意见得出团队答案。')}</p>}
            </>
          )}
        </div>
      )}

      {view.phase !== 'over' && (
        <div className="panel">
          <div className="label">{t('讨论')}</div>
          <ChatBox room={room} messages={view.chat} onSend={(t) => act({ type: 'chat', text: t })} placeholder={t('和同伴讨论推理（也可以语音聊天）')} />
        </div>
      )}

      {view.result && (
        <div className="panel result">
          <h3>🔎 {t('真相大白')}</h3>
          <p>{t('凶手：')}<b>{suspectName(view.result.culprit)}</b></p>
          <p>{t('动机：')}<b>{motiveText(view.result.motive)}</b></p>
          <p className="surface">{view.result.solution}</p>
          {view.result.teamAnswer && (
            <p>{t('团队答案：')}{suspectName(view.result.teamAnswer.suspect)} / {motiveText(view.result.teamAnswer.motive)}</p>
          )}
          <ul className="awards">
            {room.players.map((p) => {
              const ans = view.result.answers[p.id];
              return (
                <li key={p.id}>
                  <span>{p.avatar} {p.nickname}：{ans ? `${suspectName(ans.suspect)}` : '-'}</span>
                  <b>{t('+{n} 分', { n: view.result.points[p.id] ?? 0 })}</b>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
