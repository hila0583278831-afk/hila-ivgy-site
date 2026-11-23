param([int]$Port = 8080)
$root = Split-Path -Parent $PSScriptRoot
$types = @{ '.html'='text/html; charset=utf-8'; '.css'='text/css'; '.js'='application/javascript'; '.json'='application/json';
  '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.webp'='image/webp'; '.svg'='image/svg+xml';
  '.mp4'='video/mp4'; '.ttf'='font/ttf'; '.otf'='font/otf'; '.woff'='font/woff'; '.woff2'='font/woff2'; '.ico'='image/x-icon' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Serving $root on http://localhost:$Port/"
while ($l.IsListening) {
  $ctx = $l.GetContext(); $res = $ctx.Response
  try {
    $p = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($p -eq '') { $p = 'index.html' }
    $f = Join-Path $root $p
    if ((Test-Path $f -PathType Container)) { $f = Join-Path $f 'index.html' }
    if (Test-Path $f -PathType Leaf) {
      $ext = [IO.Path]::GetExtension($f).ToLower()
      $res.ContentType = $(if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' })
      $res.AddHeader('Cache-Control', 'no-cache')
      $fs = [IO.File]::OpenRead($f); $res.ContentLength64 = $fs.Length
      try { $fs.CopyTo($res.OutputStream) } finally { $fs.Close() }
    } else { $res.StatusCode = 404 }
  } catch {} finally { try { $res.Close() } catch {} }
}
