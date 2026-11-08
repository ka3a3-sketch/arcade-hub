import { tg, score, updateBalance, addCashback, isDemoMode, showToast, initials, API_BASE_URL } from './core.js';

const escapeCanvas = document.getElementById('escapeCanvas');
const escapeCtx = escapeCanvas ? escapeCanvas.getContext('2d') : null;
const escapeBetInput = document.getElementById('escapeBetInput');
const escapeActionBtn = document.getElementById('escapeActionBtn');

let escapeState = 'IDLE'; 
let escapeMultiplier = 0.00;
let ball = { x: 150, y: 150, vx: 5, vy: -4, radius: 10 };
let ringRadius = 100;
let ringRotation = 0; 
let escapeAnimId = null;
let currentBetAmount = 0.25;

// Переменные для сервера
let serverTargetMultiplier = 0;
let serverIsWin = false;
let serverWinAmount = 0;

let floatingAnim = {
    active: false, text: "", color: "#10b981", x: 0, y: 0, startX: 0, startY: 0,
    targetX: 250, targetY: -40, progress: 0, duration: 60, alpha: 1.0, isLossTimer: null
};

// API Вызов
async function apiCall(endpoint, payload) {
    if (!tg || !tg.initData) return null;
    try {
        let res = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': tg.initData },
            body: JSON.stringify(payload)
        });
        return await res.json();
    } catch (e) {
        return null;
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
    if (escapeState === 'FLYING_REWARD' || !escapeCtx) return;
    escapeState = 'IDLE';
    escapeMultiplier = 0.00;
    ball.x = 150; ball.y = 150; ringRotation = 0;
    floatingAnim.active = false;
    drawEscapeFrame();
}

window.startEscapeGame = async function startEscapeGame() {
    if (escapeState !== 'IDLE' || !escapeBetInput) return;
    currentBetAmount = parseFloat(parseFloat(escapeBetInput.value || 0.25).toFixed(2));

    if (currentBetAmount < 0.25) { showToast('Минимальная ставка 0.25!', false); escapeBetInput.value = 0.25; return; }
    if (score < currentBetAmount) { showToast('Недостаточно средств на балансе!', false); return; }

    if (escapeActionBtn) {
        escapeActionBtn.innerText = "Подключение...";
        escapeActionBtn.style.background = "#64748b";
        escapeActionBtn.disabled = true;
    }

    // Запрашиваем результат у сервера
    let response = await apiCall('/api/escape/play', { bet: currentBetAmount, is_demo: isDemoMode });
    
    if (!response || response.error) {
        showToast(response?.error || "Ошибка соединения", false);
        if (escapeActionBtn) {
            escapeActionBtn.innerText = "Играть";
            escapeActionBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
            escapeActionBtn.disabled = false;
        }
        return;
    }

    // Настраиваем анимацию под ответ сервера
    serverTargetMultiplier = response.multiplier;
    serverIsWin = response.is_win;
    serverWinAmount = response.win_amount;

    updateBalance(response.new_balance - serverWinAmount); // Баланс без выигрыша во время полета
    addCashback(currentBetAmount * 0.15);

    if (floatingAnim.isLossTimer) { clearTimeout(floatingAnim.isLossTimer); floatingAnim.isLossTimer = null; }

    escapeState = 'PLAYING';
    escapeMultiplier = 0.00;
    floatingAnim.active = false;
    
    if (escapeActionBtn) escapeActionBtn.innerText = "Ускорение...";

    ball.x = 150; ball.y = 150;
    let angle = Math.random() * Math.PI * 2;
    ball.vx = Math.cos(angle) * 5.5;
    ball.vy = Math.sin(angle) * 5.5;

    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    cancelAnimationFrame(escapeAnimId);
    runEscapeLoop(response.new_balance);
};

function runEscapeLoop(finalBalance) {
    if (escapeState === 'IDLE') return;

    if (escapeState === 'PLAYING') {
        ringRotation += 0.035; 
        ball.x += ball.vx; ball.y += ball.vy;

        let dx = ball.x - 150, dy = ball.y - 150;
        let dist = Math.sqrt(dx * dx + dy * dy);
        let maxDist = ringRadius - ball.radius;

        // Физика отскока
        if (dist >= maxDist) {
            let nx = dx / dist, ny = dy / dist;
            let dot = ball.vx * nx + ball.vy * ny;
            ball.vx -= 2 * dot * nx; ball.vy -= 2 * dot * ny;
            ball.x = 150 + nx * maxDist; ball.y = 150 + ny * maxDist;

            // Плавно увеличиваем множитель с каждым ударом
            escapeMultiplier += 0.10;
            if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

            // ДОСТИГЛИ СЕРВЕРНОГО МНОЖИТЕЛЯ -> Исход
            if (escapeMultiplier >= serverTargetMultiplier) {
                escapeMultiplier = serverTargetMultiplier;
                
                if (serverIsWin) {
                    escapeState = 'ESCAPING';
                    // Направляем шарик в открытую дырку
                    let targetX = 70, targetY = 270;
                    let fDx = targetX - ball.x, fDy = targetY - ball.y, fDist = Math.sqrt(fDx*fDx + fDy*fDy);
                    ball.vx = (fDx / fDist) * 8.0; ball.vy = (fDy / fDist) * 8.0;
                    setTimeout(() => finishEscapeGame(finalBalance), 600);
                } else {
                    // Краш
                    escapeState = 'CRASH';
                    ball.vx = 0; ball.vy = 0;
                    setTimeout(() => finishEscapeGame(finalBalance), 500);
                }
            }
        }
    } else if (escapeState === 'ESCAPING') {
        ball.x += ball.vx; ball.y += ball.vy;
    } else if (escapeState === 'FLYING_REWARD') {
        floatingAnim.progress += 1;
        let t = floatingAnim.progress / floatingAnim.duration;
        if (t > 1) t = 1;
        floatingAnim.x = floatingAnim.startX + (floatingAnim.targetX - floatingAnim.startX) * t;
        floatingAnim.y = floatingAnim.startY + (floatingAnim.targetY - floatingAnim.startY) * t - Math.sin(t * Math.PI) * 60;
        if (t >= 1) {
            escapeState = 'IDLE'; floatingAnim.active = false;
            updateBalance(finalBalance); // Финальное обновление баланса
            if (escapeActionBtn) {
                escapeActionBtn.innerText = "Играть"; 
                escapeActionBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
                escapeActionBtn.disabled = false;
            }
        }
    }

    drawEscapeFrame();
    
    if (escapeState !== 'IDLE' || floatingAnim.active) {
        escapeAnimId = requestAnimationFrame(() => runEscapeLoop(finalBalance));
    }
}

function drawEscapeFrame() {
    if (!escapeCtx) return;
    escapeCtx.clearRect(0, 0, 300, 300);
    escapeCtx.save(); escapeCtx.translate(150, 150); escapeCtx.rotate(ringRotation);
    escapeCtx.beginPath();
    
    // Если краш - кольцо становится красным
    let arcEnd = (escapeState === 'PLAYING' || escapeState === 'ESCAPING') ? (Math.PI * 2 - 0.2) : (Math.PI * 2);
    escapeCtx.arc(0, 0, ringRadius, 0.2, arcEnd, false);
    escapeCtx.strokeStyle = (escapeState === 'CRASH') ? '#ef4444' : '#38bdf8'; 
    escapeCtx.lineWidth = 4; escapeCtx.stroke();
    escapeCtx.restore();

    if (escapeState === 'PLAYING' || escapeState === 'ESCAPING' || escapeState === 'CRASH') {
        escapeCtx.fillStyle = (escapeState === 'CRASH') ? '#ef4444' : '#ffffff'; 
        escapeCtx.font = 'bold 30px sans-serif'; escapeCtx.textAlign = 'center'; escapeCtx.textBaseline = 'middle';
        escapeCtx.fillText(escapeMultiplier.toFixed(2) + 'x', 150, 150);
    }

    let rx = (escapeState === 'IDLE' && !floatingAnim.active) ? 150 : ball.x;
    let ry = (escapeState === 'IDLE' && !floatingAnim.active) ? 150 : ball.y;

    if (escapeState !== 'FLYING_REWARD' || escapeState === 'PLAYING' || escapeState === 'ESCAPING') {
        escapeCtx.save(); escapeCtx.translate(rx, ry);
        escapeCtx.beginPath(); escapeCtx.arc(0, 0, ball.radius, 0, Math.PI * 2);
        
        let ballColor = (escapeState === 'CRASH') ? '#ef4444' : '#38bdf8';
        escapeCtx.fillStyle = ballColor; escapeCtx.shadowColor = ballColor; escapeCtx.shadowBlur = 8;
        escapeCtx.fill(); escapeCtx.lineWidth = 1.5; escapeCtx.strokeStyle = '#ffffff'; escapeCtx.stroke();
        escapeCtx.shadowBlur = 0;
        
        escapeCtx.fillStyle = '#000000'; escapeCtx.font = 'bold 9px sans-serif'; escapeCtx.textAlign = 'center'; escapeCtx.textBaseline = 'middle';
        escapeCtx.fillText(initials, 0, 0);
        escapeCtx.restore();
    }

    if (floatingAnim.active) {
        escapeCtx.save(); escapeCtx.globalAlpha = floatingAnim.alpha; escapeCtx.fillStyle = floatingAnim.color;
        escapeCtx.font = 'bold 18px sans-serif'; escapeCtx.textAlign = 'center'; escapeCtx.shadowColor = floatingAnim.color; escapeCtx.shadowBlur = 10;
        escapeCtx.fillText(floatingAnim.text, floatingAnim.x, floatingAnim.y); escapeCtx.restore();
    }
}

function finishEscapeGame(finalBalance) {
    let currencyName = isDemoMode ? "DEMO" : "GRAM";
    
    if (serverIsWin) {
        escapeState = 'FLYING_REWARD'; floatingAnim.active = true;
        floatingAnim.text = `+${serverWinAmount} ${currencyName}`; floatingAnim.color = '#10b981';
        floatingAnim.startX = 75; floatingAnim.startY = 240; floatingAnim.x = floatingAnim.startX; floatingAnim.y = floatingAnim.startY;
        floatingAnim.targetX = 240; floatingAnim.targetY = -120; floatingAnim.progress = 0; floatingAnim.duration = 50; floatingAnim.alpha = 1.0;
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        escapeState = 'IDLE'; floatingAnim.active = true;
        floatingAnim.text = `+0 ${currencyName}`; floatingAnim.color = '#ef4444';
        floatingAnim.startX = 225; floatingAnim.startY = 240; floatingAnim.x = floatingAnim.startX; floatingAnim.y = floatingAnim.startY;
        floatingAnim.alpha = 1.0;
        updateBalance(finalBalance);
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        if (escapeActionBtn) {
            escapeActionBtn.innerText = "Играть"; 
            escapeActionBtn.style.background = "linear-gradient(135deg, #10b981, #059669)"; 
            escapeActionBtn.disabled = false;
        }
        floatingAnim.isLossTimer = setTimeout(() => { floatingAnim.active = false; drawEscapeFrame(); }, 3000);
    }
}