import { useEffect, useState } from "react";
import socket from "../../socket";
import styles from "./Audience.module.css";

type BuzzerState = "locked" | "active" | "buzzed";

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

export default function Audience() {
  const [connected, setConnected] = useState(false);
  const [buzzerState, setBuzzerState] = useState<BuzzerState>("locked");
  const [winner, setWinner] = useState<string | null>(null);
  const [buzzQueue, setBuzzQueue] = useState<QueueEntry[]>([]);
  const [connectedPlayers, setConnectedPlayers] = useState<string[]>([]);
  const [teamsState, setTeamsState] = useState<{
    teamMode: number;
    teams: Record<number, Team>;
    playerTeams: Record<string, number>;
  }>({ teamMode: 0, teams: {}, playerTeams: {} });
  const [screenContent, setScreenContent] = useState<{
    type: "blank" | "question" | "image" | "answer";
    content: string; question: string; answer: string;
  }>({ type: "blank", content: "", question: "", answer: "" });
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notif, setNotif] = useState<string | null>(null);

  useEffect(() => {
    socket.on("auth_success", () => setConnected(true));

    socket.on("state", (state) => {
      setBuzzerState(state.buzzerState || "locked");
      setWinner(state.winner || null);
      setBuzzQueue(state.queue || []);
      if (state.players) setConnectedPlayers((state.players as string[]).filter(p => p !== "__host__"));
      if (state.teamMode !== undefined) {
        setTeamsState({ teamMode: state.teamMode, teams: state.teams || {}, playerTeams: state.playerTeams || {} });
      }
      if (state.screenContent) setScreenContent(state.screenContent);
      if (state.scores) setScores(state.scores);
    });

    socket.on("buzzer_state", (data) => {
      setBuzzerState(data.state);
      setBuzzQueue(data.queue || []);
      if (data.state === "locked" || data.state === "active") setWinner(null);
    });

    socket.on("buzzed", (data) => {
      setWinner(data.winner);
      setBuzzQueue(data.queue || []);
    });

    socket.on("queue_update", (data) => setBuzzQueue(data.queue || []));

    socket.on("reset", () => {
      setWinner(null);
      setBuzzQueue([]);
      setBuzzerState("locked");
    });

    socket.on("players", (p: string[]) => setConnectedPlayers(p.filter(n => n !== "__host__")));

    socket.on("teams_update", (data) => {
      setTeamsState({ teamMode: data.teamMode, teams: data.teams || {}, playerTeams: data.playerTeams || {} });
    });

    socket.on("screen_update", (data) => {
      setScreenContent({ type: data.type, content: data.content, question: data.question, answer: data.answer });
    });

    socket.on("scores_update", (data) => setScores(data.scores));

    socket.on("answer_correct", ({ answerer }: { answerer: string }) => {
      setNotif(`✅ ${answerer} got it right!`);
      setTimeout(() => setNotif(null), 4000);
    });

    socket.on("answer_incorrect", ({ answerer }: { answerer: string }) => {
      setNotif(`❌ ${answerer} got it wrong!`);
      setTimeout(() => setNotif(null), 4000);
    });

    socket.connect();
    socket.emit("auth", { name: "__audience__", password: "" });

    return () => {
      socket.off("auth_success"); socket.off("state"); socket.off("buzzer_state");
      socket.off("buzzed"); socket.off("queue_update"); socket.off("reset");
      socket.off("players"); socket.off("teams_update"); socket.off("screen_update");
      socket.off("scores_update"); socket.off("answer_correct"); socket.off("answer_incorrect");
    };
  }, []);

  const { teamMode, teams, playerTeams } = teamsState;
  const winnerTeamColor = winner ? teams[playerTeams[winner]]?.color : null;

  if (!connected) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingText}>Connecting...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.liveDot} />
          <span className={styles.headerTitle}>LIVE</span>
        </div>
        <div className={styles.headerRight}>
          {teamMode > 0 ? `${teamMode} Teams` : `${connectedPlayers.length} Players`}
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.mainCol}>

          {/* Screen Display */}
          <div className={styles.screenDisplay}>
            {screenContent.type === "blank" && <div className={styles.screenBlank}>Waiting for host...</div>}
            {screenContent.type === "question" && <div className={styles.screenQuestion}>{screenContent.content}</div>}
            {screenContent.type === "image" && (
              <div className={styles.screenImageWrap}>
                {screenContent.question && <div className={styles.screenQuestionSmall}>{screenContent.question}</div>}
                <img src={screenContent.content} alt="question" className={styles.screenImage} />
              </div>
            )}
            {screenContent.type === "answer" && (
              <div className={styles.screenAnswerWrap}>
                {screenContent.question && <div className={styles.screenQuestionSmall}>{screenContent.question}</div>}
                <div className={styles.screenAnswer}>✅ {screenContent.content}</div>
              </div>
            )}
          </div>

          {/* Buzzer Status */}
          {winner ? (
            <div className={styles.winnerBanner} style={winnerTeamColor ? { borderColor: winnerTeamColor } : {}}>
              🔔 <strong style={winnerTeamColor ? { color: winnerTeamColor } : {}}>{winner}</strong> buzzed in!
            </div>
          ) : (
            <div className={`${styles.statusBanner} ${buzzerState === "active" ? styles.statusActive : styles.statusLocked}`}>
              {buzzerState === "active" ? "🟢 Buzzers Open" : "🔒 Buzzers Locked"}
            </div>
          )}

          {notif && <div className={styles.notifBanner}>{notif}</div>}

          {/* Buzz Queue */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              Buzz Queue <span className={styles.cardCount}>{buzzQueue.length}</span>
            </div>
            {buzzQueue.length === 0 ? (
              <div className={styles.emptyState}>No buzzes yet</div>
            ) : (
              <div className={styles.queueList}>
                {buzzQueue.map((entry, i) => (
                  <div key={entry.name}
                    className={`${styles.queueItem} ${i === 0 ? styles.queueItemFirst : ""}`}
                    style={entry.teamColor ? { borderLeftColor: entry.teamColor } : {}}>
                    <div className={styles.queuePos}>#{i + 1}</div>
                    <div className={styles.queueAvatar} style={entry.teamColor ? { background: entry.teamColor } : {}}>
                      {entry.name[0].toUpperCase()}
                    </div>
                    <div className={styles.queueInfo}>
                      <div className={styles.queueName}>{entry.name}</div>
                      {entry.teamName && <div className={styles.queueTeam} style={{ color: entry.teamColor || undefined }}>{entry.teamName}</div>}
                    </div>
                    <div className={styles.queueTime}>{entry.reactionTime}ms</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Side Panel */}
        <div className={styles.sideCol}>

          {/* Scoreboard */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Scoreboard</div>
            <div className={styles.scoreboardList}>
              {teamMode > 0 ? (
                Object.values(teams)
                  .sort((a, b) => (scores[`team_${b.id}`] || 0) - (scores[`team_${a.id}`] || 0))
                  .map((team, i) => (
                    <div key={team.id} className={styles.scoreRow}>
                      <div className={styles.scoreRank}>#{i + 1}</div>
                      <div className={styles.scoreName} style={{ color: team.color }}>{team.name}</div>
                      <div className={styles.scoreValue}>{scores[`team_${team.id}`] || 0}</div>
                    </div>
                  ))
              ) : (
                [...connectedPlayers]
                  .sort((a, b) => (scores[b] || 0) - (scores[a] || 0))
                  .map((p, i) => (
                    <div key={p} className={styles.scoreRow}>
                      <div className={styles.scoreRank}>#{i + 1}</div>
                      <div className={styles.scoreName}>{p}</div>
                      <div className={styles.scoreValue}>{scores[p] || 0}</div>
                    </div>
                  ))
              )}
            </div>
          </div>

          {/* Players */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              Players <span className={styles.cardCount}>{connectedPlayers.length}</span>
            </div>
            {teamMode === 0 ? (
              <div className={styles.playerList}>
                {connectedPlayers.map(p => (
                  <div key={p} className={styles.playerRow}>
                    <div className={styles.playerAvatar}>{p[0].toUpperCase()}</div>
                    <div className={styles.playerRowName}>{p}</div>
                    <div className={styles.onlineDot} />
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.teamList}>
                {Object.values(teams).map(team => {
                  const teamPlayers = connectedPlayers.filter(p => playerTeams[p] === team.id);
                  return (
                    <div key={team.id} className={styles.teamGroup}>
                      <div className={styles.teamGroupHeader} style={{ borderLeft: `3px solid ${team.color}` }}>
                        <span className={styles.teamGroupName} style={{ color: team.color }}>{team.name}</span>
                        <span className={styles.teamGroupCount}>{teamPlayers.length}</span>
                      </div>
                      {teamPlayers.map(p => (
                        <div key={p} className={styles.playerRow}>
                          <div className={styles.playerAvatar} style={{ background: `linear-gradient(135deg, ${team.color}, ${team.color}99)` }}>
                            {p[0].toUpperCase()}
                          </div>
                          <div className={styles.playerRowName}>{p}</div>
                          <div className={styles.onlineDot} />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
