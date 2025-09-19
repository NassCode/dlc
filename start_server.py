#!/usr/bin/env python3

import os
import sys
import subprocess
import time

def check_requirements():
    """Check if required packages are installed"""
    required_packages = [
        'fastapi', 'uvicorn', 'websockets', 'python-multipart'
    ]

    missing_packages = []
    for package in required_packages:
        try:
            __import__(package)
        except ImportError:
            missing_packages.append(package)

    if missing_packages:
        print("Missing required packages:")
        for pkg in missing_packages:
            print(f"   - {pkg}")
        print("\nInstalling missing packages...")

        # Install missing packages
        cmd = [sys.executable, "-m", "pip", "install"] + missing_packages
        try:
            subprocess.run(cmd, check=True)
            print("Packages installed successfully")
        except subprocess.CalledProcessError:
            print("Failed to install packages. Please run manually:")
            print(f"   pip install {' '.join(missing_packages)}")
            return False

    return True

def check_models():
    """Check if required models exist"""
    models_dir = "models"
    required_models = [
        "inswapper_128.onnx",
        "inswapper_128_fp16.onnx"  # Optional for GPU
    ]

    if not os.path.exists(models_dir):
        print(f"Creating models directory: {models_dir}")
        os.makedirs(models_dir, exist_ok=True)

    missing_models = []
    for model in required_models:
        model_path = os.path.join(models_dir, model)
        if not os.path.exists(model_path):
            missing_models.append(model)

    if missing_models:
        print("Some models are missing - they will be downloaded automatically when needed:")
        for model in missing_models:
            print(f"   - {model}")

    return True

def main():
    print("Deep-Live-Cam Server Startup")
    print("=" * 40)

    # Check Python version
    if sys.version_info < (3, 8):
        print("ERROR: Python 3.8+ required")
        return

    print(f"OK: Python {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")

    # Check requirements
    if not check_requirements():
        return

    # Check models
    check_models()

    # Create uploads directory
    uploads_dir = "uploads"
    if not os.path.exists(uploads_dir):
        print(f"Creating uploads directory: {uploads_dir}")
        os.makedirs(uploads_dir, exist_ok=True)

    print("\nStarting Deep-Live-Cam Server...")
    print("Server will be available at: http://localhost:8000")
    print("Please wait for initialization...")
    print("\n" + "="*50)

    # Start the server
    try:
        os.system(f"{sys.executable} server.py")
    except KeyboardInterrupt:
        print("\nServer stopped by user")
    except Exception as e:
        print(f"\nError starting server: {e}")

if __name__ == "__main__":
    main()