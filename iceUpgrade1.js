import { tg, score, subScore, addScore, isDemoMode, showToast } from './core.js';

const upgradeCanvas = document.getElementById('upgradeCanvas');
const upgradeCtx = upgradeCanvas ? upgradeCanvas.getContext('2d') : null;
const upgradeBetInput = document.getElementById('upgradeBetInput');
const upgradeChanceRange = document.getElementById('upgradeChanceRange');
const upgradeChanceVal = document.getElementById('upgradeChanceVal');
const upgradeMultVal = document.getElementById('upgradeMultVal');
const upgradeActionBtn = document.getElementById('upgradeActionBtn');
const upgradeCanvasWrap = document.getElementById('upgradeCanvasWrap');

let upgradeState = 'IDLE'; // IDLE, AIMING, SPINNING, FINISHED
let upgradeChance = 50; // Старт по умолчанию 50%
let upgradeMultiplier = 1.96;

// Фиксированный размер физического игрового мира (800x800)
const WORLD_SIZE = 800;
const S_TOTAL = WORLD_SIZE * WORLD_SIZE;

// Параметры шайбы (кольцо-бублик)
let upgradePuck = { 
    x: WORLD_SIZE / 2, 
    y: WORLD_SIZE / 2, 
    vx: 0, 
    vy: 0, 
    radius: 28, 
    holeRadius: 16,     
    friction: 0.993,
    trail: []           
};

let upgradeAnimId = null;
let currentZoom = 1.0;
let cameraX = WORLD_SIZE / 2;
let cameraY = WORLD_SIZE / 2;

// Параметры стрелки (3 сек)
let aimStartTime = 0;
let aimDuration = 3000;
let finalAimAngle = 0;

// Аватары
let userAvatarImg = new Image();
let isUserAvatarLoaded = false;
let botAvatarImg = new Image();
let isBotAvatarLoaded = false;

// Плавные координаты для аватарок (lerp)
let currentAvatarUser = { x: WORLD_SIZE * 0.7, y: WORLD_SIZE * 0.3 };
let currentAvatarBot = { x: WORLD_SIZE * 0.2, y: WORLD_SIZE * 0.8 };

// Загрузка логотипа бота
botAvatarImg.src = "bot-logo.png";
botAvatarImg.onload = function() {
    isBotAvatarLoaded = true;
    if (upgradeState === 'IDLE') redraw();
};

if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.photo_url) {
    userAvatarImg.src = tg.initDataUnsafe.user.photo_url;
    userAvatarImg.onload = function() {
        isUserAvatarLoaded = true;
        if (upgradeState === 'IDLE') redraw();
    };
}

function syncCanvasSize() {
    if (!upgradeCanvas) return;
    const rect = upgradeCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const displaySize = Math.max(rect.width || 360, 320);

    if (upgradeCanvas.width !== displaySize * dpr) {
        upgradeCanvas.width = displaySize * dpr;
        upgradeCanvas.height = displaySize * dpr;
    }
}

function redraw() {
    syncCanvasSize();
    drawFrame(WORLD_SIZE / 2, WORLD_SIZE / 2, 1.0, 0, false);
}

window.addEventListener('resize', redraw);

// Обработчик ползунка шанса с лимитами [30% - 75%]
window.updateUpgradeChance = function(val) {
    if (upgradeState === 'SPINNING' || upgradeState === 'AIMING') return;
    
    let parsedVal = parseInt(val);
    // Строгая валидация лимитов шанса
    if (parsedVal < 30) parsedVal = 30;
    if (parsedVal > 75) parsedVal = 75;
    
    upgradeChance = parsedVal;
    if (upgradeChanceRange && upgradeChanceRange.value != upgradeChance) {
        upgradeChanceRange.value = upgradeChance;
    }
    
    let rawMult = 98 / upgradeChance;
    upgradeMultiplier = parseFloat(rawMult.toFixed(2));

    if (upgradeChanceVal) upgradeChanceVal.innerText = upgradeChance;
    if (upgradeMultVal) upgradeMultVal.innerText = upgradeMultiplier + 'x';
    
    redraw();
};

window.multiplyUpgradeBet = function(factor) {
    if (upgradeState !== 'IDLE' || !upgradeBetInput) return;
    let val = parseFloat((parseFloat(upgradeBetInput.value || 0.25) * factor).toFixed(2));
    if (val < 0.25) val = 0.25;
    if (val > 2.0) val = 2.0; // Максимум ставки 2.0 GRAM
    upgradeBetInput.value = val;
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

window.maxUpgradeBet = function() {
    if (upgradeState !== 'IDLE' || !upgradeBetInput) return;
    // Максимум из баланса, но не более 2.0 GRAM
    let maxAllowed = score > 2.0 ? 2.0 : score;
    if (maxAllowed < 0.25) { showToast('Недостаточно средств!', false); return; }
    upgradeBetInput.value = parseFloat(maxAllowed.toFixed(2));
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

/**
 * РАСЧЕТ ГЕОМЕТРИИ СЕКТОРОВ И ЦЕНТРОИДОВ
 */
function getSectorGeometry(chance) {
    const pBot = Math.max(0.01, Math.min(0.99, (100 - chance) / 100));
    const sBot = S_TOTAL * pBot;
    const legBot = Math.sqrt(2 * sBot); 

    const W = WORLD_SIZE;
    const H = WORLD_SIZE;

    const botTriangle = [
        { x: 0, y: H },
        { x: 0, y: H - legBot },
        { x: legBot, y: H }
    ];

    const greenPolygon = [
        { x: 0, y: 0 },
        { x: W, y: 0 },
        { x: W, y: H },
        { x: legBot, y: H },
        { x: 0, y: H - legBot }
    ];

    const botCentroid = {
        x: legBot / 3,
        y: H - legBot / 3
    };

    const botRadius = Math.max(22, Math.min(65, legBot * 0.28));

    const greenCentroid = {
        x: W - (W - legBot * 0.5) * 0.42,
        y: (H - legBot * 0.5) * 0.42
    };

    return {
        botTriangle,
        greenPolygon,
        legBot,
        botCentroid,
        botRadius,
        greenCentroid
    };
}

function isPointInTriangle(pt, tri) {
    const [p0, p1, p2] = tri;
    const A = 1/2 * (-p1.y * p2.x + p0.y * (-p1.x + p2.x) + p0.x * (p1.y - p2.y) + p1.x * p2.y);
    const sign = A < 0 ? -1 : 1;
    const s = (p0.y * p2.x - p0.x * p2.y + (p2.y - p0.y) * pt.x + (p0.x - p2.x) * pt.y) * sign;
    const t = (p0.x * p1.y - p0.y * p1.x + (p0.y - p1.y) * pt.x + (p1.x - p0.x) * pt.y) * sign;
    
    return s > 0 && t > 0 && (s + t) < 2 * A * sign;
}

/**
 * ОТРИСОВКА С ЖЕСТКОЙ ИЗОЛЯЦИЕЙ КАМЕРЫ И МАСКОЙ ХОЛСТА
 */
function drawFrame(targetCamX, targetCamY, targetZoom = 1.0, arrowAngle = 0, showArrow = false) {
    if (!upgradeCtx || !upgradeCanvas) return;

    syncCanvasSize();
    const w = upgradeCanvas.width;
    const h = upgradeCanvas.height;

    // Плавное слежение камеры
    cameraX += (targetCamX - cameraX) * 0.12;
    cameraY += (targetCamY - cameraY) * 0.12;
    currentZoom += (targetZoom - currentZoom) * 0.08;

    // 1. Очистка всего физического холста
    upgradeCtx.clearRect(0, 0, w, h);

    // 2. СТРОГАЯ МАСКА ИЗОЛЯЦИИ: Физическое отсечение по скругленному контуру арены
    upgradeCtx.save();
    upgradeCtx.beginPath();
    const cornerRadius = 28 * (w / 360); // Соответствует радиусу CSS рамки контейнера
    if (typeof upgradeCtx.roundRect === 'function') {
        upgradeCtx.roundRect(0, 0, w, h, cornerRadius);
    } else {
        upgradeCtx.rect(0, 0, w, h);
    }
    upgradeCtx.clip(); // Ни один пиксель графики не выйдет за эти пределы

    // 3. Локальные трансформации камеры и зума применяются СТРОГО внутри маски
    upgradeCtx.save();
    upgradeCtx.translate(w / 2, h / 2);
    
    // Динамический масштаб для адаптации WORLD_SIZE (800) под текущий физический размер canvas
    const baseScale = w / WORLD_SIZE;
    const finalScale = baseScale * currentZoom;
    upgradeCtx.scale(finalScale, finalScale);
    
    upgradeCtx.translate(-cameraX, -cameraY);

    const geo = getSectorGeometry(upgradeChance);

    // Отрисовка секторов
    let greenGrad = upgradeCtx.createRadialGradient(WORLD_SIZE/2, WORLD_SIZE/2, 100, WORLD_SIZE/2, WORLD_SIZE/2, WORLD_SIZE);
    greenGrad.addColorStop(0, '#1a3d12');
    greenGrad.addColorStop(1, '#0b1f09');

    upgradeCtx.fillStyle = greenGrad;
    upgradeCtx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    upgradeCtx.fillStyle = 'rgba(166, 255, 0, 0.16)';
    upgradeCtx.beginPath();
    upgradeCtx.moveTo(geo.greenPolygon[0].x, geo.greenPolygon[0].y);
    for (let i = 1; i < geo.greenPolygon.length; i++) {
        upgradeCtx.lineTo(geo.greenPolygon[i].x, geo.greenPolygon[i].y);
    }
    upgradeCtx.closePath();
    upgradeCtx.fill();

    upgradeCtx.fillStyle = '#12161e';
    upgradeCtx.beginPath();
    upgradeCtx.moveTo(geo.botTriangle[0].x, geo.botTriangle[0].y);
    upgradeCtx.lineTo(geo.botTriangle[1].x, geo.botTriangle[1].y);
    upgradeCtx.lineTo(geo.botTriangle[2].x, geo.botTriangle[2].y);
    upgradeCtx.closePath();
    upgradeCtx.fill();

    upgradeCtx.strokeStyle = '#00ffcc';
    upgradeCtx.shadowColor = '#00ffcc';
    upgradeCtx.shadowBlur = 12;
    upgradeCtx.lineWidth = 2.5;
    upgradeCtx.beginPath();
    upgradeCtx.moveTo(geo.botTriangle[1].x, geo.botTriangle[1].y);
    upgradeCtx.lineTo(geo.botTriangle[2].x, geo.botTriangle[2].y);
    upgradeCtx.stroke();
    upgradeCtx.shadowBlur = 0; 

    // Интерполяция аватарок
    currentAvatarUser.x += (geo.greenCentroid.x - currentAvatarUser.x) * 0.15;
    currentAvatarUser.y += (geo.greenCentroid.y - currentAvatarUser.y) * 0.15;
    currentAvatarBot.x += (geo.botCentroid.x - currentAvatarBot.x) * 0.15;
    currentAvatarBot.y += (geo.botCentroid.y - currentAvatarBot.y) * 0.15;

    drawAvatarCircle(userAvatarImg, currentAvatarUser.x, currentAvatarUser.y, 65, '#a6ff00', isUserAvatarLoaded, true);
    drawAvatarCircle(botAvatarImg, currentAvatarBot.x, currentAvatarBot.y, geo.botRadius, '#00ffcc', isBotAvatarLoaded, false);

    // Шлейф движения шайбы
    if (upgradeState === 'SPINNING' && upgradePuck.trail.length > 0) {
        for (let i = 0; i < upgradePuck.trail.length; i++) {
            let tNode = upgradePuck.trail[i];
            let alpha = (i + 1) / upgradePuck.trail.length * 0.3;
            drawPuckRing(tNode.x, tNode.y, upgradePuck.radius, upgradePuck.holeRadius, alpha);
        }
    }

    if (showArrow) {
        drawAimingArrow(upgradePuck.x, upgradePuck.y, arrowAngle, upgradePuck.radius);
    }

    drawPuckRing(upgradePuck.x, upgradePuck.y, upgradePuck.radius, upgradePuck.holeRadius, 1.0);

    upgradeCtx.restore(); // восстановление локальных трансфомаций внутри маски
    upgradeCtx.restore(); // закрытие общего clip-контекста холста
}

function drawPuckRing(x, y, r, holeR, alpha = 1.0) {
    upgradeCtx.save();
    upgradeCtx.globalAlpha = alpha;

    upgradeCtx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    upgradeCtx.shadowBlur = 16;
    upgradeCtx.shadowOffsetX = 0;
    upgradeCtx.shadowOffsetY = 4;

    upgradeCtx.beginPath();
    upgradeCtx.arc(x, y, r, 0, Math.PI * 2);
    upgradeCtx.arc(x, y, holeR, 0, Math.PI * 2, true);
    upgradeCtx.closePath();

    upgradeCtx.fillStyle = '#ffffff';
    upgradeCtx.fill();

    upgradeCtx.shadowBlur = 0;
    upgradeCtx.lineWidth = 2;
    upgradeCtx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    upgradeCtx.stroke();

    upgradeCtx.strokeStyle = '#ffffff';
    upgradeCtx.shadowColor = '#ffffff';
    upgradeCtx.shadowBlur = 6;
    upgradeCtx.lineWidth = 3.5;
    upgradeCtx.lineCap = 'round';
    
    const crossLen = holeR * 0.65;
    upgradeCtx.beginPath();
    upgradeCtx.moveTo(x - crossLen, y);
    upgradeCtx.lineTo(x + crossLen, y);
    upgradeCtx.moveTo(x, y - crossLen);
    upgradeCtx.lineTo(x, y + crossLen);
    upgradeCtx.stroke();

    upgradeCtx.shadowBlur = 0;
    upgradeCtx.fillStyle = '#a6ff00';
    upgradeCtx.beginPath();
    upgradeCtx.arc(x, y, 2, 0, Math.PI * 2);
    upgradeCtx.fill();

    upgradeCtx.restore();
}

function drawAimingArrow(x, y, angle, puckRadius) {
    upgradeCtx.save();
    upgradeCtx.translate(x, y);
    upgradeCtx.rotate(angle);

    upgradeCtx.strokeStyle = '#ffffff';
    upgradeCtx.fillStyle = 'transparent';
    upgradeCtx.shadowColor = '#00ffcc';
    upgradeCtx.shadowBlur = 12;
    upgradeCtx.lineWidth = 4;
    upgradeCtx.lineCap = 'round';
    upgradeCtx.lineJoin = 'round';

    const startOffset = puckRadius + 4;
    const arrowLength = 75;

    upgradeCtx.beginPath();
    upgradeCtx.moveTo(startOffset, 0);
    upgradeCtx.lineTo(startOffset + arrowLength, 0);
    upgradeCtx.stroke();

    upgradeCtx.beginPath();
    const tipX = startOffset + arrowLength;
    upgradeCtx.moveTo(tipX - 14, -9);
    upgradeCtx.lineTo(tipX, 0);
    upgradeCtx.lineTo(tipX - 14, 9);
    upgradeCtx.stroke();

    upgradeCtx.restore();
}

function drawAvatarCircle(img, x, y, r, borderCol, isLoaded, isUser) {
    upgradeCtx.save();
    upgradeCtx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    upgradeCtx.shadowBlur = 20;
    upgradeCtx.shadowOffsetX = 0;
    upgradeCtx.shadowOffsetY = 6;
    
    upgradeCtx.beginPath();
    upgradeCtx.arc(x, y, r, 0, Math.PI * 2);
    upgradeCtx.fillStyle = '#0f172a';
    upgradeCtx.fill();
    upgradeCtx.restore();

    upgradeCtx.save();
    upgradeCtx.beginPath();
    upgradeCtx.arc(x, y, r, 0, Math.PI * 2);
    upgradeCtx.closePath();
    upgradeCtx.clip();

    if (isLoaded && img.complete && img.naturalWidth > 0) {
        upgradeCtx.drawImage(img, x - r, y - r, r * 2, r * 2);
    } else {
        let grad = upgradeCtx.createRadialGradient(x, y, 2, x, y, r);
        if (isUser) {
            grad.addColorStop(0, '#38bdf8');
            grad.addColorStop(1, '#1d4ed8');
        } else {
            grad.addColorStop(0, '#334155');
            grad.addColorStop(1, '#0f172a');
        }
        upgradeCtx.fillStyle = grad;
        upgradeCtx.fill();
    }
    upgradeCtx.restore();

    upgradeCtx.save();
    upgradeCtx.shadowColor = borderCol;
    upgradeCtx.shadowBlur = 8;
    upgradeCtx.beginPath();
    upgradeCtx.arc(x, y, r, 0, Math.PI * 2);
    upgradeCtx.lineWidth = 3;
    upgradeCtx.strokeStyle = borderCol;
    upgradeCtx.stroke();
    upgradeCtx.restore();
}

window.startIceUpgrade = function startIceUpgrade() {
    if (upgradeState !== 'IDLE') return;
    
    // Валидация ставки перед запуском [0.25 - 2.0]
    let betVal = parseFloat(parseFloat(upgradeBetInput.value || 0.25).toFixed(2));
    if (betVal < 0.25) betVal = 0.25;
    if (betVal > 2.0) betVal = 2.0;
    upgradeBetInput.value = betVal;

    if (score < betVal) { showToast('Недостаточно GRAM на балансе!', false); return; }

    subScore(betVal);

    upgradeState = 'AIMING';
    currentZoom = 1.0;
    cameraX = WORLD_SIZE / 2;
    cameraY = WORLD_SIZE / 2;

    if (upgradeChanceRange) upgradeChanceRange.disabled = true;
    if (upgradeBetInput) upgradeBetInput.disabled = true;
    if (upgradeActionBtn) {
        upgradeActionBtn.innerText = "Выбор траектории...";
        upgradeActionBtn.style.background = "#4b5563";
    }

    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

    upgradePuck.x = WORLD_SIZE / 2;
    upgradePuck.y = WORLD_SIZE / 2;
    upgradePuck.vx = 0;
    upgradePuck.vy = 0;
    upgradePuck.trail = [];

    aimStartTime = performance.now();
    finalAimAngle = Math.random() * Math.PI * 2;

    cancelAnimationFrame(upgradeAnimId);
    runAimingLoop(betVal);
};

function runAimingLoop(betVal) {
    if (upgradeState !== 'AIMING') return;

    let elapsed = performance.now() - aimStartTime;
    let progress = Math.min(elapsed / aimDuration, 1.0);
    let easeProgress = 1 - Math.pow(1 - progress, 2);
    
    let totalSpins = Math.PI * 2 * 6;
    let currentArrowAngle = (totalSpins * easeProgress + finalAimAngle * progress) % (Math.PI * 2);

    drawFrame(WORLD_SIZE / 2, WORLD_SIZE / 2, 1.0, currentArrowAngle, true);

    if (progress < 1.0) {
        upgradeAnimId = requestAnimationFrame(() => runAimingLoop(betVal));
    } else {
        startPuckFlight(finalAimAngle, betVal);
    }
}

let flightStartTime = 0;
let estimatedFlightDuration = 8000;

function startPuckFlight(angle, betVal) {
    upgradeState = 'SPINNING';
    const speed = 20 + Math.random() * 4;
    upgradePuck.vx = Math.cos(angle) * speed;
    upgradePuck.vy = Math.sin(angle) * speed;

    flightStartTime = performance.now();

    cancelAnimationFrame(upgradeAnimId);
    runFlightLoop(betVal);
}

function runFlightLoop(betVal) {
    if (upgradeState !== 'SPINNING') return;

    let currentSpeed = Math.hypot(upgradePuck.vx, upgradePuck.vy);
    if (currentSpeed < 2.5) {
        upgradePuck.friction = 0.89;
    } else {
        upgradePuck.friction = 0.993;
    }

    upgradePuck.x += upgradePuck.vx;
    upgradePuck.y += upgradePuck.vy;
    upgradePuck.vx *= upgradePuck.friction;
    upgradePuck.vy *= upgradePuck.friction;

    upgradePuck.trail.push({ x: upgradePuck.x, y: upgradePuck.y });
    if (upgradePuck.trail.length > 9) {
        upgradePuck.trail.shift();
    }

    let r = upgradePuck.radius;
    let hit = false;

    if (upgradePuck.x - r <= 0) {
        upgradePuck.x = r;
        upgradePuck.vx = Math.abs(upgradePuck.vx);
        hit = true;
    } else if (upgradePuck.x + r >= WORLD_SIZE) {
        upgradePuck.x = WORLD_SIZE - r;
        upgradePuck.vx = -Math.abs(upgradePuck.vx);
        hit = true;
    }

    if (upgradePuck.y - r <= 0) {
        upgradePuck.y = r;
        upgradePuck.vy = Math.abs(upgradePuck.vy);
        hit = true;
    } else if (upgradePuck.y + r >= WORLD_SIZE) {
        upgradePuck.y = WORLD_SIZE - r;
        upgradePuck.vy = -Math.abs(upgradePuck.vy);
        hit = true;
    }

    if (hit && tg && tg.HapticFeedback && currentSpeed > 3.0) {
        tg.HapticFeedback.impactOccurred('light');
    }

    let speed = Math.hypot(upgradePuck.vx, upgradePuck.vy);

    let elapsedTime = performance.now() - flightStartTime;
    let timeRemaining = estimatedFlightDuration - elapsedTime;

    let targetCamX = WORLD_SIZE / 2;
    let targetCamY = WORLD_SIZE / 2;
    let targetZoom = 1.0;

    if (timeRemaining <= 4000 || speed < 3.2) {
        targetCamX = upgradePuck.x;
        targetCamY = upgradePuck.y;
        let zoomProgress = Math.min((3.2 - speed) / 3.0, 1.0);
        targetZoom = 1.0 + Math.max(zoomProgress, 0.5) * 1.3; 
    }

    drawFrame(targetCamX, targetCamY, targetZoom, 0, false);

    if (speed < 0.25) {
        upgradePuck.vx = 0;
        upgradePuck.vy = 0;
        upgradePuck.trail = [];
        cancelAnimationFrame(upgradeAnimId);
        resolveWinner(betVal);
    } else {
        upgradeAnimId = requestAnimationFrame(() => runFlightLoop(betVal));
    }
}

function resolveWinner(betVal) {
    upgradeState = 'FINISHED';
    let currencyName = isDemoMode ? "DEMO" : "GRAM";

    const geo = getSectorGeometry(upgradeChance);

    const isBotWin = isPointInTriangle({ x: upgradePuck.x, y: upgradePuck.y }, geo.botTriangle);
    const isPlayerWin = !isBotWin;

    const p1 = { x: 0, y: WORLD_SIZE - geo.legBot };
    const p2 = { x: geo.legBot, y: WORLD_SIZE };
    const lineDist = distToSegment({ x: upgradePuck.x, y: upgradePuck.y }, p1, p2);

    drawFrame(upgradePuck.x, upgradePuck.y, 2.3, 0, false);

    if (lineDist <= upgradePuck.radius * 0.3) {
        showToast('Шайба на линии! Авто-переигровка.', false);
        addScore(betVal);
        setTimeout(resetUpgradeVisuals, 1500);
        return;
    }

    if (isPlayerWin) {
        let winAmount = parseFloat((betVal * upgradeMultiplier).toFixed(2));
        addScore(winAmount);
        showToast(`Победа! +${winAmount} ${currencyName}`, true);
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        showToast(`Шайба у бота. Попробуйте еще раз!`, false);
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    }

    setTimeout(resetUpgradeVisuals, 2200);
}

function distToSegment(p, p1, p2) {
    let l2 = (p2.x - p1.x)*(p2.x - p1.x) + (p2.y - p1.y)*(p2.y - p1.y);
    if (l2 === 0) return Math.hypot(p.x - p1.x, p.y - p1.y);
    let t = ((p.x - p1.x)*(p2.x - p1.x) + (p.y - p1.y)*(p2.y - p1.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (p1.x + t * (p2.x - p1.x)), p.y - (p1.y + t * (p2.y - p1.y)));
}

export function resetUpgradeVisuals() {
    upgradeState = 'IDLE';
    currentZoom = 1.0;
    cameraX = WORLD_SIZE / 2;
    cameraY = WORLD_SIZE / 2;
    upgradePuck.x = WORLD_SIZE / 2;
    upgradePuck.y = WORLD_SIZE / 2;
    upgradePuck.vx = 0;
    upgradePuck.vy = 0;
    upgradePuck.trail = [];
    
    if (upgradeChanceRange) upgradeChanceRange.disabled = false;
    if (upgradeBetInput) upgradeBetInput.disabled = false;
    if (upgradeActionBtn) {
        upgradeActionBtn.innerText = "Сделать ставку";
        upgradeActionBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
    }
    redraw();
}