@echo off
rem Starts Pheme. Needs Node 22.12+ and GitHub Copilot CLI (signed in). Run "start-pheme.cmd doctor" to check.
node "%~dp0pheme.mjs" %*
if errorlevel 1 pause
