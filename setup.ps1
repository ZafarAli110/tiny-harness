# tiny-harness setup for Windows: installs Bun, llama.cpp (llama-server) and the Qwen3.5-4B model.
# Safe to run again: anything already installed is skipped, and a half-finished model download resumes.
#
# In PowerShell, in this folder:
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue" # PowerShell's own progress bars make downloads very slow

$LlamaBuild = "b12020" # the llama.cpp build this repository was tested with
$ModelUrl = "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf"
$ModelSize = 2740937888 # bytes, to tell a finished download from a broken one
$ModelFile = Join-Path $PSScriptRoot "models\Qwen3.5-4B-Q4_K_M.gguf"
$InstallDir = Join-Path $env:LOCALAPPDATA "tiny-harness" # where llama.cpp goes

Set-Location $PSScriptRoot

function Say($Text) { Write-Host "`n== $Text" -ForegroundColor Cyan }
function Have($Name) { [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

# Add a folder to PATH: now, and for every new terminal (your user PATH, once).
function Add-ToPath($Folder) {
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($null -eq $userPath) { $userPath = "" }
  if (-not (($userPath -split ";") -contains $Folder)) {
    $newPath = (($userPath.TrimEnd(";") + ";" + $Folder).TrimStart(";"))
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Host "  added $Folder to your PATH"
  }
  if (-not (($env:Path -split ";") -contains $Folder)) { $env:Path = "$Folder;$env:Path" }
}

# Download with curl.exe (built into Windows 10 and 11): a progress bar, and it can resume.
function Get-File($Url, $OutFile, [switch]$Resume) {
  if ($Resume) { curl.exe -fL --progress-bar -C - -o $OutFile $Url } else { curl.exe -fL --progress-bar -o $OutFile $Url }
  if ($LASTEXITCODE -ne 0) { throw "download failed ($LASTEXITCODE): $Url" }
}

# 1. Bun: runs the TypeScript
Say "Bun"
if (Have "bun") {
  Write-Host "  already installed: bun $(bun --version)"
} else {
  powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex" # also adds Bun to your PATH
  Add-ToPath (Join-Path $env:USERPROFILE ".bun\bin")
}

# 2. llama.cpp: llama-server runs the model on this machine (the CPU build: no graphics card needed)
Say "llama.cpp (llama-server)"
$llamaDir = Join-Path $InstallDir "llama.cpp"
$installed = Get-ChildItem $llamaDir -Recurse -Filter "llama-server.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (Have "llama-server") {
  Write-Host "  already installed: $((Get-Command llama-server).Source)"
} elseif ($installed) {
  Write-Host "  already installed: $($installed.FullName)"
  Add-ToPath $installed.DirectoryName
} else {
  $url = "https://github.com/ggml-org/llama.cpp/releases/download/$LlamaBuild/llama-$LlamaBuild-bin-win-cpu-x64.zip"
  $zip = Join-Path $env:TEMP "llama-$LlamaBuild.zip"
  Write-Host "  downloading $url"
  Get-File $url $zip
  if (Test-Path $llamaDir) { Remove-Item -Recurse -Force $llamaDir }
  New-Item -ItemType Directory -Force $llamaDir | Out-Null
  Expand-Archive -Path $zip -DestinationPath $llamaDir -Force
  Remove-Item $zip
  $exe = Get-ChildItem $llamaDir -Recurse -Filter "llama-server.exe" | Select-Object -First 1
  if (-not $exe) { throw "llama-server.exe was not in the download; install llama.cpp yourself: https://github.com/ggml-org/llama.cpp" }
  Add-ToPath $exe.DirectoryName # llama-server.exe and the DLLs next to it
  Write-Host "  installed: $($exe.FullName)"
}

# 3. The model: Qwen3.5-4B, 4-bit, about 2.7 GB, into models\ where server.ts looks for it
Say "Model: Qwen3.5-4B (about 2.7 GB)"
if ((Test-Path $ModelFile) -and ((Get-Item $ModelFile).Length -eq $ModelSize)) {
  Write-Host "  already downloaded: $ModelFile"
} else {
  New-Item -ItemType Directory -Force (Split-Path $ModelFile) | Out-Null
  Write-Host "  downloading $ModelUrl"
  Get-File $ModelUrl "$ModelFile.part" -Resume # resumes a half-finished download
  if ((Get-Item "$ModelFile.part").Length -ne $ModelSize) { throw "the download is incomplete; run .\setup.ps1 again to resume it" }
  Move-Item -Force "$ModelFile.part" $ModelFile
  Write-Host "  saved: $ModelFile"
}

# 4. Editor types (optional; the demo itself needs no packages)
Say "Packages"
bun install --silent
if ($LASTEXITCODE -eq 0) { Write-Host "  done" }

Say "Ready"
Write-Host @"
  Open a new terminal (so PATH is up to date), then, in this folder:

    bun server.ts            the model and the web page: http://localhost:3008  (leave it running)
    bun agent/1-loop.ts      in a second terminal: step 1, then 2-command.ts, 3-rules.ts ... 6-verify.ts
"@
