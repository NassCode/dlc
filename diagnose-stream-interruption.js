const StreamingServer = require('./desktop-app/stream-server');

console.log('🔍 Diagnosing Stream Interruption Issues\n');

let frameCount = 0;
let lastFrameTime = 0;

async function diagnoseStreamingIssues() {
    console.log('1. Starting streaming server...');

    const server = new StreamingServer(8080);

    try {
        const result = await server.start();
        console.log(`✅ Streaming server started: ${result.streamUrl}`);

        // Monitor clients
        let clientCount = 0;
        const originalBroadcast = server.broadcastFrame.bind(server);

        server.broadcastFrame = function(frameBuffer, metadata = {}) {
            frameCount++;
            const now = Date.now();

            if (lastFrameTime > 0) {
                const timeBetweenFrames = now - lastFrameTime;
                if (timeBetweenFrames > 1000) { // More than 1 second between frames
                    console.log(`⚠️ Large gap between frames: ${timeBetweenFrames}ms`);
                }
            }

            lastFrameTime = now;
            console.log(`📡 Frame #${frameCount} - Size: ${frameBuffer.length} bytes - Clients: ${this.clients.size}`);

            // Call original method
            return originalBroadcast(frameBuffer, metadata);
        };

        // Monitor WebSocket connections
        const originalConnection = server.wsServer.on.bind(server.wsServer);
        server.wsServer.on('connection', (ws) => {
            clientCount++;
            console.log(`🔌 Client #${clientCount} connected`);

            ws.on('close', () => {
                console.log(`🔌 Client disconnected`);
            });

            ws.on('error', (error) => {
                console.log(`❌ Client WebSocket error:`, error.message);
            });

            // Call original handler
            const clients = server.clients;
            clients.add(ws);

            // Send latest frame immediately if available
            if (server.latestFrame) {
                server.sendFrameToClient(ws, server.latestFrame);
            }

            ws.on('close', () => {
                console.log('Streaming client disconnected');
                clients.delete(ws);
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                clients.delete(ws);
            });
        });

        // Send test frames periodically to simulate processing
        console.log('2. Starting frame simulation...');
        let testFrameCount = 0;

        const frameInterval = setInterval(() => {
            testFrameCount++;
            const testFrame = Buffer.from(`Test frame ${testFrameCount} - ${new Date().toISOString()}`);

            console.log(`📤 Sending test frame #${testFrameCount}`);
            server.broadcastFrame(testFrame);

            // Stop after 100 frames to test
            if (testFrameCount >= 100) {
                console.log('🛑 Stopping frame simulation after 100 frames');
                clearInterval(frameInterval);

                // Monitor for any remaining activity
                setTimeout(() => {
                    console.log('\n📊 Final Status:');
                    console.log(`- Total frames sent: ${frameCount}`);
                    console.log(`- Connected clients: ${server.clients.size}`);
                    console.log(`- Server status:`, server.getStatus());

                    server.stop().then(() => {
                        console.log('✅ Diagnostic complete');
                        process.exit(0);
                    });
                }, 5000);
            }
        }, 100); // Send frame every 100ms (10 FPS)

        // Monitor for interruptions
        const monitorInterval = setInterval(() => {
            const now = Date.now();
            if (lastFrameTime > 0 && (now - lastFrameTime) > 2000) {
                console.log(`🚨 INTERRUPTION DETECTED: ${now - lastFrameTime}ms since last frame`);
            }
        }, 1000);

        // Clean up monitor when done
        setTimeout(() => {
            clearInterval(monitorInterval);
        }, 15000);

    } catch (error) {
        console.error('❌ Diagnostic failed:', error);
        process.exit(1);
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\n🛑 Diagnostic interrupted by user');
    process.exit(0);
});

diagnoseStreamingIssues();