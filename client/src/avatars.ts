/** 头像列表（和服务器的 AVATARS 保持一致）。另外玩家还可以输入一个自己喜欢的表情作为自定义头像。 */
export const AVATARS = [
  '🦊', '🐻', '🐱', '🐶', '🦉', '🐼', '🐸', '🦁', '🐰', '🐯', '🦄', '🐧',
  '🐵', '🐨', '🐮', '🐷', '🐔', '🐙', '🦋', '🐢', '🐬', '🦖', '🐲', '🦈',
  '🌸', '🌻', '🍀', '🌈', '⭐', '🔥', '🎩', '🎲', '🎯', '🎸', '🚀', '👑',
];

/** 粗略判断一个输入是不是 1~2 个表情（服务器还会再校验一次） */
export function looksLikeEmoji(v: string): boolean {
  if (!v || v.length > 16) return false;
  const Seg = (Intl as any).Segmenter;
  // 旧浏览器没有 Segmenter 时，交给服务器校验
  if (!Seg) return /\p{Extended_Pictographic}/u.test(v);
  const parts: { segment: string }[] = [...new Seg('zh', { granularity: 'grapheme' }).segment(v)];
  return parts.length >= 1 && parts.length <= 2 && parts.every((s) => /\p{Extended_Pictographic}/u.test(s.segment));
}
