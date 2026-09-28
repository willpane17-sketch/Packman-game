@echo off
title Burger Munch
rem ---------------------------------------------------------------------
rem  Opens Burger Munch in its own window - no address bar, no tabs.
rem  Needs nothing installed: it borrows the browser engine already on the
rem  PC and runs it in app mode. Double-click this file to play.
rem ---------------------------------------------------------------------
setlocal
set "GAME=%~dp0index.html"
set "URL=file:///%GAME:\=/%"

set "APP="
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) do if not defined APP if exist %%P set "APP=%%~P"

if not defined APP (
  echo Could not find Chrome or Edge - opening in your default browser instead.
  start "" "%GAME%"
  exit /b
)

start "" "%APP%" --app="%URL%" --window-size=900,1010 --disable-features=Translate
exit /b
