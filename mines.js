// --- START OF FILE mines.js ---

import { tg, score, updateBalance, addCashback, isDemoMode, showToast, apiCall } from './core.js';

let gridSize = 25, minesGameStarted = false, minesGameOver = false;
let currentBet = 0.25, mineCount = 3, currentMultiplier = 1.0;

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
        cell.dataset.index = i;
        // Добавляем плавность для анимаций
        cell.style.transition = 'transform 0.15s ease, background 0.2s, opacity 0.2s';
        cell.addEventListener('click', () => clickCell(i, cell));
        gridEl.appendChild(cell);
    }
    let currencyName = isDemoMode ? "DEMO" : "GRAM";
    if (minesMultiplierEl) minesMultiplierEl.innerText = "0.80x";
    if (minesWinAmountEl) minesWinAmountEl.innerText = (currentBet * 0.8).toFixed(2) + " " + currencyName;
}

window.startGame = async function startGame() {
    if (!betInput || !minesInput || minesGameStarted) return;
    
    currentBet = parseFloat(parseFloat(betInput.value || 0.25).toFixed(2));
    mineCount = parseInt(minesInput.value) || 3;
    let currencyName = isDemoMode ? "DEMO" : "GRAM";

    if (currentBet < 0.25) { showToast('Минимальная ставка 0.25!', false); betInput.value = 0.25; return; }
    if (mineCount < 1) mineCount = 1; if (mineCount > 24) mineCount = 24; minesInput.value = mineCount;
    
    if (score < currentBet) { showToast('Недостаточно средств!', false); return; }

    if (actionBtn) {
        actionBtn.innerText = "Запуск...";
        actionBtn.style.background = "#64748b";
        actionBtn.disabled = true;
    }

    let response = await apiCall('/api/mines/start', { bet: currentBet, mines: mineCount, is_demo: isDemoMode });
    
    if (!response || response.error) {
        showToast(response?.error || "Ошибка запуска", false);
        resetUI();
        return;
    }

    updateBalance(response.new_balance); 
    addCashback(currentBet * 0.15); 

    minesGameStarted = true; 
    minesGameOver = false; 
    currentMultiplier = 0.80;
    
    let startWin = (currentBet * 0.80).toFixed(2);
    if (minesMultiplierEl) minesMultiplierEl.innerText = "0.80x"; 
    if (minesWinAmountEl) minesWinAmountEl.innerText = startWin + " " + currencyName;

    if (actionBtn) {
        actionBtn.innerText = `Забрать (${startWin} ${currencyName})`;
        actionBtn.style.background = "linear-gradient(135deg, #eab308, #ca8a04)";
        actionBtn.onclick = cashOut;
        actionBtn.disabled = false;
    }

    betInput.disabled = true; 
    minesInput.disabled = true;
    initGrid();
    
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
};

async function clickCell(index, cell) {
    // [ФИКС] Блокируем клик, если уже ждем ответ от сервера для этой ячейки
    if (!minesGameStarted || minesGameOver || cell.classList.contains('revealed') || cell.dataset.waiting === "true") return;
    
    let currencyName = isDemoMode ? "DEMO" : "GRAM";

    // [ФИКС] Optimistic UI: Моментальный визуальный отклик до ответа сервера
    cell.dataset.waiting = "true";
    cell.style.transform = 'scale(0.85)';
    cell.style.opacity = '0.7';
    cell.innerText = '?'; 
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

    let response = await apiCall('/api/mines/click', { index: index });
    
    // Возвращаем размер на место
    cell.style.transform = 'scale(1)';
    
    if (!response || response.error) {
        cell.dataset.waiting = "false";
        cell.innerText = '';
        cell.style.opacity = '1';
        showToast(response?.error || "Ошибка клика", false);
        return;
    }

    cell.classList.add('revealed');

    if (response.status === 'loss') {
        cell.classList.add('mine'); cell.innerText = 'X';
        cell.style.opacity = '1';
        minesGameOver = true; minesGameStarted = false;
        revealAllMines(response.board); 
        resetUI();
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    } 
    else if (response.status === 'continue' || response.status === 'win') {
        cell.classList.add('safe'); cell.innerText = '+';
        cell.style.opacity = '1';
        currentMultiplier = response.multiplier || currentMultiplier;
        
        let currentWin = (currentBet * currentMultiplier).toFixed(2);
        if (minesMultiplierEl) minesMultiplierEl.innerText = currentMultiplier.toFixed(2) + "x";
        if (minesWinAmountEl) minesWinAmountEl.innerText = currentWin + " " + currencyName;
        
        if (actionBtn && response.status !== 'win') {
            actionBtn.innerText = `Забрать (${currentWin} ${currencyName})`;
        }

        if (response.status === 'win') {
            minesGameOver = true; minesGameStarted = false;
            updateBalance(response.new_balance);
            revealAllMines(response.board);
            resetUI();
            showToast(`Успех! +${currentWin} ${currencyName}`, true);
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        }
    }
}

async function cashOut() {
    if (!minesGameStarted || minesGameOver) return;
    
    actionBtn.innerText = "Обработка...";
    actionBtn.disabled = true;

    let response = await apiCall('/api/mines/cashout', {});
    
    if (!response || response.error) {
        showToast(response?.error || "Ошибка при выводе", false);
        actionBtn.disabled = false;
        return;
    }

    minesGameOver = true; minesGameStarted = false;
    
    updateBalance(response.new_balance);
    revealAllMines(response.board);
    resetUI();

    let currencyName = isDemoMode ? "DEMO" : "GRAM";
    showToast(`Вы забрали ${response.winnings} ${currencyName}!`, true);
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
}

function revealAllMines(serverBoard) {
    if (!serverBoard) return;
    const cells = document.querySelectorAll('.cell');
    cells.forEach((cell, idx) => {
        cell.classList.add('revealed');
        if (serverBoard[idx] === 'mine') { 
            cell.classList.add('mine'); 
            cell.innerText = 'X'; 
            cell.style.opacity = '1';
        } else if (!cell.classList.contains('safe')) { 
            cell.innerText = '.'; 
            cell.style.opacity = '0.4'; 
        }
    });
}

function resetUI() {
    if (betInput) betInput.disabled = false; 
    if (minesInput) minesInput.disabled = false;
    if (actionBtn) {
        actionBtn.innerText = "Сделать ставку";
        actionBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
        actionBtn.onclick = startGame;
        actionBtn.disabled = false;
    }
}