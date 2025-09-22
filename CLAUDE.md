# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Deep-Live-Cam is a real-time face swap and video deepfake application built with Python. It uses AI models to perform live face swapping through webcam or process images/videos for face replacement.

## Development Commands

### Basic Operations
- **Run the application**: `python run.py`
- **Run with GPU acceleration**: `python run.py --execution-provider cuda` (NVIDIA) or `python run.py --execution-provider directml` (Windows AMD/Intel)
- **CLI mode**: `python run.py -s source_image.jpg -t target_video.mp4 -o output_directory/`

### Environment Setup
- **Create virtual environment**: `python -m venv venv`
- **Activate environment**:
  - Windows: `venv\Scripts\activate`
  - Linux/Mac: `source venv/bin/activate`
- **Install dependencies**: `pip install -r requirements.txt`

### Type Checking
- **Run mypy**: `mypy modules/` (uses configuration from `mypi.ini`)

### Debugging
- **Check execution providers**: `python run.py --help` to see available providers
- **Test with CPU only**: `python run.py --execution-provider cpu`
- **Verbose error output**: Check console output and status messages in UI

### Model Management
Required models must be downloaded and placed in the `models/` directory:
- `GFPGANv1.4.pth` - Face enhancement model
- `inswapper_128_fp16.onnx` (CUDA) or `inswapper_128.onnx` (CPU) - Face swapping model

## Architecture Overview

### Core Components
- **Entry Point**: `run.py` → `modules.core.run()`
- **Main Logic**: `modules/core.py` - Handles argument parsing, initialization, and main execution flow
- **Global State**: `modules/globals.py` - Contains all global variables and configuration
- **UI Layer**: `modules/ui.py` - CustomTkinter-based GUI implementation

### Key Modules
- **Face Processing**:
  - `modules/face_analyser.py` - Face detection and analysis
  - `modules/processors/frame/face_swapper.py` - Core face swapping logic
  - `modules/processors/frame/face_enhancer.py` - Face quality enhancement
- **Video Handling**:
  - `modules/capturer.py` - Video frame capture
  - `modules/video_capture.py` - Webcam/camera interface
- **Utilities**: `modules/utilities.py` - File operations, video processing helpers

### Execution Providers
The application supports multiple AI execution backends:
- **CPU**: Default fallback
- **CUDA**: NVIDIA GPU acceleration
- **DirectML**: Windows GPU acceleration (AMD/Intel)
- **CoreML**: Apple Silicon optimization
- **OpenVINO**: Intel CPU/GPU optimization

### Processing Pipeline
1. **Source Analysis**: Detect faces in source image
2. **Target Processing**: Process target image/video/webcam stream
3. **Face Mapping**: Map source faces to target faces (optional)
4. **Frame Processing**: Apply face swapping and enhancement
5. **Output Generation**: Save processed frames or display live stream

## Important Configuration

### Global Variables (modules/globals.py)
Key configuration stored in global state:
- `execution_providers` - AI backend selection
- `frame_processors` - Active processing modules
- `source_path`, `target_path`, `output_path` - File paths
- Feature flags: `many_faces`, `map_faces`, `mouth_mask`, `nsfw_filter`

### UI State Management
- Live preview controlled by `webcam_preview_running`
- Face mapping state in `source_target_map` and `simple_map`
- Processing options in `fp_ui` dictionary

## Development Guidelines

### Code Style
- Uses MyPy for type checking with strict configuration
- Type annotations required (`modules/typing.py` contains custom types)
- Error handling through status updates via `modules.core.update_status()`

### Testing Requirements (from CONTRIBUTING.md)
Before submitting changes, test:
- **Realtime faceswap** with face enhancer enabled/disabled
- **Map faces** functionality both enabled/disabled
- **Camera listing** accuracy
- **Performance**: No FPS drops, stable boot times
- **Stability**: 15+ minute GPU stress test

### Branching Strategy (from CONTRIBUTING.md)
- **premain**: Push all changes here first for testing before merging to main
- **experimental**: For large or potentially disruptive changes
- **main**: Production branch, only merge after thorough testing

### Threading and Performance
- Uses threading locks in processors (see `THREAD_LOCK` in face_swapper.py)
- Optimized for single-threaded CUDA performance (`OMP_NUM_THREADS=1`)
- Memory management through `max_memory` global setting

### Model Integration
- Models downloaded automatically via `conditional_download()`
- Different model variants for different execution providers
- Models stored in `/models` directory relative to project root

## Common Development Patterns

### Adding New Frame Processors
1. Create module in `modules/processors/frame/`
2. Implement required functions: `pre_check()`, `pre_start()`, `process_frame()`
3. Register in `modules/processors/frame/core.py`
4. Add UI controls in `modules/ui.py` if needed

### Error Handling
Use `update_status()` from `modules.core` for user-facing messages:
```python
from modules.core import update_status
update_status("Error message", "MODULE_NAME")
```

### Global State Access
Import and modify global variables:
```python
import modules.globals
modules.globals.execution_providers = ["CUDAExecutionProvider"]
```

## Performance Optimization

### Environment Variables
- **CUDA single-threading**: Set `OMP_NUM_THREADS=1` for optimal CUDA performance
- **Memory management**: Use `--max-memory` argument to limit RAM usage

### Common Issues and Solutions
- **Model loading errors**: Ensure models are in `/models` directory with correct names
- **GPU memory issues**: Reduce max_memory setting or switch to CPU execution
- **Threading conflicts**: Check for THREAD_LOCK usage in custom processors
- **Performance drops**: Verify execution provider compatibility with your hardware