#!/bin/bash

# Deep-Live-Cam Debian/GCP Deployment Script
# Works with Debian and Ubuntu
# Usage: ./deploy-debian.sh [cpu|gpu]

set -e  # Exit on any error

MODE=${1:-cpu}
REPO_URL="https://github.com/NassCode/dlc.git"

echo "=================================================="
echo "🚀 Deep-Live-Cam Debian/GCP Deployment"
echo "=================================================="
echo "Mode: $MODE"
echo "Platform: $(lsb_release -d 2>/dev/null || echo "Linux")"
echo "Repository: $REPO_URL"
echo "=================================================="

# Detect OS
if [ -f /etc/debian_version ]; then
    OS="debian"
    echo "📋 Detected: Debian-based system"
elif [ -f /etc/ubuntu_version ]; then
    OS="ubuntu"
    echo "📋 Detected: Ubuntu system"
else
    OS="unknown"
    echo "📋 Unknown OS, proceeding with generic Linux setup"
fi

# Update system and fix repositories
echo "📦 Updating system packages..."
sudo apt update --allow-releaseinfo-change || sudo apt update
sudo apt upgrade -y

# Install Python and essential tools
echo "🐍 Installing Python and dependencies..."
sudo apt install -y python3 python3-pip python3-venv python3-dev
sudo apt install -y build-essential cmake pkg-config git wget curl
sudo apt install -y libgl1-mesa-glx libglib2.0-0

# Try to install Python 3.11 if available
echo "🔍 Checking for Python 3.11..."
if sudo apt install -y python3.11 python3.11-pip python3.11-venv python3.11-dev 2>/dev/null; then
    PYTHON_CMD="python3.11"
    echo "✅ Python 3.11 installed"
else
    PYTHON_CMD="python3"
    echo "⚠️  Using system Python 3 ($(python3 --version))"
fi

# GPU-specific setup for Debian/GCP
if [ "$MODE" = "gpu" ]; then
    echo "🎮 Setting up GPU acceleration..."

    # Check if NVIDIA drivers are already installed
    if command -v nvidia-smi &> /dev/null; then
        echo "✅ NVIDIA drivers already installed"
        nvidia-smi
    else
        echo "📥 Installing NVIDIA drivers for Debian..."

        # Add NVIDIA repository for Debian
        sudo apt install -y software-properties-common

        # Install NVIDIA drivers
        sudo apt update
        sudo apt install -y nvidia-driver nvidia-smi || {
            echo "⚠️  Failed to install NVIDIA drivers via apt"
            echo "   Trying alternative installation..."

            # Alternative: Install via CUDA repository
            wget https://developer.download.nvidia.com/compute/cuda/repos/debian11/x86_64/cuda-keyring_1.0-1_all.deb 2>/dev/null || \
            wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2004/x86_64/cuda-keyring_1.0-1_all.deb

            sudo dpkg -i cuda-keyring_1.0-1_all.deb
            sudo apt update
            sudo apt install -y cuda-drivers || echo "⚠️  Manual GPU setup may be required"
        }
    fi

    echo "🔍 GPU Status:"
    nvidia-smi 2>/dev/null || echo "⚠️  GPU not detected, continuing with CPU fallback"
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

# Create virtual environment
echo "🔧 Setting up Python environment..."
$PYTHON_CMD -m venv venv
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Download required model files
echo "📥 Downloading AI models..."
mkdir -p models
cd models

echo "  📄 Downloading GFPGANv1.4.pth..."
wget -q --show-progress "https://huggingface.co/hacksider/deep-live-cam/resolve/main/GFPGANv1.4.pth" || {
    echo "⚠️  Download failed, retrying..."
    curl -L -o "GFPGANv1.4.pth" "https://huggingface.co/hacksider/deep-live-cam/resolve/main/GFPGANv1.4.pth"
}

echo "  📄 Downloading inswapper_128_fp16.onnx..."
wget -q --show-progress "https://huggingface.co/hacksider/deep-live-cam/resolve/main/inswapper_128_fp16.onnx" || {
    echo "⚠️  Download failed, retrying..."
    curl -L -o "inswapper_128_fp16.onnx" "https://huggingface.co/hacksider/deep-live-cam/resolve/main/inswapper_128_fp16.onnx"
}

echo "✅ Model files downloaded successfully"
cd ..

# Install PyTorch for GPU if needed
if [ "$MODE" = "gpu" ]; then
    echo "🔥 Installing PyTorch with CUDA support..."
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
else
    echo "🔥 Installing PyTorch CPU version..."
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
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

# Configure firewall if ufw is available
echo "🔥 Configuring firewall..."
if command -v ufw &> /dev/null; then
    sudo ufw allow 22    # SSH
    sudo ufw allow 8000  # Server port
    sudo ufw --force enable
else
    echo "⚠️  UFW not available, manual firewall configuration may be needed"
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
else
    echo "GPU not available or drivers not installed"
fi
echo ""
echo "=== Network Status ==="
netstat -tulpn | grep :8000 2>/dev/null || echo "Port 8000 not active"
echo ""
echo "=== System Info ==="
echo "OS: \$(lsb_release -d 2>/dev/null || cat /etc/os-release | grep PRETTY_NAME)"
echo "Python: \$(python --version 2>/dev/null || echo "Not available")"
echo "External IP: \$(curl -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/external-ip 2>/dev/null || curl -s ifconfig.me || echo "Not available")"
EOF
chmod +x monitor.sh

# Create auto-stop script
cat > auto-stop.sh <<EOF
#!/bin/bash
# Auto-stop script to save costs
HOURS=\${1:-1}
MINUTES=\$((HOURS * 60))

echo "🕐 Auto-stop scheduled in \$HOURS hour(s)"
echo "💰 This will save you ~\\\$0.54 per hour when stopped"
echo ""
echo "⚠️  Server will shutdown in \$HOURS hour(s) at \$(date -d "+\$HOURS hours" '+%H:%M')"
echo "To cancel: sudo shutdown -c"

sudo shutdown -h +\$MINUTES
echo "✅ Auto-stop scheduled!"
EOF
chmod +x auto-stop.sh

echo ""
echo "=================================================="
echo "✅ Deployment Complete!"
echo "=================================================="
echo "Server Mode: $MODE"
echo "Python: $($PYTHON_CMD --version 2>/dev/null || echo "Unknown")"
echo "Service: deeplivecam"
echo "Port: 8000"
echo ""
echo "🚀 Starting server..."
sudo systemctl start deeplivecam

# Wait a moment for service to start
sleep 3

echo ""
echo "📊 Server Status:"
systemctl status deeplivecam --no-pager || echo "⚠️  Service status check failed"
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
echo "   ./auto-stop.sh 2                    # Auto-stop in 2 hours"
echo ""
echo "🧪 Test server:"
echo "   curl http://localhost:8000/health   # Local test"
echo "   curl http://$EXTERNAL_IP:8000/health # Remote test"
echo ""
echo "=================================================="