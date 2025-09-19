#!/bin/bash

# Deep-Live-Cam Cloud Server Deployment Script
# Usage: ./deploy.sh [cpu|gpu]

set -e  # Exit on any error

MODE=${1:-cpu}
PYTHON_VERSION="3.11"
REPO_URL="https://github.com/NassCode/dlc.git"

echo "=================================================="
echo "🚀 Deep-Live-Cam Cloud Server Deployment"
echo "=================================================="
echo "Mode: $MODE"
echo "Python: $PYTHON_VERSION"
echo "Repository: $REPO_URL"
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
sudo apt install -y wget curl

# GPU-specific setup
if [ "$MODE" = "gpu" ]; then
    echo "🎮 Setting up GPU acceleration..."

    # Check if NVIDIA driver is installed
    if ! command -v nvidia-smi &> /dev/null; then
        echo "⚠️  Installing NVIDIA drivers..."
        sudo apt install -y ubuntu-drivers-common
        sudo ubuntu-drivers autoinstall
        echo "⚠️  NVIDIA drivers installed. REBOOT REQUIRED!"
        echo "   Run 'sudo reboot' then re-run this script."
        exit 1
    fi

    # Verify CUDA is available
    nvidia-smi
    echo "✅ GPU acceleration ready"
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

# Configure firewall
echo "🔥 Configuring firewall..."
sudo ufw allow 22    # SSH
sudo ufw allow 8000  # Server port
sudo ufw --force enable

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
EOF
chmod +x monitor.sh

echo ""
echo "=================================================="
echo "✅ Deployment Complete!"
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
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || curl -s ipinfo.io/ip 2>/dev/null || echo "YOUR-EC2-IP")
echo "   http://$PUBLIC_IP:8000"
echo ""
echo "💡 Useful commands:"
echo "   sudo systemctl status deeplivecam   # Check status"
echo "   sudo systemctl restart deeplivecam  # Restart server"
echo "   sudo systemctl stop deeplivecam     # Stop server"
echo "   ./monitor.sh                        # Monitor server"
echo "   tail -f /var/log/syslog | grep deeplivecam  # View logs"
echo ""
echo "=================================================="