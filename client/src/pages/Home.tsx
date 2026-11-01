import { useState } from 'react';
import { getDeviceId, loadProfile, localSetup, saveLocal, saveProfile, saveSession, send } from '../socket';
import AvatarPicker from '../components/AvatarPicker';
import { t } from '../i18n';

const MODE_TEXT: Record<string, { label: string; limit: string }> = {
  solo: { label: '单人', limit: '单人房间只有你自己，选好游戏即可开始' },
  duo: { label: '双人', limit: '每个房间限 2 位玩家' },
  trio: { label: '三人', limit: '每个房间限 3 位玩家' },
  party: { label: '多人', limit: '每个房间 4~8 位玩家' },
};

export default function Home({ onBack, mode = 'trio' }: { onBack?: () => void; mode?: string }) {
  const saved = loadProfile();
  const [nickname, setNickname] = useState(saved?.nickname ?? '');
  const [avatar, setAvatar] = useState(saved?.avatar ?? '🦊');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 双人模式可以选择本地轮流：两个人共用这台设备
  const [local, setLocal] = useState(false);
  const [guestNick, setGuestNick] = useState(t('玩家2'));

  const enter = async (action: 'create' | 'join') => {
    if (busy) return;
    setError('');
    if (!nickname.trim()) return setError(t('请先给自己起个昵称'));
    if (action === 'join' && !/^\d{4}$/.test(code.trim())) return setError(t('请输入 4 位房间号'));
    const useLocal = action === 'create' && mode === 'duo' && local;
    if (useLocal && (!guestNick.trim() || guestNick.trim().length > 8 || guestNick.trim() === nickname.trim())) {
      return setError(t('请给第二位玩家起一个和你不同的昵称（最多 8 个字）'));
    }
    setBusy(true);
    saveProfile({ nickname: nickname.trim(), avatar });
    const res = await send(action === 'create' ? 'room:create' : 'room:join', {
      nickname,
      avatar,
      code: code.trim(),
      deviceId: getDeviceId(),
      mode,
      local: useLocal,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (useLocal) {
      saveLocal(null);
      localSetup.pending = { nickname: guestNick.trim(), avatar: avatar === '🐱' ? '🐶' : '🐱', key: res.localKey! };
    }
    saveSession({ code: res.code!, token: res.token! });
  };

  return (
    <main className="home">
      <header className="masthead">
        <div className="ornament">❖ ❖ ❖</div>
        <h1>{t('复古桌游俱乐部')}</h1>
        <div className="subtitle">RETRO BOARD GAME HUB · {t('单人')} · {t('双人')} · {t('三人')} · {t('多人')}</div>
      </header>

      <section className="paper card">
        <h2>{t('入场登记')}</h2>
        <label className="field">
          <span>{t('昵称')}</span>
          <input
            value={nickname}
            maxLength={8}
            placeholder={t('最多 8 个字')}
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>
        <div className="field">
          <span>{t('头像')}</span>
          <AvatarPicker value={avatar} onChange={setAvatar} />
        </div>

        {mode === 'duo' && (
          <div className="local-opt">
            <label>
              <input type="checkbox" checked={local} onChange={(e) => setLocal(e.target.checked)} /> {t('本地轮流（两个人共用这台设备）')}
            </label>
            {local && (
              <label className="field">
                <span>{t('第二位玩家的昵称')}</span>
                <input value={guestNick} maxLength={8} onChange={(e) => setGuestNick(e.target.value)} />
              </label>
            )}
            {local && <p className="hint">{t('不需要别人加入。轮到谁，设备就交给谁；只有适合轮流玩的游戏可选。')}</p>}
          </div>
        )}

        <div className="actions">
          <button className="btn primary" disabled={busy} onClick={() => enter('create')}>
            {t('创建{mode}房间', { mode: t(MODE_TEXT[mode].label) })}
          </button>
        </div>

        <div className="divider">{t('或者')}</div>

        <div className="join-row">
          <input
            className="code-input"
            inputMode="numeric"
            maxLength={4}
            placeholder={t('房间号')}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && enter('join')}
          />
          <button className="btn green" disabled={busy} onClick={() => enter('join')}>
            {t('加入房间')}
          </button>
        </div>

        {error && <p className="error">{error}</p>}
      </section>

      {onBack && (
        <p className="footnote">
          <button className="link-btn" onClick={onBack}>{t('← 返回首页')}</button>
        </p>
      )}
      <p className="footnote">{t(MODE_TEXT[mode].limit)}{mode !== 'solo' && ' · ' + t('将房间号发给朋友即可联机')}</p>
    </main>
  );
}
