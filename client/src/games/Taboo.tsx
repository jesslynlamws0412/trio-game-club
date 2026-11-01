import { useState } from 'react';
import { AwardList, nameOf, useCountdown, type GameProps } from './shared';
import { t } from '../i18n';

export default function Taboo({ room, view, act }: GameProps) {
  const [text, setText] = useState('');
  const left = useCountdown(view.endsInMs ?? 0, view);

  if (view.phase === 'over') {
    return (
      <div>
        <h2>🚫 {t('禁忌词挑战')} · {t('最终排名')}</h2>
        <ol className="rank">
          {view.ranking.map((r: any) => (
            <li key={r.id}>
              <span className="medal">{['🥇', '🥈', '🥉'][r.rank - 1]}</span>
              <span>{nameOf(room, r.id)}</span>
              <span className="score">{t('{n} 分', { n: r.points })}</span>
            </li>
          ))}
        </ol>
        <p className="hint">{t('名次奖励（第一 +3 / 第二 +2 / 第三 +1）：')}</p>
        <AwardList room={room} />
      </div>
    );
  }

  const me = view.describerId === room.you;
  const revealing = view.phase === 'reveal';
  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    const err = await act({ type: me ? 'hint' : 'guess', text: t });
    if (!err) setText('');
  };

  return (
    <div>
      <h2>🚫 {t('禁忌词挑战')} <small>{t('第 {a} / {b} 回合', { a: view.round + 1, b: view.total })}</small></h2>
      {!revealing && <div className="timer">{left}</div>}
      <p className="question">
        {t('描述者：')}<b>{nameOf(room, view.describerId)}</b>
        {me && !revealing && <>　{t('你的词语：')}<b className="taboo-word">{view.word}</b></>}
      </p>
      {me && !revealing && (
        <p className="hint">
          {t('禁忌词：')}{view.banned.map((b: string) => <span key={b} className="taboo-ban">{b}</span>)}
          {t('违规 {a} / {b}（描述里不能出现词语本身或禁忌词）', { a: view.fouls, b: view.maxFouls })}
        </p>
      )}
      {!me && !revealing && <p className="hint">{t('词语一共 {n} 个字。根据描述者的提示，输入你的答案。', { n: view.wordLen })}</p>}
      {revealing && (
        <p className="answer-box">
          {t('答案：')}<b>{view.word}</b>　{t('禁忌词：')}{view.banned?.join(', ')}
          <br />
          {view.solvedBy ? '🎉 ' + t('{name} 猜对了！', { name: nameOf(room, view.solvedBy) }) : t('这个回合没有人猜对。')}
        </p>
      )}

      <ul className="chat-log">
        {view.log.length === 0 && <li className="hint">{t('还没有人发言')}</li>}
        {view.log.map((e: any, i: number) => (
          <li key={i} className={e.by === room.you ? 'mine' : ''}>
            <b>{nameOf(room, e.by)}</b>
            {e.kind === 'hint' && <>{t('（描述）：')}{e.text}</>}
            {e.kind === 'guess' && <>{t('（猜）：')}{e.text}</>}
            {e.kind === 'foul' && <> {t('说了禁忌词，被扣 1 分！')}</>}
          </li>
        ))}
      </ul>

      {!revealing && (
        <div className="chat-input">
          <input
            value={text}
            maxLength={me ? 40 : 20}
            placeholder={me ? t('用文字描述这个词（不能含禁忌词）') : t('输入你猜的词语')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <button className="btn small primary" onClick={submit}>{me ? t('发送') : t('猜')}</button>
          {me && <button className="btn small ghost" onClick={() => confirm(t('换一个词要扣 1 分，确定吗？')) && act({ type: 'swap' })}>{t('换词 -1')}</button>}
        </div>
      )}

      <ul className="awards">
        {room.players.map((p) => (
          <li key={p.id}>
            <span>{p.avatar} {p.nickname}{view.describerId === p.id ? ' 🗣️' : ''}</span>
            <b>{t('{n} 分', { n: view.points[p.id] })}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
