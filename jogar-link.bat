@echo off
chcp 65001 >nul
title Elemental Arena - link para os amigos
cd /d "%~dp0"
where cloudflared >nul 2>nul
if not %errorlevel%==0 (
  echo.
  echo  O cloudflared nao esta instalado. Instale UMA vez ^(so neste PC^) com:
  echo.
  echo      winget install Cloudflare.cloudflared
  echo.
  echo  Depois feche e abra este arquivo de novo.
  pause
  exit /b 1
)
echo.
echo  === Elemental Arena: link para os amigos ===
echo.
echo  1^) O servidor sobe em outra janela ^(minimizada^).
echo  2^) Abaixo vai aparecer um link https://....trycloudflare.com
echo     Copie e mande para os amigos. Eles so abrem no navegador.
echo  3^) O link muda a cada vez que voce abre este arquivo.
echo  4^) Feche esta janela para parar o link; feche a outra para desligar o jogo.
echo.
set TRUST_PROXY=1
start "Elemental Arena - servidor" /min node server\server.js
timeout /t 2 >nul
cloudflared tunnel --url http://localhost:8140
pause
