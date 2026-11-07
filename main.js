// js/main.js
import * as core from './core.js';
import * as iceUpgrade from './iceUpgrade.js';
import * as iceArena from './iceArena.js';
import * as escape from './escape.js';
import * as mines from './mines.js';
import * as tonConnect from './tonConnect.js';

console.log("Arcade Hub модули успешно загружены!");

// ==========================================
// НАВИГАЦИЯ И ПЕРЕКЛЮЧЕНИЕ ЭКРАНОВ
// ==========================================

// Переключение между играми (вызывается из карточек в главном меню)
window.openGame = function(gameName) {
    // Скрываем все активные экраны
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    // Находим и показываем целевой экран игры
    const targetScreen = document.getElementById(`screen-${gameName}`);
    if (targetScreen) {
        targetScreen.classList.add('active');
    } else {
        console.error(`Экран "screen-${gameName}" не найден в разметке!`);
        return;
    }

    // Если открыли Ice Upgrade — запускаем перерисовку и сброс канваса
    if (gameName === 'iceUpgrade' && typeof window.resetUpgradeVisuals === 'function') {
        window.resetUpgradeVisuals();
    }
};

// Возврат в меню или переход на экраны через кнопки "Назад"
window.openScreen = function(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    const target = document.getElementById(`screen-${screenName}`);
    if (target) {
        target.classList.add('active');
    }
};

// Переключение вкладок нижней навигационной панели
window.switchNav = function(tabName, btnElement) {
    // 1. Переключаем экран
    window.openScreen(tabName);

    // 2. Обновляем визуальное состояние кнопок навигации
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    if (btnElement) {
        btnElement.classList.add('active');
    }
};

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