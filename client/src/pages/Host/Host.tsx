import { useEffect, useState, useRef } from "react";
import socket from "../../socket";
import JeopardyBoard, { type PublicJeopardyBoard } from "../../components/JeopardyBoard";
import { parseCSV, resolveJeopardyImport, buildJeopardyTemplateCSV } from "../../utils/jeopardyCsv";
import styles from "./Host.module.css";

interface PlayerStat { name: string; rtt: number; }
interface Team { id: number; name: string; color: string; players: string[]; }
interface TeamsState { teamMode: number; teams: Record<number, Team>; playerTeams: Record<string, number>; }
interface QueueEntry { name: string; teamName: string | null; teamColor: string | null; reactionTime: number; }

interface FullClue { value: number; question: string; answer: string; used: boolean; }
interface FullCategory { name: string; clues: FullClue[]; }
interface FullRound { categories: FullCategory[]; }
interface FullJeopardyBoard { round: 1 | 2; rounds: Record<number, FullRound>; }
interface ActiveClue {
  round: 1 | 2; catIndex: number; clueIndex: number;
  category: string; value: number; question: string; answer: string; revealed: boolean;
}

function toPublicBoard(board: FullJeopardyBoard): PublicJeopardyBoard {
  return {
    round: board.round,
    rounds: {
      1: { categories: board.rounds[1].categories.map(c => ({ name: c.name, clues: c.clues.map(cl => ({ value: cl.value, used: cl.used, filled: !!cl.question.trim() })) })) },
      2: { categories: board.rounds[2].categories.map(c => ({ name: c.name, clues: c.clues.map(cl => ({ value: cl.value, used: cl.used, filled: !!cl.question.trim() })) })) },
    },
  };
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
  const [jeopardyBoard, setJeopardyBoard] = useState<FullJeopardyBoard | null>(null);
  const [activeClue, setActiveClue] = useState<ActiveClue | null>(null);
  const [jeopardyEditMode, setJeopardyEditMode] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

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
      if (state.jeopardyBoard) setJeopardyBoard(state.jeopardyBoard);
      if (state.activeClue !== undefined) setActiveClue(state.activeClue);
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

    socket.on("jeopardy_board_update", (pub: PublicJeopardyBoard) => {
      setJeopardyBoard(prev => {
        if (!prev) return prev;
        const rounds = { ...prev.rounds };
        for (const r of [1, 2] as const) {
          rounds[r] = {
            categories: pub.rounds[r].categories.map((pubCat, ci) => ({
              name: pubCat.name,
              clues: pubCat.clues.map((pubClue, qi) => ({
                ...prev.rounds[r].categories[ci].clues[qi],
                used: pubClue.used,
              })),
            })),
          };
        }
        return { round: pub.round, rounds };
      });
    });
    socket.on("jeopardy_clue_update", (clue: ActiveClue | null) => setActiveClue(clue));
    socket.on("jeopardy_import_done", ({ categoryCount, clueCount }: { categoryCount: number; clueCount: number }) => {
      setImportStatus(`✅ Imported ${categoryCount} categories, ${clueCount} clues`);
      setTimeout(() => setImportStatus(null), 4000);
    });

    return () => {
      socket.off("state"); socket.off("buzzer_processing"); socket.off("buzzed");
      socket.off("queue_update"); socket.off("buzzer_state"); socket.off("reset");
      socket.off("players"); socket.off("player_stats"); socket.off("teams_update");
      socket.off("screen_update"); socket.off("scores_update");
      socket.off("answer_correct"); socket.off("answer_incorrect");
      socket.off("jeopardy_board_update"); socket.off("jeopardy_clue_update"); socket.off("jeopardy_import_done");
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

  function saveJeopardyCategory(round: 1 | 2, catIndex: number, name: string) {
    socket.emit("jeopardy_save_category", { round, catIndex, name });
    setJeopardyBoard(prev => {
      if (!prev) return prev;
      const rounds = { ...prev.rounds };
      const categories = [...rounds[round].categories];
      categories[catIndex] = { ...categories[catIndex], name };
      rounds[round] = { categories };
      return { ...prev, rounds };
    });
  }

  function saveJeopardyClue(round: 1 | 2, catIndex: number, clueIndex: number, question: string, answer: string) {
    socket.emit("jeopardy_save_clue", { round, catIndex, clueIndex, question, answer });
    setJeopardyBoard(prev => {
      if (!prev) return prev;
      const rounds = { ...prev.rounds };
      const categories = [...rounds[round].categories];
      const clues = [...categories[catIndex].clues];
      clues[clueIndex] = { ...clues[clueIndex], question, answer };
      categories[catIndex] = { ...categories[catIndex], clues };
      rounds[round] = { categories };
      return { ...prev, rounds };
    });
  }

  function selectJeopardyClue(catIndex: number, clueIndex: number, value: number) {
    socket.emit("jeopardy_select_clue", { catIndex, clueIndex });
    setPointInput(String(value));
  }

  function downloadJeopardyTemplate() {
    const blob = new Blob([buildJeopardyTemplateCSV()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "jeopardy_template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCSV(reader.result as string);
      const { categories, clues, skipped } = resolveJeopardyImport(rows);

      if (categories.length === 0 && clues.length === 0) {
        alert("No valid rows found. Expected columns: round,category,value,question,answer");
        return;
      }
      const skippedNote = skipped ? ` (${skipped} row${skipped === 1 ? "" : "s"} skipped — over 5 categories/clues per round, or missing fields)` : "";
      if (!confirm(`Import ${categories.length} categories and ${clues.length} clues?${skippedNote}\n\nThis overwrites any matching cells already on the board.`)) return;

      socket.emit("jeopardy_import", { categories, clues });

      setJeopardyBoard(prev => {
        if (!prev) return prev;
        const rounds = { ...prev.rounds };
        for (const r of [1, 2] as const) {
          rounds[r] = { categories: rounds[r].categories.map(c => ({ ...c, clues: c.clues.map(cl => ({ ...cl })) })) };
        }
        for (const cat of categories) {
          rounds[cat.round].categories[cat.catIndex] = { ...rounds[cat.round].categories[cat.catIndex], name: cat.name };
        }
        for (const clue of clues) {
          const target = rounds[clue.round].categories[clue.catIndex];
          const nextClues = [...target.clues];
          nextClues[clue.clueIndex] = { ...nextClues[clue.clueIndex], question: clue.question, answer: clue.answer };
          rounds[clue.round].categories[clue.catIndex] = { ...target, clues: nextClues };
        }
        return { ...prev, rounds };
      });
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function revealJeopardyAnswer() { socket.emit("jeopardy_reveal_answer"); }
  function closeJeopardyClue() { socket.emit("jeopardy_close_clue"); }
  function setJeopardyRound(round: 1 | 2) { socket.emit("jeopardy_set_round", { round }); }
  function resetJeopardyProgress() {
    if (confirm("Reset all board progress? This unmarks every clue as unused and returns to Round 1.")) {
      socket.emit("jeopardy_reset_progress");
    }
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
                {screenTab === "jeopardy" ? (activeClue ? "clue" : "board") : (screenMode === "blank" ? "Off" : screenMode)}
              </span>
            </div>
            <div className={styles.screenPreviewContent}>
              {screenTab === "trivia" && (
                <>
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
                </>
              )}
              {screenTab === "jeopardy" && jeopardyBoard && (
                activeClue ? (
                  <div className={styles.previewAnswerWrap}>
                    <div className={styles.previewQuestionSmall}>{activeClue.category} — ${activeClue.value}</div>
                    <div className={styles.previewQuestion}>{activeClue.question}</div>
                    {activeClue.revealed && <div className={styles.previewAnswer}>✅ {activeClue.answer}</div>}
                  </div>
                ) : (
                  <JeopardyBoard board={toPublicBoard(jeopardyBoard)} />
                )
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
                <button
                  className={`${styles.screenTabBtn} ${screenTab === "jeopardy" ? styles.screenTabActive : ""}`}
                  onClick={() => { setScreenTab("jeopardy"); socket.emit("screen_tab", "jeopardy"); }}
                >
                  🧩 Jeopardy
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
              {screenTab === "jeopardy" && jeopardyBoard && (
                <div className={styles.jeopardyControls}>
                  <div className={styles.jeopardyToolbar}>
                    <div className={styles.screenTabs} style={{ padding: 0, border: "none" }}>
                      <button
                        className={`${styles.screenTabBtn} ${jeopardyBoard.round === 1 ? styles.screenTabActive : ""}`}
                        onClick={() => setJeopardyRound(1)}
                        disabled={!!activeClue}
                      >
                        Round 1
                      </button>
                      <button
                        className={`${styles.screenTabBtn} ${jeopardyBoard.round === 2 ? styles.screenTabActive : ""}`}
                        onClick={() => setJeopardyRound(2)}
                        disabled={!!activeClue}
                      >
                        Double Jeopardy
                      </button>
                    </div>
                    <button className={`${styles.screenBtn} ${styles.screenBtnPurple}`} onClick={() => setJeopardyEditMode(e => !e)}>
                      {jeopardyEditMode ? "▶️ Play" : "✏️ Edit"}
                    </button>
                    <button className={`${styles.screenBtn} ${styles.screenBtnRed}`} onClick={resetJeopardyProgress}>
                      🔄 Reset
                    </button>
                  </div>

                  {jeopardyEditMode && !activeClue && (
                    <div className={styles.jeopardyImportRow}>
                      <button className={`${styles.screenBtn} ${styles.screenBtnBlue}`} onClick={downloadJeopardyTemplate}>
                        ⬇️ Template CSV
                      </button>
                      <label className={`${styles.screenBtn} ${styles.screenBtnGreen}`}>
                        📂 Import CSV
                        <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={handleCsvImport} style={{ display: "none" }} />
                      </label>
                      {importStatus && <span className={styles.jeopardyImportStatus}>{importStatus}</span>}
                    </div>
                  )}

                  {activeClue ? (
                    <div className={styles.activeClueBox}>
                      <div className={styles.previewQuestionSmall}>{activeClue.category} — ${activeClue.value}</div>
                      <div className={styles.activeClueQuestion}>{activeClue.question}</div>
                      {activeClue.revealed && <div className={styles.previewAnswer}>✅ {activeClue.answer}</div>}
                      <div className={styles.screenBtnRow}>
                        {!activeClue.revealed && (
                          <button className={`${styles.screenBtn} ${styles.screenBtnGreen}`} onClick={revealJeopardyAnswer}>
                            ✅ Reveal
                          </button>
                        )}
                        <button className={`${styles.screenBtn} ${styles.screenBtnRed}`} onClick={closeJeopardyClue}>
                          ⏹ Close Clue
                        </button>
                      </div>
                    </div>
                  ) : jeopardyEditMode ? (
                    <div className={styles.jeopardyEditor}>
                      {jeopardyBoard.rounds[jeopardyBoard.round].categories.map((cat, catIndex) => (
                        <div key={`${jeopardyBoard.round}-cat-${catIndex}`} className={styles.jeopardyEditCategory}>
                          <input
                            className={styles.screenInput}
                            defaultValue={cat.name}
                            placeholder={`Category ${catIndex + 1}`}
                            maxLength={40}
                            onBlur={e => saveJeopardyCategory(jeopardyBoard.round, catIndex, e.target.value)}
                          />
                          {cat.clues.map((clue, clueIndex) => (
                            <div key={`${jeopardyBoard.round}-${catIndex}-${clueIndex}`} className={styles.jeopardyEditClue}>
                              <div className={styles.jeopardyEditValue}>${clue.value}</div>
                              <textarea
                                className={styles.screenTextarea}
                                defaultValue={clue.question}
                                placeholder="Question..."
                                rows={2}
                                onBlur={e => saveJeopardyClue(jeopardyBoard.round, catIndex, clueIndex, e.target.value, clue.answer)}
                              />
                              <input
                                className={styles.screenInput}
                                defaultValue={clue.answer}
                                placeholder="Answer..."
                                onBlur={e => saveJeopardyClue(jeopardyBoard.round, catIndex, clueIndex, clue.question, e.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <JeopardyBoard
                      board={toPublicBoard(jeopardyBoard)}
                      onSelectClue={(catIndex, clueIndex) =>
                        selectJeopardyClue(catIndex, clueIndex, jeopardyBoard.rounds[jeopardyBoard.round].categories[catIndex].clues[clueIndex].value)
                      }
                    />
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