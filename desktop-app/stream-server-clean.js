const http = require('http');
const WebSocket = require('ws');

class CleanStreamingServer {
    constructor(port = 0) {
        this.port = port;
        this.server = null;
        this.wsServer = null;
        this.clients = new Set();
        this.latestFrame = null;

        this.stats = {
            framesProcessed: 0,
            clientsConnected: 0,
            serverStartTime: Date.now(),
            lastFpsUpdate: Date.now()
        };

        this.setupServer();
    }

    setupServer() {
        // Create HTTP server for browser access
        this.server = http.createServer((req, res) => {
            if (req.url === '/' || req.url === '/stream') {
                this.serveCleanStreamPage(res);
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
            this.clients.add(ws);
            this.stats.clientsConnected = this.clients.size;

            // Send latest frame if available
            if (this.latestFrame) {
                try {
                    ws.send(this.latestFrame);
                } catch (error) {
                    this.clients.delete(ws);
                }
            }

            ws.on('close', () => {
                this.clients.delete(ws);
                this.stats.clientsConnected = this.clients.size;
            });

            ws.on('error', (error) => {
                this.clients.delete(ws);
                this.stats.clientsConnected = this.clients.size;
            });
        });
    }

    serveCleanStreamPage(res) {
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
                this.wsUrl = \`\${protocol}//\${window.location.host}/ws\`;
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

            connectToStream() {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    return;
                }

                this.updateStatus('connecting');
                this.showLoading();

                try {
                    this.ws = new WebSocket(this.wsUrl);

                    this.ws.onopen = () => {
                        this.isConnected = true;
                        this.currentReconnectAttempt = 0;
                        this.updateStatus('connected');
                        this.hideMessages();
                    };

                    this.ws.onmessage = (event) => {
                        if (event.data instanceof Blob) {
                            this.frameCount++;
                            this.displayFrame(event.data);
                        }
                    };

                    this.ws.onclose = () => {
                        this.isConnected = false;
                        this.updateStatus('disconnected');
                        this.scheduleReconnect();
                    };

                    this.ws.onerror = () => {
                        this.isConnected = false;
                        this.updateStatus('disconnected');
                        this.showError();
                    };

                } catch (error) {
                    this.updateStatus('disconnected');
                    this.showError();
                    this.scheduleReconnect();
                }
            }

            scheduleReconnect() {
                if (this.currentReconnectAttempt < this.maxReconnectAttempts) {
                    this.currentReconnectAttempt++;
                    const delay = this.reconnectDelay * Math.pow(1.5, this.currentReconnectAttempt - 1);

                    setTimeout(() => {
                        this.connectToStream();
                    }, delay);
                } else {
                    this.showError();
                }
            }

            displayFrame(blob) {
                const img = new Image();
                img.onload = () => {
                    if (this.canvas.width !== img.width || this.canvas.height !== img.height) {
                        this.canvas.width = img.width;
                        this.canvas.height = img.height;
                    }

                    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                    this.ctx.drawImage(img, 0, 0);

                    URL.revokeObjectURL(img.src);
                    this.hideMessages();
                };
                img.src = URL.createObjectURL(blob);
            }

            toggleFullscreen() {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => {});
                } else {
                    document.exitFullscreen().catch(() => {});
                }
            }

            updateStatus(status) {
                this.statusDot.className = \`status-dot \${status}\`;
            }

            showLoading() {
                this.loadingMessage.classList.remove('hidden');
                this.errorMessage.classList.add('hidden');
            }

            showError() {
                this.loadingMessage.classList.add('hidden');
                this.errorMessage.classList.remove('hidden');
            }

            hideMessages() {
                this.loadingMessage.classList.add('hidden');
                this.errorMessage.classList.add('hidden');
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

    // Clean frame broadcasting - no debug logs or metadata
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

        this.stats.clientsConnected = this.clients.size;
    }

    updateFrameStats() {
        this.stats.framesProcessed++;
        this.stats.lastFpsUpdate = Date.now();
    }

    getStatus() {
        return {
            isRunning: this.server ? this.server.listening : false,
            port: this.port,
            clients: this.clients.size,
            framesProcessed: this.stats.framesProcessed,
            uptime: Date.now() - this.stats.serverStartTime
        };
    }

    start() {
        return new Promise((resolve, reject) => {
            this.server.listen(this.port, 'localhost', () => {
                const actualPort = this.server.address().port;
                this.port = actualPort;
                const streamUrl = `http://localhost:${actualPort}/stream`;
                console.log(`🚀 Clean streaming server started at ${streamUrl}`);
                resolve({
                    success: true,
                    streamUrl,
                    wsUrl: `ws://localhost:${actualPort}/ws`,
                    port: actualPort
                });
            });

            this.server.on('error', (error) => {
                reject({
                    success: false,
                    error: error.message
                });
            });
        });
    }

    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                // Close all WebSocket connections
                for (const client of this.clients) {
                    client.close();
                }
                this.clients.clear();

                // Close the server
                this.server.close(() => {
                    console.log('🛑 Clean streaming server stopped');
                    resolve({ success: true });
                });
            } else {
                resolve({ success: true });
            }
        });
    }
}

module.exports = CleanStreamingServer;