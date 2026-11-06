import { tg, score, subScore, addScore, addCashback, isDemoMode, showToast } from './core.js';

let gridSize = 25, board = [], minesGameStarted = false, minesGameOver = false;
let currentBet = 0.25, mineCount = 3, revealedSafeCount = 0, currentMultiplier = 1.0;

const gridEl = document.getElementById('grid');
const actionBtn = document.getElementById('actionBtn');
const betInput = document.getElementById('betInput');
const minesInput = document.getElementById('minesInput');
const minesMultiplierEl = document.getElementById('minesMultiplier');
const minesWinAmountEl = document.getElementById('minesWinAmount');

window.setBetPercent = function(percent) {
    if (minesGameStarted) return;
    currentBet = parseFloat(Math.max(0.25, score * percent).toFixed(2));
    if (betInput) betInput.value = currentBet;
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

window.multiplyBet = function(multiplier) {
    if (minesGameStarted || !betInput) return;
    let val = parseFloat(((parseFloat(betInput.value) || 0.25) * multiplier).toFixed(2));
    if (val < 0.25) val = 0.25;
    if (val > score) val = parseFloat(score.toFixed(2));
    betInput.value = val;
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

export function initGrid() {
    if (!gridEl) return;
    gridEl.innerHTML = '';
    for (let i = 0; i < gridSize; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.addEventListener('click', () => clickCell(i, cell));
        gridEl.appendChild(cell);
    }
    let currencyName = isDemoMode ? "DEMO" : "GRAM";
    if (minesMultiplierEl) minesMultiplierEl.innerText = "0.80x";
    if (minesWinAmountEl) minesWinAmountEl.innerText = (currentBet * 0.8).toFixed(2) + " " + currencyName;
}

function calculateMinesMultiplier(totalTiles, mines, revealed) {
    if (revealed === 0) return 0.80;
    let probability = 1.0;
    for (let i = 0; i < revealed; i++) {
        probability *= ((totalTiles - mines - i) / (totalTiles - i));
    }
    let mult = (1.0 / probability) * 0.90;
    return Math.max(0.80, parseFloat(mult.toFixed(2)));
}

window.startGame = function startGame() {
    if (!betInput || !minesInput) return;
    currentBet = parseFloat(parseFloat(betInput.value || 0.25).toFixed(2));
    mineCount = parseInt(minesInput.value) || 3;

    let currencyName = isDemoMode ? "DEMO" : "GRAM";

    if (currentBet < 0.25) { showToast('Минимальная ставка 0.25!', false); betInput.value = 0.25; return; }
    if (mineCount < 1) mineCount = 1; if (mineCount > 24) mineCount = 24; minesInput.value = mineCount;
    if (score < currentBet) { showToast('Недостаточно средств!', false); return; }

    subScore(currentBet);
    addCashback(currentBet * 0.15);

    minesGameStarted = true; minesGameOver = false; revealedSafeCount = 0; currentMultiplier = 0.80;
    let startWin = (currentBet * 0.80).toFixed(2);
    if (minesMultiplierEl) minesMultiplierEl.innerText = "0.80x"; 
    if (minesWinAmountEl) minesWinAmountEl.innerText = startWin + " " + currencyName;

    if (actionBtn) {
        actionBtn.innerText = `Забрать (${startWin} ${currencyName})`;
        actionBtn.style.background = "linear-gradient(135deg, #eab308, #ca8a04)";
        actionBtn.onclick = cashOut;
    }

    betInput.disabled = true; minesInput.disabled = true;
    board = Array(gridSize).fill('safe');
    let planted = 0;
    while (planted < mineCount) {
        let idx = Math.floor(Math.random() * gridSize);
        if (board[idx] === 'safe') { board[idx] = 'mine'; planted++; }
    }
    initGrid();
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
};

function clickCell(index, cell) {
    if (!minesGameStarted || minesGameOver || cell.classList.contains('revealed')) return;
    cell.classList.add('revealed');

    let currencyName = isDemoMode ? "DEMO" : "GRAM";

    if (board[index] === 'mine') {
        cell.classList.add('mine'); cell.innerText = 'X';
        minesGameOver = true; minesGameStarted = false;
        if (betInput) betInput.disabled = false; 
        if (minesInput) minesInput.disabled = false;
        revealAllMines();
        if (actionBtn) {
            actionBtn.innerText = "Сделать ставку"; 
            actionBtn.style.background = "linear-gradient(135deg, #10b981, #059669)"; 
            actionBtn.onclick = startGame;
        }
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    } else {
        cell.classList.add('safe'); cell.innerText = '+';
        revealedSafeCount++;
        currentMultiplier = calculateMinesMultiplier(gridSize, mineCount, revealedSafeCount);
        let currentWin = (currentBet * currentMultiplier).toFixed(2);
        
        if (minesMultiplierEl) minesMultiplierEl.innerText = currentMultiplier.toFixed(2) + "x";
        if (minesWinAmountEl) minesWinAmountEl.innerText = currentWin + " " + currencyName;
        if (actionBtn) actionBtn.innerText = `Забрать (${currentWin} ${currencyName})`;

        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('light');
        if (revealedSafeCount === (gridSize - mineCount)) { cashOut(); }
    }
}

function cashOut() {
    if (!minesGameStarted || minesGameOver) return;
    minesGameOver = true; minesGameStarted = false;
    if (betInput) betInput.disabled = false; 
    if (minesInput) minesInput.disabled = false;

    let winnings = parseFloat((currentBet * currentMultiplier).toFixed(2));
    addScore(winnings);
    revealAllMines();

    if (actionBtn) {
        actionBtn.innerText = "Сделать ставку";
        actionBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
        actionBtn.onclick = startGame;
    }
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
}

function revealAllMines() {
    const cells = document.querySelectorAll('.cell');
    cells.forEach((cell, idx) => {
        cell.classList.add('revealed');
        if (board[idx] === 'mine') { cell.classList.add('mine'); cell.innerText = 'X'; }
        else if (!cell.classList.contains('safe')) { cell.innerText = '.'; cell.style.opacity = '0.4'; }
    });
}