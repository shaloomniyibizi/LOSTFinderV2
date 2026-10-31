@echo off
rem LostFinder: run "lostfinder help" to see the commands.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\lostfinder.ps1" %*
