@echo off
cd /d "%~dp0"
git add .
git commit -m "update site"
git push
echo.
echo Done! Live site (updates in 1-2 minutes):
echo https://hila0583278831-afk.github.io/hila-ivgy-site/
start https://hila0583278831-afk.github.io/hila-ivgy-site/
pause
