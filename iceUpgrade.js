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

// Физика шайбы
let upgradePuck = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, vx: 0, vy: 0, radius: 26, trail: [] };
let upgradeAnimId = null;

// Камера и эффекты
let currentZoom = 1.0;
let cameraX = WORLD_SIZE / 2;
let cameraY = WORLD_SIZE / 2;
let screenShake = { x: 0, y: 0, intensity: 0 };

// Таймлайн
let flightStartTime = 0;
let targetFlyX = 0;
let targetFlyY = 0;

// Цвета Dark Neon Frost
const COLOR_USER = '#00f2fe'; // Циан (Игрок)
const COLOR_BOT = '#ffaa00';  // Янтарь (Бот)

// Процедурные царапины (создаются один раз)
let iceScratches = [];
for (let i = 0; i < 150; i++) {
    iceScratches.push({
        x1: Math.random() * WORLD_SIZE, y1: Math.random() * WORLD_SIZE,
        x2: Math.random() * WORLD_SIZE, y2: Math.random() * WORLD_SIZE,
        a: Math.random() * 0.05
    });
}

let userAvatarImg = new Image();
let isUserAvatarLoaded = false;
let botAvatarImg = new Image();
let isBotAvatarLoaded = false;

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
    drawFrame(WORLD_SIZE / 2, WORLD_SIZE / 2, 1.0);
}
window.addEventListener('resize', redraw);

window.updateUpgradeChance = function(val) {
    if (upgradeState !== 'IDLE') return;
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

// Геометрия секторов на основе шанса
function getSectorGeometry(chance) {
    const pBot = Math.max(0.01, Math.min(0.99, (100 - chance) / 100));
    const sBot = S_TOTAL * pBot;
    const legBot = Math.sqrt(2 * sBot); 
    const W = WORLD_SIZE, H = WORLD_SIZE;

    const botCentroid = { x: legBot / 3, y: H - legBot / 3 };
    const botRadius = Math.max(22, Math.min(65, legBot * 0.28));
    const greenCentroid = { x: W - (W - legBot * 0.5) * 0.42, y: (H - legBot * 0.5) * 0.42 };

    // Точки линии-разделителя
    const lineStart = { x: 0, y: H - legBot };
    const lineEnd = { x: legBot, y: H };

    return { legBot, botCentroid, botRadius, greenCentroid, lineStart, lineEnd };
}

function drawFrame(targetCamX, targetCamY, targetZoom = 1.0) {
    if (!upgradeCtx || !upgradeCanvas) return;
    syncCanvasSize();
    const w = upgradeCanvas.width, h = upgradeCanvas.height;

    // Плавная интерполяция камеры
    cameraX += (targetCamX - cameraX) * 0.08;
    cameraY += (targetCamY - cameraY) * 0.08;
    currentZoom += (targetZoom - currentZoom) * 0.05;

    // Тряска экрана (Screen Shake)
    if (screenShake.intensity > 0.1) {
        screenShake.x = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.y = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.intensity *= 0.85; 
    } else { screenShake.x = 0; screenShake.y = 0; }

    upgradeCtx.clearRect(0, 0, w, h);
    
    // Glassmorphism Canvas Border
    upgradeCtx.save();
    upgradeCtx.beginPath();
    const rBorder = 28 * (w / 360);
    if (typeof upgradeCtx.roundRect === 'function') upgradeCtx.roundRect(0, 0, w, h, rBorder);
    else upgradeCtx.rect(0, 0, w, h);
    upgradeCtx.clip(); 

    // Трансформации камеры
    upgradeCtx.save();
    upgradeCtx.translate(w / 2 + screenShake.x, h / 2 + screenShake.y);
    const baseScale = w / WORLD_SIZE;
    upgradeCtx.scale(baseScale * currentZoom, baseScale * currentZoom);
    upgradeCtx.translate(-cameraX, -cameraY);

    const geo = getSectorGeometry(upgradeChance);

    // Dark Neon Ice Background
    let bgGrad = upgradeCtx.createRadialGradient(WORLD_SIZE/2, WORLD_SIZE/2, 100, WORLD_SIZE/2, WORLD_SIZE/2, WORLD_SIZE);
    bgGrad.addColorStop(0, '#0F1B2E'); bgGrad.addColorStop(1, '#050914');
    upgradeCtx.fillStyle = bgGrad;
    upgradeCtx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    // Процедурные царапины
    upgradeCtx.lineWidth = 1;
    iceScratches.forEach(s => {
        upgradeCtx.strokeStyle = `rgba(255, 255, 255, ${s.a})`;
        upgradeCtx.beginPath(); upgradeCtx.moveTo(s.x1, s.y1); upgradeCtx.lineTo(s.x2, s.y2); upgradeCtx.stroke();
    });

    // Светящаяся лазерная линия-разделитель
    upgradeCtx.save();
    upgradeCtx.shadowColor = COLOR_BOT; upgradeCtx.shadowBlur = 20;
    upgradeCtx.strokeStyle = COLOR_BOT; upgradeCtx.lineWidth = 4;
    upgradeCtx.beginPath();
    upgradeCtx.moveTo(geo.lineStart.x, geo.lineStart.y);
    upgradeCtx.lineTo(geo.lineEnd.x, geo.lineEnd.y);
    upgradeCtx.stroke();
    upgradeCtx.restore();

    // Затемнение зоны проигравшего (В финале)
    if (upgradeState === 'FINISHED') {
        upgradeCtx.fillStyle = 'rgba(5, 9, 20, 0.75)';
        upgradeCtx.beginPath();
        // Если победитель User (targetFly ближе к greenCentroid) - затемняем треугольник бота
        let distUser = Math.hypot(targetFlyX - geo.greenCentroid.x, targetFlyY - geo.greenCentroid.y);
        let distBot = Math.hypot(targetFlyX - geo.botCentroid.x, targetFlyY - geo.botCentroid.y);
        
        if (distUser < distBot) {
            // Победил юзер, затемняем бота
            upgradeCtx.moveTo(0, WORLD_SIZE); upgradeCtx.lineTo(0, geo.lineStart.y); upgradeCtx.lineTo(geo.lineEnd.x, WORLD_SIZE);
        } else {
            // Победил бот, затемняем юзера
            upgradeCtx.moveTo(0, 0); upgradeCtx.lineTo(WORLD_SIZE, 0); upgradeCtx.lineTo(WORLD_SIZE, WORLD_SIZE);
            upgradeCtx.lineTo(geo.lineEnd.x, WORLD_SIZE); upgradeCtx.lineTo(0, geo.lineStart.y);
        }
        upgradeCtx.fill();
    }

    // Кибер-пьедесталы и аватары
    drawCyberPedestal(geo.greenCentroid.x, geo.greenCentroid.y, 75, COLOR_USER);
    drawAvatarCircle(userAvatarImg, geo.greenCentroid.x, geo.greenCentroid.y, 60, COLOR_USER, isUserAvatarLoaded, true);

    drawCyberPedestal(geo.botCentroid.x, geo.botCentroid.y, geo.botRadius + 10, COLOR_BOT);
    drawAvatarCircle(botAvatarImg, geo.botCentroid.x, geo.botCentroid.y, geo.botRadius, COLOR_BOT, isBotAvatarLoaded, false);

    // Шлейф Шайбы (Particle Trail)
    if (upgradeState === 'SPINNING' && upgradePuck.trail.length > 0) {
        for (let i = 0; i < upgradePuck.trail.length; i++) {
            let p = upgradePuck.trail[i];
            let alpha = (i / upgradePuck.trail.length) * 0.5;
            upgradeCtx.beginPath(); upgradeCtx.arc(p.x, p.y, upgradePuck.radius * 0.8, 0, Math.PI * 2);
            upgradeCtx.fillStyle = `rgba(0, 242, 254, ${alpha})`; upgradeCtx.fill();
        }
    }

    // Кибер-Шайба
    drawCyberPuck(upgradePuck.x, upgradePuck.y, upgradePuck.radius);

    upgradeCtx.restore(); 
    upgradeCtx.restore(); 
}

function drawCyberPedestal(x, y, r, color) {
    upgradeCtx.save();
    upgradeCtx.shadowColor = color; upgradeCtx.shadowBlur = 30;
    upgradeCtx.strokeStyle = color; upgradeCtx.lineWidth = 4;
    upgradeCtx.setLineDash([15, 10]);
    upgradeCtx.beginPath(); upgradeCtx.arc(x, y, r, 0, Math.PI * 2);
    // Вращение пьедестала
    let rot = performance.now() / 1000;
    upgradeCtx.translate(x, y); upgradeCtx.rotate(rot);
    upgradeCtx.stroke();
    upgradeCtx.restore();
}

function drawCyberPuck(x, y, r) {
    upgradeCtx.save();
    upgradeCtx.shadowColor = '#00f2fe'; upgradeCtx.shadowBlur = 20;
    upgradeCtx.beginPath(); upgradeCtx.arc(x, y, r, 0, Math.PI * 2);
    upgradeCtx.fillStyle = '#1e293b'; upgradeCtx.fill();
    upgradeCtx.lineWidth = 3; upgradeCtx.strokeStyle = '#cbd5e1'; upgradeCtx.stroke();
    // Центральный LED диод
    upgradeCtx.beginPath(); upgradeCtx.arc(x, y, r * 0.4, 0, Math.PI * 2);
    upgradeCtx.fillStyle = '#00f2fe'; upgradeCtx.fill();
    upgradeCtx.restore();
}

function drawAvatarCircle(img, x, y, r, borderCol, isLoaded, isUser) {
    upgradeCtx.save();
    upgradeCtx.beginPath(); upgradeCtx.arc(x, y, r, 0, Math.PI * 2);
    upgradeCtx.fillStyle = '#080E18'; upgradeCtx.fill(); upgradeCtx.clip();
    if (isLoaded && img.complete && img.naturalWidth > 0) {
        upgradeCtx.drawImage(img, x - r, y - r, r * 2, r * 2);
    } else {
        upgradeCtx.fillStyle = '#1e293b'; upgradeCtx.fill();
        upgradeCtx.fillStyle = borderCol; upgradeCtx.font = 'bold 28px sans-serif'; 
        upgradeCtx.textAlign = 'center'; upgradeCtx.textBaseline = 'middle';
        upgradeCtx.fillText(isUser ? "US" : "BT", x, y);
    }
    upgradeCtx.restore();
    upgradeCtx.save();
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
        upgradeActionBtn.innerText = "Симуляция броска...";
        upgradeActionBtn.style.background = "#4b5563";
        upgradeActionBtn.disabled = true;
    }

    let response = await apiCall('/api/upgrade/play', { bet: betVal, chance: upgradeChance, is_demo: isDemoMode });
    
    if (!response || response.error) {
        showToast(response?.error || "Ошибка соединения", false);
        resetUpgradeVisuals();
        return;
    }

    updateBalance(response.new_balance - response.win_amount); 
    addCashback(betVal * 0.15);

    upgradeState = 'SPINNING';
    const geo = getSectorGeometry(upgradeChance);
    
    // Определяем финальную точку остановки (разброс внутри пьедестала)
    if (response.is_win) {
        targetFlyX = geo.greenCentroid.x + (Math.random() * 40 - 20);
        targetFlyY = geo.greenCentroid.y + (Math.random() * 40 - 20);
    } else {
        targetFlyX = geo.botCentroid.x + (Math.random() * 40 - 20);
        targetFlyY = geo.botCentroid.y + (Math.random() * 40 - 20);
    }
    
    // Взрывной стартовый импульс (рандомный угол и высокая скорость)
    upgradePuck.x = WORLD_SIZE / 2; upgradePuck.y = WORLD_SIZE / 2;
    let initialAngle = Math.random() * Math.PI * 2;
    let speed = 25 + Math.random() * 10;
    upgradePuck.vx = Math.cos(initialAngle) * speed;
    upgradePuck.vy = Math.sin(initialAngle) * speed;
    upgradePuck.trail = [];
    
    flightStartTime = performance.now();

    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('heavy');
    cancelAnimationFrame(upgradeAnimId);
    runFlightLoop(response);
};

function runFlightLoop(serverResponse) {
    if (upgradeState !== 'SPINNING') return;

    let elapsed = performance.now() - flightStartTime;
    
    // --- КИНЕМАТОГРАФИЧНЫЙ 7-СЕКУНДНЫЙ ТАЙМЛАЙН ---
    let phase = elapsed < 3000 ? 1 : (elapsed < 7000 ? 2 : 3);
    
    // 1. Трение льда
    let friction = 1.0;
    if (phase === 1) {
        friction = 0.995; // Почти нет трения (свободный полет)
    } else if (phase === 2) {
        let p = (elapsed - 3000) / 4000; // Прогресс 2-й фазы (0 -> 1)
        friction = 0.995 - (p * 0.08); // Нарастающее торможение
        
        // Магнитная тяга (невидимо выруливает шайбу к победной точке)
        let dx = targetFlyX - upgradePuck.x;
        let dy = targetFlyY - upgradePuck.y;
        let dist = Math.hypot(dx, dy);
        let pullForce = (p * 0.035); 
        if (dist > 10) {
            upgradePuck.vx += (dx / dist) * pullForce * 20;
            upgradePuck.vy += (dy / dist) * pullForce * 20;
        }
    } else {
        friction = 0.7; // Резкая остановка на 7-й секунде
    }

    upgradePuck.vx *= friction;
    upgradePuck.vy *= friction;
    upgradePuck.x += upgradePuck.vx;
    upgradePuck.y += upgradePuck.vy;

    // 2. Упругие отскоки от бортов (AABB)
    let bounced = false;
    let r = upgradePuck.radius;
    if (upgradePuck.x - r < 0) { upgradePuck.x = r; upgradePuck.vx *= -1; bounced = true; }
    if (upgradePuck.x + r > WORLD_SIZE) { upgradePuck.x = WORLD_SIZE - r; upgradePuck.vx *= -1; bounced = true; }
    if (upgradePuck.y - r < 0) { upgradePuck.y = r; upgradePuck.vy *= -1; bounced = true; }
    if (upgradePuck.y + r > WORLD_SIZE) { upgradePuck.y = WORLD_SIZE - r; upgradePuck.vy *= -1; bounced = true; }

    if (bounced) {
        screenShake.intensity = 15; // Удар по бортам!
        if (tg && tg.HapticFeedback && phase === 1) tg.HapticFeedback.impactOccurred('light');
    }

    // 3. Шлейф (Particle Trail)
    if (Math.hypot(upgradePuck.vx, upgradePuck.vy) > 2) {
        upgradePuck.trail.push({ x: upgradePuck.x, y: upgradePuck.y });
        if (upgradePuck.trail.length > 15) upgradePuck.trail.shift();
    } else {
        upgradePuck.trail.shift(); 
    }

    // 4. Управление Камерой (Драматичный зум)
    let targetCamX = WORLD_SIZE / 2;
    let targetCamY = WORLD_SIZE / 2;
    let targetZoom = 1.0;

    if (phase === 2) {
        targetCamX = upgradePuck.x;
        targetCamY = upgradePuck.y;
        targetZoom = 1.6; // Зум на шайбу
    } else if (phase === 3) {
        targetCamX = upgradePuck.x;
        targetCamY = upgradePuck.y;
        targetZoom = 1.0; // Возврат масштаба
    }

    drawFrame(targetCamX, targetCamY, targetZoom);

    // 5. Проверка Остановки
    let currentSpeed = Math.hypot(upgradePuck.vx, upgradePuck.vy);
    if (phase === 3 || (phase === 2 && currentSpeed < 0.1)) {
        resolveWinner(serverResponse);
    } else {
        upgradeAnimId = requestAnimationFrame(() => runFlightLoop(serverResponse));
    }
}

function resolveWinner(serverResponse) {
    upgradeState = 'FINISHED';
    let currencyName = isDemoMode ? "DEMO" : "GRAM";

    drawFrame(WORLD_SIZE / 2, WORLD_SIZE / 2, 1.0);
    updateBalance(serverResponse.new_balance);

    if (serverResponse.is_win) {
        showToast(`Победа! +${serverResponse.win_amount} ${currencyName}`, true);
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        showToast(`Шайба у бота.`, false);
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    }
    setTimeout(resetUpgradeVisuals, 2500);
}

export function resetUpgradeVisuals() {
    upgradeState = 'IDLE';
    currentZoom = 1.0; cameraX = WORLD_SIZE / 2; cameraY = WORLD_SIZE / 2;
    upgradePuck.x = WORLD_SIZE / 2; upgradePuck.y = WORLD_SIZE / 2; upgradePuck.trail = [];
    
    if (upgradeChanceRange) upgradeChanceRange.disabled = false;
    if (upgradeBetInput) upgradeBetInput.disabled = false;
    if (upgradeActionBtn) {
        upgradeActionBtn.innerText = "Сделать ставку";
        upgradeActionBtn.style.background = "linear-gradient(135deg, #00f2fe, #4facfe)";
        upgradeActionBtn.disabled = false;
    }
    redraw();
}