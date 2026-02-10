
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// CRITICAL: Unset the variable that forces Electron to act as pure Node.js
delete process.env.ELECTRON_RUN_AS_NODE;

const electronPath = path.join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe');
const mainPath = path.join(process.cwd(), 'electron', 'main.cjs');

console.log('🚀 Launching Electron via custom launcher...');
console.log('Binary:', electronPath);
console.log('Main:', mainPath);

const child = spawn(electronPath, [mainPath], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }
});

child.on('exit', (code) => {
    process.exit(code);
});
