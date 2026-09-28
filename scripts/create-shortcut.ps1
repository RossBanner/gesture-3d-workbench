$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$manifest = Get-Content -LiteralPath (Join-Path $taskRoot 'app-launch.json') -Raw | ConvertFrom-Json
$executable = [System.IO.Path]::GetFullPath($manifest.executablePath)
$outputRoot = [System.IO.Path]::GetFullPath((Join-Path $taskRoot 'outputs')) + [System.IO.Path]::DirectorySeparatorChar
if ($manifest.status -ne 'ready' -or -not $executable.StartsWith($outputRoot,[StringComparison]::OrdinalIgnoreCase)) { throw 'A verified app manifest inside this project is required.' }
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw 'Build the Windows package first.' }
$desktopPath = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
$shortcutShell = New-Object -ComObject WScript.Shell
if (-not $desktopPath) { $desktopPath = $shortcutShell.SpecialFolders.Item('Desktop') }
if (-not $desktopPath) { throw 'Windows did not provide a Desktop location.' }
$shortcutPath = Join-Path $desktopPath 'Gesture 3D Workbench.lnk'
if (Test-Path -LiteralPath $shortcutPath) {
  $existingShortcut = $shortcutShell.CreateShortcut($shortcutPath)
  $existingTarget = [System.IO.Path]::GetFullPath($existingShortcut.TargetPath)
  if (-not $existingTarget.StartsWith($outputRoot,[StringComparison]::OrdinalIgnoreCase) -or [System.IO.Path]::GetFileName($existingTarget) -ne 'Gesture 3D Workbench.exe') { throw 'An unrelated shortcut already has this name; it has been preserved.' }
}
$shortcut = $shortcutShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $executable
$shortcut.WorkingDirectory = Split-Path -Parent $executable
$shortcut.Description = 'Local webcam-controlled 3D assembly workbench'
$shortcut.IconLocation = "$executable,0"
$shortcut.Save()
$verification = $shortcutShell.CreateShortcut($shortcutPath)
if ($verification.TargetPath -ne $executable) { throw 'Shortcut target verification failed.' }
Write-Output $shortcutPath
