#!/usr/bin/env bash
# verify-services.sh - Health check for all Shielded ID services

set -e

echo "🔍 Checking Shielded ID services..."
echo ""

services=(
  "http://localhost:3000/health|Registry Server"
  "http://localhost:5050/health|Verifier Backend"
)

# Note: Vite servers (5173, 5174) don't have /health endpoints, check HTTP status only

for service in "${services[@]}"; do
  url="${service%|*}"
  name="${service#*|}"
  
  echo -n "  Checking $name... "
  if response=$(curl -s -w "\n%{http_code}" "$url" 2>/dev/null); then
    http_code=$(echo "$response" | tail -n 1)
    if [ "$http_code" = "200" ]; then
      echo "✅"
    else
      echo "❌ (HTTP $http_code)"
    fi
  else
    echo "❌ (no response)"
  fi
done

echo ""
echo "Vite dev servers (no health check):"
echo "  - Wallet PWA: http://localhost:5173"
echo "  - Verifier Demo: http://localhost:5174"
echo ""
echo "✅ Startup complete! Check the QUICKSTART.md guide."
