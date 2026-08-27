@echo off
setlocal
set "ELECTRON_RUN_AS_NODE=1"
set "NODE_OPTIONS="
"%~dp0..\..\..\SynapseNote.exe" "%~dp0..\dist\cli.mjs" %*
exit /b %errorlevel%
