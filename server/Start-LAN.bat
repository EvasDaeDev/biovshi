@echo off
setlocal
title ECCEPRY - LAN server
pushd "%~dp0" || goto :failed

where node.exe >nul 2>&1 || goto :install_node
node -e "const [major,minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || major === 22 && minor >= 12 ? 0 : 1)" || goto :install_node
if not exist "server\lan-launcher.mjs" goto :wrong_folder
if not exist "game\index.html" goto :wrong_folder
echo Starting the LAN server. Keep this window open while playing.
node server\lan-launcher.mjs --prebuilt --start --open
if errorlevel 1 goto :failed
popd
exit /b 0

:install_node
echo Install Node.js 22.12 or newer, then open Start-LAN.bat again.
goto :failed

:wrong_folder
echo Extract the entire LAN archive and run Start-LAN.bat from it.

:failed
pause
exit /b 1
