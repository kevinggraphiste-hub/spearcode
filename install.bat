@echo off
REM SpearCode installer for Windows.
REM Downloads the portable self-contained binary (no Node.js required)
REM from the latest GitHub release into %LOCALAPPDATA%\SpearCode and
REM adds it to the user PATH.
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$repo='kevinggraphiste-hub/spearcode';" ^
  "$dir=\"$env:LOCALAPPDATA\SpearCode\";" ^
  "New-Item -ItemType Directory -Force -Path $dir | Out-Null;" ^
  "$url=\"https://github.com/$repo/releases/latest/download/spearcode-win-x64.exe\";" ^
  "Write-Host \"Downloading spearcode-win-x64.exe ...\";" ^
  "Invoke-WebRequest -Uri $url -OutFile \"$dir\spearcode.exe\";" ^
  "$p=[Environment]::GetEnvironmentVariable('Path','User');" ^
  "if ($p -notlike \"*$dir*\") { [Environment]::SetEnvironmentVariable('Path', \"$p;$dir\", 'User') };" ^
  "Write-Host \"Installed to $dir\spearcode.exe\";" ^
  "Write-Host \"Open a new terminal and run: spearcode\""
endlocal
