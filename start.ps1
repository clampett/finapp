$pwd = (Get-Location).Path

Write-Host "Waking up Docker Engine in the background..." -ForegroundColor Cyan
$dockerProcess = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
if (!$dockerProcess) {
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe" -WindowStyle Hidden
    Write-Host "Waiting for Docker daemon to initialize..." -ForegroundColor Yellow
    while (!(docker info 2>$null)) {
        Start-Sleep -Seconds 2
    }
}

Write-Host "Stopping full-stack Docker containers to prevent port conflicts..." -ForegroundColor Yellow
docker stop finapp-backend-1 finapp-frontend-1 2>$null

Write-Host "Starting Database and Python Backend in Docker..." -ForegroundColor Cyan
docker compose up --build -d db python-backend

Write-Host "Starting Spring Boot and Frontend together in this window..." -ForegroundColor Green
Write-Host "Press Ctrl + C anytime to stop servers and auto-shutdown Docker services." -ForegroundColor Yellow

cd "$pwd\frontend"

try {
    # Launch both servers
    npx concurrently --kill-others --names "SPRING,REACT" --prefix-colors "blue.bold,green.bold" "cd ..\java-backend && .\mvnw spring-boot:run" "npm run dev"
} finally {
    # This block triggers automatically when you press Ctrl+C
    Write-Host "`nShutting down Docker containers..." -ForegroundColor Cyan
    docker compose stop db python-backend
    Write-Host "All services stopped cleanly!" -ForegroundColor Green
}