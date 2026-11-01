// 列出 client/src 里所有 t('…') 用到的中文键，以及 locales 里还没有翻译的
// 用法：node tools/i18n-keys.cjs list | check
const fs = require('fs');
const path = require('path');
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f) && !p.includes('locales') && !p.endsWith('i18n.ts')) files.push(p);
  }
})('client/src');
const keys = new Set();
const re = /\bt\(\s*'((?:[^'\\]|\\.)*)'/g;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = re.exec(s))) keys.add(m[1].replace(/\\'/g, "'"));
}
// 通过 t(变量) 间接使用的键（在代码里是常量表）
const dynamic = ['单人', '双人', '三人', '多人', '单人房间只有你自己，选好游戏即可开始', '每个房间限 2 位玩家', '每个房间限 3 位玩家', '每个房间 4~8 位玩家', '空地', '1 栋房子', '2 栋房子', '3 栋房子', '4 栋房子', '酒店', '红', '黄', '绿', '蓝', '万能', '石头', '布', '剪刀', '3×词', '2×词', '3×字', '2×字', '大富翁', '飞行棋', '蛇梯棋', '拼字游戏', '井字棋', '五子棋', '羊了个羊', '叠叠高', '保龄球', '投篮机', '狼人', '预言家', '守卫', '狼人阵营', '好人阵营', '从第 2 夜起，每晚可以咬一个人。白天要想办法不被投出去。', '每晚查验一名玩家，得知他是不是狼人。', '每晚守护一名玩家（可以守自己，但不能连续两晚守同一人），被守护的人当晚不会死。', '是', '不是', '无关', '是也不是', '猜对', '没猜对'];
for (const k of dynamic) keys.add(k);
const en = fs.readFileSync('client/src/locales/en.ts', 'utf8');
const missing = [...keys].filter((k) => !en.includes("'" + k.replace(/'/g, "\\'") + "':") && !en.includes('"' + k + '":') && !en.includes('\n  ' + k + ':'));
console.log('键总数', keys.size, '缺少翻译', missing.length);
if (process.argv[2] === 'list') console.log(missing.join('\n'));
process.exit(missing.length && process.argv[2] === 'check' ? 1 : 0);
