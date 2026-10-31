import { useEffect, useState } from 'react';
import { request } from '../socket';
import { answerOf } from './BankCenter';

const VIS: Record<string, string> = {
  private: '仅自己使用（只能在我的单人房间用）',
  room: '仅我的房间使用（我当房主时可用）',
  public: '公开（所有人可用、可浏览）',
};
const TYPES: Record<string, string> = { single: '单选题', truefalse: '判断题', multi: '多选题', fill: '填空题' };

interface Q { id: string; difficulty: number; type: string; q: string; options?: string[]; answer: any; explain: string }
interface Bank { id: string; name: string; visibility: string; count: number; questions: Q[] }

const blank = () => ({ id: '', type: 'single', q: '', options: ['', '', '', ''], answer: 0 as any, fillAnswers: '', explain: '', difficulty: 2 });

/** 我的题库：创建自己的题库，添加 / 编辑 / 删除题目，选择公开范围 */
export default function CustomBanks({ onBack }: { onBack: () => void }) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newVis, setNewVis] = useState('room');
  const [form, setForm] = useState<ReturnType<typeof blank> | null>(null);

  const load = () =>
    request('bank:list').then((r) => (r.ok ? setBanks(r.custom.mine) : setError(r.error)));
  useEffect(() => {
    load();
  }, []);

  const run = async (event: string, data: Record<string, unknown>) => {
    setError('');
    const r = await request(event, data);
    if (!r.ok) setError(r.error);
    else await load();
    return r;
  };

  const bank = banks.find((b) => b.id === openId);

  const startEdit = (q: Q) =>
    setForm({
      id: q.id,
      type: q.type,
      q: q.q,
      options: q.options ? [...q.options, '', '', '', ''].slice(0, Math.max(4, q.options.length)) : ['', '', '', ''],
      answer: q.answer,
      fillAnswers: Array.isArray(q.answer) && q.type === 'fill' ? q.answer.join('、') : '',
      explain: q.explain,
      difficulty: q.difficulty,
    });

  const save = async () => {
    if (!form || !bank) return;
    const payload: any = { id: form.id || undefined, type: form.type, q: form.q, explain: form.explain, difficulty: form.difficulty };
    if (form.type === 'single' || form.type === 'multi') {
      // 空的选项不提交；正确答案的下标要随之重新计算
      const kept = form.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
      payload.options = kept.map((x) => x.o);
      if (form.type === 'single') payload.answer = kept.findIndex((x) => x.i === form.answer);
      else payload.answer = kept.map((x, k) => (form.answer.includes?.(x.i) ? k : -1)).filter((k) => k >= 0);
    } else if (form.type === 'truefalse') {
      payload.answer = form.answer === 1 ? 1 : 0;
    } else {
      payload.answer = form.fillAnswers.split(/[、,，\n]/).map((s) => s.trim()).filter(Boolean);
    }
    const r = await run('bank:saveq', { bankId: bank.id, question: payload });
    if (r.ok) setForm(null);
  };

  if (bank && form) {
    return (
      <main className="home hub">
        <header className="masthead small"><h1>{form.id ? '编辑题目' : '添加题目'}</h1><div className="subtitle">{bank.name}</div></header>
        <section className="paper card">
          <label className="field"><span>题型</span>
            <select value={form.type} disabled={!!form.id} onChange={(e) => setForm({ ...form, type: e.target.value, answer: e.target.value === 'multi' ? [] : 0 })}>
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="field"><span>题目（最多 120 字）</span>
            <textarea rows={2} maxLength={120} value={form.q} onChange={(e) => setForm({ ...form, q: e.target.value })} />
          </label>
          {(form.type === 'single' || form.type === 'multi') && (
            <div className="field">
              <span>选项（{form.type === 'single' ? '点圆圈选正确答案' : '勾选所有正确答案'}，空的选项会被忽略）</span>
              {form.options.map((o, i) => (
                <div key={i} className="opt-edit">
                  <input
                    type={form.type === 'single' ? 'radio' : 'checkbox'}
                    checked={form.type === 'single' ? form.answer === i : !!form.answer.includes?.(i)}
                    onChange={() =>
                      setForm({
                        ...form,
                        answer: form.type === 'single' ? i : form.answer.includes(i) ? form.answer.filter((x: number) => x !== i) : [...form.answer, i],
                      })
                    }
                  />
                  <input value={o} maxLength={40} placeholder={`选项 ${i + 1}`} onChange={(e) => setForm({ ...form, options: form.options.map((x, k) => (k === i ? e.target.value : x)) })} />
                </div>
              ))}
              {form.options.length < 6 && (
                <button className="btn ghost small" onClick={() => setForm({ ...form, options: [...form.options, ''] })}>+ 增加选项</button>
              )}
            </div>
          )}
          {form.type === 'truefalse' && (
            <div className="field"><span>正确答案</span>
              <div className="actions row">
                <button className={'btn small ' + (form.answer === 0 ? 'green' : 'ghost')} onClick={() => setForm({ ...form, answer: 0 })}>对</button>
                <button className={'btn small ' + (form.answer === 1 ? 'primary' : 'ghost')} onClick={() => setForm({ ...form, answer: 1 })}>错</button>
              </div>
            </div>
          )}
          {form.type === 'fill' && (
            <label className="field"><span>可接受的答案（用顿号或逗号隔开，最多 5 个）</span>
              <input value={form.fillAnswers} onChange={(e) => setForm({ ...form, fillAnswers: e.target.value })} placeholder="例如：5、五" />
            </label>
          )}
          <label className="field"><span>难度</span>
            <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: Number(e.target.value) })}>
              <option value={1}>简单</option><option value={2}>普通</option><option value={3}>困难</option>
            </select>
          </label>
          <label className="field"><span>答案解释（可不填）</span>
            <textarea rows={2} maxLength={200} value={form.explain} onChange={(e) => setForm({ ...form, explain: e.target.value })} />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="actions row">
            <button className="btn primary" onClick={save}>保存</button>
            <button className="btn ghost" onClick={() => { setForm(null); setError(''); }}>取消</button>
          </div>
        </section>
      </main>
    );
  }

  if (bank) {
    return (
      <main className="home hub">
        <header className="masthead small"><h1>{bank.name}</h1><div className="subtitle">{bank.count} 题 · {VIS[bank.visibility]}</div></header>
        {error && <p className="error">{error}</p>}
        <section className="paper card">
          <label className="field"><span>公开范围</span>
            <select value={bank.visibility} onChange={(e) => run('bank:update', { bankId: bank.id, visibility: e.target.value })}>
              {Object.entries(VIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <p className="hint">至少 5 道题才能在房间里使用。每个题库最多 200 题。</p>
          <div className="actions row">
            <button className="btn primary" onClick={() => setForm(blank())}>+ 添加题目</button>
            <button className="btn ghost" onClick={() => confirm('确定删除整个题库吗？') && run('bank:delete', { bankId: bank.id }).then((r) => r.ok && setOpenId(null))}>删除题库</button>
          </div>
        </section>
        {bank.questions.length === 0 && <p className="notice">还没有题目，点“添加题目”开始。</p>}
        {bank.questions.map((q) => (
          <section key={q.id} className="paper card q-card">
            <div className="q-meta"><span className="tag">{['', '简单', '普通', '困难'][q.difficulty]}</span> <span className="tag gold">{TYPES[q.type] ?? q.type}</span></div>
            <p className="question">{q.q}</p>
            <p className="answer-box">答案：<b>{answerOf(q as any)}</b></p>
            <div className="actions row">
              <button className="btn small ghost" onClick={() => startEdit(q)}>编辑</button>
              <button className="btn small ghost" onClick={() => confirm('删除这道题？') && run('bank:delq', { bankId: bank.id, questionId: q.id })}>删除</button>
            </div>
          </section>
        ))}
        <p className="footnote"><button className="link-btn" onClick={() => setOpenId(null)}>← 返回我的题库</button></p>
      </main>
    );
  }

  return (
    <main className="home hub">
      <header className="masthead small"><h1>我的题库</h1><div className="subtitle">自己出题，和朋友一起玩</div></header>
      {error && <p className="error">{error}</p>}
      <section className="paper card">
        <h2>新建题库</h2>
        <label className="field"><span>名称（最多 20 字）</span>
          <input value={newName} maxLength={20} placeholder="例如：朋友聚会题库" onChange={(e) => setNewName(e.target.value)} />
        </label>
        <label className="field"><span>公开范围</span>
          <select value={newVis} onChange={(e) => setNewVis(e.target.value)}>
            {Object.entries(VIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <button className="btn primary" onClick={async () => { const r = await run('bank:create', { name: newName, visibility: newVis }); if (r.ok) { setNewName(''); setOpenId(r.bank.id); } }}>
          创建
        </button>
      </section>
      <section className="paper card">
        <h2>我的题库（{banks.length} / 10）</h2>
        {banks.length === 0 && <p className="hint">还没有题库。</p>}
        <div className="lobby-list">
          {banks.map((b) => (
            <button key={b.id} className="lobby-game bank-row" onClick={() => setOpenId(b.id)}>
              <span className="game-icon">📒</span>
              <span className="lg-main"><span className="game-name">{b.name}</span><span className="lg-meta">{b.count} 题 · {VIS[b.visibility]}</span></span>
            </button>
          ))}
        </div>
      </section>
      <p className="footnote"><button className="link-btn" onClick={onBack}>← 返回题库中心</button></p>
    </main>
  );
}
