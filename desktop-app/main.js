const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const VirtualCameraManager = require('./virtual-camera');
const OptimizedVirtualCameraManager = require('./virtual-camera-optimized');

class DeepLiveCamApp {
    constructor() {
        this.mainWindow = null;
        this.virtualCamera = new VirtualCameraManager();
        this.optimizedVirtualCamera = new OptimizedVirtualCameraManager();
        this.isDev = process.argv.includes('--dev');
        this.useOptimized = process.argv.includes('--optimized') || this.isDev;

        this.initializeApp();
    }

    initializeApp() {
        app.whenReady().then(() => {
            this.createMainWindow();
            this.setupMenu();
            this.setupIPC();

            app.on('activate', () => {
                if (BrowserWindow.getAllWindows().length === 0) {
                    this.createMainWindow();
                }
            });
        });

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                this.cleanup();
                app.quit();
            }
        });

        app.on('before-quit', () => {
            this.cleanup();
        });
    }

    createMainWindow() {
        this.mainWindow = new BrowserWindow({
            width: 1400,
            height: 900,
            minWidth: 1000,
            minHeight: 700,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                webSecurity: false,
                preload: path.join(__dirname, this.useOptimized ? 'preload-optimized.js' : 'preload.js')
            },
            icon: path.join(__dirname, 'assets', 'icon.png'),
            title: 'Deep Live Cam Desktop',
            show: false
        });

        // Load the client HTML
        const clientFile = this.useOptimized ? 'client-optimized.html' : 'client.html';
        const clientPath = path.join(__dirname, '..', 'local-client', clientFile);
        this.mainWindow.loadFile(clientPath);

        // Show window when ready
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();

            if (this.isDev) {
                this.mainWindow.webContents.openDevTools();
            }
        });

        // Handle window closed
        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });

        // Desktop features are now handled by preload.js
    }

    // Desktop features are now handled by preload.js - removed injection method

    setupMenu() {
        const template = [
            {
                label: 'File',
                submenu: [
                    {
                        label: 'Open Source Image',
                        accelerator: 'CmdOrCtrl+O',
                        click: () => this.openSourceImage()
                    },
                    { type: 'separator' },
                    {
                        label: 'Settings',
                        accelerator: 'CmdOrCtrl+,',
                        click: () => this.openSettings()
                    },
                    { type: 'separator' },
                    {
                        label: 'Quit',
                        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                        click: () => {
                            this.cleanup();
                            app.quit();
                        }
                    }
                ]
            },
            {
                label: 'Camera',
                submenu: [
                    {
                        label: 'Start Virtual Camera',
                        accelerator: 'CmdOrCtrl+Shift+V',
                        click: () => this.toggleVirtualCamera()
                    },
                    {
                        label: 'Stop Virtual Camera',
                        accelerator: 'CmdOrCtrl+Shift+S',
                        click: () => this.stopVirtualCamera()
                    }
                ]
            },
            {
                label: 'View',
                submenu: [
                    { role: 'reload' },
                    { role: 'forceReload' },
                    { role: 'toggleDevTools' },
                    { type: 'separator' },
                    { role: 'resetZoom' },
                    { role: 'zoomIn' },
                    { role: 'zoomOut' },
                    { type: 'separator' },
                    { role: 'togglefullscreen' }
                ]
            },
            {
                label: 'Help',
                submenu: [
                    {
                        label: 'About',
                        click: () => this.showAbout()
                    }
                ]
            }
        ];

        if (process.platform === 'darwin') {
            template.unshift({
                label: app.getName(),
                submenu: [
                    { role: 'about' },
                    { type: 'separator' },
                    { role: 'services' },
                    { type: 'separator' },
                    { role: 'hide' },
                    { role: 'hideOthers' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' }
                ]
            });
        }

        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
    }

    setupIPC() {
        // Original Virtual camera IPC handlers
        ipcMain.handle('start-virtual-camera', async () => {
            return await this.startVirtualCamera();
        });

        ipcMain.handle('stop-virtual-camera', async () => {
            return await this.stopVirtualCamera();
        });

        ipcMain.handle('send-frame-virtual-camera', async (event, imageData) => {
            return await this.sendFrameToVirtualCamera(imageData);
        });

        ipcMain.handle('set-virtual-camera-resolution', async (event, width, height) => {
            return await this.setVirtualCameraResolution(width, height);
        });

        ipcMain.handle('get-virtual-camera-status', async () => {
            return this.virtualCamera.getStatus();
        });

        // Optimized Virtual camera IPC handlers
        ipcMain.handle('start-virtual-camera-optimized', async () => {
            return await this.startOptimizedVirtualCamera();
        });

        ipcMain.handle('stop-virtual-camera-optimized', async () => {
            return await this.stopOptimizedVirtualCamera();
        });

        ipcMain.handle('send-frame-virtual-camera-optimized', async (event, frameData) => {
            return await this.sendFrameToOptimizedVirtualCamera(frameData);
        });

        ipcMain.handle('set-virtual-camera-resolution-optimized', async (event, width, height) => {
            return await this.setOptimizedVirtualCameraResolution(width, height);
        });

        ipcMain.handle('get-virtual-camera-status-optimized', async () => {
            return this.optimizedVirtualCamera.getStatus();
        });

        ipcMain.handle('get-stream-url', async () => {
            return this.optimizedVirtualCamera.getStreamUrl();
        });

        ipcMain.handle('get-performance-stats', async () => {
            return this.optimizedVirtualCamera.getPerformanceStats();
        });

        // Optimized processing utilities
        ipcMain.handle('convert-image-format', async (event, imageData, format, quality) => {
            return await this.convertImageFormat(imageData, format, quality);
        });

        ipcMain.handle('compress-image', async (event, imageData, quality, maxWidth, maxHeight) => {
            return await this.compressImage(imageData, quality, maxWidth, maxHeight);
        });

        ipcMain.handle('get-optimal-frame-rate', async (event, processingTime, targetFps) => {
            return this.getOptimalFrameRate(processingTime, targetFps);
        });

        ipcMain.handle('get-memory-usage', async () => {
            return process.memoryUsage();
        });

        // Dialog handlers
        ipcMain.handle('show-save-dialog', async (event, options) => {
            const result = await dialog.showSaveDialog(this.mainWindow, options);
            return result;
        });

        ipcMain.handle('show-open-dialog', async (event, options) => {
            const result = await dialog.showOpenDialog(this.mainWindow, options);
            return result;
        });
    }

    async startVirtualCamera() {
        return await this.virtualCamera.start();
    }

    async stopVirtualCamera() {
        return await this.virtualCamera.stop();
    }

    async sendFrameToVirtualCamera(imageData) {
        return await this.virtualCamera.sendFrame(imageData);
    }

    async setVirtualCameraResolution(width, height) {
        return await this.virtualCamera.setResolution(width, height);
    }

    // Optimized Virtual Camera Methods
    async startOptimizedVirtualCamera() {
        return await this.optimizedVirtualCamera.start();
    }

    async stopOptimizedVirtualCamera() {
        return await this.optimizedVirtualCamera.stop();
    }

    async sendFrameToOptimizedVirtualCamera(frameData) {
        return await this.optimizedVirtualCamera.sendFrame(frameData);
    }

    async setOptimizedVirtualCameraResolution(width, height) {
        return await this.optimizedVirtualCamera.setResolution(width, height);
    }

    // Optimized Processing Utilities
    async convertImageFormat(imageData, format, quality) {
        // Simplified implementation - in production, use a proper image processing library
        try {
            return {
                success: true,
                data: imageData, // Placeholder
                format: format
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async compressImage(imageData, quality, maxWidth, maxHeight) {
        // Simplified implementation - in production, use sharp or similar
        try {
            return {
                success: true,
                data: imageData, // Placeholder
                originalSize: imageData.length,
                compressedSize: Math.floor(imageData.length * quality)
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    getOptimalFrameRate(processingTime, targetFps) {
        // Calculate optimal frame rate based on processing time
        const maxFrameTime = 1000 / targetFps;
        const optimalFps = Math.min(targetFps, Math.floor(1000 / (processingTime * 1.5)));

        return {
            optimalFps: Math.max(10, optimalFps), // Minimum 10 FPS
            recommended: processingTime < maxFrameTime * 0.5 ? targetFps : Math.floor(targetFps * 0.8),
            canIncrease: processingTime < maxFrameTime * 0.3,
            shouldDecrease: processingTime > maxFrameTime * 0.8
        };
    }

    async openSourceImage() {
        const result = await dialog.showOpenDialog(this.mainWindow, {
            title: 'Select Source Image',
            filters: [
                { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp'] }
            ],
            properties: ['openFile']
        });

        if (!result.canceled && result.filePaths.length > 0) {
            // Send the selected file to the renderer process
            this.mainWindow.webContents.send('source-image-selected', result.filePaths[0]);
        }
    }

    openSettings() {
        // Create settings window or show settings in main window
        this.mainWindow.webContents.send('show-settings');
    }

    toggleVirtualCamera() {
        this.mainWindow.webContents.send('toggle-virtual-camera');
    }

    showAbout() {
        dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: 'About Deep Live Cam Desktop',
            message: 'Deep Live Cam Desktop',
            detail: 'Real-time AI face swapping desktop application with virtual camera support.\n\nVersion: 1.0.0\nBuilt with Electron'
        });
    }

    cleanup() {
        if (this.virtualCamera && this.virtualCamera.getStatus().isActive) {
            this.stopVirtualCamera();
        }

        if (this.optimizedVirtualCamera && this.optimizedVirtualCamera.getStatus().isActive) {
            this.stopOptimizedVirtualCamera();
        }
    }
}

// Create and start the application
new DeepLiveCamApp();