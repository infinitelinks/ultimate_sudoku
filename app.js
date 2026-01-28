/* Ultimate Sudoku PWA
   - Offline
   - Adaptive puzzle generator (Smart mode)
   - No hint/solver assistant shown
*/

const $ = (s) => document.querySelector(s);

const boardEl = $("#board");
const keypadEl = $("#keypad");
const statusText = $("#statusText");

const pillMode = $("#pillMode");
const pillDiff = $("#pillDiff");
const pillTimer = $("#pillTimer");
const progressFill = $("#progressFill");

const toggleConflicts = $("#toggleConflicts");
const toggleAutoNotes = $("#toggleAutoNotes");

const btnNew = $("#btnNew");
const btnMenu = $("#btnMenu");
const btnStats = $("#btnStats");

const btnNotes = $("#btnNotes");
const btnErase = $("#btnErase");
const btnUndo = $("#btnUndo");
const btnRedo = $("#btnRedo");
const btnRestart = $("#btnRestart");
const btnPause = $("#btnPause");

const sheet = $("#sheet");
const sheetBackdrop = $("#sheetBackdrop");
const sheetHandle = $("#sheetHandle");

const statsBox = $("#statsBox");
const btnResetStats = $("#btnResetStats");

const btnClearNotes = $("#btnClearNotes");
const btnClearAll = $("#btnClearAll");

const modalBackdrop = $("#modalBackdrop");
const modalWin = $("#modalWin");
const winBody = $("#winBody");
const btnCloseWin = $("#btnCloseWin");
const btnNextSmart = $("#btnNextSmart");

const btnInstall = $("#btnInstall");
const installHint = $("#installHint");

let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btnInstall.hidden = false;
    installHint.hidden = true;
});

btnInstall.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    btnInstall.hidden = true;
});

const LS_KEY = "ultimate_sudoku_state_v1";
const STATS_KEY = "ultimate_sudoku_stats_v1";

/* --------------------- Utilities --------------------- */

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function nowMs() { return performance.now ? performance.now() : Date.now(); }

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function idx(r, c) { return r * 9 + c; }
function rc(i) { return [Math.floor(i / 9), i % 9]; }

/* --------------------- Stats + Adaptive Profile --------------------- */

function defaultStats() {
    return {
        games: 0,
        wins: 0,
        last10: [], // {mode,diff,timeSec,mistakes,filled}
        profile: {
            // rolling skills
            skill: 0.5, // 0..1
            pref: "moderate", // last chosen manual diff
        }
    };
}

function loadStats() {
    try {
        const s = JSON.parse(localStorage.getItem(STATS_KEY));
        if (!s) return defaultStats();
        if (!s.profile) s.profile = defaultStats().profile;
        if (!Array.isArray(s.last10)) s.last10 = [];
        return s;
    } catch { return defaultStats(); }
}

function saveStats(s) {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
}

function updateProfileAfterGame({ won, timeSec, mistakes, diff }) {
    const stats = loadStats();
    stats.games += 1;
    if (won) stats.wins += 1;

    stats.last10.unshift({
        ts: Date.now(),
        mode: state.mode,
        diff,
        timeSec,
        mistakes,
        filled: completionCount(state.userGrid)
    });
    stats.last10 = stats.last10.slice(0, 10);

    // Skill update: faster + fewer mistakes => higher.
    // Normalize time by difficulty expectation.
    const target = diffTargets(diff);
    const timeScore = clamp(1 - (timeSec / target.targetSec), 0, 1);
    const mistakeScore = clamp(1 - (mistakes / target.maxMistakes), 0, 1);
    const winScore = won ? 1 : 0.15;

    const sample = (0.45 * timeScore) + (0.45 * mistakeScore) + (0.10 * winScore);

    // Exponential moving average
    stats.profile.skill = clamp(stats.profile.skill * 0.78 + sample * 0.22, 0, 1);

    saveStats(stats);
}

function diffTargets(diff) {
    // rough targets for adaptation; tuned for moderate..pro
    if (diff === "moderate") return { targetSec: 900, maxMistakes: 8 };
    if (diff === "hard") return { targetSec: 1400, maxMistakes: 10 };
    return { targetSec: 2000, maxMistakes: 12 }; // pro
}

function pickSmartDifficulty() {
    const stats = loadStats();
    const skill = stats.profile.skill ?? 0.5;

    // bias to moderate..pro
    if (skill < 0.42) return "moderate";
    if (skill < 0.72) return "hard";
    return "pro";
}

function statsText() {
    const s = loadStats();
    const winRate = s.games ? Math.round((s.wins / s.games) * 100) : 0;
    const skill = Math.round((s.profile.skill ?? 0.5) * 100);

    const last = s.last10[0];
    const lastLine = last
        ? `Last: ${last.diff} • ${formatTime(last.timeSec)} • mistakes ${last.mistakes}`
        : "Last: —";

    return [
        `Games: ${s.games}`,
        `Wins: ${s.wins} (${winRate}%)`,
        `Skill: ${skill}/100`,
        lastLine,
        `Smart next: ${pickSmartDifficulty()}`
    ].join("\n");
}

/* --------------------- Sudoku Core --------------------- */

// Grid is 81 array, 0 = empty
function emptyGrid() { return Array(81).fill(0); }

function rowOf(i) { return Math.floor(i / 9); }
function colOf(i) { return i % 9; }
function boxOf(i) { return Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3); }

function isValidPlacement(grid, i, v) {
    if (v === 0) return true;
    const r = rowOf(i), c = colOf(i);
    for (let k = 0; k < 9; k++) {
        const ri = idx(r, k);
        const ci = idx(k, c);
        if (ri !== i && grid[ri] === v) return false;
        if (ci !== i && grid[ci] === v) return false;
    }
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let rr = br; rr < br + 3; rr++) {
        for (let cc = bc; cc < bc + 3; cc++) {
            const bi = idx(rr, cc);
            if (bi !== i && grid[bi] === v) return false;
        }
    }
    return true;
}

function computeCandidates(grid, i) {
    if (grid[i] !== 0) return [];
    const used = new Set();
    const r = rowOf(i), c = colOf(i);
    for (let k = 0; k < 9; k++) {
        used.add(grid[idx(r, k)]);
        used.add(grid[idx(k, c)]);
    }
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let rr = br; rr < br + 3; rr++) {
        for (let cc = bc; cc < bc + 3; cc++) {
            used.add(grid[idx(rr, cc)]);
        }
    }
    const out = [];
    for (let v = 1; v <= 9; v++) if (!used.has(v)) out.push(v);
    return out;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Backtracking fill to generate a full solution
function generateSolvedGrid() {
    const grid = emptyGrid();
    const order = Array.from({ length: 81 }, (_, i) => i);

    function pickNextCell() {
        // MRV: pick empty with fewest candidates
        let best = -1;
        let bestCount = 10;
        for (let i = 0; i < 81; i++) {
            if (grid[i] !== 0) continue;
            const cand = computeCandidates(grid, i);
            const n = cand.length;
            if (n < bestCount) {
                bestCount = n;
                best = i;
                if (n === 1) break;
            }
        }
        return best;
    }

    function dfs() {
        const i = pickNextCell();
        if (i === -1) return true;
        const cand = shuffle(computeCandidates(grid, i));
        for (const v of cand) {
            grid[i] = v;
            if (dfs()) return true;
            grid[i] = 0;
        }
        return false;
    }

    dfs();
    return grid;
}

// Count solutions up to limit (for uniqueness)
function countSolutions(grid, limit = 2) {
    const g = grid.slice();
    let count = 0;

    function pickNextCell() {
        let best = -1, bestCount = 10, bestCand = null;
        for (let i = 0; i < 81; i++) {
            if (g[i] !== 0) continue;
            const cand = computeCandidates(g, i);
            if (cand.length === 0) return { i: -2, cand: [] }; // dead
            if (cand.length < bestCount) {
                bestCount = cand.length;
                best = i;
                bestCand = cand;
                if (bestCount === 1) break;
            }
        }
        if (best === -1) return { i: -1, cand: [] };
        return { i: best, cand: bestCand };
    }

    function dfs() {
        if (count >= limit) return;
        const { i, cand } = pickNextCell();
        if (i === -2) return;
        if (i === -1) { count++; return; }
        for (const v of cand) {
            g[i] = v;
            dfs();
            g[i] = 0;
            if (count >= limit) return;
        }
    }

    dfs();
    return count;
}

// Simple difficulty scoring via "forced moves" vs "search work"
function ratePuzzle(puzzle) {
    // returns {score, band}
    const g = puzzle.slice();
    let forced = 0;
    let guesses = 0;

    function stepSingles() {
        let progress = false;
        for (let i = 0; i < 81; i++) {
            if (g[i] !== 0) continue;
            const cand = computeCandidates(g, i);
            if (cand.length === 1) {
                g[i] = cand[0];
                forced++;
                progress = true;
            }
        }
        return progress;
    }

    function pickCell() {
        let best = -1, bestCand = null, bestCount = 10;
        for (let i = 0; i < 81; i++) {
            if (g[i] !== 0) continue;
            const cand = computeCandidates(g, i);
            if (cand.length === 0) return { i: -2, cand: [] };
            if (cand.length < bestCount) {
                bestCount = cand.length;
                best = i;
                bestCand = cand;
            }
        }
        if (best === -1) return { i: -1, cand: [] };
        return { i: best, cand: bestCand };
    }

    function solveWithMetrics() {
        // push singles as much as possible
        while (stepSingles()) { }

        const { i, cand } = pickCell();
        if (i === -2) return false;
        if (i === -1) return true;

        // guess
        guesses++;
        for (const v of cand) {
            const snapshot = g.slice();
            g[i] = v;
            if (solveWithMetrics()) return true;
            for (let k = 0; k < 81; k++) g[k] = snapshot[k];
        }
        return false;
    }

    solveWithMetrics();

    // Heuristic: more guesses => harder, more forced => easier
    const score = (guesses * 18) + clamp(20 - Math.floor(forced / 3), 0, 20);
    let band = "moderate";
    if (score >= 55) band = "pro";
    else if (score >= 35) band = "hard";

    return { score, band, forced, guesses };
}

// Create puzzle by removing cells while preserving uniqueness and matching target band
function generatePuzzle(targetBand) {
    const solution = generateSolvedGrid();
    let puzzle = solution.slice();

    const targets = {
        moderate: { givens: [34, 40], score: [18, 34] },
        hard: { givens: [28, 34], score: [30, 58] },
        pro: { givens: [22, 30], score: [50, 999] }
    }[targetBand];

    const desiredGivens = randInt(targets.givens[0], targets.givens[1]);

    // Candidate removals
    const positions = shuffle(Array.from({ length: 81 }, (_, i) => i));
    for (const i of positions) {
        if (countNonZero(puzzle) <= desiredGivens) break;
        const saved = puzzle[i];
        if (saved === 0) continue;

        puzzle[i] = 0;

        // Keep uniqueness
        const solCount = countSolutions(puzzle, 2);
        if (solCount !== 1) {
            puzzle[i] = saved;
            continue;
        }
    }

    // Try to steer difficulty band by small regeneration loop
    // (kept light so it runs fast on mobile)
    let best = { puzzle, rating: ratePuzzle(puzzle) };
    for (let attempt = 0; attempt < 6; attempt++) {
        const r = best.rating;
        if (bandOk(r.band, targetBand, r.score, targets.score)) break;

        // regenerate quickly
        const sol = generateSolvedGrid();
        let p = sol.slice();
        const pos = shuffle(Array.from({ length: 81 }, (_, i) => i));
        for (const i of pos) {
            if (countNonZero(p) <= desiredGivens) break;
            const sv = p[i];
            p[i] = 0;
            if (countSolutions(p, 2) !== 1) p[i] = sv;
        }
        const rr = ratePuzzle(p);
        if (betterMatch(rr, best.rating, targetBand, targets.score)) {
            best = { puzzle: p, rating: rr };
        }
    }

    return {
        puzzle: best.puzzle,
        solution,
        meta: {
            targetBand,
            rating: best.rating
        }
    };
}

function bandOk(band, targetBand, score, scoreRange) {
    if (targetBand === "moderate") return (band === "moderate" && score >= scoreRange[0] && score <= scoreRange[1]);
    if (targetBand === "hard") return ((band === "hard" || band === "pro") && score >= scoreRange[0] && score <= scoreRange[1]);
    return (band === "pro" && score >= scoreRange[0]);
}

function betterMatch(a, b, targetBand, scoreRange) {
    const dist = (x) => {
        const s = x.score;
        if (s < scoreRange[0]) return scoreRange[0] - s;
        if (s > scoreRange[1]) return s - scoreRange[1];
        return 0;
    };
    // prefer closer to target score band; if tie, prefer correct band
    const da = dist(a);
    const db = dist(b);
    if (da !== db) return da < db;
    const aOk = bandOk(a.band, targetBand, a.score, scoreRange);
    const bOk = bandOk(b.band, targetBand, b.score, scoreRange);
    if (aOk !== bOk) return aOk;
    return a.guesses < b.guesses; // slightly prefer fewer guesses if equal
}

function randInt(a, b) {
    return a + ((Math.random() * (b - a + 1)) | 0);
}
function countNonZero(g) { let n = 0; for (const v of g) if (v) n++; return n; }
function completionCount(g) { return countNonZero(g); }

/* --------------------- Game State --------------------- */

let state = {
    mode: "smart",   // smart | manual
    diff: "moderate",
    puzzle: emptyGrid(),
    solution: emptyGrid(),
    givenMask: Array(81).fill(false),
    userGrid: emptyGrid(),
    notes: Array.from({ length: 81 }, () => new Set()),
    notesMode: false,
    selected: -1,
    conflictsOn: true,
    autoNotes: false,

    startTs: 0,
    elapsed: 0,
    running: true,
    mistakes: 0,

    history: [],
    future: []
};

function saveState() {
    const safe = {
        ...state,
        notes: state.notes.map(set => Array.from(set)),
    };
    localStorage.setItem(LS_KEY, JSON.stringify(safe));
}

function loadState() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return false;
        const s = JSON.parse(raw);
        // restore sets
        s.notes = (s.notes || []).map(arr => new Set(arr || []));
        state = { ...state, ...s };
        return true;
    } catch {
        return false;
    }
}

/* --------------------- UI Build --------------------- */

function buildBoard() {
    boardEl.innerHTML = "";
    for (let i = 0; i < 81; i++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.i = String(i);
        cell.tabIndex = 0;

        cell.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            selectCell(i);
        });

        cell.addEventListener("keydown", (e) => {
            const k = e.key;
            if (k >= "1" && k <= "9") setValue(parseInt(k, 10));
            if (k === "Backspace" || k === "Delete" || k === "0") eraseValue();
            if (k === "ArrowUp") moveSel(-9);
            if (k === "ArrowDown") moveSel(9);
            if (k === "ArrowLeft") moveSel(-1);
            if (k === "ArrowRight") moveSel(1);
            if (k === "n" || k === "N") toggleNotes();
            if (k === "Escape") closeSheet();
        });

        boardEl.appendChild(cell);
    }
}

function buildKeypad() {
    keypadEl.innerHTML = "";
    for (let n = 1; n <= 9; n++) {
        const b = document.createElement("button");
        b.className = "key";
        b.textContent = String(n);
        b.addEventListener("click", () => setValue(n));
        keypadEl.appendChild(b);
    }
    // small row for quick actions on mobile feel
    const extras = [
        { label: "Clear", fn: eraseValue },
        { label: "Notes", fn: toggleNotes },
        { label: "Check", fn: () => { toggleConflicts.checked = !toggleConflicts.checked; state.conflictsOn = toggleConflicts.checked; render(); saveState(); } }
    ];
    for (const x of extras) {
        const b = document.createElement("button");
        b.className = "key small";
        b.textContent = x.label;
        b.addEventListener("click", x.fn);
        keypadEl.appendChild(b);
    }
}

function render() {
    // pills
    pillMode.textContent = `Mode: ${state.mode === "smart" ? "Smart" : "Manual"}`;
    pillDiff.textContent = `Difficulty: ${state.diff}`;
    pillTimer.textContent = formatTime(state.elapsed);

    // progress
    const filled = completionCount(state.userGrid);
    const pct = Math.round((filled / 81) * 100);
    progressFill.style.width = pct + "%";

    const sel = state.selected;
    const selVal = sel >= 0 ? state.userGrid[sel] : 0;

    // compute conflicts if enabled
    let conflictSet = new Set();
    if (state.conflictsOn) {
        conflictSet = computeConflicts(state.userGrid);
    }

    for (let i = 0; i < 81; i++) {
        const cell = boardEl.children[i];
        cell.className = "cell";
        if (state.givenMask[i]) cell.classList.add("given");
        const v = state.userGrid[i];

        // related highlights
        if (sel >= 0) {
            const [sr, sc] = rc(sel);
            const [r, c] = rc(i);
            const sameRow = r === sr;
            const sameCol = c === sc;
            const sameBox = boxOf(i) === boxOf(sel);
            if (sameRow || sameCol || sameBox) cell.classList.add("related");
            if (selVal && v === selVal) cell.classList.add("same");
        }

        if (i === sel) cell.classList.add("selected");
        if (!state.givenMask[i] && v) cell.classList.add("user");
        if (state.conflictsOn && conflictSet.has(i)) cell.classList.add("conflict");

        // clear inner
        cell.innerHTML = "";

        if (v !== 0) {
            const span = document.createElement("div");
            span.className = "value";
            span.textContent = String(v);
            cell.appendChild(span);
        } else {
            const notes = state.notes[i];
            if (notes && notes.size) {
                const grid = document.createElement("div");
                grid.className = "notes";
                for (let n = 1; n <= 9; n++) {
                    const s = document.createElement("div");
                    s.className = "note";
                    s.textContent = notes.has(n) ? String(n) : "";
                    grid.appendChild(s);
                }
                cell.appendChild(grid);
            }
        }
    }

    // buttons
    btnNotes.textContent = `Notes: ${state.notesMode ? "On" : "Off"}`;
    btnUndo.disabled = state.history.length === 0;
    btnRedo.disabled = state.future.length === 0;

    // status
    if (!state.running) statusText.textContent = "Paused.";
    else if (state.selected < 0) statusText.textContent = "Tap a cell to begin.";
    else statusText.textContent = state.notesMode ? "Notes mode: tap numbers to add/remove." : "Enter a number.";

    toggleConflicts.checked = state.conflictsOn;
    toggleAutoNotes.checked = state.autoNotes;
}

function computeConflicts(grid) {
    const bad = new Set();
    // rows
    for (let r = 0; r < 9; r++) {
        const seen = new Map();
        for (let c = 0; c < 9; c++) {
            const i = idx(r, c);
            const v = grid[i];
            if (!v) continue;
            if (seen.has(v)) {
                bad.add(i); bad.add(seen.get(v));
            } else seen.set(v, i);
        }
    }
    // cols
    for (let c = 0; c < 9; c++) {
        const seen = new Map();
        for (let r = 0; r < 9; r++) {
            const i = idx(r, c);
            const v = grid[i];
            if (!v) continue;
            if (seen.has(v)) {
                bad.add(i); bad.add(seen.get(v));
            } else seen.set(v, i);
        }
    }
    // boxes
    for (let br = 0; br < 3; br++) {
        for (let bc = 0; bc < 3; bc++) {
            const seen = new Map();
            for (let rr = 0; rr < 3; rr++) {
                for (let cc = 0; cc < 3; cc++) {
                    const r = br * 3 + rr, c = bc * 3 + cc;
                    const i = idx(r, c);
                    const v = grid[i];
                    if (!v) continue;
                    if (seen.has(v)) {
                        bad.add(i); bad.add(seen.get(v));
                    } else seen.set(v, i);
                }
            }
        }
    }
    return bad;
}

/* --------------------- Actions --------------------- */

function selectCell(i) {
    state.selected = i;
    render();
    saveState();
}

function moveSel(delta) {
    if (state.selected < 0) return;
    let i = state.selected + delta;
    if (i < 0) i = 0;
    if (i > 80) i = 80;
    selectCell(i);
}

function pushHistory() {
    state.history.push({
        userGrid: state.userGrid.slice(),
        notes: state.notes.map(s => new Set(s)),
        mistakes: state.mistakes
    });
    if (state.history.length > 120) state.history.shift();
    state.future = [];
}

function setValue(n) {
    if (!state.running) return;
    const i = state.selected;
    if (i < 0) return;
    if (state.givenMask[i]) return;

    pushHistory();

    if (state.notesMode) {
        const s = state.notes[i];
        if (s.has(n)) s.delete(n); else s.add(n);
    } else {
        const prev = state.userGrid[i];
        state.userGrid[i] = n;

        // mistake tracking (not shown as hints; just stats)
        if (n !== 0 && state.solution[i] !== 0 && n !== state.solution[i]) {
            state.mistakes += 1;
        }

        // if auto-notes, remove notes in peers
        if (state.autoNotes) {
            clearNoteInPeers(i, n);
            state.notes[i].clear();
        }
    }

    // win check
    if (isSolvedCorrect()) {
        onWin();
    }

    render();
    saveState();
}

function clearNoteInPeers(i, n) {
    const r = rowOf(i), c = colOf(i);
    for (let k = 0; k < 9; k++) {
        state.notes[idx(r, k)].delete(n);
        state.notes[idx(k, c)].delete(n);
    }
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let rr = br; rr < br + 3; rr++) {
        for (let cc = bc; cc < bc + 3; cc++) {
            state.notes[idx(rr, cc)].delete(n);
        }
    }
}

function eraseValue() {
    if (!state.running) return;
    const i = state.selected;
    if (i < 0) return;
    if (state.givenMask[i]) return;

    pushHistory();
    state.userGrid[i] = 0;
    render();
    saveState();
}

function toggleNotes() {
    state.notesMode = !state.notesMode;
    render();
    saveState();
}

function undo() {
    const prev = state.history.pop();
    if (!prev) return;
    state.future.push({
        userGrid: state.userGrid.slice(),
        notes: state.notes.map(s => new Set(s)),
        mistakes: state.mistakes
    });
    state.userGrid = prev.userGrid.slice();
    state.notes = prev.notes.map(s => new Set(s));
    state.mistakes = prev.mistakes ?? state.mistakes;
    render();
    saveState();
}

function redo() {
    const next = state.future.pop();
    if (!next) return;
    state.history.push({
        userGrid: state.userGrid.slice(),
        notes: state.notes.map(s => new Set(s)),
        mistakes: state.mistakes
    });
    state.userGrid = next.userGrid.slice();
    state.notes = next.notes.map(s => new Set(s));
    state.mistakes = next.mistakes ?? state.mistakes;
    render();
    saveState();
}

function restartPuzzle() {
    pushHistory();
    state.userGrid = state.puzzle.slice();
    state.notes = Array.from({ length: 81 }, () => new Set());
    state.mistakes = 0;
    state.elapsed = 0;
    state.startTs = nowMs();
    state.running = true;
    closeWin();
    render();
    saveState();
}

function clearNotes() {
    pushHistory();
    state.notes = Array.from({ length: 81 }, () => new Set());
    render();
    saveState();
}

function clearAllUserInput() {
    pushHistory();
    for (let i = 0; i < 81; i++) {
        if (!state.givenMask[i]) state.userGrid[i] = 0;
    }
    state.notes = Array.from({ length: 81 }, () => new Set());
    render();
    saveState();
}

/* --------------------- Win / Timer --------------------- */

function isSolvedCorrect() {
    for (let i = 0; i < 81; i++) {
        if (state.userGrid[i] !== state.solution[i]) return false;
    }
    return true;
}

function onWin() {
    state.running = false;

    const t = state.elapsed;
    const m = state.mistakes;

    // record stats
    updateProfileAfterGame({ won: true, timeSec: t, mistakes: m, diff: state.diff });

    winBody.textContent = `Time: ${formatTime(t)} • Mistakes: ${m} • Difficulty: ${state.diff}`;
    openWin();
    render();
    saveState();
}

let timerHandle = null;
function startTimerLoop() {
    if (timerHandle) cancelAnimationFrame(timerHandle);
    state.startTs = nowMs();
    function tick() {
        if (state.running) {
            const t = nowMs();
            // keep elapsed stable if paused/resumed
            state.elapsed = state.elapsed + (t - state.startTs) / 1000;
            state.startTs = t;
            pillTimer.textContent = formatTime(state.elapsed);
        } else {
            state.startTs = nowMs();
        }
        timerHandle = requestAnimationFrame(tick);
    }
    timerHandle = requestAnimationFrame(tick);
}

/* --------------------- Puzzle Start --------------------- */

function startNewGame(modeOrDiff) {
    closeWin();

    let mode = "manual";
    let diff = "moderate";

    if (modeOrDiff === "smart") {
        mode = "smart";
        diff = pickSmartDifficulty();
    } else {
        mode = "manual";
        diff = modeOrDiff;
        const st = loadStats();
        st.profile.pref = diff;
        saveStats(st);
    }

    // Generate
    statusText.textContent = "Generating puzzle…";
    render();

    // generate without blocking UI too hard
    setTimeout(() => {
        const { puzzle, solution, meta } = generatePuzzle(diff);

        state.mode = mode;
        state.diff = diff;
        state.puzzle = puzzle.slice();
        state.solution = solution.slice();
        state.givenMask = puzzle.map(v => v !== 0);
        state.userGrid = puzzle.slice();
        state.notes = Array.from({ length: 81 }, () => new Set());
        state.notesMode = false;
        state.selected = -1;
        state.history = [];
        state.future = [];
        state.mistakes = 0;

        state.elapsed = 0;
        state.running = true;
        state.startTs = nowMs();

        // Update subtitle + difficulty pill based on rating info
        $("#subtitle").textContent = `Offline • Adaptive generator • Rated: ${meta.rating.band}`;
        pillDiff.textContent = `Difficulty: ${diff}`;

        render();
        saveState();
    }, 30);
}

/* --------------------- Menu / Sheets --------------------- */

function openSheet() {
    sheetBackdrop.hidden = false;
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
}
function closeSheet() {
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
    setTimeout(() => { sheetBackdrop.hidden = true; }, 180);
}
function toggleSheet() {
    if (sheet.classList.contains("open")) closeSheet(); else openSheet();
}

function openWin() {
    modalBackdrop.hidden = false;
    modalWin.hidden = false;
}
function closeWin() {
    modalBackdrop.hidden = true;
    modalWin.hidden = true;
}

/* Swipe down to close sheet */
(function sheetSwipe() {
    let startY = 0;
    let dragging = false;
    sheetHandle.addEventListener("pointerdown", (e) => {
        dragging = true;
        startY = e.clientY;
        sheetHandle.setPointerCapture(e.pointerId);
    });
    sheetHandle.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const dy = e.clientY - startY;
        if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
    });
    sheetHandle.addEventListener("pointerup", (e) => {
        dragging = false;
        sheet.style.transform = "";
        const dy = e.clientY - startY;
        if (dy > 90) closeSheet();
    });
})();

/* --------------------- Auto-notes --------------------- */

function recomputeAutoNotes() {
    // Fill notes for empty cells based on candidates
    state.notes = Array.from({ length: 81 }, (_, i) => {
        if (state.userGrid[i] !== 0) return new Set();
        if (state.givenMask[i]) return new Set();
        return new Set(computeCandidates(state.userGrid, i));
    });
}

/* --------------------- Events --------------------- */

btnMenu.addEventListener("click", () => {
    renderStatsBox();
    toggleSheet();
});
btnNew.addEventListener("click", () => startNewGame("smart"));
btnStats.addEventListener("click", () => { renderStatsBox(); openSheet(); });

btnNotes.addEventListener("click", toggleNotes);
btnErase.addEventListener("click", eraseValue);
btnUndo.addEventListener("click", undo);
btnRedo.addEventListener("click", redo);
btnRestart.addEventListener("click", restartPuzzle);

btnPause.addEventListener("click", () => {
    state.running = !state.running;
    if (state.running) state.startTs = nowMs();
    render();
    saveState();
});

toggleConflicts.addEventListener("change", () => {
    state.conflictsOn = toggleConflicts.checked;
    render(); saveState();
});

toggleAutoNotes.addEventListener("change", () => {
    state.autoNotes = toggleAutoNotes.checked;
    if (state.autoNotes) recomputeAutoNotes();
    render(); saveState();
});

sheetBackdrop.addEventListener("click", closeSheet);

sheet.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-new]");
    if (!btn) return;
    const val = btn.getAttribute("data-new");
    closeSheet();
    startNewGame(val);
});

btnClearNotes.addEventListener("click", () => {
    closeSheet();
    clearNotes();
});

btnClearAll.addEventListener("click", () => {
    closeSheet();
    clearAllUserInput();
});

btnResetStats.addEventListener("click", () => {
    localStorage.removeItem(STATS_KEY);
    renderStatsBox();
});

btnCloseWin.addEventListener("click", closeWin);
btnNextSmart.addEventListener("click", () => {
    closeWin();
    startNewGame("smart");
});

modalBackdrop.addEventListener("click", closeWin);

/* --------------------- Boot --------------------- */

function renderStatsBox() {
    statsBox.textContent = statsText();
}

function ensureState() {
    buildBoard();
    buildKeypad();

    const ok = loadState();
    if (!ok || !state.puzzle || state.puzzle.length !== 81) {
        startNewGame("smart");
    } else {
        // rebuild given mask if missing
        if (!state.givenMask || state.givenMask.length !== 81) {
            state.givenMask = state.puzzle.map(v => v !== 0);
        }
        // restore notes sets if needed
        state.notes = (state.notes || []).map(s => (s instanceof Set ? s : new Set(s)));
        if (state.notes.length !== 81) state.notes = Array.from({ length: 81 }, () => new Set());
        render();
    }

    renderStatsBox();
    startTimerLoop();
}

ensureState();
