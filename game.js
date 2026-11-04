let tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) { tg.expand(); }

let userName = "Игрок";
let userHandle = "@username";
let userId = "83408";
let botUsername = "GiftChase_bot";

if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    userName = tg.initDataUnsafe.user.first_name || "Игрок";
    userHandle = tg.initDataUnsafe.user.username ? "@" + tg.initDataUnsafe.user.username : "ID: " + tg.initDataUnsafe.user.id;
    userId = String(tg.initDataUnsafe.user.id || "83408");
}

document.getElementById('username').innerText = userName;
document.getElementById('profile-name').innerText = userName;
document.getElementById('profile-username').innerText = userHandle;

let initials = userName.substring(0, 2).toUpperCase();
document.getElementById('avatar-initials').innerText = initials;
document.getElementById('profile-avatar-large').innerText = initials;

let refLink = `https://t.me/${botUsername}?start=ref_${userId}`;
const refInput = document.getElementById('refLinkInput');
if (refInput) refInput.value = refLink;

let isDemoMode = localStorage.getItem(`gram_is_demo_${userId}`) === 'true';
let realScore = parseFloat(localStorage.getItem(`gram_balance_${userId}`) || "0.0");
let demoScore = parseFloat(localStorage.getItem(`gram_demo_balance_${userId}`) || "1000.0");
let score = isDemoMode ? demoScore : realScore;

let refCount = 0;
let refEarned = 0.0;
let cashbackAmount = 1.00;

const balanceEl = document.getElementById('balance');
const profileBalanceEl = document.getElementById('profile-balance');

// ФУНКЦИЯ ВСПЛЫВАЮЩИХ ТОСТ-УВЕДОМЛЕНИЙ (вместо alert)
function showToast(text, isSuccess = false) {
    let container = document.getElementById('toast-container');
    if (!container) return;
    
    let toast = document.createElement('div');
    toast.className = `toast-msg ${isSuccess ? 'success' : ''}`;
    toast.innerText = text;
    
    container.appendChild(toast);
    
    setTimeout(() => { toast.classList.add('show'); }, 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => { toast.remove(); }, 300);
    }, 3000);
}

function updateBalance() {
    score = parseFloat(score.toFixed(2));
    
    if (isDemoMode) {
        demoScore = score;
        localStorage.setItem(`gram_demo_balance_${userId}`, demoScore);
    } else {
        realScore = score;
        localStorage.setItem(`gram_balance_${userId}`, realScore);
    }

    if (balanceEl) {
        balanceEl.innerText = score.toFixed(2);
        let currencyLabel = balanceEl.nextSibling;
        if(currencyLabel) currencyLabel.nodeValue = isDemoMode ? " DEMO" : " GRAM";
    }
    
    if (profileBalanceEl) profileBalanceEl.innerText = score.toFixed(2);
    
    let cbBal = document.getElementById('cashbackBalance');
    let cbBtn = document.getElementById('cashbackBtnVal');
    if (cbBal) cbBal.innerText = cashbackAmount.toFixed(2) + (isDemoMode ? " DEMO" : " GRAM");
    if (cbBtn) cbBtn.innerText = cashbackAmount.toFixed(2);

    updateDemoUIState();
}

function toggleDemoMode() {
    isDemoMode = !isDemoMode;
    localStorage.setItem(`gram_is_demo_${userId}`, isDemoMode);
    score = isDemoMode ? demoScore : realScore;

    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('warning');
    updateBalance();
    
    showToast(isDemoMode ? "Включен ДЕМО-режим! Баланс тестовый." : "Включен РЕАЛЬНЫЙ режим (GRAM).", isDemoMode);
}

function updateDemoUIState() {
    let demoBtn = document.getElementById('demoModeToggleBtn');
    if (demoBtn) {
        demoBtn.innerText = isDemoMode ? "Выключить Демо-режим" : "Включить Демо-режим (Тест)";
        demoBtn.style.background = isDemoMode ? "linear-gradient(135deg, #ef4444, #dc2626)" : "linear-gradient(135deg, #3b82f6, #1d4ed8)";
    }
}

updateBalance();

function openScreen(screenName) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    let target = document.getElementById('screen-' + screenName);
    if (target) target.classList.add('active');
}

function switchNav(screenName, btnElement) {
    openScreen(screenName);
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
}

function openGame(gameName) {
    if (gameName === 'iceArena') {
        if (isDemoMode) {
            showToast("PvP арена недоступна в Демо-режиме!", false);
            return;
        }
        openScreen('iceArena');
        initArenaOnOpen();
    } else if (gameName === 'escape') {
        openScreen('escape');
        resetEscapeVisuals();
    } else if (gameName === 'mines') {
        openScreen('mines');
        initGrid();
    }
}

function shareRefLink() {
    let text = encodeURIComponent("Присоединяйся к Arcade Hub, играй в мини-игры и зарабатывай GRAM!");
    let shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${text}`;
    if (tg && tg.openTelegramLink) {
        tg.openTelegramLink(shareUrl);
    } else {
        navigator.clipboard.writeText(refLink);
        showToast("Ссылка скопирована в буфер обмена!", true);
    }
}

function claimRefRewards() {
    if (refEarned <= 0) {
        showToast("У вас пока нет доступных наград от рефералов!", false);
        return;
    }
    score += refEarned;
    refEarned = 0.0;
    document.getElementById('refEarned').innerText = "0.00";
    updateBalance();
    showToast("Награды успешно зачислены!", true);
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
}

function claimCashback() {
    if (cashbackAmount <= 0) {
        showToast("У вас нет доступного кешбека!", false);
        return;
    }
    score += cashbackAmount;
    cashbackAmount = 0.0;
    updateBalance();
    showToast("Кешбек успешно получен!", true);
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
}

let soundEnabled = true;
function toggleSound(checkbox) { soundEnabled = checkbox.checked; }

// ================= ICE ARENA (PvP) =================
let arenaState = 'IDLE'; 
let arenaPlayers = []; 
let arenaTotalBank = 0;
let arenaTimer = 15;
let arenaTimerInterval = null;

const arenaCanvas = document.getElementById('arenaCanvas');
const arenaCtx = arenaCanvas ? arenaCanvas.getContext('2d') : null;
const arenaBetInput = document.getElementById('arenaBetInput');
const arenaActionBtn = document.getElementById('arenaActionBtn');
const arenaTimerText = document.getElementById('arenaTimerText');
const arenaTotalBankEl = document.getElementById('arenaTotalBank');
const arenaPlayersListEl = document.getElementById('arenaPlayersList');
const arenaWinModal = document.getElementById('arenaWinModal');

let puck = { x: 170, y: 90, vx: 0, vy: 0, radius: 12, speed: 0 };
let arenaAnimId = null;
let arrowRotationAngle = Math.PI; 
let arenaWinnerPlayer = null;

const ARENA_STORAGE_KEY = `gram_arena_session_${userId}`;

function saveArenaSession() {
    const sessionData = {
        arenaState, arenaPlayers, arenaTotalBank, arenaTimer,
        targetTimestamp: Date.now() + (arenaTimer * 1000)
    };
    localStorage.setItem(ARENA_STORAGE_KEY, JSON.stringify(sessionData));
}

function clearArenaSession() { localStorage.removeItem(ARENA_STORAGE_KEY); }

function updateArenaActionButton() {
    if (!arenaActionBtn || arenaState === 'SPINNING') return;
    let betVal = parseFloat(arenaBetInput.value || 0.25).toFixed(2);
    if (arenaState === 'IDLE' || arenaState === 'WAITING') {
        arenaActionBtn.innerText = `Поставить ${betVal} GRAM`;
        arenaActionBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
    }
}

function setArenaBet(val) {
    if (arenaState === 'SPINNING' || arenaState === 'WAITING') return;
    if (arenaBetInput) arenaBetInput.value = val.toFixed(2);
    updateArenaActionButton();
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

if (arenaBetInput) {
    arenaBetInput.addEventListener('input', () => { updateArenaActionButton(); });
}

function initArenaOnOpen() {
    const saved = localStorage.getItem(ARENA_STORAGE_KEY);
    if (saved) {
        try {
            const data = JSON.parse(saved);
            arenaState = data.arenaState;
            arenaPlayers = data.arenaPlayers;
            arenaTotalBank = data.arenaTotalBank;
            
            if (arenaState === 'WAITING') {
                const timeLeft = Math.floor((data.targetTimestamp - Date.now()) / 1000);
                if (timeLeft > 0) {
                    arenaTimer = timeLeft;
                    if (arenaActionBtn) {
                        arenaActionBtn.style.display = 'block';
                        arenaActionBtn.innerText = "Вы в игре! Ожидание...";
                        arenaActionBtn.style.background = "#64748b";
                    }
                    updateArenaSectors();
                    renderArenaPlayersList();
                    drawArenaFrame();
                    startArenaTimer(true);
                    return;
                } else {
                    triggerArenaSpin();
                    return;
                }
            } else if (arenaState === 'SPINNING') {
                triggerArenaSpin();
                return;
            }
        } catch (e) { console.error(e); }
    }
    resetArenaVisuals();
}

function resetArenaVisuals() {
    clearArenaSession();
    arenaState = 'IDLE';
    arenaWinnerPlayer = null;
    arenaPlayers = [{ name: userName, handle: userHandle, bet: 0.25, color: '#3b82f6', isUser: true, initials: initials }];
    arenaTotalBank = 0;
    if (arenaWinModal) arenaWinModal.style.display = 'none';
    if (arenaTimerInterval) clearInterval(arenaTimerInterval);
    
    if (arenaBetInput) arenaBetInput.value = "0.25";

    if (arenaActionBtn) {
        arenaActionBtn.style.display = 'block';
        updateArenaActionButton();
        arenaActionBtn.onclick = joinArenaGame;
    }
    if (arenaTimerText) arenaTimerText.innerText = "Ожидание игроков...";
    updateArenaSectors();
    renderArenaPlayersList();
    drawArenaFrame();
}

function closeArenaWinModal() {
    if (arenaWinModal) arenaWinModal.style.display = 'none';
    resetArenaVisuals();
}

function joinArenaGame() {
    if (isDemoMode) {
        showToast("PvP арена недоступна в демо-режиме!", false);
        return;
    }
    if (arenaState === 'SPINNING' || arenaState === 'WAITING') return;
    let betVal = parseFloat(parseFloat(arenaBetInput.value || 0.25).toFixed(2));
    
    if (betVal < 0.25) { showToast('Минимальная ставка 0.25 GRAM!', false); return; }
    if (score < betVal) { showToast('Недостаточно GRAM на балансе!', false); return; }

    score = parseFloat((score - betVal).toFixed(2));
    updateBalance();

    arenaPlayers = [{ name: userName, handle: userHandle, bet: betVal, color: '#3b82f6', isUser: true, initials: initials }];
    arenaTotalBank = betVal;
    
    updateArenaSectors();
    renderArenaPlayersList();
    
    if (arenaActionBtn) {
        arenaActionBtn.innerText = "Вы в игре! Ожидание...";
        arenaActionBtn.style.background = "#64748b";
    }
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    drawArenaFrame();

    setTimeout(() => {
        if (arenaState === 'WAITING') {
            let botMultipliers = [1.2, 1.5, 2.0, 2.5];
            let randomMult = botMultipliers[Math.floor(Math.random() * botMultipliers.length)];
            let botBet = parseFloat((betVal * randomMult).toFixed(2));

            arenaPlayers.push({ name: "CryptoKing", handle: "@cryptoking", bet: botBet, color: '#ef4444', isUser: false, initials: "CK" });

            updateArenaSectors();
            renderArenaPlayersList();
            drawArenaFrame();
            saveArenaSession();
        }
    }, 1500);

    startArenaTimer(false);
}

function startArenaTimer(isResumed) {
    if (!isResumed) {
        arenaState = 'WAITING';
        arenaTimer = 15;
    }
    
    if (arenaTimerText) arenaTimerText.innerText = `Старт через: ${arenaTimer}с`;
    saveArenaSession();

    if (arenaTimerInterval) clearInterval(arenaTimerInterval);
    arenaTimerInterval = setInterval(() => {
        arenaTimer--;
        if (arenaTimer > 0) {
            if (arenaTimerText) arenaTimerText.innerText = `Старт через: ${arenaTimer}с`;
            saveArenaSession();
        } else {
            clearInterval(arenaTimerInterval);
            triggerArenaSpin();
        }
    }, 1000);
}

function updateArenaSectors() {
    let total = arenaPlayers.reduce((sum, p) => sum + p.bet, 0);
    arenaTotalBank = total;
    if (arenaTotalBankEl) arenaTotalBankEl.innerText = arenaTotalBank.toFixed(2);

    let currentX = 0;
    let fieldWidth = 340;
    arenaPlayers.forEach(p => {
        let widthRatio = p.bet / total;
        let sliceWidth = fieldWidth * widthRatio;
        p.xStart = currentX;
        p.xEnd = currentX + sliceWidth;
        currentX += sliceWidth;
    });
}

function renderArenaPlayersList() {
    if (!arenaPlayersListEl) return;
    arenaPlayersListEl.innerHTML = '';

    let total = arenaPlayers.reduce((sum, p) => sum + p.bet, 0);
    if (total <= 0) total = 1;

    arenaPlayers.forEach(p => {
        let percent = ((p.bet / total) * 100).toFixed(1);
        let initialsP = p.initials || (p.name ? p.name.substring(0, 2).toUpperCase() : "US");
        let handleStr = p.handle || (p.isUser ? userHandle : "@" + p.name.toLowerCase());

        let card = document.createElement('div');
        card.classList.add('arena-player-card');
        card.innerHTML = `
            <div class="arena-player-left">
                <div class="arena-player-avatar" style="background: ${p.color};">${initialsP}</div>
                <div class="arena-player-info">
                    <h4>${handleStr}</h4>
                    <p>${p.name}</p>
                </div>
            </div>
            <div class="arena-player-right">
                <p class="arena-player-chance">${percent}%</p>
                <p class="arena-player-bet">${p.bet.toFixed(2)} GRAM</p>
            </div>
        `;
        arenaPlayersListEl.appendChild(card);
    });
}

function drawArenaFrame(isIndicatorPhase = false) {
    if (!arenaCtx) return;
    arenaCtx.clearRect(0, 0, 340, 180);

    let total = arenaPlayers.reduce((sum, p) => sum + p.bet, 0);
    if (total <= 0) total = 1;

    let fieldWidth = 340;
    let fieldHeight = 180;
    let currentX = 0;

    arenaPlayers.forEach(p => {
        let widthRatio = p.bet / total;
        let sliceWidth = fieldWidth * widthRatio;
        p.xStart = currentX;
        p.xEnd = currentX + sliceWidth;

        arenaCtx.save();
        arenaCtx.fillStyle = p.color;
        arenaCtx.fillRect(currentX, 0, sliceWidth, fieldHeight);

        if (arenaState === 'FINISHED' && arenaWinnerPlayer && p !== arenaWinnerPlayer) {
            arenaCtx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            arenaCtx.fillRect(currentX, 0, sliceWidth, fieldHeight);
        }

        if (arenaState === 'FINISHED' && arenaWinnerPlayer && p === arenaWinnerPlayer) {
            arenaCtx.strokeStyle = '#ffffff';
            arenaCtx.lineWidth = 4;
            arenaCtx.shadowColor = '#ffffff';
            arenaCtx.shadowBlur = 15;
            arenaCtx.strokeRect(currentX, 0, sliceWidth, fieldHeight);
            arenaCtx.shadowBlur = 0;
        } else {
            arenaCtx.strokeStyle = '#0f172a';
            arenaCtx.lineWidth = 2;
            arenaCtx.strokeRect(currentX, 0, sliceWidth, fieldHeight);
        }

        let centerX = currentX + sliceWidth / 2;
        let centerY = fieldHeight / 2;
        let avatarRadius = 18;

        arenaCtx.beginPath();
        arenaCtx.arc(centerX, centerY, avatarRadius, 0, Math.PI * 2);
        arenaCtx.fillStyle = p.color;
        arenaCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        arenaCtx.shadowBlur = 6;
        arenaCtx.fill();
        arenaCtx.shadowBlur = 0;
        arenaCtx.lineWidth = 2;
        arenaCtx.strokeStyle = '#ffffff';
        arenaCtx.stroke();

        arenaCtx.fillStyle = '#ffffff';
        arenaCtx.font = 'bold 11px sans-serif';
        arenaCtx.textAlign = 'center';
        arenaCtx.textBaseline = 'middle';
        let initialsP = p.initials || (p.name ? p.name.substring(0, 2).toUpperCase() : "US");
        arenaCtx.fillText(initialsP, centerX, centerY);
        
        arenaCtx.restore();
        currentX += sliceWidth;
    });

    arenaCtx.beginPath();
    arenaCtx.arc(puck.x, puck.y, puck.radius, 0, Math.PI * 2);
    arenaCtx.fillStyle = '#ffffff';
    arenaCtx.shadowColor = '#38bdf8';
    arenaCtx.shadowBlur = 12;
    arenaCtx.fill();
    arenaCtx.shadowBlur = 0;
    arenaCtx.lineWidth = 2;
    arenaCtx.strokeStyle = '#0f172a';
    arenaCtx.stroke();

    if (isIndicatorPhase) {
        arrowRotationAngle += 0.25; 
        arenaCtx.save();
        arenaCtx.translate(puck.x, puck.y);
        arenaCtx.rotate(arrowRotationAngle);

        arenaCtx.beginPath();
        arenaCtx.moveTo(puck.radius + 2, 0);
        arenaCtx.lineTo(puck.radius + 9, -4);
        arenaCtx.lineTo(puck.radius + 9, 4);
        arenaCtx.fillStyle = '#ffffff'; 
        arenaCtx.fill();
        arenaCtx.lineWidth = 1;
        arenaCtx.strokeStyle = '#0f172a';
        arenaCtx.stroke();

        arenaCtx.restore();
    }
}

function triggerArenaSpin() {
    arenaState = 'SPINNING';
    saveArenaSession();
    if (arenaTimerText) arenaTimerText.innerText = "Выбор направления...";
    if (arenaActionBtn) arenaActionBtn.style.display = 'none';

    puck.x = 170; puck.y = 90;
    let spinStartTime = Date.now();
    let hasLaunched = false;

    function spinLoop() {
        let elapsed = Date.now() - spinStartTime;

        if (elapsed < 2500) {
            drawArenaFrame(true); 
            arenaAnimId = requestAnimationFrame(spinLoop);
            return;
        }

        if (!hasLaunched) {
            hasLaunched = true;
            if (arenaTimerText) arenaTimerText.innerText = "Шайба полетела!";
            let randomAngle = (Math.random() * 1.2 + 0.3) * (Math.random() < 0.5 ? 1 : -1);
            puck.speed = 7;
            puck.vx = Math.cos(randomAngle) * puck.speed * (Math.random() < 0.5 ? 1 : -1);
            puck.vy = Math.sin(randomAngle) * puck.speed * (Math.random() < 0.5 ? 1 : -1);
        }

        let flightElapsed = elapsed - 2500;
        let isDecelerating = flightElapsed > 4000; 

        if (isDecelerating) {
            puck.speed *= 0.975;
            puck.vx *= 0.975;
            puck.vy *= 0.975;
        }

        puck.x += puck.vx;
        puck.y += puck.vy;

        let hitWall = false;
        if (puck.x - puck.radius <= 0) { puck.x = puck.radius; puck.vx = -puck.vx; hitWall = true; }
        else if (puck.x + puck.radius >= 340) { puck.x = 340 - puck.radius; puck.vx = -puck.vx; hitWall = true; }

        if (puck.y - puck.radius <= 0) { puck.y = puck.radius; puck.vy = -puck.vy; hitWall = true; }
        else if (puck.y + puck.radius >= 180) { puck.y = 180 - puck.radius; puck.vy = -puck.vy; hitWall = true; }

        if (hitWall && tg && tg.HapticFeedback) { tg.HapticFeedback.impactOccurred('light'); }

        drawArenaFrame(false); 

        if (isDecelerating && Math.abs(puck.vx) < 0.08 && Math.abs(puck.vy) < 0.08) {
            cancelAnimationFrame(arenaAnimId);
            determineArenaWinner();
        } else {
            arenaAnimId = requestAnimationFrame(spinLoop);
        }
    }
    spinLoop();
}

function determineArenaWinner() {
    arenaState = 'FINISHED';
    clearArenaSession();
    
    let winner = arenaPlayers.find(p => puck.x >= p.xStart && puck.x <= p.xEnd);
    if (!winner) winner = arenaPlayers[0];
    arenaWinnerPlayer = winner;

    let totalPool = arenaTotalBank;
    let commission = totalPool * 0.25; 
    let netWin = totalPool - commission;

    let totalSum = arenaPlayers.reduce((sum, p) => sum + p.bet, 0);
    let winnerPercent = ((winner.bet / totalSum) * 100).toFixed(1);
    let winnerHandleStr = winner.handle || (winner.isUser ? userHandle : "@" + winner.name.toLowerCase());

    if (winner.isUser) {
        score = parseFloat((score + netWin).toFixed(2));
        updateBalance();
        if (arenaTimerText) arenaTimerText.innerText = `Вы выиграли +${netWin.toFixed(2)} GRAM!`;
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        if (arenaTimerText) arenaTimerText.innerText = `Победил ${winner.name}! Банк: ${netWin.toFixed(2)} GRAM`;
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    }

    drawArenaFrame(false);

    setTimeout(() => {
        let badgeEl = document.getElementById('winModalBadgeText');
        let amountEl = document.getElementById('winModalAmountText');
        if (badgeEl) badgeEl.innerText = `${winnerHandleStr} • ${winnerPercent}%`;
        if (amountEl) amountEl.innerText = `+${netWin.toFixed(2)} GRAM`;
        if (arenaWinModal) arenaWinModal.style.display = 'flex';
    }, 800);
}

// ================= ESCAPE GAME =================
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
let gameStartTime = 0;
let lastIntegerMultiplier = 0;

let floatingAnim = {
    active: false, text: "", color: "#10b981", x: 0, y: 0, startX: 0, startY: 0,
    targetX: 250, targetY: -40, progress: 0, duration: 60, alpha: 1.0, isLossTimer: null, pendingReward: 0
};

function multiplyEscapeBet(factor) {
    if (escapeState !== 'IDLE' || !escapeBetInput) return;
    let val = parseFloat((parseFloat(escapeBetInput.value || 0.25) * factor).toFixed(2));
    if (val < 0.25) val = 0.25;
    escapeBetInput.value = val;
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

function maxEscapeBet() {
    if (escapeState !== 'IDLE' || !escapeBetInput) return;
    if (score < 0.25) { showToast('Минимальная ставка 0.25!', false); return; }
    escapeBetInput.value = parseFloat(score.toFixed(2));
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

function resetEscapeVisuals() {
    if (escapeState === 'FLYING_REWARD' || !escapeCtx) return;
    escapeState = 'IDLE';
    escapeMultiplier = 0.00;
    ball.x = 150; ball.y = 150; ringRotation = 0;
    floatingAnim.active = false;
    drawEscapeFrame();
}

function startEscapeGame() {
    if (escapeState !== 'IDLE' || !escapeBetInput) return;
    currentBetAmount = parseFloat(parseFloat(escapeBetInput.value || 0.25).toFixed(2));

    if (currentBetAmount < 0.25) { showToast('Минимальная ставка 0.25!', false); escapeBetInput.value = 0.25; return; }
    if (score < currentBetAmount) { showToast('Недостаточно средств на балансе!', false); return; }

    score = parseFloat((score - currentBetAmount).toFixed(2));
    updateBalance();
    cashbackAmount += currentBetAmount * 0.15;

    if (floatingAnim.isLossTimer) { clearTimeout(floatingAnim.isLossTimer); floatingAnim.isLossTimer = null; }

    escapeState = 'PLAYING';
    escapeMultiplier = 0.00;
    lastIntegerMultiplier = 0;
    floatingAnim.active = false;
    if (escapeActionBtn) {
        escapeActionBtn.innerText = "Игра идет...";
        escapeActionBtn.style.background = "#64748b";
    }

    ball.x = 150; ball.y = 150;
    gameStartTime = Date.now();
    let angle = Math.random() * Math.PI * 2;
    ball.vx = Math.cos(angle) * 5.5;
    ball.vy = Math.sin(angle) * 5.5;

    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    cancelAnimationFrame(escapeAnimId);
    runEscapeLoop();
}

function runEscapeLoop() {
    if (escapeState === 'IDLE') return;
    if (escapeState === 'PLAYING') {
        ringRotation += 0.035; 
        ball.x += ball.vx; ball.y += ball.vy;

        let dx = ball.x - 150, dy = ball.y - 150;
        let dist = Math.sqrt(dx * dx + dy * dy);
        let maxDist = ringRadius - ball.radius;

        if (dist >= maxDist) {
            let hitAngle = Math.atan2(dy, dx);
            let relativeAngle = (hitAngle - ringRotation) % (Math.PI * 2);
            if (relativeAngle < 0) relativeAngle += Math.PI * 2;

            let isInGap = (relativeAngle > (Math.PI * 2 - 0.2) || relativeAngle < 0.2);
            let canExit = (Date.now() - gameStartTime > 600);

            if (isInGap && canExit) {
                escapeState = 'ESCAPING';
                let isWin = (150 + Math.cos(ringRotation) * ringRadius < 150);
                let targetX = isWin ? 70 : 230, targetY = 270;
                let fDx = targetX - ball.x, fDy = targetY - ball.y, fDist = Math.sqrt(fDx*fDx + fDy*fDy);
                ball.vx = (fDx / fDist) * 8.0; ball.vy = (fDy / fDist) * 8.0;
                setTimeout(() => finishEscapeGame(isWin), 600); 
            } else {
                let nx = dx / dist, ny = dy / dist;
                let dot = ball.vx * nx + ball.vy * ny;
                ball.vx -= 2 * dot * nx; ball.vy -= 2 * dot * ny;
                let speed = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
                let currentAngle = Math.atan2(ball.vy, ball.vx) + (Math.random() - 0.5) * 1.4;
                ball.vx = Math.cos(currentAngle) * speed; ball.vy = Math.sin(currentAngle) * speed;
                ball.x = 150 + nx * maxDist; ball.y = 150 + ny * maxDist;

                escapeMultiplier = parseFloat((escapeMultiplier + 0.10).toFixed(2));
                if (Math.floor(escapeMultiplier) > lastIntegerMultiplier) {
                    lastIntegerMultiplier = Math.floor(escapeMultiplier);
                    ball.vx *= 1.2; ball.vy *= 1.2;
                    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('warning');
                }
                if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
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
            score = parseFloat((score + floatingAnim.pendingReward).toFixed(2));
            updateBalance();
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            escapeState = 'IDLE'; floatingAnim.active = false;
            if (escapeActionBtn) {
                escapeActionBtn.innerText = "Играть"; 
                escapeActionBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
                escapeActionBtn.onclick = startEscapeGame;
            }
        }
    }
    drawEscapeFrame();
    escapeAnimId = requestAnimationFrame(runEscapeLoop);
}

function drawEscapeFrame() {
    if (!escapeCtx) return;
    escapeCtx.clearRect(0, 0, 300, 300);
    escapeCtx.save(); escapeCtx.translate(150, 150); escapeCtx.rotate(ringRotation);
    escapeCtx.beginPath();
    let arcEnd = (escapeState === 'PLAYING' || escapeState === 'ESCAPING') ? (Math.PI * 2 - 0.2) : (Math.PI * 2);
    escapeCtx.arc(0, 0, ringRadius, 0.2, arcEnd, false);
    escapeCtx.strokeStyle = '#38bdf8'; escapeCtx.lineWidth = 4; escapeCtx.stroke();
    escapeCtx.restore();

    if (escapeState === 'PLAYING' || escapeState === 'ESCAPING') {
        escapeCtx.fillStyle = '#ffffff'; escapeCtx.font = 'bold 30px sans-serif'; escapeCtx.textAlign = 'center'; escapeCtx.textBaseline = 'middle';
        escapeCtx.fillText(escapeMultiplier.toFixed(2) + 'x', 150, 150);
    }

    let rx = (escapeState === 'IDLE' && !floatingAnim.active) ? 150 : ball.x;
    let ry = (escapeState === 'IDLE' && !floatingAnim.active) ? 150 : ball.y;

    if (escapeState !== 'FLYING_REWARD' || escapeState === 'PLAYING' || escapeState === 'ESCAPING') {
        escapeCtx.save(); escapeCtx.translate(rx, ry);
        escapeCtx.beginPath(); escapeCtx.arc(0, 0, ball.radius, 0, Math.PI * 2);
        escapeCtx.fillStyle = '#38bdf8'; escapeCtx.shadowColor = '#38bdf8'; escapeCtx.shadowBlur = 8;
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

function finishEscapeGame(isWin) {
    cancelAnimationFrame(escapeAnimId);
    let currencyName = isDemoMode ? "DEMO" : "GRAM";
    if (isWin) {
        if (escapeMultiplier < 0.15) escapeMultiplier = 0.30;
        let winAmount = parseFloat((currentBetAmount * escapeMultiplier).toFixed(2));
        escapeState = 'FLYING_REWARD'; floatingAnim.active = true;
        floatingAnim.text = `+${winAmount} ${currencyName}`; floatingAnim.color = '#10b981';
        floatingAnim.startX = 75; floatingAnim.startY = 240; floatingAnim.x = floatingAnim.startX; floatingAnim.y = floatingAnim.startY;
        floatingAnim.targetX = 240; floatingAnim.targetY = -120; floatingAnim.progress = 0; floatingAnim.duration = 50; floatingAnim.alpha = 1.0; floatingAnim.pendingReward = winAmount;
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        escapeState = 'IDLE'; floatingAnim.active = true;
        floatingAnim.text = `+0 ${currencyName}`; floatingAnim.color = '#ef4444';
        floatingAnim.startX = 225; floatingAnim.startY = 240; floatingAnim.x = floatingAnim.startX; floatingAnim.y = floatingAnim.startY;
        floatingAnim.alpha = 1.0; floatingAnim.pendingReward = 0;
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        if (escapeActionBtn) {
            escapeActionBtn.innerText = "Играть"; 
            escapeActionBtn.style.background = "linear-gradient(135deg, #10b981, #059669)"; 
            escapeActionBtn.onclick = startEscapeGame;
        }
        floatingAnim.isLossTimer = setTimeout(() => { floatingAnim.active = false; drawEscapeFrame(); }, 5000);
    }
    runEscapeLoop();
}

// ================= MINES GAME =================
let gridSize = 25, board = [], minesGameStarted = false, minesGameOver = false;
let currentBet = 0.25, mineCount = 3, revealedSafeCount = 0, currentMultiplier = 1.0;

const gridEl = document.getElementById('grid');
const actionBtn = document.getElementById('actionBtn');
const betInput = document.getElementById('betInput');
const minesInput = document.getElementById('minesInput');
const minesMultiplierEl = document.getElementById('minesMultiplier');
const minesWinAmountEl = document.getElementById('minesWinAmount');

function setBetPercent(percent) {
    if (minesGameStarted) return;
    currentBet = parseFloat(Math.max(0.25, score * percent).toFixed(2));
    if (betInput) betInput.value = currentBet;
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

function multiplyBet(multiplier) {
    if (minesGameStarted || !betInput) return;
    let val = parseFloat(((parseFloat(betInput.value) || 0.25) * multiplier).toFixed(2));
    if (val < 0.25) val = 0.25;
    if (val > score) val = parseFloat(score.toFixed(2));
    betInput.value = val;
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

function initGrid() {
    if (!gridEl) return;
    gridEl.innerHTML = '';
    for (let i = 0; i < gridSize; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        cell.addEventListener('click', () => clickCell(i, cell));
        gridEl.appendChild(cell);
    }
    let currencyName = isDemoMode ? "DEMO" : "GRAM";
    if (minesMultiplierEl) minesMultiplierEl.innerText = "0.80x";
    if (minesWinAmountEl) minesWinAmountEl.innerText = (currentBet * 0.8).toFixed(2) + " " + currencyName;
}

function calculateMinesMultiplier(totalTiles, mines, revealed) {
    if (revealed === 0) return 0.80;
    let probability = 1.0;
    for (let i = 0; i < revealed; i++) {
        probability *= ((totalTiles - mines - i) / (totalTiles - i));
    }
    let mult = (1.0 / probability) * 0.90;
    return Math.max(0.80, parseFloat(mult.toFixed(2)));
}

function startGame() {
    if (!betInput || !minesInput) return;
    currentBet = parseFloat(parseFloat(betInput.value || 0.25).toFixed(2));
    mineCount = parseInt(minesInput.value) || 3;

    let currencyName = isDemoMode ? "DEMO" : "GRAM";

    if (currentBet < 0.25) { showToast('Минимальная ставка 0.25!', false); betInput.value = 0.25; return; }
    if (mineCount < 1) mineCount = 1; if (mineCount > 24) mineCount = 24; minesInput.value = mineCount;
    if (score < currentBet) { showToast('Недостаточно средств!', false); return; }

    score = parseFloat((score - currentBet).toFixed(2));
    updateBalance();
    cashbackAmount += currentBet * 0.15;

    minesGameStarted = true; minesGameOver = false; revealedSafeCount = 0; currentMultiplier = 0.80;
    let startWin = (currentBet * 0.80).toFixed(2);
    if (minesMultiplierEl) minesMultiplierEl.innerText = "0.80x"; 
    if (minesWinAmountEl) minesWinAmountEl.innerText = startWin + " " + currencyName;

    if (actionBtn) {
        actionBtn.innerText = `Забрать (${startWin} ${currencyName})`;
        actionBtn.style.background = "linear-gradient(135deg, #eab308, #ca8a04)";
        actionBtn.onclick = cashOut;
    }

    betInput.disabled = true; minesInput.disabled = true;
    board = Array(gridSize).fill('safe');
    let planted = 0;
    while (planted < mineCount) {
        let idx = Math.floor(Math.random() * gridSize);
        if (board[idx] === 'safe') { board[idx] = 'mine'; planted++; }
    }
    initGrid();
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
}

function clickCell(index, cell) {
    if (!minesGameStarted || minesGameOver || cell.classList.contains('revealed')) return;
    cell.classList.add('revealed');

    let currencyName = isDemoMode ? "DEMO" : "GRAM";

    if (board[index] === 'mine') {
        cell.classList.add('mine'); cell.innerText = 'X';
        minesGameOver = true; minesGameStarted = false;
        if (betInput) betInput.disabled = false; 
        if (minesInput) minesInput.disabled = false;
        revealAllMines();
        if (actionBtn) {
            actionBtn.innerText = "Сделать ставку"; 
            actionBtn.style.background = "linear-gradient(135deg, #10b981, #059669)"; 
            actionBtn.onclick = startGame;
        }
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
    } else {
        cell.classList.add('safe'); cell.innerText = '+';
        revealedSafeCount++;
        currentMultiplier = calculateMinesMultiplier(gridSize, mineCount, revealedSafeCount);
        let currentWin = (currentBet * currentMultiplier).toFixed(2);
        
        if (minesMultiplierEl) minesMultiplierEl.innerText = currentMultiplier.toFixed(2) + "x";
        if (minesWinAmountEl) minesWinAmountEl.innerText = currentWin + " " + currencyName;
        if (actionBtn) actionBtn.innerText = `Забрать (${currentWin} ${currencyName})`;

        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('light');
        if (revealedSafeCount === (gridSize - mineCount)) { cashOut(); }
    }
}

function cashOut() {
    if (!minesGameStarted || minesGameOver) return;
    minesGameOver = true; minesGameStarted = false;
    if (betInput) betInput.disabled = false; 
    if (minesInput) minesInput.disabled = false;

    let winnings = parseFloat((currentBet * currentMultiplier).toFixed(2));
    score = parseFloat((score + winnings).toFixed(2));
    updateBalance();
    revealAllMines();

    if (actionBtn) {
        actionBtn.innerText = "Сделать ставку";
        actionBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
        actionBtn.onclick = startGame;
    }
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
}

function revealAllMines() {
    const cells = document.querySelectorAll('.cell');
    cells.forEach((cell, idx) => {
        cell.classList.add('revealed');
        if (board[idx] === 'mine') { cell.classList.add('mine'); cell.innerText = 'X'; }
        else if (!cell.classList.contains('safe')) { cell.innerText = '.'; cell.style.opacity = '0.4'; }
    });
}

// ================= TON CONNECT =================
const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: 'https://ka3a3-sketch.github.io/arcade-hub/tonconnect-manifest.json',
    buttonRootId: 'ton-connect-button'
});

function openDepositModal() {
    if (isDemoMode) {
        showToast("Пополнение недоступно в демо-режиме.", false);
        return;
    }
    let modal = document.getElementById('depositModal');
    if (modal) modal.style.display = 'flex';
}

function closeDepositModal() {
    let modal = document.getElementById('depositModal');
    if (modal) modal.style.display = 'none';
}

function selectDepositTon(val) {
    let input = document.getElementById('customTonInput');
    if (input) input.value = val.toFixed(1);
}

async function sendTonDeposit() {
    if (!tonConnectUI.connected) {
        showToast('Пожалуйста, подключите кошелек!', false);
        return;
    }

    let input = document.getElementById('customTonInput');
    let gramAmount = parseFloat(input ? input.value : 1.0);

    if (isNaN(gramAmount) || gramAmount <= 0) {
        showToast('Введите корректную сумму!', false);
        return;
    }

    let nanoAmount = Math.floor(gramAmount * 1_000_000_000).toString();
    const MERCHANT_WALLET = 'UQBDFjzLt03Y8uPDwLwQF7y_3DQI0hLA6-iV8srfE31_MweH'; 

    const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{ address: MERCHANT_WALLET, amount: nanoAmount, payload: "te6cckEBAQEADgAAGiB1c2VyX2lk_" + userId }]
    };

    try {
        closeDepositModal();
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('warning');
        
        const result = await tonConnectUI.sendTransaction(transaction);
        score += gramAmount;
        updateBalance();

        showToast(`Оплата прошла! Зачислено +${gramAmount.toFixed(2)} GRAM.`, true);
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');

    } catch (e) {
        showToast('Оплата отменена или произошла ошибка.', false);
    }
}