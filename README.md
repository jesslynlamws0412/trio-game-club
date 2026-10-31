# 复古桌游俱乐部（原“三人游戏俱乐部”）

支持单人、双人、三人、多人（4~8 人）的联机桌游平台，目前已有 34 款可玩的游戏（其余在大厅里标为“开发中”）。

线上地址：https://trio-game-club.onrender.com （免费托管，15 分钟没人访问会休眠，再打开要等约 1 分钟）

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

一键运行全部测试（自动启动临时服务器，约 5 分钟）：

    npm test

测试结果和覆盖范围见 `docs/测试报告.md`。单独运行某个测试需要先启动服务器，脚本都在 `server/test/`。
一个人想试玩多人游戏：先启动服务器，再运行 `node server/test/bots.mjs <游戏id>`，机器人会当另外的玩家。

## 数据存在哪里

玩家资料、战绩、游戏记录、好友、成就、自定义题库、收藏都保存在 `server/storage/store.json`（可用环境变量 `DATA_DIR` 改位置）。
- 备份：复制这个文件。恢复：停掉服务器，把备份放回原位，再启动。
- 玩家身份 = 浏览器里保存的随机 ID，**清除浏览器数据会变成新玩家**。
- 免费托管（Render）重启、休眠或重新部署时会清空磁盘，数据也会丢失。

## 题库

内置题库在 `server/src/bank/data/`，按题库分文件，格式见 `server/src/bank/build.ts`。游戏逻辑只通过 `server/src/bank/index.ts` 抽题和判题，加题不需要改游戏代码。

## 文档

- `docs/PLAN.md`：最初的规划与老游戏规则
- `docs/部署指南.md`：怎么上线、怎么更新
- `docs/测试报告.md`：第七阶段测试结果与已知问题
