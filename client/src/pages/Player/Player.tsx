import { useEffect, useState } from "react";
import socket from "../../socket";
import styles from "./Player.module.css";

type GameState = "login" | "playing" | "kicked";

interface QueueEntry {
  name: string;
  teamName: string | null;
  teamColor: string | null;
  reactionTime: number;
}

interface Team {
  id: number;
  name: string;
  color: string;
  players: string[];
}

export default function Player() {
  const [gameState, setGameState] = useState<GameState>("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [buzzerState, setBuzzerState] = useState<"locked" | "active">("locked");
  const [buzzedBy, setBuzzedBy] = useState<string | null>(null);
  const [myPosition, setMyPosition] = useState<number | null>(null);
  const [hasBuzzed, setHasBuzzed] = useState(false);
  const [outOfQueue, setOutOfQueue] = useState(false);
  const [activatedAt, setActivatedAt] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [answerResult, setAnswerResult] = useState<{ correct: boolean; message: string } | null>(null);
  const [incorrectNotif, setIncorrectNotif] = useState<string | null>(null);
  const [buzzQueue, setBuzzQueue] = useState<QueueEntry[]>([]);
  const [connectedPlayers, setConnectedPlayers] = useState<string[]>([]);
  const [teamsState, setTeamsState] = useState<{
    teamMode: number;
    teams: Record<number, Team>;
    playerTeams: Record<string, number>;
  }>({ teamMode: 0, teams: {}, playerTeams: {} });

  useEffect(() => {
    socket.on("auth_success", () => {
      setGameState("playing");
      setAuthError("");
    });

    socket.on("auth_failed", ({ reason }: { reason: string }) => {
      setAuthError(reason);
    });

    socket.on("state", (state) => {
      if (state.buzzerState === "active" || state.buzzerState === "buzzed") {
        setBuzzerState("active");
        if (state.buzzerState === "active") setActivatedAt(Date.now());
      } else {
        setBuzzerState("locked");
      }
      if (state.winner) setBuzzedBy(state.winner);
      setBuzzQueue(state.queue || []);
      if (state.players) setConnectedPlayers((state.players as string[]).filter(p => p !== "__host__"));
      if (state.teamMode !== undefined) {
        setTeamsState({
          teamMode: state.teamMode,
          teams: state.teams || {},
          playerTeams: state.playerTeams || {},
        });
      }
    });

    socket.on("buzzer_state", (data) => {
      if (data.state === "active" || data.state === "buzzed") {
        setBuzzerState("active");
        if (data.state === "active") setActivatedAt(Date.now());
      } else {
        setBuzzerState("locked");
      }
      if (data.state === "locked" || data.state === "active") {
        setBuzzedBy(null);
        setMyPosition(null);
        setHasBuzzed(false);
        setOutOfQueue(false);
        setProcessing(false);
      }
      setBuzzQueue(data.queue || []);
    });

    socket.on("buzzer_processing", () => {
      setProcessing(true);
    });

    socket.on("buzzed", (data) => {
      setProcessing(false);
      setBuzzedBy(data.winner);
      setBuzzQueue(data.queue || []);
      const pos = data.queue?.findIndex((e: QueueEntry) => e.name === name);
      if (pos !== undefined && pos >= 0) {
        setMyPosition(pos + 1);
        setHasBuzzed(true);
      }
    });

    socket.on("queue_update", (data) => {
      setBuzzQueue(data.queue || []);
      const pos = data.queue?.findIndex((e: QueueEntry) => e.name === name);
      if (pos !== undefined && pos >= 0) {
        setMyPosition(pos + 1);
      }
    });

    socket.on("my_position", ({ position }: { position: number }) => {
      setMyPosition(position);
      setHasBuzzed(true);
    });

    socket.on("reset", () => {
      setBuzzedBy(null);
      setMyPosition(null);
      setHasBuzzed(false);
      setOutOfQueue(false);
      setProcessing(false);
      setBuzzQueue([]);
    });

    socket.on("dismissed_from_queue", () => {
      setHasBuzzed(false);
      setMyPosition(null);
      setBuzzedBy(null);
      setOutOfQueue(true);
    });

    socket.on("players", (p: string[]) => {
      setConnectedPlayers(p.filter(n => n !== "__host__"));
    });

    socket.on("teams_update", (data) => {
      setTeamsState({
        teamMode: data.teamMode,
        teams: data.teams || {},
        playerTeams: data.playerTeams || {},
      });
    });

    socket.on("answer_result", (data: { correct: boolean; message: string }) => {
      setAnswerResult(data);
      setTimeout(() => setAnswerResult(null), 4000);
    });

    socket.on("answer_correct", ({ answerer }: { answerer: string }) => {
      if (answerer !== name) {
        setIncorrectNotif(`✅ ${answerer} got it right!`);
        setTimeout(() => setIncorrectNotif(null), 4000);
      }
    });

    socket.on("answer_incorrect", ({ answerer }: { answerer: string }) => {
      if (answerer !== name) {
        setIncorrectNotif(`❌ ${answerer} got it wrong!`);
        setTimeout(() => setIncorrectNotif(null), 4000);
      }
    });

    socket.on("kicked", () => setGameState("kicked"));

    socket.on("ping_check", (start: number, callback: Function) => {
      callback(start);
    });

    return () => {
      socket.off("auth_success");
      socket.off("auth_failed");
      socket.off("state");
      socket.off("buzzer_state");
      socket.off("buzzer_processing");
      socket.off("buzzed");
      socket.off("queue_update");
      socket.off("my_position");
      socket.off("reset");
      socket.off("dismissed_from_queue");
      socket.off("players");
      socket.off("teams_update");
      socket.off("answer_result");
      socket.off("answer_correct");
      socket.off("answer_incorrect");
      socket.off("kicked");
      socket.off("ping_check");
    };
  }, [name]);

  function join() {
    if (!name.trim()) { setAuthError("Please enter a name."); return; }
    setAuthError("");
    socket.connect(); // connect now
    socket.emit("auth", { name: name.trim(), password });
  }
  
  function buzz() {
    if (buzzerState !== "active") return;
    if (hasBuzzed || outOfQueue) return;
    const reactionTime = activatedAt ? Date.now() - activatedAt : 0;
    socket.emit("buzz", { clientTime: Date.now(), reactionTime });
    setHasBuzzed(true);
  }

  const { teamMode, teams, playerTeams } = teamsState;

  if (gameState === "kicked") {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>You have been kicked.</h1>
        <p className={styles.status}>Contact the host to rejoin.</p>
      </div>
    );
  }

  if (gameState === "login") {
    return (
      <div className={styles.loginContainer}>
        <div className={styles.loginCard}>
          <h1 className={styles.loginTitle}>Join Game</h1>
          <input
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && join()}
            placeholder="Your name..."
            maxLength={20}
            autoFocus
          />
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && join()}
            placeholder="Session password..."
          />
          {authError && <p className={styles.error}>{authError}</p>}
          <button className={styles.joinBtn} onClick={join}>Join</button>
        </div>
      </div>
    );
  }

  // Group players by team for leaderboard
  const teamGroups = teamMode > 0
    ? Object.values(teams).map(team => ({
        team,
        players: connectedPlayers.filter(p => playerTeams[p] === team.id),
      }))
    : [];
  const unassigned = teamMode > 0
    ? connectedPlayers.filter(p => !playerTeams[p])
    : connectedPlayers;

return (
    <div className={styles.container}>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerName}>{name}</div>
        {teamMode > 0 && playerTeams[name] && teams[playerTeams[name]] && (
          <div
            className={styles.headerTeam}
            style={{ background: `${teams[playerTeams[name]].color}20`, color: teams[playerTeams[name]].color }}
          >
            {teams[playerTeams[name]].name}
          </div>
        )}
      </div>

      <div className={styles.content}>

        {/* Left — Buzzer */}
        <div className={styles.buzzerCol}>
          <button
            className={`${styles.buzzBtn} ${
              buzzerState === "locked" || outOfQueue ? styles.buzzLocked :
              hasBuzzed ? styles.buzzWinner :
              styles.buzzActive
            }`}
            onClick={buzz}
            disabled={buzzerState === "locked" || hasBuzzed || outOfQueue}
          >
            {buzzerState === "locked" || outOfQueue
              ? "LOCKED"
              : processing && !hasBuzzed
              ? "⏳"
              : hasBuzzed
              ? "YOU BUZZED!"
              : "BUZZ"}
          </button>

          {answerResult && (
            <div className={`${styles.answerResult} ${answerResult.correct ? styles.answerCorrect : styles.answerIncorrect}`}>
              {answerResult.message}
            </div>
          )}

          {incorrectNotif && !answerResult && (
            <div className={styles.notification}>{incorrectNotif}</div>
          )}

          {buzzedBy && !hasBuzzed && !answerResult && (
            <div className={styles.notification}>
              🔔 <strong>{buzzedBy}</strong> buzzed in first!
            </div>
          )}

          <p className={styles.status}>
            {outOfQueue
              ? "You are out of the queue"
              : buzzerState === "locked"
              ? "Waiting for host..."
              : hasBuzzed
              ? myPosition === 1
                ? "🎉 You're first!"
                : myPosition
                ? `You're #${myPosition} in queue`
                : "You buzzed — waiting..."
              : processing
              ? "Someone buzzed..."
              : "Press now!"}
          </p>
        </div>

        {/* Right — Side Panel */}
        <div className={styles.sidePanel}>

          {/* Queue */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              Buzz Queue
              <span className={styles.cardCount}>{buzzQueue.length}</span>
            </div>
            {buzzQueue.length === 0 ? (
              <div className={styles.emptyState}>No buzzes yet</div>
            ) : (
              <div className={styles.queueList}>
                {buzzQueue.map((entry, i) => (
                  <div
                    key={entry.name}
                    className={`${styles.queueItem} ${entry.name === name ? styles.queueItemMe : ""} ${i === 0 ? styles.queueItemFirst : ""}`}
                    style={i === 0 && entry.teamColor ? { borderLeft: `3px solid ${entry.teamColor}` } : {}}
                  >
                    <div className={styles.queuePos}>#{i + 1}</div>
                    <div className={styles.queueAvatar} style={entry.teamColor ? { background: entry.teamColor } : {}}>
                      {entry.name[0].toUpperCase()}
                    </div>
                    <div className={styles.queueInfo}>
                      <div className={styles.queueName}>
                        {entry.name}
                        {entry.name === name && <span className={styles.youTag}> (you)</span>}
                      </div>
                      {entry.teamName && (
                        <div className={styles.queueTeam} style={{ color: entry.teamColor || undefined }}>
                          {entry.teamName}
                        </div>
                      )}
                    </div>
                    <div className={styles.queueTime}>{entry.reactionTime}ms</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Players */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              Players
              <span className={styles.cardCount}>{connectedPlayers.length}</span>
            </div>
            {teamMode === 0 ? (
              <div className={styles.playerList}>
                {connectedPlayers.map(p => (
                  <div key={p} className={`${styles.playerRow} ${p === name ? styles.playerRowMe : ""}`}>
                    <div className={styles.playerAvatar}>{p[0].toUpperCase()}</div>
                    <div className={styles.playerRowName}>
                      {p}
                      {p === name && <span className={styles.youTag}> (you)</span>}
                    </div>
                    <div className={styles.onlineDot} />
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.teamList}>
                {teamGroups.map(({ team, players: teamPlayers }) => (
                  <div key={team.id} className={styles.teamGroup}>
                    <div className={styles.teamGroupHeader} style={{ borderLeft: `3px solid ${team.color}` }}>
                      <span className={styles.teamGroupName} style={{ color: team.color }}>{team.name}</span>
                      <span className={styles.teamGroupCount}>{teamPlayers.length}</span>
                    </div>
                    {teamPlayers.map(p => (
                      <div key={p} className={`${styles.playerRow} ${p === name ? styles.playerRowMe : ""}`}>
                        <div className={styles.playerAvatar} style={{ background: `linear-gradient(135deg, ${team.color}, ${team.color}99)` }}>
                          {p[0].toUpperCase()}
                        </div>
                        <div className={styles.playerRowName}>
                          {p}
                          {p === name && <span className={styles.youTag}> (you)</span>}
                        </div>
                        <div className={styles.onlineDot} />
                      </div>
                    ))}
                  </div>
                ))}
                {unassigned.length > 0 && (
                  <div className={styles.teamGroup}>
                    <div className={styles.teamGroupHeader} style={{ borderLeft: "3px solid #334155" }}>
                      <span className={styles.teamGroupName} style={{ color: "#64748b" }}>Unassigned</span>
                      <span className={styles.teamGroupCount}>{unassigned.length}</span>
                    </div>
                    {unassigned.map(p => (
                      <div key={p} className={`${styles.playerRow} ${p === name ? styles.playerRowMe : ""}`}>
                        <div className={styles.playerAvatar}>{p[0].toUpperCase()}</div>
                        <div className={styles.playerRowName}>
                          {p}
                          {p === name && <span className={styles.youTag}> (you)</span>}
                        </div>
                        <div className={styles.onlineDot} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}