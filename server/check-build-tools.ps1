# Script kiem tra Visual Studio Build Tools va Node.js

Write-Host "=== Kiem tra moi truong phat trien ===" -ForegroundColor Cyan
Write-Host ""

# Kiem tra Node.js
Write-Host "1. Node.js:" -ForegroundColor Yellow
$nodeVersion = node --version 2>$null
if ($nodeVersion) {
    Write-Host "   Da cai: $nodeVersion" -ForegroundColor Green
    if ($nodeVersion -match "v(\d+)") {
        $nodeMajor = [int]$matches[1]
        if ($nodeMajor -ge 20 -and $nodeMajor -le 22) {
            Write-Host "   Phien ban LTS - co prebuilt binaries!" -ForegroundColor Green
        } elseif ($nodeMajor -ge 24) {
            Write-Host "   Phien ban qua moi - can Visual Studio Build Tools" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "   Chua cai Node.js" -ForegroundColor Red
}
Write-Host ""

# Kiem tra Visual Studio Build Tools
Write-Host "2. Visual Studio Build Tools:" -ForegroundColor Yellow
$vsPaths = @(
    "C:\Program Files\Microsoft Visual Studio\2022\BuildTools",
    "C:\Program Files\Microsoft Visual Studio\2022\Community",
    "C:\Program Files\Microsoft Visual Studio\2022\Professional",
    "C:\Program Files\Microsoft Visual Studio\2022\Enterprise"
)

$foundVS = $false
foreach ($vsPath in $vsPaths) {
    if (Test-Path $vsPath) {
        $vcvars = Get-ChildItem "$vsPath\VC\Auxiliary\Build\vcvarsall.bat" -ErrorAction SilentlyContinue
        if ($vcvars) {
            Write-Host "   Tim thay tai: $vsPath" -ForegroundColor Green
            $foundVS = $true
            break
        }
    }
}

if (-not $foundVS) {
    Write-Host "   Khong tim thay Visual Studio Build Tools" -ForegroundColor Red
    Write-Host "   Can cai: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022" -ForegroundColor Yellow
}
Write-Host ""

# Kiem tra better-sqlite3
Write-Host "3. better-sqlite3:" -ForegroundColor Yellow
if (Test-Path "node_modules\better-sqlite3") {
    Write-Host "   Da cai trong node_modules" -ForegroundColor Green
} else {
    Write-Host "   Chua cai - can chay: npm install" -ForegroundColor Red
}
Write-Host ""

# Ket luan
Write-Host "=== Ket luan ===" -ForegroundColor Cyan
if ($nodeVersion) {
    if ($nodeVersion -match "v(\d+)") {
        $nodeMajor = [int]$matches[1]
        if ($nodeMajor -ge 20 -and $nodeMajor -le 22) {
            Write-Host "Moi truong OK! Co the chay: npm install" -ForegroundColor Green
        } elseif ($foundVS) {
            Write-Host "Co Visual Studio Build Tools! Co the chay: npm install" -ForegroundColor Green
        } else {
            Write-Host "Can cai Visual Studio Build Tools hoac dung Node.js LTS (v20/v22)" -ForegroundColor Red
            Write-Host ""
            Write-Host "Giai phap nhanh:" -ForegroundColor Yellow
            Write-Host "  1. Cai Node.js LTS: https://nodejs.org/" -ForegroundColor White
            Write-Host "  2. Hoac cai Build Tools: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022" -ForegroundColor White
        }
    }
} else {
    Write-Host "Can cai Node.js truoc!" -ForegroundColor Red
}
