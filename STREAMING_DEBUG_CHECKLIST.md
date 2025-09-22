# 🔍 Deep Live Cam Streaming Debug Checklist

## Issue Summary
- ✅ Stream works when using "Open Stream in Browser" button
- ❌ Stream is empty when manually opening URL or using in OBS
- ✅ Streaming server starts correctly
- ✅ Frame sending logic works in isolation

## Debug Steps to Follow

### 1. Verify Streaming Server is Running
```bash
# Start optimized app
npm run dev -- --optimized

# Check console for messages like:
# "✅ Optimized streaming started at http://localhost:8080/stream"
# "📺 Stream URL is ready for browser/OBS access"
```

### 2. Check Virtual Camera Status
In the app:
1. Click "Start Virtual Camera"
2. Look for success message with stream URL
3. Verify "Open Stream in Browser" button is enabled

### 3. Verify Processing is Active
Essential requirements for frames to be sent:
1. ✅ Camera is started
2. ✅ Connected to Deep Live Cam server (websocket)
3. ✅ Source image is uploaded
4. ✅ Processing is started (not just camera)
5. ✅ Virtual camera is started (this starts streaming server)

### 4. Check Browser Console for Debug Messages
Open browser developer tools and look for:
```
📡 Sending processed frame to streaming server...
✅ Frame sent to streaming server successfully
```

### 5. Test Processing Pipeline
**Complete workflow test:**
1. Start app: `npm run dev -- --optimized`
2. Connect to server (websocket)
3. Upload source face image
4. Select camera source (device webcam recommended)
5. Start camera
6. Start virtual camera
7. **Start processing** (this is crucial!)
8. Check stream URL in browser

### 6. Manual Stream Test
Visit the stream URL directly:
```
http://localhost:8080/stream
```

Should show:
- WebSocket connection status
- Live canvas updating with frames
- FPS counter

### 7. OBS Browser Source Test
1. Add Browser Source in OBS
2. Set URL: `http://localhost:8080/stream`
3. Set Width: 1920, Height: 1080
4. Check "Refresh browser when scene becomes active"

## Common Issues & Solutions

### Issue: Stream URL Shows Empty Page
**Cause**: Processing not started or no frames being sent
**Solution**:
1. Ensure all 5 requirements above are met
2. Check browser console for debug messages
3. Verify processed frames appear in app canvas

### Issue: WebSocket Connection Failed
**Cause**: Streaming server not running
**Solution**:
1. Start virtual camera first (this starts streaming server)
2. Check console for server start messages
3. Try different port if 8080 is busy

### Issue: Frames Not Appearing in Stream
**Cause**: Processing pipeline not sending frames
**Solution**:
1. Check that processing is actually started (not just camera)
2. Verify frames appear in "Processed Output" canvas in app
3. Check browser console for frame sending messages

### Issue: OBS Shows Blank Source
**Cause**: Browser source configuration or timing
**Solution**:
1. Refresh the browser source in OBS
2. Check "Shutdown source when not visible"
3. Try restarting OBS browser source
4. Test URL in regular browser first

## Debugging Commands

### Check if Streaming Server is Running
```bash
# Test if server responds
curl http://localhost:8080/stream
# Should return HTML page, not error
```

### Test Frame Broadcasting
```bash
# Run debug script
node debug-streaming-flow.js
# Should show all components working
```

### Check Port Usage
```bash
# Windows
netstat -an | findstr :8080

# Should show port 8080 in use if server is running
```

## Expected Debug Output

### In App Console (when processing):
```
📡 Sending processed frame to streaming server...
✅ Frame sent to streaming server successfully
📡 Sending processed frame to streaming server...
✅ Frame sent to streaming server successfully
```

### In Browser Console (when viewing stream):
```
Connected to Deep Live Cam processed feed
Receiving processed frames at 30 FPS
```

### In Terminal (when starting app):
```
✅ Optimized streaming started at http://localhost:8080/stream
📺 Stream URL is ready for browser/OBS access
```

## Quick Test Workflow

1. **Start app** (optimized mode)
2. **Connect to server** (websocket to Deep Live Cam)
3. **Upload source image** (face to swap)
4. **Start camera** (select device webcam)
5. **Start virtual camera** (enables streaming)
6. **Start processing** (begin face swapping)
7. **Check stream URL** (should show live processed video)

## Success Criteria

✅ Stream URL shows live processed video
✅ Browser console shows frame receiving messages
✅ OBS Browser Source displays the processed feed
✅ No console errors related to streaming

---

**If all steps pass but stream is still empty, the issue is likely in the frame sending logic between the client and streaming server.**