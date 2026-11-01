import { setLang, t, useLang } from '../i18n';

/** 右上角的语言按钮：中文 ⇄ English，选择会记在这个浏览器里 */
export default function LangSwitch() {
  const lang = useLang();
  return (
    <button
      className="lang-btn"
      aria-label={t('切换语言')}
      title={lang === 'en' ? '切换到中文' : 'Switch to English'}
      onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
    >
      {lang === 'en' ? '中文' : 'EN'}
    </button>
  );
}
