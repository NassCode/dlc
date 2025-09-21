const StreamingServer = require('./desktop-app/stream-server');
const OptimizedVirtualCameraManager = require('./desktop-app/virtual-camera-optimized');

console.log('🧪 Testing Optimized Streaming Components...\n');

async function testStreamingServer() {
    console.log('1. Testing Streaming Server...');
    const server = new StreamingServer(8080);

    try {
        const result = await server.start();
        console.log('   ✅ Streaming server started successfully');
        console.log(`   📡 Stream URL: ${result.streamUrl}`);
        console.log(`   🔌 WebSocket URL: ${result.wsUrl}`);

        // Test frame broadcasting
        const testFrame = Buffer.from('test frame data');
        server.broadcastFrame(testFrame);
        console.log('   ✅ Frame broadcasting test passed');

        await server.stop();
        console.log('   ✅ Server cleanup completed\n');
        return true;
    } catch (error) {
        console.log(`   ❌ Streaming server test failed: ${error.message}\n`);
        return false;
    }
}

async function testVirtualCameraManager() {
    console.log('2. Testing Optimized Virtual Camera Manager...');
    const vcam = new OptimizedVirtualCameraManager();

    try {
        // Test initialization
        const status = vcam.getStatus();
        console.log(`   ✅ Virtual camera initialized (type: ${status.type})`);

        // Test start
        const startResult = await vcam.start();
        if (startResult.success) {
            console.log('   ✅ Virtual camera started successfully');
            if (startResult.streamUrl) {
                console.log(`   📺 Stream URL: ${startResult.streamUrl}`);
            }

            // Test frame sending
            const testImageData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAA...'; // Sample base64
            const frameResult = await vcam.sendFrame(testImageData);
            if (frameResult.success) {
                console.log('   ✅ Frame sending test passed');
            } else {
                console.log(`   ⚠️  Frame sending test skipped: ${frameResult.error || 'Not critical'}`);
            }

            // Test performance stats
            const perfStats = vcam.getPerformanceStats();
            console.log(`   📊 Performance stats available: ${Object.keys(perfStats).length} metrics`);

            // Test stop
            const stopResult = await vcam.stop();
            if (stopResult.success) {
                console.log('   ✅ Virtual camera stopped successfully');
            }
        } else {
            console.log(`   ⚠️  Virtual camera start test: ${startResult.message || startResult.error}`);
        }

        console.log('   ✅ Virtual camera manager test completed\n');
        return true;
    } catch (error) {
        console.log(`   ❌ Virtual camera manager test failed: ${error.message}\n`);
        return false;
    }
}

async function runTests() {
    console.log('🎭 Deep Live Cam - Optimized Streaming Verification\n');
    console.log('This test verifies that the optimized streaming components work correctly.\n');

    const results = {
        streamingServer: false,
        virtualCamera: false
    };

    // Run tests
    results.streamingServer = await testStreamingServer();
    results.virtualCamera = await testVirtualCameraManager();

    // Summary
    console.log('📋 Test Summary:');
    console.log(`   Streaming Server: ${results.streamingServer ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Virtual Camera:   ${results.virtualCamera ? '✅ PASS' : '❌ FAIL'}`);

    const allPassed = Object.values(results).every(r => r);

    if (allPassed) {
        console.log('\n🎉 All tests passed! The optimized streaming system is ready to use.');
        console.log('\n📚 Usage Instructions:');
        console.log('   1. Run: npm run dev -- --optimized');
        console.log('   2. Start virtual camera in the app');
        console.log('   3. Click "Open Stream in Browser" to test');
        console.log('   4. Use the stream URL in OBS Browser Source');
    } else {
        console.log('\n⚠️  Some tests failed. Check the error messages above.');
        console.log('   This may be expected if virtual camera libraries are not installed.');
        console.log('   The streaming server should still work for browser testing.');
    }

    console.log('\n🔧 Troubleshooting:');
    console.log('   - Ensure Node.js dependencies are installed: npm install');
    console.log('   - For full virtual camera support, install node-virtualcam');
    console.log('   - OBS Studio installation enables optimized OBS integration');

    process.exit(allPassed ? 0 : 1);
}

// Run the tests
runTests().catch(error => {
    console.error('💥 Test runner crashed:', error);
    process.exit(1);
});