// js/main.js
import * as core from './core.js';
import * as iceUpgrade from './iceUpgrade.js';
import * as iceArena from './iceArena.js';
import * as escape from './escape.js';
import * as mines from './mines.js';
import * as tonConnect from './tonConnect.js';

console.log("Arcade Hub модули успешно загружены!");

// ==========================================
// УПРАВЛЕНИЕ МОДАЛЬНЫМИ ОКНАМИ
// ==========================================

window.openDepositModal = function() {
    const modal = document.getElementById('depositModal');
    if (modal) modal.style.display = 'flex';
};

window.closeDepositModal = function() {
    const modal = document.getElementById('depositModal');
    if (modal) modal.style.display = 'none';
};