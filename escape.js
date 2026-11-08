// --- START OF FILE escape.js ---

import { tg, score, updateBalance, addCashback, isDemoMode, showToast, initials, apiCall } from './core.js';

const escapeCanvas = document.getElementById('escapeCanvas');
const escapeCtx = escapeCanvas ? escapeCanvas.getContext('2d') : null;
const escapeBetInput = document.getElementById('escapeBetInput');
const escapeActionBtn = document.getElementById('escapeActionBtn');
const escapeBalanceDisplay = document.getElementById('escapeBalanceDisplay');

// Физические константы и параметры холста
const W = 380; 
const H = 420;
const CX = W / 2;
const CY = 160; 
const RING_RADIUS = 110;
const BALL_RADIUS = 12;
const GAP_ANGLE = 0.9; // Ширина разрыва шлюза

// Состояние игры
let escapeState = 'IDLE'; 
let bounceCount = 0;
let targetBounces = 0;
let escapeMultiplier = 0.00;
let currentBetAmount = 0.25;

// Серверные данные
let serverTargetMultiplier = 0;
let serverIsWin = false;
let serverWinAmount = 0;
let finalBalanceCache = 0;

// Физика шарика
let ball = { x: CX, y: CY, vx: 0, vy: 0, rotation: 0 };
let ringRotation = 0; 
let targetRingRotation = null;

// Эффекты
let escapeAnimId = null;
let trail = [];
let particles = [];
let screenShake = 0;
let multScale = 1.0;
let frameCount = 0;
let floatingText = { active: false, txt: "", color: "", y: 0, alpha: 1, scale: 0 };

// --- ЗАГРУЗКА АВАТАРКИ TELEGRAM ---
const avatarImg = new Image();
let avatarLoaded = false;
try {
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (tgUser && tgUser.photo_url) {
        avatarImg.crossOrigin = "Anonymous";
        avatarImg.src = tgUser.photo_url;
        avatarImg.onload = () => { avatarLoaded = true; };
    }
} catch (e) { console.log("Аватарка не загружена", e); }

// --- UI ОБНОВЛЕНИЯ ---
export function updateEscapeBalanceUI() {
    if (escapeBalanceDisplay) {
        let currency = isDemoMode ? "DEMO" : "GRAM";
        escapeBalanceDisplay.innerText = `${score.toFixed(2)} ${currency}`;
    }
}

window.multiplyEscapeBet = function(factor) {
    if (escapeState !== 'IDLE' || !escapeBetInput) return;
    let val = parseFloat((parseFloat(escapeBetInput.value || 0.25) * factor).toFixed(2));
    if (val < 0.25) val = 0.25;
    escapeBetInput.value = val;
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

window.maxEscapeBet = function() {
    if (escapeState !== 'IDLE' || !escapeBetInput) return;
    if (score < 0.25) { showToast('Минимальная ставка 0.25!', false); return; }
    escapeBetInput.value = parseFloat(score.toFixed(2));
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

export function resetEscapeVisuals() {
    if (!escapeCtx) return;
    escapeState = 'IDLE';
    escapeMultiplier = 0.00;
    bounceCount = 0;
    trail = []; particles = []; floatingText.active = false;
    screenShake = 0;
    if (escapeCanvas) { escapeCanvas.width = W; escapeCanvas.height = H; }
    updateEscapeBalanceUI();
    drawEscapeFrame();
}

// --- СТАРТ ИГРЫ И API ---
window.startEscapeGame = async function() {
    if (escapeState !== 'IDLE' || !escapeBetInput) return;
    currentBetAmount = parseFloat(parseFloat(escapeBetInput.value || 0.25).toFixed(2));

    if (currentBetAmount < 0.25) { showToast('Минимальная ставка 0.25!', false); return; }
    if (score < currentBetAmount) { showToast('Недостаточно средств!', false); return; }

    if (escapeActionBtn) {
        escapeActionBtn.innerText = "Подключение...";
        escapeActionBtn.style.background = "#64748b";
        escapeActionBtn.disabled = true;
    }

    try {
        let response = await apiCall('/api/escape/play', { bet: currentBetAmount, is_demo: isDemoMode });
        
        if (!response || response.error) {
            showToast(response?.error || "Ошибка соединения", false);
            resetToMenuBtn();
            return;
        }

        serverTargetMultiplier = response.multiplier;
        serverIsWin = response.is_win;
        serverWinAmount = response.win_amount;
        targetBounces = Math.round(serverTargetMultiplier / 0.10); 
        finalBalanceCache = response.new_balance - serverWinAmount; 

        updateBalance(finalBalanceCache); 
        updateEscapeBalanceUI();
        addCashback(currentBetAmount * 0.15);

        initPhysics();

    } catch (e) {
        showToast("Сервер не отвечает", false);
        resetToMenuBtn();
    }
};

// --- ИНИЦИАЛИЗАЦИЯ ФИЗИКИ ---
function initPhysics() {
    escapeState = 'PLAYING';
    escapeMultiplier = 0.00;
    bounceCount = 0;
    trail = []; particles = []; floatingText.active = false;
    screenShake = 0; multScale = 1.0; targetRingRotation = null;
    
    if (escapeActionBtn) escapeActionBtn.innerText = "Симуляция...";

    // Спавн в центре со случайным вектором
    ball.x = CX; 
    ball.y = CY;
    let angle = Math.random() * Math.PI * 2;
    let speed = 7.0 + Math.random() * 2.0; // Быстрый старт
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;

    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    cancelAnimationFrame(escapeAnimId);
    runEscapeLoop();
}

// --- ГЛАВНЫЙ ЦИКЛ СИМУЛЯЦИИ ---
function runEscapeLoop() {
    if (escapeState === 'IDLE') return;
    frameCount++;

    if (escapeState === 'PLAYING') {
        // Базовое вращение кольца
        if (targetRingRotation === null) {
            ringRotation += 0.02; 
        } else {
            // Плавная доводка кольца под вылет
            ringRotation += (targetRingRotation - ringRotation) * 0.15;
        }

        // Движение шарика
        ball.x += ball.vx; 
        ball.y += ball.vy;
        ball.rotation = Math.atan2(ball.vy, ball.vx); // Вращение по вектору

        let dx = ball.x - CX, dy = ball.y - CY;
        let dist = Math.sqrt(dx * dx + dy * dy);

        // Проверка коллизии со стенкой кольца
        if (dist >= RING_RADIUS - BALL_RADIUS) {
            let impactAngle = Math.atan2(dy, dx);
            
            if (bounceCount >= targetBounces) {
                // ВРЕМЯ ВЫЛЕТА! Разрыв уже подставлен, вылетаем.
                ball.x = CX + Math.cos(impactAngle) * (RING_RADIUS);
                ball.y = CY + Math.sin(impactAngle) * (RING_RADIUS);
                escapeState = 'FALLING';
                screenShake = 10;
                spawnExplosion(ball.x, ball.y, '#00f2fe', 20);
                if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('heavy');
            } else {
                // ОТСКОК: Вычисление вектора отражения от нормали окружности
                let nx = dx / dist, ny = dy / dist;
                let dot = ball.vx * nx + ball.vy * ny;
                
                ball.vx -= 2 * dot * nx; 
                ball.vy -= 2 * dot * ny;
                
                // Микро-рандомизация угла для хаотичности (шлейф эффекта)
                let currentSpeed = Math.hypot(ball.vx, ball.vy);
                let newAngle = Math.atan2(ball.vy, ball.vx) + (Math.random() - 0.5) * 0.15;
                ball.vx = Math.cos(newAngle) * currentSpeed;
                ball.vy = Math.sin(newAngle) * currentSpeed;

                // Защита от залипания (возврат внутрь)
                ball.x = CX + nx * (RING_RADIUS - BALL_RADIUS - 1); 
                ball.y = CY + ny * (RING_RADIUS - BALL_RADIUS - 1);

                bounceCount++;
                escapeMultiplier = bounceCount * 0.10;
                multScale = 1.4; // Зум множителя
                screenShake = 5; // Тряска экрана

                spawnExplosion(ball.x, ball.y, '#00f2fe', 8);
                if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('rigid');

                // Если СЛЕДУЮЩИЙ удар будет финальным -> вычисляем точку следующего удара и крутим туда кольцо
                if (bounceCount === targetBounces) {
                    calculateExitAndAlignRing();
                }
            }
        }
    } else if (escapeState === 'FALLING') {
        // Гравитация
        ball.vy += 0.35;
        
        // Аэродинамический снос в нужную зону
        if (serverIsWin) {
            // Зеленая зона (вправо)
            if (ball.x < CX + 80) ball.vx += 0.4;
            else ball.vx *= 0.9; 
        } else {
            // Красная зона (влево)
            if (ball.x > CX - 80) ball.vx -= 0.4;
            else ball.vx *= 0.9;
        }

        ball.x += ball.vx; 
        ball.y += ball.vy;
        ball.rotation = Math.atan2(ball.vy, ball.vx);

        // Падение в зону
        if (ball.y > H - 60) {
            finishEscapeGame();
        }
    }

    // Обновление хвоста
    if (escapeState === 'PLAYING' || escapeState === 'FALLING') {
        trail.unshift({x: ball.x, y: ball.y, life: 1.0});
        if (trail.length > 20) trail.pop();
    }
    trail.forEach(t => t.life -= 0.05);

    // Обновление частиц
    particles.forEach(p => { 
        p.x += p.vx; p.y += p.vy; 
        p.life -= p.decay; 
        p.vy += 0.1; // Гравитация для искр
    });
    particles = particles.filter(p => p.life > 0);

    // Затухание эффектов
    if (screenShake > 0) screenShake *= 0.8;
    if (multScale > 1.0) multScale += (1.0 - multScale) * 0.15;

    // Анимация финала
    if (escapeState === 'RESULT' && floatingText.active) {
        floatingText.y -= 1.5;
        floatingText.scale += (1.0 - floatingText.scale) * 0.2;
        floatingText.alpha -= 0.01;
        if (floatingText.alpha <= 0) {
            escapeState = 'IDLE';
            resetToMenuBtn();
        }
    }

    drawEscapeFrame();
    
    if (escapeState !== 'IDLE') {
        escapeAnimId = requestAnimationFrame(runEscapeLoop);
    }
}

// --- ПРЕДРАСЧЕТ ВЫЛЕТА (АЛГОРИТМ ВЫРАВНИВАНИЯ ШЛЮЗА) ---
function calculateExitAndAlignRing() {
    // Решаем квадратное уравнение пересечения луча и окружности, 
    // чтобы узнать где шарик ударится в следующий раз.
    let a = ball.vx * ball.vx + ball.vy * ball.vy;
    let b = 2 * ((ball.x - CX) * ball.vx + (ball.y - CY) * ball.vy);
    let c = (ball.x - CX) * (ball.x - CX) + (ball.y - CY) * (ball.y - CY) - RING_RADIUS * RING_RADIUS;
    
    let delta = b * b - 4 * a * c;
    if (delta > 0) {
        let t1 = (-b + Math.sqrt(delta)) / (2 * a);
        let exitX = ball.x + ball.vx * t1 - CX;
        let exitY = ball.y + ball.vy * t1 - CY;
        let exitAngle = Math.atan2(exitY, exitX);
        
        // Разрыв рисуется с углом 0 по центру GAP_ANGLE, центрируем его на точку удара
        targetRingRotation = exitAngle - (GAP_ANGLE / 2);
        
        // Нормализуем вращение, чтобы кольцо крутилось по кратчайшему пути
        while (targetRingRotation - ringRotation > Math.PI) targetRingRotation -= Math.PI * 2;
        while (targetRingRotation - ringRotation < -Math.PI) targetRingRotation += Math.PI * 2;
    }
}

function spawnExplosion(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        let angle = Math.random() * Math.PI * 2;
        let speed = Math.random() * 5 + 2;
        particles.push({
            x: x, y: y,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            life: 1.0, decay: Math.random() * 0.05 + 0.02,
            color: color, size: Math.random() * 3 + 1
        });
    }
}

function finishEscapeGame() {
    escapeState = 'RESULT';
    screenShake = 15;
    let isWin = serverIsWin;
    let color = isWin ? '#00FFA3' : '#FF2A55';
    
    spawnExplosion(ball.x, ball.y, color, 50);
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred(isWin ? 'success' : 'error');

    let currencyName = isDemoMode ? "DEMO" : "GRAM";
    floatingText = {
        active: true, txt: isWin ? `+${serverWinAmount} ${currencyName}` : `CRASHED`,
        color: color, y: ball.y - 20, alpha: 1.0, scale: 0.1
    };

    updateBalance(finalBalanceCache + serverWinAmount);
    updateEscapeBalanceUI();
}

function resetToMenuBtn() {
    if (escapeActionBtn) {
        escapeActionBtn.innerText = "Сделать ставку"; 
        escapeActionBtn.style.background = "linear-gradient(135deg, #00f2fe, #4facfe)";
        escapeActionBtn.disabled = false;
    }
}

// --- ОТРИСОВКА ГРАФИКИ (TRIPLE-A VISUALS) ---
function drawEscapeFrame() {
    if (!escapeCtx) return;
    escapeCtx.fillStyle = '#060913';
    escapeCtx.fillRect(0, 0, W, H);
    
    escapeCtx.save();
    
    // Screen Shake
    if (screenShake > 0.5) {
        let sx = (Math.random() - 0.5) * screenShake;
        let sy = (Math.random() - 0.5) * screenShake;
        escapeCtx.translate(sx, sy);
    }

    // 1. Нижние зоны (Red / Green)
    drawBottomZones();

    // 2. Текст множителя
    escapeCtx.save();
    escapeCtx.translate(CX, 45);
    escapeCtx.scale(multScale, multScale);
    escapeCtx.fillStyle = '#ffffff';
    escapeCtx.font = '900 46px "SF Pro Display", sans-serif'; 
    escapeCtx.textAlign = 'center'; escapeCtx.textBaseline = 'middle';
    escapeCtx.shadowColor = '#00f2fe'; escapeCtx.shadowBlur = multScale > 1.0 ? 25 : 10;
    escapeCtx.fillText(escapeMultiplier.toFixed(2) + 'x', 0, 0);
    escapeCtx.restore();

    // 3. Кибер-Кольцо
    escapeCtx.save(); 
    escapeCtx.translate(CX, CY); 
    escapeCtx.rotate(ringRotation);
    
    escapeCtx.beginPath();
    escapeCtx.arc(0, 0, RING_RADIUS, GAP_ANGLE, Math.PI * 2, false);
    escapeCtx.strokeStyle = '#00f2fe'; 
    escapeCtx.lineWidth = 6; 
    escapeCtx.shadowColor = '#00f2fe'; escapeCtx.shadowBlur = 20;
    escapeCtx.stroke();
    
    // Внутренняя каемка (эффект объема)
    escapeCtx.beginPath();
    escapeCtx.arc(0, 0, RING_RADIUS - 4, GAP_ANGLE + 0.05, Math.PI * 2 - 0.05, false);
    escapeCtx.strokeStyle = 'rgba(255,255,255,0.6)';
    escapeCtx.lineWidth = 2; escapeCtx.shadowBlur = 0;
    escapeCtx.stroke();

    // Электрические края разрыва
    drawLightningEdge(RING_RADIUS, GAP_ANGLE);
    drawLightningEdge(RING_RADIUS, Math.PI * 2);
    
    escapeCtx.restore();

    // 4. Шлейф шарика (Комета)
    if (trail.length > 1) {
        escapeCtx.beginPath();
        escapeCtx.moveTo(trail[0].x, trail[0].y);
        for (let i = 1; i < trail.length; i++) {
            let p = trail[i];
            escapeCtx.lineTo(p.x, p.y);
        }
        let grad = escapeCtx.createLinearGradient(trail[0].x, trail[0].y, trail[trail.length-1].x, trail[trail.length-1].y);
        grad.addColorStop(0, 'rgba(0, 242, 254, 0.8)');
        grad.addColorStop(1, 'rgba(0, 242, 254, 0.0)');
        escapeCtx.strokeStyle = grad;
        escapeCtx.lineWidth = BALL_RADIUS * 1.5;
        escapeCtx.lineCap = 'round';
        escapeCtx.lineJoin = 'round';
        escapeCtx.shadowColor = '#00f2fe'; escapeCtx.shadowBlur = 15;
        escapeCtx.stroke();
        escapeCtx.shadowBlur = 0;
    }

    // 5. Шарик с аватаркой игрока
    if (escapeState === 'PLAYING' || escapeState === 'FALLING') {
        escapeCtx.save();
        escapeCtx.translate(ball.x, ball.y);
        escapeCtx.rotate(ball.rotation);

        // Неоновый щит
        escapeCtx.beginPath(); 
        escapeCtx.arc(0, 0, BALL_RADIUS + 2, 0, Math.PI * 2);
        escapeCtx.fillStyle = '#ffffff'; 
        escapeCtx.shadowColor = '#00f2fe'; 
        escapeCtx.shadowBlur = 20;
        escapeCtx.fill(); 
        escapeCtx.shadowBlur = 0;

        // Маска и Аватарка
        escapeCtx.beginPath();
        escapeCtx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
        escapeCtx.clip();
        
        if (avatarLoaded) {
            escapeCtx.drawImage(avatarImg, -BALL_RADIUS, -BALL_RADIUS, BALL_RADIUS*2, BALL_RADIUS*2);
        } else {
            // Дефолт если нет фото
            let bgGrad = escapeCtx.createLinearGradient(-BALL_RADIUS, -BALL_RADIUS, BALL_RADIUS, BALL_RADIUS);
            bgGrad.addColorStop(0, '#00f2fe'); bgGrad.addColorStop(1, '#4facfe');
            escapeCtx.fillStyle = bgGrad;
            escapeCtx.fillRect(-BALL_RADIUS, -BALL_RADIUS, BALL_RADIUS*2, BALL_RADIUS*2);
            escapeCtx.fillStyle = '#000';
            escapeCtx.font = 'bold 10px sans-serif'; escapeCtx.textAlign = 'center'; escapeCtx.textBaseline = 'middle';
            escapeCtx.fillText(initials, 0, 0);
        }
        escapeCtx.restore();
    }

    // 6. Искры
    particles.forEach(p => {
        escapeCtx.globalAlpha = Math.max(0, p.life);
        escapeCtx.fillStyle = p.color;
        escapeCtx.shadowColor = p.color; escapeCtx.shadowBlur = 10;
        escapeCtx.beginPath(); escapeCtx.arc(p.x, p.y, p.size, 0, Math.PI*2); escapeCtx.fill();
    });
    escapeCtx.globalAlpha = 1.0; escapeCtx.shadowBlur = 0;

    // 7. Текст результата (Световой взрыв)
    if (escapeState === 'RESULT' && floatingText.active) {
        escapeCtx.save();
        escapeCtx.translate(ball.x, floatingText.y);
        escapeCtx.scale(floatingText.scale, floatingText.scale);
        escapeCtx.globalAlpha = Math.max(0, floatingText.alpha);
        
        // Вспышка фона под текстом
        let rx = escapeCtx.createRadialGradient(0, 0, 0, 0, 0, 80);
        rx.addColorStop(0, floatingText.color);
        rx.addColorStop(1, 'transparent');
        escapeCtx.fillStyle = rx;
        escapeCtx.fillRect(-100, -50, 200, 100);

        escapeCtx.fillStyle = '#ffffff';
        escapeCtx.font = '900 32px "SF Pro Display", sans-serif'; 
        escapeCtx.textAlign = 'center'; escapeCtx.textBaseline = 'middle';
        escapeCtx.shadowColor = floatingText.color; 
        escapeCtx.shadowBlur = 20;
        escapeCtx.fillText(floatingText.txt, 0, 0);
        
        // Обводка текста
        escapeCtx.lineWidth = 1;
        escapeCtx.strokeStyle = floatingText.color;
        escapeCtx.strokeText(floatingText.txt, 0, 0);
        
        escapeCtx.restore();
    }

    escapeCtx.restore(); // Конец Screen Shake
}

function drawLightningEdge(radius, angle) {
    let x = Math.cos(angle) * radius;
    let y = Math.sin(angle) * radius;
    
    escapeCtx.beginPath();
    escapeCtx.moveTo(x, y);
    // Ломаная линия искрения
    for(let i=0; i<3; i++) {
        escapeCtx.lineTo(x + (Math.random()-0.5)*15, y + (Math.random()-0.5)*15);
    }
    escapeCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    escapeCtx.lineWidth = 2;
    escapeCtx.stroke();
}

function drawBottomZones() {
    const ZONE_Y = H - 90;
    const TIME = frameCount * 0.05;

    // RED ZONE (LOSE)
    let redGrad = escapeCtx.createLinearGradient(0, ZONE_Y, 0, H);
    redGrad.addColorStop(0, 'rgba(255, 42, 85, 0.0)');
    redGrad.addColorStop(1, 'rgba(255, 42, 85, 0.4)');
    escapeCtx.fillStyle = redGrad;
    escapeCtx.fillRect(0, ZONE_Y, CX, 100);
    
    // Анимация лазеров/шипов в красной зоне
    escapeCtx.beginPath();
    for(let x=10; x<CX; x+=30) {
        let yOff = Math.sin(TIME + x) * 10;
        escapeCtx.moveTo(x, H);
        escapeCtx.lineTo(x + 10, H - 20 + yOff);
        escapeCtx.lineTo(x + 20, H);
    }
    escapeCtx.fillStyle = 'rgba(255, 42, 85, 0.2)'; escapeCtx.fill();
    escapeCtx.strokeStyle = 'rgba(255, 42, 85, 0.8)'; escapeCtx.lineWidth = 2; escapeCtx.stroke();
    
    escapeCtx.fillStyle = '#FF2A55'; escapeCtx.shadowColor = '#FF2A55'; escapeCtx.shadowBlur = 15;
    escapeCtx.font = '900 16px sans-serif'; escapeCtx.textAlign = 'center';
    escapeCtx.fillText('RED ZONE', CX / 2, ZONE_Y + 40);
    escapeCtx.font = 'bold 12px sans-serif'; escapeCtx.fillText('LOSE', CX / 2, ZONE_Y + 60);

    // GREEN ZONE (WIN)
    let greenGrad = escapeCtx.createLinearGradient(CX, ZONE_Y, CX, H);
    greenGrad.addColorStop(0, 'rgba(0, 255, 163, 0.0)');
    greenGrad.addColorStop(1, 'rgba(0, 255, 163, 0.4)');
    escapeCtx.fillStyle = greenGrad;
    escapeCtx.fillRect(CX, ZONE_Y, CX, 100);
    
    // Анимация голографических стрелок в зеленой зоне
    escapeCtx.strokeStyle = 'rgba(0, 255, 163, 0.6)'; escapeCtx.lineWidth = 3;
    let arrowY = H - ((frameCount * 1.5) % 40);
    for(let i=0; i<3; i++) {
        let ay = arrowY + (i * 15);
        if (ay < ZONE_Y + 20) continue;
        escapeCtx.beginPath();
        escapeCtx.moveTo(CX + 40, ay); escapeCtx.lineTo(CX + CX/2, ay - 10); escapeCtx.lineTo(W - 40, ay);
        escapeCtx.stroke();
    }
    
    escapeCtx.fillStyle = '#00FFA3'; escapeCtx.shadowColor = '#00FFA3'; escapeCtx.shadowBlur = 15;
    escapeCtx.font = '900 16px sans-serif'; escapeCtx.textAlign = 'center';
    escapeCtx.fillText('GREEN ZONE', CX + CX / 2, ZONE_Y + 40);
    escapeCtx.font = 'bold 12px sans-serif'; escapeCtx.fillText('WIN', CX + CX / 2, ZONE_Y + 60);

    escapeCtx.shadowBlur = 0;
    // Разделитель
    let sepGrad = escapeCtx.createLinearGradient(0, ZONE_Y, 0, H);
    sepGrad.addColorStop(0, 'transparent'); sepGrad.addColorStop(1, 'rgba(255,255,255,0.3)');
    escapeCtx.beginPath(); escapeCtx.moveTo(CX, ZONE_Y); escapeCtx.lineTo(CX, H);
    escapeCtx.strokeStyle = sepGrad; escapeCtx.lineWidth = 2; escapeCtx.stroke();
}

// --- END OF FILE escape.js ---