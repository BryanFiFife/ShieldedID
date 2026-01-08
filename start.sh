#!/usr/bin/env bash
# QUICKSTART: Run this to get Shielded ID working in under 10 minutes

set -e

echo "🚀 Shielded ID Quick-Start Script"
echo "======================================"
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Please install Node.js 18+"
  exit 1
fi
echo "✅ Node.js $(node --version)"

if ! command -v pnpm &> /dev/null; then
  echo "❌ pnpm not found. Installing..."
  npm install -g pnpm@9.1.0
fi
echo "✅ pnpm $(pnpm --version)"

echo ""
echo "📦 Installing dependencies..."
pnpm install

echo ""
echo "🎯 Starting all services (pnpm dev)..."
echo ""
echo "   This will start 4 services:"
echo "   1. Registry Server (http://localhost:3000)"
echo "   2. Wallet PWA (http://localhost:5173)"
echo "   3. Verifier Frontend (http://localhost:5174)"
echo "   4. Verifier Backend (http://localhost:5050)"
echo ""
echo "   All services will output logs here."
echo "   Press Ctrl+C to stop all services."
echo ""
echo "=========================================="
echo ""

pnpm dev
