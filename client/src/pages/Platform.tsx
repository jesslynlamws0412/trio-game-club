import { useEffect, useState } from 'react';
import Home from './Home';
import Profile from './Profile';
import BankCenter from './BankCenter';
import CustomBanks from './CustomBanks';

type ModeId = 'solo' | 'duo' | 'trio' | 'party';
interface ModeInfo { id: ModeId; name: string; en: string; icon: string; players: string; desc: string; open: boolean }
interface CategoryInfo { id: string; name: string; icon: string }
interface PGame {
  id: string; name: string; icon: string; category: string;
  modes: ModeId[]; liveModes: ModeId[]; minPlayers: number; maxPlayers: number; ready: boolean;
}
interface PlatformData { modes: ModeInfo[]; categories: CategoryInfo[]; games: PGame[] }

type View =
  | { page: 'hub' }
  | { page: 'room'; mode: ModeId }
  | { page: 'games'; mode: ModeId | 'all' }
  | { page: 'bank' }
  | { page: 'custom' };

function playersText(g: PGame) {
  return g.minPlayers === g.maxPlayers ? `${g.minPlayers} 人` : `${g.minPlayers}~${g.maxPlayers} 人`;
}

export default function Platform() {
  const [view, setView] = useState<View>({ page: 'hub' });
  const [data, setData] = useState<PlatformData | null>(null);
  const [failed, setFailed] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    fetch('/api/platform')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (view.page === 'bank') return <BankCenter onBack={() => setView({ page: 'hub' })} onCustom={() => setView({ page: 'custom' })} />;
  if (view.page === 'custom') return <CustomBanks onBack={() => setView({ page: 'bank' })} />;
  if (view.page === 'room') return <Home mode={view.mode} onBack={() => setView({ page: 'hub' })} />;

  if (!data) {
    return <div className="center-msg">{failed ? '游戏大厅加载失败，请刷新页面重试' : '正在布置大厅……'}</div>;
  }

  if (view.page === 'games') {
    return (
      <GameLobby
        data={data}
        mode={view.mode}
        onMode={(mode) => setView({ page: 'games', mode })}
        onBack={() => setView({ page: 'hub' })}
        onEnter={(m) => setView({ page: 'room', mode: m })}
      />
    );
  }

  const live = data.games.filter((g) => g.ready);
  return (
    <main className="home hub">
      <header className="masthead">
        <div className="ornament">❖ ❖ ❖</div>
        <h1>复古桌游俱乐部</h1>
        <div className="subtitle">RETRO BOARD GAME HUB · 单人 · 双人 · 三人 · 多人</div>
      </header>

      <section className="mode-grid">
        {data.modes.map((m) => (
          <button
            key={m.id}
            className={'mode-card' + (m.open ? '' : ' soon')}
            onClick={() => setView({ page: 'room', mode: m.id })}
          >
            <span className="mode-icon">{m.icon}</span>
            <span className="mode-en">{m.en}</span>
            <span className="mode-name">{m.name}模式 · {m.players}</span>
            <span className="mode-desc">{m.desc}</span>
            <span className="tag live">{data.games.filter((g) => g.liveModes.includes(m.id)).length} 款可玩</span>
          </button>
        ))}
      </section>

      <section className="paper card">
        <h2>现在就能玩</h2>
        <div className="game-grid">
          {live.map((g) => (
            <div key={g.id} className="game-tile">
              <span className="game-icon">{g.icon}</span>
              <span className="game-name">{g.name}</span>
            </div>
          ))}
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setView({ page: 'games', mode: 'all' })}>浏览游戏大厅</button>
          <button className="btn gold" onClick={() => setView({ page: 'bank' })}>📚 题库中心</button>
        </div>
      </section>

      <p className="footnote">
        <button className="link-btn" onClick={() => setShowProfile(true)}>📜 我的战绩与积分榜</button>
      </p>
      <p className="footnote">共规划 {data.games.length} 款游戏，其中 {live.length} 款已可游玩，其余标注“开发中”</p>
      {showProfile && <Profile onClose={() => setShowProfile(false)} />}
    </main>
  );
}

function GameLobby({ data, mode, onMode, onBack, onEnter }: {
  data: PlatformData; mode: ModeId | 'all'; onMode: (m: ModeId | 'all') => void; onBack: () => void; onEnter: (m: ModeId) => void;
}) {
  const [liveOnly, setLiveOnly] = useState(false);
  const modeInfo = data.modes.find((m) => m.id === mode);
  const games = data.games.filter((g) => (mode === 'all' || g.modes.includes(mode)) && (!liveOnly || g.ready));

  return (
    <main className="home hub">
      <header className="masthead small">
        <h1>游戏大厅</h1>
        <div className="subtitle">{modeInfo ? `${modeInfo.en} · ${modeInfo.name}模式` : '全部模式'}</div>
      </header>

      <div className="tabs">
        <button className={'tab' + (mode === 'all' ? ' on' : '')} onClick={() => onMode('all')}>全部</button>
        {data.modes.map((m) => (
          <button key={m.id} className={'tab' + (mode === m.id ? ' on' : '')} onClick={() => onMode(m.id)}>
            {m.name}
          </button>
        ))}
      </div>

      {modeInfo && (
        <p className="notice">
          {modeInfo.name}模式（{modeInfo.players}）：标“开发中”的游戏暂时不能开始。
          <button className="btn small primary" style={{ marginLeft: 8 }} onClick={() => onEnter(modeInfo.id)}>
            进入{modeInfo.name}房间
          </button>
        </p>
      )}
      <label className="check">
        <input type="checkbox" checked={liveOnly} onChange={(e) => setLiveOnly(e.target.checked)} /> 只看可游玩的
      </label>

      {data.categories.map((c) => {
        const list = games.filter((g) => g.category === c.id);
        if (!list.length) return null;
        return (
          <section key={c.id} className="paper card">
            <h2>{c.icon} {c.name}</h2>
            <div className="lobby-list">
              {list.map((g) => (
                <div key={g.id} className={'lobby-game' + (g.ready ? '' : ' wip')}>
                  <span className="game-icon">{g.icon}</span>
                  <span className="lg-main">
                    <span className="game-name">{g.name}</span>
                    <span className="lg-meta">
                      {playersText(g)} · {g.modes.map((m) => data.modes.find((x) => x.id === m)!.name).join('/')}
                    </span>
                  </span>
                  {g.ready ? (
                    <span className="enter-btns">
                      {g.liveModes.filter((m) => mode === 'all' || m === mode).map((m) => (
                        <button key={m} className="btn small primary" onClick={() => onEnter(m)}>
                          {data.modes.find((x) => x.id === m)!.name}
                        </button>
                      ))}
                    </span>
                  ) : (
                    <span className="tag wip">开发中</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {games.length === 0 && <p className="notice">没有符合条件的游戏。</p>}

      <p className="footnote"><button className="link-btn" onClick={onBack}>← 返回首页</button></p>
    </main>
  );
}
