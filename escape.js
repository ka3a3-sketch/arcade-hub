// --- START OF FILE escape.js ---

import { tg, score, updateBalance, addCashback, isDemoMode, showToast, initials } from './core.js';

// Элементы DOM
const escapeCanvas = document.getElementById('escapeCanvas');
const escapeCtx = escapeCanvas ? escapeCanvas.getContext('2d') : null;
const escapeBetInput = document.getElementById('escapeBetInput');
const escapeActionBtn = document.getElementById('escapeActionBtn');
const escapeBalanceDisplay = document.getElementById('escapeBalanceDisplay');

// Константы и физика пространства
const W = 380;
const H = 420;
const CX = W / 2;
const CY = 160;
const RING_RADIUS = 100;
const BALL_RADIUS = 12;

// Разрыв кольца (физическое отсутствие стенки) 
// Углы в Canvas: 0 - право, -PI/2 - верх. Разрыв с 10 до 11 часов.
const GAP_START = -2.7;
const GAP_END = -2.1;

// Состояние игрового движка
let gameState = 'IDLE'; // IDLE, PLAYING, FINISHED
let escapeMultiplier = 0.00;
let currentBetAmount = 0.10;
let isEscaped = false;

// Векторная физика шарика
let ball = { x: CX, y: CY, vx: 0, vy: 0 };

// Визуальные эффекты
let trail = [];
let particles = [];
let ringFlash = 0; // Вспышка кольца при ударе
let multScale = 1.0; // Пульсация множителя
let floatingUI = { active: false, text: "", color: "", y: 0, alpha: 0 };
let engineRunning = false; // Флаг постоянного цикла рендера

// Загрузка аватарки игрока
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
    if (gameState === 'PLAYING') return;
    let val = parseFloat((parseFloat(escapeBetInput.value || 0.10) * factor).toFixed(2));
    if (val < 0.10) val = 0.10;
    escapeBetInput.value = val;
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

window.maxEscapeBet = function() {
    if (gameState === 'PLAYING') return;
    if (score < 0.10) { showToast('Мин. ставка 0.10!', false); return; }
    escapeBetInput.value = parseFloat(score.toFixed(2));
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

// Хард-сброс визуала (при переключении вкладок)
export function resetEscapeVisuals() {
    if (!escapeCtx) return;
    gameState = 'IDLE';
    escapeMultiplier = 0.00;
    isEscaped = false;
    trail = []; particles = []; floatingUI.active = false;
    updateEscapeBalanceUI();
    if (escapeCanvas) { escapeCanvas.width = W; escapeCanvas.height = H; }
    
    // Запуск перманентного движка, если еще не запущен
    if (!engineRunning) {
        engineRunning = true;
        requestAnimationFrame(physicsEngineLoop);
    }
}

// --- СТАРТ ИГРЫ (СБРОС СТЕЙТА И ИМПУЛЬС) ---
window.startEscapeGame = function() {
    if (gameState === 'PLAYING' || !escapeBetInput) return;
    
    currentBetAmount = parseFloat(parseFloat(escapeBetInput.value || 0.10).toFixed(2));
    if (currentBetAmount < 0.10) { showToast('Мин. ставка 0.10!', false); return; }
    if (score < currentBetAmount) { showToast('Недостаточно средств!', false); return; }

    // Списание ставки (напрямую в UI, так как физика на клиенте)
    updateBalance(score - currentBetAmount);
    updateEscapeBalanceUI();
    addCashback(currentBetAmount * 0.15);

    // ПОЛНЫЙ СБРОС СТЕЙТА РАУНДА
    gameState = 'PLAYING';
    escapeMultiplier = 0.00;
    isEscaped = false;
    trail = [];
    particles = [];
    floatingUI.active = false;
    ringFlash = 0;
    multScale = 1.0;
    
    // Блокировка кнопки
    escapeActionBtn.innerText = "В игре...";
    escapeActionBtn.style.background = "#374151";
    escapeActionBtn.style.pointerEvents = "none";

    // СЛУЧАЙНЫЙ СПАВН И ВЕКТОР
    ball.x = CX + (Math.random() - 0.5) * 20; 
    ball.y = CY + (Math.random() - 0.5) * 20;
    let startAngle = Math.random() * Math.PI * 2;
    let startSpeed = 6.0 + Math.random() * 2.0; // Сила импульса
    ball.vx = Math.cos(startAngle) * startSpeed;
    ball.vy = Math.sin(startAngle) * startSpeed;

    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
};

// --- ФИЗИЧЕСКИЙ ДВИЖОК И РЕНДЕР (ПОСТОЯННЫЙ ЦИКЛ 60 FPS) ---
function physicsEngineLoop() {
    if (gameState === 'PLAYING') {
        updatePhysics();
    }
    
    updateEffects();
    renderGraphics();

    requestAnimationFrame(physicsEngineLoop);
}

// РЕАЛЬНАЯ ВЕКТОРНАЯ ФИЗИКА
function updatePhysics() {
    // Интеграция скорости
    ball.x += ball.vx;
    ball.y += ball.vy;

    let dx = ball.x - CX;
    let dy = ball.y - CY;
    let dist = Math.hypot(dx, dy);

    if (!isEscaped) {
        // --- ВНУТРИ КОЛЬЦА ---
        if (dist + BALL_RADIUS >= RING_RADIUS) {
            let angle = Math.atan2(dy, dx);
            
            // Проверка на попадание в разрыв
            if (angle > GAP_START && angle < GAP_END) {
                // ВЫЛЕТ! Коллизии нет, гравитация включится на следующем кадре
                isEscaped = true;
                createExplosion(ball.x, ball.y, '#3B82F6', 15);
                if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('heavy');
            } else {
                // ЧЕСТНЫЙ ОТСКОК ОТ КРУГЛОЙ СТЕНКИ
                let nx = dx / dist;
                let ny = dy / dist;
                let dot = ball.vx * nx + ball.vy * ny;
                
                // Вектор отражения
                ball.vx -= 2 * dot * nx;
                ball.vy -= 2 * dot * ny;
                
                // Микро-хаос: добавляем случайное отклонение от идеального угла
                let speed = Math.hypot(ball.vx, ball.vy);
                let currentAngle = Math.atan2(ball.vy, ball.vx);
                let noisyAngle = currentAngle + (Math.random() - 0.5) * 0.15;
                ball.vx = Math.cos(noisyAngle) * speed;
                ball.vy = Math.sin(noisyAngle) * speed;

                // Защита от залипания в текстуре
                ball.x = CX + nx * (RING_RADIUS - BALL_RADIUS - 1);
                ball.y = CY + ny * (RING_RADIUS - BALL_RADIUS - 1);

                // Игровая логика отскока
                escapeMultiplier += 0.10;
                ringFlash = 1.0;
                multScale = 1.4;
                createExplosion(ball.x, ball.y, '#00F2FE', 5);
                if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
            }
        }
    } else {
        // --- СНАРУЖИ КОЛЬЦА (ГРАВИТАЦИЯ И СВОБОДНОЕ ПАДЕНИЕ) ---
        ball.vy += 0.25; // Гравитация

        // Внешняя коллизия с кольцом (шарик может упасть сверху на дугу)
        if (dist - BALL_RADIUS <= RING_RADIUS && dist > RING_RADIUS - BALL_RADIUS * 2) {
            let nx = dx / dist;
            let ny = dy / dist;
            let dot = ball.vx * nx + ball.vy * ny;
            
            if (dot < 0) { // Если движемся внутрь кольца
                ball.vx -= 2 * dot * nx;
                ball.vy -= 2 * dot * ny;
                ball.x = CX + nx * (RING_RADIUS + BALL_RADIUS + 1);
                ball.y = CY + ny * (RING_RADIUS + BALL_RADIUS + 1);
            }
        }

        // Рикошет от левой/правой стены экрана
        if (ball.x - BALL_RADIUS < 0) {
            ball.x = BALL_RADIUS; ball.vx *= -0.7;
        } else if (ball.x + BALL_RADIUS > W) {
            ball.x = W - BALL_RADIUS; ball.vx *= -0.7;
        }

        // Падение на пол (Финиш)
        if (ball.y + BALL_RADIUS >= H - 50) {
            ball.y = H - 50 - BALL_RADIUS;
            finishRound();
        }
    }

    // Хвост кометы
    trail.unshift({ x: ball.x, y: ball.y, alpha: 1.0 });
    if (trail.length > 20) trail.pop();
}

function updateEffects() {
    // Затухание хвоста
    trail.forEach(t => t.alpha -= 0.06);
    
    // Физика частиц
    particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.1; // Гравитация частиц
        p.life -= p.decay;
    });
    particles = particles.filter(p => p.life > 0);

    // Затухание вспышек
    if (ringFlash > 0) ringFlash -= 0.05;
    if (multScale > 1.0) multScale += (1.0 - multScale) * 0.15;

    // Анимация плашки результата
    if (floatingUI.active) {
        floatingUI.y -= 1;
        floatingUI.alpha -= 0.015;
    }
}

// --- ЛОГИКА ЗАВЕРШЕНИЯ РАУНДА ---
function finishRound() {
    gameState = 'FINISHED';
    let isWin = ball.x < CX; // Меньше половины X = Зеленая зона (Win)
    let winAmount = isWin ? currentBetAmount * escapeMultiplier : 0;
    let color = isWin ? '#10B981' : '#EF4444';

    // Взрыв на полу
    createExplosion(ball.x, ball.y, color, 40);
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred(isWin ? 'success' : 'error');

    // Начисление выигрыша и обновление UI
    if (isWin && winAmount > 0) {
        updateBalance(score + winAmount);
    }
    updateEscapeBalanceUI();

    // Плашка с результатом
    let currencyName = isDemoMode ? "DEMO" : "GRAM";
    floatingUI = {
        active: true,
        text: isWin ? `+${winAmount.toFixed(2)} ${currencyName}` : `CRASHED`,
        color: color,
        y: ball.y - 20,
        alpha: 1.0
    };

    // ВОССТАНОВЛЕНИЕ КНОПКИ ДЛЯ НОВОГО РАУНДА (Критический багфикс)
    escapeActionBtn.innerText = "Играть";
    escapeActionBtn.style.background = "#10B981";
    escapeActionBtn.style.pointerEvents = "auto";
}

function createExplosion(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        let angle = Math.random() * Math.PI * 2;
        let speed = Math.random() * 6 + 1;
        particles.push({
            x: x, y: y,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            color: color, life: 1.0, decay: Math.random() * 0.03 + 0.02
        });
    }
}

// --- ГРАФИЧЕСКИЙ РЕНДЕР (WEB3 КАЗИНО СТИЛЬ) ---
function drawEscapeFrame() {
    if (!escapeCtx) return;
    
    // Темный фон
    escapeCtx.fillStyle = '#0D0F12';
    escapeCtx.fillRect(0, 0, W, H);

    // 1. Нижние Зоны (Лево - WIN, Право - LOSE)
    const zoneH = 50;
    
    // Зеленая зона 💰
    let gGrad = escapeCtx.createLinearGradient(0, H - zoneH, 0, H);
    gGrad.addColorStop(0, 'rgba(16, 185, 129, 0.0)');
    gGrad.addColorStop(1, 'rgba(16, 185, 129, 0.3)');
    escapeCtx.fillStyle = gGrad;
    escapeCtx.fillRect(0, H - zoneH, CX, zoneH);
    escapeCtx.beginPath(); escapeCtx.moveTo(0, H - zoneH); escapeCtx.lineTo(CX, H - zoneH);
    escapeCtx.strokeStyle = '#10B981'; escapeCtx.lineWidth = 3; escapeCtx.stroke();
    escapeCtx.fillStyle = '#10B981'; escapeCtx.font = '900 16px sans-serif'; escapeCtx.textAlign = 'center';
    escapeCtx.fillText('💰 WIN', CX/2, H - 20);

    // Красная зона 💀
    let rGrad = escapeCtx.createLinearGradient(CX, H - zoneH, CX, H);
    rGrad.addColorStop(0, 'rgba(239, 68, 68, 0.0)');
    rGrad.addColorStop(1, 'rgba(239, 68, 68, 0.3)');
    escapeCtx.fillStyle = rGrad;
    escapeCtx.fillRect(CX, H - zoneH, CX, zoneH);
    escapeCtx.beginPath(); escapeCtx.moveTo(CX, H - zoneH); escapeCtx.lineTo(W, H - zoneH);
    escapeCtx.strokeStyle = '#EF4444'; escapeCtx.lineWidth = 3; escapeCtx.stroke();
    escapeCtx.fillStyle = '#EF4444'; escapeCtx.font = '900 16px sans-serif'; escapeCtx.textAlign = 'center';
    escapeCtx.fillText('💀 LOSE', CX + CX/2, H - 20);

    // 2. Неоновое Кольцо
    escapeCtx.beginPath();
    // Отрисовка от конца разрыва до начала (оставляя физическую брешь)
    escapeCtx.arc(CX, CY, RING_RADIUS, GAP_END, GAP_START, false);
    
    let ringBrightness = Math.floor(ringFlash * 155);
    escapeCtx.strokeStyle = `rgb(${59 + ringBrightness}, ${130 + ringBrightness}, 246)`; 
    escapeCtx.lineWidth = 4 + ringFlash * 2;
    escapeCtx.lineCap = 'round';
    escapeCtx.shadowColor = '#00F2FE';
    escapeCtx.shadowBlur = 15 + ringFlash * 20;
    escapeCtx.stroke();
    escapeCtx.shadowBlur = 0;

    // Светящиеся точки на краях разрыва
    escapeCtx.fillStyle = '#00F2FE';
    escapeCtx.beginPath(); escapeCtx.arc(CX + Math.cos(GAP_START)*RING_RADIUS, CY + Math.sin(GAP_START)*RING_RADIUS, 4, 0, Math.PI*2); escapeCtx.fill();
    escapeCtx.beginPath(); escapeCtx.arc(CX + Math.cos(GAP_END)*RING_RADIUS, CY + Math.sin(GAP_END)*RING_RADIUS, 4, 0, Math.PI*2); escapeCtx.fill();

    // 3. Центральный Множитель
    escapeCtx.save();
    escapeCtx.translate(CX, CY);
    escapeCtx.scale(multScale, multScale);
    escapeCtx.fillStyle = '#FFFFFF';
    escapeCtx.font = '900 48px "SF Pro Display", sans-serif';
    escapeCtx.textAlign = 'center';
    escapeCtx.textBaseline = 'middle';
    escapeCtx.shadowColor = '#00F2FE';
    escapeCtx.shadowBlur = ringFlash * 20;
    escapeCtx.fillText(escapeMultiplier.toFixed(2) + 'x', 0, 0);
    escapeCtx.restore();

    // 4. Шлейф кометы
    if (trail.length > 1) {
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

    // 6. Шарик с Аватаркой
    if (gameState !== 'IDLE') {
        escapeCtx.save();
        escapeCtx.translate(ball.x, ball.y);
        
        // Вращение шарика по направлению вектора
        let angle = Math.atan2(ball.vy, ball.vx);
        escapeCtx.rotate(angle);

        // Светящийся ободок
        escapeCtx.beginPath();
        escapeCtx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
        escapeCtx.lineWidth = 2;
        escapeCtx.strokeStyle = '#FFFFFF';
        escapeCtx.shadowColor = '#00F2FE';
        escapeCtx.shadowBlur = 15;
        escapeCtx.stroke();
        escapeCtx.shadowBlur = 0;
        
        // Маска и Аватарка
        escapeCtx.clip();
        if (avatarLoaded) {
            escapeCtx.drawImage(avatarImg, -BALL_RADIUS, -BALL_RADIUS, BALL_RADIUS*2, BALL_RADIUS*2);
        } else {
            // Заглушка, если нет фото
            escapeCtx.fillStyle = '#3B82F6';
            escapeCtx.fillRect(-BALL_RADIUS, -BALL_RADIUS, BALL_RADIUS*2, BALL_RADIUS*2);
            escapeCtx.fillStyle = '#000';
            escapeCtx.font = 'bold 10px sans-serif'; escapeCtx.textAlign = 'center'; escapeCtx.textBaseline = 'middle';
            escapeCtx.fillText(initials, 0, 0);
        }
        escapeCtx.restore();
    }

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

// Запуск дефолтного рендера при инициализации
resetEscapeVisuals();

// --- END OF FILE escape.js ---