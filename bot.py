import os
import hmac
import hashlib
import json
import logging
from urllib.parse import parse_qsl
import aiosqlite
from aiohttp import web
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types import MenuButtonWebApp, WebAppInfo

# 1. БЕЗОПАСНОСТЬ: Токен берем из переменных окружения
# Для локального запуска задай его в консоли: export BOT_TOKEN="твой_токен"
TOKEN = os.getenv("BOT_TOKEN", "9015659427:AAEHv6oruPJswEq_q4_F0999F_ixYtIz538")
GAME_URL = "https://ka3a3-sketch.github.io/arcade-hub/"
WEB_SERVER_HOST = "127.0.0.1"
WEB_SERVER_PORT = 8081  # ИЗМЕНЕНО: используем порт 8081, так как 8000 занят

logging.basicConfig(level=logging.INFO)

bot = Bot(token=TOKEN)
dp = Dispatcher()

# --- БАЗА ДАННЫХ (Персистентная) ---
async def init_db():
    async with aiosqlite.connect("database.db") as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                balance REAL DEFAULT 0.0,
                demo_balance REAL DEFAULT 1000.0,
                referrer_id INTEGER
            )
        """)
        await db.commit()

async def get_user(user_id):
    async with aiosqlite.connect("database.db") as db:
        # Безопасная вставка: если юзер уже есть, ошибка не выскочит
        await db.execute("INSERT OR IGNORE INTO users (user_id) VALUES (?)", (user_id,))
        await db.commit()
        
        # После этого гарантированно можем получить его данные
        async with db.execute("SELECT balance, demo_balance FROM users WHERE user_id = ?", (user_id,)) as cursor:
            row = await cursor.fetchone()
            return {"balance": row[0], "demo_balance": row[1]}

async def update_balance(user_id, amount, is_demo=False):
    column = "demo_balance" if is_demo else "balance"
    async with aiosqlite.connect("database.db") as db:
        await db.execute(f"UPDATE users SET {column} = {column} + ? WHERE user_id = ?", (amount, user_id))
        await db.commit()

# --- ВАЛИДАЦИЯ TELEGRAM INIT DATA ---
def validate_telegram_data(init_data: str) -> dict:
    """Проверяет криптографическую подпись данных от WebApp"""
    try:
        parsed_data = dict(parse_qsl(init_data))
        if "hash" not in parsed_data:
            return None
            
        hash_received = parsed_data.pop("hash")
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed_data.items()))
        
        secret_key = hmac.new(b"WebAppData", TOKEN.encode(), hashlib.sha256).digest()
        hash_calculated = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        
        if hash_calculated == hash_received:
            return json.loads(parsed_data.get("user", "{}"))
        return None
    except Exception as e:
        logging.error(f"Validation error: {e}")
        return None

# --- API ДЛЯ WEB APP (AIOHTTP) ---
async def api_get_balance(request):
    """Эндпоинт для получения баланса. Требует initData в заголовке."""
    init_data = request.headers.get("Authorization", "")
    user_data = validate_telegram_data(init_data)
    
    if not user_data:
        return web.json_response({"error": "Unauthorized"}, status=401)
        
    user_id = user_data.get("id")
    db_user = await get_user(user_id)
    return web.json_response(db_user)

# --- ХЭНДЛЕРЫ БОТА ---
@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    user_id = message.from_user.id
    args = message.text.split()
    
    await get_user(user_id) # Инициализируем юзера в БД

    if len(args) > 1 and args[1].startswith("ref_"):
        referrer_id = args[1].replace("ref_", "")
        if str(referrer_id) != str(user_id):
            async with aiosqlite.connect("database.db") as db:
                await db.execute("UPDATE users SET referrer_id = ? WHERE user_id = ? AND referrer_id IS NULL", (referrer_id, user_id))
                await db.commit()

    builder = InlineKeyboardBuilder()
    builder.button(text="Играть в Arcade Hub", web_app=WebAppInfo(url=GAME_URL))
    builder.button(text="Пополнить баланс", callback_data="deposit_ton")
    builder.button(text="Вывести средства", callback_data="withdraw_ton")
    builder.adjust(1)
    
    await message.answer(
        "Привет! Добро пожаловать в Arcade Hub.\nИгры на баланс GRAM.",
        reply_markup=builder.as_markup()
    )

@dp.callback_query(lambda c: c.data in ["deposit_ton", "withdraw_ton"])
async def process_payments(callback: types.CallbackQuery):
    if callback.data == "deposit_ton":
        text = "Переведите TON/GRAM на системный кошелек:\n`UQC...`\nПосле перевода баланс обновится автоматически."
    else:
        text = "Вывод средств\nМинимум для вывода: 100 GRAM.\nОтправьте адрес кошелька:"
    await callback.message.answer(text, parse_mode="Markdown")
    await callback.answer()

# --- ЗАПУСК БОТА И ВЕБ-СЕРВЕРА ВМЕСТЕ ---
async def main():
    await init_db()
    
    # Настройка API сервера
    app = web.Application()
    app.router.add_get('/api/balance', api_get_balance)
    
    # Настройка CORS для локальной разработки (позволяет WebApp делать запросы)
    import aiohttp_cors
    cors = aiohttp_cors.setup(app, defaults={
        "*": aiohttp_cors.ResourceOptions(
            allow_credentials=True,
            expose_headers="*",
            allow_headers="*",
        )
    })
    for route in list(app.router.routes()):
        cors.add(route)
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, WEB_SERVER_HOST, WEB_SERVER_PORT)
    await site.start()
    
    logging.info(f"API Server started at http://{WEB_SERVER_HOST}:{WEB_SERVER_PORT}")
    
    await bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(text="Меню", web_app=WebAppInfo(url=GAME_URL))
    )
    logging.info("Telegram Bot started!")
    await dp.start_polling(bot)

if __name__ == "__main__":
    import asyncio
    try:
        import aiohttp_cors
    except ImportError:
        import sys
        print("Пожалуйста, установите aiohttp_cors: pip install aiohttp-cors")
        sys.exit(1)
    asyncio.run(main())