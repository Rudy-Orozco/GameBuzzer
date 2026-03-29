const express = require("express");
const router = express.Router();
const state = require("../core/state");

router.get("/session", (req, res) => {
  res.json({
    sessionPassword: state.sessionPassword,
    whitelist: state.whitelist,
    teamMode: state.teamMode,
    teams: state.teams,
    playerTeams: state.playerTeams,
    players: [...state.players.values()],
  });
});

router.post("/session", (req, res) => {
  const { password } = req.body;
  if (password !== undefined) {
    state.sessionPassword = password;
    state.sessionData.sessionPassword = password;
    state.saveSession(state.sessionData);
  }
  res.json({ success: true, sessionPassword: state.sessionPassword });
});

router.post("/whitelist/add", (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Name required" });
  const trimmed = name.trim();
  if (state.whitelist.some(n => n.toLowerCase() === trimmed.toLowerCase())) {
    return res.status(400).json({ error: "Name already in whitelist" });
  }
  state.whitelist.push(trimmed);
  state.sessionData.whitelist = state.whitelist;
  state.saveSession(state.sessionData);
  res.json({ success: true, whitelist: state.whitelist });
});

router.post("/whitelist/remove", (req, res) => {
  const { name } = req.body;
  state.whitelist = state.whitelist.filter(n => n.toLowerCase() !== name.toLowerCase());
  state.sessionData.whitelist = state.whitelist;
  state.saveSession(state.sessionData);
  res.json({ success: true, whitelist: state.whitelist });
});

module.exports = router;