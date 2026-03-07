# Script chay backend

Write-Host "=== Starting Backend Server ===" -ForegroundColor Cyan
Write-Host ""

# Kiem tra port 3001
$portInUse = netstat -ano | findstr :3001
if ($portInUse) {
    Write-Host "Port 3001 dang duoc su dung!" -ForegroundColor Red
    Write-Host "Dang tim process..." -ForegroundColor Yellow
    $pid = ($portInUse -split '\s+')[-1]
    Write-Host "Process ID: $pid" -ForegroundColor Yellow
    Write-Host ""
    $choice = Read-Host "Ban co muon kill process nay? (y/n)"
    if ($choice -eq 'y' -or $choice -eq 'Y') {
        taskkill /PID $pid /F
        Write-Host "Da kill process" -ForegroundColor Green
        Start-Sleep -Seconds 1
    } else {
        Write-Host "Dung script" -ForegroundColor Yellow
        exit
    }
}

Write-Host "Dang khoi dong Backend tai http://localhost:3001..." -ForegroundColor Yellow
Write-Host ""

cd server
node index.js
