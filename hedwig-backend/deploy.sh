#!/bin/bash

# Deploy Hedwig Backend to Google Cloud Run
# This script reads environment variables from .env and deploys to Cloud Run

echo "🚀 Deploying Hedwig Backend to Cloud Run..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    exit 1
fi

# Read environment variables from .env (excluding PORT and comments)
ENV_VARS=$(grep -v '^#' .env | grep -v '^PORT=' | xargs | sed 's/ /,/g')

if [ -z "$ENV_VARS" ]; then
    echo "❌ Error: No environment variables found in .env"
    exit 1
fi

echo "📦 Building and deploying..."

gcloud run deploy hedwig-backend \
    --source . \
    --region us-central1 \
    --allow-unauthenticated \
    --set-env-vars="$ENV_VARS"

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
else
    echo "❌ Deployment failed!"
    exit 1
fi
