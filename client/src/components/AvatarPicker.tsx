import { useState } from 'react';
import { AVATARS, looksLikeEmoji } from '../avatars';
import { t } from '../i18n';

/** 头像选择：内置 36 个，也可以输入自己喜欢的表情 */
export default function AvatarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [custom, setCustom] = useState(AVATARS.includes(value) ? '' : value);
  const customOk = custom === '' || looksLikeEmoji(custom);
  return (
    <div>
      <div className="avatar-grid">
        {AVATARS.map((a) => (
          <button key={a} type="button" className={'avatar-btn' + (a === value ? ' on' : '')} onClick={() => { onChange(a); setCustom(''); }} aria-label={t('头像') + ' ' + a}>
            {a}
          </button>
        ))}
      </div>
      <label className="custom-avatar">
        {t('自定义表情')}
        <input
          value={custom}
          maxLength={8}
          placeholder={t('输入一个表情，例如 🥭')}
          onChange={(e) => {
            setCustom(e.target.value);
            if (looksLikeEmoji(e.target.value)) onChange(e.target.value);
          }}
        />
      </label>
      {!customOk && <p className="error">{t('请输入 1~2 个表情符号（不能是文字）')}</p>}
    </div>
  );
}
