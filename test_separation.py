#!/usr/bin/env python3

"""
Test script for separated client-server architecture
"""

import os
import sys
import subprocess
import time
import webbrowser
from pathlib import Path

def test_local_server():
    """Test the cloud server locally"""
    print("🧪 Testing Cloud Server Locally")
    print("=" * 50)

    # Check if we're in the right directory
    if not os.path.exists("cloud-server/server.py"):
        print("❌ Please run this from the Deep-Live-Cam root directory")
        return False

    # Start server in CPU mode
    print("🚀 Starting server in CPU mode...")
    server_cmd = [
        sys.executable, "cloud-server/server.py",
        "--mode", "cpu",
        "--host", "localhost",
        "--port", "8000"
    ]

    try:
        print("💡 Server will start in background...")
        print("   URL: http://localhost:8000")
        print("   Press Ctrl+C to stop the test")
        print("")

        # Start server
        process = subprocess.Popen(server_cmd, cwd=os.getcwd())

        # Wait a moment for server to start
        time.sleep(3)

        # Open client
        client_path = Path("local-client/client.html").resolve()
        print(f"🌐 Opening client: {client_path}")
        webbrowser.open(f"file://{client_path}")

        print("")
        print("✅ Test Setup Complete!")
        print("")
        print("📋 Test Instructions:")
        print("1. Upload a source image with a clear face")
        print("2. Click 'Start Camera' and allow camera access")
        print("3. Click 'Connect' to connect to local server")
        print("4. Click 'Start Processing' to begin face swapping")
        print("")
        print("🔍 Expected Results:")
        print("- Server should show 'Connected to server' status")
        print("- Face swapping should work in real-time")
        print("- Statistics should update (FPS, latency, frames)")
        print("")

        # Keep server running
        try:
            process.wait()
        except KeyboardInterrupt:
            print("\n🛑 Stopping server...")
            process.terminate()
            process.wait()

        print("✅ Test completed!")
        return True

    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

def test_gpu_check():
    """Check if GPU acceleration is available"""
    print("🎮 GPU Acceleration Check")
    print("=" * 50)

    try:
        import torch
        if torch.cuda.is_available():
            gpu_count = torch.cuda.device_count()
            gpu_name = torch.cuda.get_device_name(0)
            print(f"✅ CUDA available: {gpu_count} GPU(s)")
            print(f"   Primary GPU: {gpu_name}")
            return True
        else:
            print("⚠️  CUDA not available - will use CPU mode")
            return False
    except ImportError:
        print("⚠️  PyTorch not installed - will use CPU mode")
        return False

def show_architecture():
    """Show the separated architecture"""
    print("🏗️  Separated Architecture")
    print("=" * 50)
    print("""
    ┌─────────────────────┐          ┌─────────────────────┐
    │   LOCAL CLIENT      │          │   CLOUD SERVER      │
    │                     │          │                     │
    │ • client.html       │          │ • server.py         │
    │ • Camera capture    │◄────────►│ • AI processing     │
    │ • Video display     │ WebSocket │ • Face swapping     │
    │ • File upload       │          │ • CPU/GPU modes     │
    └─────────────────────┘          └─────────────────────┘

    Files Created:
    📁 cloud-server/
       ├── server.py           # Main server (CPU/GPU modes)
       ├── requirements.txt    # Server dependencies
       └── deploy.sh          # AWS deployment script

    📁 local-client/
       └── client.html        # Web-based client

    Usage:
    🖥️  Local Testing:
       python test_separation.py

    ☁️  Cloud Deployment:
       1. Launch AWS EC2 g5.xlarge with Deep Learning AMI
       2. SSH: ssh -i key.pem ubuntu@ec2-xxx.amazonaws.com
       3. Run: git clone <repo> && cd Deep-Live-Cam
       4. Deploy: cd cloud-server && chmod +x deploy.sh && ./deploy.sh gpu
       5. Access: http://your-ec2-ip:8000

    🌐 Client Connection:
       1. Open local-client/client.html in browser
       2. Change server URL to: ws://your-ec2-ip:8000
       3. Upload source image and start processing
    """)

def main():
    """Main test function"""
    print("🎭 Deep-Live-Cam Separation Test")
    print("=" * 60)

    # Show architecture
    show_architecture()

    # Check GPU
    has_gpu = test_gpu_check()

    print("")
    print("🧪 Test Options:")
    print("1. Test local server (CPU mode)")
    print("2. Show deployment instructions")
    print("3. Exit")

    choice = input("\nSelect option (1-3): ").strip()

    if choice == "1":
        test_local_server()
    elif choice == "2":
        print("\n📋 AWS Deployment Steps:")
        print("1. Launch EC2 g5.xlarge instance")
        print("2. SSH into instance")
        print("3. cd cloud-server && chmod +x deploy.sh")
        print("4. ./deploy.sh gpu  # or ./deploy.sh cpu")
        print("5. Open local-client/client.html")
        print("6. Set server URL to: ws://your-ec2-ip:8000")
    else:
        print("👋 Goodbye!")

if __name__ == "__main__":
    main()