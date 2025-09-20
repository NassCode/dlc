# 🎭 Virtual Camera Integration Guide

## How Face Streaming Works

### **Complete Pipeline Overview:**

```
1. 📷 Camera Capture
   ↓
2. 🚀 Send to Python Server
   ↓
3. 🤖 AI Face Processing
   ↓
4. 📺 Display in Canvas
   ↓
5. 📡 Stream to Virtual Camera
   ↓
6. 📱 Use in Other Apps
```

### **Detailed Technical Flow:**

#### **1. Frame Capture** (`local-client/client.html:593-642`)
```javascript
processFrames() {
    // Capture from webcam
    const canvas = document.createElement('canvas');
    context.drawImage(this.elements.localVideo, 0, 0);

    // Convert to JPEG blob
    canvas.toBlob((blob) => {
        // Send to server via WebSocket
        this.websocket.send(blob);
    }, 'image/jpeg', 0.8);
}
```

#### **2. Server Processing**
- Python server receives frame
- AI models perform face detection and swapping
- Processed frame sent back as blob

#### **3. Display & Virtual Camera** (`local-client/client.html:644-680`)
```javascript
handleProcessedFrame(blob) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            // Display in canvas
            this.ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // 🎭 Send to virtual camera
            if (this.isDesktopApp && this.virtualCameraActive) {
                this.sendFrameToVirtualCamera();
            }
        };
    };
}

async sendFrameToVirtualCamera() {
    // Extract canvas as base64 image
    const imageData = canvas.toDataURL('image/jpeg', 0.8);

    // Send via Electron IPC to virtual camera
    await window.virtualCamera.sendFrame(imageData);
}
```

## **Virtual Camera Backends**

### **1. OBS Studio Integration** ✅ (Currently Active)

**How it works:**
1. Desktop app creates local HTTP server
2. Server serves processed frames in real-time
3. OBS captures via Browser Source
4. OBS Virtual Camera streams to other apps

**Setup Process:**
```javascript
// 1. Start virtual camera in desktop app
await window.virtualCamera.start();

// 2. Server starts on random port (e.g., http://localhost:54321/stream)

// 3. In OBS Studio:
//    - Add "Browser Source"
//    - URL: http://localhost:54321/stream
//    - Width: 1920, Height: 1080 (or your resolution)
//    - Start Virtual Camera in OBS

// 4. Virtual camera appears as "OBS Camera" in other apps
```

**Frame Flow:**
```
Processed Canvas → Base64 Image → HTTP Server → OBS Browser Source → OBS Virtual Camera → Other Apps
```

### **2. node-virtualcam Integration** (Optional)

**How it would work:**
1. Direct virtual camera driver
2. Bypasses OBS completely
3. Creates "Deep Live Cam" device directly

**Installation:**
```bash
npm install node-virtualcam
```

**Frame Flow:**
```
Processed Canvas → RGB24 Buffer → Virtual Camera Driver → Other Apps
```

### **3. Mock Mode** (Development)

**How it works:**
1. Logs frame reception
2. No actual virtual camera output
3. Used for testing and development

## **Performance Characteristics**

### **Frame Rate & Latency:**

| Component | Typical Performance |
|-----------|-------------------|
| Camera Capture | 30 FPS |
| Server Processing | 15-30 FPS (depends on GPU) |
| Virtual Camera Output | 30 FPS |
| End-to-End Latency | 100-300ms |

### **Resolution Support:**

| Resolution | Quality | Performance |
|------------|---------|-------------|
| 640x480 | Good | High FPS |
| 1280x720 | Better | Medium FPS |
| 1920x1080 | Best | Lower FPS |

## **Usage Instructions**

### **For OBS Studio Users:**

1. **Start the Desktop App**
   ```bash
   npm start
   ```

2. **Connect to Server**
   - Enter server URL (default: ws://localhost:8000)
   - Click "Connect"

3. **Setup Source Image**
   - Upload face image to swap with
   - Wait for "✓ Source image uploaded successfully"

4. **Start Camera & Processing**
   - Click "Start Camera"
   - Click "Start Processing"
   - Verify face swapping works in preview

5. **Enable Virtual Camera**
   - Click "Start Virtual Camera"
   - Note the URL provided (e.g., http://localhost:54321/stream)

6. **Configure OBS Studio**
   - Open OBS Studio
   - Add Source → Browser Source
   - URL: `http://localhost:54321/stream`
   - Width: 1920, Height: 1080
   - Start Virtual Camera in OBS

7. **Use in Other Apps**
   - Open Zoom/Discord/Teams
   - Select "OBS Camera" as video source
   - Enjoy face-swapped video calls! 🎭

### **For Direct Virtual Camera Users:**

1. **Install node-virtualcam**
   ```bash
   npm install node-virtualcam
   ```

2. **Follow steps 1-5 above**

3. **Virtual camera appears directly**
   - No OBS needed
   - Shows as "Deep Live Cam" in video apps

## **Troubleshooting**

### **Virtual Camera Not Working:**

1. **Check OBS Installation**
   ```bash
   # Windows
   dir "C:\Program Files\obs-studio\bin\64bit\obs64.exe"
   ```

2. **Verify Browser Source URL**
   - Copy exact URL from desktop app status
   - Paste into OBS Browser Source

3. **Check Firewall/Antivirus**
   - Allow localhost connections
   - Whitelist the desktop app

### **Performance Issues:**

1. **Lower Resolution**
   - Change virtual camera resolution to 720p or 480p

2. **Reduce Quality**
   - Lower JPEG quality in code (currently 0.8)

3. **Check Server Performance**
   - Virtual camera depends on server processing speed

### **Connection Issues:**

1. **Server Status**
   - Verify Python server is running
   - Check server logs for errors

2. **WebSocket Connection**
   - Correct URL format: `ws://localhost:8000`
   - No HTTPS for local connections

## **Code Locations**

### **Key Files:**
- `desktop-app/virtual-camera.js` - Virtual camera manager
- `desktop-app/preload.js` - Secure IPC communication
- `local-client/client.html` - Web client with virtual camera integration
- `desktop-app/main.js` - Electron main process

### **Important Functions:**
- `sendFrameToVirtualCamera()` - Sends processed frames
- `startObsVirtualCam()` - Creates HTTP server for OBS
- `handleProcessedFrame()` - Receives frames from server

## **Future Improvements**

1. **Direct Driver Integration**
   - Better node-virtualcam support
   - Platform-specific virtual camera drivers

2. **WebRTC Streaming**
   - Direct browser-to-browser streaming
   - No desktop app needed

3. **Hardware Acceleration**
   - GPU-accelerated frame conversion
   - Lower latency encoding

4. **Multiple Output Formats**
   - RTMP streaming
   - NDI output
   - Custom protocols