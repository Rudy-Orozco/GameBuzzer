const express = require("express");
const router = express.Router();
const state = require("../core/state");

router.get("/teams", (req, res) => {
  res.json({
    teamMode: state.teamMode,
    teams: state.teams,
    playerTeams: state.playerTeams,
  });
});

router.post("/teams/mode", (req, res) => {
  const { mode } = req.body;
  state.teamMode = mode;
  if (mode === 0) { state.teams = {}; state.playerTeams = {}; }
  else state.initTeams(mode);
  state.sessionData.teamMode = state.teamMode;
  state.sessionData.teams = state.teams;
  state.sessionData.playerTeams = state.playerTeams;
  state.saveSession(state.sessionData);
  req.io.emit("teams_update", {
    teamMode: state.teamMode,
    teams: state.teams,
    playerTeams: state.playerTeams,
  });
  res.json({ success: true, teamMode: state.teamMode, teams: state.teams, playerTeams: state.playerTeams });
});

router.post("/teams/rename", (req, res) => {
  const { teamId, name } = req.body;
  if (!state.teams[teamId]) return res.status(400).json({ error: "Team not found" });
  state.teams[teamId].name = name;
  state.sessionData.teams = state.teams;
  state.saveSession(state.sessionData);
  req.io.emit("teams_update", {
    teamMode: state.teamMode,
    teams: state.teams,
    playerTeams: state.playerTeams,
  });
  res.json({ success: true, teams: state.teams });
});

router.post("/teams/assign", (req, res) => {
  const { playerName, teamId } = req.body;
  if (state.playerTeams[playerName] !== undefined) {
    const oldTeam = state.teams[state.playerTeams[playerName]];
    if (oldTeam) oldTeam.players = oldTeam.players.filter(p => p !== playerName);
  }
  if (teamId === 0) {
    delete state.playerTeams[playerName];
  } else {
    if (!state.teams[teamId]) return res.status(400).json({ error: "Team not found" });
    state.playerTeams[playerName] = teamId;
    const isConnected = [...state.players.values()].includes(playerName);
    if (isConnected && !state.teams[teamId].players.includes(playerName)) {
      state.teams[teamId].players.push(playerName);
    }
  }
  state.sessionData.playerTeams = state.playerTeams;
  state.sessionData.teams = state.teams;
  state.saveSession(state.sessionData);
  req.io.emit("teams_update", {
    teamMode: state.teamMode,
    teams: state.teams,
    playerTeams: state.playerTeams,
  });
  res.json({ success: true, teams: state.teams, playerTeams: state.playerTeams });
});

module.exports = router;