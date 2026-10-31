import { useEffect, useMemo, useState } from 'react';
import { loadProfile, request, saveProfile } from '../socket';
import AvatarPicker from '../components/AvatarPicker';

interface PGame { id: string; name: string; icon: string; category: string }
interface Platform { games: PGame[]; categories: { id: string; name: string; icon: string }[] }

const MODE_NAME: Record<string, string> = { solo: '单人', duo: '双人', trio: '三人', party: '多人' };
const TABS = [
  ['profile', '资料'], ['ach', '成就'], ['records', '记录'], ['board', '排行榜'], ['friends', '好友'],
] as const;
type Tab = (typeof TABS)[number][0];

const fmtDate = (at: number) => {
  const d = new Date(at);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtDur = (ms: number | null) => (ms ? `${Math.floor(ms / 60000)}分${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}秒` : '—');

/** 个人中心：资料、成就、游戏记录、排行榜、好友 */
export default function Me({ onBack, onReplay }: { onBack: () => void; onReplay: (mode: string, game: string) => void }) {
  const [tab, setTab] = useState<Tab>('profile');
  const [plat, setPlat] = useState<Platform | null>(null);
  useEffect(() => {
    fetch('/api/platform').then((r) => r.json()).then(setPlat).catch(() => {});
  }, []);
  const game = useMemo(() => new Map((plat?.games ?? []).map((g) => [g.id, g])), [plat]);
  const gname = (id: string) => (game.get(id) ? `${game.get(id)!.icon} ${game.get(id)!.name}` : id);

  return (
    <main className="home hub">
      <header className="masthead small"><h1>个人中心</h1></header>
      <div className="tabs">
        {TABS.map(([k, v]) => <button key={k} className={'tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{v}</button>)}
      </div>
      {tab === 'profile' && <ProfileTab gname={gname} />}
      {tab === 'ach' && <AchTab />}
      {tab === 'records' && <RecordsTab gname={gname} onReplay={onReplay} />}
      {tab === 'board' && <BoardTab plat={plat} />}
      {tab === 'friends' && <FriendsTab />}
      <p className="footnote"><button className="link-btn" onClick={onBack}>← 返回首页</button></p>
    </main>
  );
}

// ───────────────────────── 资料 ─────────────────────────
function ProfileTab({ gname }: { gname: (id: string) => string }) {
  const [me, setMe] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const saved = loadProfile();
  const [nick, setNick] = useState(saved?.nickname ?? '');
  const [avatar, setAvatar] = useState(saved?.avatar ?? '🦊');
  const [msg, setMsg] = useState('');

  const load = () => request('me:get').then((r) => { setMe(r.me); setLoaded(true); });
  useEffect(() => { load(); }, []);

  if (!loaded) return <p className="hint">读取中……</p>;
  const save = async () => {
    if (!nick.trim() || nick.trim().length > 8) return setMsg('昵称需要 1~8 个字');
    saveProfile({ nickname: nick.trim(), avatar });
    await request('me:get', { nickname: nick.trim(), avatar });
    setEditing(false);
    setMsg('');
    load();
  };

  if (!me) {
    return (
      <section className="paper card">
        <p className="hint">你还没有玩过任何一局。创建或加入一个房间、玩完一局后，这里会出现你的资料和战绩。</p>
      </section>
    );
  }
  const stat = (label: string, v: string | number) => <div className="stat"><b>{v}</b><span>{label}</span></div>;
  return (
    <>
      <section className="paper card">
        <div className="stat-head">
          <span className="p-avatar">{me.avatar}</span>
          <div>
            <b>{me.nickname}</b>
            <div className="hint">玩家 ID：<b className="pid">{me.code}</b>
              <button className="link-btn" onClick={() => navigator.clipboard?.writeText(me.code)}>复制</button>
            </div>
          </div>
          <button className="btn small ghost" style={{ marginLeft: 'auto' }} onClick={() => setEditing(!editing)}>{editing ? '取消' : '修改'}</button>
        </div>
        {editing && (
          <div className="edit-box">
            <label className="field"><span>昵称</span><input value={nick} maxLength={8} onChange={(e) => setNick(e.target.value)} /></label>
            <AvatarPicker value={avatar} onChange={setAvatar} />
            {msg && <p className="error">{msg}</p>}
            <button className="btn primary small" onClick={save}>保存</button>
          </div>
        )}
        <div className="stat-grid">
          {stat('游戏次数', me.played)}
          {stat('胜利', me.wins)}
          {stat('失败', me.losses)}
          {stat('胜率', me.winRate + '%')}
          {stat('累计积分', me.totalScore)}
          {stat('最高得分', me.bestScore ?? '—')}
          {stat('最佳连胜', me.bestWinStreak)}
          {stat('好友', me.friendCount)}
        </div>
        <p className="hint">最喜欢的游戏：{me.favoriteGame ? `${gname(me.favoriteGame.id)}（${me.favoriteGame.played} 局）` : '—'}</p>
        <p className="hint">单人练习只记局数和最高得分，不计胜负（对电脑的剪刀石头布、猜数字除外）。最高得分是单局游戏内的原始得分。</p>
      </section>

      <section className="paper card">
        <h2>各人数模式</h2>
        <ul className="awards">
          {['solo', 'duo', 'trio', 'party'].map((m) => (
            <li key={m}><span>{MODE_NAME[m]}</span><b>{me.perMode[m]?.played ?? 0} 局 · {me.perMode[m]?.wins ?? 0} 胜</b></li>
          ))}
        </ul>
      </section>

      {me.quiz && (
        <section className="paper card">
          <h2>题库答题统计</h2>
          <p className="hint">共答 {me.quiz.answered} 题，答对 {me.quiz.correct} 题（正确率 {me.quiz.answered ? Math.round((me.quiz.correct / me.quiz.answered) * 100) : 0}%），最长连续答对 {me.quiz.bestStreak} 题。</p>
        </section>
      )}

      <section className="paper card">
        <h2>各游戏成绩</h2>
        <ul className="awards">
          {Object.entries(me.perGame as Record<string, any>).sort((a, b) => b[1].played - a[1].played).map(([g, s]) => (
            <li key={g}><span>{gname(g)}</span><b>{s.played} 局 · {s.wins} 胜 · {s.points} 分{s.best != null ? ` · 最高 ${s.best}` : ''}</b></li>
          ))}
        </ul>
      </section>
    </>
  );
}

// ───────────────────────── 成就 ─────────────────────────
function AchTab() {
  const [list, setList] = useState<any[] | null>(null);
  useEffect(() => { request('me:get').then((r) => setList(r.me?.achievements ?? [])); }, []);
  if (!list) return <p className="hint">读取中……</p>;
  if (list.length === 0) return <section className="paper card"><p className="hint">完成第一局游戏后，这里会开始记录你的成就。</p></section>;
  const got = list.filter((a) => a.unlockedAt).length;
  return (
    <section className="paper card">
      <h2>成就 <small>{got} / {list.length}</small></h2>
      <ul className="ach-list">
        {list.map((a) => (
          <li key={a.id} className={a.unlockedAt ? 'got' : ''}>
            <span className="ach-icon">{a.unlockedAt ? a.icon : '🔒'}</span>
            <div className="ach-body">
              <b>{a.name}</b>
              <div className="hint">{a.desc}</div>
              {a.unlockedAt ? <div className="hint">解锁于 {fmtDate(a.unlockedAt)}</div> : (
                <div className="bar"><div style={{ width: `${(a.progress / a.goal) * 100}%` }} /><span>{a.progress} / {a.goal}</span></div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ───────────────────────── 游戏记录 ─────────────────────────
function RecordsTab({ gname, onReplay }: { gname: (id: string) => string; onReplay: (mode: string, game: string) => void }) {
  const [recs, setRecs] = useState<any[] | null>(null);
  useEffect(() => { request('records:get', { limit: 50 }).then((r) => setRecs(r.records)); }, []);
  if (!recs) return <p className="hint">读取中……</p>;
  if (recs.length === 0) return <section className="paper card"><p className="hint">还没有游戏记录。玩完一局后会自动保存。</p></section>;
  return (
    <>
      {recs.map((r) => {
        const me = r.players.find((p: any) => p.me);
        const solo = r.mode === 'solo';
        return (
          <section key={r.id} className="paper card q-card">
            <div className="q-meta">
              <b>{gname(r.game)}</b> <span className="tag">{MODE_NAME[r.mode] ?? r.mode}</span>
              <span className="hint" style={{ marginLeft: 'auto' }}>{fmtDate(r.at)} · {fmtDur(r.duration)}</span>
            </div>
            <div>
              {r.players.map((p: any, i: number) => (
                <span key={i} className={'rec-p' + (p.me ? ' me' : '')}>
                  {!solo && (p.rank === 1 && p.points > 0 ? '🥇' : `#${p.rank}`)} {p.avatar}{p.nickname} 得分 {p.raw ?? '—'}（积分 +{p.points}）
                </span>
              ))}
            </div>
            <p className="hint">
              {me
                ? solo
                  ? r.game === 'rps' || r.game === 'number'
                    ? me.points >= 3 ? '🏆 获胜' : '未获胜'
                    : '单人练习'
                  : me.rank === 1 && me.points > 0 ? '🏆 获胜' : '未获胜'
                : ''}
            </p>
            <button className="btn small green" onClick={() => onReplay(r.mode, r.game)}>再来一局</button>
          </section>
        );
      })}
    </>
  );
}

// ───────────────────────── 排行榜 ─────────────────────────
function BoardTab({ plat }: { plat: Platform | null }) {
  const [scope, setScope] = useState<'all' | 'week' | 'month' | 'friends' | 'best'>('all');
  const [category, setCategory] = useState('all');
  const [gameId, setGameId] = useState('quiz');
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    setRows(null);
    request('leaderboard:get', { scope, category, game: gameId }).then((r) => setRows(r.rows ?? []));
  }, [scope, category, gameId]);
  const SC: [typeof scope, string][] = [['all', '总榜'], ['week', '本周'], ['month', '本月'], ['friends', '好友榜'], ['best', '历史最高分']];
  return (
    <section className="paper card">
      <div className="tabs">
        {SC.map(([k, v]) => <button key={k} className={'tab' + (scope === k ? ' on' : '')} onClick={() => setScope(k)}>{v}</button>)}
      </div>
      {scope !== 'best' ? (
        <label className="field"><span>游戏分类</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">全部游戏</option>
            {plat?.categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </label>
      ) : (
        <label className="field"><span>选择游戏</span>
          <select value={gameId} onChange={(e) => setGameId(e.target.value)}>
            {plat?.games.filter((g: any) => g.ready).map((g) => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
          </select>
        </label>
      )}
      <p className="hint">{scope === 'week' ? '最近 7 天的积分。' : scope === 'month' ? '最近 30 天的积分。' : scope === 'friends' ? '只有你和你的好友。' : scope === 'best' ? '单局游戏内的原始最高得分。' : '累计积分（名次奖励）。'}</p>
      {!rows && <p className="hint">读取中……</p>}
      {rows && rows.length === 0 && <p className="hint">这个榜单暂时没有数据。</p>}
      <ol className="rank">
        {rows?.map((r) => (
          <li key={r.rank} className={r.me ? 'me-row' : ''}>
            <span className="medal">{['🥇', '🥈', '🥉'][r.rank - 1] ?? r.rank}</span>
            <span>{r.avatar} {r.nickname}{r.me ? '（你）' : ''}</span>
            <span className="score">{scope === 'best' ? `${r.best} 分` : `${r.points} 分 · ${r.played} 局`}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ───────────────────────── 好友 ─────────────────────────
function FriendsTab() {
  const [data, setData] = useState<{ friends: any[]; recent: any[] } | null>(null);
  const [me, setMe] = useState<any>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => request('friends:list').then((r) => r.ok && setData(r));
  useEffect(() => { load(); request('me:get').then((r) => setMe(r.me)); }, []);
  const add = async (c: string) => {
    const r = await request('friends:add', { code: c.trim() });
    setMsg(r.ok ? `已添加 ${r.friend.nickname}` : r.error);
    if (r.ok) { setCode(''); load(); }
  };
  const remove = async (c: string) => { await request('friends:remove', { code: c }); load(); };
  if (!data) return <p className="hint">读取中……（需要先玩过一局，才有玩家 ID）</p>;
  return (
    <>
      <section className="paper card">
        <h2>添加好友</h2>
        <p className="hint">你的玩家 ID：<b className="pid">{me?.code ?? '—'}</b>。把它发给朋友，朋友输入后就能加你。</p>
        <div className="join-row">
          <input className="code-input" style={{ letterSpacing: 4, textTransform: 'uppercase' }} maxLength={6} placeholder="好友 ID" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button className="btn green" onClick={() => add(code)}>添加</button>
        </div>
        {msg && <p className="hint">{msg}</p>}
      </section>
      <section className="paper card">
        <h2>我的好友（{data.friends.length}）</h2>
        {data.friends.length === 0 && <p className="hint">还没有好友。</p>}
        <ul className="awards">
          {data.friends.map((f) => (
            <li key={f.code}>
              <span>{f.online ? '🟢' : '⚪'} {f.avatar} {f.nickname}</span>
              <b>{f.totalScore} 分 · {f.played} 局 <button className="link-btn" onClick={() => confirm(`删除好友 ${f.nickname}？`) && remove(f.code)}>删除</button></b>
            </li>
          ))}
        </ul>
        <p className="hint">在房间大厅里可以点“邀请好友”，在线的好友会马上收到邀请。</p>
      </section>
      <section className="paper card">
        <h2>最近一起玩过的人</h2>
        {data.recent.length === 0 && <p className="hint">还没有一起玩过的人。</p>}
        <ul className="awards">
          {data.recent.map((f) => (
            <li key={f.code}>
              <span>{f.avatar} {f.nickname}</span>
              <b>一起玩过 {f.count} 局 {f.isFriend ? <span className="tag">好友</span> : <button className="btn small green" onClick={() => add(f.code)}>加好友</button>}</b>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
