#!/usr/bin/env python3

import os
import sys
import argparse
import json
import base64
import io
import asyncio
import time
import uuid
from collections import deque
from typing import Optional, Dict, Any
import logging

# Set execution and reduce logs before imports
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException, BackgroundTasks
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image
import uvicorn

# Add parent directory to path to import Deep-Live-Cam modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import Deep-Live-Cam modules
import modules.globals
import modules.metadata
import modules.face_analyser
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
source_face_cache = None
face_swapper = None
connected_clients = set()


class RollingMs:
    def __init__(self, maxlen: int = 180):
        self._values: deque[float] = deque(maxlen=maxlen)

    def add(self, ms: float) -> None:
        self._values.append(float(ms))

    def summary(self) -> Dict[str, Any]:
        if not self._values:
            return {
                "count": 0,
                "avg_ms": None,
                "p50_ms": None,
                "p95_ms": None,
                "max_ms": None,
                "last_ms": None,
            }
        vals = list(self._values)
        vals_sorted = sorted(vals)
        n = len(vals_sorted)

        def _percentile(p: float) -> float:
            if n == 1:
                return vals_sorted[0]
            idx = int(round((p / 100.0) * (n - 1)))
            return vals_sorted[max(0, min(n - 1, idx))]

        return {
            "count": n,
            "avg_ms": sum(vals) / n,
            "p50_ms": _percentile(50),
            "p95_ms": _percentile(95),
            "max_ms": max(vals),
            "last_ms": vals[-1],
        }


profiling_enabled = False
timings: Dict[str, RollingMs] = {
    "ws_wait": RollingMs(),
    "decode": RollingMs(),
    "resize": RollingMs(),
    "detect": RollingMs(),
    "swap": RollingMs(),
    "enhance": RollingMs(),
    "process_total": RollingMs(),
    "encode": RollingMs(),
    "send": RollingMs(),
    "loop_total": RollingMs(),
}

perf_counters: Dict[str, int] = {
    "frames_received": 0,
    "frames_decoded": 0,
    "frames_decode_failed": 0,
    "frames_processed": 0,
    "frames_skipped": 0,
    "frames_encoded": 0,
    "frames_sent": 0,
}


def _ms_since(start: float) -> float:
    return (time.perf_counter() - start) * 1000.0


def _safe_onnxruntime_info() -> Dict[str, Any]:
    try:
        import onnxruntime as ort  # type: ignore

        device = None
        try:
            device = ort.get_device()
        except Exception:
            device = None

        return {
            "device": device,
            "available_providers": ort.get_available_providers(),
        }
    except Exception as e:
        return {"error": str(e)}


def _safe_insightface_session_info() -> Dict[str, Any]:
    info: Dict[str, Any] = {}

    # Face analyser sessions
    try:
        analyser = modules.face_analyser.FACE_ANALYSER
        if analyser is None:
            info["face_analyser"] = None
        else:
            models_info: Dict[str, Any] = {}
            models = getattr(analyser, "models", None)
            if isinstance(models, dict):
                for model_name, model in models.items():
                    session = getattr(model, "session", None)
                    if session is not None and hasattr(session, "get_providers"):
                        try:
                            models_info[str(model_name)] = {
                                "providers": session.get_providers(),
                                "provider_options": getattr(session, "get_provider_options", lambda: None)(),
                            }
                        except Exception:
                            models_info[str(model_name)] = {"providers": None}
                    else:
                        models_info[str(model_name)] = {"providers": None}
            info["face_analyser"] = {
                "prepared": True,
                "models": models_info,
            }
    except Exception as e:
        info["face_analyser"] = {"error": str(e)}

    # Face swapper session
    try:
        from modules.processors.frame import face_swapper as fs  # lazy import

        swapper = getattr(fs, "FACE_SWAPPER", None)
        if swapper is None:
            info["face_swapper"] = None
        else:
            session = getattr(swapper, "session", None)
            if session is not None and hasattr(session, "get_providers"):
                info["face_swapper"] = {
                    "providers": session.get_providers(),
                    "provider_options": getattr(session, "get_provider_options", lambda: None)(),
                }
            else:
                info["face_swapper"] = {"providers": None}
    except Exception as e:
        info["face_swapper"] = {"error": str(e)}

    return info

# Dynamic processing parameters
processing_params = {
    "video_quality": 80,
    "frame_skip": 1,
    "target_fps": 30,
    "enable_face_enhancer": False,
    "max_faces": 1,
    "processing_resolution": (640, 480)
}


def _set_detector_size_from_resolution(resolution: Any) -> None:
    try:
        if resolution is None:
            return
        w, h = resolution
        side = int(max(64, min(1280, max(int(w), int(h)))))
        modules.globals.detector_size = (side, side)
    except Exception:
        # Keep previous detector size if parsing fails
        return

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

# Pydantic models for API
class ProcessingParams(BaseModel):
    video_quality: Optional[int] = None
    frame_skip: Optional[int] = None
    target_fps: Optional[int] = None
    enable_face_enhancer: Optional[bool] = None
    max_faces: Optional[int] = None
    processing_resolution: Optional[tuple] = None

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
    global face_swapper, source_face_cache

    if not face_swapper or source_face_cache is None:
        return frame


def _process_video_file_cv2(input_path: str, output_path: str) -> None:
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError("Failed to open input video")

    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or not np.isfinite(fps) or fps <= 0:
        fps = 30.0

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    if width <= 0 or height <= 0:
        ret, frame = cap.read()
        if not ret or frame is None:
            cap.release()
            raise RuntimeError("Empty or unreadable video")
        height, width = frame.shape[:2]
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, float(fps), (width, height))
    if not writer.isOpened():
        cap.release()
        raise RuntimeError("Failed to open output video writer")

    try:
        target_width, _target_height = processing_params["processing_resolution"]

        while True:
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            # Match live path: optionally downscale for processing speed.
            in_h, in_w = frame.shape[:2]
            proc_frame = frame
            if in_w > int(target_width):
                scale = float(target_width) / float(in_w)
                new_w = int(target_width)
                new_h = max(1, int(in_h * scale))
                proc_frame = cv2.resize(frame, (new_w, new_h))

            processed = process_frame_with_face_swap(proc_frame)

            # Be defensive: some model paths can return None on failure.
            if processed is None:
                processed = frame

            # Write back at original dimensions to keep output consistent.
            if processed.shape[1] != width or processed.shape[0] != height:
                processed = cv2.resize(processed, (width, height))

            writer.write(processed)
    finally:
        cap.release()
        writer.release()

    try:
        # Create a temporary copy for processing
        temp_frame = frame.copy()

        source_face = source_face_cache

        # Get target faces from current frame (limited by max_faces parameter)
        detect_start = time.perf_counter()
        max_faces = processing_params["max_faces"]
        if max_faces == 1:
            target_face = get_one_face(temp_frame)
            target_faces = [target_face] if target_face else []
        else:
            target_faces = get_many_faces(temp_frame)
            if len(target_faces) > max_faces:
                target_faces = target_faces[:max_faces]

        if profiling_enabled:
            timings["detect"].add(_ms_since(detect_start))

        if not target_faces:
            return frame

        from modules.processors.frame.face_swapper import swap_face

        # Process each face
        swap_start = time.perf_counter()
        for target_face in target_faces:
            swapped = swap_face(source_face, target_face, temp_frame)
            if swapped is not None:
                temp_frame = swapped
        if profiling_enabled:
            timings["swap"].add(_ms_since(swap_start))

        # Apply face enhancement if enabled
        if processing_params["enable_face_enhancer"]:
            try:
                from modules.processors.frame.face_enhancer import enhance_face
                enhance_start = time.perf_counter()
                for target_face in target_faces:
                    enhanced = enhance_face(target_face, temp_frame)
                    if enhanced is not None:
                        temp_frame = enhanced
                if profiling_enabled:
                    timings["enhance"].add(_ms_since(enhance_start))
            except ImportError:
                # Face enhancer not available, skip
                pass
            except Exception as e:
                print(f"Face enhancement error: {e}")

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
    global source_image_path, source_face_cache

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

        # Cache the source face so we don't re-run detection every frame.
        source_face_cache = face

        print(f"Source image uploaded: {source_image_path}")
        return {"message": "Source image uploaded successfully", "filename": file.filename}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")


@app.post("/process-video")
async def process_video(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """Upload a video clip, process it using the current source face, and return the processed video."""
    if source_face_cache is None:
        raise HTTPException(status_code=400, detail="No source image loaded. Upload a source image first.")

    content_type = (file.content_type or "").lower()
    if content_type and not content_type.startswith("video/") and content_type not in {
        "application/octet-stream",
        "application/mp4",
        "video/mp4",
        "video/quicktime",
    }:
        raise HTTPException(status_code=400, detail="File must be a video")

    uploads_dir = "uploads"
    os.makedirs(uploads_dir, exist_ok=True)

    safe_name = os.path.basename(file.filename or "clip")
    job_id = uuid.uuid4().hex
    input_path = os.path.join(uploads_dir, f"input_{job_id}_{safe_name}")
    output_path = os.path.join(uploads_dir, f"processed_{job_id}.mp4")

    try:
        with open(input_path, "wb") as buffer:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                buffer.write(chunk)

        await asyncio.to_thread(_process_video_file_cv2, input_path, output_path)

        def _safe_remove(path: str) -> None:
            try:
                if os.path.exists(path):
                    os.remove(path)
            except Exception:
                return

        background_tasks.add_task(_safe_remove, output_path)

        return FileResponse(
            output_path,
            media_type="video/mp4",
            filename=f"processed_{safe_name.rsplit('.', 1)[0]}.mp4",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing video: {str(e)}")
    finally:
        try:
            if os.path.exists(input_path):
                os.remove(input_path)
        except Exception:
            pass

@app.post("/update-parameters")
async def update_parameters(params: ProcessingParams):
    """Update processing parameters dynamically"""
    global processing_params

    # Update only provided parameters
    if params.video_quality is not None:
        processing_params["video_quality"] = max(10, min(95, params.video_quality))
    if params.frame_skip is not None:
        processing_params["frame_skip"] = max(1, min(10, params.frame_skip))
    if params.target_fps is not None:
        processing_params["target_fps"] = max(5, min(60, params.target_fps))
    if params.enable_face_enhancer is not None:
        processing_params["enable_face_enhancer"] = params.enable_face_enhancer
    if params.max_faces is not None:
        processing_params["max_faces"] = max(1, min(10, params.max_faces))
    if params.processing_resolution is not None:
        processing_params["processing_resolution"] = params.processing_resolution
        _set_detector_size_from_resolution(params.processing_resolution)
        # Reinitialize analyser to apply new det_size
        modules.face_analyser.FACE_ANALYSER = None

    return {
        "status": "success",
        "message": "Parameters updated successfully",
        "current_params": processing_params
    }

@app.get("/get-parameters")
async def get_parameters():
    """Get current processing parameters"""
    return {
        "status": "success",
        "params": processing_params
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time video processing"""
    await manager.connect(websocket)

    stop_event = asyncio.Event()
    incoming_frames: asyncio.Queue[bytes] = asyncio.Queue(maxsize=1)

    async def receiver() -> None:
        try:
            while True:
                data = await websocket.receive_bytes()
                perf_counters["frames_received"] += 1
                # Keep only the latest frame to avoid unbounded buffering.
                if incoming_frames.full():
                    try:
                        incoming_frames.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                await incoming_frames.put(data)
        except WebSocketDisconnect:
            stop_event.set()
        except Exception:
            stop_event.set()
            raise

    async def processor() -> None:
        frame_skip_counter = 0
        last_processed_frame = None
        last_send_time = 0.0

        while not stop_event.is_set():
            loop_start = time.perf_counter()
            try:
                wait_start = time.perf_counter()
                data = await asyncio.wait_for(incoming_frames.get(), timeout=1.0)
                if profiling_enabled:
                    timings["ws_wait"].add(_ms_since(wait_start))
            except asyncio.TimeoutError:
                continue

            # Drain queue to process the most recent frame.
            while not incoming_frames.empty():
                try:
                    data = incoming_frames.get_nowait()
                except asyncio.QueueEmpty:
                    break

            img_array = np.frombuffer(data, np.uint8)
            decode_start = time.perf_counter()
            frame = await asyncio.to_thread(cv2.imdecode, img_array, cv2.IMREAD_COLOR)
            if profiling_enabled:
                timings["decode"].add(_ms_since(decode_start))
            if frame is None:
                perf_counters["frames_decode_failed"] += 1
                continue
            perf_counters["frames_decoded"] += 1

            # Use dynamic processing resolution
            target_width, _target_height = processing_params["processing_resolution"]
            height, width = frame.shape[:2]
            if width > target_width:
                scale = target_width / width
                new_width = target_width
                new_height = max(1, int(height * scale))
                resize_start = time.perf_counter()
                frame = await asyncio.to_thread(cv2.resize, frame, (new_width, new_height))
                if profiling_enabled:
                    timings["resize"].add(_ms_since(resize_start))

            frame_skip_counter += 1
            frame_skip = processing_params["frame_skip"]
            if frame_skip_counter >= frame_skip:
                frame_skip_counter = 0
                process_start = time.perf_counter()
                processed_frame = await asyncio.to_thread(process_frame_with_face_swap, frame)
                if processed_frame is None:
                    processed_frame = frame
                if profiling_enabled:
                    timings["process_total"].add(_ms_since(process_start))
                last_processed_frame = processed_frame
                perf_counters["frames_processed"] += 1
            else:
                processed_frame = last_processed_frame if last_processed_frame is not None else frame
                perf_counters["frames_skipped"] += 1

            # Throttle *sending* to target_fps (don’t busy-loop and don’t drop responses).
            target_fps = processing_params["target_fps"]
            frame_interval = 1.0 / max(1, target_fps)
            now = time.time()
            sleep_for = (last_send_time + frame_interval) - now
            if sleep_for > 0:
                await asyncio.sleep(sleep_for)
            last_send_time = time.time()

            video_quality = processing_params["video_quality"]
            encode_start = time.perf_counter()
            ok, buffer = await asyncio.to_thread(
                cv2.imencode,
                '.jpg',
                processed_frame,
                [cv2.IMWRITE_JPEG_QUALITY, video_quality],
            )
            if profiling_enabled:
                timings["encode"].add(_ms_since(encode_start))
            if not ok:
                continue

            perf_counters["frames_encoded"] += 1

            send_start = time.perf_counter()
            await manager.send_personal_bytes(buffer.tobytes(), websocket)
            if profiling_enabled:
                timings["send"].add(_ms_since(send_start))
                timings["loop_total"].add(_ms_since(loop_start))
            perf_counters["frames_sent"] += 1

    recv_task = asyncio.create_task(receiver())
    proc_task = asyncio.create_task(processor())

    try:
        done, pending = await asyncio.wait({recv_task, proc_task}, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        for task in done:
            exc = task.exception()
            if exc is not None:
                raise exc
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
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
        },
        "profiling": {
            "enabled": profiling_enabled,
            "counters": perf_counters,
            "timings_ms": {name: stat.summary() for name, stat in timings.items()},
        },
        "runtime": {
            "onnxruntime": _safe_onnxruntime_info(),
            "insightface_sessions": _safe_insightface_session_info(),
            "detector_size": getattr(modules.globals, "detector_size", None),
        },
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
    parser.add_argument(
        "--profile",
        action="store_true",
        help="Enable lightweight per-stage profiling in /status"
    )
    return parser.parse_args()

if __name__ == "__main__":
    args = parse_args()

    profiling_enabled = bool(args.profile)

    print("=" * 60)
    print("🚀 Deep-Live-Cam Cloud Server")
    print("=" * 60)
    print(f"Mode: {args.mode.upper()}")
    print(f"Host: {args.host}")
    print(f"Port: {args.port}")
    print("=" * 60)

    # Initialize configuration
    config = ServerConfig(mode=args.mode)

    # Initialize face detector size from default processing resolution
    _set_detector_size_from_resolution(processing_params.get("processing_resolution"))

    print(f"Execution providers: {modules.globals.execution_providers}")
    if profiling_enabled:
        print("Profiling: ENABLED (see /status)")
    else:
        print("Profiling: disabled (pass --profile to enable)")

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