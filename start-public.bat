@echo off
chcp 65001 >nul
rem 双击运行：启动游戏服务器 + 公网隧道。会打开两个窗口，玩的时候都不要关。
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"

if not exist "client\dist\index.html" (
  echo 第一次运行，正在构建前端……
  call npm run build
)

if not exist "%USERPROFILE%\trio-tools\cloudflared\cloudflared.exe" (
  echo 找不到 cloudflared.exe，请先阅读 docs\部署指南.md 的方案 A。
  pause
  exit /b 1
)

start "三人游戏俱乐部 - 服务器（不要关）" cmd /k "npm start"
timeout /t 4 >nul
start "三人游戏俱乐部 - 公网隧道（不要关）" cmd /k ""%USERPROFILE%\trio-tools\cloudflared\cloudflared.exe" tunnel --url http://localhost:3001 --no-autoupdate"

echo.
echo 请在“公网隧道”窗口里找一行 https://xxxx.trycloudflare.com ，把它发给朋友。
echo 玩完后关闭那两个窗口即可下线。
pause
