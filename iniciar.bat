@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Torra Local - Rotulos

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  O programa "Node.js" nao esta instalado neste computador.
  echo  Instale a versao LTS em https://nodejs.org e depois de um duplo clique neste arquivo de novo.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Primeira vez: preparando o aplicativo. Isso precisa de internet e leva alguns minutos...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 ( echo Falha ao preparar o aplicativo. Verifique a internet e tente de novo. & pause & exit /b 1 )
)
if not exist dist\server\index.js (
  echo Preparando o aplicativo...
  call npm install --no-audit --no-fund
  call npm run build
  if errorlevel 1 ( echo Falha ao preparar o aplicativo. & pause & exit /b 1 )
)

start "" http://localhost:3000
echo.
echo  Torra Local - Rotulos esta rodando. Deixe esta janela aberta.
echo  Para encerrar o aplicativo, feche esta janela.
echo.
node dist\server\index.js
pause
