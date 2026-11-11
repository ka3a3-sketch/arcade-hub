// --- START OF FILE escape.js ---

import { tg, score, updateBalance, addCashback, isDemoMode, showToast, initials } from './core.js';

const escapeCanvas = document.getElementById('escapeCanvas');
const escapeCtx = escapeCanvas ? escapeCanvas.getContext('2d') : null;
const escapeBetInput = document.getElementById('escapeBetInput');
const escapeActionBtn = document.getElementById('escapeActionBtn');
const escapeBalanceDisplay = document.getElementById('escapeBalanceDisplay');

const W = 380;
const H = 420;
const CX = W / 2;
const CY = 160;
const RING_RADIUS = 100;
const BALL_RADIUS = 12;

const GAP_START = -2.7;
const GAP_END = -2.1;

if (escapeCanvas) {
    escapeCanvas.width = W;
    escapeCanvas.height = H;
}

let gameState = 'IDLE'; 
let escapeMultiplier = 0.00;
let currentBetAmount = 0.10;
let isEscaped = false;
let engineRunning = false;

// ФИЗИКА (НЕТРОНУТАЯ)
let ball = { x: CX, y: CY, vx: 0, vy: 0 };
let ringRotation = 0; 

// ЭФФЕКТЫ (РАСШИРЕНО ДЛЯ ААА ГРАФИКИ)
let trail = [];
let particles = [];
let shockwaves = []; // Новая система ударных волн
let ringFlash = 0;
let multScale = 1.0;
let floatingUI = { active: false, text: "", color: "", y: 0, alpha: 0 };

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
    avatarLoaded = false;
}

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
    shockwaves = [];
    floatingUI.active = false;
    ball = { x: CX, y: CY, vx: 0, vy: 0 }; 
    updateEscapeBalanceUI();
    if (!engineRunning) {
        engineRunning = true;
        requestAnimationFrame(physicsEngineLoop);
    }
}

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
    shockwaves = [];
    floatingUI.active = false;
    ringFlash = 0;
    multScale = 1.0;
    
    if (escapeActionBtn) {
        escapeActionBtn.innerText = "В ИГРЕ...";
        escapeActionBtn.style.background = "#374151";
        escapeActionBtn.style.boxShadow = "none";
        escapeActionBtn.style.pointerEvents = "none";
    }

    ball.x = CX + (Math.random() - 0.5) * 10;
    ball.y = CY + (Math.random() - 0.5) * 10;
    let angle = Math.random() * Math.PI * 2;
    let speed = 9.0 + Math.random() * 2.5; 
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;

    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
};

function physicsEngineLoop() {
    try {
        ringRotation += 0.025;
        if (ringRotation > Math.PI * 2) ringRotation -= Math.PI * 2;

        if (gameState === 'IDLE') {
            ball.x = CX;
            ball.y = CY + Math.sin(Date.now() / 400) * 6; // Плавная левитация
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

function updatePhysics() {
    // ЛОГИКА 100% НЕТРОНУТА
    ball.x += ball.vx;
    ball.y += ball.vy;

    let dx = ball.x - CX;
    let dy = ball.y - CY;
    let dist = Math.hypot(dx, dy);

    if (!isEscaped) {
        if (dist + BALL_RADIUS >= RING_RADIUS) {
            let globalAngle = Math.atan2(dy, dx);
            let localAngle = globalAngle - ringRotation;
            
            while (localAngle <= -Math.PI) localAngle += Math.PI * 2;
            while (localAngle > Math.PI) localAngle -= Math.PI * 2;

            if (localAngle >= GAP_START && localAngle <= GAP_END) {
                isEscaped = true; 
                createExplosion(ball.x, ball.y, '#38BDF8', 20);
                if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('heavy');
            } else {
                let nx = dx / dist;
                let ny = dy / dist;
                let dot = ball.vx * nx + ball.vy * ny;
                
                let rvx = ball.vx - 2 * dot * nx;
                let rvy = ball.vy - 2 * dot * ny;
                
                let speed = Math.hypot(rvx, rvy);
                let currentAngle = Math.atan2(rvy, rvx);
                let chaoticJitter = (Math.random() - 0.5) * 0.45; 
                let newAngle = currentAngle + chaoticJitter;

                ball.vx = Math.cos(newAngle) * speed;
                ball.vy = Math.sin(newAngle) * speed;

                ball.x = CX + nx * (RING_RADIUS - BALL_RADIUS - 1.5);
                ball.y = CY + ny * (RING_RADIUS - BALL_RADIUS - 1.5);

                escapeMultiplier += 0.10;
                
                // ВЫЗОВЫ НОВЫХ ЭФФЕКТОВ
                ringFlash = 1.0;
                multScale = 1.18; // Пружинящий Punch-эффект
                createExplosion(ball.x, ball.y, '#00F2FE', 6);
                shockwaves.push({ x: ball.x, y: ball.y, radius: BALL_RADIUS, alpha: 1.0 }); // Шоквейв
                
                if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
            }
        }
    } else {
        ball.vy += 0.35; 

        if (ball.x - BALL_RADIUS < 0) {
            ball.x = BALL_RADIUS; ball.vx *= -0.7;
        } else if (ball.x + BALL_RADIUS > W) {
            ball.x = W - BALL_RADIUS; ball.vx *= -0.7;
        }

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

        if (ball.y + BALL_RADIUS >= H - 65) { // Подняли пол для красивых зон
            ball.y = H - 65 - BALL_RADIUS;
            finishRound();
        }
    }

    trail.unshift({ x: ball.x, y: ball.y, alpha: 1.0 });
    if (trail.length > 20) trail.pop();
}

function updateEffects() {
    trail.forEach(t => t.alpha -= 0.05);
    
    particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.15; 
        p.life -= p.decay;
    });
    particles = particles.filter(p => p.life > 0);

    shockwaves.forEach(sw => {
        sw.radius += 4;
        sw.alpha -= 0.08;
    });
    shockwaves = shockwaves.filter(sw => sw.alpha > 0);

    if (ringFlash > 0) ringFlash -= 0.05;
    // Spring Animation (Пружина)
    if (multScale > 1.0) multScale += (1.0 - multScale) * 0.25;

    if (floatingUI.active) {
        floatingUI.y -= 1.0;
        floatingUI.alpha -= 0.015;
    }
}

function finishRound() {
    gameState = 'FINISHED';
    
    let isWin = ball.x < CX; 
    let winAmount = isWin ? currentBetAmount * escapeMultiplier : 0;
    
    // Элитные партиклы в зависимости от зоны
    if (isWin) {
        createExplosion(ball.x, ball.y, '#10B981', 25);
        createExplosion(ball.x, ball.y, '#FBBF24', 25); // Золото + Зелень
    } else {
        createExplosion(ball.x, ball.y, '#EF4444', 40);
    }
    
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred(isWin ? 'success' : 'error');

    if (isWin && winAmount > 0) {
        updateBalance(score + winAmount);
    }
    updateEscapeBalanceUI();

    let currencyName = isDemoMode ? "DEMO" : "GRAM";
    floatingUI = {
        active: true,
        text: isWin ? `+${winAmount.toFixed(2)} ${currencyName}` : `CRASHED`,
        color: isWin ? '#10B981' : '#EF4444',
        y: ball.y - 35,
        alpha: 1.0
    };

    if (escapeActionBtn) {
        escapeActionBtn.innerText = "ИГРАТЬ";
        escapeActionBtn.style.background = "linear-gradient(180deg, #10B981 0%, #059669 100%)";
        escapeActionBtn.style.boxShadow = "inset 0 2px 0 rgba(255,255,255,0.2), 0 8px 25px rgba(16,185,129,0.35)";
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
            color: color, life: 1.0, decay: Math.random() * 0.02 + 0.01
        });
    }
}

// --- НОВЫЙ AAA РЕНДЕР ---
function renderGraphics() {
    if (!escapeCtx) return;
    
    // 1. Cyber-Background
    escapeCtx.fillStyle = '#05070A';
    escapeCtx.fillRect(0, 0, W, H);
    
    let bgGrad = escapeCtx.createRadialGradient(CX, CY, 0, CX, CY, W);
    bgGrad.addColorStop(0, '#0D1117');
    bgGrad.addColorStop(1, 'transparent');
    escapeCtx.fillStyle = bgGrad;
    escapeCtx.fillRect(0, 0, W, H);

    // Кибер-сетка
    escapeCtx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    escapeCtx.lineWidth = 1;
    escapeCtx.beginPath();
    for(let i=0; i<=W; i+=25) { escapeCtx.moveTo(i, 0); escapeCtx.lineTo(i, H); }
    for(let i=0; i<=H; i+=25) { escapeCtx.moveTo(0, i); escapeCtx.lineTo(W, i); }
    escapeCtx.stroke();

    // 2. Landing Zones (Frosted Glass)
    const zoneH = 65;
    
    // WIN Zone
    let gGrad = escapeCtx.createLinearGradient(0, H - zoneH, 0, H);
    gGrad.addColorStop(0, 'rgba(16, 185, 129, 0.0)');
    gGrad.addColorStop(1, 'rgba(16, 185, 129, 0.35)');
    escapeCtx.fillStyle = gGrad;
    escapeCtx.fillRect(0, H - zoneH, CX, zoneH);
    escapeCtx.beginPath(); escapeCtx.moveTo(0, H - zoneH); escapeCtx.lineTo(CX, H - zoneH);
    escapeCtx.strokeStyle = 'rgba(16, 185, 129, 0.8)'; escapeCtx.lineWidth = 2; escapeCtx.stroke();
    escapeCtx.fillStyle = '#10B981'; escapeCtx.font = '900 16px "SF Pro Display", sans-serif'; escapeCtx.textAlign = 'center';
    escapeCtx.shadowColor = '#10B981'; escapeCtx.shadowBlur = 10;
    escapeCtx.fillText('💰 WIN', CX/2, H - 25);
    escapeCtx.shadowBlur = 0;

    // LOSE Zone
    let rGrad = escapeCtx.createLinearGradient(CX, H - zoneH, CX, H);
    rGrad.addColorStop(0, 'rgba(239, 68, 68, 0.0)');
    rGrad.addColorStop(1, 'rgba(239, 68, 68, 0.35)');
    escapeCtx.fillStyle = rGrad;
    escapeCtx.fillRect(CX, H - zoneH, CX, zoneH);
    escapeCtx.beginPath(); escapeCtx.moveTo(CX, H - zoneH); escapeCtx.lineTo(W, H - zoneH);
    escapeCtx.strokeStyle = 'rgba(239, 68, 68, 0.8)'; escapeCtx.lineWidth = 2; escapeCtx.stroke();
    escapeCtx.fillStyle = '#EF4444'; escapeCtx.font = '900 16px "SF Pro Display", sans-serif'; escapeCtx.textAlign = 'center';
    escapeCtx.shadowColor = '#EF4444'; escapeCtx.shadowBlur = 10;
    escapeCtx.fillText('💀 LOSE', CX + CX/2, H - 25);
    escapeCtx.shadowBlur = 0;

    // Лазерный разделитель
    let laserGrad = escapeCtx.createLinearGradient(0, H-zoneH, 0, H);
    laserGrad.addColorStop(0, 'rgba(255,255,255,0.4)'); laserGrad.addColorStop(1, 'transparent');
    escapeCtx.beginPath(); escapeCtx.moveTo(CX, H-zoneH); escapeCtx.lineTo(CX, H);
    escapeCtx.strokeStyle = laserGrad; escapeCtx.lineWidth = 2; escapeCtx.stroke();

    // 3. Cyber Core Ring (Вращающееся)
    let currentGapStart = GAP_START + ringRotation;
    let currentGapEnd = GAP_END + ringRotation;

    // Внутренние HUD-засечки
    escapeCtx.save();
    escapeCtx.translate(CX, CY);
    escapeCtx.rotate(ringRotation);
    escapeCtx.strokeStyle = 'rgba(255,255,255,0.15)';
    escapeCtx.lineWidth = 1.5;
    for(let a=0; a<Math.PI*2; a+=Math.PI/18) {
        let normA = a > Math.PI ? a - Math.PI*2 : a;
        if (normA > GAP_START && normA < GAP_END) continue; // Не рисуем в разрыве
        escapeCtx.beginPath();
        escapeCtx.moveTo(Math.cos(normA)*(RING_RADIUS - 12), Math.sin(normA)*(RING_RADIUS - 12));
        escapeCtx.lineTo(Math.cos(normA)*(RING_RADIUS - 4), Math.sin(normA)*(RING_RADIUS - 4));
        escapeCtx.stroke();
    }
    escapeCtx.restore();

    // Атмосферное свечение кольца
    escapeCtx.beginPath();
    escapeCtx.arc(CX, CY, RING_RADIUS, currentGapEnd, currentGapStart, false);
    escapeCtx.strokeStyle = 'rgba(56, 189, 248, 0.35)'; 
    escapeCtx.lineWidth = 12;
    escapeCtx.lineCap = 'round';
    escapeCtx.shadowColor = '#38BDF8';
    escapeCtx.shadowBlur = 35;
    escapeCtx.stroke();

    // Главная дуга
    escapeCtx.beginPath();
    escapeCtx.arc(CX, CY, RING_RADIUS, currentGapEnd, currentGapStart, false);
    let rb = Math.floor(Math.max(0, ringFlash) * 150);
    escapeCtx.strokeStyle = `rgb(${56 + rb}, ${189 + rb}, 248)`; 
    escapeCtx.lineWidth = 6 + (ringFlash > 0 ? ringFlash * 2 : 0);
    escapeCtx.shadowBlur = 15 + (ringFlash > 0 ? ringFlash * 20 : 0);
    escapeCtx.stroke();
    escapeCtx.shadowBlur = 0;

    // LED-индикаторы на торцах разрыва
    escapeCtx.fillStyle = '#FFFFFF';
    escapeCtx.shadowColor = '#FFFFFF'; escapeCtx.shadowBlur = 15;
    escapeCtx.beginPath(); escapeCtx.arc(CX + Math.cos(currentGapStart)*RING_RADIUS, CY + Math.sin(currentGapStart)*RING_RADIUS, 3.5, 0, Math.PI*2); escapeCtx.fill();
    escapeCtx.beginPath(); escapeCtx.arc(CX + Math.cos(currentGapEnd)*RING_RADIUS, CY + Math.sin(currentGapEnd)*RING_RADIUS, 3.5, 0, Math.PI*2); escapeCtx.fill();
    escapeCtx.shadowBlur = 0;

    // 4. Множитель (Металлический градиент)
    escapeCtx.save();
    escapeCtx.translate(CX, CY);
    escapeCtx.scale(multScale, multScale);
    let textGrad = escapeCtx.createLinearGradient(0, -25, 0, 25);
    textGrad.addColorStop(0, '#FFFFFF');
    textGrad.addColorStop(1, '#94A3B8');
    escapeCtx.fillStyle = textGrad;
    escapeCtx.font = '900 52px "SF Pro Display", -apple-system, sans-serif';
    escapeCtx.textAlign = 'center';
    escapeCtx.textBaseline = 'middle';
    escapeCtx.shadowColor = 'rgba(56, 189, 248, 0.5)';
    escapeCtx.shadowBlur = 20 + ringFlash * 15;
    escapeCtx.fillText(escapeMultiplier.toFixed(2) + 'x', 0, 0);
    escapeCtx.restore();

    // 5. Шоквейвы (Ударные волны)
    shockwaves.forEach(sw => {
        escapeCtx.beginPath();
        escapeCtx.arc(sw.x, sw.y, sw.radius, 0, Math.PI*2);
        escapeCtx.strokeStyle = `rgba(56, 189, 248, ${sw.alpha})`;
        escapeCtx.lineWidth = 2;
        escapeCtx.stroke();
    });

    // 6. Кинематографичный шлейф (Motion Trail)
    if (trail.length > 1 && gameState !== 'IDLE') {
        escapeCtx.beginPath();
        escapeCtx.moveTo(trail[0].x, trail[0].y);
        for (let i = 1; i < trail.length; i++) {
            escapeCtx.lineTo(trail[i].x, trail[i].y);
        }
        let grad = escapeCtx.createLinearGradient(trail[0].x, trail[0].y, trail[trail.length-1].x, trail[trail.length-1].y);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.8)'); // Белое ядро
        grad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');  // Растворяется в неон
        escapeCtx.strokeStyle = grad;
        escapeCtx.lineWidth = BALL_RADIUS * 1.2;
        escapeCtx.lineCap = 'round';
        escapeCtx.lineJoin = 'round';
        escapeCtx.shadowColor = '#38BDF8';
        escapeCtx.shadowBlur = 10;
        escapeCtx.stroke();
        escapeCtx.shadowBlur = 0;
    }

    // 7. Искры
    particles.forEach(p => {
        escapeCtx.globalAlpha = Math.max(0, p.life);
        escapeCtx.fillStyle = p.color;
        escapeCtx.shadowColor = p.color;
        escapeCtx.shadowBlur = 12;
        escapeCtx.beginPath(); escapeCtx.arc(p.x, p.y, 2.5, 0, Math.PI*2); escapeCtx.fill();
    });
    escapeCtx.globalAlpha = 1.0;
    escapeCtx.shadowBlur = 0;

    // 8. Шарик-Сфера (Аватар с тенями)
    escapeCtx.save();
    escapeCtx.translate(ball.x, ball.y);
    if (gameState === 'PLAYING' || gameState === 'FINISHED') {
        escapeCtx.rotate(Math.atan2(ball.vy, ball.vx));
    }
    
    // Светящийся барьер
    escapeCtx.beginPath();
    escapeCtx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
    escapeCtx.lineWidth = 2.5;
    escapeCtx.strokeStyle = 'rgba(56, 189, 248, 0.95)';
    escapeCtx.shadowColor = '#38BDF8';
    escapeCtx.shadowBlur = 15;
    escapeCtx.stroke();
    escapeCtx.shadowBlur = 0;
    
    // Аватарка
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
        escapeCtx.font = '900 12px sans-serif';
        escapeCtx.textAlign = 'center';
        escapeCtx.textBaseline = 'middle';
        escapeCtx.fillText(initials || "U", 0, 0);
    }
    
    // Внутренняя тень (Inner shadow) для эффекта стеклянной сферы
    let innerShadow = escapeCtx.createRadialGradient(0, 0, BALL_RADIUS*0.4, 0, 0, BALL_RADIUS);
    innerShadow.addColorStop(0, 'rgba(0,0,0,0)');
    innerShadow.addColorStop(1, 'rgba(0,0,0,0.65)');
    escapeCtx.fillStyle = innerShadow;
    escapeCtx.fillRect(-BALL_RADIUS, -BALL_RADIUS, BALL_RADIUS*2, BALL_RADIUS*2);
    
    escapeCtx.restore();

    // 9. Floating Result UI
    if (floatingUI.active && floatingUI.alpha > 0) {
        escapeCtx.globalAlpha = Math.max(0, floatingUI.alpha);
        escapeCtx.fillStyle = floatingUI.color;
        escapeCtx.font = '900 36px "SF Pro Display", sans-serif';
        escapeCtx.textAlign = 'center';
        escapeCtx.shadowColor = floatingUI.color;
        escapeCtx.shadowBlur = 25;
        escapeCtx.fillText(floatingUI.text, ball.x, floatingUI.y);
        escapeCtx.globalAlpha = 1.0;
        escapeCtx.shadowBlur = 0;
    }
}

resetEscapeVisuals();

// --- END OF FILE escape.js ---