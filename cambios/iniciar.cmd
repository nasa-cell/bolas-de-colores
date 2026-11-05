@echo off
chcp 65001 >nul
title Servidor - celular como camara
rem Doble clic aqui para arrancar la app con el celular como camara.
rem No cierres esta ventana mientras uses la app: si se cierra, se apaga todo.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js. Instalalo gratis desde https://nodejs.org y vuelve a abrir este archivo.
  pause
  exit /b 1
)
node servidor\servidor.js --abrir
pause
