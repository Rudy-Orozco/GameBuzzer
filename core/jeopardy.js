const state = require("./state");

function publicRound(round) {
  return {
    categories: round.categories.map(cat => ({
      name: cat.name,
      clues: cat.clues.map(c => ({ value: c.value, used: c.used })),
    })),
  };
}

function publicJeopardyBoard(board) {
  return {
    round: board.round,
    rounds: { 1: publicRound(board.rounds[1]), 2: publicRound(board.rounds[2]) },
  };
}

function emitPublicBoard(io) {
  io.emit("jeopardy_board_update", publicJeopardyBoard(state.jeopardyBoard));
}

function registerJeopardyEvents(socket, io) {
  socket.on("jeopardy_save_category", ({ round, catIndex, name }) => {
    if (!socket.data.authed || socket.data.name !== "__host__") return;
    const cat = state.jeopardyBoard.rounds[round]?.categories[catIndex];
    if (!cat) return;
    cat.name = (name || "").slice(0, 40);
    state.saveJeopardyBoard();
    emitPublicBoard(io);
  });

  socket.on("jeopardy_save_clue", ({ round, catIndex, clueIndex, question, answer }) => {
    if (!socket.data.authed || socket.data.name !== "__host__") return;
    const clue = state.jeopardyBoard.rounds[round]?.categories[catIndex]?.clues[clueIndex];
    if (!clue) return;
    clue.question = question || "";
    clue.answer = answer || "";
    state.saveJeopardyBoard();
    emitPublicBoard(io);
  });

  socket.on("jeopardy_select_clue", ({ catIndex, clueIndex }) => {
    if (!socket.data.authed || socket.data.name !== "__host__") return;
    if (state.activeClue) return;
    const round = state.jeopardyBoard.round;
    const cat = state.jeopardyBoard.rounds[round]?.categories[catIndex];
    const clue = cat?.clues[clueIndex];
    if (!cat || !clue || clue.used || !clue.question.trim()) return;

    state.activeClue = {
      round, catIndex, clueIndex,
      category: cat.name, value: clue.value,
      question: clue.question, answer: clue.answer,
      revealed: false,
    };
    io.emit("jeopardy_clue_update", state.activeClue);
  });

  socket.on("jeopardy_reveal_answer", () => {
    if (!socket.data.authed || socket.data.name !== "__host__") return;
    if (!state.activeClue) return;
    state.activeClue = { ...state.activeClue, revealed: true };
    io.emit("jeopardy_clue_update", state.activeClue);
  });

  socket.on("jeopardy_close_clue", () => {
    if (!socket.data.authed || socket.data.name !== "__host__") return;
    if (!state.activeClue) return;
    const { round, catIndex, clueIndex } = state.activeClue;
    const clue = state.jeopardyBoard.rounds[round]?.categories[catIndex]?.clues[clueIndex];
    if (clue) clue.used = true;
    state.activeClue = null;
    state.saveJeopardyBoard();
    emitPublicBoard(io);
    io.emit("jeopardy_clue_update", null);
  });

  socket.on("jeopardy_set_round", ({ round }) => {
    if (!socket.data.authed || socket.data.name !== "__host__") return;
    if (round !== 1 && round !== 2) return;
    if (state.activeClue) return;
    state.jeopardyBoard.round = round;
    state.saveJeopardyBoard();
    emitPublicBoard(io);
  });

  socket.on("jeopardy_import", ({ categories, clues }) => {
    if (!socket.data.authed || socket.data.name !== "__host__") return;
    if (!Array.isArray(categories) || !Array.isArray(clues)) return;

    let categoryCount = 0;
    for (const { round, catIndex, name } of categories) {
      const cat = state.jeopardyBoard.rounds[round]?.categories[catIndex];
      if (!cat) continue;
      cat.name = (name || "").slice(0, 40);
      categoryCount++;
    }

    let clueCount = 0;
    for (const { round, catIndex, clueIndex, question, answer } of clues) {
      const clue = state.jeopardyBoard.rounds[round]?.categories[catIndex]?.clues[clueIndex];
      if (!clue) continue;
      clue.question = question || "";
      clue.answer = answer || "";
      clueCount++;
    }

    state.saveJeopardyBoard();
    emitPublicBoard(io);
    socket.emit("jeopardy_import_done", { categoryCount, clueCount });
  });

  socket.on("jeopardy_reset_progress", () => {
    if (!socket.data.authed || socket.data.name !== "__host__") return;
    for (const round of [1, 2]) {
      for (const cat of state.jeopardyBoard.rounds[round].categories) {
        for (const clue of cat.clues) clue.used = false;
      }
    }
    state.jeopardyBoard.round = 1;
    state.activeClue = null;
    state.saveJeopardyBoard();
    emitPublicBoard(io);
    io.emit("jeopardy_clue_update", null);
  });
}

module.exports = { registerJeopardyEvents, publicJeopardyBoard };
