import { useEffect, useState, useRef } from "react";
import styles from "./Monitor.module.css";

interface LogData {
  logs: string[];
  publicUrl: string;
}

export default function Monitor() {
  const [logs, setLogs] = useState<string[]>([]);
  const [publicUrl, setPublicUrl] = useState("");
  const [status, setStatus] = useState<"starting" | "live" | "offline">("starting");
  const [isLocal, setIsLocal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [savedPassword, setSavedPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [whitelistInput, setWhitelistInput] = useState("");
  const [whitelistError, setWhitelistError] = useState("");
  const logsRef = useRef<HTMLDivElement>(null);
  const isShuttingDownRef = useRef(false);
  const [teamsState, setTeamsState] = useState<{
    teamMode: number;
    teams: Record<number, { id: number; name: string; color: string; players: string[] }>;
    playerTeams: Record<string, number>;
    players: string[];
  }>({ teamMode: 0, teams: {}, playerTeams: {}, players: [] });
  const [editingTeam, setEditingTeam] = useState<number | null>(null);
  const [teamNameInput, setTeamNameInput] = useState("");

  useEffect(() => {
    const local =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    if (!local) {
      window.location.replace("/player");
    } else {
      setIsLocal(true);
    }
  }, []);

  const fetchData = useRef(async () => {});

  fetchData.current = async () => {
    if (isShuttingDownRef.current) return;
    try {
      const [logsRes, sessionRes] = await Promise.all([
        fetch("/logs"),
        fetch("/api/session"),
      ]);
      const data: LogData = await logsRes.json();
      const sessionData = await sessionRes.json();
      setPublicUrl(data.publicUrl);
      setLogs(data.logs);
      setSavedPassword(sessionData.sessionPassword);
      setWhitelist(sessionData.whitelist || []);
      setTeamsState({
        teamMode: sessionData.teamMode || 0,
        teams: sessionData.teams || {},
        playerTeams: sessionData.playerTeams || {},
        players: (sessionData.players || []).filter((p: string) => p !== "__host__"),
      });
      if (data.publicUrl?.startsWith("http")) setStatus("live");
      if (logsRef.current) {
        logsRef.current.scrollTop = logsRef.current.scrollHeight;
      }
    } catch {
      if (isShuttingDownRef.current) setStatus("offline");
    }
  };

  useEffect(() => {
    if (!isLocal) return;
    const interval = setInterval(() => fetchData.current(), 1000);
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isShuttingDownRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isLocal]);

  async function savePassword() {
    if (!passwordInput.trim()) return;
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passwordInput }),
    });
    setPasswordSaved(true);
    setSavedPassword(passwordInput);
    setTimeout(() => setPasswordSaved(false), 2000);
  }

  async function clearPassword() {
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "" }),
    });
    setPasswordInput("");
    setSavedPassword("");
  }

  async function addToWhitelist() {
    if (!whitelistInput.trim()) return;
    setWhitelistError("");
    try {
      const res = await fetch("/api/whitelist/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: whitelistInput.trim() }),
      });
      const data = await res.json();
      if (data.error) {
        setWhitelistError(data.error);
      } else {
        setWhitelist(data.whitelist);
        setWhitelistInput("");
      }
    } catch {
      setWhitelistError("Failed to add player.");
    }
  }

  async function removeFromWhitelist(name: string) {
    try {
      const res = await fetch("/api/whitelist/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      setWhitelist(data.whitelist);
    } catch {
      setWhitelistError("Failed to remove player.");
    }
  }

  async function setTeamMode(mode: number) {
    const res = await fetch("/api/teams/mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json();
    setTeamsState(prev => ({ ...prev, teamMode: data.teamMode, teams: data.teams, playerTeams: data.playerTeams }));
  }

  async function renameTeam(teamId: number, name: string) {
    await fetch("/api/teams/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, name }),
    });
    setEditingTeam(null);
  }

  async function assignTeam(playerName: string, teamId: number) {
    const res = await fetch("/api/teams/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName, teamId }),
    });
    const data = await res.json();
    setTeamsState(prev => ({ ...prev, teams: data.teams, playerTeams: data.playerTeams }));
  }

  function copyUrl() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(`${publicUrl}/player`);
    alert("Player URL copied!");
  }

  function openPage(page: "host" | "player") {
    if (page === "host") {
      window.open("http://localhost:3000/host", "_blank");
    } else {
      if (!publicUrl?.startsWith("http")) {
        alert("Tunnel not ready yet!");
        return;
      }
      window.open(`${publicUrl}/player`, "_blank");
    }
  }

  async function shutdown() {
    if (!confirm("Shut down server?")) return;
    isShuttingDownRef.current = true;
    setStatus("offline");
    try {
      await fetch("/shutdown", { method: "POST" });
    } catch {}
    window.close();
  }

  const statusConfig = {
    starting: { text: "Starting", dot: styles.dotYellow },
    live: { text: "Live", dot: styles.dotGreen },
    offline: { text: "Offline", dot: styles.dotRed },
  }[status];

  if (!isLocal) return null;

  return (
    <div className={styles.root}>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logo}>GC</div>
          <div>
            <div className={styles.headerTitle}>Game Controller</div>
            <div className={styles.headerSub}>Server Monitor</div>
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.statusBadge}>
            <span className={`${styles.dot} ${statusConfig.dot}`} />
            {statusConfig.text}
          </div>
          <button className={styles.shutdownBtn} onClick={shutdown}>
            Shutdown
          </button>
        </div>
      </div>

      {/* Dashboard */}
      <div className={styles.dashboard}>

        {/* Tunnel URL Card */}
        <div className={`${styles.card} ${styles.urlCard}`}>
          <div className={styles.cardHeader}>
            <span className={styles.cardIcon}>🌐</span>
            <span className={styles.cardTitle}>Tunnel URL</span>
          </div>
          <div className={styles.urlValue}>
            {publicUrl || "Waiting for tunnel..."}
          </div>
          <div className={styles.urlActions}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={copyUrl}>
              Copy Player URL
            </button>
            <button className={`${styles.btn} ${styles.btnPurple}`} onClick={() => openPage("host")}>
              🎙️ Host Panel
            </button>
            <button className={`${styles.btn} ${styles.btnGreen}`} onClick={() => openPage("player")}>
              🎮 Player View
            </button>
          </div>
          <div className={styles.playerLink}>
            Player link: <code>{publicUrl ? `${publicUrl}/player` : "—"}</code>
          </div>
        </div>

        {/* Password Card */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardIcon}>🔒</span>
            <span className={styles.cardTitle}>Session Password</span>
          </div>
          <div className={styles.statusPill}>
            {savedPassword
              ? <><span className={`${styles.dot} ${styles.dotGreen}`} /> Active: <strong>{savedPassword}</strong></>
              : <><span className={`${styles.dot} ${styles.dotYellow}`} /> No password — anyone can join</>
            }
          </div>
          <div className={styles.inputRow}>
            <input
              className={styles.input}
              type="text"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && savePassword()}
              placeholder="Set session password..."
            />
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={savePassword}>
              {passwordSaved ? "✅" : "Set"}
            </button>
          </div>
          {savedPassword && (
            <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnFull}`} onClick={clearPassword}>
              Clear Password
            </button>
          )}
        </div>

        {/* Whitelist Card */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardIcon}>👥</span>
            <span className={styles.cardTitle}>Player Whitelist</span>
            <span className={styles.cardBadge}>{whitelist.length}</span>
          </div>
          <div className={styles.statusPill}>
            {whitelist.length === 0
              ? <><span className={`${styles.dot} ${styles.dotYellow}`} /> Open — anyone with password can join</>
              : <><span className={`${styles.dot} ${styles.dotGreen}`} /> {whitelist.length} player{whitelist.length === 1 ? "" : "s"} on the list</>
            }
          </div>
          <div className={styles.inputRow}>
            <input
              className={styles.input}
              type="text"
              value={whitelistInput}
              onChange={(e) => setWhitelistInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addToWhitelist()}
              placeholder="Add player name..."
              maxLength={20}
            />
            <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={addToWhitelist}>
              Add
            </button>
          </div>
          {whitelistError && (
            <p className={styles.errorText}>{whitelistError}</p>
          )}
          {whitelist.length > 0 && (
            <div className={styles.whitelistList}>
              {whitelist.map((name) => (
                <div key={name} className={styles.whitelistItem}>
                  <div className={styles.whitelistName}>
                    <span className={styles.avatar}>{name[0].toUpperCase()}</span>
                    {name}
                  </div>
                  <button className={styles.removeBtn} onClick={() => removeFromWhitelist(name)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Teams Card */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardIcon}>🏆</span>
            <span className={styles.cardTitle}>Teams</span>
            <span className={styles.cardBadge}>
              {teamsState.teamMode === 0 ? "Off" : `${teamsState.teamMode} Teams`}
            </span>
          </div>

          {/* Team Mode Selector */}
          <div className={styles.teamModeRow}>
            {[0, 2, 3, 4].map(mode => (
              <button
                key={mode}
                className={`${styles.btn} ${teamsState.teamMode === mode ? styles.btnPrimary : styles.btnGhost}`}
                onClick={() => setTeamMode(mode)}
              >
                {mode === 0 ? "None" : `${mode} Teams`}
              </button>
            ))}
          </div>

          {/* Team Name Editors */}
          {teamsState.teamMode > 0 && (
            <div className={styles.teamList}>
              {Object.values(teamsState.teams).map(team => (
                <div key={team.id} className={styles.teamRow} style={{ borderLeft: `3px solid ${team.color}` }}>
                  {editingTeam === team.id ? (
                    <div className={styles.inputRow}>
                      <input
                        className={styles.input}
                        value={teamNameInput}
                        onChange={e => setTeamNameInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && renameTeam(team.id, teamNameInput)}
                        autoFocus
                      />
                      <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => renameTeam(team.id, teamNameInput)}>
                        Save
                      </button>
                      <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setEditingTeam(null)}>
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className={styles.teamNameRow}>
                      <span className={styles.teamName} style={{ color: team.color }}>{team.name}</span>
                      <span className={styles.teamCount}>{team.players.length} players</span>
                      <button
                        className={styles.editBtn}
                        onClick={() => { setEditingTeam(team.id); setTeamNameInput(team.name); }}
                      >
                        ✏️
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Player Team Assignment from Whitelist */}
          {teamsState.teamMode > 0 && (
            <div className={styles.assignSection}>
              <div className={styles.assignTitle}>Assign Players</div>
              {whitelist.length === 0 ? (
                <p style={{ fontSize: 13, color: "#475569", margin: 0 }}>
                  Add players to the whitelist first
                </p>
              ) : (
                whitelist.map(playerName => {
                  const teamId = teamsState.playerTeams[playerName];
                  const team = teamId ? teamsState.teams[teamId] : null;
                  const isConnected = teamsState.players.includes(playerName);
                  return (
                    <div key={playerName} className={styles.assignRow}>
                      <div
                        className={styles.assignAvatar}
                        style={team ? { background: team.color } : {}}
                      >
                        {playerName[0].toUpperCase()}
                      </div>
                      <div className={styles.assignNameCol}>
                        <span className={styles.assignName}>{playerName}</span>
                        <span className={`${styles.assignStatus} ${isConnected ? styles.assignOnline : styles.assignOffline}`}>
                          {isConnected ? "● Online" : "○ Offline"}
                        </span>
                      </div>
                      <select
                        className={styles.teamSelect}
                        value={teamId || 0}
                        onChange={e => assignTeam(playerName, Number(e.target.value))}
                      >
                        <option value={0}>No Team</option>
                        {Object.values(teamsState.teams).map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Logs Card */}
        <div className={`${styles.card} ${styles.logsCard}`}>
          <div className={styles.cardHeader}>
            <span className={styles.cardIcon}>📜</span>
            <span className={styles.cardTitle}>Logs</span>
            <span className={styles.cardBadge}>{logs.length}</span>
          </div>
          <div className={styles.logs} ref={logsRef}>
            {logs.map((log, i) => {
              const isTunnel = log.includes("TUNNEL");
              const isError = log.includes("ERROR") || log.includes("FAILED");
              const isSuccess = log.includes("Tunnel live") || log.includes("started");
              return (
                <div
                  key={i}
                  className={`${styles.logLine} ${
                    isError ? styles.logError :
                    isSuccess ? styles.logSuccess :
                    isTunnel ? styles.logTunnel : ""
                  }`}
                >
                  {log}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}