#!/usr/bin/env python3

import os
import sys
import argparse
import json
import base64
import io
from typing import Optional, Dict, Any
import logging

# Set execution and reduce logs before imports
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import uvicorn

# Add parent directory to path to import Deep-Live-Cam modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import Deep-Live-Cam modules
import modules.globals
import modules.metadata
from modules.processors.frame.core import get_frame_processors_modules
from modules.face_analyser import get_one_face, get_many_faces
from modules.utilities import is_image
from modules.core import update_status

# Configuration class
class ServerConfig:
    def __init__(self, mode: str = "cpu"):
        self.mode = mode.lower()
        self.setup_execution_providers()
        self.setup_globals()

    def setup_execution_providers(self):
        """Configure execution providers based on mode"""
        if self.mode == "gpu":
            # GPU mode - CUDA preferred
            os.environ['OMP_NUM_THREADS'] = '1'  # Single thread for better CUDA performance
            modules.globals.execution_providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
            print(f"GPU mode enabled - Using CUDA acceleration")
        else:
            # CPU mode
            modules.globals.execution_providers = ['CPUExecutionProvider']
            print(f"CPU mode enabled - Using CPU processing")

    def setup_globals(self):
        """Setup global configuration"""
        modules.globals.frame_processors = ['face_swapper']
        modules.globals.headless = True
        modules.globals.many_faces = False
        modules.globals.nsfw_filter = False
        modules.globals.map_faces = False

# Initialize FastAPI app
app = FastAPI(
    title="Deep-Live-Cam Cloud Server",
    version="1.0.0",
    description="Cloud processing server for real-time face swapping"
)

# Add CORS middleware for remote client access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify allowed origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
config = None
source_image_path = None
face_swapper = None
connected_clients = set()

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        connected_clients.add(websocket)
        print(f"Client connected. Total connections: {len(connected_clients)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if websocket in connected_clients:
            connected_clients.remove(websocket)
        print(f"Client disconnected. Total connections: {len(connected_clients)}")

    async def send_personal_message(self, message: str, websocket: WebSocket):
        try:
            await websocket.send_text(message)
        except:
            self.disconnect(websocket)

    async def send_personal_bytes(self, data: bytes, websocket: WebSocket):
        try:
            await websocket.send_bytes(data)
        except:
            self.disconnect(websocket)

manager = ConnectionManager()

def init_face_swapper():
    """Initialize the face swapper model"""
    global face_swapper
    try:
        # Import and initialize frame processors
        for frame_processor in get_frame_processors_modules(modules.globals.frame_processors):
            if not frame_processor.pre_check():
                raise Exception(f"Pre-check failed for {frame_processor.NAME}")
            # Skip pre_start for now since it requires source path

        # Get face swapper module
        face_swapper_module = get_frame_processors_modules(['face_swapper'])[0]
        face_swapper = face_swapper_module
        print("Face swapper initialized successfully")
        return True
    except Exception as e:
        print(f"Failed to initialize face swapper: {e}")
        return False

def process_frame_with_face_swap(frame: np.ndarray) -> np.ndarray:
    """Process a single frame with face swapping"""
    global face_swapper, source_image_path

    if not face_swapper or not source_image_path:
        return frame

    try:
        # Create a temporary copy for processing
        temp_frame = frame.copy()

        # Load source image
        source_image = cv2.imread(source_image_path)
        if source_image is None:
            print(f"Failed to load source image: {source_image_path}")
            return frame

        # Get source face
        source_face = get_one_face(source_image)
        if not source_face:
            print("No source face detected")
            return frame

        # Get target faces from current frame
        target_faces = get_many_faces(temp_frame)

        if not target_faces:
            return frame

        # Process each face
        for target_face in target_faces:
            from modules.processors.frame.face_swapper import swap_face
            temp_frame = swap_face(source_face, target_face, temp_frame)

        return temp_frame
    except Exception as e:
        print(f"Error processing frame: {e}")
        return frame

@app.get("/")
async def root():
    """Server status endpoint"""
    return {
        "service": "Deep-Live-Cam Cloud Server",
        "version": modules.metadata.version,
        "mode": config.mode,
        "status": "running",
        "execution_providers": modules.globals.execution_providers,
        "source_image_loaded": source_image_path is not None,
        "connected_clients": len(connected_clients),
        "face_swapper_initialized": face_swapper is not None
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "mode": config.mode,
        "clients": len(connected_clients)
    }

@app.post("/upload-source")
async def upload_source_image(file: UploadFile = File(...)):
    """Upload source image for face swapping"""
    global source_image_path

    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        # Save uploaded file
        uploads_dir = "uploads"
        os.makedirs(uploads_dir, exist_ok=True)

        source_image_path = os.path.join(uploads_dir, f"source_{file.filename}")

        with open(source_image_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # Verify it's a valid image with a face
        test_image = cv2.imread(source_image_path)
        if test_image is None:
            raise HTTPException(status_code=400, detail="Invalid image file")

        # Check if face is detected
        face = get_one_face(test_image)
        if not face:
            raise HTTPException(status_code=400, detail="No face detected in source image")

        print(f"Source image uploaded: {source_image_path}")
        return {"message": "Source image uploaded successfully", "filename": file.filename}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time video processing"""
    await manager.connect(websocket)

    frame_skip_counter = 0
    FRAME_SKIP = 3  # Process every 3rd frame for better performance
    last_processed_frame = None

    try:
        while True:
            # Receive frame data
            data = await websocket.receive_bytes()

            # Convert received data to image
            img_array = np.frombuffer(data, np.uint8)
            frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

            if frame is not None:
                # Resize frame for faster processing
                height, width = frame.shape[:2]
                if width > 640:  # Limit max width to 640px
                    scale = 640 / width
                    new_width = 640
                    new_height = int(height * scale)
                    frame = cv2.resize(frame, (new_width, new_height))

                frame_skip_counter += 1

                # Only process every Nth frame
                if frame_skip_counter >= FRAME_SKIP:
                    frame_skip_counter = 0
                    # Process frame with face swapping
                    processed_frame = process_frame_with_face_swap(frame)
                    last_processed_frame = processed_frame
                else:
                    # Use last processed frame or original frame
                    processed_frame = last_processed_frame if last_processed_frame is not None else frame

                # Encode processed frame back to bytes with lower quality for speed
                _, buffer = cv2.imencode('.jpg', processed_frame, [cv2.IMWRITE_JPEG_QUALITY, 60])

                # Send processed frame back
                await manager.send_personal_bytes(buffer.tobytes(), websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)

@app.get("/status")
async def get_detailed_status():
    """Get detailed server status"""
    return {
        "server": {
            "status": "running",
            "mode": config.mode,
            "version": modules.metadata.version,
            "execution_providers": modules.globals.execution_providers
        },
        "processing": {
            "source_image_loaded": source_image_path is not None,
            "face_swapper_initialized": face_swapper is not None
        },
        "connections": {
            "active_clients": len(connected_clients),
            "total_connections": len(manager.active_connections)
        }
    }

def parse_args():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description="Deep-Live-Cam Cloud Server")
    parser.add_argument(
        "--mode",
        choices=["cpu", "gpu"],
        default="cpu",
        help="Processing mode: cpu or gpu (default: cpu)"
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Host to bind to (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port to bind to (default: 8000)"
    )
    parser.add_argument(
        "--log-level",
        choices=["debug", "info", "warning", "error"],
        default="info",
        help="Log level (default: info)"
    )
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()

    print("=" * 60)
    print("🚀 Deep-Live-Cam Cloud Server")
    print("=" * 60)
    print(f"Mode: {args.mode.upper()}")
    print(f"Host: {args.host}")
    print(f"Port: {args.port}")
    print("=" * 60)

    # Initialize configuration
    config = ServerConfig(mode=args.mode)

    print(f"Execution providers: {modules.globals.execution_providers}")

    # Initialize face swapper
    if init_face_swapper():
        print("✓ Face swapper initialized successfully")
    else:
        print("⚠ Face swapper initialization failed - continuing anyway")

    # Create uploads directory
    os.makedirs("uploads", exist_ok=True)

    print(f"\n🌐 Server starting at http://{args.host}:{args.port}")
    print("📡 WebSocket endpoint: /ws")
    print("📤 Upload endpoint: /upload-source")
    print("❤️ Health check: /health")
    print("\nPress Ctrl+C to stop the server")
    print("=" * 60)

    try:
        uvicorn.run(
            app,
            host=args.host,
            port=args.port,
            log_level=args.log_level
        )
    except KeyboardInterrupt:
        print("\n👋 Server stopped by user")
    except Exception as e:
        print(f"\n❌ Server error: {e}")