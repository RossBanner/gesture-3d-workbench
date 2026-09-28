Add-Type -AssemblyName System.Drawing
$taskRoot = Split-Path -Parent $PSScriptRoot
$bitmap = New-Object System.Drawing.Bitmap 256,256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(21,32,34))
$fill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(36,69,53))
$edge = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(160,245,206)),9
$face = [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(128,42),[System.Drawing.PointF]::new(208,87),[System.Drawing.PointF]::new(208,177),[System.Drawing.PointF]::new(128,223),[System.Drawing.PointF]::new(48,177),[System.Drawing.PointF]::new(48,87))
$graphics.FillPolygon($fill,$face)
$graphics.DrawPolygon($edge,$face)
$graphics.DrawLine($edge,48,87,128,132)
$graphics.DrawLine($edge,208,87,128,132)
$graphics.DrawLine($edge,128,132,128,223)
$pngPath = Join-Path $taskRoot 'public\icon.png'
$bitmap.Save($pngPath,[System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $bitmap.Dispose(); $edge.Dispose(); $fill.Dispose()
$bytes = [System.IO.File]::ReadAllBytes($pngPath)
$stream = [System.IO.File]::Create((Join-Path $taskRoot 'public\icon.ico'))
$writer = New-Object System.IO.BinaryWriter $stream
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$bytes.Length); $writer.Write([uint32]22)
$writer.Write($bytes); $writer.Dispose(); $stream.Dispose()
