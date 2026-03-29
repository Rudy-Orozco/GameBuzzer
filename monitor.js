const { spawn, exec } = require("child_process");
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());
const PORT = 4000;

let logs = [];
let publicUrl = "Starting...";
let tunnelProcess = null;

function addLog(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  console.log(line);
  logs.push(line);
  if (logs.length > 300) logs.shift();
}

const exeDir = process.pkg
  ? path.dirname(process.execPath)
  : __dirname;

// === Start Game Server ===
require('./server.js');
addLog('Game server started on http://localhost:3000');

// === Start Cloudflare Tunnel ===
const cloudflaredPath = path.join(exeDir, "cloudflared.exe");
tunnelProcess = spawn(cloudflaredPath, ["tunnel", "--url", "http://localhost:3000"]);

const extractTunnelUrl = (text) => {
  const match = text.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
  if (match) {
    publicUrl = match[0];
    addLog(`Tunnel live: ${publicUrl}`);
    addLog(`Share with players: ${publicUrl}/player`);
  }
};

tunnelProcess.stdout.on("data", (data) => {
  const text = data.toString();
  addLog(`TUNNEL: ${text}`);
  extractTunnelUrl(text);
});
tunnelProcess.stderr.on("data", (data) => {
  const text = data.toString();
  addLog(`TUNNEL: ${text}`);
  extractTunnelUrl(text);
});
tunnelProcess.on("error", (err) => addLog(`TUNNEL FAILED: ${err.message}`));

// === Security — block external access ===
app.use(["/monitor", "/logs", "/shutdown", "/api"], (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const isLocal = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  if (!isLocal) return res.status(403).send("Access denied.");
  next();
});

// === Forward /api/session to game server on port 3000 ===
app.get("/api/session", async (req, res) => {
  try {
    const response = await fetch("http://localhost:3000/api/session");
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to reach game server" });
  }
});

app.post("/api/session", async (req, res) => {
  try {
    const response = await fetch("http://localhost:3000/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to reach game server" });
  }
});

// === Monitor API routes ===
app.get("/logs", (req, res) => res.json({
  logs,
  publicUrl,
  playerUrl: publicUrl.startsWith("http") ? `${publicUrl}/player` : null,
  hostUrl: "http://localhost:3000/host"
}));

app.post("/shutdown", (req, res) => {
  addLog("🛑 Shutdown requested...");
  if (tunnelProcess) { tunnelProcess.kill(); addLog("Tunnel stopped"); }
  res.sendStatus(200);
  setTimeout(() => process.exit(0), 500);
});

// === Serve React Build ===
app.use(express.static(path.join(exeDir, "game")));

// === Catch-all for React Router (MUST be last) ===
app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(exeDir, "game", "index.html"));
});

// === Start Monitor ===
app.listen(PORT, () => {
  console.log(`Monitor UI: http://localhost:${PORT}/monitor`);
  if (process.pkg) exec(`start http://localhost:${PORT}/monitor`);
});

// === Whitelisting ===
app.post("/api/whitelist/add", async (req, res) => {
  try {
    const response = await fetch("http://localhost:3000/api/whitelist/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to reach game server" });
  }
});

app.post("/api/whitelist/remove", async (req, res) => {
  try {
    const response = await fetch("http://localhost:3000/api/whitelist/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to reach game server" });
  }
});

app.get("/api/teams", async (req, res) => {
  try {
    const response = await fetch("http://localhost:3000/api/teams");
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to reach game server" });
  }
});

app.post("/api/teams/mode", async (req, res) => {
  try {
    const response = await fetch("http://localhost:3000/api/teams/mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to reach game server" });
  }
});

app.post("/api/teams/rename", async (req, res) => {
  try {
    const response = await fetch("http://localhost:3000/api/teams/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to reach game server" });
  }
});

app.post("/api/teams/assign", async (req, res) => {
  try {
    const response = await fetch("http://localhost:3000/api/teams/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to reach game server" });
  }
});