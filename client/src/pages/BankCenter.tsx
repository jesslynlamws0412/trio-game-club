import { useEffect, useState } from 'react';
import { request } from '../socket';

const DIFF = ['', '简单', '普通', '困难'];
const TYPE: Record<string, string> = {
  single: '单选题', multi: '多选题', truefalse: '判断题', fill: '填空题', short: '简答题', image: '图片猜题', reasoning: '文字推理题',
};

interface BankStat { id: string; name: string; icon: string; desc: string; total: number; byDifficulty: Record<number, number> }
interface Q {
  id: string; bank: string; difficulty: number; type: string; q: string; image?: string;
  options?: string[]; answer: number | number[] | string[]; explain: string;
}

export function answerOf(q: Q): string {
  if (q.options) {
    return Array.isArray(q.answer) ? (q.answer as number[]).map((i) => q.options![i]).join('、') : q.options[q.answer as number];
  }
  return (q.answer as string[]).join(' / ');
}

/** 题库中心：浏览全部内置题库（学习模式，直接显示答案和解释），可收藏题目 */
export default function BankCenter({ onBack, onCustom }: { onBack: () => void; onCustom: () => void }) {
  const [banks, setBanks] = useState<BankStat[]>([]);
  const [publicBanks, setPublicBanks] = useState<{ id: string; name: string; ownerName: string; count: number }[]>([]);
  const [favs, setFavs] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [list, setList] = useState<Q[]>([]);
  const [diff, setDiff] = useState(0);
  const [type, setType] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    request('bank:list').then((r) => {
      if (!r.ok) return setError(r.error);
      setBanks(r.banks);
      setFavs(r.favorites);
      setPublicBanks(r.custom.publicOthers);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    request('bank:browse', { bankId: open, difficulty: diff || undefined, type: type || undefined }).then((r) => {
      if (!r.ok) return setError(r.error);
      setTitle(r.title);
      setList(r.questions);
      setFavs(r.favorites);
    });
  }, [open, diff, type]);

  const toggle = async (id: string) => {
    const r = await request('bank:fav', { questionId: id });
    if (!r.ok) return setError(r.error);
    setFavs((f) => (r.favorited ? [...f, id] : f.filter((x) => x !== id)));
    if (open === 'favorites' && !r.favorited) setList((l) => l.filter((q) => q.id !== id));
  };

  if (open) {
    return (
      <main className="home hub">
        <header className="masthead small"><h1>{title}</h1><div className="subtitle">学习模式 · 共 {list.length} 题</div></header>
        <div className="tabs">
          {[0, 1, 2, 3].map((d) => (
            <button key={d} className={'tab' + (diff === d ? ' on' : '')} onClick={() => setDiff(d)}>{d ? DIFF[d] : '全部难度'}</button>
          ))}
        </div>
        <div className="tabs">
          <button className={'tab' + (type === '' ? ' on' : '')} onClick={() => setType('')}>全部题型</button>
          {Object.entries(TYPE).map(([k, v]) => (
            <button key={k} className={'tab' + (type === k ? ' on' : '')} onClick={() => setType(k)}>{v}</button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        {list.length === 0 && <p className="notice">没有符合条件的题目。</p>}
        {list.map((q) => (
          <section key={q.id} className="paper card q-card">
            <div className="q-meta">
              <span className="tag">{DIFF[q.difficulty]}</span> <span className="tag gold">{TYPE[q.type]}</span>
              <button className="fav-btn" aria-label="收藏" onClick={() => toggle(q.id)}>{favs.includes(q.id) ? '★' : '☆'}</button>
            </div>
            {q.image && <div className="q-image">{q.image}</div>}
            <p className="question">{q.q}</p>
            {q.options && <p className="hint">选项：{q.options.join(' ｜ ')}</p>}
            <p className="answer-box">答案：<b>{answerOf(q)}</b><br /><span className="hint">解释：{q.explain}</span></p>
          </section>
        ))}
        <p className="footnote"><button className="link-btn" onClick={() => { setOpen(null); setDiff(0); setType(''); }}>← 返回题库中心</button></p>
      </main>
    );
  }

  return (
    <main className="home hub">
      <header className="masthead small"><h1>题库中心</h1><div className="subtitle">15 个题库 · 简单 / 普通 / 困难</div></header>
      {error && <p className="error">{error}</p>}
      <div className="actions row">
        <button className="btn gold" onClick={() => setOpen('favorites')}>⭐ 我的收藏（{favs.length}）</button>
        <button className="btn green" onClick={onCustom}>✏️ 我的题库</button>
      </div>
      <section className="paper card">
        <div className="lobby-list">
          {banks.map((b) => (
            <button key={b.id} className="lobby-game bank-row" onClick={() => setOpen(b.id)}>
              <span className="game-icon">{b.icon}</span>
              <span className="lg-main">
                <span className="game-name">{b.name}</span>
                <span className="lg-meta">{b.desc} · 共 {b.total} 题（简 {b.byDifficulty[1]} / 普 {b.byDifficulty[2]} / 难 {b.byDifficulty[3]}）</span>
              </span>
            </button>
          ))}
        </div>
      </section>
      {publicBanks.length > 0 && (
        <section className="paper card">
          <h2>其他玩家公开的题库</h2>
          <div className="lobby-list">
            {publicBanks.map((b) => (
              <button key={b.id} className="lobby-game bank-row" onClick={() => setOpen(b.id)}>
                <span className="game-icon">🧑‍🤝‍🧑</span>
                <span className="lg-main">
                  <span className="game-name">{b.name}</span>
                  <span className="lg-meta">作者：{b.ownerName} · {b.count} 题</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      <p className="footnote"><button className="link-btn" onClick={onBack}>← 返回首页</button></p>
    </main>
  );
}
