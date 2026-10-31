# 三人游戏俱乐部（TRIO GAME CLUB）

## 本地运行（Windows）

先安装依赖（只需一次）：

    npm install

### 方式一：开发模式（两个终端）

    npm run dev:server      # 终端 1：服务器，端口 3001
    npm run dev:client      # 终端 2：前端，打开 http://localhost:5173

### 方式二：单服务器模式（与上线后一致）

    npm run build
    npm start               # 打开 http://localhost:3001

同一局域网的手机可访问 `http://电脑IP:3001`。

## 测试

服务器启动后运行：

    node server/test/lobby.test.mjs

更多测试脚本在 `server/test/`：`lobby`、`games`、`games2`、`games3`（联机）、`profile`（战绩）、`monopoly.unit.ts`（规则）。
运行游戏测试时建议先设置：`$env:QUIZ_REVEAL_MS=150; $env:DRAW_REVEAL_MS=200; $env:MONOPOLY_MAX_ROUNDS=3`。
一个人想试玩：先启动服务器，再运行 `node server/test/bots.mjs <游戏id>`，机器人会当另外两位玩家。

## 玩家战绩存在哪里

玩家的累计积分、胜场和最近对局保存在 `server/storage/store.json`（可用环境变量 `DATA_DIR` 改位置）。
玩家身份 = 浏览器里保存的随机 ID，**清除浏览器数据会变成新玩家**。
注意：部分免费托管服务重启或重新部署时会清空磁盘，战绩也会丢失（部署阶段再处理）。

## 文档

规划与全部游戏规则见 `docs/PLAN.md`。
