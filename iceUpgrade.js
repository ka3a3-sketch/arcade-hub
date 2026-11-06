import { tg, score, subScore, addScore, isDemoMode, showToast, updateBalance, initials } from './core.js';

const upgradeCanvas = document.getElementById('upgradeCanvas');
const upgradeCtx = upgradeCanvas ? upgradeCanvas.getContext('2d') : null;
const upgradeBetInput = document.getElementById('upgradeBetInput');
const upgradeChanceRange = document.getElementById('upgradeChanceRange');
const upgradeChanceVal = document.getElementById('upgradeChanceVal');
const upgradeMultVal = document.getElementById('upgradeMultVal');
const upgradeActionBtn = document.getElementById('upgradeActionBtn');
const upgradeCanvasWrap = document.getElementById('upgradeCanvasWrap');

let upgradeState = 'IDLE'; 
let upgradeChance = 66; 
let upgradeMultiplier = 1.48;

// Параметры физики шайбы
let upgradePuck = { x: 140, y: 140, vx: 0, vy: 0, radius: 12, speed: 0 };
let upgradeAnimId = null;
let upgradeStartTime = 0;
let totalFlightDuration = 6000; // Общее время раунда до остановки
let isZoomingActive = false;

// Аватары
let userAvatarImg = new Image();
let isUserAvatarLoaded = false;
let botAvatarImg = new Image();
botAvatarImg.src = "https://i.ibb.co/5X5521g3/image.jpg"; // Логотип бота / пика
let isBotAvatarLoaded = false;

botAvatarImg.onload = function() {
    isBotAvatarLoaded = true;
    drawUpgradeFrame();
};

// Получаем аватарку из Telegram WebApp API, если доступна
if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.photo_url) {
    userAvatarImg.src = tg.initDataUnsafe.user.photo_url;
    userAvatarImg.onload = function() {
        isUserAvatarLoaded = true;
        drawUpgradeFrame();
    };
}

window.updateUpgradeChance = function(val) {
    if (upgradeState === 'SPINNING') return;
    upgradeChance = parseInt(val);
    
    // Формула коэффициента с учетом маржи
    let rawMult = 98 / upgradeChance;
    upgradeMultiplier = parseFloat(rawMult.toFixed(2));

    if (upgradeChanceVal) upgradeChanceVal.innerText = upgradeChance;
    if (upgradeMultVal) upgradeMultVal.innerText = upgradeMultiplier + 'x';
    
    drawUpgradeFrame();
};

window.multiplyUpgradeBet = function(factor) {
    if (upgradeState === 'SPINNING' || !upgradeBetInput) return;
    let val = parseFloat((parseFloat(upgradeBetInput.value || 0.25) * factor).toFixed(2));
    if (val < 0.25) val = 0.25;
    if (val > 5.0) val = 5.0;
    upgradeBetInput.value = val;
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

window.maxUpgradeBet = function() {
    if (upgradeState === 'SPINNING' || !upgradeBetInput) return;
    let maxAllowed = score > 5.0 ? 5.0 : score;
    if (maxAllowed < 0.25) { showToast('Недостаточно средств!', false); return; }
    upgradeBetInput.value = parseFloat(maxAllowed.toFixed(2));
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

export function drawUpgradeFrame(cameraX = 140, cameraY = 140, zoomScale = 1) {
    if (!upgradeCtx) return;
    
    let w = upgradeCanvas.width;
    let h = upgradeCanvas.height;
    let cx = w / 2, cy = h / 2;
    let radius = Math.max(w, h) * 2;

    upgradeCtx.clearRect(0, 0, w, h);
    upgradeCtx.save();

    // Реализация кинематографической камеры (Zoom & Follow)
    if (isZoomingActive) {
        upgradeCtx.translate(cx, cy);
        upgradeCtx.scale(zoomScale, zoomScale);
        upgradeCtx.translate(-cameraX, -cameraY);
    }

    let playerAngleSpan = (upgradeChance / 100) * (Math.PI * 2);

    // Сектор бота (Тёмно-серый / красный акцент)
    upgradeCtx.beginPath();
    upgradeCtx.moveTo(cx, cy);
    upgradeCtx.arc(cx, cy, radius, playerAngleSpan, Math.PI * 2, false);
    upgradeCtx.lineTo(cx, cy);
    upgradeCtx.fillStyle = '#1e1b4b'; 
    upgradeCtx.fill();
    upgradeCtx.lineWidth = 1.5;
    upgradeCtx.strokeStyle = '#312e81';
    upgradeCtx.stroke();

    // Сектор игрока (Зеленый сектор)
    upgradeCtx.beginPath();
    upgradeCtx.moveTo(cx, cy);
    upgradeCtx.arc(cx, cy, radius, 0, playerAngleSpan, false);
    upgradeCtx.lineTo(cx, cy);
    upgradeCtx.fillStyle = '#064e3b'; 
    upgradeCtx.fill();
    upgradeCtx.lineWidth = 1.5;
    upgradeCtx.strokeStyle = '#10b981';
    upgradeCtx.stroke();

    // Разделительные линии секторов
    upgradeCtx.save();
    upgradeCtx.strokeStyle = '#38bdf8';
    upgradeCtx.lineWidth = 2;
    [0, playerAngleSpan].forEach(angle => {
        upgradeCtx.beginPath();
        upgradeCtx.moveTo(cx, cy);
        upgradeCtx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        upgradeCtx.stroke();
    });
    upgradeCtx.restore();

    // Размещение аватарок по центрам секторов
    let greenMidAngle = playerAngleSpan / 2;
    let redMidAngle = playerAngleSpan + (Math.PI * 2 - playerAngleSpan) / 2;
    let iconDist = 75;

    let greenIconX = cx + Math.cos(greenMidAngle) * iconDist;
    let greenIconY = cy + Math.sin(greenMidAngle) * iconDist;
    let redIconX = cx + Math.cos(redMidAngle) * iconDist;
    let redIconY = cy + Math.sin(redMidAngle) * iconDist;

    drawSectorAvatar(greenIconX, greenIconY, initials, '#10b981', userAvatarImg, isUserAvatarLoaded);
    drawBotAvatar(redIconX, redIconY, '#818cf8', botAvatarImg, isBotAvatarLoaded);

    // Отрисовка шайбы
    upgradeCtx.save();
    upgradeCtx.beginPath();
    upgradeCtx.arc(upgradePuck.x, upgradePuck.y, upgradePuck.radius, 0, Math.PI * 2);
    upgradeCtx.fillStyle = '#ffffff';
    upgradeCtx.shadowColor = '#38bdf8';
    upgradeCtx.shadowBlur = 12;
    upgradeCtx.fill();
    upgradeCtx.shadowBlur = 0;
    upgradeCtx.lineWidth = 2.5;
    upgradeCtx.strokeStyle = '#0f172a';
    upgradeCtx.stroke();

    // Мини-инициалы внутри шайбы
    upgradeCtx.fillStyle = '#000000';
    upgradeCtx.font = 'bold 8px sans-serif';
    upgradeCtx.textAlign = 'center';
    upgradeCtx.textBaseline = 'middle';
    upgradeCtx.fillText(initials, upgradePuck.x, upgradePuck.y);
    upgradeCtx.restore();

    upgradeCtx.restore();
}

function drawSectorAvatar(x, y, text, borderColor, imgObj, isLoaded) {
    upgradeCtx.save();
    upgradeCtx.beginPath();
    upgradeCtx.arc(x, y, 18, 0, Math.PI * 2);
    upgradeCtx.closePath();
    upgradeCtx.clip();

    if (isLoaded) {
        upgradeCtx.drawImage(imgObj, x - 18, y - 18, 36, 36);
    } else {
        upgradeCtx.fillStyle = '#065f46';
        upgradeCtx.fill();
        upgradeCtx.fillStyle = '#ffffff';
        upgradeCtx.font = 'bold 10px sans-serif';
        upgradeCtx.textAlign = 'center';
        upgradeCtx.textBaseline = 'middle';
        upgradeCtx.fillText(text, x, y);
    }
    upgradeCtx.restore();

    upgradeCtx.save();
    upgradeCtx.beginPath();
    upgradeCtx.arc(x, y, 18, 0, Math.PI * 2);
    upgradeCtx.lineWidth = 2.5;
    upgradeCtx.strokeStyle = borderColor;
    upgradeCtx.stroke();
    upgradeCtx.restore();
}

function drawBotAvatar(x, y, borderColor, imgObj, isLoaded) {
    upgradeCtx.save();
    upgradeCtx.beginPath();
    upgradeCtx.arc(x, y, 18, 0, Math.PI * 2);
    upgradeCtx.closePath();
    upgradeCtx.clip(); 

    if (isLoaded) {
        upgradeCtx.drawImage(imgObj, x - 18, y - 18, 36, 36);
    } else {
        upgradeCtx.fillStyle = '#334155';
        upgradeCtx.fill();
    }
    upgradeCtx.restore();

    upgradeCtx.save();
    upgradeCtx.beginPath();
    upgradeCtx.arc(x, y, 18, 0, Math.PI * 2);
    upgradeCtx.lineWidth = 2.5;
    upgradeCtx.strokeStyle = borderColor;
    upgradeCtx.stroke();
    upgradeCtx.restore();
}

window.startIceUpgrade = function startIceUpgrade() {
    if (upgradeState === 'SPINNING') return;
    let betVal = parseFloat(parseFloat(upgradeBetInput.value || 0.25).toFixed(2));

    if (betVal < 0.25) { showToast('Минимальная ставка 0.25 GRAM!', false); return; }
    if (betVal > 5.0) { showToast('Максимальная ставка 5.0 GRAM!', false); return; }
    if (score < betVal) { showToast('Недостаточно GRAM на балансе!', false); return; }

    subScore(betVal);

    upgradeState = 'SPINNING';
    isZoomingActive = false;

    if (upgradeChanceRange) upgradeChanceRange.disabled = true;
    if (upgradeBetInput) upgradeBetInput.disabled = true;
    if (upgradeActionBtn) {
        upgradeActionBtn.innerText = "Шайба в игре...";
        upgradeActionBtn.style.background = "#64748b";
    }

    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

    // Честная физика: рандомный запуск шайбы из центра
    upgradePuck.x = 140; 
    upgradePuck.y = 140;
    let startAngle = Math.random() * Math.PI * 2;
    upgradePuck.speed = 8 + Math.random() * 4;
    upgradePuck.vx = Math.cos(startAngle) * upgradePuck.speed;
    upgradePuck.vy = Math.sin(startAngle) * upgradePuck.speed;

    upgradeStartTime = Date.now();
    cancelAnimationFrame(upgradeAnimId);
    runUpgradeLoop(betVal);
};

function runUpgradeLoop(betVal) {
    if (upgradeState !== 'SPINNING') return;

    let elapsed = Date.now() - upgradeStartTime;
    let timeRemaining = totalFlightDuration - elapsed;

    // Плавное замедление (трение поля)
    let friction = 0.982;
    upgradePuck.vx *= friction;
    upgradePuck.vy *= friction;

    upgradePuck.x += upgradePuck.vx;
    upgradePuck.y += upgradePuck.vy;

    // Столкновения со стенками квадрата (размеры холста 280х280, границы 15 - 265)
    let minBound = 15 + upgradePuck.radius;
    let maxBound = 265 - upgradePuck.radius;
    let hitWall = false;

    if (upgradePuck.x <= minBound) { upgradePuck.x = minBound; upgradePuck.vx = -upgradePuck.vx * 0.85; hitWall = true; }
    else if (upgradePuck.x >= maxBound) { upgradePuck.x = maxBound; upgradePuck.vx = -upgradePuck.vx * 0.85; hitWall = true; }

    if (upgradePuck.y <= minBound) { upgradePuck.y = minBound; upgradePuck.vy = -upgradePuck.vy * 0.85; hitWall = true; }
    else if (upgradePuck.y >= maxBound) { upgradePuck.y = maxBound; upgradePuck.vy = -upgradePuck.vy * 0.85; hitWall = true; }

    if (hitWall && tg && tg.HapticFeedback && Math.hypot(upgradePuck.vx, upgradePuck.vy) > 1) {
        tg.HapticFeedback.impactOccurred('light');
    }

    let currentSpeed = Math.hypot(upgradePuck.vx, upgradePuck.vy);

    // Активация кино-зума за 4.5 секунды до конца или при сильном замедлении
    if (elapsed > 1500 || currentSpeed < 2.5) {
        isZoomingActive = true;
    }

    // Расчет параметров камеры для плавного преследования шайбы (Lerp)
    let targetCameraX = upgradePuck.x;
    let targetCameraY = upgradePuck.y;
    
    // Плавная интерполяция смещения камеры
    let camX = 140, camY = 140;
    camX += (targetCameraX - camX) * 0.1;
    camY += (targetCameraY - camY) * 0.1;
    
    let targetZoom = isZoomingActive ? 2.2 : 1.0;

    drawUpgradeFrame(camX, camY, targetZoom);

    // Условие полной остановки шайбы
    if (elapsed >= totalFlightDuration || currentSpeed < 0.08) {
        cancelAnimationFrame(upgradeAnimId);
        resolveUpgradeWinner(betVal);
    } else {
        upgradeAnimId = requestAnimationFrame(() => runUpgradeLoop(betVal));
    }
}

function resolveUpgradeWinner(betVal) {
    upgradeState = 'FINISHED';
    let currencyName = isDemoMode ? "DEMO" : "GRAM";

    let cx = 140, cy = 140;
    
    // Вычисление угла остановки шайбы относительно центра поля
    let dx = upgradePuck.x - cx;
    let dy = upgradePuck.y - cy;
    let stopAngle = Math.atan2(dy, dx);
    if (stopAngle < 0) stopAngle += Math.PI * 2;

    let playerAngleSpan = (upgradeChance / 100) * (Math.PI * 2);
    let boundaryTolerance = 0.03; // Зона неопределенности (линия границы)

    let isLineCollision = Math.abs(stopAngle - 0) < boundaryTolerance || 
                          Math.abs(stopAngle - playerAngleSpan) < boundaryTolerance ||
                          Math.abs(stopAngle - Math.PI * 2) < boundaryTolerance;

    if (isLineCollision) {
        // Автоматическая переигровка при попадании ровно на линию
        showToast('Шайба на линии! Переигровка раунда.', false);
        addScore(betVal); // Возврат ставки
        setTimeout(() => {
            resetUpgradeVisuals();
        }, 1500);
        return;
    }

    let isPlayerWin = stopAngle >= 0 && stopAngle <= playerAngleSpan;

    // Возвращаем камеру в исходное положение для фиксации финала
    isZoomingActive = true;
    drawUpgradeFrame(upgradePuck.x, upgradePuck.y, 2.2);

    if (isPlayerWin) {
        let winAmount = parseFloat((betVal * upgradeMultiplier).toFixed(2));
        addScore(winAmount);
        showToast(`Победа! +${winAmount} ${currencyName}`, true);
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        showToast(`Поражение! Шайба в зоне бота.`, false);
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    }

    setTimeout(() => {
        resetUpgradeVisuals();
    }, 2000);
}

export function resetUpgradeVisuals() {
    upgradeState = 'IDLE';
    isZoomingActive = false;
    upgradePuck.x = 140;
    upgradePuck.y = 140;
    
    if (upgradeChanceRange) upgradeChanceRange.disabled = false;
    if (upgradeBetInput) upgradeBetInput.disabled = false;
    if (upgradeActionBtn) {
        upgradeActionBtn.innerText = "Сделать ставку";
        upgradeActionBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
    }
    window.updateUpgradeChance(upgradeChanceRange ? upgradeChanceRange.value : 66);
}