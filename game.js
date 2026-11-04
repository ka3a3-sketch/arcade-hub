let tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) {
    tg.expand();
}

let userName = "Игрок";
let userHandle = "@username";
let userId = "83408";
let botUsername = "GiftChase_bot";

if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    userName = tg.initDataUnsafe.user.first_name || "Игрок";
    userHandle = tg.initDataUnsafe.user.username ? "@" + tg.initDataUnsafe.user.username : "ID: " + tg.initDataUnsafe.user.id;
    userId = tg.initDataUnsafe.user.id || "83408";
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

let score = 50.0; 
let refCount = 0;
let refEarned = 0.0;
let cashbackAmount = 1.00;

const balanceEl = document.getElementById('balance');
const profileBalanceEl = document.getElementById('profile-balance');

function updateBalance() {
    if (balanceEl) balanceEl.innerText = score.toFixed(2);
    if (profileBalanceEl) profileBalanceEl.innerText = score.toFixed(2);
    
    let cbBal = document.getElementById('cashbackBalance');
    let cbBtn = document.getElementById('cashbackBtnVal');
    if (cbBal) cbBal.innerText = cashbackAmount.toFixed(2) + " GRAM";
    if (cbBtn) cbBtn.innerText = cashbackAmount.toFixed(2);
}
updateBalance();

function addTestGram() {
    score += 10.0;
    updateBalance();
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
}

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
    if (gameName === 'mines') {
        openScreen('mines');
        initGrid();
    } else if (gameName === 'escape') {
        openScreen('escape');
        resetEscapeVisuals();
    }
}

function shareRefLink() {
    let text = encodeURIComponent("Присоединяйся к Arcade Hub, играй в мини-игры и зарабатывай GRAM!");
    let shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${text}`;
    if (tg && tg.openTelegramLink) {
        tg.openTelegramLink(shareUrl);
    } else {
        navigator.clipboard.writeText(refLink);
        alert("Реферальная ссылка скопирована в буфер обмена!");
    }
}

function claimRefRewards() {
    if (refEarned <= 0) {
        alert("У вас пока нет доступных наград от рефералов!");
        return;
    }
    score += refEarned;
    refEarned = 0.0;
    document.getElementById('refEarned').innerText = "0.00";
    updateBalance();
    alert("Награды успешно зачислены!");
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
}

function claimCashback() {
    if (cashbackAmount <= 0) {
        alert("У вас нет доступного кешбека!");
        return;
    }
    score += cashbackAmount;
    cashbackAmount = 0.0;
    updateBalance();
    alert("Кешбек успешно получен!");
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
}

let soundEnabled = true;
function toggleSound(checkbox) {
    soundEnabled = checkbox.checked;
}

// ================= ESCAPE GAME LOGIC =================
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
    if (score < 0.25) { alert('Минимальная ставка 0.25 GRAM!'); return; }
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

    if (currentBetAmount < 0.25) { alert('Минимальная ставка 0.25 GRAM!'); escapeBetInput.value = 0.25; return; }
    if (score < currentBetAmount) { alert('Недостаточно GRAM на балансе!'); return; }

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
    ball.vx = Math.cos(angle) * 5.0;
    ball.vy = Math.sin(angle) * 5.0;

    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    cancelAnimationFrame(escapeAnimId);
    runEscapeLoop();
}

function runEscapeLoop() {
    if (escapeState === 'IDLE') return;
    if (escapeState === 'PLAYING') {
        ringRotation += 0.025; 
        ball.x += ball.vx; ball.y += ball.vy;

        let dx = ball.x - 150, dy = ball.y - 150;
        let dist = Math.sqrt(dx * dx + dy * dy);
        let maxDist = ringRadius - ball.radius;

        if (dist >= maxDist) {
            let hitAngle = Math.atan2(dy, dx);
            let relativeAngle = (hitAngle - ringRotation) % (Math.PI * 2);
            if (relativeAngle < 0) relativeAngle += Math.PI * 2;

            let isInGap = (relativeAngle > (Math.PI * 2 - 0.3) || relativeAngle < 0.3);
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

                escapeMultiplier = parseFloat((escapeMultiplier + 0.15).toFixed(2));
                if (Math.floor(escapeMultiplier) > lastIntegerMultiplier) {
                    lastIntegerMultiplier = Math.floor(escapeMultiplier);
                    ball.vx *= 1.15; ball.vy *= 1.15;
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
    let arcEnd = (escapeState === 'PLAYING' || escapeState === 'ESCAPING') ? (Math.PI * 2 - 0.3) : (Math.PI * 2);
    escapeCtx.arc(0, 0, ringRadius, 0.3, arcEnd, false);
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
    if (isWin) {
        if (escapeMultiplier < 0.15) escapeMultiplier = 0.30;
        let winAmount = parseFloat((currentBetAmount * escapeMultiplier).toFixed(2));
        escapeState = 'FLYING_REWARD'; floatingAnim.active = true;
        floatingAnim.text = `+${winAmount} GRAM`; floatingAnim.color = '#10b981';
        floatingAnim.startX = 75; floatingAnim.startY = 240; floatingAnim.x = floatingAnim.startX; floatingAnim.y = floatingAnim.startY;
        floatingAnim.targetX = 240; floatingAnim.targetY = -120; floatingAnim.progress = 0; floatingAnim.duration = 50; floatingAnim.alpha = 1.0; floatingAnim.pendingReward = winAmount;
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } else {
        escapeState = 'IDLE'; floatingAnim.active = true;
        floatingAnim.text = `+0 GRAM`; floatingAnim.color = '#ef4444';
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

// ================= MINES GAME LOGIC =================
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
    if (minesMultiplierEl) minesMultiplierEl.innerText = "1.00x";
    if (minesWinAmountEl) minesWinAmountEl.innerText = "0.00 GRAM";
}

function calculateMinesMultiplier(totalTiles, mines, revealed) {
    if (revealed === 0) return 1.0;
    let probability = 1.0;
    for (let i = 0; i < revealed; i++) {
        probability *= ((totalTiles - mines - i) / (totalTiles - i));
    }
    return Math.max(1.01, parseFloat(((1.0 / probability) * 0.99).toFixed(2)));
}

function startGame() {
    if (!betInput || !minesInput) return;
    currentBet = parseFloat(parseFloat(betInput.value || 0.25).toFixed(2));
    mineCount = parseInt(minesInput.value) || 3;

    if (currentBet < 0.25) { alert('Минимальная ставка 0.25 GRAM!'); betInput.value = 0.25; return; }
    if (mineCount < 1) mineCount = 1; if (mineCount > 24) mineCount = 24; minesInput.value = mineCount;
    if (score < currentBet) { alert('Недостаточно GRAM!'); return; }

    score = parseFloat((score - currentBet).toFixed(2));
    updateBalance();
    cashbackAmount += currentBet * 0.15;

    minesGameStarted = true; minesGameOver = false; revealedSafeCount = 0; currentMultiplier = 1.0;
    if (minesMultiplierEl) minesMultiplierEl.innerText = "1.00x"; 
    if (minesWinAmountEl) minesWinAmountEl.innerText = currentBet.toFixed(2) + " GRAM";

    if (actionBtn) {
        actionBtn.innerText = "Забрать выигрыш";
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
        if (minesWinAmountEl) minesWinAmountEl.innerText = currentWin + " GRAM";
        if (actionBtn) actionBtn.innerText = `Забрать (${currentWin} GRAM)`;

        if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
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