@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Torra Local - Teste do site

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  O programa "Node.js" nao esta instalado neste computador.
  echo  Instale a versao LTS em https://nodejs.org e de um duplo clique neste arquivo de novo.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Primeira vez: preparando. Isso precisa de internet e leva alguns minutos...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo Falha ao preparar. Verifique a internet e tente de novo. & pause & exit /b 1 )
)

echo Montando o site...
call npm run build:site
if errorlevel 1 ( echo Falha ao montar o site. & pause & exit /b 1 )

start "" http://localhost:8080
echo.
echo  Site de teste em http://localhost:8080 (deixe esta janela aberta).
echo  Para encerrar, feche esta janela.
echo.
node scripts\serve-site.mjs
pause
