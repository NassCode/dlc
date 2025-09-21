const StreamingServer = require('./stream-server');

class OptimizedVirtualCameraManager {
    constructor() {
        this.virtualCam = null;
        this.isActive = false;
        this.frameWidth = 640;
        this.frameHeight = 480;
        this.fps = 30;
        this.frameBuffer = new Map(); // Ring buffer for frames
        this.maxBufferSize = 3; // Keep only latest 3 frames
        this.streamingServer = null;
        this.virtualCamType = 'none';

        // Performance tracking
        this.performance = {
            framesReceived: 0,
            framesDropped: 0,
            avgLatency: 0,
            lastFrameTime: 0,
            adaptiveFps: 30
        };

        this.initializeVirtualCam();
    }

    async initializeVirtualCam() {
        try {
            // Try node-virtualcam first
            try {
                const VirtualCam = require('node-virtualcam');
                this.virtualCamLib = VirtualCam;
                this.virtualCamType = 'node-virtualcam';
                console.log('Using optimized node-virtualcam for virtual camera');
                return;
            } catch (error) {
                console.log('node-virtualcam not available:', error.message);
            }

            // Check for OBS Studio and use optimized streaming
            try {
                const fs = require('fs');
                const obsPath64 = 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe';
                const obsPath32 = 'C:\\Program Files (x86)\\obs-studio\\bin\\32bit\\obs32.exe';

                if (fs.existsSync(obsPath64) || fs.existsSync(obsPath32)) {
                    this.virtualCamType = 'obs-optimized';
                    console.log('OBS Studio found - using optimized streaming');
                    return;
                }
            } catch (error) {
                console.log('OBS Studio check failed:', error.message);
            }

            this.virtualCamType = 'stream-only';
            console.log('Using stream-only mode for browser testing');

        } catch (error) {
            console.error('Failed to initialize virtual camera libraries:', error);
            this.virtualCamType = 'stream-only';
        }
    }

    async start() {
        try {
            if (this.isActive) {
                return { success: true, message: 'Virtual camera already active' };
            }

            switch (this.virtualCamType) {
                case 'node-virtualcam':
                    return await this.startNodeVirtualCam();

                case 'obs-optimized':
                    return await this.startOptimizedObsStream();

                case 'stream-only':
                    return await this.startStreamOnly();

                default:
                    return await this.startStreamOnly();
            }
        } catch (error) {
            console.error('Failed to start virtual camera:', error);
            return { success: false, error: error.message };
        }
    }

    async startNodeVirtualCam() {
        try {
            const VirtualCam = this.virtualCamLib;

            this.virtualCam = new VirtualCam({
                width: this.frameWidth,
                height: this.frameHeight,
                fps: this.fps,
                name: 'Deep Live Cam Optimized',
                format: 'RGB24'
            });

            await this.virtualCam.start();

            // Also start streaming server for monitoring
            await this.startStreamingServer();

            this.isActive = true;
            console.log('Optimized node-virtualcam started successfully');

            return {
                success: true,
                message: 'Virtual camera started with optimized node-virtualcam',
                type: 'node-virtualcam',
                streamUrl: this.streamingServer?.getStatus()?.port ?
                          `http://localhost:${this.streamingServer.getStatus().port}/stream` : null
            };
        } catch (error) {
            console.error('Failed to start node-virtualcam:', error);
            return { success: false, error: error.message };
        }
    }

    async startOptimizedObsStream() {
        try {
            // Start optimized WebSocket streaming server instead of HTTP polling
            await this.startStreamingServer();

            this.isActive = true;
            const streamUrl = `http://localhost:${this.streamingServer.getStatus().port}/stream`;

            console.log(`Optimized OBS streaming started at ${streamUrl}`);

            return {
                success: true,
                message: `Optimized virtual camera started. Add Browser Source in OBS: ${streamUrl}`,
                type: 'obs-optimized',
                streamUrl: streamUrl,
                instructions: [
                    '1. Open OBS Studio',
                    '2. Add a Browser Source',
                    `3. Set URL to: ${streamUrl}`,
                    '4. Set Width: 1920, Height: 1080 (or your preferred resolution)',
                    '5. Enable "Shutdown source when not visible" and "Refresh browser when scene becomes active"',
                    '6. Start Virtual Camera in OBS'
                ]
            };
        } catch (error) {
            console.error('Failed to start optimized OBS streaming:', error);
            return { success: false, error: error.message };
        }
    }

    async startStreamOnly() {
        try {
            await this.startStreamingServer();
            this.isActive = true;

            const streamUrl = `http://localhost:${this.streamingServer.getStatus().port}/stream`;
            console.log(`Stream-only mode started at ${streamUrl}`);

            return {
                success: true,
                message: `Stream started for browser testing: ${streamUrl}`,
                type: 'stream-only',
                streamUrl: streamUrl
            };
        } catch (error) {
            console.error('Failed to start streaming server:', error);
            return { success: false, error: error.message };
        }
    }

    async startStreamingServer() {
        if (this.streamingServer) {
            return; // Already running
        }

        // Try ports starting from 8080
        const ports = [8080, 8081, 8082, 8083, 8084];
        let lastError = null;

        for (const port of ports) {
            try {
                this.streamingServer = new StreamingServer(port);
                const result = await this.streamingServer.start();

                if (result.success) {
                    console.log(`Streaming server started on port ${result.port}`);
                    return;
                } else {
                    lastError = result.error;
                }
            } catch (error) {
                lastError = error.message;
                this.streamingServer = null;
                continue;
            }
        }

        throw new Error(`Failed to start streaming server on any port: ${lastError}`);
    }

    async stop() {
        try {
            if (!this.isActive) {
                return { success: true, message: 'Virtual camera not active' };
            }

            const results = [];

            // Stop node-virtualcam if active
            if (this.virtualCam && this.virtualCamType === 'node-virtualcam') {
                try {
                    await this.virtualCam.stop();
                    this.virtualCam = null;
                    results.push('node-virtualcam stopped');
                } catch (error) {
                    console.error('Failed to stop node-virtualcam:', error);
                }
            }

            // Stop streaming server
            if (this.streamingServer) {
                try {
                    await this.streamingServer.stop();
                    this.streamingServer = null;
                    results.push('streaming server stopped');
                } catch (error) {
                    console.error('Failed to stop streaming server:', error);
                }
            }

            this.isActive = false;
            this.frameBuffer.clear();

            console.log('Optimized virtual camera stopped successfully');
            return {
                success: true,
                message: `Virtual camera stopped (${results.join(', ')})`
            };
        } catch (error) {
            console.error('Failed to stop virtual camera:', error);
            return { success: false, error: error.message };
        }
    }

    async sendFrame(imageData) {
        try {
            if (!this.isActive) {
                return { success: false, error: 'Virtual camera not active' };
            }

            const now = Date.now();
            this.performance.framesReceived++;

            // Adaptive frame rate control
            const targetInterval = 1000 / this.performance.adaptiveFps;
            if (now - this.performance.lastFrameTime < targetInterval * 0.8) {
                // Skip frame if we're ahead of target FPS
                return { success: true, skipped: true };
            }

            this.performance.lastFrameTime = now;

            // Convert processed frame data to binary buffer for streaming
            let frameBuffer;
            if (typeof imageData === 'string' && imageData.startsWith('data:image/')) {
                // Convert from base64 data URL (processed frame from Deep Live Cam)
                const base64Data = imageData.split(',')[1];
                frameBuffer = Buffer.from(base64Data, 'base64');
            } else if (imageData instanceof ArrayBuffer || Buffer.isBuffer(imageData)) {
                frameBuffer = Buffer.from(imageData);
            } else if (imageData instanceof Blob) {
                // Convert blob to buffer
                const arrayBuffer = await imageData.arrayBuffer();
                frameBuffer = Buffer.from(arrayBuffer);
            } else {
                return { success: false, error: 'Invalid processed frame data format' };
            }

            // Update frame buffer with ring buffer approach
            this.updateFrameBuffer(frameBuffer);

            // MAIN FEATURE: Send processed frame to streaming server for direct browser viewing
            if (this.streamingServer) {
                this.streamingServer.broadcastFrame(frameBuffer, {
                    timestamp: now,
                    fps: this.performance.adaptiveFps,
                    type: 'processed_frame'
                });
            }

            // Send to node-virtualcam if available
            if (this.virtualCam && this.virtualCamType === 'node-virtualcam') {
                await this.sendFrameToNodeVirtualCam(frameBuffer);
            }

            // Update performance metrics
            this.updatePerformanceMetrics(now);

            return { success: true };
        } catch (error) {
            console.error('Failed to send processed frame:', error);
            this.performance.framesDropped++;
            return { success: false, error: error.message };
        }
    }

    updateFrameBuffer(frameBuffer) {
        const frameId = Date.now();

        // Add new frame
        this.frameBuffer.set(frameId, frameBuffer);

        // Remove old frames if buffer is full
        if (this.frameBuffer.size > this.maxBufferSize) {
            const oldestKey = Math.min(...this.frameBuffer.keys());
            this.frameBuffer.delete(oldestKey);
        }
    }

    async sendFrameToNodeVirtualCam(frameBuffer) {
        // For node-virtualcam, we need to convert the JPEG buffer to RGB24
        // This is a simplified implementation - in production, you'd use a proper image library
        try {
            // Placeholder for RGB conversion
            // In a real implementation, you'd decode the JPEG and convert to RGB24
            console.log('Sending optimized frame to node-virtualcam');
            return { success: true };
        } catch (error) {
            console.error('Failed to send frame to node-virtualcam:', error);
            return { success: false, error: error.message };
        }
    }

    updatePerformanceMetrics(now) {
        // Calculate adaptive FPS based on processing performance
        const processingTime = now - this.performance.lastFrameTime;
        const targetFps = Math.min(this.fps, Math.floor(1000 / (processingTime * 1.5)));

        // Smooth FPS adjustment
        this.performance.adaptiveFps = Math.round(
            (this.performance.adaptiveFps * 0.9) + (targetFps * 0.1)
        );

        // Keep adaptive FPS within reasonable bounds
        this.performance.adaptiveFps = Math.max(15, Math.min(60, this.performance.adaptiveFps));
    }

    getStatus() {
        const baseStatus = {
            isActive: this.isActive,
            type: this.virtualCamType,
            width: this.frameWidth,
            height: this.frameHeight,
            fps: this.fps,
            adaptiveFps: this.performance.adaptiveFps,
            performance: {
                framesReceived: this.performance.framesReceived,
                framesDropped: this.performance.framesDropped,
                dropRate: this.performance.framesReceived > 0 ?
                         (this.performance.framesDropped / this.performance.framesReceived * 100).toFixed(2) + '%' : '0%'
            }
        };

        if (this.streamingServer) {
            const streamStatus = this.streamingServer.getStatus();
            baseStatus.streaming = {
                port: streamStatus.port,
                clients: streamStatus.clients,
                streamUrl: streamStatus.isRunning ? `http://localhost:${streamStatus.port}/stream` : null
            };
        }

        return baseStatus;
    }

    setResolution(width, height) {
        if (this.isActive) {
            return { success: false, error: 'Cannot change resolution while virtual camera is active' };
        }

        this.frameWidth = width;
        this.frameHeight = height;
        return { success: true, message: `Resolution set to ${width}x${height}` };
    }

    setFPS(fps) {
        this.fps = Math.max(10, Math.min(60, fps)); // Clamp between 10-60 FPS
        this.performance.adaptiveFps = this.fps;
        return { success: true, message: `Target FPS set to ${this.fps}` };
    }

    // Get streaming URL for browser testing
    getStreamUrl() {
        if (this.streamingServer && this.streamingServer.getStatus().isRunning) {
            const port = this.streamingServer.getStatus().port;
            return `http://localhost:${port}/stream`;
        }
        return null;
    }

    // Performance monitoring
    getPerformanceStats() {
        return {
            ...this.performance,
            bufferSize: this.frameBuffer.size,
            maxBufferSize: this.maxBufferSize,
            streamingClients: this.streamingServer ? this.streamingServer.getStatus().clients : 0
        };
    }
}

module.exports = OptimizedVirtualCameraManager;