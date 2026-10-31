// Launches Electron with ELECTRON_RUN_AS_NODE cleared (some editors set it, which makes Electron behave like plain Node).
const { spawn } = require('child_process');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

spawn(electron, ['.'], { stdio: 'inherit', env }).on('exit', (code) => process.exit(code ?? 0));
