const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const state = require("./core/state");
const { registerPlayerEvents } = require("./core/players");
const { registerBuzzerEvents } = require("./core/buzzer");
const sessionRoutes = require("./routes/session");
const teamsRoutes = require("./routes/teams");

console.log("sessionRoutes type:", typeof sessionRoutes);
console.log("teamsRoutes type:", typeof teamsRoutes);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"]
});

const PORT = 3000;

app.use(cors());
app.use(express.json());

// Make io available to routes
app.use((req, res, next) => { req.io = io; next(); });

// === Block host from external access ===
app.use("/host", (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const isLocal = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  if (!isLocal) return res.status(403).send("Access denied.");
  next();
});

// === Routes (MUST be before static) ===
app.use("/api", sessionRoutes);
app.use("/api", teamsRoutes);

// === Misc APIs ===
app.get("/api/hello", (req, res) => {
  res.json({ message: "Hey lia, if you see this, you a punk ass bih <3" });
});

app.post("/api/data", (req, res) => {
  res.json({ received: req.body, status: "success" });
});

// === Socket.io ===
io.on("connection", (socket) => {
  registerPlayerEvents(socket, io);
  registerBuzzerEvents(socket, io);
});

// === RTT Measurement ===
setInterval(() => {
  for (const [id] of state.playerStats.entries()) {
    const s = io.sockets.sockets.get(id);
    if (!s) continue;
    const start = Date.now();
    s.emit("ping_check", start, () => {
      const rtt = Date.now() - start;
      const stat = state.playerStats.get(id);
      if (stat) { stat.rtt = rtt; state.playerStats.set(id, stat); }
    });
  }
  if (state.playerStats.size > 0) {
    io.emit("player_stats", [...state.playerStats.values()]);
  }
}, 2000);

// === Serve React Build (AFTER routes) ===
app.use(express.static(path.join(state.exeDir, "game")));

// === Catch-all (LAST) ===
app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(state.exeDir, "game", "index.html"));
});

// === Start ===
server.listen(PORT, () => {
  console.log(`Game server on http://localhost:${PORT}`);
});