// 从服务器源码里提取所有含中文的字符串（把 ${…} 换成 {a} {b} …），用来对照翻译词典
// 用法：node tools/i18n-strings.cjs <文件…>            列出全部
//       node tools/i18n-strings.cjs --missing <文件…>   只列出词典里还没有的
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const onlyMissing = args[0] === '--missing';
const files = args.filter((a) => !a.startsWith('--'));
const CJK = /[一-鿿]/;

let dictKeys = new Set();
if (onlyMissing) {
  const dir = 'server/src/i18n/en';
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.ts')) continue;
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    // 简单取出所有字符串字面量作为“已有键”
    const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`|^\s*([^\s:'"`{}\[\]][^:\n]*?):\s/gm;
    let m;
    while ((m = re.exec(s))) dictKeys.add((m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
  }
}

function strip(src) {
  // 去掉注释（简单处理：不在字符串里的 // 和 /* */）
  let out = '';
  let i = 0;
  let q = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (q) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (q === '`' && c === '$' && n === '{') {
        // 模板里的表达式：整体拷贝到配对的 }
        let depth = 0; let j = i + 1;
        for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') { depth--; if (depth === 0) break; } }
        out += src.slice(i + 1, j + 1); i = j + 1; continue;
      }
      if (c === q) q = null;
      i++;
      continue;
    }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    out += c;
    i++;
  }
  return out;
}

function templ(body) {
  // 把 ${…} 换成 {a}、{b}…（表达式里嵌套的模板字符串不展开）
  let k = 0;
  let out = '';
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '$' && body[i + 1] === '{') {
      let depth = 0; let j = i + 1;
      for (; j < body.length; j++) { if (body[j] === '{') depth++; else if (body[j] === '}') { depth--; if (depth === 0) break; } }
      out += '{' + String.fromCharCode(97 + k++) + '}';
      i = j;
    } else out += body[i];
  }
  return out;
}

for (const f of files) {
  const src = strip(fs.readFileSync(f, 'utf8'));
  const found = new Set();
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.|\$\{(?:[^{}]|\{[^{}]*\})*\})*)`/g;
  let m;
  while ((m = re.exec(src))) {
    let s = m[1] ?? m[2];
    if (s === undefined) s = templ(m[3]);
    else s = s.replace(/\\'/g, "'").replace(/\\"/g, '"');
    if (CJK.test(s) && !dictKeys.has(s)) found.add(s);
  }
  console.log('=== ' + f + ' (' + found.size + ')');
  for (const s of found) console.log(JSON.stringify(s));
}
