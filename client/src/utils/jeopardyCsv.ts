export interface ImportCategory { round: 1 | 2; catIndex: number; name: string; }
export interface ImportClue { round: 1 | 2; catIndex: number; clueIndex: number; question: string; answer: string; }
export interface ImportResult { categories: ImportCategory[]; clues: ImportClue[]; skipped: number; }

const ROUND_VALUES: Record<1 | 2, number[]> = {
  1: [200, 400, 600, 800, 1000],
  2: [400, 800, 1200, 1600, 2000],
};

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += char; i++; continue;
    }
    if (char === '"') { inQuotes = true; i++; continue; }
    if (char === ',') { row.push(field); field = ""; i++; continue; }
    if (char === '\r') { i++; continue; }
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += char; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  return rows.filter(r => r.some(c => c.trim() !== ""));
}

export function resolveJeopardyImport(rows: string[][]): ImportResult {
  const dataRows = rows.length && /^round$/i.test((rows[0][0] || "").trim()) ? rows.slice(1) : rows;

  const catIndexByRoundName: Record<1 | 2, Map<string, number>> = { 1: new Map(), 2: new Map() };
  const clueCountByRoundCat: Record<1 | 2, number[]> = { 1: [0, 0, 0, 0, 0], 2: [0, 0, 0, 0, 0] };
  const categories: ImportCategory[] = [];
  const clues: ImportClue[] = [];
  let skipped = 0;

  for (const cols of dataRows) {
    const roundRaw = (cols[0] || "").trim();
    const round: 1 | 2 | null = roundRaw === "2" ? 2 : roundRaw === "1" ? 1 : null;
    const name = (cols[1] || "").trim();
    const question = (cols[3] || "").trim();
    const answer = (cols[4] || "").trim();

    if (!round || !name || !question) { skipped++; continue; }

    let catIndex = catIndexByRoundName[round].get(name.toUpperCase());
    if (catIndex === undefined) {
      if (catIndexByRoundName[round].size >= 5) { skipped++; continue; }
      catIndex = catIndexByRoundName[round].size;
      catIndexByRoundName[round].set(name.toUpperCase(), catIndex);
      categories.push({ round, catIndex, name });
    }

    const clueIndex = clueCountByRoundCat[round][catIndex];
    if (clueIndex >= 5) { skipped++; continue; }
    clueCountByRoundCat[round][catIndex]++;
    clues.push({ round, catIndex, clueIndex, question, answer });
  }

  return { categories, clues, skipped };
}

export function buildJeopardyTemplateCSV(): string {
  const lines = ["round,category,value,question,answer"];
  for (const round of [1, 2] as const) {
    for (let c = 1; c <= 5; c++) {
      for (const value of ROUND_VALUES[round]) {
        lines.push(`${round},Category ${c},${value},,`);
      }
    }
  }
  return lines.join("\n");
}
