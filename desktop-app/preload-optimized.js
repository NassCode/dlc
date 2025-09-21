const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the optimized virtual camera functionality
contextBridge.exposeInMainWorld('electronAPI', {
    // Virtual camera controls
    startVirtualCamera: () => ipcRenderer.invoke('start-virtual-camera-optimized'),
    stopVirtualCamera: () => ipcRenderer.invoke('stop-virtual-camera-optimized'),
    sendFrameVirtualCamera: (imageData) => ipcRenderer.invoke('send-frame-virtual-camera-optimized', imageData),
    setVirtualCameraResolution: (width, height) => ipcRenderer.invoke('set-virtual-camera-resolution-optimized', width, height),
    getVirtualCameraStatus: () => ipcRenderer.invoke('get-virtual-camera-status-optimized'),
    getStreamUrl: () => ipcRenderer.invoke('get-stream-url'),

    // Performance monitoring
    getPerformanceStats: () => ipcRenderer.invoke('get-performance-stats'),

    // File dialogs
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),

    // Event listeners
    onSourceImageSelected: (callback) => ipcRenderer.on('source-image-selected', callback),
    onShowSettings: (callback) => ipcRenderer.on('show-settings', callback),
    onToggleVirtualCamera: (callback) => ipcRenderer.on('toggle-virtual-camera', callback)
});

// Expose optimized virtual camera object to window
contextBridge.exposeInMainWorld('virtualCamera', {
    start: () => ipcRenderer.invoke('start-virtual-camera-optimized'),
    stop: () => ipcRenderer.invoke('stop-virtual-camera-optimized'),
    sendFrame: (frameData) => ipcRenderer.invoke('send-frame-virtual-camera-optimized', frameData),
    getStatus: () => ipcRenderer.invoke('get-virtual-camera-status-optimized'),
    getStreamUrl: () => ipcRenderer.invoke('get-stream-url'),
    getPerformanceStats: () => ipcRenderer.invoke('get-performance-stats')
});

// Mark as desktop app
contextBridge.exposeInMainWorld('isDesktopApp', true);

// Expose optimized processing utilities
contextBridge.exposeInMainWorld('optimizedUtils', {
    // Convert between different image formats efficiently
    convertImageFormat: (imageData, format, quality) =>
        ipcRenderer.invoke('convert-image-format', imageData, format, quality),

    // Image compression utilities
    compressImage: (imageData, quality, maxWidth, maxHeight) =>
        ipcRenderer.invoke('compress-image', imageData, quality, maxWidth, maxHeight),

    // Frame rate optimization
    getOptimalFrameRate: (processingTime, targetFps) =>
        ipcRenderer.invoke('get-optimal-frame-rate', processingTime, targetFps),

    // Memory usage monitoring
    getMemoryUsage: () => ipcRenderer.invoke('get-memory-usage')
});

// Console log for debugging
console.log('Optimized preload script loaded - Advanced virtual camera features available');