const state = require("./state");

function getMaxOneWayDelay() {
  let maxRtt = 0;
  for (const stat of state.playerStats.values()) {
    if (stat.rtt > maxRtt) maxRtt = stat.rtt;
  }
  return Math.min(Math.round(maxRtt / 2) + 50, 500);
}

function emitBuzzerStateSelective(io, buzzerState, aTime, queue) {
  for (const [id, playerName] of state.players.entries()) {
    const s = io.sockets.sockets.get(id);
    if (!s) continue;
    if (state.dismissedPlayers.has(playerName)) {
      s.emit("buzzer_state", { state: "locked", activationTime: null, queue });
    } else {
      s.emit("buzzer_state", { state: buzzerState, activationTime: aTime, queue });
    }
  }
}

function emitToPlayer(io, name, event, data) {
  for (const [id, playerName] of state.players.entries()) {
    if (playerName === name) {
      const s = io.sockets.sockets.get(id);
      if (s) s.emit(event, data);
      break;
    }
  }
}

function registerBuzzerEvents(socket, io) {
  socket.on("activate", () => {
    if (!socket.data.authed || socket.data.name !== "__host__") return;
    if (state.buzzWindowTimeout) { clearTimeout(state.buzzWindowTimeout); state.buzzWindowTimeout = null; }

    if (state.buzzQueue.length > 0) {
      state.buzzerState = "buzzed";
      io.emit("buzzer_state", { state: "buzzed", activationTime: state.activationTime, queue: state.buzzQueue });
      io.emit("buzzed", {
        winner: state.buzzQueue[0].name,
        queue: state.buzzQueue,
        teamName: state.buzzQueue[0].teamName || null,
        teamColor: state.buzzQueue[0].teamColor || null,
      });
    } else {
      state.buzzerState = "active";
      state.activationTime = Date.now();
      state.dismissedPlayers.clear();
      io.emit("buzzer_state", { state: "active", activationTime: state.activationTime, queue: [] });
    }
  });

  socket.on("lock", () => {
    if (!socket.data.authed || socket.data.name !== "__host__") return;
    if (state.buzzWindowTimeout) { clearTimeout(state.buzzWindowTimeout); state.buzzWindowTimeout = null; }
    state.buzzerState = "locked";
    io.emit("buzzer_state", { state: "locked", activationTime: null, queue: state.buzzQueue });
  });

  socket.on("reset", () => {
    if (!socket.data.authed) return;
    if (state.buzzWindowTimeout) { clearTimeout(state.buzzWindowTimeout); state.buzzWindowTimeout = null; }
    state.buzzerState = "locked";
    state.activationTime = null;
    state.buzzQueue = [];
    state.winner = null;
    state.dismissedPlayers.clear();
    io.emit("buzzer_state", { state: "locked", activationTime: null, queue: [] });
  });

  socket.on("dismiss_top", () => {
    if (!socket.data.authed || socket.data.name !== "__host__") return;
    if (state.buzzQueue.length === 0) return;

    const dismissed = state.buzzQueue[0].name;
    state.dismissedPlayers.add(dismissed);
    state.buzzQueue.shift();

    emitToPlayer(io, dismissed, "dismissed_from_queue", {});

    if (state.buzzQueue.length > 0) {
      state.winner = state.buzzQueue[0].name;
      const winnerTeamId = state.playerTeams[state.winner];
      const winnerTeam = winnerTeamId ? state.teams[winnerTeamId] : null;
      io.emit("buzzed", {
        winner: state.winner,
        queue: state.buzzQueue,
        teamName: winnerTeam?.name || null,
        teamColor: winnerTeam?.color || null,
      });
    } else {
      state.winner = null;
      state.buzzerState = "active";
      state.activationTime = Date.now();
      io.emit("queue_update", { queue: [] });
      emitBuzzerStateSelective(io, "active", state.activationTime, []);
    }
  });

  socket.on("correct", () => {
    if (!socket.data.authed || socket.data.name !== "__host__") return;
    if (state.buzzQueue.length === 0) return;
    const answerer = state.buzzQueue[0].name;
    emitToPlayer(io, answerer, "answer_result", { correct: true, message: "✅ Correct! Well done!" });
    io.emit("answer_correct", { answerer });
  });

  socket.on("incorrect", () => {
    if (!socket.data.authed || socket.data.name !== "__host__") return;
    if (state.buzzQueue.length === 0) return;
    const answerer = state.buzzQueue[0].name;
    emitToPlayer(io, answerer, "answer_result", { correct: false, message: "❌ Incorrect!" });
    io.emit("answer_incorrect", { answerer });
  });

  socket.on("buzz", ({ clientTime, reactionTime }) => {
    if (!socket.data.authed) return;
    if (socket.data.name === "__host__") return;
    if (state.buzzerState === "locked") return;
    if (state.dismissedPlayers.has(socket.data.name)) return;
    if (state.buzzQueue.some(e => e.name === socket.data.name)) return;

    const serverReceiveTime = Date.now();
    const playerRtt = state.playerStats.get(socket.id)?.rtt || 0;
    const absolutePressTime = serverReceiveTime - Math.round(playerRtt / 2);
    const finalReactionTime = reactionTime ?? (state.activationTime ? serverReceiveTime - state.activationTime : 0);

    const playerTeamId = state.playerTeams[socket.data.name];
    const playerTeam = playerTeamId ? state.teams[playerTeamId] : null;

    const entry = {
      name: socket.data.name,
      teamId: playerTeamId || null,
      teamName: playerTeam?.name || null,
      teamColor: playerTeam?.color || null,
      reactionTime: finalReactionTime,
      absolutePressTime,
    };

    state.buzzQueue.push(entry);

    if (state.buzzQueue.length === 1) {
      state.buzzerState = "buzzed";
      io.emit("buzzer_processing");

      const delay = getMaxOneWayDelay();
      console.log(`Buffer window: ${delay}ms`);

      state.buzzWindowTimeout = setTimeout(() => {
        state.buzzQueue.sort((a, b) => a.absolutePressTime - b.absolutePressTime);
        state.winner = state.buzzQueue[0].name;

        const winnerTeamId = state.playerTeams[state.winner];
        const winnerTeam = winnerTeamId ? state.teams[winnerTeamId] : null;

        io.emit("buzzed", {
          winner: state.winner,
          queue: state.buzzQueue,
          teamName: winnerTeam?.name || null,
          teamColor: winnerTeam?.color || null,
        });

        state.buzzWindowTimeout = null;
      }, delay);

    } else {
      io.emit("queue_update", { queue: state.buzzQueue });
      socket.emit("my_position", { position: state.buzzQueue.length });
    }
  });
}

module.exports = { registerBuzzerEvents, emitToPlayer, emitBuzzerStateSelective };