// We'll use browser-based canvas manipulation instead of node-canvas
// This simplifies installation and avoids native dependencies

const { detectVirtualCameraEnvironment } = require('./virtual-camera-environment');

class VirtualCameraManager {
    constructor() {
        this.virtualCam = null;
        this.isActive = false;
        this.frameWidth = 640;
        this.frameHeight = 480;
        this.fps = 30;
        this.lastFrameTime = 0;
        this.frameBuffer = null;

        // Try to load virtual camera library
        this.initializeVirtualCam();
    }

    async initializeVirtualCam() {
        try {
            const detection = detectVirtualCameraEnvironment({
                nodeMessage: 'Using node-virtualcam for virtual camera',
                obsMessage: 'OBS Studio found - virtual camera available',
                fallbackMessage: 'No virtual camera library available - using mock implementation',
                obsType: 'obs-virtual-cam',
                fallbackType: 'none'
            });

            this.virtualCamLib = detection.virtualCamLib;
            this.virtualCamType = detection.type;

        } catch (error) {
            console.error('Failed to initialize virtual camera libraries:', error);
            this.virtualCamType = 'none';
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

                case 'obs-virtual-cam':
                    return await this.startObsVirtualCam();

                default:
                    return await this.startMockVirtualCam();
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
                name: 'Deep Live Cam',
                format: 'RGB24'
            });

            await this.virtualCam.start();
            this.isActive = true;

            console.log('node-virtualcam started successfully');
            return {
                success: true,
                message: 'Virtual camera started with node-virtualcam',
                type: 'node-virtualcam'
            };
        } catch (error) {
            console.error('Failed to start node-virtualcam:', error);
            return { success: false, error: error.message };
        }
    }

    async startObsVirtualCam() {
        try {
            // For OBS Virtual Camera integration, we create a local HTTP server
            // that serves the processed frames. OBS can then capture this via Browser Source.

            const http = require('http');
            const fs = require('fs');
            const path = require('path');

            // Create a simple HTTP server for frame streaming
            this.obsServer = http.createServer((req, res) => {
                if (req.url === '/stream') {
                    res.writeHead(200, {
                        'Content-Type': 'text/html',
                        'Access-Control-Allow-Origin': '*'
                    });

                    // Serve a simple HTML page that displays the latest frame
                    const html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { margin: 0; padding: 0; background: #000; }
                            #frame { width: 100vw; height: 100vh; object-fit: cover; }
                        </style>
                    </head>
                    <body>
                        <img id="frame" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==">
                        <script>
                            // This will be updated by the desktop app
                            let latestFrame = null;

                            function updateFrame() {
                                fetch('/latest-frame')
                                    .then(response => response.text())
                                    .then(data => {
                                        if (data && data !== latestFrame) {
                                            document.getElementById('frame').src = data;
                                            latestFrame = data;
                                        }
                                    })
                                    .catch(console.error);
                            }

                            setInterval(updateFrame, 33); // ~30 FPS
                        </script>
                    </body>
                    </html>`;

                    res.end(html);
                } else if (req.url === '/latest-frame') {
                    res.writeHead(200, {
                        'Content-Type': 'text/plain',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(this.latestFrame || '');
                } else {
                    res.writeHead(404);
                    res.end('Not Found');
                }
            });

            // Start server on available port
            return new Promise((resolve, reject) => {
                this.obsServer.listen(0, 'localhost', () => {
                    const port = this.obsServer.address().port;
                    this.obsStreamUrl = `http://localhost:${port}/stream`;
                    console.log(`OBS stream server started at ${this.obsStreamUrl}`);

                    this.isActive = true;
                    this.latestFrame = null;

                    resolve({
                        success: true,
                        message: `Virtual camera started. Add Browser Source in OBS: ${this.obsStreamUrl}`,
                        type: 'obs-virtual-cam',
                        streamUrl: this.obsStreamUrl
                    });
                });

                this.obsServer.on('error', (error) => {
                    reject({ success: false, error: error.message });
                });
            });

            // The return statement is now handled in the Promise above
        } catch (error) {
            console.error('Failed to start OBS virtual camera:', error);
            return { success: false, error: error.message };
        }
    }

    async startMockVirtualCam() {
        // Mock implementation for development/testing
        this.isActive = true;
        console.log('Mock virtual camera started (no actual output)');

        return {
            success: true,
            message: 'Mock virtual camera started (install obs-virtual-cam or node-virtualcam for actual output)',
            type: 'mock'
        };
    }

    async stop() {
        try {
            if (!this.isActive) {
                return { success: true, message: 'Virtual camera not active' };
            }

            switch (this.virtualCamType) {
                case 'node-virtualcam':
                    return await this.stopNodeVirtualCam();

                case 'obs-virtual-cam':
                    return await this.stopObsVirtualCam();

                default:
                    return await this.stopMockVirtualCam();
            }
        } catch (error) {
            console.error('Failed to stop virtual camera:', error);
            return { success: false, error: error.message };
        }
    }

    async stopNodeVirtualCam() {
        try {
            if (this.virtualCam) {
                await this.virtualCam.stop();
                this.virtualCam = null;
            }
            this.isActive = false;

            console.log('node-virtualcam stopped successfully');
            return { success: true, message: 'Virtual camera stopped' };
        } catch (error) {
            console.error('Failed to stop node-virtualcam:', error);
            return { success: false, error: error.message };
        }
    }

    async stopObsVirtualCam() {
        try {
            if (this.obsServer) {
                this.obsServer.close();
                this.obsServer = null;
                this.obsStreamUrl = null;
                this.latestFrame = null;
            }

            this.isActive = false;
            console.log('OBS virtual camera stopped');
            return { success: true, message: 'Virtual camera stopped' };
        } catch (error) {
            console.error('Failed to stop OBS virtual camera:', error);
            return { success: false, error: error.message };
        }
    }

    async stopMockVirtualCam() {
        this.isActive = false;
        console.log('Mock virtual camera stopped');
        return { success: true, message: 'Mock virtual camera stopped' };
    }

    async sendFrame(imageData) {
        try {
            if (!this.isActive) {
                return { success: false, error: 'Virtual camera not active' };
            }

            // Throttle frame rate
            const now = Date.now();
            const frameInterval = 1000 / this.fps;
            if (now - this.lastFrameTime < frameInterval) {
                return { success: true, skipped: true };
            }
            this.lastFrameTime = now;

            switch (this.virtualCamType) {
                case 'node-virtualcam':
                    return await this.sendFrameNodeVirtualCam(imageData);

                case 'obs-virtual-cam':
                    return await this.sendFrameObsVirtualCam(imageData);

                default:
                    return await this.sendFrameMockVirtualCam(imageData);
            }
        } catch (error) {
            console.error('Failed to send frame to virtual camera:', error);
            return { success: false, error: error.message };
        }
    }

    async sendFrameNodeVirtualCam(imageData) {
        try {
            if (!this.virtualCam) {
                return { success: false, error: 'Virtual camera not initialized' };
            }

            // For node-virtualcam, we would need to convert the base64 image data
            // to the proper format. For now, we'll use a simplified approach.
            console.log('Sending frame to node-virtualcam (placeholder)');

            return { success: true };
        } catch (error) {
            console.error('Failed to send frame to node-virtualcam:', error);
            return { success: false, error: error.message };
        }
    }

    async sendFrameObsVirtualCam(imageData) {
        try {
            if (!this.obsServer || !imageData) {
                return { success: false, error: 'OBS server not active or no frame data' };
            }

            // Store the latest frame data for OBS to fetch
            this.latestFrame = imageData;
            return { success: true };
        } catch (error) {
            console.error('Failed to send frame to OBS virtual camera:', error);
            return { success: false, error: error.message };
        }
    }

    async sendFrameMockVirtualCam(imageData) {
        // Mock implementation - just log that we received a frame
        console.log('Mock virtual camera received frame');
        return { success: true, mock: true };
    }

    // Removed convertToRGB24 as we're not using node-canvas anymore

    getStatus() {
        return {
            isActive: this.isActive,
            type: this.virtualCamType,
            width: this.frameWidth,
            height: this.frameHeight,
            fps: this.fps
        };
    }

    setResolution(width, height) {
        if (this.isActive) {
            return { success: false, error: 'Cannot change resolution while virtual camera is active' };
        }

        this.frameWidth = width;
        this.frameHeight = height;
        return { success: true };
    }

    setFPS(fps) {
        this.fps = fps;
        return { success: true };
    }
}

module.exports = VirtualCameraManager;