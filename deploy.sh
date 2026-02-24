#!/bin/bash
set -euo pipefail

COMPOSE_FILE="docker-compose.yml"
HEALTH_URL="http://localhost:9001/api/health"
MAX_WAIT=60

echo "=== Carlytics Deployment ==="
echo "Started at: $(date)"

# Pull latest code
echo ""
echo "[1/5] Pulling latest code..."
git pull origin main

# Build the API image (includes dashboard build stage)
echo ""
echo "[2/5] Building API image..."
docker compose -f "$COMPOSE_FILE" build --no-cache api

# Start/restart all services
echo ""
echo "[3/5] Starting services..."
docker compose -f "$COMPOSE_FILE" up -d

# Wait for API health check
echo ""
echo "[4/5] Waiting for API health (max ${MAX_WAIT}s)..."
elapsed=0
while [ $elapsed -lt $MAX_WAIT ]; do
    if docker compose exec -T api wget -qO- "$HEALTH_URL" > /dev/null 2>&1; then
        echo "API is healthy after ${elapsed}s"
        break
    fi
    sleep 2
    elapsed=$((elapsed + 2))
done

if [ $elapsed -ge $MAX_WAIT ]; then
    echo "ERROR: API did not become healthy within ${MAX_WAIT}s"
    echo "Showing recent logs:"
    docker compose logs --tail=50 api
    exit 1
fi

# Show status
echo ""
echo "[5/5] Service status:"
docker compose ps
echo ""
echo "=== Deployment complete at $(date) ==="
