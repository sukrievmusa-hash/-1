param(
    [int]$Port = 8080,
    [string]$Root = (Get-Location).Path
)

$listener = [System.Net.HttpListener]::new()
$prefixes = @(
    "http://127.0.0.1:$Port/",
    "http://localhost:$Port/"
)

foreach ($prefix in $prefixes) {
    $listener.Prefixes.Add($prefix)
}

$listener.Start()

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notmatch '^(127|169\.254)' } |
    Select-Object -First 1 -ExpandProperty IPAddress)

Write-Host "Сервер запущен. Откройте:"
Write-Host ("- http://127.0.0.1:{0}/" -f $Port)
if ($ip) {
    Write-Host ("- http://{0}:{1}/" -f $ip, $Port)
}

try {
    while ($true) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $relativePath = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)
        if ($relativePath -eq "/") {
            $relativePath = "/index.html"
        }

        $safePath = $relativePath.TrimStart('/')
        $fullPath = Join-Path $Root $safePath

        if ([string]::IsNullOrWhiteSpace($safePath)) {
            $fullPath = Join-Path $Root "index.html"
        }

        if ((Test-Path $fullPath -PathType Container)) {
            $fullPath = Join-Path $fullPath "index.html"
        }

        if (-not (Test-Path $fullPath -PathType Leaf)) {
            $response.StatusCode = 404
            $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.ContentType = "text/plain; charset=utf-8"
            $response.ContentLength64 = $body.Length
            $response.OutputStream.Write($body, 0, $body.Length)
            $response.OutputStream.Close()
            continue
        }

        $extension = [System.IO.Path]::GetExtension($fullPath)
        $contentType = switch ($extension) {
            ".html" { "text/html; charset=utf-8" }
            ".css" { "text/css; charset=utf-8" }
            ".js" { "application/javascript; charset=utf-8" }
            ".json" { "application/json; charset=utf-8" }
            ".png" { "image/png" }
            ".jpg" { "image/jpeg" }
            ".jpeg" { "image/jpeg" }
            ".svg" { "image/svg+xml" }
            default { "application/octet-stream" }
        }

        $body = [System.IO.File]::ReadAllBytes($fullPath)
        $response.StatusCode = 200
        $response.ContentType = $contentType
        $response.ContentLength64 = $body.Length
        $response.OutputStream.Write($body, 0, $body.Length)
        $response.OutputStream.Close()
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}
