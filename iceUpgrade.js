// --- START OF FILE iceUpgrade.js ---

import { tg, score, updateBalance, addCashback, isDemoMode, showToast, apiCall } from './core.js';

const upgradeCanvas = document.getElementById('upgradeCanvas');
const upgradeCtx = upgradeCanvas ? upgradeCanvas.getContext('2d') : null;
const upgradeBetInput = document.getElementById('upgradeBetInput');
const upgradeChanceRange = document.getElementById('upgradeChanceRange');
const upgradeChanceVal = document.getElementById('upgradeChanceVal');
const upgradeMultVal = document.getElementById('upgradeMultVal');
const upgradeActionBtn = document.getElementById('upgradeActionBtn');

let upgradeState = 'IDLE'; 
let upgradeChance = 50; 
let upgradeMultiplier = 1.96;

const WORLD_SIZE = 800;
const S_TOTAL = WORLD_SIZE * WORLD_SIZE;

let upgradePuck = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, radius: 28, holeRadius: 16, trail: [] };

let upgradeAnimId = null;
let currentZoom = 1.0;
let cameraX = WORLD_SIZE / 2;
let cameraY = WORLD_SIZE / 2;
let aimStartTime = 0;

// [ФИКС] Добавлены переменные для уникализации анимации
let dynamicSpinTarget = 0; 
let dynamicCurveIntensity = 0; 
let dynamicCurveDirection = 1;

let userAvatarImg = new Image();
let isUserAvatarLoaded = false;
let botAvatarImg = new Image();
let isBotAvatarLoaded = false;

let currentAvatarUser = { x: WORLD_SIZE * 0.7, y: WORLD_SIZE * 0.3 };
let currentAvatarBot = { x: WORLD_SIZE * 0.2, y: WORLD_SIZE * 0.8 };

botAvatarImg.src = "bot-logo.png";
botAvatarImg.onload = function() { isBotAvatarLoaded = true; if (upgradeState === 'IDLE') redraw(); };

if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.photo_url) {
    userAvatarImg.src = tg.initDataUnsafe.user.photo_url;
    userAvatarImg.onload = function() { isUserAvatarLoaded = true; if (upgradeState === 'IDLE') redraw(); };
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

window.updateUpgradeChance = function(val) {
    if (upgradeState === 'SPINNING' || upgradeState === 'AIMING') return;
    let parsedVal = parseInt(val);
    if (parsedVal < 30) parsedVal = 30;
    if (parsedVal > 75) parsedVal = 75;
    
    upgradeChance = parsedVal;
    if (upgradeChanceRange && upgradeChanceRange.value != upgradeChance) upgradeChanceRange.value = upgradeChance;
    
    upgradeMultiplier = parseFloat((98 / upgradeChance).toFixed(2));
    if (upgradeChanceVal) upgradeChanceVal.innerText = upgradeChance;
    if (upgradeMultVal) upgradeMultVal.innerText = upgradeMultiplier + 'x';
    redraw();
};

window.multiplyUpgradeBet = function(factor) {
    if (upgradeState !== 'IDLE' || !upgradeBetInput) return;
    let val = parseFloat((parseFloat(upgradeBetInput.value || 0.25) * factor).toFixed(2));
    if (val < 0.25) val = 0.25;
    if (val > 2.0) val = 2.0; 
    upgradeBetInput.value = val;
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

window.maxUpgradeBet = function() {
    if (upgradeState !== 'IDLE' || !upgradeBetInput) return;
    let maxAllowed = score > 2.0 ? 2.0 : score;
    if (maxAllowed < 0.25) { showToast('Недостаточно средств!', false); return; }
    upgradeBetInput.value = parseFloat(maxAllowed.toFixed(2));
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

function getSectorGeometry(chance) {
    const pBot = Math.max(0.01, Math.min(0.99, (100 - chance) / 100));
    const sBot = S_TOTAL * pBot;
    const legBot = Math.sqrt(2 * sBot); 
    const W = WORLD_SIZE, H = WORLD_SIZE;

    const botTriangle = [{ x: 0, y: H }, { x: 0, y: H - legBot }, { x: legBot, y: H }];
    const greenPolygon = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: legBot, y: H }, { x: 0, y: H - legBot }];
    const botCentroid = { x: legBot / 3, y: H - legBot / 3 };
    const botRadius = Math.max(22, Math.min(65, legBot * 0.28));
    const greenCentroid = { x: W - (W - legBot * 0.5) * 0.42, y: (H - legBot * 0.5) * 0.42 };

    return { botTriangle, greenPolygon, legBot, botCentroid, botRadius, greenCentroid };
}

function drawFrame(targetCamX, targetCamY, targetZoom = 1.0, arrowAngle = 0, showArrow = false) {
    if (!upgradeCtx || !upgradeCanvas) return;
    syncCanvasSize();
    const w = upgradeCanvas.width, h = upgradeCanvas.height;

    cameraX += (targetCamX - cameraX) * 0.12;
    cameraY += (targetCamY - cameraY) * 0.12;
    currentZoom += (targetZoom - currentZoom) * 0.08;

    upgradeCtx.clearRect(0, 0, w, h);
    upgradeCtx.save();
    upgradeCtx.beginPath();
    const cornerRadius = 28 * (w / 360); 
    if (typeof upgradeCtx.roundRect === 'function') upgradeCtx.roundRect(0, 0, w, h, cornerRadius);
    else upgradeCtx.rect(0, 0, w, h);
    upgradeCtx.clip(); 

    upgradeCtx.save();
    upgradeCtx.translate(w / 2, h / 2);
    const baseScale = w / WORLD_SIZE;
    upgradeCtx.scale(baseScale * currentZoom, baseScale * currentZoom);
    upgradeCtx.translate(-cameraX, -cameraY);

    const geo = getSectorGeometry(upgradeChance);

    let greenGrad = upgradeCtx.createRadialGradient(WORLD_SIZE/2, WORLD_SIZE/2, 100, WORLD_SIZE/2, WORLD_SIZE/2, WORLD_SIZE);
    greenGrad.addColorStop(0, '#1a3d12'); greenGrad.addColorStop(1, '#0b1f09');
    upgradeCtx.fillStyle = greenGrad;
    upgradeCtx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    upgradeCtx.fillStyle = 'rgba(166, 255, 0, 0.16)';
    upgradeCtx.beginPath();
    upgradeCtx.moveTo(geo.greenPolygon[0].x, geo.greenPolygon[0].y);
    for (let i = 1; i < geo.greenPolygon.length; i++) upgradeCtx.lineTo(geo.greenPolygon[i].x, geo.greenPolygon[i].y);
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

    currentAvatarUser.x += (geo.greenCentroid.x - currentAvatarUser.x) * 0.15;
    currentAvatarUser.y += (geo.greenCentroid.y - currentAvatarUser.y) * 0.15;
    currentAvatarBot.x += (geo.botCentroid.x - currentAvatarBot.x) * 0.15;
    currentAvatarBot.y += (geo.botCentroid.y - currentAvatarBot.y) * 0.15;

    drawAvatarCircle(userAvatarImg, currentAvatarUser.x, currentAvatarUser.y, 65, '#a6ff00', isUserAvatarLoaded, true);
    drawAvatarCircle(botAvatarImg, currentAvatarBot.x, currentAvatarBot.y, geo.botRadius, '#00ffcc', isBotAvatarLoaded, false);

    if (upgradeState === 'SPINNING' && upgradePuck.trail.length > 0) {
        for (let i = 0; i < upgradePuck.trail.length; i++) {
            let tNode = upgradePuck.trail[i];
            let alpha = (i + 1) / upgradePuck.trail.length * 0.3;
            drawPuckRing(tNode.x, tNode.y, upgradePuck.radius, upgradePuck.holeRadius, alpha);
        }
    }

    if (showArrow) drawAimingArrow(upgradePuck.x, upgradePuck.y, arrowAngle, upgradePuck.radius);
    drawPuckRing(upgradePuck.x, upgradePuck.y, upgradePuck.radius, upgradePuck.holeRadius, 1.0);

    upgradeCtx.restore(); 
    upgradeCtx.restore(); 
}

function drawPuckRing(x, y, r, holeR, alpha = 1.0) {
    upgradeCtx.save();
    upgradeCtx.globalAlpha = alpha;
    upgradeCtx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    upgradeCtx.shadowBlur = 16;
    upgradeCtx.shadowOffsetY = 4;

    upgradeCtx.beginPath(); upgradeCtx.arc(x, y, r, 0, Math.PI * 2);
    upgradeCtx.arc(x, y, holeR, 0, Math.PI * 2, true); upgradeCtx.closePath();
    upgradeCtx.fillStyle = '#ffffff'; upgradeCtx.fill();
    upgradeCtx.shadowBlur = 0; upgradeCtx.lineWidth = 2;
    upgradeCtx.strokeStyle = 'rgba(255, 255, 255, 0.95)'; upgradeCtx.stroke();

    upgradeCtx.strokeStyle = '#ffffff'; upgradeCtx.shadowColor = '#ffffff'; upgradeCtx.shadowBlur = 6;
    upgradeCtx.lineWidth = 3.5; upgradeCtx.lineCap = 'round';
    
    const crossLen = holeR * 0.65;
    upgradeCtx.beginPath();
    upgradeCtx.moveTo(x - crossLen, y); upgradeCtx.lineTo(x + crossLen, y);
    upgradeCtx.moveTo(x, y - crossLen); upgradeCtx.lineTo(x, y + crossLen);
    upgradeCtx.stroke();
    upgradeCtx.restore();
}

function drawAimingArrow(x, y, angle, puckRadius) {
    upgradeCtx.save();
    upgradeCtx.translate(x, y); upgradeCtx.rotate(angle);
    upgradeCtx.strokeStyle = '#ffffff'; upgradeCtx.shadowColor = '#00ffcc';
    upgradeCtx.shadowBlur = 12; upgradeCtx.lineWidth = 4; upgradeCtx.lineCap = 'round';

    const startOffset = puckRadius + 4; const arrowLength = 75;
    upgradeCtx.beginPath(); upgradeCtx.moveTo(startOffset, 0); upgradeCtx.lineTo(startOffset + arrowLength, 0); upgradeCtx.stroke();
    upgradeCtx.beginPath();
    const tipX = startOffset + arrowLength;
    upgradeCtx.moveTo(tipX - 14, -9); upgradeCtx.lineTo(tipX, 0); upgradeCtx.lineTo(tipX - 14, 9); upgradeCtx.stroke();
    upgradeCtx.restore();
}

function drawAvatarCircle(img, x, y, r, borderCol, isLoaded, isUser) {
    upgradeCtx.save();
    upgradeCtx.shadowColor = 'rgba(0, 0, 0, 0.7)'; upgradeCtx.shadowBlur = 20; upgradeCtx.shadowOffsetY = 6;
    upgradeCtx.beginPath(); upgradeCtx.arc(x, y, r, 0, Math.PI * 2);
    upgradeCtx.fillStyle = '#0f172a'; upgradeCtx.fill(); upgradeCtx.restore();
    upgradeCtx.save();
    upgradeCtx.beginPath(); upgradeCtx.arc(x, y, r, 0, Math.PI * 2); upgradeCtx.closePath(); upgradeCtx.clip();

    if (isLoaded && img.complete && img.naturalWidth > 0) {
        upgradeCtx.drawImage(img, x - r, y - r, r * 2, r * 2);
    } else {
        let grad = upgradeCtx.createRadialGradient(x, y, 2, x, y, r);
        if (isUser) { grad.addColorStop(0, '#38bdf8'); grad.addColorStop(1, '#1d4ed8'); }
        else { grad.addColorStop(0, '#334155'); grad.addColorStop(1, '#0f172a'); }
        upgradeCtx.fillStyle = grad; upgradeCtx.fill();
    }
    upgradeCtx.restore();
    upgradeCtx.save();
    upgradeCtx.shadowColor = borderCol; upgradeCtx.shadowBlur = 8;
    upgradeCtx.beginPath(); upgradeCtx.arc(x, y, r, 0, Math.PI * 2);
    upgradeCtx.lineWidth = 3; upgradeCtx.strokeStyle = borderCol; upgradeCtx.stroke();
    upgradeCtx.restore();
}

window.startIceUpgrade = async function startIceUpgrade() {
    if (upgradeState !== 'IDLE') return;
    
    let betVal = parseFloat(parseFloat(upgradeBetInput.value || 0.25).toFixed(2));
    if (betVal < 0.25) betVal = 0.25;
    if (betVal > 2.0) betVal = 2.0;
    upgradeBetInput.value = betVal;

    if (score < betVal) { showToast('Недостаточно GRAM на балансе!', false); return; }

    if (upgradeChanceRange) upgradeChanceRange.disabled = true;
    if (upgradeBetInput) upgradeBetInput.disabled = true;
    if (upgradeActionBtn) {
        upgradeActionBtn.innerText = "Подключение...";
        upgradeActionBtn.style.background = "#4b5563";
    }

    let response = await apiCall('/api/upgrade/play', { bet: betVal, chance: upgradeChance, is_demo: isDemoMode });
    
    if (!response || response.error) {
        showToast(response?.error || "Ошибка соединения", false);
        resetUpgradeVisuals();
        return;
    }

    updateBalance(response.new_balance - response.win_amount); 
    addCashback(betVal * 0.15);

    upgradeState = 'AIMING';
    currentZoom = 1.0; cameraX = WORLD_SIZE / 2; cameraY = WORLD_SIZE / 2;
    upgradePuck.x = WORLD_SIZE / 2; upgradePuck.y = WORLD_SIZE / 2; upgradePuck.trail = [];
    aimStartTime = performance.now();
    
    // [ФИКС] Реальный рандом для визуала. Количество кругов вращения + случайный угол от 0 до 360
    dynamicSpinTarget = (Math.PI * 2 * (2 + Math.random() * 3)) + (Math.random() * Math.PI * 2);

    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

    cancelAnimationFrame(upgradeAnimId);
    runAimingLoop(response);
};

function runAimingLoop(serverResponse) {
    if (upgradeState !== 'AIMING') return;
    let elapsed = performance.now() - aimStartTime;
    
    let progress = Math.min(elapsed / 1500, 1.0); 
    let easeProgress = 1 - Math.pow(1 - progress, 2); // Плавное замедление
    
    // Вращение до динамически сгенерированного таргета
    let currentArrowAngle = (dynamicSpinTarget * easeProgress) % (Math.PI * 2);

    drawFrame(WORLD_SIZE / 2, WORLD_SIZE / 2, 1.0, currentArrowAngle, true);

    if (progress < 1.0) {
        upgradeAnimId = requestAnimationFrame(() => runAimingLoop(serverResponse));
    } else {
        startPuckFlight(serverResponse);
    }
}

let flightProgress = 0;
let startFlyX = WORLD_SIZE / 2;
let startFlyY = WORLD_SIZE / 2;
let targetFlyX = 0;
let targetFlyY = 0;

function startPuckFlight(serverResponse) {
    upgradeState = 'SPINNING';
    const geo = getSectorGeometry(upgradeChance);
    
    // [ФИКС] Выбор финальной точки приземления (разброс)
    if (serverResponse.is_win) {
        targetFlyX = geo.greenCentroid.x + (Math.random() * 80 - 40);
        targetFlyY = geo.greenCentroid.y + (Math.random() * 80 - 40);
    } else {
        targetFlyX = geo.botCentroid.x + (Math.random() * 80 - 40);
        targetFlyY = geo.botCentroid.y + (Math.random() * 80 - 40);
    }
    
    // [ФИКС] Генерация уникальной кривой полета (загибание шайбы)
    dynamicCurveDirection = Math.random() > 0.5 ? 1 : -1;
    dynamicCurveIntensity = 30 + Math.random() * 150; // Насколько сильно изгибается траектория

    flightProgress = 0;
    cancelAnimationFrame(upgradeAnimId);
    runFlightLoop(serverResponse);
}

function runFlightLoop(serverResponse) {
    if (upgradeState !== 'SPINNING') return;

    flightProgress += 0.015; 
    if (flightProgress >= 1.0) flightProgress = 1.0;

    let ease = 1 - Math.pow(1 - flightProgress, 3);
    
    // [ФИКС] Применяем сгенерированную кривую
    let curve = Math.sin(flightProgress * Math.PI) * dynamicCurveIntensity * dynamicCurveDirection;
    
    upgradePuck.x = startFlyX + (targetFlyX - startFlyX) * ease + curve;
    upgradePuck.y = startFlyY + (targetFlyY - startFlyY) * ease - curve;

    upgradePuck.trail.push({ x: upgradePuck.x, y: upgradePuck.y });
    if (upgradePuck.trail.length > 9) upgradePuck.trail.shift();

    let targetCamX = WORLD_SIZE / 2;
    let targetCamY = WORLD_SIZE / 2;
    let targetZoom = 1.0;

    if (flightProgress > 0.6) {
        targetCamX = upgradePuck.x;
        targetCamY = upgradePuck.y;
        targetZoom = 1.0 + (flightProgress - 0.6) * 2.0; 
    }

    drawFrame(targetCamX, targetCamY, targetZoom, 0, false);

    if (flightProgress < 1.0) {
        upgradeAnimId = requestAnimationFrame(() => runFlightLoop(serverResponse));
    } else {
        resolveWinner(serverResponse);
    }
}

function resolveWinner(serverResponse) {
    upgradeState = 'FINISHED';
    let currencyName = isDemoMode ? "DEMO" : "GRAM";

    drawFrame(upgradePuck.x, upgradePuck.y, 2.0, 0, false);
    
    updateBalance(serverResponse.new_balance);

    if (serverResponse.is_win) {
        showToast(`Победа! +${serverResponse.win_amount} ${currencyName}`, true);
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        showToast(`Шайба у бота. Попробуйте еще раз!`, false);
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    }

    setTimeout(resetUpgradeVisuals, 2200);
}

export function resetUpgradeVisuals() {
    upgradeState = 'IDLE';
    currentZoom = 1.0; cameraX = WORLD_SIZE / 2; cameraY = WORLD_SIZE / 2;
    upgradePuck.x = WORLD_SIZE / 2; upgradePuck.y = WORLD_SIZE / 2; upgradePuck.trail = [];
    
    if (upgradeChanceRange) upgradeChanceRange.disabled = false;
    if (upgradeBetInput) upgradeBetInput.disabled = false;
    if (upgradeActionBtn) {
        upgradeActionBtn.innerText = "Сделать ставку";
        upgradeActionBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
    }
    redraw();
}