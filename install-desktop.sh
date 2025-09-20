#!/bin/bash
echo "Installing Deep Live Cam Desktop App..."
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed."
    echo "Please install npm (usually comes with Node.js)"
    exit 1
fi

# Install npm dependencies
echo "Installing dependencies..."
npm install

# Check if OBS Studio is installed (optional for virtual camera)
echo
echo "Checking for OBS Studio installation..."
if command -v obs &> /dev/null || [ -d "/Applications/OBS.app" ] || [ -d "/usr/bin/obs" ]; then
    echo "✓ OBS Studio found - Virtual camera will use OBS backend"
else
    echo "⚠ OBS Studio not found - Virtual camera will use mock backend"
    echo "  Install OBS Studio for full virtual camera functionality"
    echo "  Download from: https://obsproject.com/"
fi

echo
echo "Installation complete!"
echo
echo "To start the desktop app, run: npm start"
echo "To build executable, run: npm run build"
echo