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
let upgradePuck = { x: 140, y: 140, vx: 0, vy: 0, radius: 14, speed: 0 };
let upgradeAnimId = null;
let upgradeStartTime = 0;
let targetUpgradeAngle = 0;
let targetUpgradeDist = 0;
let totalFlightDuration = 7000;

let botAvatarImg = new Image();
botAvatarImg.src = "https://i.ibb.co/5X5521g3/image.jpg"; 
let isBotAvatarLoaded = false;
botAvatarImg.onload = function() {
    isBotAvatarLoaded = true;
    drawUpgradeFrame();
};

window.updateUpgradeChance = function(val) {
    if (upgradeState === 'SPINNING') return;
    upgradeChance = parseInt(val);
    
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
    upgradeBetInput.value = val;
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

window.maxUpgradeBet = function() {
    if (upgradeState === 'SPINNING' || !upgradeBetInput) return;
    if (score < 0.25) { showToast('Недостаточно средств!', false); return; }
    upgradeBetInput.value = parseFloat(score.toFixed(2));
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
};

export function drawUpgradeFrame() {
    if (!upgradeCtx) return;
    
    let w = upgradeCanvas.width;
    let h = upgradeCanvas.height;
    let cx = w / 2, cy = h / 2;
    let radius = Math.max(w, h) * 1.5;

    upgradeCtx.clearRect(0, 0, w, h);
    upgradeCtx.save();

    let playerAngleSpan = (upgradeChance / 100) * (Math.PI * 2);

    upgradeCtx.beginPath();
    upgradeCtx.moveTo(cx, cy);
    upgradeCtx.arc(cx, cy, radius, playerAngleSpan, Math.PI * 2, false);
    upgradeCtx.lineTo(cx, cy);
    upgradeCtx.fillStyle = '#7f1d1d'; 
    upgradeCtx.fill();
    upgradeCtx.lineWidth = 2;
    upgradeCtx.strokeStyle = '#ef4444';
    upgradeCtx.stroke();

    upgradeCtx.beginPath();
    upgradeCtx.moveTo(cx, cy);
    upgradeCtx.arc(cx, cy, radius, 0, playerAngleSpan, false);
    upgradeCtx.lineTo(cx, cy);
    upgradeCtx.fillStyle = '#064e3b'; 
    upgradeCtx.fill();
    upgradeCtx.lineWidth = 2;
    upgradeCtx.strokeStyle = '#10b981';
    upgradeCtx.stroke();

    upgradeCtx.restore();

    let greenMidAngle = playerAngleSpan / 2;
    let redMidAngle = playerAngleSpan + (Math.PI * 2 - playerAngleSpan) / 2;
    let iconDist = 70;

    let greenIconX = cx + Math.cos(greenMidAngle) * iconDist;
    let greenIconY = cy + Math.sin(greenMidAngle) * iconDist;
    let redIconX = cx + Math.cos(redMidAngle) * iconDist;
    let redIconY = cy + Math.sin(redMidAngle) * iconDist;

    drawSectorAvatar(greenIconX, greenIconY, initials, '#10b981');
    drawBotAvatar(redIconX, redIconY, '#ef4444');

    upgradeCtx.save();
    upgradeCtx.beginPath();
    upgradeCtx.arc(upgradePuck.x, upgradePuck.y, upgradePuck.radius, 0, Math.PI * 2);
    upgradeCtx.fillStyle = '#ffffff';
    upgradeCtx.shadowColor = '#38bdf8';
    upgradeCtx.shadowBlur = 10;
    upgradeCtx.fill();
    upgradeCtx.shadowBlur = 0;
    upgradeCtx.lineWidth = 2;
    upgradeCtx.strokeStyle = '#0f172a';
    upgradeCtx.stroke();

    upgradeCtx.fillStyle = '#000000';
    upgradeCtx.font = 'bold 9px sans-serif';
    upgradeCtx.textAlign = 'center';
    upgradeCtx.textBaseline = 'middle';
    upgradeCtx.fillText(initials, upgradePuck.x, upgradePuck.y);
    upgradeCtx.restore();
}

function drawSectorAvatar(x, y, text, borderColor) {
    upgradeCtx.save();
    upgradeCtx.beginPath();
    upgradeCtx.arc(x, y, 18, 0, Math.PI * 2);
    upgradeCtx.fillStyle = '#0f172a';
    upgradeCtx.fill();
    upgradeCtx.lineWidth = 2.5;
    upgradeCtx.strokeStyle = borderColor;
    upgradeCtx.stroke();

    upgradeCtx.fillStyle = '#ffffff';
    upgradeCtx.font = 'bold 10px sans-serif';
    upgradeCtx.textAlign = 'center';
    upgradeCtx.textBaseline = 'middle';
    upgradeCtx.fillText(text, x, y);
    upgradeCtx.restore();
}

function drawBotAvatar(x, y, borderColor) {
    upgradeCtx.save();
    upgradeCtx.beginPath();
    upgradeCtx.arc(x, y, 18, 0, Math.PI * 2);
    upgradeCtx.closePath();
    upgradeCtx.clip(); 

    if (isBotAvatarLoaded) {
        upgradeCtx.drawImage(botAvatarImg, x - 18, y - 18, 36, 36);
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

export function resetUpgradeVisuals() {
    upgradeState = 'IDLE';
    upgradePuck.x = 140;
    upgradePuck.y = 140;
    if (upgradeCanvasWrap) {
        upgradeCanvasWrap.style.transform = 'scale(1)';
        upgradeCanvasWrap.style.transition = 'none';
    }
    if (upgradeActionBtn) {
        upgradeActionBtn.innerText = "Сделать ставку";
        upgradeActionBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
        upgradeActionBtn.onclick = startIceUpgrade;
    }
    if (upgradeChanceRange) upgradeChanceRange.disabled = false;
    if (upgradeBetInput) upgradeBetInput.disabled = false;
    window.updateUpgradeChance(upgradeChanceRange ? upgradeChanceRange.value : 66);
}

window.startIceUpgrade = function startIceUpgrade() {
    if (upgradeState === 'SPINNING') return;
    let betVal = parseFloat(parseFloat(upgradeBetInput.value || 0.25).toFixed(2));

    if (betVal < 0.25) { showToast('Минимальная ставка 0.25 GRAM!', false); return; }
    if (score < betVal) { showToast('Недостаточно GRAM на балансе!', false); return; }

    subScore(betVal);

    upgradeState = 'SPINNING';
    if (upgradeCanvasWrap) {
        upgradeCanvasWrap.style.transform = 'scale(1)';
        upgradeCanvasWrap.style.transition = 'none';
    }

    if (upgradeChanceRange) upgradeChanceRange.disabled = true;
    if (upgradeBetInput) upgradeBetInput.disabled = true;
    if (upgradeActionBtn) {
        upgradeActionBtn.innerText = "Шайба летит...";
        upgradeActionBtn.style.background = "#64748b";
    }

    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

    let isPlayerWin = Math.random() * 100 < upgradeChance;
    let playerAngleSpan = (upgradeChance / 100) * (Math.PI * 2);

    if (isPlayerWin) {
        targetUpgradeAngle = 0.3 + Math.random() * (playerAngleSpan - 0.6);
    } else {
        targetUpgradeAngle = playerAngleSpan + 0.3 + Math.random() * (Math.PI * 2 - playerAngleSpan - 0.6);
    }
    targetUpgradeDist = 45 + Math.random() * 35;

    upgradePuck.x = 140; upgradePuck.y = 140;
    let startAngle = Math.random() * Math.PI * 2;
    upgradePuck.speed = 7.5;
    upgradePuck.vx = Math.cos(startAngle) * upgradePuck.speed;
    upgradePuck.vy = Math.sin(startAngle) * upgradePuck.speed;

    upgradeStartTime = Date.now();
    cancelAnimationFrame(upgradeAnimId);
    runUpgradeLoop(isPlayerWin, betVal);
};

function runUpgradeLoop(isPlayerWin, betVal) {
    if (upgradeState !== 'SPINNING') return;

    let elapsed = Date.now() - upgradeStartTime;
    let timeRemaining = totalFlightDuration - elapsed;

    if (timeRemaining <= 4000) {
        if (upgradeCanvasWrap) {
            upgradeCanvasWrap.style.transform = 'scale(1.35)';
            upgradeCanvasWrap.style.transition = 'transform 4s cubic-bezier(0.25, 1, 0.5, 1)';
        }
    }

    let isDecelerating = timeRemaining <= 2500;

    if (isDecelerating) {
        upgradePuck.speed *= 0.96;
        upgradePuck.vx *= 0.96;
        upgradePuck.vy *= 0.96;

        let cx = 140, cy = 140;
        let targetX = cx + Math.cos(targetUpgradeAngle) * targetUpgradeDist;
        let targetY = cy + Math.sin(targetUpgradeAngle) * targetUpgradeDist;
        
        upgradePuck.vx += (targetX - upgradePuck.x) * 0.04;
        upgradePuck.vy += (targetY - upgradePuck.y) * 0.04;
    } else {
        upgradePuck.x += upgradePuck.vx;
        upgradePuck.y += upgradePuck.vy;

        let hitWall = false;
        if (upgradePuck.x - upgradePuck.radius <= 10) { upgradePuck.x = 10 + upgradePuck.radius; upgradePuck.vx = -upgradePuck.vx; hitWall = true; }
        else if (upgradePuck.x + upgradePuck.radius >= 270) { upgradePuck.x = 270 - upgradePuck.radius; upgradePuck.vx = -upgradePuck.vx; hitWall = true; }

        if (upgradePuck.y - upgradePuck.radius <= 10) { upgradePuck.y = 10 + upgradePuck.radius; upgradePuck.vy = -upgradePuck.vy; hitWall = true; }
        else if (upgradePuck.y + upgradePuck.radius >= 270) { upgradePuck.y = 270 - upgradePuck.radius; upgradePuck.vy = -upgradePuck.vy; hitWall = true; }

        if (hitWall && tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    }

    if (isDecelerating) {
        upgradePuck.x += upgradePuck.vx;
        upgradePuck.y += upgradePuck.vy;
    }

    drawUpgradeFrame();

    if (elapsed >= totalFlightDuration || (isDecelerating && Math.abs(upgradePuck.vx) < 0.05 && Math.abs(upgradePuck.vy) < 0.05)) {
        cancelAnimationFrame(upgradeAnimId);
        finishIceUpgrade(isPlayerWin, betVal);
    } else {
        upgradeAnimId = requestAnimationFrame(() => runUpgradeLoop(isPlayerWin, betVal));
    }
}

function finishIceUpgrade(isPlayerWin, betVal) {
    upgradeState = 'FINISHED';
    let currencyName = isDemoMode ? "DEMO" : "GRAM";

    let cx = 140, cy = 140;
    upgradePuck.x = cx + Math.cos(targetUpgradeAngle) * targetUpgradeDist;
    upgradePuck.y = cy + Math.sin(targetUpgradeAngle) * targetUpgradeDist;
    drawUpgradeFrame();

    if (isPlayerWin) {
        let winAmount = parseFloat((betVal * upgradeMultiplier).toFixed(2));
        addScore(winAmount);
        showToast(`Победа! +${winAmount} ${currencyName}`, true);
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        showToast(`Поражение! Шайба остановилась у бота.`, false);
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    }

    if (upgradeChanceRange) upgradeChanceRange.disabled = false;
    if (upgradeBetInput) upgradeBetInput.disabled = false;
    if (upgradeActionBtn) {
        upgradeActionBtn.innerText = "Сделать ставку";
        upgradeActionBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
        upgradeActionBtn.onclick = startIceUpgrade;
    }
}