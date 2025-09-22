const StreamingServer = require('./desktop-app/stream-server');
const OptimizedVirtualCameraManager = require('./desktop-app/virtual-camera-optimized');

console.log('🔍 Debug: Testing Streaming Flow\n');

async function debugStreamingFlow() {
    console.log('1. Testing streaming server standalone...');

    const server = new StreamingServer(8090); // Use different port

    try {
        const result = await server.start();
        console.log(`✅ Streaming server started: ${result.streamUrl}`);

        // Test frame broadcasting
        console.log('2. Testing frame broadcasting...');
        const testFrame = Buffer.from('test-frame-data');
        server.broadcastFrame(testFrame);
        console.log('✅ Frame broadcast test passed');

        console.log('3. Testing virtual camera integration...');
        const vcam = new OptimizedVirtualCameraManager();

        // Start virtual camera (this should start streaming server)
        const vcamResult = await vcam.start();
        console.log('Virtual camera start result:', vcamResult);

        if (vcamResult.success) {
            console.log(`✅ Virtual camera started with stream URL: ${vcamResult.streamUrl}`);

            // Test sending a frame
            console.log('4. Testing frame sending through virtual camera...');
            const testImageData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';

            const frameResult = await vcam.sendFrame(testImageData);
            if (frameResult.success) {
                console.log('✅ Frame sent successfully through virtual camera');
            } else {
                console.log('❌ Frame sending failed:', frameResult.error);
            }

            // Check streaming server status
            console.log('5. Checking streaming server status...');
            const serverStatus = server.getStatus();
            console.log('Server status:', serverStatus);

            const vcamStatus = vcam.getStatus();
            console.log('Virtual camera status:', vcamStatus);

        } else {
            console.log('❌ Virtual camera failed to start:', vcamResult.error);
        }

        console.log('\n📋 Debug Summary:');
        console.log('- Streaming server: ✅ Working');
        console.log('- Frame broadcasting: ✅ Working');
        console.log(`- Virtual camera integration: ${vcamResult.success ? '✅' : '❌'} ${vcamResult.success ? 'Working' : 'Failed'}`);

        console.log('\n🎯 Next Steps:');
        console.log('1. Start the optimized app: npm run dev -- --optimized');
        console.log('2. Start virtual camera in the app');
        console.log('3. Start processing with camera and source image');
        console.log('4. Check if frames appear at the stream URL');

        // Cleanup
        await vcam.stop();
        await server.stop();

    } catch (error) {
        console.error('❌ Debug test failed:', error);
    }
}

debugStreamingFlow().catch(console.error);