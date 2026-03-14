# Set VLM engine + Gemini model for current PowerShell session, then you run .\run.ps1
# Usage:
#   .\set-model.ps1                    # interactive
#   .\set-model.ps1 gemini             # VLM_ENGINE=gemini, default GEMINI_MODEL
#   .\set-model.ps1 gemma              # Gemma 3 27B
#   .\set-model.ps1 gemini flash-lite  # Gemini 3.1 Flash Lite

param(
    [string]$Engine = "",
    [string]$Model = ""
)

$presets = @{
    "1" = @{ VLM_ENGINE = "gemini"; GEMINI_MODEL = "gemini-3.1-flash-lite-preview"; Name = "Gemini 3.1 Flash Lite" }
    "2" = @{ VLM_ENGINE = "gemma";  GEMINI_MODEL = "gemma-3-27b-it"; Name = "Gemma 3 27B" }
    "3" = @{ VLM_ENGINE = "gemini"; GEMINI_MODEL = "gemini-2.0-flash"; Name = "Gemini 2.0 Flash" }
    "4" = @{ VLM_ENGINE = "openvino"; GEMINI_MODEL = ""; Name = "OpenVINO local (Qwen2-VL)" }
}

function Show-Help {
    Write-Host ""
    Write-Host "=== VLM service - chon model ===" -ForegroundColor Cyan
    Write-Host "Canh bao: can GEMINI_API_KEY khi dung gemini/gemma."
    Write-Host ""
    Write-Host "  1  Gemini 3.1 Flash Lite   (gemini-3.1-flash-lite-preview)"
    Write-Host "  2  Gemma 3 27B             (gemma-3-27b-it)"
    Write-Host "  3  Gemini 2.0 Flash       (gemini-2.0-flash)"
    Write-Host "  4  OpenVINO local         (khong can API key)"
    Write-Host ""
    Write-Host "Sau khi chon, chay:  .\run.ps1"
    Write-Host "Node Azota can:       `$env:OCR_ENGINE_MODE = 'vlm'"
    Write-Host ""
}

if (-not $Engine) {
    Show-Help
    $c = Read-Host "Nhap so (1-4)"
    if ($presets.ContainsKey($c)) {
        $p = $presets[$c]
        $env:VLM_ENGINE = $p.VLM_ENGINE
        if ($p.GEMINI_MODEL) { $env:GEMINI_MODEL = $p.GEMINI_MODEL }
        Write-Host "Da dat: VLM_ENGINE=$($env:VLM_ENGINE)" -ForegroundColor Green
        if ($env:GEMINI_MODEL) { Write-Host "         GEMINI_MODEL=$($env:GEMINI_MODEL)" -ForegroundColor Green }
    } else {
        Write-Host "Khong hop le."
    }
    exit 0
}

$e = $Engine.ToLower().Trim()
if ($e -eq "gemini") {
    $env:VLM_ENGINE = "gemini"
    $env:GEMINI_MODEL = if ($Model) { $Model } else { "gemini-3.1-flash-lite-preview" }
} elseif ($e -eq "gemma") {
    $env:VLM_ENGINE = "gemma"
    $env:GEMINI_MODEL = if ($Model) { $Model } else { "gemma-3-27b-it" }
} elseif ($e -eq "openvino" -or $e -eq "local") {
    $env:VLM_ENGINE = "openvino"
    Remove-Item Env:\GEMINI_MODEL -ErrorAction SilentlyContinue
} else {
    Write-Host "Engine khong ro: $Engine (dung: gemini | gemma | openvino)"
    exit 1
}

Write-Host "VLM_ENGINE=$env:VLM_ENGINE"
if ($env:GEMINI_MODEL) { Write-Host "GEMINI_MODEL=$env:GEMINI_MODEL" }
Write-Host "Chay: .\run.ps1"
