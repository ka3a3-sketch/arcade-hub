// --- START OF FILE escape.js ---

import { tg, score, updateBalance, addCashback, isDemoMode, showToast, initials, apiCall } from './core.js';

const escapeCanvas = document.getElementById('escapeCanvas');
const escapeCtx = escapeCanvas ? escapeCanvas.getContext('2d') : null;
const escapeBetInput = document.getElementById('escapeBetInput');
const escapeActionBtn = document.getElementById('escapeActionBtn');
const escapeBalanceDisplay = document.getElementById('escapeBalanceDisplay');
const escapeFastBtn = document.getElementById('escapeFastBtn');

// Математические константы
const W = 380; 
const H = 420;
const CX = W / 2;
const CY = 170; 
const RING_RADIUS = 110;
const BALL_RADIUS = 14;

// Настройка разрыва (10-11 часов -> от 210 до 240 градусов)
// В Canvas 0 это справа, Пи - слева, -Пи/2 - сверху.
// 210-240 град = от -2.61 до -2.09 радиан
const GAP_START = -2.61;
const GAP_END = -2.09;

// Состояние
let escapeState = 'IDLE'; // IDLE, PLAYING, RESULT
let escapeMultiplier = 0.00;
let currentBetAmount = 0.10;
let isFastMode = false;

// Анимация и предрасчет
let playbackFrames = []; // Массив попиксельных координат
let currentFrameIndex = 0;
let escapeAnimId = null;
let sparks = [];
let multiplierScale = 1.0;
let floatingUI = { active: false, text: "", color: "", y: 0, alpha: 0 };

// Аватар игрока
const avatarImg = new Image();
let avatarLoaded = false;
try {
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (tgUser && tgUser.photo_url) {
        avatarImg.crossOrigin = "Anonymous";
        avatarImg.src = tgUser.photo_url;
        avatarImg.onload = () => { avatarLoaded = true; drawEscapeFrame(); };
    }
} catch (e) { console.log(e); }

export function updateEscapeBalanceUI() {
    if (escapeBalanceDisplay) {
        let currency = isDemoMode ? "DEMO" : "GRAM";
        escapeBalanceDisplay.innerText = `${score.toFixed(2)} ${currency}`;
    }
}

window.multiplyEscapeBet = function(factor) {
    if (escapeState !== 'IDLE') return;
    let val = parseFloat((parseFloat(escapeBetInput.value || 0.10) * factor).toFixed(2));
    if (val < 0.10) val = 0.10;
    escapeBetInput.value = val;
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

window.maxEscapeBet = function() {
    if (escapeState !== 'IDLE') return;
    if (score < 0.10) { showToast('Мин. ставка 0.10!', false); return; }
    escapeBetInput.value = parseFloat(score.toFixed(2));
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

window.toggleEscapeFastMode = function() {
    isFastMode = !isFastMode;
    escapeFastBtn.style.background = isFastMode ? '#3B82F6' : '#1C222D';
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
};

export function resetEscapeVisuals() {
    if (!escapeCtx) return;
    escapeState = 'IDLE';
    escapeMultiplier = 0.00;
    playbackFrames = [];
    currentFrameIndex = 0;
    sparks = [];
    floatingUI.active = false;
    updateEscapeBalanceUI();
    if (escapeCanvas) { escapeCanvas.width = W; escapeCanvas.height = H; }
    drawEscapeFrame();
}

window.startEscapeGame = async function() {
    if (escapeState !== 'IDLE' || !escapeBetInput) return;
    currentBetAmount = parseFloat(parseFloat(escapeBetInput.value || 0.10).toFixed(2));

    if (currentBetAmount < 0.10) { showToast('Мин. ставка 0.10!', false); return; }
    if (score < currentBetAmount) { showToast('Недостаточно средств!', false); return; }

    escapeActionBtn.innerText = "Подключение...";
    escapeActionBtn.style.background = "#374151";
    escapeActionBtn.disabled = true;

    try {
        let response = await apiCall('/api/escape/play', { bet: currentBetAmount, is_demo: isDemoMode });
        
        if (!response || response.error) {
            throw new Error(response?.error || "Ошибка соединения");
        }

        let targetMultiplier = response.multiplier;
        let isWin = response.is_win;
        let winAmount = response.win_amount;
        let targetBounces = Math.round(targetMultiplier / 0.10); 
        
        updateBalance(response.new_balance - winAmount); 
        updateEscapeBalanceUI();
        addCashback(currentBetAmount * 0.15);

        // 1. ДЕТЕРМИНИРОВАННЫЙ ПРЕДРАСЧЕТ ПУТИ ДО НАЧАЛА АНИМАЦИИ
        generateDeterministicPath(targetBounces, isWin);

        // 2. ЗАПУСК ПЛЕЕРА
        escapeState = 'PLAYING';
        escapeMultiplier = 0.00;
        currentFrameIndex = 0;
        sparks = [];
        floatingUI.active = false;
        
        escapeActionBtn.innerText = "В игре...";
        if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('heavy');
        
        cancelAnimationFrame(escapeAnimId);
        playTrajectory(response.new_balance, winAmount, isWin);

    } catch (e) {
        showToast(e.message, false);
        escapeActionBtn.innerText = "Играть"; 
        escapeActionBtn.style.background = "#10B981";
        escapeActionBtn.disabled = false;
    }
};

// --- МАТЕМАТИКА ТРАЕКТОРИИ (БЕЗ КОЛЛИЗИЙ В РЕАЛЬНОМ ВРЕМЕНИ) ---

function isAngleInGap(angle) {
    let a = angle;
    // Нормализация к -PI .. PI
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return (a >= GAP_START && a <= GAP_END);
}

// Поиск пересечения луча и окружности
function rayIntersectCircle(px, py, dx, dy) {
    let ox = px - CX;
    let oy = py - CY;
    let a = dx * dx + dy * dy;
    let b = 2 * (ox * dx + oy * dy);
    let r = RING_RADIUS - BALL_RADIUS;
    let c = (ox * ox + oy * oy) - (r * r);
    
    let det = b * b - 4 * a * c;
    if (det > 0) {
        let t = (-b + Math.sqrt(det)) / (2 * a);
        return { x: px + t * dx, y: py + t * dy };
    }
    return { x: px, y: py };
}

function generateDeterministicPath(targetBounces, isWin) {
    playbackFrames = [];
    let speed = isFastMode ? 14 : 7;
    let maxAttempts = 5000;
    
    let pathFound = false;
    let waypoints = [];

    // Monte-Carlo алгоритм поиска идеального вектора
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        let currentBounces = 0;
        let px = CX; let py = CY;
        let angle = Math.random() * Math.PI * 2;
        let tempWaypoints = [{x: px, y: py, event: 'start'}];
        let valid = true;

        while (currentBounces <= targetBounces) {
            let dx = Math.cos(angle);
            let dy = Math.sin(angle);
            let hit = rayIntersectCircle(px, py, dx, dy);
            let hitAngle = Math.atan2(hit.y - CY, hit.x - CX);
            let inGap = isAngleInGap(hitAngle);

            if (currentBounces < targetBounces) {
                if (inGap) { valid = false; break; } // Вылетел слишком рано
                
                tempWaypoints.push({x: hit.x, y: hit.y, event: 'bounce'});
                currentBounces++;
                
                // Отражение вектора от нормали круга
                let nx = (hit.x - CX) / (RING_RADIUS - BALL_RADIUS);
                let ny = (hit.y - CY) / (RING_RADIUS - BALL_RADIUS);
                let dot = dx * nx + dy * ny;
                let rx = dx - 2 * dot * nx;
                let ry = dy - 2 * dot * ny;
                angle = Math.atan2(ry, rx);
                px = hit.x; py = hit.y;
            } else {
                if (!inGap) { valid = false; break; } // Не попал в разрыв на нужном отскоке
                tempWaypoints.push({x: hit.x, y: hit.y, event: 'exit', vx: dx * speed, vy: dy * speed});
                break;
            }
        }

        if (valid) {
            waypoints = tempWaypoints;
            pathFound = true;
            break;
        }
    }

    // Если рандом не нашел (почти невозможно), строим хардкод-путь по центру
    if (!pathFound) waypoints = buildFallbackPath(targetBounces);

    // Раскатываем waypoints в массив покадровых пикселей (интерполяция)
    for (let i = 0; i < waypoints.length - 1; i++) {
        let p1 = waypoints[i];
        let p2 = waypoints[i+1];
        let dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        let steps = Math.floor(dist / speed) || 1;
        
        for (let s = 0; s <= steps; s++) {
            let t = s / steps;
            playbackFrames.push({
                x: p1.x + (p2.x - p1.x) * t,
                y: p1.y + (p2.y - p1.y) * t,
                event: (s === steps && p2.event !== 'exit') ? p2.event : null
            });
        }
    }

    // Добавляем гравитационное падение от точки exit
    let exitNode = waypoints[waypoints.length - 1];
    let fx = exitNode.x; let fy = exitNode.y;
    let fvx = exitNode.vx; let fvy = exitNode.vy;
    let grav = isFastMode ? 0.8 : 0.4;
    
    while (fy < H + 30) {
        fvy += grav;
        // Управление в воздухе (направление в зеленую/красную зону)
        if (isWin) { // Левая половина (Green)
            if (fx > CX - 50) fvx -= (isFastMode ? 0.6 : 0.3);
        } else { // Правая половина (Red)
            if (fx < CX + 50) fvx += (isFastMode ? 0.6 : 0.3);
        }
        fx += fvx; fy += fvy;
        playbackFrames.push({ x: fx, y: fy, event: 'fall' });
    }
    // Фрейм финала
    playbackFrames.push({ x: fx, y: fy, event: 'finish' });
}

function buildFallbackPath(targetBounces) {
    let arr = [{x: CX, y: CY, event: 'start'}];
    let side = 1;
    for(let i=0; i<targetBounces; i++) {
        arr.push({x: CX + (RING_RADIUS - BALL_RADIUS)*side, y: CY, event: 'bounce'});
        side *= -1;
    }
    arr.push({x: CX + Math.cos(-2.35)*RING_RADIUS, y: CY + Math.sin(-2.35)*RING_RADIUS, event:'exit', vx: -2, vy: -5});
    return arr;
}

// --- ПЛЕЕР И РЕНДЕР ---

function playTrajectory(finalBalance, winAmount, isWin) {
    if (currentFrameIndex >= playbackFrames.length) return;
    
    let frame = playbackFrames[currentFrameIndex];
    
    if (frame.event === 'bounce') {
        escapeMultiplier += 0.10;
        multiplierScale = 1.3;
        spawnSparks(frame.x, frame.y);
        if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    }
    
    if (frame.event === 'finish') {
        escapeState = 'RESULT';
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred(isWin ? 'success' : 'error');
        floatingUI = {
            active: true,
            text: isWin ? `+${winAmount.toFixed(2)}` : "0.00",
            color: isWin ? "#10B981" : "#EF4444",
            y: H - 80, alpha: 1.0
        };
        updateBalance(finalBalance);
        updateEscapeBalanceUI();
        
        escapeActionBtn.innerText = "Играть";
        escapeActionBtn.style.background = "#10B981";
        escapeActionBtn.disabled = false;
    }

    if (multiplierScale > 1.0) multiplierScale += (1.0 - multiplierScale) * 0.1;
    sparks.forEach(s => { s.x += s.vx; s.y += s.vy; s.life -= 0.05; });
    sparks = sparks.filter(s => s.life > 0);

    if (floatingUI.active) {
        floatingUI.y -= 1;
        floatingUI.alpha -= 0.01;
        if (floatingUI.alpha <= 0) escapeState = 'IDLE';
    }

    drawEscapeFrame(frame.x, frame.y);
    
    if (escapeState !== 'IDLE') {
        currentFrameIndex++;
        escapeAnimId = requestAnimationFrame(() => playTrajectory(finalBalance, winAmount, isWin));
    }
}

function spawnSparks(x, y) {
    for (let i = 0; i < 5; i++) {
        let angle = Math.random() * Math.PI * 2;
        let sp = Math.random() * 4 + 1;
        sparks.push({x: x, y: y, vx: Math.cos(angle)*sp, vy: Math.sin(angle)*sp, life: 1.0});
    }
}

function drawEscapeFrame(bx = CX, by = CY) {
    if (!escapeCtx) return;
    escapeCtx.clearRect(0, 0, W, H);

    // 1. Полосы зон (Лево - WIN Зеленый, Право - LOSE Красный)
    const zoneH = 50;
    
    // Зеленая зона (лево)
    let gGrad = escapeCtx.createLinearGradient(0, H - zoneH, 0, H);
    gGrad.addColorStop(0, 'rgba(16, 185, 129, 0.0)');
    gGrad.addColorStop(1, 'rgba(16, 185, 129, 0.5)');
    escapeCtx.fillStyle = gGrad;
    escapeCtx.fillRect(0, H - zoneH, CX, zoneH);
    escapeCtx.beginPath(); escapeCtx.moveTo(0, H - zoneH); escapeCtx.lineTo(CX, H - zoneH);
    escapeCtx.strokeStyle = '#10B981'; escapeCtx.lineWidth = 3; escapeCtx.stroke();
    
    // Красная зона (право)
    let rGrad = escapeCtx.createLinearGradient(CX, H - zoneH, CX, H);
    rGrad.addColorStop(0, 'rgba(239, 68, 68, 0.0)');
    rGrad.addColorStop(1, 'rgba(239, 68, 68, 0.5)');
    escapeCtx.fillStyle = rGrad;
    escapeCtx.fillRect(CX, H - zoneH, CX, zoneH);
    escapeCtx.beginPath(); escapeCtx.moveTo(CX, H - zoneH); escapeCtx.lineTo(W, H - zoneH);
    escapeCtx.strokeStyle = '#EF4444'; escapeCtx.lineWidth = 3; escapeCtx.stroke();

    // 2. Синее Неоновое Кольцо
    escapeCtx.beginPath();
    // Рисуем дугу от конца разрыва до начала разрыва (чтобы осталась дырка)
    escapeCtx.arc(CX, CY, RING_RADIUS, GAP_END, GAP_START, false);
    escapeCtx.strokeStyle = '#3B82F6';
    escapeCtx.lineWidth = 4;
    escapeCtx.lineCap = 'round';
    escapeCtx.shadowColor = '#3B82F6';
    escapeCtx.shadowBlur = 15;
    escapeCtx.stroke();
    escapeCtx.shadowBlur = 0;

    // 3. Множитель в центре
    escapeCtx.save();
    escapeCtx.translate(CX, CY);
    escapeCtx.scale(multiplierScale, multiplierScale);
    escapeCtx.fillStyle = '#FFFFFF';
    escapeCtx.font = '900 48px sans-serif';
    escapeCtx.textAlign = 'center';
    escapeCtx.textBaseline = 'middle';
    escapeCtx.fillText(escapeMultiplier.toFixed(2) + 'x', 0, 0);
    escapeCtx.restore();

    // 4. Искры
    sparks.forEach(s => {
        escapeCtx.globalAlpha = Math.max(0, s.life);
        escapeCtx.fillStyle = '#FFFFFF';
        escapeCtx.beginPath(); escapeCtx.arc(s.x, s.y, 2, 0, Math.PI*2); escapeCtx.fill();
    });
    escapeCtx.globalAlpha = 1.0;

    // 5. Шарик / Аватар
    if (escapeState === 'PLAYING' || escapeState === 'RESULT') {
        escapeCtx.save();
        escapeCtx.translate(bx, by);
        
        escapeCtx.beginPath();
        escapeCtx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
        
        // Окантовка шарика
        escapeCtx.lineWidth = 2;
        escapeCtx.strokeStyle = '#FFFFFF';
        escapeCtx.stroke();
        
        // Обрезка и вставка фото
        escapeCtx.clip();
        if (avatarLoaded) {
            escapeCtx.drawImage(avatarImg, -BALL_RADIUS, -BALL_RADIUS, BALL_RADIUS*2, BALL_RADIUS*2);
        } else {
            escapeCtx.fillStyle = '#3B82F6';
            escapeCtx.fillRect(-BALL_RADIUS, -BALL_RADIUS, BALL_RADIUS*2, BALL_RADIUS*2);
        }
        escapeCtx.restore();
    }

    // 6. Плашка выигрыша/проигрыша
    if (floatingUI.active) {
        escapeCtx.globalAlpha = Math.max(0, floatingUI.alpha);
        escapeCtx.fillStyle = floatingUI.color;
        escapeCtx.font = '900 32px sans-serif';
        escapeCtx.textAlign = 'center';
        escapeCtx.fillText(floatingUI.text, bx, floatingUI.y);
        escapeCtx.globalAlpha = 1.0;
    }
}

// Отрисовка пустого кадра при загрузке
drawEscapeFrame();

// --- END OF FILE escape.js ---