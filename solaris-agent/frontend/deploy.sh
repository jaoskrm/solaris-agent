#!/bin/bash
# Quick deploy script for Vercel
# Usage: ./deploy.sh

set -e

echo "Deploying to Vercel..."

# Move large video files out temporarily
mv src/background_globe.mp4 /tmp/ 2>/dev/null || true

# Remove node_modules and dist
rm -rf node_modules dist

# Deploy
cd ..
bash /home/gman/.kilocode/skills/vercel-deploy/scripts/deploy.sh frontend

# Restore large files
mv /tmp/background_globe.mp4 src/ 2>/dev/null || true

echo "Deployment complete!"
