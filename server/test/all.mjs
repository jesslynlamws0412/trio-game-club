// 一键全量测试：自动启动服务器（全新临时数据目录、加速的计时器），依次运行所有测试，最后汇总。
// 用法（在项目根目录）：  node server/test/all.mjs
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 3199;
const URL = `http://localhost:${PORT}`;
const FAST = {
  QUIZ_REVEAL_MS: '150', DRAW_REVEAL_MS: '200', MONOPOLY_MAX_ROUNDS: '3', PICK_REVEAL_MS: '150', DICE_REVEAL_MS: '150',
  MEMORY_HIDE_MS: '150', RPS_REVEAL_MS: '150', IDIOM_TURN_MS: '1200', REACTION_DELAY_MS: '400', REACTION_REVEAL_MS: '150',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server = null;
async function startServer(dataDir) {
  server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: path.join(root, 'server'),
    env: { ...process.env, ...FAST, PORT: String(PORT), DATA_DIR: dataDir },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await (await fetch(URL + '/healthz')).text()) === 'ok') return;
    } catch {}
    await sleep(250);
  }
  throw new Error('服务器没有启动成功');
}
async function stopServer() {
  if (!server) return;
  server.kill();
  server = null;
  await sleep(600);
}
const freshDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'trio-all-'));

const results = [];
function run(name, file, args = [], { tsx = false, env = {} } = {}) {
  const t0 = Date.now();
  const nodeArgs = [...(tsx ? ['--import', 'tsx'] : []), path.join(root, 'server/test', file), ...args];
  const r = spawnSync(process.execPath, nodeArgs, { cwd: root, env: { ...process.env, ...FAST, URL, ...env }, encoding: 'utf8', timeout: 600000 });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const m = out.match(/全部 (\d+) 项通过/) ?? out.match(/通过 (\d+) 个/);
  const pass = r.status === 0;
  results.push({ name, pass, count: m ? Number(m[1]) : null, sec: ((Date.now() - t0) / 1000).toFixed(1), tail: pass ? '' : out.split('\n').slice(-12).join('\n') });
  process.stdout.write(pass ? '.' : 'F');
}

try {
  // 1) 战绩持久化：打完一局 → 重启服务器 → 数据还在
  let dir = freshDir();
  await startServer(dir);
  run('玩家战绩（打）', 'profile.test.mjs', ['play']);
  await sleep(1200); // 等延迟保存落盘
  await stopServer();
  await startServer(dir);
  run('玩家战绩（重启后读取）', 'profile.test.mjs', ['check']);
  await stopServer();

  // 2) 玩家系统（需要干净数据）
  dir = freshDir();
  await startServer(dir);
  run('玩家系统：资料/成就/记录/好友/排行榜', 'social.test.mjs');
  await stopServer();

  // 3) 其余全部
  dir = freshDir();
  await startServer(dir);
  run('大厅与房间（三人）', 'lobby.test.mjs');
  run('人数模式：单人/双人/多人', 'modes.test.mjs');
  run('三人游戏：卧底/答题/海龟汤/狼人杀', 'games.test.mjs');
  run('双人本地轮流', 'local.test.mjs');
  run('你画我猜 / 抽卡', 'games2.test.mjs');
  run('侦探 / 大富翁', 'games3.test.mjs');
  run('新游戏一：谁最有可能/默契/骰子/猜数字/翻牌', 'games4.test.mjs');
  run('新游戏二：真假/猜拳/成语接龙/真心话/反应', 'games5.test.mjs', [], { tsx: true });
  run('题库系统', 'bank.test.mjs', [], { tsx: true });
  run('稳定性：乱发数据/断线重连/并发', 'robust.test.mjs');
  run('全平台矩阵：每款游戏 × 每种模式', 'matrix.test.mjs');
  await stopServer();
  const u = spawnSync(process.execPath, ['--import', 'tsx', path.join(root, 'server/test/monopoly.unit.ts')], { cwd: root, encoding: 'utf8' });
  const um = (u.stdout + u.stderr).match(/全部 (\d+) 项通过/);
  results.push({ name: '大富翁规则单元测试', pass: u.status === 0, count: um ? Number(um[1]) : null, sec: '-', tail: u.status === 0 ? '' : (u.stdout + u.stderr).slice(-600) });
} finally {
  await stopServer();
}

console.log('\n');
console.log('测试项目'.padEnd(40), '结果', ' 通过数', ' 用时');
for (const r of results) {
  console.log(r.name.padEnd(36), r.pass ? '通过' : '失败', String(r.count ?? '-').padStart(6), String(r.sec).padStart(7) + 's');
}
const bad = results.filter((r) => !r.pass);
const total = results.reduce((n, r) => n + (r.pass ? (r.count ?? 0) : 0), 0);
console.log(`\n共 ${results.length} 组测试，${results.length - bad.length} 组通过，累计 ${total} 个检查点通过。`);
for (const r of bad) console.log(`\n✗ ${r.name}\n${r.tail}`);
process.exit(bad.length ? 1 : 0);
