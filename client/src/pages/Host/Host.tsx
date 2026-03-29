import { useEffect, useState } from "react";
import socket from "../../socket";
import styles from "./Host.module.css";

interface PlayerStat {
  name: string;
  rtt: number;
}

interface Team {
  id: number;
  name: string;
  color: string;
  players: string[];
}

interface TeamsState {
  teamMode: number;
  teams: Record<number, Team>;
  playerTeams: Record<string, number>;
}

interface QueueEntry {
  name: string;
  teamName: string | null;
  teamColor: string | null;
  reactionTime: number;
}

export default function Host() {
  const [winner, setWinner] = useState<string | null>(null);
  const [winnerTeam, setWinnerTeam] = useState<{ name: string; color: string } | null>(null);
  const [playerStats, setPlayerStats] = useState<Map<string, PlayerStat>>(new Map());
  const [teamsState, setTeamsState] = useState<TeamsState>({ teamMode: 0, teams: {}, playerTeams: {} });
  const [isLocal, setIsLocal] = useState(false);
  const [buzzerState, setBuzzerState] = useState<"locked" | "active" | "buzzed">("locked");
  const [buzzQueue, setBuzzQueue] = useState<QueueEntry[]>([]);
  const [processing, setProcessing] = useState(false);

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

  useEffect(() => {
    if (!isLocal) return;

    socket.connect(); // host connects immediately
    socket.emit("auth", { name: "__host__", password: "" });

    socket.on("state", (state) => {
      setWinner(state.winner);
      setBuzzerState(state.buzzerState || "locked");
      setBuzzQueue(state.queue || []);
      if (state.teamMode !== undefined) {
        setTeamsState({
          teamMode: state.teamMode,
          teams: state.teams || {},
          playerTeams: state.playerTeams || {},
        });
      }
      if (state.players) {
        const filtered = (state.players as string[]).filter(n => n !== "__host__");
        setPlayerStats(prev => {
          const next = new Map(prev);
          filtered.forEach(name => {
            if (!next.has(name)) next.set(name, { name, rtt: 0 });
          });
          for (const key of next.keys()) {
            if (!filtered.includes(key)) next.delete(key);
          }
          return next;
        });
      }
    });

    socket.on("buzzer_processing", () => {
      setProcessing(true);
    });

    socket.on("buzzed", (data) => {
      setProcessing(false);
      setWinner(data.winner);
      setBuzzerState("buzzed");
      setBuzzQueue(data.queue || []);
      if (data.teamName) setWinnerTeam({ name: data.teamName, color: data.teamColor });
      else setWinnerTeam(null);
    });

    socket.on("queue_update", (data) => {
      setBuzzQueue(data.queue || []);
    });

    socket.on("buzzer_state", (data) => {
      setProcessing(false);
      setBuzzerState(data.state);
      setBuzzQueue(data.queue || []);
      if (data.state !== "buzzed") {
        setWinner(null);
        setWinnerTeam(null);
      }
    });

    socket.on("reset", () => {
      setWinner(null);
      setWinnerTeam(null);
      setBuzzQueue([]);
      setBuzzerState("locked");
      setProcessing(false);
    });

    socket.on("players", (p: string[]) => {
      const filtered = p.filter(n => n !== "__host__");
      setPlayerStats(prev => {
        const next = new Map(prev);
        filtered.forEach(name => {
          if (!next.has(name)) next.set(name, { name, rtt: 0 });
        });
        for (const key of next.keys()) {
          if (!filtered.includes(key)) next.delete(key);
        }
        return next;
      });
    });

    socket.on("player_stats", (stats: PlayerStat[]) => {
      setPlayerStats(prev => {
        const next = new Map(prev);
        stats.forEach(stat => {
          if (stat.name !== "__host__") next.set(stat.name, stat);
        });
        return next;
      });
    });

    socket.on("teams_update", (data: TeamsState) => {
      setTeamsState(data);
    });

    return () => {
      socket.off("state");
      socket.off("buzzer_processing");
      socket.off("buzzed");
      socket.off("queue_update");
      socket.off("buzzer_state");
      socket.off("reset");
      socket.off("players");
      socket.off("player_stats");
      socket.off("teams_update");
    };
  }, [isLocal]);

  function activate() { socket.emit("activate"); }
  function lock() { socket.emit("lock"); }
  function reset() { socket.emit("reset"); }
  function dismissTop() { socket.emit("dismiss_top"); }
  function correct() { socket.emit("correct"); }
  function incorrect() { socket.emit("incorrect"); }
  function kick(name: string) {
    if (confirm(`Kick ${name}?`)) socket.emit("kick", name);
  }

  function getRttColor(rtt: number) {
    if (rtt === 0) return styles.rttGray;
    if (rtt < 80) return styles.rttGreen;
    if (rtt < 150) return styles.rttYellow;
    return styles.rttRed;
  }

  function getRttLabel(rtt: number) {
    if (rtt === 0) return "—";
    return `${rtt}ms`;
  }

  const players = [...playerStats.values()];
  const { teamMode, teams, playerTeams } = teamsState;
  const unassigned = players.filter(p => !playerTeams[p.name]);
  const teamGroups = Object.values(teams).map(team => ({
    team,
    players: players.filter(p => playerTeams[p.name] === team.id),
  }));

  if (!isLocal) return null;

  const renderPlayerCard = (player: PlayerStat, team?: Team) => {
    const isWinner = winner === player.name;
    return (
      <div
        key={player.name}
        className={`${styles.playerCard} ${isWinner ? styles.playerCardWinner : ""}`}
        style={team ? { borderTop: `3px solid ${team.color}` } : {}}
      >
        <div
          className={styles.playerAvatar}
          style={team ? { background: `linear-gradient(135deg, ${team.color}, ${team.color}99)` } : {}}
        >
          {player.name[0].toUpperCase()}
        </div>
        <div className={styles.playerInfo}>
          <div className={styles.playerName}>{player.name}</div>
          <div className={styles.playerMeta}>
            <span className={`${styles.rttBadge} ${getRttColor(player.rtt)}`}>
              📶 {getRttLabel(player.rtt)}
            </span>
            {isWinner && <span className={styles.winnerBadge}>🏆 Buzzed</span>}
          </div>
        </div>
        <button className={styles.kickBtn} onClick={() => kick(player.name)} title="Kick">✕</button>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>Host Panel</div>
        <div className={styles.headerSub}>
          {players.length} player{players.length !== 1 ? "s" : ""} connected
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.leftCol}>

          {/* Buzzer Box */}
          <div
            className={`${styles.buzzerBox} ${
              buzzerState === "active" ? styles.buzzerActive :
              buzzerState === "buzzed" ? styles.buzzerBuzzed : ""
            }`}
            style={winnerTeam && buzzerState === "buzzed" && !processing ? {
              borderColor: winnerTeam.color,
              boxShadow: `0 0 20px ${winnerTeam.color}40`
            } : {}}
          >
            {buzzerState === "locked" && (
              <>
                <div className={styles.buzzerLabel}>Buzzer Locked</div>
                <div className={styles.buzzerIdle}>🔒 Press Activate to start</div>
              </>
            )}
            {buzzerState === "active" && (
              <>
                <div className={styles.buzzerLabel}>Buzzer Active</div>
                <div className={styles.buzzerIdle} style={{ color: "#22c55e" }}>⚡ Waiting for buzz...</div>
              </>
            )}
            {buzzerState === "buzzed" && processing && (
              <>
                <div className={styles.buzzerLabel}>Calculating...</div>
                <div className={styles.buzzerProcessing}>⏳</div>
              </>
            )}
            {buzzerState === "buzzed" && !processing && winner && (
              <>
                <div className={styles.buzzerLabel}>Buzzed In</div>
                <div className={styles.buzzerWinner} style={winnerTeam ? { color: winnerTeam.color } : {}}>
                  🏆 {winner}
                </div>
                {winnerTeam && (
                  <div className={styles.buzzerTeam} style={{ color: winnerTeam.color }}>
                    {winnerTeam.name}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Controls */}
          <div className={styles.controls}>
            {buzzerState === "locked" && (
              <button className={`${styles.controlBtn} ${styles.activateBtn}`} onClick={activate}>
                ▶ Activate
              </button>
            )}
            {buzzerState === "active" && (
              <>
                <button className={`${styles.controlBtn} ${styles.lockBtn}`} onClick={lock}>
                  🔒 Lock
                </button>
                <button className={`${styles.controlBtn} ${styles.resetBtn}`} onClick={reset}>
                  🔄 Reset
                </button>
              </>
            )}
            {buzzerState === "buzzed" && (
              <>
                <button className={`${styles.controlBtn} ${styles.activateBtn}`} onClick={activate}>
                  ▶ Activate Again
                </button>
                <button className={`${styles.controlBtn} ${styles.resetBtn}`} onClick={reset}>
                  🔄 Reset
                </button>
              </>
            )}
          </div>

          {/* Queue */}
          <div className={styles.queueCard}>
            <div className={styles.queueHeader}>
              <span>Buzz Queue</span>
              <span className={styles.queueCount}>{buzzQueue.length}</span>
            </div>
            {buzzQueue.length === 0 ? (
              <div className={styles.queueEmpty}>No buzzes yet</div>
            ) : (
              <div className={styles.queueList}>
                {buzzQueue.map((entry, i) => (
                  <div
                    key={entry.name}
                    className={`${styles.queueItem} ${i === 0 ? styles.queueItemFirst : ""}`}
                    style={i === 0 && entry.teamColor ? { borderLeft: `3px solid ${entry.teamColor}` } : {}}
                  >
                    <div className={styles.queuePos}>#{i + 1}</div>
                    <div className={styles.queueInfo}>
                      <div className={styles.queueName}>{entry.name}</div>
                      {entry.teamName && (
                        <div className={styles.queueTeam} style={{ color: entry.teamColor || undefined }}>
                          {entry.teamName}
                        </div>
                      )}
                    </div>
                    <div className={styles.queueTime}>{entry.reactionTime}ms</div>
                    {i === 0 && (
                      <div className={styles.queueActions}>
                        <button className={styles.correctBtn} onClick={correct} title="Correct">✅</button>
                        <button className={styles.incorrectBtn} onClick={incorrect} title="Incorrect">❌</button>
                        <button className={styles.dismissBtn} onClick={dismissTop} title="Dismiss">✕</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Right — Players */}
        <div className={styles.rightCol}>
          {players.length === 0 ? (
            <div className={styles.emptyState}>No players connected yet</div>
          ) : teamMode === 0 ? (
            <>
              <div className={styles.sectionTitle}>Connected Players</div>
              <div className={styles.playerGrid}>
                {players.map(p => renderPlayerCard(p))}
              </div>
            </>
          ) : (
            <div
              className={styles.teamsGrid}
              style={{ gridTemplateColumns: `repeat(${teamGroups.length + (unassigned.length > 0 ? 1 : 0)}, 1fr)` }}
            >
              {teamGroups.map(({ team, players: teamPlayers }) => (
                <div key={team.id} className={styles.teamColumn}>
                  <div className={styles.teamHeader} style={{ borderBottom: `2px solid ${team.color}` }}>
                    <div className={styles.teamDot} style={{ background: team.color }} />
                    <span className={styles.teamHeaderName} style={{ color: team.color }}>{team.name}</span>
                    <span className={styles.teamHeaderCount}>{teamPlayers.length}</span>
                  </div>
                  <div className={styles.teamPlayerList}>
                    {teamPlayers.length === 0 ? (
                      <div className={styles.teamEmpty}>No players</div>
                    ) : (
                      teamPlayers.map(p => renderPlayerCard(p, team))
                    )}
                  </div>
                </div>
              ))}
              {unassigned.length > 0 && (
                <div className={styles.teamColumn}>
                  <div className={styles.teamHeader} style={{ borderBottom: "2px solid #334155" }}>
                    <div className={styles.teamDot} style={{ background: "#334155" }} />
                    <span className={styles.teamHeaderName} style={{ color: "#64748b" }}>Unassigned</span>
                    <span className={styles.teamHeaderCount}>{unassigned.length}</span>
                  </div>
                  <div className={styles.teamPlayerList}>
                    {unassigned.map(p => renderPlayerCard(p))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}