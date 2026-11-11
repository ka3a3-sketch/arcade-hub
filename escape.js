// --- START OF FILE escape.js ---

import { tg, score, updateBalance, addCashback, isDemoMode, showToast, initials } from './core.js';

// Элементы DOM
const escapeCanvas = document.getElementById('escapeCanvas');
const escapeCtx = escapeCanvas ? escapeCanvas.getContext('2d') : null;
const escapeBetInput = document.getElementById('escapeBetInput');
const escapeActionBtn = document.getElementById('escapeActionBtn');
const escapeBalanceDisplay = document.getElementById('escapeBalanceDisplay');

// Жесткие константы пространства
const W = 380;
const H = 420;
const CX = W / 2;
const CY = 160;
const RING_RADIUS = 100;
const BALL_RADIUS = 12;

// Разрыв кольца (базовые углы от -2.7 до -2.1 радиан)
const GAP_START = -2.7;
const GAP_END = -2.1;

// Инициализация Canvas
if (escapeCanvas) {
    escapeCanvas.width = W;
    escapeCanvas.height = H;
}

// Состояние игры
let gameState = 'IDLE'; // IDLE, PLAYING, FINISHED
let escapeMultiplier = 0.00;
let currentBetAmount = 0.10;
let isEscaped = false;
let engineRunning = false;

// Векторная физика
let ball = { x: CX, y: CY, vx: 0, vy: 0 };
let ringRotation = 0; // Текущий угол поворота кольца
let trail = [];
let particles = [];
let ringFlash = 0;
let multScale = 1.0;
let floatingUI = { active: false, text: "", color: "", y: 0, alpha: 0 };

// --- БЕЗОПАСНАЯ ЗАГРУЗКА АВАТАРКИ ---
let avatarLoaded = false;
const avatarImg = new Image();
avatarImg.crossOrigin = "Anonymous";
try {
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (tgUser && tgUser.photo_url) {
        avatarImg.onload = () => { avatarLoaded = true; };
        avatarImg.onerror = () => { avatarLoaded = false; }; 
        avatarImg.src = tgUser.photo_url;
    }
} catch (e) {
    console.warn("Avatar load bypassed:", e);
    avatarLoaded = false;
}

// --- UI И ВЗАИМОДЕЙСТВИЕ ---
export function updateEscapeBalanceUI() {
    if (escapeBalanceDisplay) {
        let currency = isDemoMode ? "DEMO" : "GRAM";
        escapeBalanceDisplay.innerText = `${score.toFixed(2)} ${currency}`;
    }
}

window.multiplyEscapeBet = function(factor) {
    if (gameState === 'PLAYING') return;
    let val = parseFloat((parseFloat(escapeBetInput?.value || 0.10) * factor).toFixed(2));
    if (val < 0.10) val = 0.10;
    if (escapeBetInput) escapeBetInput.value = val;
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

window.maxEscapeBet = function() {
    if (gameState === 'PLAYING') return;
    if (score < 0.10) { showToast('Мин. ставка 0.10!', false); return; }
    if (escapeBetInput) escapeBetInput.value = parseFloat(score.toFixed(2));
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

export function resetEscapeVisuals() {
    if (!escapeCtx) return;
    gameState = 'IDLE';
    escapeMultiplier = 0.00;
    isEscaped = false;
    trail = [];
    particles = [];
    floatingUI.active = false;
    ball = { x: CX, y: CY, vx: 0, vy: 0 }; 
    
    updateEscapeBalanceUI();
    
    if (!engineRunning) {
        engineRunning = true;
        requestAnimationFrame(physicsEngineLoop);
    }
}

// --- СТАРТ РАУНДА ---
window.startEscapeGame = function() {
    if (gameState === 'PLAYING' || !escapeBetInput) return;
    
    currentBetAmount = parseFloat(parseFloat(escapeBetInput.value || 0.10).toFixed(2));
    if (currentBetAmount < 0.10) { showToast('Мин. ставка 0.10!', false); return; }
    if (score < currentBetAmount) { showToast('Недостаточно средств!', false); return; }

    updateBalance(score - currentBetAmount);
    updateEscapeBalanceUI();
    addCashback(currentBetAmount * 0.15);

    gameState = 'PLAYING';
    escapeMultiplier = 0.00;
    isEscaped = false;
    trail = [];
    particles = [];
    floatingUI.active = false;
    ringFlash = 0;
    multScale = 1.0;
    
    if (escapeActionBtn) {
        escapeActionBtn.innerText = "В игре...";
        escapeActionBtn.style.background = "#374151";
        escapeActionBtn.style.pointerEvents = "none";
    }

    // Более агрессивный стартовый импульс
    ball.x = CX + (Math.random() - 0.5) * 10;
    ball.y = CY + (Math.random() - 0.5) * 10;
    let angle = Math.random() * Math.PI * 2;
    let speed = 9.0 + Math.random() * 2.5; // Увеличена базовая скорость
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;

    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
};

// --- БЕЗОПАСНЫЙ ЦИКЛ 60 FPS ---
function physicsEngineLoop() {
    try {
        // Кольцо вращается постоянно
        ringRotation += 0.025;
        if (ringRotation > Math.PI * 2) ringRotation -= Math.PI * 2;

        if (gameState === 'IDLE') {
            // Левитация до старта
            ball.x = CX;
            ball.y = CY + Math.sin(Date.now() / 300) * 5;
        } else if (gameState === 'PLAYING') {
            updatePhysics();
        }
        
        updateEffects();
        renderGraphics();
    } catch (error) {
        console.error("Canvas Render Error:", error);
    }
    
    requestAnimationFrame(physicsEngineLoop);
}

// --- ЯДРО ВЕКТОРНОЙ ФИЗИКИ С ДЖИТТЕРОМ ---
function updatePhysics() {
    ball.x += ball.vx;
    ball.y += ball.vy;

    let dx = ball.x - CX;
    let dy = ball.y - CY;
    let dist = Math.hypot(dx, dy);

    if (!isEscaped) {
        // Коллизия с внутренним краем кольца
        if (dist + BALL_RADIUS >= RING_RADIUS) {
            let globalAngle = Math.atan2(dy, dx);
            
            // Переводим глобальный угол удара в локальную систему координат вращающегося кольца
            let localAngle = globalAngle - ringRotation;
            
            // Нормализация угла до диапазона [-PI, PI]
            while (localAngle <= -Math.PI) localAngle += Math.PI * 2;
            while (localAngle > Math.PI) localAngle -= Math.PI * 2;

            // Проверка на попадание в разрыв
            if (localAngle >= GAP_START && localAngle <= GAP_END) {
                isEscaped = true; // Свобода!
                createExplosion(ball.x, ball.y, '#3B82F6', 15);
                if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('heavy');
            } else {
                // Честное отражение вектора от нормали
                let nx = dx / dist;
                let ny = dy / dist;
                let dot = ball.vx * nx + ball.vy * ny;
                
                // Идеальный вектор рикошета
                let rvx = ball.vx - 2 * dot * nx;
                let rvy = ball.vy - 2 * dot * ny;
                
                // Агрессивный хаос: сильный случайный разброс угла отражения
                let speed = Math.hypot(rvx, rvy);
                let currentAngle = Math.atan2(rvy, rvx);
                let chaoticJitter = (Math.random() - 0.5) * 0.45; // Сильное отклонение
                let newAngle = currentAngle + chaoticJitter;

                ball.vx = Math.cos(newAngle) * speed;
                ball.vy = Math.sin(newAngle) * speed;

                // Защита от залипания
                ball.x = CX + nx * (RING_RADIUS - BALL_RADIUS - 1.5);
                ball.y = CY + ny * (RING_RADIUS - BALL_RADIUS - 1.5);

                escapeMultiplier += 0.10;
                ringFlash = 1.0;
                multScale = 1.4;
                createExplosion(ball.x, ball.y, '#00F2FE', 6);
                if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
            }
        }
    } else {
        // --- ПОВЕДЕНИЕ СНАРУЖИ КОЛЬЦА ---
        ball.vy += 0.35; // Усиленная гравитация

        // Рикошет от внешних стен экрана
        if (ball.x - BALL_RADIUS < 0) {
            ball.x = BALL_RADIUS; ball.vx *= -0.7;
        } else if (ball.x + BALL_RADIUS > W) {
            ball.x = W - BALL_RADIUS; ball.vx *= -0.7;
        }

        // Внешняя коллизия с кольцом (отскок от крыши)
        if (dist - BALL_RADIUS <= RING_RADIUS && dist > RING_RADIUS - BALL_RADIUS * 2) {
            let nx = dx / dist;
            let ny = dy / dist;
            let dot = ball.vx * nx + ball.vy * ny;
            if (dot < 0) { 
                ball.vx -= 2 * dot * nx;
                ball.vy -= 2 * dot * ny;
                ball.x = CX + nx * (RING_RADIUS + BALL_RADIUS + 1);
                ball.y = CY + ny * (RING_RADIUS + BALL_RADIUS + 1);
            }
        }

        // Финиш - падение в зоны
        if (ball.y + BALL_RADIUS >= H - 50) {
            ball.y = H - 50 - BALL_RADIUS;
            finishRound();
        }
    }

    // Хвост кометы
    trail.unshift({ x: ball.x, y: ball.y, alpha: 1.0 });
    if (trail.length > 15) trail.pop();
}

function updateEffects() {
    trail.forEach(t => t.alpha -= 0.07);
    
    particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.15; 
        p.life -= p.decay;
    });
    particles = particles.filter(p => p.life > 0);

    if (ringFlash > 0) ringFlash -= 0.05;
    if (multScale > 1.0) multScale += (1.0 - multScale) * 0.15;

    if (floatingUI.active) {
        floatingUI.y -= 1.2;
        floatingUI.alpha -= 0.015;
    }
}

// --- ЛОГИКА ФИНИША И СБРОС ---
function finishRound() {
    gameState = 'FINISHED';
    
    let isWin = ball.x < CX; // Меньше половины X = Зеленая зона (WIN)
    let winAmount = isWin ? currentBetAmount * escapeMultiplier : 0;
    let color = isWin ? '#10B981' : '#EF4444';

    createExplosion(ball.x, ball.y, color, 45);
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred(isWin ? 'success' : 'error');

    if (isWin && winAmount > 0) {
        updateBalance(score + winAmount);
    }
    updateEscapeBalanceUI();

    let currencyName = isDemoMode ? "DEMO" : "GRAM";
    floatingUI = {
        active: true,
        text: isWin ? `+${winAmount.toFixed(2)} ${currencyName}` : `CRASHED`,
        color: color,
        y: ball.y - 30,
        alpha: 1.0
    };

    if (escapeActionBtn) {
        escapeActionBtn.innerText = "Играть";
        escapeActionBtn.style.background = "#10B981";
        escapeActionBtn.style.pointerEvents = "auto";
    }
}

function createExplosion(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        let angle = Math.random() * Math.PI * 2;
        let speed = Math.random() * 6 + 2;
        particles.push({
            x: x, y: y,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            color: color, life: 1.0, decay: Math.random() * 0.03 + 0.02
        });
    }
}

// --- ГРАФИЧЕСКИЙ РЕНДЕР ---
function renderGraphics() {
    if (!escapeCtx) return;
    
    escapeCtx.fillStyle = '#0D0F12';
    escapeCtx.fillRect(0, 0, W, H);

    // 1. Нижние Зоны (Лево - WIN, Право - LOSE)
    const zoneH = 50;
    
    let gGrad = escapeCtx.createLinearGradient(0, H - zoneH, 0, H);
    gGrad.addColorStop(0, 'rgba(16, 185, 129, 0.0)');
    gGrad.addColorStop(1, 'rgba(16, 185, 129, 0.3)');
    escapeCtx.fillStyle = gGrad;
    escapeCtx.fillRect(0, H - zoneH, CX, zoneH);
    escapeCtx.beginPath(); escapeCtx.moveTo(0, H - zoneH); escapeCtx.lineTo(CX, H - zoneH);
    escapeCtx.strokeStyle = '#10B981'; escapeCtx.lineWidth = 3; escapeCtx.stroke();
    escapeCtx.fillStyle = '#10B981'; escapeCtx.font = '900 16px sans-serif'; escapeCtx.textAlign = 'center';
    escapeCtx.fillText('💰 WIN', CX/2, H - 20);

    let rGrad = escapeCtx.createLinearGradient(CX, H - zoneH, CX, H);
    rGrad.addColorStop(0, 'rgba(239, 68, 68, 0.0)');
    rGrad.addColorStop(1, 'rgba(239, 68, 68, 0.3)');
    escapeCtx.fillStyle = rGrad;
    escapeCtx.fillRect(CX, H - zoneH, CX, zoneH);
    escapeCtx.beginPath(); escapeCtx.moveTo(CX, H - zoneH); escapeCtx.lineTo(W, H - zoneH);
    escapeCtx.strokeStyle = '#EF4444'; escapeCtx.lineWidth = 3; escapeCtx.stroke();
    escapeCtx.fillStyle = '#EF4444'; escapeCtx.font = '900 16px sans-serif'; escapeCtx.textAlign = 'center';
    escapeCtx.fillText('💀 LOSE', CX + CX/2, H - 20);

    // 2. Вращающееся Неоновое Кольцо
    let currentGapStart = GAP_START + ringRotation;
    let currentGapEnd = GAP_END + ringRotation;

    escapeCtx.beginPath();
    // Отрисовка сплошной части кольца
    escapeCtx.arc(CX, CY, RING_RADIUS, currentGapEnd, currentGapStart, false);
    
    let ringBrightness = Math.floor(Math.max(0, ringFlash) * 155);
    escapeCtx.strokeStyle = `rgb(${59 + ringBrightness}, ${130 + ringBrightness}, 246)`; 
    escapeCtx.lineWidth = 4 + (ringFlash > 0 ? ringFlash * 2 : 0);
    escapeCtx.lineCap = 'round';
    escapeCtx.shadowColor = '#00F2FE';
    escapeCtx.shadowBlur = 15 + (ringFlash > 0 ? ringFlash * 20 : 0);
    escapeCtx.stroke();
    escapeCtx.shadowBlur = 0;

    // Светящиеся точки на краях разрыва
    escapeCtx.fillStyle = '#00F2FE';
    escapeCtx.beginPath(); escapeCtx.arc(CX + Math.cos(currentGapStart)*RING_RADIUS, CY + Math.sin(currentGapStart)*RING_RADIUS, 4, 0, Math.PI*2); escapeCtx.fill();
    escapeCtx.beginPath(); escapeCtx.arc(CX + Math.cos(currentGapEnd)*RING_RADIUS, CY + Math.sin(currentGapEnd)*RING_RADIUS, 4, 0, Math.PI*2); escapeCtx.fill();

    // 3. Множитель (Статичен в IDLE, иначе пульсирует)
    escapeCtx.save();
    escapeCtx.translate(CX, CY);
    escapeCtx.scale(multScale, multScale);
    escapeCtx.fillStyle = '#FFFFFF';
    escapeCtx.font = '900 48px "SF Pro Display", sans-serif';
    escapeCtx.textAlign = 'center';
    escapeCtx.textBaseline = 'middle';
    escapeCtx.shadowColor = '#00F2FE';
    escapeCtx.shadowBlur = ringFlash > 0 ? ringFlash * 20 : 0;
    escapeCtx.fillText(escapeMultiplier.toFixed(2) + 'x', 0, 0);
    escapeCtx.restore();

    // 4. Шлейф кометы
    if (trail.length > 1 && gameState !== 'IDLE') {
        escapeCtx.beginPath();
        escapeCtx.moveTo(trail[0].x, trail[0].y);
        for (let i = 1; i < trail.length; i++) {
            escapeCtx.lineTo(trail[i].x, trail[i].y);
        }
        let grad = escapeCtx.createLinearGradient(trail[0].x, trail[0].y, trail[trail.length-1].x, trail[trail.length-1].y);
        grad.addColorStop(0, 'rgba(0, 242, 254, 0.8)');
        grad.addColorStop(1, 'rgba(0, 242, 254, 0.0)');
        escapeCtx.strokeStyle = grad;
        escapeCtx.lineWidth = BALL_RADIUS;
        escapeCtx.lineCap = 'round';
        escapeCtx.lineJoin = 'round';
        escapeCtx.stroke();
    }

    // 5. Искры
    particles.forEach(p => {
        escapeCtx.globalAlpha = Math.max(0, p.life);
        escapeCtx.fillStyle = p.color;
        escapeCtx.shadowColor = p.color;
        escapeCtx.shadowBlur = 10;
        escapeCtx.beginPath(); escapeCtx.arc(p.x, p.y, 2.5, 0, Math.PI*2); escapeCtx.fill();
    });
    escapeCtx.globalAlpha = 1.0;
    escapeCtx.shadowBlur = 0;

    // 6. Шарик
    escapeCtx.save();
    escapeCtx.translate(ball.x, ball.y);
    if (gameState === 'PLAYING' || gameState === 'FINISHED') {
        escapeCtx.rotate(Math.atan2(ball.vy, ball.vx));
    }
    
    escapeCtx.beginPath();
    escapeCtx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
    escapeCtx.lineWidth = 2;
    escapeCtx.strokeStyle = '#FFFFFF';
    escapeCtx.shadowColor = '#00F2FE';
    escapeCtx.shadowBlur = 15;
    escapeCtx.stroke();
    escapeCtx.shadowBlur = 0;
    
    escapeCtx.clip();
    if (avatarLoaded) {
        escapeCtx.drawImage(avatarImg, -BALL_RADIUS, -BALL_RADIUS, BALL_RADIUS*2, BALL_RADIUS*2);
    } else {
        let bgGrad = escapeCtx.createLinearGradient(-BALL_RADIUS, -BALL_RADIUS, BALL_RADIUS, BALL_RADIUS);
        bgGrad.addColorStop(0, '#00F2FE');
        bgGrad.addColorStop(1, '#3B82F6');
        escapeCtx.fillStyle = bgGrad;
        escapeCtx.fillRect(-BALL_RADIUS, -BALL_RADIUS, BALL_RADIUS*2, BALL_RADIUS*2);
        
        escapeCtx.fillStyle = '#FFFFFF';
        escapeCtx.font = 'bold 12px sans-serif';
        escapeCtx.textAlign = 'center';
        escapeCtx.textBaseline = 'middle';
        escapeCtx.fillText(initials || "U", 0, 0);
    }
    escapeCtx.restore();

    // 7. Плашка результата
    if (floatingUI.active && floatingUI.alpha > 0) {
        escapeCtx.globalAlpha = Math.max(0, floatingUI.alpha);
        escapeCtx.fillStyle = floatingUI.color;
        escapeCtx.font = '900 32px "SF Pro Display", sans-serif';
        escapeCtx.textAlign = 'center';
        escapeCtx.shadowColor = floatingUI.color;
        escapeCtx.shadowBlur = 20;
        escapeCtx.fillText(floatingUI.text, ball.x, floatingUI.y);
        escapeCtx.globalAlpha = 1.0;
        escapeCtx.shadowBlur = 0;
    }
}

resetEscapeVisuals();

// --- END OF FILE escape.js ---