import { useState } from 'react';
import { AwardList, nameOf, type GameProps } from './shared';
import { t } from '../i18n';

export default function NumberGuess({ room, view, act }: GameProps) {
  const [text, setText] = useState('');
  const myTurn = view.turnId === room.you;

  const submit = async () => {
    if (!/^\d{4}$/.test(text) || new Set(text).size !== 4) return;
    const err = await act({ type: 'guess', digits: text });
    if (!err) setText('');
  };

  return (
    <div>
      <h2>🔢 {t('猜数字')} <small>{t('1A2B · 每人最多 {n} 次', { n: Math.max(...(Object.values(view.left) as number[])) })}</small></h2>

      {view.over ? (
        <>
          <p className="question">
            {view.winnerId ? <>🏆 {t('{name} 猜中了！', { name: nameOf(room, view.winnerId) })}</> : t('大家的次数都用完了，平局。')}
            {t('答案是')} <b>{view.secret}</b>
          </p>
          <AwardList room={room} />
        </>
      ) : (
        <>
          <p className="hint">
            {t('密码是 4 个互不相同的数字。A = 数字和位置都对，B = 数字对位置不对。')}
          </p>
          {myTurn ? (
            <div className="chat-input">
              <input
                inputMode="numeric"
                maxLength={4}
                placeholder={t('输入 4 位不重复数字')}
                value={text}
                onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
              <button className="btn small primary" onClick={submit}>{t('猜')}</button>
            </div>
          ) : (
            <p className="hint">{t('等待 {name} 猜……', { name: nameOf(room, view.turnId) })}</p>
          )}
        </>
      )}

      <ul className="guess-log">
        {[...view.guesses].reverse().map((g: any, i: number) => (
          <li key={i} className={g.by === room.you ? 'mine' : ''}>
            <span>{nameOf(room, g.by)}</span>
            <b className="digits">{g.digits}</b>
            <span>{g.digits === '····' ? t('超时，跳过') : g.a + 'A' + g.b + 'B'}</span>
          </li>
        ))}
        {view.guesses.length === 0 && <li className="hint">{t('还没有人猜')}</li>}
      </ul>
    </div>
  );
}
