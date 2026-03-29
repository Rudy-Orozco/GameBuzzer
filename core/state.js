const fs = require("fs");
const path = require("path");

const exeDir = process.pkg
  ? path.dirname(process.execPath)
  : path.join(__dirname, "..");

const dataDir = path.join(exeDir, "data");
const sessionFile = path.join(dataDir, "session.json");

function loadSession() {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(sessionFile)) {
      const defaults = { sessionPassword: "", whitelist: [], teamMode: 0, teams: {}, playerTeams: {} };
      fs.writeFileSync(sessionFile, JSON.stringify(defaults, null, 2));
      return defaults;
    }
    const raw = fs.readFileSync(sessionFile, "utf-8").trim();
    if (!raw) {
      const defaults = { sessionPassword: "", whitelist: [], teamMode: 0, teams: {}, playerTeams: {} };
      fs.writeFileSync(sessionFile, JSON.stringify(defaults, null, 2));
      return defaults;
    }
    const parsed = JSON.parse(raw);
    if (!parsed.whitelist) parsed.whitelist = [];
    if (!parsed.teams) parsed.teams = {};
    if (!parsed.playerTeams) parsed.playerTeams = {};
    if (!parsed.teamMode) parsed.teamMode = 0;
    return parsed;
  } catch (err) {
    console.error("Failed to load session:", err);
    const defaults = { sessionPassword: "", whitelist: [], teamMode: 0, teams: {}, playerTeams: {} };
    try { fs.writeFileSync(sessionFile, JSON.stringify(defaults, null, 2)); } catch {}
    return defaults;
  }
}

function saveSession(data) {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(sessionFile, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to save session:", err);
  }
}

const sessionData = loadSession();

let sessionPassword = sessionData.sessionPassword || "";
let whitelist = sessionData.whitelist || [];
let teamMode = sessionData.teamMode || 0;
let teams = sessionData.teams || {};
let playerTeams = sessionData.playerTeams || {};

let buzzerState = "locked";
let activationTime = null;
let buzzQueue = [];
let winner = null;
let buzzWindowTimeout = null;

const players = new Map();
const playerStats = new Map();
const dismissedPlayers = new Set();

const DEFAULT_TEAM_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981"];
const DEFAULT_TEAM_NAMES = ["Team Alpha", "Team Beta", "Team Gamma", "Team Delta"];

function initTeams(count) {
  const newTeams = {};
  playerTeams = {};
  for (let i = 1; i <= count; i++) {
    newTeams[i] = {
      id: i,
      name: teams[i]?.name || DEFAULT_TEAM_NAMES[i - 1],
      color: DEFAULT_TEAM_COLORS[i - 1],
      players: []
    };
  }
  teams = newTeams;
}

module.exports = {
  sessionData, loadSession, saveSession,
  get sessionPassword() { return sessionPassword; },
  set sessionPassword(v) { sessionPassword = v; },
  get whitelist() { return whitelist; },
  set whitelist(v) { whitelist = v; },
  get teamMode() { return teamMode; },
  set teamMode(v) { teamMode = v; },
  get teams() { return teams; },
  set teams(v) { teams = v; },
  get playerTeams() { return playerTeams; },
  set playerTeams(v) { playerTeams = v; },
  get buzzerState() { return buzzerState; },
  set buzzerState(v) { buzzerState = v; },
  get activationTime() { return activationTime; },
  set activationTime(v) { activationTime = v; },
  get buzzQueue() { return buzzQueue; },
  set buzzQueue(v) { buzzQueue = v; },
  get winner() { return winner; },
  set winner(v) { winner = v; },
  get buzzWindowTimeout() { return buzzWindowTimeout; },
  set buzzWindowTimeout(v) { buzzWindowTimeout = v; },
  players, playerStats, dismissedPlayers,
  initTeams,
  DEFAULT_TEAM_COLORS,
  DEFAULT_TEAM_NAMES,
  exeDir,
};