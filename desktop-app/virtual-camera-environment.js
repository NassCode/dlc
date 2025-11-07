const path = require('path');
const fs = require('fs');

/**
 * Detect the available virtual camera environment.
 * Attempts node-virtualcam first, then checks for OBS installations.
 * @param {Object} options
 * @param {string} options.nodeMessage - Log message when node-virtualcam is available.
 * @param {string} options.obsMessage - Log message when OBS is detected.
 * @param {string} options.fallbackMessage - Log message when no integration is available.
 * @param {string} options.obsType - Type identifier to return when OBS is detected.
 * @param {string} options.fallbackType - Type identifier to return when nothing is available.
 * @returns {{ type: string, virtualCamLib: any | null }}
 */
function detectVirtualCameraEnvironment({
    nodeMessage = 'Using node-virtualcam for virtual camera',
    obsMessage = 'OBS Studio found - virtual camera available',
    fallbackMessage = 'No virtual camera library available - using mock implementation',
    obsType = 'obs-virtual-cam',
    fallbackType = 'none'
} = {}) {
    try {
        const VirtualCam = require('node-virtualcam');
        console.log(nodeMessage);
        return { type: 'node-virtualcam', virtualCamLib: VirtualCam };
    } catch (error) {
        console.log('node-virtualcam not available:', error.message);
    }

    try {
        const obsPaths = [
            'C:/Program Files/obs-studio/bin/64bit/obs64.exe',
            'C:/Program Files (x86)/obs-studio/bin/32bit/obs32.exe',
            path.join(process.env.HOME || '', 'Applications/OBS.app'),
            path.join(process.env.HOME || '', 'obs-studio')
        ];

        const hasObs = obsPaths.some((obsPath) => obsPath && fs.existsSync(obsPath));
        if (hasObs) {
            console.log(obsMessage);
            return { type: obsType, virtualCamLib: null };
        }
    } catch (error) {
        console.log('OBS Studio check failed:', error.message);
    }

    console.log(fallbackMessage);
    return { type: fallbackType, virtualCamLib: null };
}

module.exports = { detectVirtualCameraEnvironment };
