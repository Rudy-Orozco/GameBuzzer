import { useEffect, useState, useRef } from "react";
import socket from "../../socket";
import styles from "./Host.module.css";

interface PlayerStat { name: string; rtt: number; }
interface Team { id: number; name: string; color: string; players: string[]; }
interface TeamsState { teamMode: number; teams: Record<number, Team>; playerTeams: Record<string, number>; }
interface QueueEntry { name: string; teamName: string | null; teamColor: string | null; reactionTime: number; }

export default function Host() {
  const [winner, setWinner] = useState<string | null>(null);
  const [winnerTeam, setWinnerTeam] = useState<{ name: string; color: string } | null>(null);
  const [playerStats, setPlayerStats] = useState<Map<string, PlayerStat>>(new Map());
  const [teamsState, setTeamsState] = useState<TeamsState>({ teamMode: 0, teams: {}, playerTeams: {} });
  const [isLocal, setIsLocal] = useState(false);
  const [buzzerState, setBuzzerState] = useState<"locked" | "active" | "buzzed">("locked");
  const [buzzQueue, setBuzzQueue] = useState<QueueEntry[]>([]);
  const [processing, setProcessing] = useState(false);
  const [screenTab, setScreenTab] = useState("trivia");
  const [screenMode, setScreenMode] = useState<"blank" | "question" | "image" | "answer">("blank");
  const [triviaText, setTriviaText] = useState("");
  const [triviaAnswer, setTriviaAnswer] = useState("");
  const [triviaImage, setTriviaImage] = useState<string | null>(null);
  const [hostNotif, setHostNotif] = useState<{ type: "correct" | "incorrect"; name: string } | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [pointInput, setPointInput] = useState("100");
  const [deductOnIncorrect, setDeductOnIncorrect] = useState(true);
  const [editingScore, setEditingScore] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const local = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (!local) window.location.replace("/player");
    else setIsLocal(true);
  }, []);

  useEffect(() => {
    if (!isLocal) return;
    socket.connect();
    socket.emit("auth", { name: "__host__", password: "" });

    socket.on("state", (state) => {
      setWinner(state.winner);
      setBuzzerState(state.buzzerState || "locked");
      setBuzzQueue(state.queue || []);
      if (state.screenTab) setScreenTab(state.screenTab);
      if (state.screenContent) setScreenMode(state.screenContent.type);
      if (state.scores) setScores(state.scores);
      if (state.teamMode !== undefined) {
        setTeamsState({ teamMode: state.teamMode, teams: state.teams || {}, playerTeams: state.playerTeams || {} });
      }
      if (state.players) {
        const filtered = (state.players as string[]).filter(n => n !== "__host__");
        setPlayerStats(prev => {
          const next = new Map(prev);
          filtered.forEach(name => { if (!next.has(name)) next.set(name, { name, rtt: 0 }); });
          for (const key of next.keys()) { if (!filtered.includes(key)) next.delete(key); }
          return next;
        });
      }
    });

    socket.on("buzzer_processing", () => setProcessing(true));
    socket.on("buzzed", (data) => {
      setProcessing(false); setWinner(data.winner); setBuzzerState("buzzed"); setBuzzQueue(data.queue || []);
      if (data.teamName) setWinnerTeam({ name: data.teamName, color: data.teamColor });
      else setWinnerTeam(null);
    });
    socket.on("queue_update", (data) => setBuzzQueue(data.queue || []));
    socket.on("buzzer_state", (data) => {
      setProcessing(false); setBuzzerState(data.state); setBuzzQueue(data.queue || []);
      if (data.state !== "buzzed") { setWinner(null); setWinnerTeam(null); }
    });
    socket.on("reset", () => {
      setWinner(null); setWinnerTeam(null); setBuzzQueue([]);
      setBuzzerState("locked"); setProcessing(false);
    });
    socket.on("players", (p: string[]) => {
      const filtered = p.filter(n => n !== "__host__");
      setPlayerStats(prev => {
        const next = new Map(prev);
        filtered.forEach(name => { if (!next.has(name)) next.set(name, { name, rtt: 0 }); });
        for (const key of next.keys()) { if (!filtered.includes(key)) next.delete(key); }
        return next;
      });
    });
    socket.on("player_stats", (stats: PlayerStat[]) => {
      setPlayerStats(prev => {
        const next = new Map(prev);
        stats.forEach(stat => { if (stat.name !== "__host__") next.set(stat.name, stat); });
        return next;
      });
    });
    socket.on("teams_update", (data: TeamsState) => setTeamsState(data));
    socket.on("screen_update", (data) => { setScreenTab(data.tab); setScreenMode(data.type); });
    socket.on("scores_update", (data) => setScores(data.scores));
    socket.on("answer_correct", ({ answerer }: { answerer: string }) => {
      setHostNotif({ type: "correct", name: answerer });
      setTimeout(() => setHostNotif(null), 3000);
    });
    socket.on("answer_incorrect", ({ answerer }: { answerer: string }) => {
      setHostNotif({ type: "incorrect", name: answerer });
      setTimeout(() => setHostNotif(null), 3000);
    });

    return () => {
      socket.off("state"); socket.off("buzzer_processing"); socket.off("buzzed");
      socket.off("queue_update"); socket.off("buzzer_state"); socket.off("reset");
      socket.off("players"); socket.off("player_stats"); socket.off("teams_update");
      socket.off("screen_update"); socket.off("scores_update");
      socket.off("answer_correct"); socket.off("answer_incorrect");
    };
  }, [isLocal]);

  function activate() { socket.emit("activate"); }
  function lock() { socket.emit("lock"); }
  function reset() { socket.emit("reset"); }
  function dismissTop() { socket.emit("dismiss_top"); }
  function correct() { socket.emit("correct"); }
  function incorrect() { socket.emit("incorrect"); }
  function kick(name: string) { if (confirm(`Kick ${name}?`)) socket.emit("kick", name); }

  function awardPoints() {
    const points = parseInt(pointInput) || 0;
    socket.emit("award_points", { points });
  }
  function awardNegative() {
    const points = -(parseInt(pointInput) || 0);
    socket.emit("award_points", { points });
  }
  function setScore(key: string, value: number) {
    socket.emit("set_score", { key, value });
    setEditingScore(null);
  }
  function resetScores() {
    if (confirm("Reset all scores?")) socket.emit("reset_scores");
  }

  function pushQuestion() {
    if (!triviaText.trim()) return;
    socket.emit("screen_push", { tab: "trivia", type: "question", content: triviaText, question: triviaText, answer: triviaAnswer });
    setScreenMode("question");
  }
  function pushImage() {
    if (!triviaImage) return;
    socket.emit("screen_push", { tab: "trivia", type: "image", content: triviaImage, question: triviaText, answer: triviaAnswer });
    setScreenMode("image");
  }
  function revealAnswer() {
    if (!triviaAnswer.trim()) return;
    socket.emit("screen_push", { tab: "trivia", type: "answer", content: triviaAnswer, question: triviaText, answer: triviaAnswer });
    setScreenMode("answer");
  }
  function clearScreen() {
    socket.emit("screen_clear"); setScreenMode("blank"); setTriviaText(""); setTriviaAnswer(""); setTriviaImage(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }
  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setTriviaImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  function getRttColor(rtt: number) {
    if (rtt === 0) return styles.rttGray;
    if (rtt < 80) return styles.rttGreen;
    if (rtt < 150) return styles.rttYellow;
    return styles.rttRed;
  }
  function getRttLabel(rtt: number) { return rtt === 0 ? "—" : `${rtt}ms`; }

  const players = [...playerStats.values()];
  const { teamMode, teams, playerTeams } = teamsState;
  const unassigned = players.filter(p => !playerTeams[p.name]);
  const teamGroups = Object.values(teams).map(team => ({
    team, players: players.filter(p => playerTeams[p.name] === team.id),
  }));

  if (!isLocal) return null;

  const renderPlayerCard = (player: PlayerStat, team?: Team) => {
    const isWinner = winner === player.name;
    return (
      <div key={player.name}
        className={`${styles.playerCard} ${isWinner ? styles.playerCardWinner : ""}`}
        style={team ? { borderTop: `3px solid ${team.color}` } : {}}>
        <div className={styles.playerAvatar}
          style={team ? { background: `linear-gradient(135deg, ${team.color}, ${team.color}99)` } : {}}>
          {player.name[0].toUpperCase()}
        </div>
        <div className={styles.playerInfo}>
          <div className={styles.playerName}>{player.name}</div>
          <div className={styles.playerMeta}>
            <span className={`${styles.rttBadge} ${getRttColor(player.rtt)}`}>📶 {getRttLabel(player.rtt)}</span>
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
        <div className={styles.headerSub}>{players.length} player{players.length !== 1 ? "s" : ""} connected</div>
      </div>

      <div className={styles.body}>
        <div className={styles.mainCol}>

          {/* Screen Preview */}
          <div className={styles.screenPreview}>
            <div className={styles.screenPreviewHeader}>
              <span className={styles.sectionLabel}>Screen</span>
              <span className={`${styles.badge} ${screenMode !== "blank" ? styles.badgeLive : ""}`}>
                {screenMode === "blank" ? "Off" : screenMode}
              </span>
            </div>
            <div className={styles.screenPreviewContent}>
              {screenMode === "blank" && <div className={styles.previewBlank}>Screen is blank for players</div>}
              {screenMode === "question" && <div className={styles.previewQuestion}>{triviaText}</div>}
              {screenMode === "image" && triviaImage && (
                <div className={styles.previewImageWrap}>
                  {triviaText && <div className={styles.previewQuestionSmall}>{triviaText}</div>}
                  <img src={triviaImage} alt="preview" className={styles.previewImage} />
                </div>
              )}
              {screenMode === "answer" && (
                <div className={styles.previewAnswerWrap}>
                  {triviaText && <div className={styles.previewQuestionSmall}>{triviaText}</div>}
                  <div className={styles.previewAnswer}>✅ {triviaAnswer}</div>
                </div>
              )}
            </div>
          </div>

          {/* Controls Row */}
          <div className={styles.controlsRow}>

            {/* Buzzer */}
            <div className={styles.controlCard}>
              <div className={styles.controlCardHeader}>
                <span className={styles.sectionLabel}>Buzzer</span>
                <span className={`${styles.badge} ${
                  buzzerState === "active" ? styles.badgeGreen :
                  buzzerState === "buzzed" ? styles.badgePurple : ""
                }`}>
                  {buzzerState === "active" ? "Active" : buzzerState === "buzzed" ? "Buzzed" : "Locked"}
                </span>
              </div>
              <div className={styles.buzzerBox}
                style={winnerTeam && buzzerState === "buzzed" && !processing ? {
                  borderColor: winnerTeam.color, boxShadow: `0 0 16px ${winnerTeam.color}40`
                } : {}}>
                {buzzerState === "locked" && <div className={styles.buzzerLabel}>🔒 Locked</div>}
                {buzzerState === "active" && <div className={styles.buzzerLabel} style={{ color: "#22c55e" }}>⚡ Waiting...</div>}
                {buzzerState === "buzzed" && processing && <div className={styles.buzzerLabel}>⏳ Calculating...</div>}
                {buzzerState === "buzzed" && !processing && winner && (
                  <>
                    <div className={styles.buzzerWinner} style={winnerTeam ? { color: winnerTeam.color } : {}}>🏆 {winner}</div>
                    {winnerTeam && <div className={styles.buzzerTeam} style={{ color: winnerTeam.color }}>{winnerTeam.name}</div>}
                  </>
                )}
              </div>
              <div className={styles.buzzerBtns}>
                {buzzerState === "locked" && (
                  <button className={`${styles.ctrlBtn} ${styles.ctrlGreen}`} onClick={activate}>▶ Activate</button>
                )}
                {buzzerState === "active" && (
                  <>
                    <button className={`${styles.ctrlBtn} ${styles.ctrlYellow}`} onClick={lock}>🔒 Lock</button>
                    <button className={`${styles.ctrlBtn} ${styles.ctrlPurple}`} onClick={reset}>🔄 Reset</button>
                  </>
                )}
                {buzzerState === "buzzed" && (
                  <>
                    <button className={`${styles.ctrlBtn} ${styles.ctrlGreen}`} onClick={activate}>▶ Activate Again</button>
                    <button className={`${styles.ctrlBtn} ${styles.ctrlPurple}`} onClick={reset}>🔄 Reset</button>
                  </>
                )}
              </div>
            </div>

            {/* Queue Controller */}
            <div className={styles.controlCard}>
              <div className={styles.controlCardHeader}>
                <span className={styles.sectionLabel}>Queue Controller</span>
                <span className={styles.badge}>{buzzQueue.length}</span>
              </div>
              <div className={styles.queueControllerContent}>

                {/* Winner box — always visible */}
                <div
                  className={styles.queueControllerWinner}
                  style={
                    hostNotif && buzzQueue[0] && hostNotif.name === buzzQueue[0].name
                      ? {
                          background: hostNotif.type === "correct" ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)",
                          borderColor: hostNotif.type === "correct" ? "#22c55e" : "#ef4444"
                        }
                      : {}
                  }
                >
                  {buzzQueue.length > 0 ? (
                    <>
                      <div className={styles.queueControllerName}>{buzzQueue[0].name}</div>
                      {buzzQueue[0].teamName && (
                        <div className={styles.queueControllerTeam} style={{ color: buzzQueue[0].teamColor || undefined }}>
                          {buzzQueue[0].teamName}
                        </div>
                      )}
                      <div className={styles.queueControllerTime}>{buzzQueue[0].reactionTime}ms</div>
                    </>
                  ) : (
                    <div className={styles.queueEmpty}>No buzzes yet</div>
                  )}
                </div>

                {/* Point input — always visible */}
                <div className={styles.pointSection}>
                  <div className={styles.pointInputRow}>
                    <button className={styles.pointAdjBtn} onClick={() => setPointInput(p => String(Math.max(0, parseInt(p) - 100)))}>−</button>
                    <input
                      className={styles.pointInput}
                      type="number"
                      value={pointInput}
                      onChange={e => setPointInput(e.target.value)}
                      placeholder="pts"
                    />
                    <button className={styles.pointAdjBtn} onClick={() => setPointInput(p => String((parseInt(p) || 0) + 100))}>+</button>
                  </div>
                  <div className={styles.quickPts}>
                    {[100, 200, 300, 400, 500].map(p => (
                      <button
                        key={p}
                        className={`${styles.quickPtBtn} ${pointInput === String(p) ? styles.quickPtBtnActive : ""}`}
                        onClick={() => setPointInput(String(p))}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Action buttons — always visible, disabled when no queue */}
                <div className={styles.queueControllerBtns}>

                  <div className={styles.queueBtnRow}>
                    <button
                      className={`${styles.ctrlBtn} ${styles.ctrlGreen}`}
                      onClick={() => { correct(); awardPoints(); }}
                      disabled={buzzQueue.length === 0}
                    >
                      ✅ Correct +{pointInput}pts
                    </button>
                    <button
                      className={`${styles.ctrlBtnSide} ${styles.ctrlSideGreen}`}
                      onClick={correct}
                      disabled={buzzQueue.length === 0}
                      title="Notify correct without awarding points"
                    >
                      ✅
                    </button>
                  </div>

                  <div className={styles.queueBtnRow}>
                    <button
                      className={`${styles.ctrlBtn} ${styles.ctrlYellow}`}
                      onClick={() => { incorrect(); if (deductOnIncorrect) awardNegative(); }}
                      disabled={buzzQueue.length === 0}
                    >
                      ❌ Incorrect {deductOnIncorrect ? `-${pointInput}pts` : "(no pts)"}
                    </button>
                    <button
                      className={`${styles.ctrlBtnSide} ${styles.ctrlSideYellow}`}
                      onClick={incorrect}
                      disabled={buzzQueue.length === 0}
                      title="Notify incorrect without deducting points"
                    >
                      ❌
                    </button>
                  </div>

                  {/* Deduct toggle */}
                  <div className={styles.toggleRow} onClick={() => setDeductOnIncorrect(d => !d)}>
                    <span className={styles.toggleLabel}>Deduct points on incorrect</span>
                    <div className={`${styles.switchTrack} ${deductOnIncorrect ? styles.switchOn : styles.switchOff}`}>
                      <div className={styles.switchKnob} />
                    </div>
                  </div>

                  <button
                    className={`${styles.ctrlBtn} ${styles.ctrlRed}`}
                    onClick={dismissTop}
                    disabled={buzzQueue.length === 0}
                  >
                    ✕ Dismiss
                  </button>

                </div>

              </div>
            </div>

            {/* Screen Control */}
            <div className={styles.controlCard}>
              <div className={styles.controlCardHeader}>
                <span className={styles.sectionLabel}>Screen Control</span>
                <span className={`${styles.badge} ${screenMode !== "blank" ? styles.badgeLive : ""}`}>
                  {screenMode === "blank" ? "Off" : screenMode}
                </span>
              </div>
              <div className={styles.screenTabs}>
                <button
                  className={`${styles.screenTabBtn} ${screenTab === "trivia" ? styles.screenTabActive : ""}`}
                  onClick={() => { setScreenTab("trivia"); socket.emit("screen_tab", "trivia"); }}
                >
                  📝 Trivia
                </button>
              </div>
              {screenTab === "trivia" && (
                <div className={styles.screenControls}>
                  <textarea
                    className={styles.screenTextarea}
                    value={triviaText}
                    onChange={e => setTriviaText(e.target.value)}
                    placeholder="Type your question..."
                    rows={2}
                  />
                  <input
                    className={styles.screenInput}
                    value={triviaAnswer}
                    onChange={e => setTriviaAnswer(e.target.value)}
                    placeholder="Answer (for reveal)..."
                  />
                  <div className={styles.screenBtnRow}>
                    <button className={`${styles.screenBtn} ${styles.screenBtnBlue}`} onClick={pushQuestion}>📤 Push</button>
                    <label className={`${styles.screenBtn} ${styles.screenBtnPurple}`}>
                      🖼️ Image
                      <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
                    </label>
                    <button className={`${styles.screenBtn} ${styles.screenBtnGreen}`} onClick={revealAnswer} disabled={!triviaAnswer.trim()}>✅ Reveal</button>
                    <button className={`${styles.screenBtn} ${styles.screenBtnRed}`} onClick={clearScreen}>🗑️ Clear</button>
                  </div>
                  {triviaImage && (
                    <div className={styles.imagePreview}>
                      <img src={triviaImage} alt="preview" />
                      <button className={`${styles.screenBtn} ${styles.screenBtnPurple}`} onClick={pushImage}>Push Image</button>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Right Sidebar */}
        <div className={styles.sidebar}>

          {/* Who Buzzed */}
          <div className={styles.sideSection}>
            <div className={styles.sideSectionHeader}>
              <span className={styles.sectionLabel}>Who Buzzed</span>
              <span className={`${styles.badge} ${buzzQueue.length > 0 ? styles.badgePurple : ""}`}>{buzzQueue.length}</span>
            </div>
            {buzzQueue.length === 0 ? (
              <div className={styles.sideEmpty}>No buzzes yet</div>
            ) : (
              <div className={styles.sideQueueList}>
                {buzzQueue.map((entry, i) => (
                  <div key={entry.name}
                    className={`${styles.sideQueueItem} ${i === 0 ? styles.sideQueueFirst : ""}`}
                    style={i === 0 && entry.teamColor ? { borderLeft: `3px solid ${entry.teamColor}` } : {}}>
                    <div className={styles.queuePos}>#{i + 1}</div>
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

          <div className={styles.sideDivider} />

          {/* Scoreboard */}
          <div className={styles.sideSection}>
            <div className={styles.sideSectionHeader}>
              <span className={styles.sectionLabel}>Scoreboard</span>
              <button className={styles.resetScoresBtn} onClick={resetScores}>Reset</button>
            </div>
            <div className={styles.scoreboardList}>
              {teamMode > 0 ? (
                Object.values(teams)
                  .sort((a, b) => (scores[`team_${b.id}`] || 0) - (scores[`team_${a.id}`] || 0))
                  .map((team, i) => {
                    const key = `team_${team.id}`;
                    const score = scores[key] || 0;
                    return (
                      <div key={team.id} className={styles.scoreRow}>
                        <div className={styles.scoreRank}>#{i + 1}</div>
                        <div className={styles.scoreName} style={{ color: team.color }}>{team.name}</div>
                        {editingScore === key ? (
                          <input
                            className={styles.scoreEditInput}
                            type="number"
                            defaultValue={score}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === "Enter") setScore(key, parseInt((e.target as HTMLInputElement).value) || 0);
                              if (e.key === "Escape") setEditingScore(null);
                            }}
                            onBlur={() => setEditingScore(null)}
                          />
                        ) : (
                          <div className={styles.scoreValue} onClick={() => setEditingScore(key)}>
                            {score}
                          </div>
                        )}
                      </div>
                    );
                  })
              ) : (
                [...players]
                  .sort((a, b) => (scores[b.name] || 0) - (scores[a.name] || 0))
                  .map((player, i) => {
                    const key = player.name;
                    const score = scores[key] || 0;
                    return (
                      <div key={player.name} className={styles.scoreRow}>
                        <div className={styles.scoreRank}>#{i + 1}</div>
                        <div className={styles.scoreName}>{player.name}</div>
                        {editingScore === key ? (
                          <input
                            className={styles.scoreEditInput}
                            type="number"
                            defaultValue={score}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === "Enter") setScore(key, parseInt((e.target as HTMLInputElement).value) || 0);
                              if (e.key === "Escape") setEditingScore(null);
                            }}
                            onBlur={() => setEditingScore(null)}
                          />
                        ) : (
                          <div className={styles.scoreValue} onClick={() => setEditingScore(key)}>
                            {score}
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          <div className={styles.sideDivider} />

          {/* Players */}
          <div className={styles.sideSection} style={{ flex: 1, overflow: "hidden" }}>
            <div className={styles.sideSectionHeader}>
              <span className={styles.sectionLabel}>Players</span>
              <span className={styles.badge}>{players.length}</span>
            </div>
            <div className={styles.sidePlayerList}>
              {players.length === 0 ? (
                <div className={styles.sideEmpty}>No players connected</div>
              ) : teamMode === 0 ? (
                players.map(p => renderPlayerCard(p))
              ) : (
                <>
                  {teamGroups.map(({ team, players: tp }) => (
                    <div key={team.id} className={styles.sideTeamGroup}>
                      <div className={styles.sideTeamHeader} style={{ borderLeft: `3px solid ${team.color}` }}>
                        <span style={{ color: team.color }}>{team.name}</span>
                        <span className={styles.badge}>{tp.length}</span>
                      </div>
                      {tp.map(p => renderPlayerCard(p, team))}
                    </div>
                  ))}
                  {unassigned.length > 0 && (
                    <div className={styles.sideTeamGroup}>
                      <div className={styles.sideTeamHeader} style={{ borderLeft: "3px solid #334155" }}>
                        <span style={{ color: "#64748b" }}>Unassigned</span>
                        <span className={styles.badge}>{unassigned.length}</span>
                      </div>
                      {unassigned.map(p => renderPlayerCard(p))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}