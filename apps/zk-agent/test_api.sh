#!/bin/bash

# Test script for ZK Agent HTTP API
echo "Testing ZK Agent HTTP API..."

# Start the ZK agent in background
echo "Starting ZK agent..."
./target/release/zk-agent &
ZK_PID=$!

# Wait for server to start
sleep 2

# Test age proof
echo "Testing age proof generation..."
curl -X POST http://localhost:3030/prove/age \
  -H "Content-Type: application/json" \
  -d '{
    "value": 25,
    "min": 18,
    "suite": "AGE_ZK_BULLETPROOFS_V1",
    "verifier_origin": "https://verifier.example.com",
    "nonce": "abc123",
    "expiry": "2024-12-31T23:59:59Z"
  }'

echo ""
echo "Testing assurance proof generation..."
curl -X POST http://localhost:3030/prove/assurance \
  -H "Content-Type: application/json" \
  -d '{
    "value": 1,
    "min": 1,
    "suite": "KYC_ZK_BULLETPROOFS_V1",
    "verifier_origin": "https://verifier.example.com",
    "nonce": "def456",
    "expiry": "2024-12-31T23:59:59Z"
  }'

# Kill the server
echo "Stopping ZK agent..."
kill $ZK_PID

echo "Test completed."