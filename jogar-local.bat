@echo off
chcp 65001 >nul
title Elemental Arena - servidor local
cd /d "%~dp0"
echo.
echo  === Elemental Arena: servidor no seu PC ===
echo.
set TSIP=
where tailscale >nul 2>nul
if %errorlevel%==0 (
  for /f "delims=" %%i in ('tailscale ip -4 2^>nul') do set TSIP=%%i
)
if defined TSIP (
  echo  Passe este endereco aos amigos ^(eles precisam estar no seu Tailscale^):
  echo.
  echo      http://%TSIP%:8140
) else (
  echo  Tailscale nao encontrado ou desconectado. Instale em tailscale.com/download e entre na conta.
  echo  Enquanto isso, voce joga em http://localhost:8140
)
echo.
echo  Deixe esta janela aberta durante a partida. Feche para desligar o servidor.
echo.
node server\server.js
pause
