// --- START OF FILE escape.js ---

import { tg, score, updateBalance, addCashback, isDemoMode, showToast, initials, apiCall } from './core.js';

const escapeCanvas = document.getElementById('escapeCanvas');
const escapeCtx = escapeCanvas ? escapeCanvas.getContext('2d') : null;
const escapeBetInput = document.getElementById('escapeBetInput');
const escapeActionBtn = document.getElementById('escapeActionBtn');
const escapeBalanceDisplay = document.getElementById('escapeBalanceDisplay');

// Физические константы
const W = 360; 
const H = 420;
const CX = W / 2;
const CY = 170; // Кольцо смещено вверх
const RING_RADIUS = 110;
const BALL_RADIUS = 8;
const GAP_ANGLE = 0.8; // Ширина разрыва в радианах

let escapeState = 'IDLE'; // IDLE, PLAYING (отскоки), FALLING (падение), RESULT
let escapeMultiplier = 0.00;
let bounceCount = 0;
let ball = { x: CX, y: CY, vx: 0, vy: 0 };
let ringRotation = 0; 
let escapeAnimId = null;
let currentBetAmount = 0.25;

let serverTargetMultiplier = 0;
let serverIsWin = false;
let serverWinAmount = 0;
let targetBounces = 0;

let trail = [];
let sparks = [];
let finalBalanceCache = 0;
let floatingText = { active: false, txt: "", color: "", y: 0, alpha: 1 };

// Обновление отображения баланса при переключении демо
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
    ball = { x: CX, y: CY, vx: 0, vy: 0 };
    trail = [];
    sparks = [];
    floatingText.active = false;
    updateEscapeBalanceUI();
    if (escapeCanvas) { escapeCanvas.width = W; escapeCanvas.height = H; }
    drawEscapeFrame();
}

window.startEscapeGame = async function() {
    if (escapeState !== 'IDLE' || !escapeBetInput) return;
    currentBetAmount = parseFloat(parseFloat(escapeBetInput.value || 0.25).toFixed(2));

    if (currentBetAmount < 0.25) { showToast('Минимальная ставка 0.25!', false); return; }
    if (score < currentBetAmount) { showToast('Недостаточно средств на балансе!', false); return; }

    if (escapeActionBtn) {
        escapeActionBtn.innerText = "Подключение...";
        escapeActionBtn.style.background = "#64748b";
        escapeActionBtn.disabled = true;
    }

    let response = await apiCall('/api/escape/play', { bet: currentBetAmount, is_demo: isDemoMode });
    
    if (!response || response.error) {
        showToast(response?.error || "Ошибка соединения", false);
        if (escapeActionBtn) {
            escapeActionBtn.innerText = "Сделать ставку";
            escapeActionBtn.style.background = "linear-gradient(135deg, #00f2fe, #4facfe)";
            escapeActionBtn.disabled = false;
        }
        return;
    }

    serverTargetMultiplier = response.multiplier;
    serverIsWin = response.is_win;
    serverWinAmount = response.win_amount;
    targetBounces = Math.round(serverTargetMultiplier / 0.10); // Считаем сколько отскоков нужно
    finalBalanceCache = response.new_balance - serverWinAmount; // Спишем ставку

    updateBalance(finalBalanceCache); 
    updateEscapeBalanceUI();
    addCashback(currentBetAmount * 0.15);

    escapeState = 'PLAYING';
    escapeMultiplier = 0.00;
    bounceCount = 0;
    trail = []; sparks = []; floatingText.active = false;
    
    if (escapeActionBtn) escapeActionBtn.innerText = "В игре...";

    ball.x = CX; ball.y = CY;
    // Случайный начальный выстрел
    let angle = Math.random() * Math.PI * 2;
    let speed = 6.0;
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;

    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    cancelAnimationFrame(escapeAnimId);
    runEscapeLoop();
};

function runEscapeLoop() {
    if (escapeState === 'IDLE') return;

    if (escapeState === 'PLAYING') {
        ringRotation += 0.03; // Вращение кольца для визуала

        ball.x += ball.vx; 
        ball.y += ball.vy;

        let dx = ball.x - CX, dy = ball.y - CY;
        let dist = Math.sqrt(dx * dx + dy * dy);

        // Проверка столкновения с кольцом
        if (dist >= RING_RADIUS - BALL_RADIUS) {
            let impactAngle = Math.atan2(dy, dx);
            
            // Если мы достигли нужного множителя — принудительно выпускаем шарик
            if (bounceCount >= targetBounces) {
                // Выравниваем разрыв под шарик
                ringRotation = impactAngle - GAP_ANGLE / 2;
                
                // Выталкиваем наружу
                ball.x = CX + Math.cos(impactAngle) * (RING_RADIUS);
                ball.y = CY + Math.sin(impactAngle) * (RING_RADIUS);
                
                // Переходим в падение
                escapeState = 'FALLING';
                if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('heavy');
            } else {
                // Обычный отскок
                let nx = dx / dist, ny = dy / dist;
                let dot = ball.vx * nx + ball.vy * ny;
                
                ball.vx -= 2 * dot * nx; 
                ball.vy -= 2 * dot * ny;
                
                // Защита от залипания
                ball.x = CX + nx * (RING_RADIUS - BALL_RADIUS - 1); 
                ball.y = CY + ny * (RING_RADIUS - BALL_RADIUS - 1);

                bounceCount++;
                escapeMultiplier = bounceCount * 0.10;
                
                createSparks(ball.x, ball.y, nx, ny);
                if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
            }
        }
    } else if (escapeState === 'FALLING') {
        // Гравитация
        ball.vy += 0.25;
        
        // Магнитное "сдувание" в нужную зону (лево/право)
        if (serverIsWin) {
            // Летим направо (Зеленая зона)
            if (ball.x < CX + 40) ball.vx += 0.3;
            else ball.vx *= 0.95; // тормозим по X
        } else {
            // Летим налево (Красная зона)
            if (ball.x > CX - 40) ball.vx -= 0.3;
            else ball.vx *= 0.95;
        }

        ball.x += ball.vx; 
        ball.y += ball.vy;

        // Падение в зону
        if (ball.y > H - 50) {
            finishEscapeGame();
        }
    }

    // Хвост шарика
    if (escapeState === 'PLAYING' || escapeState === 'FALLING') {
        trail.push({x: ball.x, y: ball.y, alpha: 1.0});
        if (trail.length > 15) trail.shift();
    }
    trail.forEach(t => t.alpha -= 0.06);
    
    // Искры
    sparks.forEach(s => { s.x += s.vx; s.y += s.vy; s.life -= 0.05; });
    sparks = sparks.filter(s => s.life > 0);

    // Всплывающий текст финала
    if (escapeState === 'RESULT' && floatingText.active) {
        floatingText.y -= 1;
        floatingText.alpha -= 0.015;
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

function createSparks(x, y, nx, ny) {
    for (let i = 0; i < 8; i++) {
        sparks.push({
            x: x, y: y,
            vx: nx * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2,
            vy: ny * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2,
            life: 1.0
        });
    }
}

function finishEscapeGame() {
    escapeState = 'RESULT';
    trail = []; sparks = [];
    let currencyName = isDemoMode ? "DEMO" : "GRAM";
    
    floatingText.active = true;
    floatingText.y = H - 60;
    floatingText.alpha = 1.0;

    if (serverIsWin) {
        floatingText.txt = `+${serverWinAmount} ${currencyName}`; 
        floatingText.color = '#10b981';
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        floatingText.txt = `CRASHED`; 
        floatingText.color = '#ef4444';
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    }
    
    // Начисляем финальный баланс
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

function drawEscapeFrame() {
    if (!escapeCtx) return;
    escapeCtx.clearRect(0, 0, W, H);
    
    // 1. Рисуем зоны внизу
    drawBottomZones();

    // 2. Рисуем множитель по центру или вверху
    escapeCtx.fillStyle = '#ffffff';
    escapeCtx.font = '900 42px sans-serif'; 
    escapeCtx.textAlign = 'center'; 
    escapeCtx.textBaseline = 'middle';
    escapeCtx.shadowColor = '#00f2fe';
    escapeCtx.shadowBlur = 15;
    escapeCtx.fillText(escapeMultiplier.toFixed(2) + 'x', CX, 45);
    escapeCtx.shadowBlur = 0;

    // 3. Рисуем кольцо
    escapeCtx.save(); 
    escapeCtx.translate(CX, CY); 
    escapeCtx.rotate(ringRotation);
    
    escapeCtx.beginPath();
    // Разрыв начинается от 0 до GAP_ANGLE (визуально сдвигаем чтобы центрировать)
    escapeCtx.arc(0, 0, RING_RADIUS, GAP_ANGLE, Math.PI * 2, false);
    
    escapeCtx.strokeStyle = '#00f2fe'; 
    escapeCtx.lineWidth = 6; 
    escapeCtx.lineCap = 'round';
    escapeCtx.shadowColor = '#00f2fe';
    escapeCtx.shadowBlur = 20;
    escapeCtx.stroke();
    // Внутреннее белое свечение
    escapeCtx.strokeStyle = 'rgba(255,255,255,0.8)';
    escapeCtx.lineWidth = 2;
    escapeCtx.shadowBlur = 0;
    escapeCtx.stroke();
    escapeCtx.restore();

    // 4. Рисуем хвост
    if (trail.length > 0) {
        escapeCtx.beginPath();
        escapeCtx.moveTo(trail[0].x, trail[0].y);
        for (let i = 1; i < trail.length; i++) {
            escapeCtx.lineTo(trail[i].x, trail[i].y);
        }
        escapeCtx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
        escapeCtx.lineWidth = 6;
        escapeCtx.lineCap = 'round';
        escapeCtx.stroke();
    }

    // 5. Рисуем искры
    sparks.forEach(s => {
        escapeCtx.globalAlpha = s.life;
        escapeCtx.fillStyle = '#00f2fe';
        escapeCtx.beginPath();
        escapeCtx.arc(s.x, s.y, 2, 0, Math.PI*2);
        escapeCtx.fill();
    });
    escapeCtx.globalAlpha = 1.0;

    // 6. Рисуем шарик
    if (escapeState === 'PLAYING' || escapeState === 'FALLING') {
        escapeCtx.beginPath(); 
        escapeCtx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
        escapeCtx.fillStyle = '#ffffff'; 
        escapeCtx.shadowColor = '#00f2fe'; 
        escapeCtx.shadowBlur = 15;
        escapeCtx.fill(); 
        escapeCtx.shadowBlur = 0;
    }

    // 7. Всплывающий результат
    if (escapeState === 'RESULT' && floatingText.active) {
        escapeCtx.globalAlpha = Math.max(0, floatingText.alpha);
        escapeCtx.fillStyle = floatingText.color;
        escapeCtx.font = 'bold 28px sans-serif'; 
        escapeCtx.textAlign = 'center';
        escapeCtx.shadowColor = floatingText.color; 
        escapeCtx.shadowBlur = 10;
        escapeCtx.fillText(floatingText.txt, serverIsWin ? W/2 + 90 : W/2 - 90, floatingText.y);
        escapeCtx.globalAlpha = 1.0;
        escapeCtx.shadowBlur = 0;
    }
}

function drawBottomZones() {
    const ZONE_Y = H - 100;
    
    // RED ZONE (Left)
    let redGrad = escapeCtx.createLinearGradient(0, ZONE_Y, 0, H);
    redGrad.addColorStop(0, 'rgba(239, 68, 68, 0.05)');
    redGrad.addColorStop(1, 'rgba(239, 68, 68, 0.4)');
    escapeCtx.fillStyle = redGrad;
    escapeCtx.fillRect(0, ZONE_Y, CX, 100);
    
    escapeCtx.beginPath(); escapeCtx.moveTo(0, ZONE_Y); escapeCtx.lineTo(CX, ZONE_Y);
    escapeCtx.strokeStyle = 'rgba(239, 68, 68, 0.8)'; escapeCtx.lineWidth = 3; escapeCtx.stroke();
    
    escapeCtx.fillStyle = '#ef4444';
    escapeCtx.font = '900 16px sans-serif'; escapeCtx.textAlign = 'center';
    escapeCtx.fillText('RED ZONE', CX / 2, ZONE_Y + 40);
    escapeCtx.font = 'bold 12px sans-serif';
    escapeCtx.fillText('LOSE', CX / 2, ZONE_Y + 60);

    // GREEN ZONE (Right)
    let greenGrad = escapeCtx.createLinearGradient(CX, ZONE_Y, CX, H);
    greenGrad.addColorStop(0, 'rgba(16, 185, 129, 0.05)');
    greenGrad.addColorStop(1, 'rgba(16, 185, 129, 0.4)');
    escapeCtx.fillStyle = greenGrad;
    escapeCtx.fillRect(CX, ZONE_Y, CX, 100);
    
    escapeCtx.beginPath(); escapeCtx.moveTo(CX, ZONE_Y); escapeCtx.lineTo(W, ZONE_Y);
    escapeCtx.strokeStyle = 'rgba(16, 185, 129, 0.8)'; escapeCtx.lineWidth = 3; escapeCtx.stroke();
    
    escapeCtx.fillStyle = '#10b981';
    escapeCtx.font = '900 16px sans-serif'; escapeCtx.textAlign = 'center';
    escapeCtx.fillText('GREEN ZONE', CX + CX / 2, ZONE_Y + 40);
    escapeCtx.font = 'bold 12px sans-serif';
    escapeCtx.fillText('WIN', CX + CX / 2, ZONE_Y + 60);

    // Разделитель
    escapeCtx.beginPath(); escapeCtx.moveTo(CX, ZONE_Y); escapeCtx.lineTo(CX, H);
    escapeCtx.strokeStyle = 'rgba(255,255,255,0.1)'; escapeCtx.lineWidth = 2; escapeCtx.stroke();
}

// --- END OF FILE escape.js ---