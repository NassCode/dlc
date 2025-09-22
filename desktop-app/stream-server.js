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
<html>
<head>
    <title>Deep Live Cam Stream</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: #000;
            color: white;
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        #video-container {
            position: relative;
            max-width: 100vw;
            max-height: 80vh;
        }

        #stream-canvas {
            max-width: 100%;
            max-height: 100%;
            border: 2px solid #333;
            border-radius: 8px;
        }

        #stats {
            position: absolute;
            top: 10px;
            left: 10px;
            background: rgba(0,0,0,0.8);
            padding: 10px;
            border-radius: 5px;
            font-family: monospace;
            font-size: 14px;
        }

        #controls {
            margin-top: 20px;
            display: flex;
            gap: 10px;
            align-items: center;
        }

        button {
            padding: 10px 20px;
            background: #007acc;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        }

        button:hover {
            background: #005a9e;
        }

        button:disabled {
            background: #333;
            cursor: not-allowed;
        }

        .status {
            padding: 5px 10px;
            border-radius: 3px;
            font-size: 14px;
        }

        .status.connected {
            background: #4CAF50;
        }

        .status.disconnected {
            background: #f44336;
        }
    </style>
</head>
<body>
    <h1>🎭 Deep Live Cam - Processed Feed</h1>
    <div id="video-container">
        <canvas id="stream-canvas"></canvas>
        <div id="stats">
            <div>FPS: <span id="fps">0</span></div>
            <div>Latency: <span id="latency">0</span>ms</div>
            <div>Resolution: <span id="resolution">0x0</span></div>
            <div>Clients: <span id="clients">0</span></div>
        </div>
    </div>

    <div id="controls">
        <button id="connect-btn">Connect</button>
        <button id="fullscreen-btn">Fullscreen</button>
        <span id="status" class="status disconnected">Disconnected</span>
    </div>

    <script>
        class StreamClient {
            constructor() {
                this.ws = null;
                this.canvas = document.getElementById('stream-canvas');
                this.ctx = this.canvas.getContext('2d');
                this.stats = {
                    fps: 0,
                    frameCount: 0,
                    lastFpsUpdate: Date.now(),
                    latency: 0
                };

                this.setupUI();
                this.startStatsUpdate();
            }

            setupUI() {
                document.getElementById('connect-btn').addEventListener('click', () => {
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.disconnect();
                    } else {
                        this.connect();
                    }
                });

                document.getElementById('fullscreen-btn').addEventListener('click', () => {
                    if (this.canvas.requestFullscreen) {
                        this.canvas.requestFullscreen();
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

        // Auto-connect when page loads
        window.addEventListener('DOMContentLoaded', () => {
            const client = new StreamClient();
            // Auto-connect after a short delay
            setTimeout(() => client.connect(), 500);
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
    broadcastFrame(frameBuffer, metadata = {}) {
        this.latestFrame = frameBuffer;
        this.updateFrameStats();

        if (this.clients.size === 0) {
            console.log(`📡 Frame received but no clients connected (${frameBuffer.length} bytes)`);
            return;
        }

        console.log(`📺 Broadcasting frame to ${this.clients.size} client(s) (${frameBuffer.length} bytes)`);

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