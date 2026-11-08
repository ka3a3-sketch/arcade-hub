// --- START OF FILE iceUpgrade.js ---

import { tg, score, updateBalance, addCashback, isDemoMode, showToast, apiCall } from './core.js';

const upgradeCanvas = document.getElementById('upgradeCanvas');
const upgradeCtx = upgradeCanvas ? upgradeCanvas.getContext('2d') : null;
const upgradeBetInput = document.getElementById('upgradeBetInput');
const upgradeChanceRange = document.getElementById('upgradeChanceRange');
const upgradeChanceVal = document.getElementById('upgradeChanceVal');
const upgradeMultVal = document.getElementById('upgradeMultVal');
const upgradeActionBtn = document.getElementById('upgradeActionBtn');

let upgradeState = 'IDLE'; // Стейты: IDLE -> AIMING -> ROLLING -> FINISHED
let upgradeChance = 50; 
let upgradeMultiplier = 1.96;

const WORLD_SIZE = 800;
const S_TOTAL = WORLD_SIZE * WORLD_SIZE;

// Физика и состояние шайбы
let upgradePuck = { x: -1000, y: -1000, radius: 26, trail: [] }; // Скрыта по умолчанию
let upgradeAnimId = null;

// Камера и эффекты
let currentZoom = 1.0;
let cameraX = WORLD_SIZE / 2;
let cameraY = WORLD_SIZE / 2;
let screenShake = { x: 0, y: 0, intensity: 0 };

// Детерминированный таймлайн
let aimStartTime = 0;
let targetAngle = 0;
let calculatedPath = []; // Массив предрассчитанных кадров физики
let currentPlaybackFrame = 0;

// Цвета Dark Neon Frost
const COLOR_USER = '#00f2fe'; 
const COLOR_BOT = '#ffaa00';  

// Процедурные царапины (генерируются 1 раз)
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

function getSectorGeometry(chance) {
    const pBot = Math.max(0.01, Math.min(0.99, (100 - chance) / 100));
    const legBot = Math.sqrt(2 * S_TOTAL * pBot); 
    const W = WORLD_SIZE, H = WORLD_SIZE;

    const botCentroid = { x: legBot / 3, y: H - legBot / 3 };
    const botRadius = Math.max(22, Math.min(65, legBot * 0.28));
    const greenCentroid = { x: W - (W - legBot * 0.5) * 0.42, y: (H - legBot * 0.5) * 0.42 };

    const lineStart = { x: 0, y: H - legBot };
    const lineEnd = { x: legBot, y: H };

    return { legBot, botCentroid, botRadius, greenCentroid, lineStart, lineEnd };
}

// Проверка: находится ли точка в зоне Бота (Треугольник в левом нижнем углу)
function isPointInBotZone(x, y, legBot) {
    return (x <= legBot && y >= x + WORLD_SIZE - legBot);
}

// --- ДЕТЕРМИНИРОВАННЫЙ ФИЗИЧЕСКИЙ ДВИЖОК (ПРЕДРАСЧЕТ) ---
// Симулирует бросок и возвращает массив координат кадров.
function simulatePhysicsPath(startX, startY, angle, speed) {
    let path = [];
    let x = startX, y = startY;
    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;
    let r = 26; // Радиус шайбы
    const FRICTION = 0.985; // Честное линейное затухание

    // Симулируем максимум 1000 кадров (~16 секунд полета)
    for (let frame = 0; frame < 1000; frame++) {
        vx *= FRICTION;
        vy *= FRICTION;
        x += vx;
        y += vy;

        let bounced = false;
        if (x - r < 0) { x = r; vx *= -1; bounced = true; }
        if (x + r > WORLD_SIZE) { x = WORLD_SIZE - r; vx *= -1; bounced = true; }
        if (y - r < 0) { y = r; vy *= -1; bounced = true; }
        if (y + r > WORLD_SIZE) { y = WORLD_SIZE - r; vy *= -1; bounced = true; }

        path.push({ x: x, y: y, bounced: bounced });

        // Если скорость упала ниже порога - шайба остановилась
        if (Math.hypot(vx, vy) < 0.05) break;
    }
    return path;
}

// Ищет честный физический бросок, который приведет к нужному исходу
function findWinningPath(startX, startY, isUserWin) {
    const geo = getSectorGeometry(upgradeChance);
    const MAX_ATTEMPTS = 2000;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        let testAngle = Math.random() * Math.PI * 2;
        let testSpeed = 30 + Math.random() * 25; // Мощный импульс (30-55)
        
        let path = simulatePhysicsPath(startX, startY, testAngle, testSpeed);
        let finalPoint = path[path.length - 1];
        
        let inBotZone = isPointInBotZone(finalPoint.x, finalPoint.y, geo.legBot);
        
        // Если предрасчет попал в нужную зону — мы нашли идеальный бросок!
        if (isUserWin && !inBotZone) return { path, angle: testAngle };
        if (!isUserWin && inBotZone) return { path, angle: testAngle };
    }
    
    // Fallback (почти невозможен)
    return { path: simulatePhysicsPath(startX, startY, 0, 30), angle: 0 };
}


// --- ОСНОВНОЙ ИГРОВОЙ ЦИКЛ ---
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
        upgradeActionBtn.innerText = "Подготовка арены...";
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

    // 1. Спавн шайбы в безопасной случайной точке (отступ от стен 100px)
    upgradePuck.x = 100 + Math.random() * (WORLD_SIZE - 200);
    upgradePuck.y = 100 + Math.random() * (WORLD_SIZE - 200);
    upgradePuck.trail = [];

    // 2. Предрасчет физики (мгновенно ищет честную траекторию)
    let simulationResult = findWinningPath(upgradePuck.x, upgradePuck.y, response.is_win);
    calculatedPath = simulationResult.path;
    targetAngle = simulationResult.angle;
    currentPlaybackFrame = 0;

    // 3. Запуск фазы AIMING (3 секунды)
    upgradeState = 'AIMING';
    aimStartTime = performance.now();
    
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    cancelAnimationFrame(upgradeAnimId);
    runGameLoop(response);
};

function runGameLoop(serverResponse) {
    if (upgradeState === 'IDLE') return;

    let targetCamX = WORLD_SIZE / 2;
    let targetCamY = WORLD_SIZE / 2;
    let targetCamZoom = 1.0;
    let arrowAngle = null;

    if (upgradeState === 'AIMING') {
        let elapsed = performance.now() - aimStartTime;
        let t = Math.min(elapsed / 3000, 1.0); // 3 секунды прицеливания
        
        // Easing ease-out-quart: быстро стартует, плавно тормозит в конце
        let ease = 1 - Math.pow(1 - t, 4); 
        
        // Стрелка делает 12 полных оборотов и останавливается ровно на targetAngle
        arrowAngle = targetAngle - (Math.PI * 2 * 12) * (1 - ease);

        targetCamX = upgradePuck.x;
        targetCamY = upgradePuck.y;
        targetCamZoom = 1.3; // Легкий зум на шайбу перед стартом

        drawFrame(targetCamX, targetCamY, targetCamZoom, arrowAngle);

        if (t >= 1.0) {
            upgradeState = 'ROLLING';
            if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('heavy');
        }

    } else if (upgradeState === 'ROLLING') {
        // Читаем предрассчитанный кадр физики
        if (currentPlaybackFrame < calculatedPath.length) {
            let frameData = calculatedPath[currentPlaybackFrame];
            upgradePuck.x = frameData.x;
            upgradePuck.y = frameData.y;
            
            if (frameData.bounced) {
                screenShake.intensity = 18;
                if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
            }

            // Шлейф
            if (currentPlaybackFrame % 2 === 0) { // Оптимизация хвоста
                upgradePuck.trail.push({ x: upgradePuck.x, y: upgradePuck.y });
                if (upgradePuck.trail.length > 12) upgradePuck.trail.shift();
            }

            // Кинематографичный зум ровно за 240 кадров (4 секунды) до остановки
            let framesLeft = calculatedPath.length - currentPlaybackFrame;
            if (framesLeft < 240) {
                targetCamX = upgradePuck.x;
                targetCamY = upgradePuck.y;
                targetCamZoom = 1.6;
            } else {
                targetCamX = WORLD_SIZE / 2;
                targetCamY = WORLD_SIZE / 2;
                targetCamZoom = 1.0;
            }

            currentPlaybackFrame++;
            drawFrame(targetCamX, targetCamY, targetCamZoom);
        } else {
            // Конец пути
            resolveWinner(serverResponse);
            return; // Выход из цикла
        }
    }

    upgradeAnimId = requestAnimationFrame(() => runGameLoop(serverResponse));
}

function resolveWinner(serverResponse) {
    upgradeState = 'FINISHED';
    let currencyName = isDemoMode ? "DEMO" : "GRAM";

    drawFrame(WORLD_SIZE / 2, WORLD_SIZE / 2, 1.0); // Возврат зума
    updateBalance(serverResponse.new_balance);

    if (serverResponse.is_win) {
        showToast(`Победа! +${serverResponse.win_amount} ${currencyName}`, true);
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        showToast(`Шайба в зоне бота.`, false);
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    }
    setTimeout(resetUpgradeVisuals, 2500);
}

export function resetUpgradeVisuals() {
    upgradeState = 'IDLE';
    currentZoom = 1.0; cameraX = WORLD_SIZE / 2; cameraY = WORLD_SIZE / 2;
    // Скрываем шайбу
    upgradePuck.x = -1000; upgradePuck.y = -1000; upgradePuck.trail = [];
    
    if (upgradeChanceRange) upgradeChanceRange.disabled = false;
    if (upgradeBetInput) upgradeBetInput.disabled = false;
    if (upgradeActionBtn) {
        upgradeActionBtn.innerText = "Сделать ставку";
        upgradeActionBtn.style.background = "linear-gradient(135deg, #00f2fe, #4facfe)";
        upgradeActionBtn.disabled = false;
    }
    redraw();
}

// --- ОТРИСОВКА (DARK NEON FROST) ---
function drawFrame(targetCamX, targetCamY, targetZoom = 1.0, arrowAngle = null) {
    if (!upgradeCtx || !upgradeCanvas) return;
    syncCanvasSize();
    const w = upgradeCanvas.width, h = upgradeCanvas.height;

    cameraX += (targetCamX - cameraX) * 0.08;
    cameraY += (targetCamY - cameraY) * 0.08;
    currentZoom += (targetZoom - currentZoom) * 0.05;

    if (screenShake.intensity > 0.1) {
        screenShake.x = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.y = (Math.random() - 0.5) * screenShake.intensity;
        screenShake.intensity *= 0.85; 
    } else { screenShake.x = 0; screenShake.y = 0; }

    upgradeCtx.clearRect(0, 0, w, h);
    
    upgradeCtx.save();
    upgradeCtx.beginPath();
    const rBorder = 28 * (w / 360);
    if (typeof upgradeCtx.roundRect === 'function') upgradeCtx.roundRect(0, 0, w, h, rBorder);
    else upgradeCtx.rect(0, 0, w, h);
    upgradeCtx.clip(); 

    upgradeCtx.save();
    upgradeCtx.translate(w / 2 + screenShake.x, h / 2 + screenShake.y);
    const baseScale = w / WORLD_SIZE;
    upgradeCtx.scale(baseScale * currentZoom, baseScale * currentZoom);
    upgradeCtx.translate(-cameraX, -cameraY);

    const geo = getSectorGeometry(upgradeChance);

    // Фон льда
    let bgGrad = upgradeCtx.createRadialGradient(WORLD_SIZE/2, WORLD_SIZE/2, 100, WORLD_SIZE/2, WORLD_SIZE/2, WORLD_SIZE);
    bgGrad.addColorStop(0, '#0F1B2E'); bgGrad.addColorStop(1, '#050914');
    upgradeCtx.fillStyle = bgGrad;
    upgradeCtx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    // Царапины
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

    // Затемнение проигравшего
    if (upgradeState === 'FINISHED') {
        upgradeCtx.fillStyle = 'rgba(5, 9, 20, 0.75)';
        upgradeCtx.beginPath();
        if (!isPointInBotZone(upgradePuck.x, upgradePuck.y, geo.legBot)) {
            // Победил Юзер, темним Бота
            upgradeCtx.moveTo(0, WORLD_SIZE); upgradeCtx.lineTo(0, geo.lineStart.y); upgradeCtx.lineTo(geo.lineEnd.x, WORLD_SIZE);
        } else {
            // Победил Бот, темним Юзера
            upgradeCtx.moveTo(0, 0); upgradeCtx.lineTo(WORLD_SIZE, 0); upgradeCtx.lineTo(WORLD_SIZE, WORLD_SIZE);
            upgradeCtx.lineTo(geo.lineEnd.x, WORLD_SIZE); upgradeCtx.lineTo(0, geo.lineStart.y);
        }
        upgradeCtx.fill();
    }

    drawCyberPedestal(geo.greenCentroid.x, geo.greenCentroid.y, 75, COLOR_USER);
    drawAvatarCircle(userAvatarImg, geo.greenCentroid.x, geo.greenCentroid.y, 60, COLOR_USER, isUserAvatarLoaded, true);

    drawCyberPedestal(geo.botCentroid.x, geo.botCentroid.y, geo.botRadius + 10, COLOR_BOT);
    drawAvatarCircle(botAvatarImg, geo.botCentroid.x, geo.botCentroid.y, geo.botRadius, COLOR_BOT, isBotAvatarLoaded, false);

    // Рисуем шайбу и эффекты ТОЛЬКО если игра не в IDLE
    if (upgradeState !== 'IDLE') {
        if (upgradeState === 'SPINNING' || upgradeState === 'ROLLING') {
            for (let i = 0; i < upgradePuck.trail.length; i++) {
                let p = upgradePuck.trail[i];
                let alpha = (i / upgradePuck.trail.length) * 0.6;
                upgradeCtx.beginPath(); upgradeCtx.arc(p.x, p.y, upgradePuck.radius * 0.7, 0, Math.PI * 2);
                upgradeCtx.fillStyle = `rgba(0, 242, 254, ${alpha})`; upgradeCtx.fill();
            }
        }

        // Если прицеливаемся - рисуем новую кибер-стрелку
        if (upgradeState === 'AIMING' && arrowAngle !== null) {
            drawAimSpinner(upgradePuck.x, upgradePuck.y, upgradePuck.radius, arrowAngle);
        }

        drawCyberPuck(upgradePuck.x, upgradePuck.y, upgradePuck.radius);
    }

    upgradeCtx.restore(); 
    upgradeCtx.restore(); 
}

// НОВЫЙ AIM SPINNER (Кибер-стрелка с правильным направлением)
function drawAimSpinner(x, y, r, angle) {
    upgradeCtx.save();
    
    upgradeCtx.translate(x, y);
    upgradeCtx.rotate(angle); 
    
    // Динамическая пульсация прозрачности
    let pulse = 0.7 + 0.3 * Math.sin(performance.now() / 150);
    
    const offset = r + 12; 
    const stemLength = 20; 
    const headSize = 14;   
    const tipX = offset + stemLength + 10; 

    upgradeCtx.shadowColor = '#00f2fe'; 
    upgradeCtx.shadowBlur = 15 * pulse; 
    upgradeCtx.strokeStyle = `rgba(0, 242, 254, ${pulse})`;
    upgradeCtx.lineWidth = 4;
    upgradeCtx.lineCap = 'round';
    upgradeCtx.lineJoin = 'round';

    upgradeCtx.beginPath();
    upgradeCtx.moveTo(offset, 0);
    upgradeCtx.lineTo(offset + stemLength, 0);
    upgradeCtx.stroke();

    upgradeCtx.beginPath();
    upgradeCtx.moveTo(offset + stemLength - 4, -headSize); 
    upgradeCtx.lineTo(tipX, 0);                            
    upgradeCtx.lineTo(offset + stemLength - 4, headSize);  
    upgradeCtx.stroke();

    upgradeCtx.beginPath();
    upgradeCtx.arc(0, 0, tipX + 10, -Math.PI / 6, Math.PI / 6);
    upgradeCtx.lineWidth = 2;
    upgradeCtx.strokeStyle = `rgba(0, 242, 254, ${pulse * 0.5})`;
    upgradeCtx.stroke();
    
    upgradeCtx.restore();
}

function drawCyberPedestal(x, y, r, color) {
    upgradeCtx.save();
    upgradeCtx.shadowColor = color; upgradeCtx.shadowBlur = 30;
    upgradeCtx.strokeStyle = color; upgradeCtx.lineWidth = 4;
    upgradeCtx.setLineDash([15, 10]);
    upgradeCtx.beginPath(); upgradeCtx.arc(x, y, r, 0, Math.PI * 2);
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