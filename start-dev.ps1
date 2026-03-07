# Script chay ca backend va frontend

Write-Host "=== Starting Development Servers ===" -ForegroundColor Cyan
Write-Host ""

# Kiem tra backend co chay khong
$backendRunning = netstat -ano | findstr :3001
if ($backendRunning) {
    Write-Host "Backend da chay tai port 3001" -ForegroundColor Green
} else {
    Write-Host "Dang khoi dong Backend..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\server'; node index.js" -WindowStyle Normal
    Start-Sleep -Seconds 3
    Write-Host "Backend da khoi dong" -ForegroundColor Green
}

Write-Host ""
Write-Host "Dang khoi dong Frontend..." -ForegroundColor Yellow
Write-Host "Frontend se chay tai: http://localhost:5173" -ForegroundColor Cyan
Write-Host "Backend chay tai: http://localhost:3001" -ForegroundColor Cyan
Write-Host ""
Write-Host "Nhan Ctrl+C de dung frontend server" -ForegroundColor Yellow
Write-Host ""

cd app
npm run dev
