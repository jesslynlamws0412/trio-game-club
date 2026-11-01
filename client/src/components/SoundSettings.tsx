import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { getSound, setSound, sfx, subscribeSound, unlockAudio } from '../audio';

/** 右上角的小喇叭按钮 + 声音设置面板 */
export default function SoundSettings() {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  useEffect(() => subscribeSound(() => force((n) => n + 1)), []);
  const s = getSound();

  return (
    <>
      <button
        className="sound-btn"
        aria-label={t('声音设置')}
        onClick={() => {
          unlockAudio();
          setOpen(true);
        }}
      >
        {s.muted ? '🔇' : '🔊'}
      </button>
      {open && (
        <div className="modal-back" onClick={() => setOpen(false)}>
          <div className="modal paper" onClick={(e) => e.stopPropagation()}>
            <h2>{t('声音设置')}</h2>
            <label className="check-row">
              <input type="checkbox" checked={!s.muted} onChange={(e) => setSound({ muted: !e.target.checked })} /> {t('开启声音（取消勾选 = 全部静音）')}
            </label>
            <label className="slider">
              {t('背景音乐')} {Math.round(s.music * 100)}%
              <input type="range" min={0} max={1} step={0.05} value={s.music} onChange={(e) => setSound({ music: Number(e.target.value) })} />
            </label>
            <label className="slider">
              {t('游戏音效')} {Math.round(s.sfx * 100)}%
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.sfx}
                onChange={(e) => setSound({ sfx: Number(e.target.value) })}
                onMouseUp={() => sfx.correct()}
                onTouchEnd={() => sfx.correct()}
              />
            </label>
            <div className="actions row">
              <button className="btn small ghost" onClick={() => sfx.dice()}>🎲 {t('骰子')}</button>
              <button className="btn small ghost" onClick={() => sfx.flip()}>🃏 {t('翻牌')}</button>
              <button className="btn small ghost" onClick={() => sfx.win()}>🏆 {t('胜利')}</button>
              <button className="btn small ghost" onClick={() => sfx.lose()}>😢 {t('失败')}</button>
            </div>
            <p className="hint">{t('声音都是浏览器现场合成的，不用下载。设置只保存在这个浏览器里。')}</p>
            <button className="btn primary" onClick={() => setOpen(false)}>{t('完成')}</button>
          </div>
        </div>
      )}
    </>
  );
}
