import { tg, score, subScore, addScore, isDemoMode, showToast, userId, userName, userHandle, initials } from './core.js';

let arenaState = 'IDLE'; // IDLE, WAITING, SPINNING, FINISHED
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
const arenaCanvasWrap = document.getElementById('arenaCanvasWrap');

// Физический мир арены (квадрат 800x800)
const WORLD_SIZE = 800;
const S_TOTAL = WORLD_SIZE * WORLD_SIZE;

// Шайба-бублик (как в Ice Upgrade)
let puck = { 
    x: WORLD_SIZE / 2, 
    y: WORLD_SIZE / 2, 
    vx: 0, 
    vy: 0, 
    radius: 32, 
    holeRadius: 18, 
    friction: 0.993,
    trail: [] 
};

let arenaAnimId = null;
let currentZoom = 1.0;
let cameraX = WORLD_SIZE / 2;
let cameraY = WORLD_SIZE / 2;

// Стрелка прицеливания (3 сек)
let aimStartTime = 0;
let aimDuration = 3000;
let finalAimAngle = 0;

let arenaWinnerPlayer = null;

// Аватарка пользователя
let userAvatarImg = new Image();
let isUserAvatarLoaded = false;
if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.photo_url) {
    userAvatarImg.src = tg.initDataUnsafe.user.photo_url;
    userAvatarImg.onload = function() {
        isUserAvatarLoaded = true;
        if (arenaState === 'IDLE') redrawArena();
    };
}

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
                    renderArenaPlayersList();
                    redrawArena();
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
    arenaPlayers = [{ name: userName, handle: userHandle, bet: 0.25, color: '#10b981', isUser: true, initials: initials }];
    arenaTotalBank = 0.25;
    if (arenaWinModal) arenaWinModal.style.display = 'none';
    if (arenaTimerInterval) clearInterval(arenaTimerInterval);
    
    currentZoom = 1.0;
    cameraX = WORLD_SIZE / 2;
    cameraY = WORLD_SIZE / 2;
    puck.x = WORLD_SIZE / 2;
    puck.y = WORLD_SIZE / 2;
    puck.vx = 0;
    puck.vy = 0;
    puck.trail = [];

    if (arenaBetInput) arenaBetInput.value = "0.25";

    if (arenaActionBtn) {
        arenaActionBtn.style.display = 'block';
        updateArenaActionButton();
        arenaActionBtn.onclick = joinArenaGame;
    }
    if (arenaTimerText) arenaTimerText.innerText = "Ожидание игроков...";
    renderArenaPlayersList();
    redrawArena();
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

    // Добавляем реального игрока + имитируем 1 живого оппонента для динамики пула
    arenaPlayers = [
        { name: userName, handle: userHandle, bet: betVal, color: '#10b981', isUser: true, initials: initials },
        { name: "CryptoKing", handle: "@cryptoking", bet: betVal, color: '#fbbf24', isUser: false, initials: "CK" }
    ];
    arenaTotalBank = betVal * 2;
    
    renderArenaPlayersList();
    
    if (arenaActionBtn) {
        arenaActionBtn.innerText = "Вы в игре! Ожидание...";
        arenaActionBtn.style.background = "#64748b";
    }
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    redrawArena();

    saveArenaSession();
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

/**
 * ГЕНЕРАЦИЯ СЕКТОРОВ НА КВАДРАТНОМ ПОЛЕ 800x800 НА ОСНОВЕ ДОЛЕЙ СТАВОК
 */
function getArenaSectorsGeometry() {
    let total = arenaPlayers.reduce((sum, p) => sum + p.bet, 0);
    if (total <= 0) total = 1;

    let W = WORLD_SIZE;
    let H = WORLD_SIZE;
    let sectors = [];

    // Для 2 игроков делим поле по диагонали или вертикали по долям ставок
    let p1Ratio = arenaPlayers[0].bet / total;
    let splitX = W * p1Ratio;

    sectors.push({
        player: arenaPlayers[0],
        polygon: [
            { x: 0, y: 0 },
            { x: splitX, y: 0 },
            { x: splitX, y: H },
            { x: 0, y: H }
        ],
        centroid: { x: splitX / 2, y: H / 2 },
        color: arenaPlayers[0].color
    });

    sectors.push({
        player: arenaPlayers[1],
        polygon: [
            { x: splitX, y: 0 },
            { x: W, y: 0 },
            { x: W, y: H },
            { x: splitX, y: H }
        ],
        centroid: { x: splitX + (W - splitX) / 2, y: H / 2 },
        color: arenaPlayers[1].color
    });

    return sectors;
}

function renderArenaPlayersList() {
    if (!arenaPlayersListEl) return;
    arenaPlayersListEl.innerHTML = '';

    let total = arenaPlayers.reduce((sum, p) => sum + p.bet, 0);
    if (total <= 0) total = 1;
    if (arenaTotalBankEl) arenaTotalBankEl.innerText = total.toFixed(2);

    arenaPlayers.forEach(p => {
        let percent = ((p.bet / total) * 100).toFixed(1);
        let initialsP = p.initials || (p.name ? p.name.substring(0, 2).toUpperCase() : "US");
        let handleStr = p.handle || (p.isUser ? userHandle : "@" + p.name.toLowerCase());

        let card = document.createElement('div');
        card.classList.add('arena-player-card');
        card.innerHTML = `
            <div class="arena-player-left">
                <div class="arena-player-avatar" style="background: ${p.color}; box-shadow: 0 0 12px ${p.color}66;">${initialsP}</div>
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

function syncCanvasSize() {
    if (!arenaCanvas) return;
    const rect = arenaCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const displaySize = Math.max(rect.width || 360, 320);

    if (arenaCanvas.width !== displaySize * dpr) {
        arenaCanvas.width = displaySize * dpr;
        arenaCanvas.height = displaySize * dpr;
    }
}

function redrawArena(targetCamX = WORLD_SIZE/2, targetCamY = WORLD_SIZE/2, targetZoom = 1.0, showArrow = false, arrowAngle = 0) {
    if (!arenaCtx || !arenaCanvas) return;

    syncCanvasSize();
    const w = arenaCanvas.width;
    const h = arenaCanvas.height;

    cameraX += (targetCamX - cameraX) * 0.12;
    cameraY += (targetCamY - cameraY) * 0.12;
    currentZoom += (targetZoom - currentZoom) * 0.08;

    arenaCtx.clearRect(0, 0, w, h);

    // Маска скругленного угла контейнера
    arenaCtx.save();
    arenaCtx.beginPath();
    const cornerRadius = 28 * (w / 360);
    if (typeof arenaCtx.roundRect === 'function') {
        arenaCtx.roundRect(0, 0, w, h, cornerRadius);
    } else {
        arenaCtx.rect(0, 0, w, h);
    }
    arenaCtx.clip();

    arenaCtx.save();
    arenaCtx.translate(w / 2, h / 2);
    const baseScale = w / WORLD_SIZE;
    const finalScale = baseScale * currentZoom;
    arenaCtx.scale(finalScale, finalScale);
    arenaCtx.translate(-cameraX, -cameraY);

    const sectors = getArenaSectorsGeometry();

    // Рендер секторов игроков
    sectors.forEach(sec => {
        arenaCtx.save();
        arenaCtx.beginPath();
        arenaCtx.moveTo(sec.polygon[0].x, sec.polygon[0].y);
        for (let i = 1; i < sec.polygon.length; i++) {
            arenaCtx.lineTo(sec.polygon[i].x, sec.polygon[i].y);
        }
        arenaCtx.closePath();

        let grad = arenaCtx.createRadialGradient(sec.centroid.x, sec.centroid.y, 50, sec.centroid.x, sec.centroid.y, WORLD_SIZE);
        grad.addColorStop(0, sec.color + '33');
        grad.addColorStop(1, '#0b0e14');
        arenaCtx.fillStyle = grad;
        arenaCtx.fill();

        if (arenaState === 'FINISHED' && arenaWinnerPlayer && arenaWinnerPlayer !== sec.player) {
            arenaCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            arenaCtx.fill();
        }

        arenaCtx.strokeStyle = sec.color;
        arenaCtx.lineWidth = 3;
        arenaCtx.stroke();
        arenaCtx.restore();

        // Аватарка в центроиде сектора
        drawAvatarCircle(userAvatarImg, sec.centroid.x, sec.centroid.y, 65, sec.color, sec.player.isUser && isUserAvatarLoaded, sec.player.name);
    });

    // Шлейф движения шайбы
    if (arenaState === 'SPINNING' && puck.trail.length > 0) {
        for (let i = 0; i < puck.trail.length; i++) {
            let tNode = puck.trail[i];
            let alpha = (i + 1) / puck.trail.length * 0.3;
            drawPuckRing(tNode.x, tNode.y, puck.radius, puck.holeRadius, alpha);
        }
    }

    if (showArrow) {
        drawAimingArrow(puck.x, puck.y, arrowAngle, puck.radius);
    }

    drawPuckRing(puck.x, puck.y, puck.radius, puck.holeRadius, 1.0);

    arenaCtx.restore();
    arenaCtx.restore();
}

function drawPuckRing(x, y, r, holeR, alpha = 1.0) {
    arenaCtx.save();
    arenaCtx.globalAlpha = alpha;

    arenaCtx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    arenaCtx.shadowBlur = 16;
    arenaCtx.shadowOffsetY = 4;

    arenaCtx.beginPath();
    arenaCtx.arc(x, y, r, 0, Math.PI * 2);
    arenaCtx.arc(x, y, holeR, 0, Math.PI * 2, true);
    arenaCtx.closePath();

    arenaCtx.fillStyle = '#ffffff';
    arenaCtx.fill();

    arenaCtx.shadowBlur = 0;
    arenaCtx.lineWidth = 2;
    arenaCtx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    arenaCtx.stroke();

    arenaCtx.strokeStyle = '#ffffff';
    arenaCtx.shadowColor = '#ffffff';
    arenaCtx.shadowBlur = 6;
    arenaCtx.lineWidth = 3.5;
    arenaCtx.lineCap = 'round';
    
    const crossLen = holeR * 0.65;
    arenaCtx.beginPath();
    arenaCtx.moveTo(x - crossLen, y);
    arenaCtx.lineTo(x + crossLen, y);
    arenaCtx.moveTo(x, y - crossLen);
    arenaCtx.lineTo(x, y + crossLen);
    arenaCtx.stroke();

    arenaCtx.shadowBlur = 0;
    arenaCtx.fillStyle = '#10b981';
    arenaCtx.beginPath();
    arenaCtx.arc(x, y, 2, 0, Math.PI * 2);
    arenaCtx.fill();

    arenaCtx.restore();
}

function drawAimingArrow(x, y, angle, puckRadius) {
    arenaCtx.save();
    arenaCtx.translate(x, y);
    arenaCtx.rotate(angle);

    arenaCtx.strokeStyle = '#ffffff';
    arenaCtx.shadowColor = '#10b981';
    arenaCtx.shadowBlur = 12;
    arenaCtx.lineWidth = 4;
    arenaCtx.lineCap = 'round';
    arenaCtx.lineJoin = 'round';

    const startOffset = puckRadius + 4;
    const arrowLength = 75;

    arenaCtx.beginPath();
    arenaCtx.moveTo(startOffset, 0);
    arenaCtx.lineTo(startOffset + arrowLength, 0);
    arenaCtx.stroke();

    arenaCtx.beginPath();
    const tipX = startOffset + arrowLength;
    arenaCtx.moveTo(tipX - 14, -9);
    arenaCtx.lineTo(tipX, 0);
    arenaCtx.lineTo(tipX - 14, 9);
    arenaCtx.stroke();

    arenaCtx.restore();
}

function drawAvatarCircle(img, x, y, r, borderCol, isLoaded, nameStr) {
    arenaCtx.save();
    arenaCtx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    arenaCtx.shadowBlur = 20;
    arenaCtx.shadowOffsetY = 6;
    
    arenaCtx.beginPath();
    arenaCtx.arc(x, y, r, 0, Math.PI * 2);
    arenaCtx.fillStyle = '#0f172a';
    arenaCtx.fill();
    arenaCtx.restore();

    arenaCtx.save();
    arenaCtx.beginPath();
    arenaCtx.arc(x, y, r, 0, Math.PI * 2);
    arenaCtx.closePath();
    arenaCtx.clip();

    if (isLoaded && img.complete && img.naturalWidth > 0) {
        arenaCtx.drawImage(img, x - r, y - r, r * 2, r * 2);
    } else {
        let grad = arenaCtx.createRadialGradient(x, y, 2, x, y, r);
        grad.addColorStop(0, borderCol);
        grad.addColorStop(1, '#0b0e14');
        arenaCtx.fillStyle = grad;
        arenaCtx.fill();

        arenaCtx.fillStyle = '#ffffff';
        arenaCtx.font = 'bold 24px sans-serif';
        arenaCtx.textAlign = 'center';
        arenaCtx.textBaseline = 'middle';
        arenaCtx.fillText(nameStr ? nameStr.substring(0, 2).toUpperCase() : "US", x, y);
    }
    arenaCtx.restore();

    arenaCtx.save();
    arenaCtx.shadowColor = borderCol;
    arenaCtx.shadowBlur = 12;
    arenaCtx.beginPath();
    arenaCtx.arc(x, y, r, 0, Math.PI * 2);
    arenaCtx.lineWidth = 3.5;
    arenaCtx.strokeStyle = borderCol;
    arenaCtx.stroke();
    arenaCtx.restore();
}

function triggerArenaSpin() {
    arenaState = 'SPINNING';
    saveArenaSession();
    if (arenaTimerText) arenaTimerText.innerText = "Выбор траектории...";
    if (arenaActionBtn) arenaActionBtn.style.display = 'none';

    puck.x = WORLD_SIZE / 2;
    puck.y = WORLD_SIZE / 2;
    puck.vx = 0;
    puck.vy = 0;
    puck.trail = [];

    aimStartTime = performance.now();
    finalAimAngle = Math.random() * Math.PI * 2;

    cancelAnimationFrame(arenaAnimId);
    runAimingLoop();
}

function runAimingLoop() {
    if (arenaState !== 'SPINNING') return;

    let elapsed = performance.now() - aimStartTime;
    let progress = Math.min(elapsed / aimDuration, 1.0);
    let easeProgress = 1 - Math.pow(1 - progress, 2);
    
    let totalSpins = Math.PI * 2 * 6;
    let currentArrowAngle = (totalSpins * easeProgress + finalAimAngle * progress) % (Math.PI * 2);

    redrawArena(WORLD_SIZE/2, WORLD_SIZE/2, 1.0, true, currentArrowAngle);

    if (progress < 1.0) {
        arenaAnimId = requestAnimationFrame(runAimingLoop);
    } else {
        startPuckFlight(finalAimAngle);
    }
}

let flightStartTime = 0;
let estimatedFlightDuration = 7000;

function startPuckFlight(angle) {
    const speed = 22 + Math.random() * 4;
    puck.vx = Math.cos(angle) * speed;
    puck.vy = Math.sin(angle) * speed;

    flightStartTime = performance.now();

    cancelAnimationFrame(arenaAnimId);
    runFlightLoop();
}

function runFlightLoop() {
    if (arenaState !== 'SPINNING') return;

    let currentSpeed = Math.hypot(puck.vx, puck.vy);
    if (currentSpeed < 2.5) {
        puck.friction = 0.88;
    } else {
        puck.friction = 0.993;
    }

    puck.x += puck.vx;
    puck.y += puck.vy;
    puck.vx *= puck.friction;
    puck.vy *= puck.friction;

    puck.trail.push({ x: puck.x, y: puck.y });
    if (puck.trail.length > 9) puck.trail.shift();

    let r = puck.radius;
    let hit = false;

    if (puck.x - r <= 0) { puck.x = r; puck.vx = Math.abs(puck.vx); hit = true; }
    else if (puck.x + r >= WORLD_SIZE) { puck.x = WORLD_SIZE - r; puck.vx = -Math.abs(puck.vx); hit = true; }

    if (puck.y - r <= 0) { puck.y = r; puck.vy = Math.abs(puck.vy); hit = true; }
    else if (puck.y + r >= WORLD_SIZE) { puck.y = WORLD_SIZE - r; puck.vy = -Math.abs(puck.vy); hit = true; }

    if (hit && tg && tg.HapticFeedback && currentSpeed > 3.0) {
        tg.HapticFeedback.impactOccurred('light');
    }

    let elapsedTime = performance.now() - flightStartTime;
    let timeRemaining = estimatedFlightDuration - elapsedTime;

    let targetCamX = WORLD_SIZE / 2;
    let targetCamY = WORLD_SIZE / 2;
    let targetZoom = 1.0;

    if (timeRemaining <= 3500 || currentSpeed < 3.0) {
        targetCamX = puck.x;
        targetCamY = puck.y;
        let zoomProgress = Math.min((3.0 - currentSpeed) / 2.5, 1.0);
        targetZoom = 1.0 + Math.max(zoomProgress, 0.5) * 1.3;
    }

    redrawArena(targetCamX, targetCamY, targetZoom, false, 0);

    if (currentSpeed < 0.25) {
        puck.vx = 0;
        puck.vy = 0;
        puck.trail = [];
        cancelAnimationFrame(arenaAnimId);
        determineArenaWinner();
    } else {
        arenaAnimId = requestAnimationFrame(runFlightLoop);
    }
}

function determineArenaWinner() {
    arenaState = 'FINISHED';
    clearArenaSession();
    
    const sectors = getArenaSectorsGeometry();
    let winner = arenaPlayers[0];

    // Определяем, в какой сектор попала шайба
    for (let sec of sectors) {
        let poly = sec.polygon;
        if (puck.x >= poly[0].x && puck.x <= poly[2].x && puck.y >= poly[0].y && puck.y <= poly[2].y) {
            winner = sec.player;
            break;
        }
    }
    arenaWinnerPlayer = winner;

    let totalPool = arenaTotalBank;
    let commission = totalPool * 0.25; 
    let netWin = totalPool - commission;

    let winnerPercent = ((winner.bet / totalPool) * 100).toFixed(1);
    let winnerHandleStr = winner.handle || (winner.isUser ? userHandle : "@" + winner.name.toLowerCase());

    redrawArena(puck.x, puck.y, 2.3, false, 0);

    if (winner.isUser) {
        addScore(netWin);
        if (arenaTimerText) arenaTimerText.innerText = `Вы выиграли +${netWin.toFixed(2)} GRAM!`;
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        if (arenaTimerText) arenaTimerText.innerText = `Победил ${winner.name}!`;
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    }

    setTimeout(() => {
        let badgeEl = document.getElementById('winModalBadgeText');
        let amountEl = document.getElementById('winModalAmountText');
        if (badgeEl) badgeEl.innerText = `${winnerHandleStr} • ${winnerPercent}%`;
        if (amountEl) amountEl.innerText = `+${netWin.toFixed(2)} GRAM`;
        if (arenaWinModal) arenaWinModal.style.display = 'flex';
    }, 800);
}