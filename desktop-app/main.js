const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const VirtualCameraManager = require('./virtual-camera');

class DeepLiveCamApp {
    constructor() {
        this.mainWindow = null;
        this.virtualCamera = new VirtualCameraManager();
        this.isDev = process.argv.includes('--dev');

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
                preload: path.join(__dirname, 'preload.js')
            },
            icon: path.join(__dirname, 'assets', 'icon.png'),
            title: 'Deep Live Cam Desktop',
            show: false
        });

        // Load the client HTML
        const clientPath = path.join(__dirname, '..', 'local-client', 'client.html');
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
        // Virtual camera IPC handlers
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
    }
}

// Create and start the application
new DeepLiveCamApp();