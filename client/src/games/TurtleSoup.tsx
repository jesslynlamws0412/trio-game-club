import { useState } from 'react';
import { AwardList, nameOf, type GameProps } from './shared';

const Q_REPLIES = ['是', '不是', '无关', '是也不是'];

export default function TurtleSoup({ room, view, act }: GameProps) {
  const isHost = view.hostId === room.you;
  const [text, setText] = useState('');
  const [custom, setCustom] = useState(false);
  const [surface, setSurface] = useState('');
  const [answer, setAnswer] = useState('');

  const send = async (type: 'ask' | 'guess') => {
    const err = await act({ type, text });
    if (!err) setText('');
  };

  if (view.phase === 'pick') {
    return (
      <div>
        <h2>🐢 海龟汤</h2>
        {!isHost ? (
          <p className="turn">本局主持人是 {nameOf(room, view.hostId)}，正在选题……</p>
        ) : (
          <>
            <p className="turn">你是本局主持人。请选一道题，或自己出题。</p>
            <button className="btn small ghost" onClick={() => setCustom(!custom)}>
              {custom ? '改用题库' : '自己出题'}
            </button>
            {custom ? (
              <div className="panel">
                <label className="field"><span>汤面（公开给推理者）</span>
                  <textarea rows={3} maxLength={300} value={surface} onChange={(e) => setSurface(e.target.value)} /></label>
                <label className="field"><span>汤底（只有你能看到）</span>
                  <textarea rows={4} maxLength={600} value={answer} onChange={(e) => setAnswer(e.target.value)} /></label>
                <button className="btn primary" onClick={() => act({ type: 'custom', surface, answer })}>开始</button>
              </div>
            ) : (
              <ul className="soup-bank">
                {view.bank.map((p: any) => (
                  <li key={p.id} className="panel">
                    <b>{p.title}</b>
                    <p>{p.surface}</p>
                    <details><summary>查看汤底（仅你可见）</summary><p>{p.answer}</p></details>
                    <button className="btn small primary" onClick={() => act({ type: 'choose', puzzleId: p.id })}>选这题</button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    );
  }

  const playing = view.phase === 'play';
  const pending = view.log.filter((e: any) => e.reply === null);

  return (
    <div>
      <h2>🐢 海龟汤 <small>主持人：{nameOf(room, view.hostId)}</small></h2>
      <div className="word-card">
        <div className="label">汤面</div>
        <p className="surface">{view.surface}</p>
      </div>
      {view.answer && (
        <div className="panel">
          <div className="label">{isHost && playing ? '汤底（仅你可见）' : '汤底'}</div>
          <p>{view.answer}</p>
        </div>
      )}

      <ul className="soup-log">
        {view.log.length === 0 && <li className="hint">还没有人提问</li>}
        {view.log.map((e: any) => (
          <li key={e.id} className={e.kind === 'guess' ? 'guess' : ''}>
            <span><b>{nameOf(room, e.by)}</b>{e.kind === 'guess' ? '（提交答案）' : ''}：{e.text}</span>
            {e.reply ? (
              <em className={'reply ' + (e.reply === '猜对' ? 'yes' : '')}>{e.reply}</em>
            ) : isHost && playing ? (
              <span className="reply-btns">
                {(e.kind === 'q' ? Q_REPLIES : ['猜对', '没猜对']).map((r) => (
                  <button key={r} className="btn small green" onClick={() => act({ type: 'reply', entryId: e.id, reply: r })}>{r}</button>
                ))}
              </span>
            ) : (
              <em className="reply wait">等待回答</em>
            )}
          </li>
        ))}
      </ul>

      {playing && !isHost && (
        <div className="chat-input">
          <input value={text} maxLength={120} placeholder="问一个能用“是/不是”回答的问题" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send('ask')} />
          <button className="btn small green" onClick={() => send('ask')}>提问</button>
          <button className="btn small gold" onClick={() => send('guess')}>提交答案</button>
        </div>
      )}
      {playing && isHost && (
        <>
          <p className="hint">待回答：{pending.length} 个。推理者猜出后，请对“提交答案”点“猜对”。</p>
          <button className="btn small ghost" onClick={() => confirm('确定直接公布汤底并结束吗？') && act({ type: 'reveal' })}>公布汤底并结束</button>
        </>
      )}

      {view.phase === 'over' && (
        <div className="panel result">
          <h3>{view.solvedBy ? `🎉 ${nameOf(room, view.solvedBy)} 猜出了真相！` : '汤底已公布'}</h3>
          <AwardList room={room} />
        </div>
      )}
    </div>
  );
}
