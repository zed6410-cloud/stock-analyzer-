@echo off
echo ====================================
echo  StockAI - 주식 분석기 시작
echo ====================================
echo.

:: 백엔드 실행
echo [1/2] 백엔드 서버 시작 중...
cd backend
start "StockAI Backend" cmd /k "npm start"
cd ..

:: 잠시 대기
timeout /t 3 /nobreak > nul

:: 프론트엔드 실행
echo [2/2] 프론트엔드 시작 중...
cd frontend
start "StockAI Frontend" cmd /k "npm start"
cd ..

echo.
echo 브라우저에서 http://localhost:3000 을 열어주세요
echo.
pause
