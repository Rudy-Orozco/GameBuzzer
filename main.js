const { spawn, exec } = require('child_process');
const path = require('path');

// This is the real folder where GameController.exe lives
const exeDir = path.dirname(process.execPath);

// Start server.js
const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: 'inherit' });

// Start cloudflared (external file, use exeDir)
const cloudflared = spawn(path.join(exeDir, 'cloudflared.exe'), [], { 
    stdio: 'inherit',
    cwd: exeDir
});

// Start monitor.js
require('./monitor.js');

// Open browser
setTimeout(() => exec('start http://localhost:4000'), 2000);