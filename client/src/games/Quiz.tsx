import { useEffect, useState } from 'react';
import { AwardList, nameOf, useCountdown, type GameProps } from './shared';
import { t } from '../i18n';

export default function Quiz({ room, view, act }: GameProps) {
  const left = useCountdown(view.endsInMs ?? 0, view);
  const [picked, setPicked] = useState<number[]>([]); // 多选草稿
  const [text, setText] = useState(''); // 填空草稿

  // 换题时清空草稿
  useEffect(() => {
    setPicked([]);
    setText('');
  }, [view.index]);

  if (view.phase === 'over') {
    return (
      <div>
        <h2>📚 {t('题库问答')} · {t('最终排名')}</h2>
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

  const revealing = view.phase === 'reveal';
  const mine = view.myChoice !== null || view.myChoices !== null || view.myText !== null;
  const choiceType = view.options && view.qtype !== 'multi';
  const multi = view.qtype === 'multi';
  const typing = !view.options;
  const submitText = () => text.trim() && act({ type: 'answer', index: view.index, text: text.trim() });

  return (
    <div>
      <h2>
        📚 {view.category} <small>{t('第 {a} / {b} 题', { a: view.index + 1, b: view.total })} · {view.difficultyName} · {view.typeName}</small>
      </h2>
      {!revealing && <div className="timer">{left}</div>}
      {view.image && <div className="q-image">{view.image}</div>}
      <p className="question">{view.question}</p>

      {view.options && (
        <div className="options">
          {view.options.map((o: string, i: number) => {
            let cls = 'btn opt';
            if (revealing) {
              const right = multi ? view.answerSet.includes(i) : i === view.answer;
              const mineHere = multi ? view.myChoices?.includes(i) : i === view.myChoice;
              if (right) cls += ' right';
              else if (mineHere) cls += ' wrong';
            } else if (multi ? picked.includes(i) || view.myChoices?.includes(i) : view.myChoice === i) cls += ' chosen';
            return (
              <button
                key={i}
                className={cls}
                disabled={mine || revealing}
                onClick={() =>
                  multi
                    ? setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))
                    : act({ type: 'answer', index: view.index, choice: i })
                }
              >
                {view.options.length === 4 ? 'ABCD'[i] + '. ' : ''}{o}
                {revealing && choiceType && (
                  <span className="pickers">
                    {room.players.filter((p) => view.choices[p.id] === i).map((p) => p.avatar).join('')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {multi && !mine && !revealing && (
        <button className="btn primary small" disabled={picked.length === 0} onClick={() => act({ type: 'answer', index: view.index, choices: picked })}>
          {t('提交答案（已选 {n} 项，必须全对）', { n: picked.length })}
        </button>
      )}

      {typing && !revealing && !mine && (
        <div className="chat-input">
          <input
            maxLength={40}
            placeholder={t('输入你的答案')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitText()}
          />
          <button className="btn small primary" onClick={submitText}>{t('提交')}</button>
        </div>
      )}

      {!revealing && (
        <p className="hint">
          {mine ? t('已提交，等待其他人……') : t('越快答对，加分越多')}{t('（已作答 {a} / {b}）', { a: view.answered.length, b: room.players.length })}
        </p>
      )}

      {revealing && (
        <>
          <p className="answer-box">
            {view.correct[room.you] ? t('✅ 答对了！') : t('❌ 答错了')}　{t('正确答案：')}<b>{view.answerText}</b>
            <br />
            <span className="hint">{t('解释：')}{view.explain}</span>
          </p>
          <ul className="awards">
            {room.players.map((p) => (
              <li key={p.id}>
                <span>{p.avatar} {p.nickname}{view.shown[p.id] !== null && !choiceType ? `（${view.shown[p.id]}）` : ''}</span>
                <b>{view.gains[p.id] > 0 ? `+${view.gains[p.id]}` : t('答错/未答')}　{t('合计')} {view.points[p.id]}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
