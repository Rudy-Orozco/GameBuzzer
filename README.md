# 🎮 GameController — Gameshow Buzzer System

A self-hosted, real-time gameshow buzzer system built with Node.js, Socket.io, and React. Runs as a standalone Windows executable — no installation required for players.

---

## ✨ Features

- **Real-time buzzer** with ping-compensated reaction times
- **Queue system** — see who buzzed in what order
- **Team support** — up to 4 teams with custom names and colors
- **Session password** — control who can join
- **Player whitelist** — pre-approve player names
- **Host panel** — manage the game, kick players, mark correct/incorrect
- **Monitor UI** — server dashboard with logs, tunnel URL, and session config
- **Cloudflare Tunnel** — share a public URL with players instantly, no port forwarding needed
- **Persistent config** — password, whitelist, and teams survive restarts

---

## 🖥️ Requirements (for running from source)

- [Node.js](https://nodejs.org) v18+
- [cloudflared.exe](https://github.com/cloudflare/cloudflared/releases) in the project root

---

## 🚀 Getting Started

### Running from source
```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Dev mode (hot reload)
cd client && npm run dev    # Terminal 1 — React frontend
node monitor.js             # Terminal 2 — Backend
```

Then open:
- `http://localhost:5173/monitor` — Monitor UI (dev)
- `http://localhost:3000/host` — Host Panel
- `http://localhost:3000/player` — Player View

### Building the exe
```bash
npm run package
```

Outputs `GameController.exe` in the project root.

---

## 📦 Distribution

To share with a host, send them:
```
📁 GameController/
  ├── GameController.exe
  ├── cloudflared.exe
  └── 📁 game/
```

They just double-click `GameController.exe` — no Node.js needed.

---

## 🗂️ Project Structure
```
📁 GameController/
  ├── monitor.js              # Process manager — starts server + tunnel
  ├── server.js               # Express + Socket.io entry point
  ├── package.json
  ├── cloudflared.exe         # Cloudflare tunnel binary
  │
  ├── 📁 core/                # Server-side game logic
  │     ├── state.js          # Shared game state + persistence
  │     ├── buzzer.js         # Buzzer, queue, and scoring events
  │     └── players.js        # Auth, kick, ping, disconnect
  │
  ├── 📁 routes/              # REST API routes
  │     ├── session.js        # Password + whitelist API
  │     └── teams.js          # Teams API
  │
  ├── 📁 client/              # React + TypeScript frontend (source)
  │     └── 📁 src/
  │           ├── App.tsx
  │           ├── socket.ts
  │           └── 📁 pages/
  │                 ├── Monitor/    # Server dashboard
  │                 ├── Host/       # Host panel
  │                 └── Player/     # Player buzzer
  │
  └── 📁 game/                # React build output (served statically)
```

---

## 🎯 How It Works

### For the host
1. Run `GameController.exe`
2. Monitor opens at `http://localhost:4000/monitor`
3. Set a session password and whitelist players (optional)
4. Share the Cloudflare tunnel URL with players
5. Open `http://localhost:3000/host` for the host panel
6. Control the buzzer — Activate, Lock, Reset

### For players
1. Open the tunnel URL on their phone or laptop
2. Enter their name and session password
3. Wait for the host to activate the buzzer
4. Press **BUZZ** as fast as possible!

---

## 🔌 Pages

| URL | Description | Access |
|-----|-------------|--------|
| `localhost:4000/monitor` | Server dashboard | Local only |
| `localhost:3000/host` | Host panel | Local only |
| `localhost:3000/player` | Player buzzer | Public (via tunnel) |
| `tunnel-url/player` | Player buzzer | Public |

---

## ⚙️ Configuration

All config is managed from the Monitor UI and persisted in `data/session.json`:

| Setting | Description |
|---------|-------------|
| Session Password | Players must enter this to join |
| Whitelist | Only listed names can join (empty = anyone) |
| Team Mode | 0, 2, 3, or 4 teams |
| Team Names | Custom names per team |
| Player Assignment | Assign whitelisted players to teams |

---

## 🛠️ Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js, Express, Socket.io |
| Frontend | React, TypeScript, CSS Modules |
| Bundler | Vite |
| Packaging | pkg |
| Tunnel | Cloudflare Tunnel (cloudflared) |
| Storage | JSON file |

---

## 📋 Scripts
```bash
npm run dev        # Start backend only
npm run build      # Build React frontend
npm run package    # Build React + package exe
npm run dist       # Build + package + zip for distribution
```

---

## 🗺️ Roadmap

- [ ] Scoring system (manual + automatic)
- [ ] Audience screen (`/audience`)
- [ ] Reconnection handling
- [ ] QR code for player URL
- [ ] Permanent Cloudflare tunnel (named tunnel)

---

## 📝 Notes

- The Cloudflare tunnel URL changes every session (quick tunnel). For a permanent URL, set up a [named tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps) with a free Cloudflare account.
- Game state (buzzer, queue) resets on restart. Session config (password, whitelist, teams) persists.
- Built for ~10 concurrent players on a local network or via Cloudflare Tunnel.