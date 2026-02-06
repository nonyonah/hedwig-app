#!/bin/bash

echo "🔍 Verifying build before deployment..."

# Run TypeScript build
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful! Ready to deploy."
    echo ""
    echo "To deploy, run:"
    echo "  ./deploy.sh"
else
    echo "❌ Build failed! Fix errors before deploying."
    exit 1
fi
