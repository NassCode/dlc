const StreamingServer = require('./desktop-app/stream-server');

console.log('🎭 Starting Streaming Test Server...\n');

async function startTestServer() {
    const server = new StreamingServer(8080);

    try {
        const result = await server.start();
        console.log('✅ Streaming server started successfully!');
        console.log(`📺 Open in browser: ${result.streamUrl}`);
        console.log(`🔌 WebSocket endpoint: ${result.wsUrl}`);
        console.log('\n📋 Instructions:');
        console.log('1. Open the stream URL in your browser');
        console.log('2. Use this URL in OBS Browser Source');
        console.log('3. Press Ctrl+C to stop the server');

        // Send test frames every second
        let frameCounter = 0;
        const testInterval = setInterval(() => {
            frameCounter++;
            const testFrame = Buffer.from(`Test frame ${frameCounter} - ${new Date().toISOString()}`);
            server.broadcastFrame(testFrame);

            const status = server.getStatus();
            if (status.clients > 0) {
                console.log(`📡 Broadcasting frame ${frameCounter} to ${status.clients} client(s)`);
            }
        }, 1000);

        // Handle cleanup
        process.on('SIGINT', async () => {
            console.log('\n🛑 Stopping server...');
            clearInterval(testInterval);
            await server.stop();
            console.log('✅ Server stopped gracefully');
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

startTestServer();