import { tg, score, subScore, addScore, isDemoMode, showToast, userId, userName, userHandle, initials } from './core.js';

let arenaState = 'IDLE'; // IDLE, WAITING, SPINNING, FINISHED
let arenaPlayers = []; 
let arenaTotalBank = 0;
let arenaTimer = 15;

const arenaCanvas = document.getElementById('arenaCanvas');
const arenaCtx = arenaCanvas ? arenaCanvas.getContext('2d') : null;
const arenaBetInput = document.getElementById('arenaBetInput');
const arenaActionBtn = document.getElementById('arenaActionBtn');
const arenaTimerText = document.getElementById('arenaTimerText');
const arenaTotalBankEl = document.getElementById('arenaTotalBank');
const arenaPlayersListEl = document.getElementById('arenaPlayersList');
const arenaWinModal = document.getElementById('arenaWinModal');

// Квадратный физический мир арены 800x800
const WORLD_SIZE = 800;

let puck = { 
    x: WORLD_SIZE / 2, 
    y: WORLD_SIZE / 2, 
    vx: 0, 
    vy: 0, 
    radius: 32, 
    holeRadius: 18, 
    trail: [] 
};

let arenaAnimId = null;
let currentZoom = 1.0;
let cameraX = WORLD_SIZE / 2;
let cameraY = WORLD_SIZE / 2;
let arenaWinnerPlayer = null;

// WebSocket подключение (замени URL на адрес твоего сервера, если он на хостинге)
const WS_URL = window.location.hostname === 'localhost' ? 'ws://localhost:8080' : 'wss://your-backend-domain.com';
let socket = null;

let userAvatarImg = new Image();
let isUserAvatarLoaded = false;
if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.photo_url) {
    userAvatarImg.src = tg.initDataUnsafe.user.photo_url;
    userAvatarImg.onload = function() {
        isUserAvatarLoaded = true;
        redrawArena();
    };
}

function initWebSocket() {
    if (socket && socket.readyState === WebSocket.OPEN) return;

    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
        console.log('[WebSocket] Подключено к Ice Arena');
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'INIT' || data.type === 'ROOM_UPDATE') {
                arenaPlayers = data.room ? data.room.players : data.players;
                arenaTotalBank = data.room ? data.room.totalBank : data.totalBank;
                updatePlayersUI();
            } 
            else if (data.type === 'TIMER_UPDATE') {
                arenaTimer = data.timer;
                if (arenaTimerText) arenaTimerText.innerText = `Старт через: ${arenaTimer}с`;
            } 
            else if (data.type === 'SPIN_START') {
                arenaState = 'SPINNING';
                if (arenaActionBtn) arenaActionBtn.style.display = 'none';
                if (arenaTimerText) arenaTimerText.innerText = "Шайба запущена!";
                
                // Находим победителя по данным с сервера
                arenaWinnerPlayer = arenaPlayers.find(p => p.id === data.winnerId) || arenaPlayers[0];
                
                // Запускаем анимацию полета шайбы к финишной точке
                startPuckFlightAnimation(data.stopX, data.netWin);
            } 
            else if (data.type === 'RESET_ROOM') {
                resetArenaVisuals();
            }
        } catch (e) {
            console.error('[WebSocket] Ошибка парсинга:', e);
        }
    };

    socket.onclose = () => {
        console.log('[WebSocket] Соединение закрыто. Переподключение...');
        setTimeout(initWebSocket, 3000);
    };
}

export function initArenaOnOpen() {
    initWebSocket();
    resetArenaVisuals();
}

export function resetArenaVisuals() {
    arenaState = 'IDLE';
    arenaWinnerPlayer = null;
    if (arenaWinModal) arenaWinModal.style.display = 'none';
    
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
    redrawArena();
}

function updateArenaActionButton() {
    if (!arenaActionBtn || arenaState === 'SPINNING') return;
    let betVal = parseFloat(arenaBetInput.value || 0.25).toFixed(2);
    arenaActionBtn.innerText = `Поставить ${betVal} GRAM`;
}

window.setArenaBet = function(val) {
    if (arenaState === 'SPINNING') return;
    if (arenaBetInput) arenaBetInput.value = val.toFixed(2);
    updateArenaActionButton();
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

if (arenaBetInput) {
    arenaBetInput.addEventListener('input', () => { updateArenaActionButton(); });
}

window.joinArenaGame = function() {
    if (isDemoMode) {
        showToast("PvP арена недоступна в демо-режиме!", false);
        return;
    }
    if (arenaState === 'SPINNING') return;
    let betVal = parseFloat(parseFloat(arenaBetInput.value || 0.25).toFixed(2));
    
    if (betVal < 0.25) { showToast('Минимальная ставка 0.25 GRAM!', false); return; }
    if (score < betVal) { showToast('Недостаточно GRAM на балансе!', false); return; }

    subScore(betVal);

    // Отправляем ставку на сервер
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'JOIN_ARENA',
            userId: userId,
            name: userName,
            bet: betVal
        }));
    }

    if (arenaActionBtn) {
        arenaActionBtn.innerText = "Вы в игре! Ожидание...";
        arenaActionBtn.style.background = "#64748b";
    }
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
};

function updatePlayersUI() {
    if (!arenaPlayersListEl) return;
    arenaPlayersListEl.innerHTML = '';

    let total = arenaTotalBank > 0 ? arenaTotalBank : 1;
    if (arenaTotalBankEl) arenaTotalBankEl.innerText = total.toFixed(2);

    arenaPlayers.forEach(p => {
        let percent = ((p.bet / total) * 100).toFixed(1);
        let initialsP = p.name ? p.name.substring(0, 2).toUpperCase() : "US";
        let isMe = p.id === userId;

        let card = document.createElement('div');
        card.classList.add('arena-player-card');
        card.innerHTML = `
            <div class="arena-player-left">
                <div class="arena-player-avatar" style="background: ${p.color}; box-shadow: 0 0 12px ${p.color}66;">${initialsP}</div>
                <div class="arena-player-info">
                    <h4>${p.name} ${isMe ? '(Вы)' : ''}</h4>
                    <p>Игрок</p>
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

function getArenaSectorsGeometry() {
    let total = arenaTotalBank > 0 ? arenaTotalBank : 1;
    let W = WORLD_SIZE;
    let H = WORLD_SIZE;
    let sectors = [];

    if (arenaPlayers.length === 0) {
        return [{ player: { name: 'Ожидание' }, polygon: [{x:0,y:0},{x:W,y:0},{x:W,y:H},{x:0,y:H}], centroid: {x:W/2, y:H/2}, color: '#334155' }];
    }

    // Делим квадратное поле на вертикальные секторы пропорционально ставкам игроков
    let currentX = 0;
    arenaPlayers.forEach(p => {
        let ratio = p.bet / total;
        let width = W * ratio;
        let nextX = currentX + width;

        sectors.push({
            player: p,
            polygon: [
                { x: currentX, y: 0 },
                { x: nextX, y: 0 },
                { x: nextX, y: H },
                { x: currentX, y: H }
            ],
            centroid: { x: currentX + width / 2, y: H / 2 },
            color: p.color || '#3b82f6'
        });
        currentX = nextX;
    });

    return sectors;
}

function redrawArena() {
    if (!arenaCtx || !arenaCanvas) return;

    syncCanvasSize();
    const w = arenaCanvas.width;
    const h = arenaCanvas.height;

    cameraX += (WORLD_SIZE / 2 - cameraX) * 0.12;
    cameraY += (WORLD_SIZE / 2 - cameraY) * 0.12;
    currentZoom += (1.0 - currentZoom) * 0.08;

    arenaCtx.clearRect(0, 0, w, h);

    arenaCtx.save();
    arenaCtx.translate(w / 2, h / 2);
    const baseScale = w / WORLD_SIZE;
    arenaCtx.scale(baseScale * currentZoom, baseScale * currentZoom);
    arenaCtx.translate(-cameraX, -cameraY);

    const sectors = getArenaSectorsGeometry();

    sectors.forEach(sec => {
        arenaCtx.save();
        arenaCtx.beginPath();
        arenaCtx.moveTo(sec.polygon[0].x, sec.polygon[0].y);
        for (let i = 1; i < sec.polygon.length; i++) {
            arenaCtx.lineTo(sec.polygon[i].x, sec.polygon[i].y);
        }
        arenaCtx.closePath();

        let grad = arenaCtx.createRadialGradient(sec.centroid.x, sec.centroid.y, 50, sec.centroid.x, sec.centroid.y, WORLD_SIZE);
        grad.addColorStop(0, sec.color + '44');
        grad.addColorStop(1, '#0b0e14');
        arenaCtx.fillStyle = grad;
        arenaCtx.fill();

        if (arenaState === 'FINISHED' && arenaWinnerPlayer && arenaWinnerPlayer.id !== sec.player.id) {
            arenaCtx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            arenaCtx.fill();
        }

        arenaCtx.strokeStyle = sec.color;
        arenaCtx.lineWidth = 3;
        arenaCtx.stroke();
        arenaCtx.restore();

        // Рисуем аватарку или инициалы в центре сектора
        drawAvatarCircle(userAvatarImg, sec.centroid.x, sec.centroid.y, 65, sec.color, sec.player.id === userId && isUserAvatarLoaded, sec.player.name);
    });

    drawPuckRing(puck.x, puck.y, puck.radius, puck.holeRadius, 1.0);

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

    arenaCtx.lineWidth = 2;
    arenaCtx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    arenaCtx.stroke();

    arenaCtx.strokeStyle = '#ffffff';
    arenaCtx.shadowColor = '#ffffff';
    arenaCtx.shadowBlur = 6;
    arenaCtx.lineWidth = 3.5;
    
    const crossLen = holeR * 0.65;
    arenaCtx.beginPath();
    arenaCtx.moveTo(x - crossLen, y);
    arenaCtx.lineTo(x + crossLen, y);
    arenaCtx.moveTo(x, y - crossLen);
    arenaCtx.lineTo(x, y + crossLen);
    arenaCtx.stroke();

    arenaCtx.restore();
}

function drawAvatarCircle(img, x, y, r, borderCol, isLoaded, nameStr) {
    arenaCtx.save();
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
        arenaCtx.fillStyle = borderCol;
        arenaCtx.fill();
        arenaCtx.fillStyle = '#ffffff';
        arenaCtx.font = 'bold 24px sans-serif';
        arenaCtx.textAlign = 'center';
        arenaCtx.textBaseline = 'middle';
        arenaCtx.fillText(nameStr ? nameStr.substring(0, 2).toUpperCase() : "US", x, y);
    }
    arenaCtx.restore();

    arenaCtx.save();
    arenaCtx.lineWidth = 3.5;
    arenaCtx.strokeStyle = borderCol;
    arenaCtx.stroke();
    arenaCtx.restore();
}

function startPuckFlightAnimation(stopXNormalized, netWin) {
    // Преобразуем серверный stopX (0-340) в координаты квадрата 0-800
    let targetX = (stopXNormalized / 340) * WORLD_SIZE;
    let targetY = WORLD_SIZE / 2 + (Math.random() * 100 - 50);

    let startX = WORLD_SIZE / 2;
    let startY = WORLD_SIZE / 2;
    let progress = 0;

    cancelAnimationFrame(arenaAnimId);

    function flightLoop() {
        progress += 0.03;
        if (progress >= 1.0) progress = 1.0;

        // Плавное движение шайбы к целевой точке победителя
        puck.x = startX + (targetX - startX) * easeOutCubic(progress);
        puck.y = startY + (targetY - startY) * easeOutCubic(progress);

        redrawArena();

        if (progress < 1.0) {
            arenaAnimId = requestAnimationFrame(flightLoop);
        } else {
            finishRound(netWin);
        }
    }
    flightLoop();
}

function easeOutCubic(x) {
    return 1 - Math.pow(1 - x, 3);
}

function finishRound(netWin) {
    arenaState = 'FINISHED';
    
    if (arenaWinnerPlayer && arenaWinnerPlayer.id === userId) {
        addScore(parseFloat(netWin));
        if (arenaTimerText) arenaTimerText.innerText = `Вы выиграли +${netWin} GRAM!`;
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        let winnerName = arenaWinnerPlayer ? arenaWinnerPlayer.name : 'Соперник';
        if (arenaTimerText) arenaTimerText.innerText = `Победил ${winnerName}!`;
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    }

    setTimeout(() => {
        let badgeEl = document.getElementById('winModalBadgeText');
        let amountEl = document.getElementById('winModalAmountText');
        if (badgeEl) badgeEl.innerText = `${arenaWinnerPlayer ? arenaWinnerPlayer.name : 'Победитель'}`;
        if (amountEl) amountEl.innerText = `+${netWin} GRAM`;
        if (arenaWinModal) arenaWinModal.style.display = 'flex';
    }, 600);
}

window.closeArenaWinModal = function() {
    if (arenaWinModal) arenaWinModal.style.display = 'none';
    resetArenaVisuals();
};