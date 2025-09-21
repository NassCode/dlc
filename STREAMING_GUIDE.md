# 🎭 Deep Live Cam - Processed Feed Streaming Guide

## Overview
The optimized streaming system now directly streams the **processed face-swapped feed** to the browser link. When you process video in Deep Live Cam, the results are automatically streamed in real-time to the browser URL.

## How It Works

### 1. Processing Pipeline
```
Camera → Deep Live Cam AI → Processed Frame → Streaming Server → Browser/OBS
```

### 2. Real-time Feed Flow
- **Camera Input**: Your webcam feed
- **AI Processing**: Face swap applied using Deep Live Cam
- **Processed Output**: Face-swapped result
- **Stream Broadcast**: Processed frames sent to `http://localhost:8080/stream`
- **Live Viewing**: Watch the processed feed in browser or capture in OBS

## Quick Start

### 1. Launch Optimized App
```bash
npm run dev -- --optimized
```

### 2. Start Processing
1. **Connect to Server**: Click "Connect" (to your Deep Live Cam server)
2. **Upload Source Image**: Select the face you want to apply
3. **Start Camera**: Enable your webcam
4. **Start Processing**: Begin AI face swapping
5. **Start Virtual Camera**: This automatically starts the streaming server

### 3. View Processed Feed
- **Browser**: Click "Open Stream in Browser" or visit `http://localhost:8080/stream`
- **OBS**: Add Browser Source with URL `http://localhost:8080/stream`

## What You'll See

### In the Browser Stream
- **Real-time face-swapped video** (not raw camera)
- **Performance stats**: FPS, latency, resolution
- **Auto-connect**: Automatically connects to the processed feed
- **Full-screen support**: Click fullscreen for better viewing

### Key Features
- ⚡ **Ultra-low latency**: 20-50ms delay from processing to stream
- 🔄 **Automatic streaming**: No manual frame sending required
- 📊 **Live stats**: Real-time performance monitoring
- 🎯 **Adaptive quality**: Automatic frame rate adjustment
- 📺 **OBS ready**: Direct integration with OBS Browser Source

## Usage Scenarios

### 1. Development & Testing
```
1. Start optimized app: npm run dev -- --optimized
2. Begin processing in the app
3. Open browser link to see processed feed
4. Perfect for testing face swap results
```

### 2. OBS Streaming/Recording
```
1. Start processing in Deep Live Cam
2. Add Browser Source in OBS
3. Set URL to: http://localhost:8080/stream
4. Set resolution: 1920x1080 (recommended)
5. Stream/record the processed feed
```

### 3. Remote Viewing
```
1. Share the stream URL: http://localhost:8080/stream
2. Others can view your processed feed in their browser
3. No Deep Live Cam installation required for viewers
```

## Technical Details

### Automatic Frame Forwarding
The optimized client automatically forwards every processed frame to the streaming server:

```javascript
// In client-optimized.html
handleProcessedFrame(blob) {
    // Display in app
    this.ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // AUTOMATICALLY stream to browser
    if (this.virtualCameraActive) {
        this.sendFrameToVirtualCameraOptimized(blob);
    }
}
```

### Real-time Streaming
The virtual camera manager broadcasts frames via WebSocket:

```javascript
// In virtual-camera-optimized.js
async sendFrame(imageData) {
    // Convert processed frame to buffer
    const frameBuffer = Buffer.from(base64Data, 'base64');

    // Broadcast to all connected browsers/OBS
    this.streamingServer.broadcastFrame(frameBuffer, {
        timestamp: now,
        type: 'processed_frame'
    });
}
```

## Troubleshooting

### No Stream Appearing
- Ensure you've started **processing** (not just camera)
- Check that virtual camera is **active**
- Verify stream URL shows correct port (not port 0)

### Low Quality/FPS
- Adjust quality setting in the optimized client
- Check processing performance in the app
- Reduce resolution if needed

### Connection Issues
- Ensure port 8080 is available
- Check firewall settings
- Try different port in virtual-camera-optimized.js

## Performance Tips

1. **Target 30 FPS**: Set FPS slider to 30 for smooth streaming
2. **Balanced Quality**: Use 80% quality setting for good balance
3. **Stable Internet**: Ensure good connection for remote viewing
4. **Close Unused Apps**: Free up CPU for better processing

## Browser Compatibility

### Supported Browsers
- ✅ Chrome/Chromium (recommended)
- ✅ Firefox
- ✅ Edge
- ✅ Safari (limited testing)

### OBS Integration
- ✅ Browser Source (recommended)
- ✅ Window Capture (as fallback)
- ⚠️ Video Capture Device (requires node-virtualcam)

---

🎉 **You now have a direct, low-latency stream of your processed face-swapped video!**

Perfect for streaming, recording, or sharing your Deep Live Cam results in real-time.