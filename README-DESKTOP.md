# Deep Live Cam Desktop App

A desktop application wrapper for Deep Live Cam with virtual camera support, built with Electron.

## Features

- **Desktop Application**: Native desktop app experience with Electron
- **Virtual Camera**: Stream processed output as a virtual webcam to other applications
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Real-time Processing**: Low-latency face swapping with virtual camera output
- **Multiple Resolutions**: Support for 480p, 720p, and 1080p virtual camera output

## Installation

### Windows

1. **Install Node.js** (if not already installed):
   - Download from https://nodejs.org/
   - Choose the LTS version

2. **Run the installation script**:
   ```cmd
   install-desktop.bat
   ```

3. **Optional: Install OBS Studio** for full virtual camera functionality:
   - Download from https://obsproject.com/
   - The app will use a mock virtual camera without OBS

### Manual Installation

If you prefer to install manually:

```bash
# Install dependencies
npm install

# Start the desktop app
npm start

# Build executable (optional)
npm run build
```

## Usage

### Starting the Desktop App

```bash
npm start
```

Or in development mode with DevTools:

```bash
npm run dev
```

### Virtual Camera Setup

1. **Start the Deep Live Cam server** (your existing Python server)
2. **Open the desktop app**
3. **Connect to server** using the WebSocket URL
4. **Upload a source image** for face swapping
5. **Start your camera**
6. **Start processing** to begin face swapping
7. **Start Virtual Camera** to stream output to other apps

The virtual camera will appear as "Deep Live Cam" in video applications like:
- Zoom
- Microsoft Teams
- Discord
- OBS Studio
- Skype
- And other video calling/streaming apps

### Virtual Camera Controls

- **Resolution**: Choose between 640x480, 1280x720, or 1920x1080
- **Start/Stop**: Control virtual camera independently of processing
- **Status**: Real-time status updates and error messages

## Building Executables

### Windows
```bash
npm run build:win
```

### macOS
```bash
npm run build:mac
```

### Linux
```bash
npm run build:linux
```

Built applications will be in the `dist/` directory.

## Virtual Camera Libraries

The app supports multiple virtual camera backends:

1. **node-virtualcam**: Direct virtual camera integration
2. **obs-studio-node**: OBS Studio integration
3. **Mock backend**: For development/testing without drivers

## File Structure

```
desktop-app/
├── main.js              # Electron main process
├── virtual-camera.js    # Virtual camera manager
└── assets/              # App icons and resources

local-client/
└── client.html          # Enhanced web client with desktop features

package.json             # Dependencies and build config
install-desktop.bat      # Windows installation script
install-desktop.sh       # Linux/macOS installation script
```

## Troubleshooting

### Virtual Camera Not Working

1. **Install OBS Studio** for the best virtual camera support
2. **Check permissions** - some systems require admin rights for virtual cameras
3. **Restart applications** after starting the virtual camera
4. **Check the status panel** for specific error messages

### Performance Issues

1. **Lower resolution** in virtual camera settings
2. **Close unnecessary applications**
3. **Use hardware acceleration** if available
4. **Check server performance** - desktop app relies on the Python server

### Connection Issues

1. **Verify server is running** on the specified port
2. **Check firewall settings**
3. **Use correct WebSocket URL** (ws://localhost:8000 by default)

## Development

To modify or extend the desktop app:

1. **Client modifications**: Edit `local-client/client.html`
2. **Desktop features**: Edit `desktop-app/main.js`
3. **Virtual camera**: Edit `desktop-app/virtual-camera.js`

The desktop app automatically detects when running in Electron and enables desktop-specific features.

## Requirements

- **Node.js** 16 or higher
- **npm** (comes with Node.js)
- **OBS Studio** (optional, for full virtual camera support)
- **Deep Live Cam server** running for face swapping functionality

## License

Same as the main Deep Live Cam project.