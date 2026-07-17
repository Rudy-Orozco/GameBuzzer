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

function saveSession() {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const data = { sessionPassword, whitelist, teamMode, teams, playerTeams };
    fs.writeFileSync(sessionFile, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to save session:", err);
  }
}

const jeopardyFile = path.join(dataDir, "jeopardy.json");

const JEOPARDY_CATEGORY_COUNT = 5;
const JEOPARDY_ROUND_VALUES = { 1: [200, 400, 600, 800, 1000], 2: [400, 800, 1200, 1600, 2000] };

function buildJeopardyRound(round) {
  return {
    categories: Array.from({ length: JEOPARDY_CATEGORY_COUNT }, () => ({
      name: "",
      clues: JEOPARDY_ROUND_VALUES[round].map(value => ({ value, question: "", answer: "", used: false })),
    })),
  };
}

function defaultJeopardyBoard() {
  return { round: 1, rounds: { 1: buildJeopardyRound(1), 2: buildJeopardyRound(2) } };
}

function loadJeopardyBoard() {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(jeopardyFile)) {
      const defaults = defaultJeopardyBoard();
      fs.writeFileSync(jeopardyFile, JSON.stringify(defaults, null, 2));
      return defaults;
    }
    const raw = fs.readFileSync(jeopardyFile, "utf-8").trim();
    if (!raw) return defaultJeopardyBoard();
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to load jeopardy board:", err);
    return defaultJeopardyBoard();
  }
}

function saveJeopardyBoard() {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(jeopardyFile, JSON.stringify(jeopardyBoard, null, 2));
  } catch (err) {
    console.error("Failed to save jeopardy board:", err);
  }
}

const initialSession = loadSession();

let sessionPassword = initialSession.sessionPassword || "";
let whitelist = initialSession.whitelist || [];
let teamMode = initialSession.teamMode || 0;
let teams = initialSession.teams || {};
let playerTeams = initialSession.playerTeams || {};

let buzzerState = "locked";
let activationTime = null;
let buzzQueue = [];
let winner = null;
let buzzWindowTimeout = null;

let screenTab = "trivia";
let screenContent = { type: "blank", content: "", question: "", answer: "" };

let scores = {};

let jeopardyBoard = loadJeopardyBoard();
let activeClue = null;

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
  loadSession, saveSession,
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
  get screenTab() { return screenTab; },
  set screenTab(v) { screenTab = v; },
  get screenContent() { return screenContent; },
  set screenContent(v) { screenContent = v; },
  get scores() { return scores; },
  set scores(v) { scores = v; },
  get jeopardyBoard() { return jeopardyBoard; },
  set jeopardyBoard(v) { jeopardyBoard = v; },
  get activeClue() { return activeClue; },
  set activeClue(v) { activeClue = v; },
  saveJeopardyBoard,
  defaultJeopardyBoard,
  JEOPARDY_CATEGORY_COUNT,
  JEOPARDY_ROUND_VALUES,
  players, playerStats, dismissedPlayers,
  initTeams,
  DEFAULT_TEAM_COLORS,
  DEFAULT_TEAM_NAMES,
  exeDir,
};