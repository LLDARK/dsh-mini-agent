@echo off
chcp 65001 >nul
set "PATH=C:\Users\ZFK\.workbuddy\binaries\node\versions\22.22.2-6;%PATH%"
cd /d "C:\Users\ZFK\WorkBuddy\2026-11-26-17-28-55\dsh-mini-agent"

echo.
echo ============================================================
echo   [1/4] TypeScript type check
echo ============================================================
call npm run typecheck
if errorlevel 1 goto fail

echo.
echo ============================================================
echo   [2/4] Unit tests - expect 11 passed / 0 failed
echo ============================================================
call npm test
if errorlevel 1 goto fail

echo.
echo ============================================================
echo   [3/4] web_search + web_fetch + write_file
echo ============================================================
call npx tsx src/cli.ts --task "Search web for DeepSeek Search API docs with web_search, then open the api-docs.deepseek.com link with web_fetch to read the content, then summarize in Chinese. You must call both tools." --max-turns 8
if errorlevel 1 goto fail

echo.
echo ============================================================
echo   [4/4] Interactive chat - type a question, then 'exit' to quit
echo ============================================================
call npm run demo

echo.
echo ============================================================
echo   Demo finished.
echo ============================================================
exit /b 0

:fail
echo.
echo [ERROR] A step failed. Check the output above.
exit /b 1
