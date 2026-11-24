@echo off
setlocal
title ECCEPRY - LAN server
pushd "%~dp0" || goto :failed

where node.exe >nul 2>&1 || goto :install_node
where npm.cmd >nul 2>&1 || goto :install_node
node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || major === 22 && minor >= 12 ? 0 : 1)" || goto :install_node
if not exist "package-lock.json" goto :wrong_folder
if not exist "server\lan-launcher.mjs" goto :wrong_folder

if not exist "node_modules\vite\bin\vite.js" goto :dependencies
if not exist "node_modules\ws\package.json" goto :dependencies
if not exist "node_modules\qrcode\package.json" goto :dependencies
if not exist "node_modules\sharp\package.json" goto :dependencies
fc /b "package-lock.json" "node_modules\.biovshi-lan-lock.json" >nul 2>&1 && goto :launch

:dependencies
echo Installing LAN dependencies...
call npm.cmd ci
if errorlevel 1 goto :failed
copy /y "package-lock.json" "node_modules\.biovshi-lan-lock.json" >nul

:launch
echo Starting the LAN server. Keep this window open while playing.
call npm.cmd run lan -- --start --open
if errorlevel 1 goto :failed
popd
exit /b 0

:install_node
echo Install Node.js 22.12 or newer, then open Start-LAN.bat again.
goto :failed

:wrong_folder
echo Extract the entire project archive and run Start-LAN.bat from it.

:failed
echo LAN launcher stopped. See the message above.
pause
exit /b 1
