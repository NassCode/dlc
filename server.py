#!/usr/bin/env python3

import os
import sys
import asyncio
import json
import base64
import io
from typing import Optional, Dict, Any
import logging

# Set CPU execution and reduce logs before imports
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import uvicorn

# Import Deep-Live-Cam modules
import modules.globals
import modules.metadata
from modules.processors.frame.core import get_frame_processors_modules
from modules.face_analyser import get_one_face
from modules.utilities import is_image
from modules.core import update_status

# Configure for CPU-only processing
modules.globals.execution_providers = ['CPUExecutionProvider']
modules.globals.frame_processors = ['face_swapper']
modules.globals.headless = True
modules.globals.many_faces = False
modules.globals.nsfw_filter = False
modules.globals.map_faces = False

# Initialize FastAPI app
app = FastAPI(title="Deep-Live-Cam Server", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
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

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if websocket in connected_clients:
            connected_clients.remove(websocket)

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

def encode_image_to_base64(image_array: np.ndarray) -> str:
    """Convert numpy array to base64 encoded image"""
    _, buffer = cv2.imencode('.jpg', image_array)
    img_base64 = base64.b64encode(buffer).decode('utf-8')
    return img_base64

def decode_base64_to_image(base64_string: str) -> np.ndarray:
    """Convert base64 string to numpy array"""
    img_data = base64.b64decode(base64_string)
    img_array = np.frombuffer(img_data, np.uint8)
    image = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    return image

def process_frame_with_face_swap(frame: np.ndarray) -> np.ndarray:
    """Process a single frame with face swapping"""
    global face_swapper, source_image_path

    if not face_swapper or not source_image_path:
        print(f"Skipping processing: face_swapper={face_swapper is not None}, source_image_path={source_image_path}")
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
        from modules.face_analyser import get_many_faces
        target_faces = get_many_faces(temp_frame)

        if not target_faces:
            print("No target faces detected in frame")
            return frame

        print(f"Processing {len(target_faces)} faces...")
        # Process each face
        for target_face in target_faces:
            from modules.processors.frame.face_swapper import swap_face
            temp_frame = swap_face(source_face, target_face, temp_frame)

        print("Face swap completed")
        return temp_frame
    except Exception as e:
        print(f"Error processing frame: {e}")
        import traceback
        traceback.print_exc()
        return frame

@app.get("/")
async def get_client():
    """Serve the web client"""
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Deep Live Cam - Web Client</title>
        <style>
            body {
                margin: 0;
                padding: 20px;
                font-family: Arial, sans-serif;
                background: #1a1a1a;
                color: white;
            }
            .container {
                max-width: 1200px;
                margin: 0 auto;
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .controls {
                display: flex;
                gap: 20px;
                margin-bottom: 20px;
                align-items: center;
            }
            .video-container {
                display: flex;
                gap: 20px;
                justify-content: center;
            }
            .video-box {
                border: 2px solid #333;
                border-radius: 8px;
                overflow: hidden;
            }
            video, canvas {
                width: 480px;
                height: 360px;
                background: #000;
            }
            button {
                padding: 10px 20px;
                background: #007bff;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            }
            button:hover {
                background: #0056b3;
            }
            button:disabled {
                background: #666;
                cursor: not-allowed;
            }
            input[type="file"] {
                margin: 10px 0;
            }
            .status {
                margin: 10px 0;
                padding: 10px;
                background: #333;
                border-radius: 4px;
            }
            .upload-area {
                border: 2px dashed #666;
                border-radius: 8px;
                padding: 20px;
                text-align: center;
                margin: 10px 0;
            }
            .upload-area.dragover {
                border-color: #007bff;
                background: rgba(0, 123, 255, 0.1);
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Deep Live Cam - Web Client</h1>
                <p>Real-time face swapping via web browser</p>
            </div>

            <div class="controls">
                <div>
                    <label for="sourceImage">Source Image (Face to apply):</label>
                    <div class="upload-area" id="uploadArea">
                        <input type="file" id="sourceImage" accept="image/*">
                        <p>Choose file or drag & drop here</p>
                    </div>
                </div>
                <button id="startBtn">Start Camera</button>
                <button id="stopBtn" disabled>Stop Camera</button>
                <button id="connectBtn">Connect to Server</button>
            </div>

            <div class="status" id="status">Ready to connect...</div>

            <div class="video-container">
                <div class="video-box">
                    <h3 style="text-align: center;">Camera Input</h3>
                    <video id="localVideo" autoplay muted></video>
                </div>
                <div class="video-box">
                    <h3 style="text-align: center;">Processed Output</h3>
                    <canvas id="processedCanvas"></canvas>
                </div>
            </div>
        </div>

        <script>
            const localVideo = document.getElementById('localVideo');
            const processedCanvas = document.getElementById('processedCanvas');
            const ctx = processedCanvas.getContext('2d');
            const startBtn = document.getElementById('startBtn');
            const stopBtn = document.getElementById('stopBtn');
            const connectBtn = document.getElementById('connectBtn');
            const sourceImageInput = document.getElementById('sourceImage');
            const status = document.getElementById('status');
            const uploadArea = document.getElementById('uploadArea');

            let mediaStream = null;
            let websocket = null;
            let isStreaming = false;

            // Drag and drop functionality
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('dragover');
            });

            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('dragover');
            });

            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    sourceImageInput.files = files;
                    uploadSourceImage();
                }
            });

            sourceImageInput.addEventListener('change', uploadSourceImage);

            async function uploadSourceImage() {
                const file = sourceImageInput.files[0];
                if (!file) return;

                const formData = new FormData();
                formData.append('file', file);

                try {
                    const response = await fetch('/upload-source', {
                        method: 'POST',
                        body: formData
                    });

                    if (response.ok) {
                        const result = await response.text();
                        updateStatus('Source image uploaded successfully');
                    } else {
                        updateStatus('Failed to upload source image');
                    }
                } catch (error) {
                    updateStatus('Error uploading source image: ' + error.message);
                }
            }

            function updateStatus(message) {
                status.textContent = message;
                console.log(message);
            }

            async function startCamera() {
                try {
                    mediaStream = await navigator.mediaDevices.getUserMedia({
                        video: { width: 640, height: 480 }
                    });
                    localVideo.srcObject = mediaStream;
                    startBtn.disabled = true;
                    stopBtn.disabled = false;
                    updateStatus('Camera started');
                } catch (error) {
                    updateStatus('Error accessing camera: ' + error.message);
                }
            }

            function stopCamera() {
                if (mediaStream) {
                    mediaStream.getTracks().forEach(track => track.stop());
                    mediaStream = null;
                }
                localVideo.srcObject = null;
                startBtn.disabled = false;
                stopBtn.disabled = true;
                isStreaming = false;
                updateStatus('Camera stopped');
            }

            function connectToServer() {
                if (websocket) {
                    websocket.close();
                }

                websocket = new WebSocket('ws://localhost:8000/ws');

                websocket.onopen = () => {
                    updateStatus('Connected to server');
                    connectBtn.textContent = 'Disconnect';
                    connectBtn.onclick = disconnectFromServer;
                    startStreaming();
                };

                websocket.onmessage = (event) => {
                    if (event.data instanceof Blob) {
                        // Handle binary data (processed frame)
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const img = new Image();
                            img.onload = () => {
                                ctx.drawImage(img, 0, 0, processedCanvas.width, processedCanvas.height);
                            };
                            img.src = e.target.result;
                        };
                        reader.readAsDataURL(event.data);
                    } else {
                        // Handle text data
                        const data = JSON.parse(event.data);
                        if (data.type === 'status') {
                            updateStatus(data.message);
                        }
                    }
                };

                websocket.onclose = () => {
                    updateStatus('Disconnected from server');
                    connectBtn.textContent = 'Connect to Server';
                    connectBtn.onclick = connectToServer;
                    isStreaming = false;
                };

                websocket.onerror = (error) => {
                    updateStatus('WebSocket error: ' + error.message);
                };
            }

            function disconnectFromServer() {
                if (websocket) {
                    websocket.close();
                }
                isStreaming = false;
            }

            function startStreaming() {
                if (!mediaStream || !websocket || websocket.readyState !== WebSocket.OPEN) {
                    return;
                }

                isStreaming = true;

                function captureAndSend() {
                    if (!isStreaming || !websocket || websocket.readyState !== WebSocket.OPEN) {
                        return;
                    }

                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.width = localVideo.videoWidth;
                    canvas.height = localVideo.videoHeight;

                    context.drawImage(localVideo, 0, 0);

                    canvas.toBlob((blob) => {
                        if (blob && websocket && websocket.readyState === WebSocket.OPEN) {
                            websocket.send(blob);
                        }

                        // Schedule next frame (30 FPS)
                        setTimeout(captureAndSend, 33);
                    }, 'image/jpeg', 0.8);
                }

                captureAndSend();
            }

            // Event listeners
            startBtn.addEventListener('click', startCamera);
            stopBtn.addEventListener('click', stopCamera);
            connectBtn.addEventListener('click', connectToServer);

            // Set canvas size
            processedCanvas.width = 480;
            processedCanvas.height = 360;
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

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

    try:
        while True:
            # Receive frame data
            data = await websocket.receive_bytes()

            # Convert received data to image
            img_array = np.frombuffer(data, np.uint8)
            frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

            if frame is not None:
                # Process frame with face swapping
                processed_frame = process_frame_with_face_swap(frame)

                # Encode processed frame back to bytes
                _, buffer = cv2.imencode('.jpg', processed_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])

                # Send processed frame back
                await manager.send_personal_bytes(buffer.tobytes(), websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)

@app.get("/status")
async def get_status():
    """Get server status"""
    return {
        "status": "running",
        "version": modules.metadata.version,
        "execution_providers": modules.globals.execution_providers,
        "source_image": source_image_path is not None,
        "connected_clients": len(connected_clients),
        "face_swapper_initialized": face_swapper is not None
    }

if __name__ == "__main__":
    print("Initializing Deep-Live-Cam Server...")
    print("Execution providers:", modules.globals.execution_providers)

    # Initialize face swapper
    if init_face_swapper():
        print("Face swapper initialized successfully")
    else:
        print("Failed to initialize face swapper - continuing anyway")

    print("\nStarting server at http://localhost:8000")
    print("Open browser and navigate to http://localhost:8000")
    print("\nPress Ctrl+C to stop the server")

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")