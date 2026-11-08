export let tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) { tg.expand(); }

export let userName = "Игрок";
export let userHandle = "@username";
export let userId = "83408";
let botUsername = "GiftChase_bot";

if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    userName = tg.initDataUnsafe.user.first_name || "Игрок";
    userHandle = tg.initDataUnsafe.user.username ? "@" + tg.initDataUnsafe.user.username : "ID: " + tg.initDataUnsafe.user.id;
    userId = String(tg.initDataUnsafe.user.id || "83408");
}

document.getElementById('username').innerText = userName;
document.getElementById('profile-name').innerText = userName;
document.getElementById('profile-username').innerText = userHandle;

export let initials = userName.substring(0, 2).toUpperCase();
document.getElementById('avatar-initials').innerText = initials;
document.getElementById('profile-avatar-large').innerText = initials;

let refLink = `https://t.me/${botUsername}?start=ref_${userId}`;
const refInput = document.getElementById('refLinkInput');
if (refInput) refInput.value = refLink;

export let isDemoMode = localStorage.getItem(`gram_is_demo_${userId}`) === 'true';
export let realScore = parseFloat(localStorage.getItem(`gram_balance_${userId}`) || "0.0");
export let demoScore = parseFloat(localStorage.getItem(`gram_demo_balance_${userId}`) || "1000.0");
export let score = isDemoMode ? demoScore : realScore;

export let refEarned = 0.0;
export let cashbackAmount = 1.00;

const balanceEl = document.getElementById('balance');
const profileBalanceEl = document.getElementById('profile-balance');

export function showToast(text, isSuccess = false) {
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

export function updateBalance(newScore) {
    if (newScore !== undefined) {
        score = newScore;
    }
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

export function setScore(val) { score = val; updateBalance(); }
export function addScore(val) { score += val; updateBalance(); }
export function subScore(val) { score -= val; updateBalance(); }
export function addCashback(val) { cashbackAmount += val; updateBalance(); }

function updateDemoUIState() {
    let demoBtn = document.getElementById('demoModeToggleBtn');
    if (demoBtn) {
        demoBtn.innerText = isDemoMode ? "Выключить Демо-режим" : "Включить Демо-режим (Тест 1000)";
        demoBtn.style.background = isDemoMode ? "linear-gradient(135deg, #ef4444, #dc2626)" : "linear-gradient(135deg, #3b82f6, #1d4ed8)";
    }
}

window.toggleDemoMode = function() {
    isDemoMode = !isDemoMode;
    localStorage.setItem(`gram_is_demo_${userId}`, isDemoMode);
    
    if (isDemoMode) {
        demoScore = 1000.0;
        localStorage.setItem(`gram_demo_balance_${userId}`, demoScore);
        score = demoScore;
    } else {
        score = realScore;
    }

    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('warning');
    updateBalance();
    showToast(isDemoMode ? "Включен ДЕМО-режим! Баланс: 1000 бонусных GRAM." : "Включен РЕАЛЬНЫЙ режим (GRAM).", isDemoMode);
};

updateBalance();

// ГЛОБАЛЬНЫЕ ФУНКЦИИ НАВИГАЦИИ (Единственное место объявления)
window.openScreen = function(screenName) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    let target = document.getElementById('screen-' + screenName);
    if (target) target.classList.add('active');
    
    if (screenName === 'iceUpgrade') {
        import('./iceUpgrade.js').then(module => {
            if (module.drawUpgradeFrame) module.drawUpgradeFrame();
        }).catch(e => console.log(e));
    }
};

window.switchNav = function(screenName, btnElement) {
    window.openScreen(screenName);
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
};

window.openGame = function(gameName) {
    window.openScreen(gameName);

    if (gameName === 'iceArena') {
        import('./iceArena.js').then(module => {
            if (module.initArenaOnOpen) module.initArenaOnOpen();
        }).catch(e => console.log(e));
    } else if (gameName === 'iceUpgrade') {
        import('./iceUpgrade.js').then(module => {
            if (module.resetUpgradeVisuals) module.resetUpgradeVisuals();
        }).catch(e => console.log(e));
    } else if (gameName === 'escape') {
        import('./escape.js').then(module => {
            if (module.resetEscapeVisuals) module.resetEscapeVisuals();
        }).catch(e => console.log(e));
    } else if (gameName === 'mines') {
        import('./mines.js').then(module => {
            if (module.initGrid) module.initGrid();
        }).catch(e => console.log(e));
    }
};

window.shareRefLink = function() {
    let text = encodeURIComponent("Присоединяйся к Arcade Hub, играй в мини-игры и зарабатывай GRAM!");
    let shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${text}`;
    if (tg && tg.openTelegramLink) {
        tg.openTelegramLink(shareUrl);
    } else {
        navigator.clipboard.writeText(refLink);
        showToast("Ссылка скопирована в буфер обмена!", true);
    }
};

window.claimRefRewards = function() {
    if (refEarned <= 0) {
        showToast("У вас пока нет доступных наград от рефералов!", false);
        return;
    }
    addScore(refEarned);
    refEarned = 0.0;
    document.getElementById('refEarned').innerText = "0.00";
    showToast("Награды успешно зачислены!", true);
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
};

window.claimCashback = function() {
    if (cashbackAmount <= 0) {
        showToast("У вас нет доступного кешбека!", false);
        return;
    }
    addScore(cashbackAmount);
    cashbackAmount = 0.0;
    showToast("Кешбек успешно получен!", true);
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
};

let soundEnabled = true;
window.toggleSound = function(checkbox) { soundEnabled = checkbox.checked; };