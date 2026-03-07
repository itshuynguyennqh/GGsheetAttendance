# Chay OCR service (Windows). Tu dong kich hoat venv va start uvicorn.
Set-Location $PSScriptRoot

if (-not (Test-Path "venv\Scripts\Activate.ps1")) {
    Write-Host "Tao virtual environment lan dau..."
    python -m venv venv
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

Write-Host "Kich hoat venv va kiem tra dependencies..."
& ".\venv\Scripts\Activate.ps1"
$null = pip show opencv-python 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Cai dat dependencies (opencv-python, easyocr, ...)..."
    pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Loi: Neu gap 'file is being used', hay dong Cursor/IDE, mo PowerShell moi va chay: .\venv\Scripts\Activate.ps1; pip install -r requirements.txt"
        exit 1
    }
}

Write-Host "Khoi dong OCR service tai http://127.0.0.1:8000"
uvicorn main:app --reload --port 8000
