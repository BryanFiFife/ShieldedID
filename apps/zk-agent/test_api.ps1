# Test script for ZK Agent HTTP API
Write-Host "Testing ZK Agent HTTP API..."

# Start the ZK agent in background
Write-Host "Starting ZK agent..."
$zkProcess = Start-Process -FilePath ".\target\release\zk-agent.exe" -NoNewWindow -PassThru

# Wait for server to start
Start-Sleep -Seconds 2

# Test age proof
Write-Host "Testing age proof generation..."
$body = @{
    value = 25
    min = 18
    suite = "AGE_ZK_BULLETPROOFS_V1"
    verifier_origin = "https://verifier.example.com"
    nonce = "abc123"
    expiry = "2024-12-31T23:59:59Z"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3030/prove/age" -Method Post -Body $body -ContentType "application/json"
    Write-Host ($response | ConvertTo-Json)
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "Testing assurance proof generation..."
$body = @{
    value = 1
    min = 1
    suite = "KYC_ZK_BULLETPROOFS_V1"
    verifier_origin = "https://verifier.example.com"
    nonce = "def456"
    expiry = "2024-12-31T23:59:59Z"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3030/prove/assurance" -Method Post -Body $body -ContentType "application/json"
    Write-Host ($response | ConvertTo-Json)
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}

# Kill the server
Write-Host "Stopping ZK agent..."
Stop-Process -Id $zkProcess.Id -Force

Write-Host "Test completed."