#!/bin/bash

# Deep-Live-Cam GCP Deployment Script
# Usage: ./deploy-gcp.sh [cpu|gpu]

set -e  # Exit on any error

MODE=${1:-cpu}
PYTHON_VERSION="3.11"
REPO_URL="https://github.com/NassCode/dlc.git"

echo "=================================================="
echo "🚀 Deep-Live-Cam GCP Deployment"
echo "=================================================="
echo "Mode: $MODE"
echo "Python: $PYTHON_VERSION"
echo "Repository: $REPO_URL"
echo "Platform: Google Cloud Platform"
echo "=================================================="

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Python 3.11 and essential tools
echo "🐍 Installing Python $PYTHON_VERSION..."
sudo apt install -y software-properties-common
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update
sudo apt install -y python3.11 python3.11-pip python3.11-venv python3.11-dev
sudo apt install -y build-essential cmake pkg-config
sudo apt install -y libgl1-mesa-glx libglib2.0-0
sudo apt install -y wget curl git

# GCP GPU-specific setup
if [ "$MODE" = "gpu" ]; then
    echo "🎮 Setting up GPU acceleration for GCP..."

    # Install NVIDIA drivers for GCP
    echo "⚡ Installing NVIDIA drivers..."
    curl -O https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.0-1_all.deb
    sudo dpkg -i cuda-keyring_1.0-1_all.deb
    sudo apt update
    sudo apt install -y cuda-drivers

    # Verify GPU
    if command -v nvidia-smi &> /dev/null; then
        nvidia-smi
        echo "✅ GPU acceleration ready"
    else
        echo "⚠️  GPU setup may require reboot. Continue with CPU fallback."
    fi
fi

# Handle different execution contexts
if [ -f "server.py" ]; then
    # Running from cloud-server directory - go to repo root
    echo "📁 Already in repository, using current directory..."
    WORK_DIR="$(pwd)/.."
    cd "$WORK_DIR"
elif [ -f "cloud-server/server.py" ]; then
    # Running from repo root
    echo "📁 Running from repository root..."
    WORK_DIR="$(pwd)"
else
    # Running standalone - clone repository
    echo "📥 Cloning repository..."
    git clone $REPO_URL dlc
    WORK_DIR="$(pwd)/dlc"
    cd "$WORK_DIR"
fi

# Create virtual environment with Python 3.11
echo "🔧 Setting up Python environment..."
python3.11 -m venv venv
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Download required model files
echo "📥 Downloading AI models..."
mkdir -p models
cd models

echo "  Downloading GFPGANv1.4.pth..."
wget -q --show-progress "https://huggingface.co/hacksider/deep-live-cam/resolve/main/GFPGANv1.4.pth"

echo "  Downloading inswapper_128_fp16.onnx..."
wget -q --show-progress "https://huggingface.co/hacksider/deep-live-cam/resolve/main/inswapper_128_fp16.onnx"

echo "✅ Model files downloaded successfully"
cd ..

# Install PyTorch for GPU if needed
if [ "$MODE" = "gpu" ]; then
    echo "🔥 Installing PyTorch with CUDA support..."
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
fi

# Install server requirements
echo "📚 Installing Python dependencies..."
if [ -f "cloud-server/requirements.txt" ]; then
    pip install -r cloud-server/requirements.txt
else
    pip install -r requirements.txt
fi

# Create necessary directories
mkdir -p uploads
mkdir -p logs

# Set up systemd service for auto-start
echo "⚙️  Setting up system service..."
sudo tee /etc/systemd/system/deeplivecam.service > /dev/null <<EOF
[Unit]
Description=Deep-Live-Cam Cloud Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
Environment=PATH=$(pwd)/venv/bin
ExecStart=$(pwd)/venv/bin/python cloud-server/server.py --mode $MODE --host 0.0.0.0 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable deeplivecam

# Configure GCP firewall (if needed)
echo "🔥 Checking firewall configuration..."
if ! gcloud compute firewall-rules describe allow-deeplivecam &>/dev/null; then
    echo "Creating firewall rule for port 8000..."
    gcloud compute firewall-rules create allow-deeplivecam \
        --allow tcp:8000 \
        --source-ranges 0.0.0.0/0 \
        --description "Allow Deep Live Cam server" || echo "⚠️  Manual firewall configuration may be needed"
fi

# Create startup script
echo "📝 Creating startup script..."
cat > start_server.sh <<EOF
#!/bin/bash
cd "\$(dirname "\$0")"
source venv/bin/activate
python cloud-server/server.py --mode $MODE --host 0.0.0.0 --port 8000
EOF
chmod +x start_server.sh

# Create monitoring script
cat > monitor.sh <<EOF
#!/bin/bash
# Monitor server status
echo "=== Deep-Live-Cam Server Status ==="
systemctl status deeplivecam --no-pager
echo ""
echo "=== Recent Logs ==="
journalctl -u deeplivecam --no-pager -n 20
echo ""
echo "=== GPU Status (if available) ==="
if command -v nvidia-smi &> /dev/null; then
    nvidia-smi
fi
echo ""
echo "=== Network Status ==="
netstat -tulpn | grep :8000
echo ""
echo "=== GCP Instance Info ==="
curl -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/external-ip 2>/dev/null || echo "External IP not available"
EOF
chmod +x monitor.sh

echo ""
echo "=================================================="
echo "✅ GCP Deployment Complete!"
echo "=================================================="
echo "Server Mode: $MODE"
echo "Service: deeplivecam"
echo "Port: 8000"
echo ""
echo "🚀 Starting server..."
sudo systemctl start deeplivecam

echo ""
echo "📊 Server Status:"
systemctl status deeplivecam --no-pager
echo ""
echo "🌐 Server should be available at:"
EXTERNAL_IP=$(curl -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/external-ip 2>/dev/null || echo "YOUR-GCP-IP")
echo "   http://$EXTERNAL_IP:8000"
echo ""
echo "💡 Useful commands:"
echo "   sudo systemctl status deeplivecam   # Check status"
echo "   sudo systemctl restart deeplivecam  # Restart server"
echo "   sudo systemctl stop deeplivecam     # Stop server"
echo "   ./monitor.sh                        # Monitor server"
echo "   gcloud compute instances list       # List instances"
echo ""
echo "🔧 GCP-specific commands:"
echo "   gcloud compute ssh deeplivecam-server --zone=us-central1-a"
echo "   gcloud compute instances stop deeplivecam-server --zone=us-central1-a"
echo "   gcloud compute instances start deeplivecam-server --zone=us-central1-a"
echo ""
echo "=================================================="