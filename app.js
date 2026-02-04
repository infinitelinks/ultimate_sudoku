/* Ultimate Sudoku PWA
   - Offline (Service Worker)
   - System theme (CSS)
   - Adaptive generator (Smart)
   - Daily Challenge (seeded per date, offline)
   - Mobile fit: board-first sizing so Sudoku always fully visible
   - APK download button (Android mobile-only, hides when installed / already clicked)
   - Win FX: confetti + theme-matched per-letter sparkles + banner + haptic + sound
*/

const $ = (s) => document.querySelector(s);

const boardEl = $("#board");
const keypadEl = $("#keypad");
const statusText = $("#statusText");

const subtitle = $("#subtitle");
const pillMode = $("#pillMode");
const pillDiff = $("#pillDiff");
const pillTimer = $("#pillTimer");
const progressFill = $("#progressFill");

const toggleConflicts = $("#toggleConflicts");
const toggleAutoNotes = $("#toggleAutoNotes");

const btnDaily = $("#btnDaily");
const btnNew = $("#btnNew");
const btnMenu = $("#btnMenu");

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
const dailyBox = $("#dailyBox");
const btnResetStats = $("#btnResetStats");
const btnClearNotes = $("#btnClearNotes");
const btnClearAll = $("#btnClearAll");
const menuDaily = $("#menuDaily");

const modalBackdrop = $("#modalBackdrop");
const modalWin = $("#modalWin");
const winTitle = $("#winTitle");
const winBody = $("#winBody");
const btnCloseWin = $("#btnCloseWin");
const btnNextSmart = $("#btnNextSmart");

// APK download UI
const btnDownloadApk = $("#btnDownloadApk");
const apkHint = $("#apkHint");

// FX DOM
const boardCardEl = document.querySelector(".board-card");
const fxCanvas = document.getElementById("fxCanvas");
const fxCtx = fxCanvas ? fxCanvas.getContext("2d") : null;

const winBanner = document.getElementById("winBanner");
const winBannerTitle = document.getElementById("winBannerTitle");
const winBannerSub = document.getElementById("winBannerSub");

const LS_KEY = "ultimate_sudoku_state_v2";
const STATS_KEY = "ultimate_sudoku_stats_v2";
const DAILY_KEY = "ultimate_sudoku_daily_v1";

/* --------------------- APK download (Android mobile only, auto-hide) --------------------- */
function isMobileBrowserAndroid() {
    const w = window.visualViewport?.width ?? window.innerWidth;
    const ua = navigator.userAgent || "";
    const touch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    const isAndroid = /Android/i.test(ua);
    return (w <= 980) && touch && isAndroid;
}
function isStandalonePWA() {
    return window.__PWA_INSTALLED__ === true ||
        window.matchMedia?.("(display-mode: standalone)")?.matches ||
        (navigator.standalone === true);
}
function apkAlreadyClicked() {
    return localStorage.getItem("ultimate_sudoku_apk_downloaded") === "1";
}
function updateApkButtonVisibility() {
    if (!btnDownloadApk) return;
    const shouldShow = isMobileBrowserAndroid() && !isStandalonePWA() && !apkAlreadyClicked();
    btnDownloadApk.style.display = shouldShow ? "inline-flex" : "none";
    if (apkHint) apkHint.style.display = shouldShow ? "block" : "none";
}
if (btnDownloadApk) {
    btnDownloadApk.addEventListener("click", () => {
        localStorage.setItem("ultimate_sudoku_apk_downloaded", "1");
        updateApkButtonVisibility();
        window.location.href = "./Ultimate_Sudoku.apk";
    });
}

/* --------------------- Perfect fit sizing (board-first on mobile) --------------------- */
function setPerfectMobileFitCellSize() {
    const topbar = document.querySelector(".topbar");
    const main = document.querySelector(".main");
    const boardCard = document.querySelector(".board-card");
    const controlsCard = document.querySelector(".control-card");
    const boardHeader = document.querySelector(".board-header");
    const boardFooter = document.querySelector(".board-footer");

    if (!topbar || !main || !boardCard || !controlsCard) return;

    const vvH = window.visualViewport?.height ?? window.innerHeight;
    const vvW = window.visualViewport?.width ?? window.innerWidth;
    const isMobile = vvW <= 980;

    if (!isMobile) {
        const sidePadding = 28;
        const boardPadding = 20;
        const maxByWidth = Math.floor((vvW - sidePadding - boardPadding) / 9);
        const cell = Math.max(34, Math.min(maxByWidth, 56));
        document.documentElement.style.setProperty("--cell", `${cell}px`);
        return;
    }

    const topH = topbar.getBoundingClientRect().height;
    const cushion = 12;
    const availableH = vvH - topH - cushion - 10;

    const mainStyles = getComputedStyle(main);
    const gap = parseFloat(mainStyles.gap || "10") || 10;

    const controlsH = controlsCard.getBoundingClientRect().height;
    const boardAllowedH = availableH - gap - controlsH;

    const headerH = boardHeader ? boardHeader.getBoundingClientRect().height : 0;
    const footerH = boardFooter ? boardFooter.getBoundingClientRect().height : 0;

    const boardInnerPad = 18;
    const maxByHeight = Math.floor((boardAllowedH - headerH - footerH - boardInnerPad) / 9);

    const sidePadding = 20;
    const boardPad = 18;
    const maxByWidth = Math.floor((vvW - sidePadding - boardPad) / 9);

    let cell = Math.min(maxByWidth, maxByHeight);
    cell = Math.max(24, Math.min(cell, 54));

    document.documentElement.style.setProperty("--cell", `${cell}px`);
}

/* --------------------- Seeded RNG (daily) --------------------- */
function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return function () {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        h ^= h >>> 16;
        return h >>> 0;
    };
}
function mulberry32(a) {
    return function () {
        let t = (a += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* --------------------- Utils --------------------- */
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function nowMs() { return performance.now ? performance.now() : Date.now(); }
function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}
function idx(r, c) { return r * 9 + c; }
function rc(i) { return [Math.floor(i / 9), i % 9]; }
function emptyGrid() { return Array(81).fill(0); }
function rowOf(i) { return Math.floor(i / 9); }
function colOf(i) { return i % 9; }
function boxOf(i) { return Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3); }
function countNonZero(g) { let n = 0; for (const v of g) if (v) n++; return n; }
function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
}

/* --------------------- Stats --------------------- */
function defaultStats() {
    return {
        games: 0,
        wins: 0,
        last10: [],
        profile: { skill: 0.5, pref: "moderate" },
        best: { moderate: null, hard: null, pro: null },
        daily: { streak: 0, lastWinDate: null, bestTimeSec: null }
    };
}
function loadStats() {
    try {
        const s = JSON.parse(localStorage.getItem(STATS_KEY));
        if (!s) return defaultStats();
        if (!s.profile) s.profile = defaultStats().profile;
        if (!s.best) s.best = defaultStats().best;
        if (!s.daily) s.daily = defaultStats().daily;
        if (!Array.isArray(s.last10)) s.last10 = [];
        return s;
    } catch { return defaultStats(); }
}
function saveStats(s) { localStorage.setItem(STATS_KEY, JSON.stringify(s)); }

function diffTargets(diff) {
    if (diff === "moderate") return { targetSec: 900, maxMistakes: 8 };
    if (diff === "hard") return { targetSec: 1400, maxMistakes: 10 };
    return { targetSec: 2000, maxMistakes: 12 };
}

function updateProfileAfterGame({ won, timeSec, mistakes, diff, isDaily }) {
    const stats = loadStats();
    stats.games += 1;
    if (won) stats.wins += 1;

    stats.last10.unshift({ ts: Date.now(), mode: state.mode, diff, timeSec, mistakes, daily: !!isDaily });
    stats.last10 = stats.last10.slice(0, 10);

    const target = diffTargets(diff);
    const timeScore = clamp(1 - (timeSec / target.targetSec), 0, 1);
    const mistakeScore = clamp(1 - (mistakes / target.maxMistakes), 0, 1);
    const winScore = won ? 1 : 0.15;
    const sample = (0.45 * timeScore) + (0.45 * mistakeScore) + (0.10 * winScore);
    stats.profile.skill = clamp(stats.profile.skill * 0.78 + sample * 0.22, 0, 1);

    if (won && !isDaily) {
        const best = stats.best[diff];
        if (best == null || timeSec < best) stats.best[diff] = timeSec;
    }

    if (won && isDaily) {
        const day = state.dailyDate;
        const last = stats.daily.lastWinDate;

        if (!last) {
            stats.daily.streak = 1;
        } else {
            const lastDate = new Date(last + "T00:00:00");
            const todayDate = new Date(day + "T00:00:00");
            const diffDays = Math.round((todayDate - lastDate) / (24 * 3600 * 1000));
            stats.daily.streak = (diffDays === 1) ? (stats.daily.streak + 1) : (diffDays === 0 ? stats.daily.streak : 1);
        }
        stats.daily.lastWinDate = day;

        if (stats.daily.bestTimeSec == null || timeSec < stats.daily.bestTimeSec) {
            stats.daily.bestTimeSec = timeSec;
        }
    }

    saveStats(stats);
}

function pickSmartDifficulty() {
    const stats = loadStats();
    const skill = stats.profile.skill ?? 0.5;
    if (skill < 0.42) return "moderate";
    if (skill < 0.72) return "hard";
    return "pro";
}

function statsText() {
    const s = loadStats();
    const winRate = s.games ? Math.round((s.wins / s.games) * 100) : 0;
    const skill = Math.round((s.profile.skill ?? 0.5) * 100);
    const last = s.last10[0];

    const bestM = s.best.moderate != null ? formatTime(s.best.moderate) : "—";
    const bestH = s.best.hard != null ? formatTime(s.best.hard) : "—";
    const bestP = s.best.pro != null ? formatTime(s.best.pro) : "—";

    return [
        `Games: ${s.games}`,
        `Wins: ${s.wins} (${winRate}%)`,
        `Skill: ${skill}/100`,
        `Best: Moderate ${bestM} • Hard ${bestH} • Pro ${bestP}`,
        last ? `Last: ${last.daily ? "Daily" : "Normal"} • ${last.diff} • ${formatTime(last.timeSec)} • mistakes ${last.mistakes}` : "Last: —",
        `Smart next: ${pickSmartDifficulty()}`
    ].join("\n");
}

function loadDailyState() {
    try {
        const raw = localStorage.getItem(DAILY_KEY);
        if (!raw) return { history: {} };
        const d = JSON.parse(raw);
        if (!d.history) d.history = {};
        return d;
    } catch {
        return { history: {} };
    }
}
function saveDailyState(d) { localStorage.setItem(DAILY_KEY, JSON.stringify(d)); }

function dailyText() {
    const s = loadStats();
    const streak = s.daily.streak ?? 0;
    const best = s.daily.bestTimeSec != null ? formatTime(s.daily.bestTimeSec) : "—";

    const t = todayKey();
    const daily = loadDailyState();
    const todayEntry = daily?.history?.[t];

    const todayStatus = todayEntry?.won
        ? `Today (${t}): Completed in ${formatTime(todayEntry.timeSec)}`
        : `Today (${t}): Not completed yet`;

    return [
        todayStatus,
        `Streak: ${streak}`,
        `Best daily time: ${best}`
    ].join("\n");
}

/* --------------------- Sudoku core --------------------- */
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

function shuffle(arr, rnd = Math.random) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function generateSolvedGrid(rnd = Math.random) {
    const grid = emptyGrid();

    function pickNextCell() {
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
        const cand = shuffle(computeCandidates(grid, i), rnd);
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

function countSolutions(grid, limit = 2) {
    const g = grid.slice();
    let count = 0;

    function pickNextCell() {
        let best = -1, bestCount = 10, bestCand = null;
        for (let i = 0; i < 81; i++) {
            if (g[i] !== 0) continue;
            const cand = computeCandidates(g, i);
            if (cand.length === 0) return { i: -2, cand: [] };
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

function ratePuzzle(puzzle) {
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
        while (stepSingles()) { }
        const { i, cand } = pickCell();
        if (i === -2) return false;
        if (i === -1) return true;
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

    const score = (guesses * 18) + clamp(20 - Math.floor(forced / 3), 0, 20);
    let band = "moderate";
    if (score >= 55) band = "pro";
    else if (score >= 35) band = "hard";
    return { score, band, forced, guesses };
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
    const da = dist(a), db = dist(b);
    if (da !== db) return da < db;

    const aOk = bandOk(a.band, targetBand, a.score, scoreRange);
    const bOk = bandOk(b.band, targetBand, b.score, scoreRange);
    if (aOk !== bOk) return aOk;

    return a.guesses < b.guesses;
}

function generatePuzzle(targetBand, rnd = Math.random) {
    const solution = generateSolvedGrid(rnd);
    let puzzle = solution.slice();

    const targets = {
        moderate: { givens: [34, 40], score: [18, 34] },
        hard: { givens: [28, 34], score: [30, 58] },
        pro: { givens: [22, 30], score: [50, 999] }
    }[targetBand];

    const desiredGivens = targets.givens[0] + Math.floor(rnd() * (targets.givens[1] - targets.givens[0] + 1));

    const positions = shuffle(Array.from({ length: 81 }, (_, i) => i), rnd);
    for (const i of positions) {
        if (countNonZero(puzzle) <= desiredGivens) break;
        const saved = puzzle[i];
        if (saved === 0) continue;

        puzzle[i] = 0;
        if (countSolutions(puzzle, 2) !== 1) {
            puzzle[i] = saved;
        }
    }

    let best = { puzzle, rating: ratePuzzle(puzzle) };
    for (let attempt = 0; attempt < 5; attempt++) {
        const r = best.rating;
        if (bandOk(r.band, targetBand, r.score, targets.score)) break;

        const sol = generateSolvedGrid(rnd);
        let p = sol.slice();
        const pos = shuffle(Array.from({ length: 81 }, (_, i) => i), rnd);
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

    return { puzzle: best.puzzle, solution, meta: { targetBand, rating: best.rating } };
}

/* --------------------- Game state --------------------- */
let state = {
    mode: "smart",
    diff: "moderate",
    dailyDate: null,
    puzzle: emptyGrid(),
    solution: emptyGrid(),
    givenMask: Array(81).fill(false),
    userGrid: emptyGrid(),
    notes: Array.from({ length: 81 }, () => new Set()),
    notesMode: false,
    selected: -1,
    conflictsOn: true,
    autoNotes: false,
    elapsed: 0,
    running: true,
    mistakes: 0,
    history: [],
    future: []
};

function saveState() {
    const safe = { ...state, notes: state.notes.map(set => Array.from(set)) };
    localStorage.setItem(LS_KEY, JSON.stringify(safe));
}
function loadState() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return false;
        const s = JSON.parse(raw);
        s.notes = (s.notes || []).map(arr => new Set(arr || []));
        state = { ...state, ...s };
        return true;
    } catch {
        return false;
    }
}

/* --------------------- UI build/render --------------------- */
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
function moveSel(delta) {
    if (state.selected < 0) return;
    let next = state.selected + delta;
    if (next < 0) next = 0;
    if (next > 80) next = 80;
    state.selected = next;
    render(); saveState();
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
    const extras = [
        { label: "Clear", fn: eraseValue },
        { label: "Notes", fn: toggleNotes },
        {
            label: "Conflicts", fn: () => {
                toggleConflicts.checked = !toggleConflicts.checked;
                state.conflictsOn = toggleConflicts.checked;
                render(); saveState();
            }
        }
    ];
    for (const x of extras) {
        const b = document.createElement("button");
        b.className = "key small";
        b.textContent = x.label;
        b.addEventListener("click", x.fn);
        keypadEl.appendChild(b);
    }
}

function computeConflicts(grid) {
    const bad = new Set();
    for (let r = 0; r < 9; r++) {
        const seen = new Map();
        for (let c = 0; c < 9; c++) {
            const i = idx(r, c);
            const v = grid[i];
            if (!v) continue;
            if (seen.has(v)) { bad.add(i); bad.add(seen.get(v)); }
            else seen.set(v, i);
        }
    }
    for (let c = 0; c < 9; c++) {
        const seen = new Map();
        for (let r = 0; r < 9; r++) {
            const i = idx(r, c);
            const v = grid[i];
            if (!v) continue;
            if (seen.has(v)) { bad.add(i); bad.add(seen.get(v)); }
            else seen.set(v, i);
        }
    }
    for (let br = 0; br < 3; br++) {
        for (let bc = 0; bc < 3; bc++) {
            const seen = new Map();
            for (let rr = 0; rr < 3; rr++) {
                for (let cc = 0; cc < 3; cc++) {
                    const r = br * 3 + rr, c = bc * 3 + cc;
                    const i = idx(r, c);
                    const v = grid[i];
                    if (!v) continue;
                    if (seen.has(v)) { bad.add(i); bad.add(seen.get(v)); }
                    else seen.set(v, i);
                }
            }
        }
    }
    return bad;
}

function render() {
    pillMode.textContent = `Mode: ${state.mode === "daily" ? "Daily" : (state.mode === "smart" ? "Smart" : "Manual")}`;
    pillDiff.textContent = `Difficulty: ${state.diff}`;
    pillTimer.textContent = formatTime(state.elapsed);

    subtitle.textContent = (state.mode === "daily")
        ? `Offline • Daily Challenge • ${state.dailyDate}`
        : `Offline • System theme • Adaptive generator`;

    const filled = countNonZero(state.userGrid);
    progressFill.style.width = Math.round((filled / 81) * 100) + "%";

    const sel = state.selected;
    const selVal = sel >= 0 ? state.userGrid[sel] : 0;

    let conflictSet = new Set();
    if (state.conflictsOn) conflictSet = computeConflicts(state.userGrid);

    for (let i = 0; i < 81; i++) {
        const cell = boardEl.children[i];
        cell.className = "cell";
        if (state.givenMask[i]) cell.classList.add("given");

        const v = state.userGrid[i];

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
        if (state.conflictsOn && conflictSet.has(i)) cell.classList.add("conflict");

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

    btnNotes.textContent = `Notes: ${state.notesMode ? "On" : "Off"}`;
    btnUndo.disabled = state.history.length === 0;
    btnRedo.disabled = state.future.length === 0;

    toggleConflicts.checked = state.conflictsOn;
    toggleAutoNotes.checked = state.autoNotes;

    if (!state.running) statusText.textContent = "Paused — tap Resume.";
    else if (state.selected < 0) statusText.textContent = "Tap a cell to begin.";
    else statusText.textContent = state.notesMode ? "Notes mode: tap numbers to add/remove." : "Enter a number.";

    statsBox.textContent = statsText();
    dailyBox.textContent = dailyText();
}

/* --------------------- Actions --------------------- */
function selectCell(i) { state.selected = i; render(); saveState(); }
function pushHistory() {
    state.history.push({
        userGrid: state.userGrid.slice(),
        notes: state.notes.map(s => new Set(s)),
        mistakes: state.mistakes
    });
    if (state.history.length > 140) state.history.shift();
    state.future = [];
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
function recomputeAutoNotes() {
    state.notes = Array.from({ length: 81 }, (_, i) => {
        if (state.userGrid[i] !== 0) return new Set();
        if (state.givenMask[i]) return new Set();
        return new Set(computeCandidates(state.userGrid, i));
    });
}
function setValue(n) {
    if (!state.running) return;
    const i = state.selected;
    if (i < 0 || state.givenMask[i]) return;

    pushHistory();

    if (state.notesMode) {
        const s = state.notes[i];
        if (s.has(n)) s.delete(n); else s.add(n);
    } else {
        const prev = state.userGrid[i];
        state.userGrid[i] = n;

        if (state.solution[i] !== 0 && n !== state.solution[i] && prev !== n) {
            state.mistakes += 1;
        }

        if (state.autoNotes) {
            clearNoteInPeers(i, n);
            state.notes[i].clear();
        }
    }

    if (isSolvedCorrect()) onWin();
    render(); saveState();
}
function eraseValue() {
    if (!state.running) return;
    const i = state.selected;
    if (i < 0 || state.givenMask[i]) return;

    pushHistory();
    state.userGrid[i] = 0;
    if (state.autoNotes) recomputeAutoNotes();
    render(); saveState();
}
function toggleNotes() { state.notesMode = !state.notesMode; render(); saveState(); }
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
    render(); saveState();
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
    render(); saveState();
}
function restartPuzzle() {
    pushHistory();
    state.userGrid = state.puzzle.slice();
    state.notes = Array.from({ length: 81 }, () => new Set());
    state.mistakes = 0;
    state.elapsed = 0;
    state.running = true;
    closeWin();
    if (state.autoNotes) recomputeAutoNotes();
    render(); saveState();
}
function clearNotes() {
    pushHistory();
    state.notes = Array.from({ length: 81 }, () => new Set());
    render(); saveState();
}
function clearAllUserInput() {
    pushHistory();
    for (let i = 0; i < 81; i++) {
        if (!state.givenMask[i]) state.userGrid[i] = 0;
    }
    state.notes = Array.from({ length: 81 }, () => new Set());
    if (state.autoNotes) recomputeAutoNotes();
    render(); saveState();
}

/* --------------------- Win/Timer --------------------- */
function isSolvedCorrect() {
    for (let i = 0; i < 81; i++) {
        if (state.userGrid[i] !== state.solution[i]) return false;
    }
    return true;
}

/* --------------------- FX: banner, confetti, sparkles, sound, haptic --------------------- */
function resizeFxCanvas() {
    if (!fxCanvas || !fxCtx) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    fxCanvas.width = Math.floor(window.innerWidth * dpr);
    fxCanvas.height = Math.floor(window.innerHeight * dpr);
    fxCanvas.style.width = window.innerWidth + "px";
    fxCanvas.style.height = window.innerHeight + "px";
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

let fxRaf = null;
let fxParticles = [];

function fxEnsureLoop() {
    if (fxRaf) return;

    function step() {
        if (!fxCanvas || !fxCtx) { fxRaf = null; return; }

        if (!fxParticles.length) {
            fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
            fxRaf = null;
            return;
        }

        fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

        const alive = [];
        for (const p of fxParticles) {
            p.life++;
            if (p.life > p.ttl) continue;

            p.vx *= p.drag;
            p.vy = p.vy * p.drag + p.g;

            p.x += p.vx;
            p.y += p.vy;

            if (p.rot != null) p.rot += p.vr;

            const t = 1 - (p.life / p.ttl);
            fxCtx.globalAlpha = Math.max(0, Math.min(1, t)) * (p.a ?? 1);

            if (p.kind === "confetti") {
                fxCtx.save();
                fxCtx.translate(p.x, p.y);
                fxCtx.rotate(p.rot || 0);
                fxCtx.fillStyle = p.c;
                fxCtx.fillRect(-p.r, -p.r * 0.55, p.r * 2.2, p.r * 1.1);
                fxCtx.restore();
            } else if (p.kind === "sparkle") {
                fxCtx.save();
                fxCtx.translate(p.x, p.y);
                fxCtx.rotate(p.rot || 0);
                fxCtx.fillStyle = p.c;
                drawStar(fxCtx, 0, 0, p.r, p.r * 0.55, 4);
                fxCtx.restore();
            }

            alive.push(p);
        }

        fxCtx.globalAlpha = 1;
        fxParticles = alive;
        fxRaf = requestAnimationFrame(step);
    }

    fxRaf = requestAnimationFrame(step);
}

function drawStar(ctx, x, y, outerR, innerR, points = 4) {
    const step = Math.PI / points;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const r = (i % 2 === 0) ? outerR : innerR;
        const a = i * step;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
}

function colorMixRGBA(color, a) {
    color = (color || "").trim();
    if (color.startsWith("#")) {
        let hex = color.slice(1);
        if (hex.length === 3) hex = hex.split("").map(ch => ch + ch).join("");
        const n = parseInt(hex, 16);
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        return `rgba(${r},${g},${b},${a})`;
    }
    if (color.startsWith("rgb")) {
        const nums = color.match(/[\d.]+/g)?.map(Number) || [255, 255, 255];
        const r = nums[0] ?? 255, g = nums[1] ?? 255, b = nums[2] ?? 255;
        return `rgba(${r},${g},${b},${a})`;
    }
    return `rgba(255,255,255,${a})`;
}

function getThemePalette(mode) {
    const root = getComputedStyle(document.documentElement);
    const accent = root.getPropertyValue("--accent").trim() || "#7c5cff";
    const accent2 = root.getPropertyValue("--accent2").trim() || "#2ee59d";
    const text = root.getPropertyValue("--text").trim() || "#e9eefc";
    const light = window.matchMedia?.("(prefers-color-scheme: light)")?.matches;

    if (mode === "daily") {
        return light
            ? ["rgba(79,70,229,0.85)", "rgba(5,150,105,0.85)", "rgba(245,158,11,0.85)", "rgba(255,255,255,0.90)"]
            : [colorMixRGBA(accent, 0.85), colorMixRGBA(accent2, 0.85), "rgba(255,214,110,0.90)", "rgba(255,255,255,0.90)"];
    }

    return light
        ? ["rgba(79,70,229,0.85)", "rgba(5,150,105,0.85)", "rgba(17,24,39,0.35)", "rgba(255,255,255,0.90)"]
        : [colorMixRGBA(accent, 0.90), colorMixRGBA(accent2, 0.90), colorMixRGBA(text, 0.45), "rgba(255,255,255,0.90)"];
}

function confettiBurst(mode) {
    if (!fxCanvas || !fxCtx) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

    resizeFxCanvas();
    const W = window.innerWidth, H = window.innerHeight;
    const originX = W * 0.5;
    const originY = H * 0.35;

    const energetic = (mode === "daily");
    const count = energetic ? Math.min(280, Math.max(160, Math.floor(W / 4)))
        : Math.min(220, Math.max(120, Math.floor(W / 5)));

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speedBase = energetic ? 4.4 : 3.6;
        const speed = speedBase + Math.random() * (energetic ? 7.4 : 6.2);

        fxParticles.push({
            kind: "confetti",
            x: originX,
            y: originY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - (energetic ? 3.2 : 2.6),
            r: 2 + Math.random() * 4,
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.28,
            life: 0,
            ttl: energetic ? (85 + Math.random() * 50) : (75 + Math.random() * 45),
            a: 1,
            g: energetic ? 0.18 : 0.16,
            drag: 0.995,
            c: `hsl(${Math.floor(Math.random() * 360)}, 90%, 60%)`
        });
    }

    fxEnsureLoop();
}

function setTitleAsSpans(el, text) {
    el.innerHTML = "";
    for (const ch of text) {
        const s = document.createElement("span");
        s.textContent = ch === " " ? "\u00A0" : ch;
        s.style.display = "inline-block";
        el.appendChild(s);
    }
}

function letterSparkles({ titleEl, subEl, mode }) {
    if (!fxCanvas || !fxCtx || !titleEl) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

    resizeFxCanvas();
    const palette = getThemePalette(mode);

    const perLetter = (mode === "daily") ? 6 : 4;
    const ttlBase = (mode === "daily") ? 44 : 40;
    const drift = (mode === "daily") ? 1.25 : 1.05;

    const letters = Array.from(titleEl.querySelectorAll("span"));

    letters.forEach((span, i) => {
        const r = span.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height * 0.72;

        setTimeout(() => {
            for (let k = 0; k < perLetter; k++) {
                fxParticles.push({
                    kind: "sparkle",
                    x: cx + (Math.random() - 0.5) * 10,
                    y: cy + (Math.random() - 0.5) * 8,
                    vx: (Math.random() - 0.5) * 0.55,
                    vy: (-0.9 - Math.random() * 1.4) * drift,
                    r: 1.6 + Math.random() * 2.6,
                    rot: Math.random() * Math.PI,
                    vr: (Math.random() - 0.5) * 0.22,
                    life: 0,
                    ttl: ttlBase + Math.random() * 24,
                    a: 0.9,
                    g: 0.03,
                    drag: 0.992,
                    c: palette[Math.floor(Math.random() * palette.length)]
                });
            }
            fxEnsureLoop();
        }, i * (260 / Math.max(1, letters.length)));
    });

    if (subEl) {
        setTimeout(() => {
            const rs = subEl.getBoundingClientRect();
            const cx = rs.left + rs.width / 2;
            const cy = rs.top + rs.height * 0.6;

            const extra = (mode === "daily") ? 26 : 18;
            for (let k = 0; k < extra; k++) {
                fxParticles.push({
                    kind: "sparkle",
                    x: cx + (Math.random() - 0.5) * Math.min(220, rs.width),
                    y: cy + (Math.random() - 0.5) * 12,
                    vx: (Math.random() - 0.5) * 0.45,
                    vy: (-0.7 - Math.random() * 1.0) * drift,
                    r: 1.2 + Math.random() * 2.1,
                    rot: Math.random() * Math.PI,
                    vr: (Math.random() - 0.5) * 0.18,
                    life: 0,
                    ttl: 34 + Math.random() * 22,
                    a: 0.75,
                    g: 0.02,
                    drag: 0.993,
                    c: palette[Math.floor(Math.random() * palette.length)]
                });
            }
            fxEnsureLoop();
        }, 220);
    }
}

function showWinBanner({ title = "YOU WON!", timeSec = 0, mistakes = 0, mode = "normal" } = {}) {
    if (!winBanner || !winBannerTitle || !winBannerSub) return;

    setTitleAsSpans(winBannerTitle, title);
    winBannerSub.textContent = `Time: ${formatTime(timeSec)} • Mistakes: ${mistakes}`;

    winBanner.hidden = false;
    winBanner.classList.remove("show");
    void winBanner.offsetWidth;
    winBanner.classList.add("show");

    requestAnimationFrame(() => {
        letterSparkles({ titleEl: winBannerTitle, subEl: winBannerSub, mode });
    });

    setTimeout(() => {
        winBanner.classList.remove("show");
        winBanner.hidden = true;
    }, 1200);
}

function tryHapticWin() {
    try {
        if (!("vibrate" in navigator)) return;
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
        navigator.vibrate([18, 25, 18]);
    } catch { }
}

function victorySound() {
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();

        const master = ctx.createGain();
        master.gain.value = 0.12;
        master.connect(ctx.destination);

        const now = ctx.currentTime;
        const tones = [
            { f: 523.25, t: 0.00 },
            { f: 659.25, t: 0.10 },
            { f: 783.99, t: 0.20 },
            { f: 1046.50, t: 0.32 }
        ];

        tones.forEach(({ f, t }) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(f, now + t);

            gain.gain.setValueAtTime(0.0001, now + t);
            gain.gain.exponentialRampToValueAtTime(0.9, now + t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.14);

            osc.connect(gain);
            gain.connect(master);

            osc.start(now + t);
            osc.stop(now + t + 0.16);
        });

        setTimeout(() => ctx.close?.(), 900);
    } catch { }
}

function playWinFX({ title, timeSec, mistakes, mode = "normal" } = {}) {
    if (boardCardEl) {
        boardCardEl.classList.remove("winfx");
        void boardCardEl.offsetWidth;
        boardCardEl.classList.add("winfx");
    }
    modalWin.classList.add("winfx");

    confettiBurst(mode);
    victorySound();
    showWinBanner({ title, timeSec, mistakes, mode });
    tryHapticWin();
}

function onWin() {
    state.running = false;
    const timeSec = Math.floor(state.elapsed);
    const mistakes = state.mistakes;
    const isDaily = state.mode === "daily";

    updateProfileAfterGame({ won: true, timeSec, mistakes, diff: state.diff, isDaily });

    if (isDaily) {
        const d = loadDailyState();
        d.history[state.dailyDate] = { won: true, timeSec, mistakes };
        saveDailyState(d);
        winTitle.textContent = "Daily complete";
    } else {
        winTitle.textContent = "Puzzle complete";
    }

    winBody.textContent =
        `Time: ${formatTime(timeSec)}\nMistakes: ${mistakes}\nDifficulty: ${state.diff}${isDaily ? `\nDate: ${state.dailyDate}` : ""}`;

    const bannerTitle = isDaily ? "DAILY CLEARED!" : "YOU WON!";
    playWinFX({ title: bannerTitle, timeSec, mistakes, mode: isDaily ? "daily" : "normal" });

    openWin();
    render();
    saveState();
}

/* --------------------- Timer (stable, prevents background drift) --------------------- */
let timerHandle = null;
function startTimerLoop() {
    if (timerHandle) cancelAnimationFrame(timerHandle);

    let lastTs = nowMs();

    function tick() {
        const t = nowMs();
        if (state.running) {
            const dt = (t - lastTs) / 1000;
            if (dt < 1) state.elapsed += dt;
            pillTimer.textContent = formatTime(state.elapsed);
        }
        lastTs = t;
        timerHandle = requestAnimationFrame(tick);
    }
    timerHandle = requestAnimationFrame(tick);
}

/* --------------------- New game / Daily --------------------- */
function startNewGame(modeOrDiff) {
    closeWin();
    state.dailyDate = null;

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

    statusText.textContent = "Generating puzzle…";
    render();

    setTimeout(() => {
        const { puzzle, solution } = generatePuzzle(diff);

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

        setPerfectMobileFitCellSize();
        render(); saveState();
    }, 20);
}

function startDailyChallenge(dateStr = todayKey()) {
    closeWin();

    const seedStr = `daily:${dateStr}:ultimate-sudoku`;
    const seedFn = xmur3(seedStr);
    const rnd = mulberry32(seedFn());

    const diff = pickSmartDifficulty();
    statusText.textContent = "Loading daily challenge…";
    render();

    setTimeout(() => {
        const { puzzle, solution } = generatePuzzle(diff, rnd);

        state.mode = "daily";
        state.diff = diff;
        state.dailyDate = dateStr;

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

        setPerfectMobileFitCellSize();
        render(); saveState();
    }, 20);
}

/* --------------------- Sheet / Modal --------------------- */
function openSheet() {
    sheetBackdrop.hidden = false;
    sheet.hidden = false;
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
}
function closeSheet() {
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
    setTimeout(() => { sheetBackdrop.hidden = true; sheet.hidden = true; }, 180);
}
function toggleSheet() {
    if (!modalWin.hidden) return;
    if (sheet.classList.contains("open")) closeSheet();
    else openSheet();
}

function openWin() {
    modalBackdrop.hidden = false;
    modalWin.hidden = false;
}
function closeWin() {
    modalBackdrop.hidden = true;
    modalWin.hidden = true;
}

/* Swipe down to close */
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

/* --------------------- Events --------------------- */
btnMenu.addEventListener("click", () => {
    updateApkButtonVisibility();
    toggleSheet();
});

btnNew.addEventListener("click", () => startNewGame("smart"));
btnDaily.addEventListener("click", () => startDailyChallenge(todayKey()));
menuDaily.addEventListener("click", () => { closeSheet(); startDailyChallenge(todayKey()); });

sheetBackdrop.addEventListener("click", closeSheet);

sheet.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-new]");
    if (!btn) return;
    closeSheet();
    startNewGame(btn.getAttribute("data-new"));
});

btnNotes.addEventListener("click", () => { state.notesMode = !state.notesMode; render(); saveState(); });
btnErase.addEventListener("click", eraseValue);
btnUndo.addEventListener("click", undo);
btnRedo.addEventListener("click", redo);
btnRestart.addEventListener("click", restartPuzzle);

btnPause.addEventListener("click", () => {
    state.running = !state.running;
    statusText.textContent = state.running ? "Resumed." : "Paused — tap Resume.";
    render(); saveState();
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

btnClearNotes.addEventListener("click", () => { closeSheet(); clearNotes(); });
btnClearAll.addEventListener("click", () => { closeSheet(); clearAllUserInput(); });

btnResetStats.addEventListener("click", () => {
    localStorage.removeItem(STATS_KEY);
    render();
});

btnCloseWin.addEventListener("click", closeWin);
btnNextSmart.addEventListener("click", () => { closeWin(); startNewGame("smart"); });
modalBackdrop.addEventListener("click", closeWin);

window.addEventListener("resize", () => {
    setPerfectMobileFitCellSize();
    updateApkButtonVisibility();
    resizeFxCanvas();
    render();
});
window.visualViewport?.addEventListener("resize", () => {
    setPerfectMobileFitCellSize();
    updateApkButtonVisibility();
    resizeFxCanvas();
    render();
});

/* --------------------- Boot --------------------- */
function ensureState() {
    buildBoard();
    buildKeypad();

    setPerfectMobileFitCellSize();
    updateApkButtonVisibility();
    resizeFxCanvas();

    const ok = loadState();
    if (!ok || !state.puzzle || state.puzzle.length !== 81) {
        startNewGame("smart");
    } else {
        if (!state.givenMask || state.givenMask.length !== 81) {
            state.givenMask = state.puzzle.map(v => v !== 0);
        }
        state.notes = (state.notes || []).map(s => (s instanceof Set ? s : new Set(s)));
        if (state.notes.length !== 81) state.notes = Array.from({ length: 81 }, () => new Set());
        render();
        setPerfectMobileFitCellSize();
        updateApkButtonVisibility();
        resizeFxCanvas();
        render();
    }

    startTimerLoop();
}

ensureState();
