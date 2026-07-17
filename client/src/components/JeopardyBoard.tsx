import styles from "./JeopardyBoard.module.css";

export interface PublicClue { value: number; used: boolean; filled?: boolean; }
export interface PublicCategory { name: string; clues: PublicClue[]; }
export interface PublicRound { categories: PublicCategory[]; }
export interface PublicJeopardyBoard { round: 1 | 2; rounds: Record<number, PublicRound>; }

interface Props {
  board: PublicJeopardyBoard;
  onSelectClue?: (catIndex: number, clueIndex: number) => void;
  selectionDisabled?: boolean;
}

export default function JeopardyBoard({ board, onSelectClue, selectionDisabled }: Props) {
  const round = board.rounds[board.round];
  if (!round) return null;

  return (
    <div className={styles.board} style={{ gridTemplateColumns: `repeat(${round.categories.length}, 1fr)` }}>
      {round.categories.map((cat, catIndex) => (
        <div key={catIndex} className={styles.categoryHeader}>
          {cat.name || <span className={styles.categoryEmpty}>—</span>}
        </div>
      ))}
      {round.categories[0]?.clues.map((_, clueIndex) => (
        round.categories.map((cat, catIndex) => {
          const clue = cat.clues[clueIndex];
          const isEmpty = !!onSelectClue && clue.filled === false && !clue.used;
          const clickable = !!onSelectClue && !clue.used && !isEmpty && !selectionDisabled;
          return (
            <button
              key={`${catIndex}-${clueIndex}`}
              className={`${styles.cell} ${clue.used ? styles.cellUsed : ""} ${isEmpty ? styles.cellEmpty : ""} ${clickable ? styles.cellClickable : ""}`}
              onClick={() => clickable && onSelectClue!(catIndex, clueIndex)}
              disabled={!clickable}
              title={isEmpty ? "No question written yet — add one in Edit mode" : undefined}
            >
              {clue.used ? "" : isEmpty ? "＋" : `$${clue.value}`}
            </button>
          );
        })
      ))}
    </div>
  );
}
