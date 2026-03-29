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