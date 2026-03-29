const state = require("./state");

function registerPlayerEvents(socket, io) {
  socket.on("auth", ({ name, password }) => {
    if (name === "__host__") {
      socket.data.name = "__host__";
      socket.data.authed = true;
      socket.emit("auth_success");
      socket.emit("state", {
        buzzerState: state.buzzerState,
        winner: state.winner,
        queue: state.buzzQueue,
        players: [...state.players.values()],
        teamMode: state.teamMode,
        teams: state.teams,
        playerTeams: state.playerTeams,
        screenTab: state.screenTab,
        screenContent: state.screenContent,
        scores: state.scores,
      });
      console.log("Host connected");
      return;
    }

    if (!name?.trim()) return socket.emit("auth_failed", { reason: "Please enter a name." });
    if (state.sessionPassword && password !== state.sessionPassword) {
      return socket.emit("auth_failed", { reason: "Incorrect password." });
    }
    if (state.whitelist.length > 0 && !state.whitelist.some(n => n.toLowerCase() === name.trim().toLowerCase())) {
      return socket.emit("auth_failed", { reason: "Your name is not on the guest list." });
    }
    if ([...state.players.values()].some(n => n.toLowerCase() === name.trim().toLowerCase())) {
      return socket.emit("auth_failed", { reason: "Name already taken." });
    }

    socket.data.name = name.trim();
    socket.data.authed = true;
    state.players.set(socket.id, name.trim());
    state.playerStats.set(socket.id, { name: name.trim(), rtt: 0 });

    if (state.playerTeams[name.trim()] !== undefined) {
      const teamId = state.playerTeams[name.trim()];
      if (state.teams[teamId] && !state.teams[teamId].players.includes(name.trim())) {
        state.teams[teamId].players.push(name.trim());
      }
    }

    // Initialize score
    if (state.scores[name.trim()] === undefined) {
      state.scores[name.trim()] = 0;
    }

    const playerBuzzerState = state.dismissedPlayers.has(name.trim()) ? "locked" : state.buzzerState;
    socket.emit("auth_success");
    socket.emit("state", {
      buzzerState: playerBuzzerState,
      winner: state.winner,
      queue: state.buzzQueue,
      teamMode: state.teamMode,
      teams: state.teams,
      playerTeams: state.playerTeams,
      screenTab: state.screenTab,
      screenContent: state.screenContent,
      scores: state.scores,
    });

    if (state.dismissedPlayers.has(name.trim())) {
      socket.emit("dismissed_from_queue", {});
    }

    io.emit("players", [...state.players.values()]);
    io.emit("teams_update", {
      teamMode: state.teamMode,
      teams: state.teams,
      playerTeams: state.playerTeams,
    });
    io.emit("scores_update", { scores: state.scores });
    console.log(`Player authenticated: ${name.trim()}`);
  });

  socket.on("kick", (name) => {
    for (const [id, playerName] of state.players.entries()) {
      if (playerName === name) {
        const s = io.sockets.sockets.get(id);
        if (s) { s.emit("kicked"); s.disconnect(); }
        break;
      }
    }
  });

  socket.on("ping_check", (start, callback) => {
    if (typeof callback === "function") callback(start);
  });

  socket.on("disconnect", () => {
    if (state.players.has(socket.id)) {
      const name = state.players.get(socket.id);
      state.players.delete(socket.id);
      state.playerStats.delete(socket.id);
      if (name && state.playerTeams[name] !== undefined) {
        const teamId = state.playerTeams[name];
        if (state.teams[teamId]) {
          state.teams[teamId].players = state.teams[teamId].players.filter(p => p !== name);
        }
      }
      io.emit("players", [...state.players.values()]);
      io.emit("teams_update", {
        teamMode: state.teamMode,
        teams: state.teams,
        playerTeams: state.playerTeams,
      });
    }
    console.log("Disconnected:", socket.id);
  });
}

module.exports = { registerPlayerEvents };