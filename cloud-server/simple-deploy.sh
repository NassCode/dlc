#!/bin/bash

# Simplified Deep-Live-Cam Deployment Script
# Only clones repo and downloads models
# Usage: ./simple-deploy.sh
# curl -L -o simple-deploy.sh "https://raw.githubusercontent.com/NassCode/dlc/main/cloud-server/simple-deploy.sh"
#  


set -e  # Exit on any error

REPO_URL="https://github.com/NassCode/dlc.git"

echo "=================================================="
echo "🚀 Deep-Live-Cam Simple Deployment"
echo "=================================================="
echo "Repository: $REPO_URL"
echo "=================================================="

# Clone repository if not exists
if [ -d "dlc" ]; then
    echo "📁 Repository already exists, updating..."
    cd dlc
    git pull
    cd ..
else
    echo "📥 Cloning repository..."
    git clone $REPO_URL dlc
fi

cd dlc

# Create models directory and download required files
echo "📥 Downloading AI models..."
mkdir -p models

echo "  📄 Downloading GFPGANv1.4.pth..."
if [ ! -f "models/GFPGANv1.4.pth" ]; then
    wget -q --show-progress -O "models/GFPGANv1.4.pth" \
        "https://huggingface.co/hacksider/deep-live-cam/resolve/main/GFPGANv1.4.pth" || {
        echo "⚠️  wget failed, trying curl..."
        curl -L -o "models/GFPGANv1.4.pth" \
            "https://huggingface.co/hacksider/deep-live-cam/resolve/main/GFPGANv1.4.pth"
    }
else
    echo "  ✅ GFPGANv1.4.pth already exists"
fi

echo "  📄 Downloading inswapper_128_fp16.onnx..."
if [ ! -f "models/inswapper_128_fp16.onnx" ]; then
    wget -q --show-progress -O "models/inswapper_128_fp16.onnx" \
        "https://huggingface.co/hacksider/deep-live-cam/resolve/main/inswapper_128_fp16.onnx" || {
        echo "⚠️  wget failed, trying curl..."
        curl -L -o "models/inswapper_128_fp16.onnx" \
            "https://huggingface.co/hacksider/deep-live-cam/resolve/main/inswapper_128_fp16.onnx"
    }
else
    echo "  ✅ inswapper_128_fp16.onnx already exists"
fi

# Create other necessary directories
mkdir -p uploads
mkdir -p logs

# Verify downloads
echo ""
echo "📊 Model files verification:"
if [ -f "models/GFPGANv1.4.pth" ]; then
    echo "  ✅ GFPGANv1.4.pth: $(du -h models/GFPGANv1.4.pth | cut -f1)"
else
    echo "  ❌ GFPGANv1.4.pth: Missing"
fi

if [ -f "models/inswapper_128_fp16.onnx" ]; then
    echo "  ✅ inswapper_128_fp16.onnx: $(du -h models/inswapper_128_fp16.onnx | cut -f1)"
else
    echo "  ❌ inswapper_128_fp16.onnx: Missing"
fi

echo ""
echo "=================================================="
echo "✅ Simple Deployment Complete!"
echo "=================================================="
echo "📁 Project directory: $(pwd)"
echo "📦 Models directory: $(pwd)/models"
echo "📤 Uploads directory: $(pwd)/uploads"
echo ""
echo "🔧 Next steps:"
echo "   1. Create virtual environment: python3 -m venv venv"
echo "   2. Activate environment: source venv/bin/activate"
echo "   3. Install dependencies: pip install -r requirements.txt"
echo "   4. Install server deps: pip install fastapi uvicorn[standard] python-multipart websockets"
echo "   5. Test GPU: python -c \"import torch; print('CUDA:', torch.cuda.is_available())\""
echo "   6. Start server: python cloud-server/server.py --mode gpu --host 0.0.0.0 --port 8000 --profile"
echo ""
echo "🌐 Remember to configure firewall:"
echo "   gcloud compute firewall-rules create allow-deeplivecam-8000 \\"
echo "       --allow tcp:8000 --source-ranges 0.0.0.0/0"
echo ""
echo "=================================================="