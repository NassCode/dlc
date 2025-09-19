# Deep-Live-Cam Web Server Setup

## Quick Start Guide

### 1. Install Dependencies

First, install the additional server requirements:

```bash
pip install fastapi uvicorn[standard] python-multipart websockets
```

Or install from the requirements file:
```bash
pip install -r server_requirements.txt
```

### 2. Start the Server

**Option A: Using the startup script (recommended)**
```bash
python start_server.py
```

**Option B: Direct server start**
```bash
python server.py
```

### 3. Access the Web Interface

1. Open your web browser
2. Navigate to: `http://localhost:8000`
3. You should see the Deep-Live-Cam web interface

## How to Use

### Step 1: Upload Source Image
1. Click "Choose file" or drag & drop an image
2. Select an image with a clear face (this is the face that will be applied)
3. Wait for "Source image uploaded successfully" message

### Step 2: Start Camera
1. Click "Start Camera" button
2. Allow browser to access your webcam when prompted
3. You should see your camera feed in the left panel

### Step 3: Connect and Process
1. Click "Connect to Server" button
2. The server will start processing your camera feed
3. Processed video (with face swap) appears in the right panel

## Features

- **Real-time face swapping**: Live camera feed processing
- **Web-based interface**: No desktop app needed
- **Drag & drop upload**: Easy source image selection
- **CPU processing**: Works without GPU (slower but functional)
- **Local processing**: All processing happens on your machine

## Troubleshooting

### Common Issues

**1. "No module named 'fastapi'"**
```bash
pip install fastapi uvicorn[standard] python-multipart websockets
```

**2. "Camera access denied"**
- Make sure your browser has camera permissions
- Try using Chrome/Firefox (better WebRTC support)
- Check if another application is using the camera

**3. "No face detected in source image"**
- Use an image with a clear, front-facing face
- Ensure good lighting in the source image
- Try a different image format (JPG/PNG)

**4. Slow processing**
- This is normal for CPU processing
- Expected: 2-5 FPS on modern CPUs
- For faster processing, deploy on GPU server

**5. "Connection failed"**
- Make sure the server is running on port 8000
- Check firewall settings
- Try restarting the server

### Performance Notes

- **CPU Processing**: 2-5 FPS (normal)
- **Memory Usage**: 2-4 GB RAM typical
- **Best Browsers**: Chrome, Firefox, Edge (WebRTC support)

## Architecture

```
Web Browser (Client)          Python Server
┌─────────────────┐          ┌─────────────────┐
│ • Camera Capture│          │ • FastAPI       │
│ • Video Display │ ◄──────► │ • Face Swapping │
│ • Image Upload  │ WebSocket │ • Model Loading │
│ • Controls      │          │ • Processing    │
└─────────────────┘          └─────────────────┘
```

## Next Steps

Once you verify this works locally:

1. **GPU Acceleration**: Deploy on AWS EC2 with GPU
2. **Multiple Clients**: Add load balancing
3. **Better UI**: Enhanced web interface
4. **Mobile Support**: Responsive design
5. **Cloud Storage**: S3 integration for images

## File Structure

```
Deep-Live-Cam/
├── server.py              # Main FastAPI server
├── start_server.py        # Startup helper script
├── server_requirements.txt # Additional dependencies
├── uploads/               # Uploaded source images
├── models/                # AI models (auto-downloaded)
└── modules/               # Original Deep-Live-Cam code
```

## Security Notes

- This server binds to `0.0.0.0:8000` (accessible from network)
- For production: Add authentication, HTTPS, rate limiting
- Local testing: Use `127.0.0.1:8000` for localhost-only access