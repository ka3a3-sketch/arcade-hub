import { tg, score, subScore, addScore, isDemoMode, showToast, userId, userName, userHandle, initials } from './core.js';

let arenaState = 'IDLE'; 
let arenaPlayers = []; 
let arenaTotalBank = 0;
let arenaTimer = 15;
let arenaTimerInterval = null;

const arenaCanvas = document.getElementById('arenaCanvas');
const arenaCtx = arenaCanvas ? arenaCanvas.getContext('2d') : null;
const arenaBetInput = document.getElementById('arenaBetInput');
const arenaActionBtn = document.getElementById('arenaActionBtn');
const arenaTimerText = document.getElementById('arenaTimerText');
const arenaTotalBankEl = document.getElementById('arenaTotalBank');
const arenaPlayersListEl = document.getElementById('arenaPlayersList');
const arenaWinModal = document.getElementById('arenaWinModal');

let puck = { x: 170, y: 90, vx: 0, vy: 0, radius: 12, speed: 0 };
let arenaAnimId = null;
let arrowRotationAngle = Math.PI; 
let arenaWinnerPlayer = null;

const ARENA_STORAGE_KEY = `gram_arena_session_${userId}`;

function saveArenaSession() {
    const sessionData = {
        arenaState, arenaPlayers, arenaTotalBank, arenaTimer,
        targetTimestamp: Date.now() + (arenaTimer * 1000)
    };
    localStorage.setItem(ARENA_STORAGE_KEY, JSON.stringify(sessionData));
}

function clearArenaSession() { localStorage.removeItem(ARENA_STORAGE_KEY); }

function updateArenaActionButton() {
    if (!arenaActionBtn || arenaState === 'SPINNING') return;
    let betVal = parseFloat(arenaBetInput.value || 0.25).toFixed(2);
    if (arenaState === 'IDLE' || arenaState === 'WAITING') {
        arenaActionBtn.innerText = `Поставить ${betVal} GRAM`;
        arenaActionBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
    }
}

window.setArenaBet = function(val) {
    if (arenaState === 'SPINNING' || arenaState === 'WAITING') return;
    if (arenaBetInput) arenaBetInput.value = val.toFixed(2);
    updateArenaActionButton();
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

if (arenaBetInput) {
    arenaBetInput.addEventListener('input', () => { updateArenaActionButton(); });
}

export function initArenaOnOpen() {
    const saved = localStorage.getItem(ARENA_STORAGE_KEY);
    if (saved) {
        try {
            const data = JSON.parse(saved);
            arenaState = data.arenaState;
            arenaPlayers = data.arenaPlayers;
            arenaTotalBank = data.arenaTotalBank;
            
            if (arenaState === 'WAITING') {
                const timeLeft = Math.floor((data.targetTimestamp - Date.now()) / 1000);
                if (timeLeft > 0) {
                    arenaTimer = timeLeft;
                    if (arenaActionBtn) {
                        arenaActionBtn.style.display = 'block';
                        arenaActionBtn.innerText = "Вы в игре! Ожидание...";
                        arenaActionBtn.style.background = "#64748b";
                    }
                    updateArenaSectors();
                    renderArenaPlayersList();
                    drawArenaFrame();
                    startArenaTimer(true);
                    return;
                } else {
                    triggerArenaSpin();
                    return;
                }
            } else if (arenaState === 'SPINNING') {
                triggerArenaSpin();
                return;
            }
        } catch (e) { console.error(e); }
    }
    resetArenaVisuals();
}

export function resetArenaVisuals() {
    clearArenaSession();
    arenaState = 'IDLE';
    arenaWinnerPlayer = null;
    arenaPlayers = [{ name: userName, handle: userHandle, bet: 0.25, color: '#3b82f6', isUser: true, initials: initials }];
    arenaTotalBank = 0;
    if (arenaWinModal) arenaWinModal.style.display = 'none';
    if (arenaTimerInterval) clearInterval(arenaTimerInterval);
    
    if (arenaBetInput) arenaBetInput.value = "0.25";

    if (arenaActionBtn) {
        arenaActionBtn.style.display = 'block';
        updateArenaActionButton();
        arenaActionBtn.onclick = joinArenaGame;
    }
    if (arenaTimerText) arenaTimerText.innerText = "Ожидание игроков...";
    updateArenaSectors();
    renderArenaPlayersList();
    drawArenaFrame();
}

window.closeArenaWinModal = function() {
    if (arenaWinModal) arenaWinModal.style.display = 'none';
    resetArenaVisuals();
};

window.joinArenaGame = function joinArenaGame() {
    if (isDemoMode) {
        showToast("PvP арена недоступна в демо-режиме!", false);
        return;
    }
    if (arenaState === 'SPINNING' || arenaState === 'WAITING') return;
    let betVal = parseFloat(parseFloat(arenaBetInput.value || 0.25).toFixed(2));
    
    if (betVal < 0.25) { showToast('Минимальная ставка 0.25 GRAM!', false); return; }
    if (score < betVal) { showToast('Недостаточно GRAM на балансе!', false); return; }

    subScore(betVal);

    arenaPlayers = [{ name: userName, handle: userHandle, bet: betVal, color: '#3b82f6', isUser: true, initials: initials }];
    arenaTotalBank = betVal;
    
    updateArenaSectors();
    renderArenaPlayersList();
    
    if (arenaActionBtn) {
        arenaActionBtn.innerText = "Вы в игре! Ожидание...";
        arenaActionBtn.style.background = "#64748b";
    }
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    drawArenaFrame();

    setTimeout(() => {
        if (arenaState === 'WAITING') {
            let botMultipliers = [1.2, 1.5, 2.0, 2.5];
            let randomMult = botMultipliers[Math.floor(Math.random() * botMultipliers.length)];
            let botBet = parseFloat((betVal * randomMult).toFixed(2));

            arenaPlayers.push({ name: "CryptoKing", handle: "@cryptoking", bet: botBet, color: '#ef4444', isUser: false, initials: "CK" });

            updateArenaSectors();
            renderArenaPlayersList();
            drawArenaFrame();
            saveArenaSession();
        }
    }, 1500);

    startArenaTimer(false);
};

function startArenaTimer(isResumed) {
    if (!isResumed) {
        arenaState = 'WAITING';
        arenaTimer = 15;
    }
    
    if (arenaTimerText) arenaTimerText.innerText = `Старт через: ${arenaTimer}с`;
    saveArenaSession();

    if (arenaTimerInterval) clearInterval(arenaTimerInterval);
    arenaTimerInterval = setInterval(() => {
        arenaTimer--;
        if (arenaTimer > 0) {
            if (arenaTimerText) arenaTimerText.innerText = `Старт через: ${arenaTimer}с`;
            saveArenaSession();
        } else {
            clearInterval(arenaTimerInterval);
            triggerArenaSpin();
        }
    }, 1000);
}

function updateArenaSectors() {
    let total = arenaPlayers.reduce((sum, p) => sum + p.bet, 0);
    arenaTotalBank = total;
    if (arenaTotalBankEl) arenaTotalBankEl.innerText = arenaTotalBank.toFixed(2);

    let currentX = 0;
    let fieldWidth = 340;
    arenaPlayers.forEach(p => {
        let widthRatio = p.bet / total;
        let sliceWidth = fieldWidth * widthRatio;
        p.xStart = currentX;
        p.xEnd = currentX + sliceWidth;
        currentX += sliceWidth;
    });
}

function renderArenaPlayersList() {
    if (!arenaPlayersListEl) return;
    arenaPlayersListEl.innerHTML = '';

    let total = arenaPlayers.reduce((sum, p) => sum + p.bet, 0);
    if (total <= 0) total = 1;

    arenaPlayers.forEach(p => {
        let percent = ((p.bet / total) * 100).toFixed(1);
        let initialsP = p.initials || (p.name ? p.name.substring(0, 2).toUpperCase() : "US");
        let handleStr = p.handle || (p.isUser ? userHandle : "@" + p.name.toLowerCase());

        let card = document.createElement('div');
        card.classList.add('arena-player-card');
        card.innerHTML = `
            <div class="arena-player-left">
                <div class="arena-player-avatar" style="background: ${p.color};">${initialsP}</div>
                <div class="arena-player-info">
                    <h4>${handleStr}</h4>
                    <p>${p.name}</p>
                </div>
            </div>
            <div class="arena-player-right">
                <p class="arena-player-chance">${percent}%</p>
                <p class="arena-player-bet">${p.bet.toFixed(2)} GRAM</p>
            </div>
        `;
        arenaPlayersListEl.appendChild(card);
    });
}

function drawArenaFrame(isIndicatorPhase = false) {
    if (!arenaCtx) return;
    arenaCtx.clearRect(0, 0, 340, 180);

    let total = arenaPlayers.reduce((sum, p) => sum + p.bet, 0);
    if (total <= 0) total = 1;

    let fieldWidth = 340;
    let fieldHeight = 180;
    let currentX = 0;

    arenaPlayers.forEach(p => {
        let widthRatio = p.bet / total;
        let sliceWidth = fieldWidth * widthRatio;
        p.xStart = currentX;
        p.xEnd = currentX + sliceWidth;

        arenaCtx.save();
        arenaCtx.fillStyle = p.color;
        arenaCtx.fillRect(currentX, 0, sliceWidth, fieldHeight);

        if (arenaState === 'FINISHED' && arenaWinnerPlayer && p !== arenaWinnerPlayer) {
            arenaCtx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            arenaCtx.fillRect(currentX, 0, sliceWidth, fieldHeight);
        }

        if (arenaState === 'FINISHED' && arenaWinnerPlayer && p === arenaWinnerPlayer) {
            arenaCtx.strokeStyle = '#ffffff';
            arenaCtx.lineWidth = 4;
            arenaCtx.shadowColor = '#ffffff';
            arenaCtx.shadowBlur = 15;
            arenaCtx.strokeRect(currentX, 0, sliceWidth, fieldHeight);
            arenaCtx.shadowBlur = 0;
        } else {
            arenaCtx.strokeStyle = '#0f172a';
            arenaCtx.lineWidth = 2;
            arenaCtx.strokeRect(currentX, 0, sliceWidth, fieldHeight);
        }

        let centerX = currentX + sliceWidth / 2;
        let centerY = fieldHeight / 2;
        let avatarRadius = 18;

        arenaCtx.beginPath();
        arenaCtx.arc(centerX, centerY, avatarRadius, 0, Math.PI * 2);
        arenaCtx.fillStyle = p.color;
        arenaCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        arenaCtx.shadowBlur = 6;
        arenaCtx.fill();
        arenaCtx.shadowBlur = 0;
        arenaCtx.lineWidth = 2;
        arenaCtx.strokeStyle = '#ffffff';
        arenaCtx.stroke();

        arenaCtx.fillStyle = '#ffffff';
        arenaCtx.font = 'bold 11px sans-serif';
        arenaCtx.textAlign = 'center';
        arenaCtx.textBaseline = 'middle';
        let initialsP = p.initials || (p.name ? p.name.substring(0, 2).toUpperCase() : "US");
        arenaCtx.fillText(initialsP, centerX, centerY);
        
        arenaCtx.restore();
        currentX += sliceWidth;
    });

    arenaCtx.beginPath();
    arenaCtx.arc(puck.x, puck.y, puck.radius, 0, Math.PI * 2);
    arenaCtx.fillStyle = '#ffffff';
    arenaCtx.shadowColor = '#38bdf8';
    arenaCtx.shadowBlur = 12;
    arenaCtx.fill();
    arenaCtx.shadowBlur = 0;
    arenaCtx.lineWidth = 2;
    arenaCtx.strokeStyle = '#0f172a';
    arenaCtx.stroke();

    if (isIndicatorPhase) {
        arrowRotationAngle += 0.25; 
        arenaCtx.save();
        arenaCtx.translate(puck.x, puck.y);
        arenaCtx.rotate(arrowRotationAngle);

        arenaCtx.beginPath();
        arenaCtx.moveTo(puck.radius + 2, 0);
        arenaCtx.lineTo(puck.radius + 9, -4);
        arenaCtx.lineTo(puck.radius + 9, 4);
        arenaCtx.fillStyle = '#ffffff'; 
        arenaCtx.fill();
        arenaCtx.lineWidth = 1;
        arenaCtx.strokeStyle = '#0f172a';
        arenaCtx.stroke();

        arenaCtx.restore();
    }
}

function triggerArenaSpin() {
    arenaState = 'SPINNING';
    saveArenaSession();
    if (arenaTimerText) arenaTimerText.innerText = "Выбор направления...";
    if (arenaActionBtn) arenaActionBtn.style.display = 'none';

    puck.x = 170; puck.y = 90;
    let spinStartTime = Date.now();
    let hasLaunched = false;

    function spinLoop() {
        let elapsed = Date.now() - spinStartTime;

        if (elapsed < 2500) {
            drawArenaFrame(true); 
            arenaAnimId = requestAnimationFrame(spinLoop);
            return;
        }

        if (!hasLaunched) {
            hasLaunched = true;
            if (arenaTimerText) arenaTimerText.innerText = "Шайба полетела!";
            let randomAngle = (Math.random() * 1.2 + 0.3) * (Math.random() < 0.5 ? 1 : -1);
            puck.speed = 7;
            puck.vx = Math.cos(randomAngle) * puck.speed * (Math.random() < 0.5 ? 1 : -1);
            puck.vy = Math.sin(randomAngle) * puck.speed * (Math.random() < 0.5 ? 1 : -1);
        }

        let flightElapsed = elapsed - 2500;
        let isDecelerating = flightElapsed > 4000; 

        if (isDecelerating) {
            puck.speed *= 0.975;
            puck.vx *= 0.975;
            puck.vy *= 0.975;
        }

        puck.x += puck.vx;
        puck.y += puck.vy;

        let hitWall = false;
        if (puck.x - puck.radius <= 0) { puck.x = puck.radius; puck.vx = -puck.vx; hitWall = true; }
        else if (puck.x + puck.radius >= 340) { puck.x = 340 - puck.radius; puck.vx = -puck.vx; hitWall = true; }

        if (puck.y - puck.radius <= 0) { puck.y = puck.radius; puck.vy = -puck.vy; hitWall = true; }
        else if (puck.y + puck.radius >= 180) { puck.y = 180 - puck.radius; puck.vy = -puck.vy; hitWall = true; }

        if (hitWall && tg && tg.HapticFeedback) { tg.HapticFeedback.impactOccurred('light'); }

        drawArenaFrame(false); 

        if (isDecelerating && Math.abs(puck.vx) < 0.08 && Math.abs(puck.vy) < 0.08) {
            cancelAnimationFrame(arenaAnimId);
            determineArenaWinner();
        } else {
            arenaAnimId = requestAnimationFrame(spinLoop);
        }
    }
    spinLoop();
}

function determineArenaWinner() {
    arenaState = 'FINISHED';
    clearArenaSession();
    
    let winner = arenaPlayers.find(p => puck.x >= p.xStart && puck.x <= p.xEnd);
    if (!winner) winner = arenaPlayers[0];
    arenaWinnerPlayer = winner;

    let totalPool = arenaTotalBank;
    let commission = totalPool * 0.25; 
    let netWin = totalPool - commission;

    let totalSum = arenaPlayers.reduce((sum, p) => sum + p.bet, 0);
    let winnerPercent = ((winner.bet / totalSum) * 100).toFixed(1);
    let winnerHandleStr = winner.handle || (winner.isUser ? userHandle : "@" + winner.name.toLowerCase());

    if (winner.isUser) {
        addScore(netWin);
        if (arenaTimerText) arenaTimerText.innerText = `Вы выиграли +${netWin.toFixed(2)} GRAM!`;
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        if (arenaTimerText) arenaTimerText.innerText = `Победил ${winner.name}! Банк: ${netWin.toFixed(2)} GRAM`;
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    }

    drawArenaFrame(false);

    setTimeout(() => {
        let badgeEl = document.getElementById('winModalBadgeText');
        let amountEl = document.getElementById('winModalAmountText');
        if (badgeEl) badgeEl.innerText = `${winnerHandleStr} • ${winnerPercent}%`;
        if (amountEl) amountEl.innerText = `+${netWin.toFixed(2)} GRAM`;
        if (arenaWinModal) arenaWinModal.style.display = 'flex';
    }, 800);
}