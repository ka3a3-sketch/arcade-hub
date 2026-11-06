import { tg, updateBalance, score, showToast, userId } from './core.js';

const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: 'https://ka3a3-sketch.github.io/arcade-hub/tonconnect-manifest.json',
    buttonRootId: 'ton-connect-button'
});

window.openDepositModal = function() {
    let modal = document.getElementById('depositModal');
    if (modal) modal.style.display = 'flex';
};

window.closeDepositModal = function() {
    let modal = document.getElementById('depositModal');
    if (modal) modal.style.display = 'none';
};

window.selectDepositTon = function(val) {
    let input = document.getElementById('customTonInput');
    if (input) input.value = val.toFixed(1);
};

window.sendTonDeposit = async function() {
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
        window.closeDepositModal();
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('warning');
        
        await tonConnectUI.sendTransaction(transaction);
        updateBalance(score + gramAmount);

        showToast(`Оплата прошла! Зачислено +${gramAmount.toFixed(2)} GRAM.`, true);
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');

    } catch (e) {
        showToast('Оплата отменена или произошла ошибка.', false);
    }
};