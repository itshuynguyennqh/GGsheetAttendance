# Chay VLM service (Windows). Tu dong kich hoat venv va start uvicorn tren port 8001.
Set-Location $PSScriptRoot

if (-not (Test-Path "venv\Scripts\Activate.ps1")) {
    Write-Host "Tao virtual environment lan dau..."
    python -m venv venv
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

Write-Host "Kich hoat venv va kiem tra dependencies..."
& ".\venv\Scripts\Activate.ps1"
$null = pip show openvino-genai 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Cai dat dependencies (openvino, openvino-genai, transformers, ...)..."
    pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Loi: Neu gap 'file is being used', hay dong Cursor/IDE, mo PowerShell moi va chay: .\venv\Scripts\Activate.ps1; pip install -r requirements.txt"
        exit 1
    }
}

Write-Host "Khoi dong VLM service tai http://127.0.0.1:8001"
Write-Host "Model: $env:VLM_MODEL_PATH (mac dinh: OpenVINO/Qwen2-VL-2B-Instruct-int4-ov)"
Write-Host "Lan chay dau tien se mat 1-2 phut de tai va compile model..."
uvicorn main:app --reload --port 8001
