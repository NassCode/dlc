const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

class StreamingServer {
    constructor(port = 8080) {
        this.port = port || 8080;
        this.server = null;
        this.wsServer = null;
        this.clients = new Set();
        this.latestFrame = null;
        this.frameStats = {
            fps: 0,
            frameCount: 0,
            lastFpsUpdate: Date.now()
        };

        this.setupServer();
    }

    setupServer() {
        // Create HTTP server for browser access
        this.server = http.createServer((req, res) => {
            if (req.url === '/') {
                this.serveStreamPage(res);
            } else if (req.url === '/stream') {
                this.serveStreamPage(res);
            } else if (req.url.startsWith('/static/')) {
                this.serveStaticFile(req.url, res);
            } else {
                res.writeHead(404);
                res.end('Not Found');
            }
        });

        // Create WebSocket server for real-time streaming
        this.wsServer = new WebSocket.Server({
            server: this.server,
            path: '/ws'
        });

        this.wsServer.on('connection', (ws) => {
            console.log('New streaming client connected');
            this.clients.add(ws);

            // Send latest frame immediately if available
            if (this.latestFrame) {
                this.sendFrameToClient(ws, this.latestFrame);
            }

            ws.on('close', () => {
                console.log('Streaming client disconnected');
                this.clients.delete(ws);
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                this.clients.delete(ws);
            });
        });
    }

    serveStreamPage(res) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Deep Live Cam Stream</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            background: #000;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            font-family: Arial, sans-serif;
        }

        #streamCanvas {
            max-width: 100vw;
            max-height: 100vh;
            object-fit: contain;
            border: none;
            background: #000;
        }

        .loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #fff;
            font-size: 18px;
            text-align: center;
        }

        .error {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #ff6b6b;
            font-size: 18px;
            text-align: center;
        }

        .hidden {
            display: none;
        }

        .status-dot {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #ff6b6b;
            transition: background-color 0.3s ease;
        }

        .status-dot.connected {
            background: #4ecdc4;
        }

        .status-dot.connecting {
            background: #ffa726;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        body.fullscreen {
            cursor: none;
        }

        .fullscreen-hint {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            color: rgba(255, 255, 255, 0.7);
            font-size: 14px;
            opacity: 1;
            transition: opacity 0.3s ease;
            pointer-events: none;
        }

        .fullscreen-hint.hidden {
            opacity: 0;
        }
    </style>
</head>
<body>
    <canvas id="streamCanvas"></canvas>

    <div id="loadingMessage" class="loading">
        Connecting to stream...
    </div>

    <div id="errorMessage" class="error hidden">
        Stream unavailable
    </div>

    <div class="status-dot" id="statusDot"></div>

    <div class="fullscreen-hint" id="fullscreenHint">
        Double-click for fullscreen
    </div>

    <script>
        class CleanStreamViewer {
            constructor() {
                this.ws = null;
                this.canvas = document.getElementById('streamCanvas');
                this.ctx = this.canvas.getContext('2d');
                this.loadingMessage = document.getElementById('loadingMessage');
                this.errorMessage = document.getElementById('errorMessage');
                this.statusDot = document.getElementById('statusDot');
                this.fullscreenHint = document.getElementById('fullscreenHint');

                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                this.wsUrl = `${protocol}//${window.location.host}/ws`;
                this.reconnectDelay = 2000;
                this.maxReconnectAttempts = 10;
                this.currentReconnectAttempt = 0;
                this.isConnected = false;
                this.frameCount = 0;

                this.setupCanvas();
                this.setupEventListeners();
                this.connectToStream();
            }

            setupCanvas() {
                this.canvas.width = 800;
                this.canvas.height = 600;
                this.ctx.fillStyle = '#000';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            }

            setupEventListeners() {
                this.canvas.addEventListener('dblclick', () => {
                    this.toggleFullscreen();
                });

                let hintHidden = false;
                const hideHint = () => {
                    if (!hintHidden) {
                        this.fullscreenHint.classList.add('hidden');
                        hintHidden = true;
                    }
                };

                this.canvas.addEventListener('click', hideHint);
                this.canvas.addEventListener('mousemove', hideHint);
                setTimeout(() => {
                    this.fullscreenHint.classList.add('hidden');
                }, 5000);

                document.addEventListener('fullscreenchange', () => {
                    if (document.fullscreenElement) {
                        document.body.classList.add('fullscreen');
                    } else {
                        document.body.classList.remove('fullscreen');
                    }
                });

                document.addEventListener('visibilitychange', () => {
                    if (!document.hidden && !this.isConnected) {
                        this.connectToStream();
                    }
                });
            }

            connect() {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = \`\${protocol}//\${window.location.host}/ws\`;

                this.updateStatus('Connecting...', 'connecting');
                this.ws = new WebSocket(wsUrl);

                this.ws.onopen = () => {
                    this.updateStatus('Connected', 'connected');
                    document.getElementById('connect-btn').textContent = 'Disconnect';
                };

                this.ws.onmessage = (event) => {
                    if (event.data instanceof Blob) {
                        this.handleFrame(event.data);
                    } else if (event.data instanceof ArrayBuffer) {
                        // Some environments deliver binary WS frames as ArrayBuffer.
                        const blob = new Blob([event.data], { type: 'image/jpeg' });
                        this.handleFrame(blob);
                    } else {
                        try {
                            const data = JSON.parse(event.data);
                            this.handleMessage(data);
                        } catch (e) {
                            console.error('Invalid message:', e);
                        }
                    }
                };

                this.ws.onclose = () => {
                    this.updateStatus('Disconnected', 'disconnected');
                    document.getElementById('connect-btn').textContent = 'Connect';
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this.updateStatus('Error', 'disconnected');
                };
            }

            disconnect() {
                if (this.ws) {
                    this.ws.close();
                }
            }

            handleFrame(blob) {
                const img = new Image();
                const now = Date.now();

                img.onload = () => {
                    // Resize canvas if needed
                    if (this.canvas.width !== img.width || this.canvas.height !== img.height) {
                        this.canvas.width = img.width;
                        this.canvas.height = img.height;
                        document.getElementById('resolution').textContent = \`\${img.width}x\${img.height}\`;
                    }

                    // Draw frame
                    this.ctx.drawImage(img, 0, 0);

                    // Update stats
                    this.stats.frameCount++;
                    this.stats.latency = now - img.dataset.timestamp;

                    URL.revokeObjectURL(img.src);
                };

                img.src = URL.createObjectURL(blob);
                img.dataset.timestamp = now;
            }

            handleMessage(data) {
                if (data.type === 'stats') {
                    document.getElementById('clients').textContent = data.clients || 0;
                }
            }

            updateStatus(text, type) {
                const statusEl = document.getElementById('status');
                statusEl.textContent = text;
                statusEl.className = \`status \${type}\`;
            }

            startStatsUpdate() {
                setInterval(() => {
                    const now = Date.now();
                    const elapsed = now - this.stats.lastFpsUpdate;

                    if (elapsed >= 1000) {
                        this.stats.fps = Math.round((this.stats.frameCount * 1000) / elapsed);
                        this.stats.frameCount = 0;
                        this.stats.lastFpsUpdate = now;

                        document.getElementById('fps').textContent = this.stats.fps;
                        document.getElementById('latency').textContent = this.stats.latency || 0;
                    }
                }, 100);
            }
        }

        window.addEventListener('DOMContentLoaded', () => {
            new CleanStreamViewer();
        });
    </script>
</body>
</html>
        `);
    }

    serveStaticFile(url, res) {
        res.writeHead(404);
        res.end('Static files not implemented');
    }

    // Optimized frame broadcasting
    broadcastFrame(frameBuffer) {
        this.latestFrame = frameBuffer;
        this.updateFrameStats();

        if (this.clients.size === 0) {
            return;
        }

        // Broadcast to all connected clients
        const deadClients = new Set();

        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(frameBuffer);
                } catch (error) {
                    console.error('Failed to send frame to client:', error);
                    deadClients.add(client);
                }
            } else {
                deadClients.add(client);
            }
        }

        // Clean up dead connections
        for (const deadClient of deadClients) {
            this.clients.delete(deadClient);
        }

        // Send stats update occasionally
        if (this.frameStats.frameCount % 30 === 0) {
            this.broadcastStats();
        }
    }

    sendFrameToClient(client, frameBuffer) {
        try {
            if (client.readyState === WebSocket.OPEN) {
                client.send(frameBuffer);
            }
        } catch (error) {
            console.error('Failed to send frame to specific client:', error);
            this.clients.delete(client);
        }
    }

    broadcastStats() {
        const statsData = JSON.stringify({
            type: 'stats',
            fps: this.frameStats.fps,
            clients: this.clients.size,
            timestamp: Date.now()
        });

        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(statsData);
                } catch (error) {
                    console.error('Failed to send stats:', error);
                }
            }
        }
    }

    updateFrameStats() {
        this.frameStats.frameCount++;
        const now = Date.now();

        if (now - this.frameStats.lastFpsUpdate >= 1000) {
            this.frameStats.fps = this.frameStats.frameCount;
            this.frameStats.frameCount = 0;
            this.frameStats.lastFpsUpdate = now;
        }
    }

    start() {
        return new Promise((resolve, reject) => {
            this.server.listen(this.port, 'localhost', () => {
                const actualPort = this.server.address().port;
                this.port = actualPort; // Update the port to the actual assigned port
                const streamUrl = `http://localhost:${actualPort}/stream`;
                console.log(`🚀 Streaming server started at ${streamUrl}`);
                console.log(`📺 WebSocket endpoint: ws://localhost:${actualPort}/ws`);
                resolve({
                    success: true,
                    streamUrl,
                    wsUrl: `ws://localhost:${actualPort}/ws`,
                    port: actualPort
                });
            });

            this.server.on('error', (error) => {
                console.error('Streaming server error:', error);
                reject({ success: false, error: error.message });
            });
        });
    }

    stop() {
        return new Promise((resolve) => {
            // Close all WebSocket connections
            for (const client of this.clients) {
                client.close();
            }
            this.clients.clear();

            // Close servers
            if (this.wsServer) {
                this.wsServer.close();
            }

            if (this.server) {
                this.server.close(() => {
                    console.log('Streaming server stopped');
                    resolve({ success: true });
                });
            } else {
                resolve({ success: true });
            }
        });
    }

    getStatus() {
        return {
            isRunning: this.server && this.server.listening,
            port: this.port,
            clients: this.clients.size,
            fps: this.frameStats.fps
        };
    }
}

module.exports = StreamingServer;