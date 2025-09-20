const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Virtual camera APIs
    startVirtualCamera: () => ipcRenderer.invoke('start-virtual-camera'),
    stopVirtualCamera: () => ipcRenderer.invoke('stop-virtual-camera'),
    sendFrameToVirtualCamera: (imageData) => ipcRenderer.invoke('send-frame-virtual-camera', imageData),
    setVirtualCameraResolution: (width, height) => ipcRenderer.invoke('set-virtual-camera-resolution', width, height),
    getVirtualCameraStatus: () => ipcRenderer.invoke('get-virtual-camera-status'),

    // File dialogs
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),

    // App info
    isDesktopApp: true
});

// Create a virtual camera state object that persists
let virtualCameraState = {
    isActive: false
};

// Virtual camera wrapper for easier usage
contextBridge.exposeInMainWorld('virtualCamera', {
    get isActive() {
        return virtualCameraState.isActive;
    },

    start: async () => {
        try {
            const result = await ipcRenderer.invoke('start-virtual-camera');
            virtualCameraState.isActive = result.success;
            return result;
        } catch (error) {
            console.error('Failed to start virtual camera:', error);
            return { success: false, error: error.message };
        }
    },

    stop: async () => {
        try {
            const result = await ipcRenderer.invoke('stop-virtual-camera');
            virtualCameraState.isActive = false;
            return result;
        } catch (error) {
            console.error('Failed to stop virtual camera:', error);
            return { success: false, error: error.message };
        }
    },

    sendFrame: async (imageData) => {
        if (!virtualCameraState.isActive) {
            return { success: false, error: 'Virtual camera not active' };
        }

        try {
            return await ipcRenderer.invoke('send-frame-virtual-camera', imageData);
        } catch (error) {
            console.error('Failed to send frame to virtual camera:', error);
            return { success: false, error: error.message };
        }
    },

    setResolution: async (width, height) => {
        try {
            return await ipcRenderer.invoke('set-virtual-camera-resolution', width, height);
        } catch (error) {
            console.error('Failed to set virtual camera resolution:', error);
            return { success: false, error: error.message };
        }
    },

    getStatus: async () => {
        try {
            return await ipcRenderer.invoke('get-virtual-camera-status');
        } catch (error) {
            console.error('Failed to get virtual camera status:', error);
            return { isActive: false, error: error.message };
        }
    }
});

// Mark as desktop app
contextBridge.exposeInMainWorld('isDesktopApp', true);