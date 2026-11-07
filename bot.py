import logging
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types import MenuButtonWebApp, WebAppInfo

TOKEN = "9015659427:AAEHv6oruPJswEq_q4_F0999F_ixYtIz538"

logging.basicConfig(level=logging.INFO)

bot = Bot(token=TOKEN)
dp = Dispatcher()

# База данных пользователей в памяти: { user_id: { "balance": 0.0, "score": 0.0, ... } }
users_db = {} 

GAME_URL = "https://ka3a3-sketch.github.io/arcade-hub/"

@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    user_id = message.from_user.id
    args = message.text.split()
    
    # Инициализация пользователя с балансом 0.0 GRAM
    if user_id not in users_db:
        users_db[user_id] = {"balance": 0.0, "referrer": None}

    # Проверка реферального кода
    if len(args) > 1 and args[1].startswith("ref_"):
        referrer_id = args[1].replace("ref_", "")
        if str(referrer_id) != str(user_id) and users_db[user_id]["referrer"] is None:
            users_db[user_id]["referrer"] = referrer_id
            print(f"Игрок {user_id} приглашен пользователем {referrer_id}")

    builder = InlineKeyboardBuilder()
    builder.button(text="Играть в Arcade Hub", web_app=WebAppInfo(url=GAME_URL))
    builder.button(text="Пополнить баланс", callback_data="deposit_ton")
    builder.button(text="Вывести средства", callback_data="withdraw_ton")
    builder.adjust(1)
    
    await message.answer(
        "Привет! Добро пожаловать в Arcade Hub.\n"
        "Игры на баланс GRAM. Зарабатывай, играй и выводи на свой кошелек.",
        reply_markup=builder.as_markup()
    )

@dp.callback_query(lambda c: c.data == "deposit_ton")
async def process_deposit(callback: types.CallbackQuery):
    await callback.message.answer(
        "Пополнение баланса GRAM\n\n"
        "Переведите TON/GRAM на системный кошелек:\n"
        "`UQC...ваш_кошелек...`\n\n"
        "После перевода баланс обновится автоматически.",
        parse_mode="Markdown"
    )
    await callback.answer()

@dp.callback_query(lambda c: c.data == "withdraw_ton")
async def process_withdraw(callback: types.CallbackQuery):
    await callback.message.answer(
        "Вывод средств\n\n"
        "Минимум для вывода: 100 GRAM.\n"
        "Отправьте адрес вашего TON кошелька в чат:",
        parse_mode="Markdown"
    )
    await callback.answer()

@dp.message(Command("id"))
async def get_my_id(message: types.Message):
    await message.answer(f"Твой Telegram ID: `{message.from_user.id}`", parse_mode="Markdown")

# Хэндлер для приема данных от WebApp (синхронизация баланса)
@dp.message(lambda message: message.web_app_data is not None)
async def handle_web_app_data(message: types.Message):
    import json
    user_id = message.from_user.id
    try:
        data = json.loads(message.web_app_data.data)
        action = data.get("action")
        
        if user_id not in users_db:
            users_db[user_id] = {"balance": 0.0}
            
        if action == "get_balance":
            await message.answer(str(users_db[user_id]["balance"]))
        elif action == "update_balance":
            new_balance = float(data.get("balance", 0.0))
            users_db[user_id]["balance"] = new_balance
            await message.answer("OK")
    except Exception as e:
        print(f"Ошибка обработки WebAppData: {e}")

async def main():
    await bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(
            text="Меню", 
            web_app=WebAppInfo(url=GAME_URL)
        )
    )
    print("Бот запущен и готов к работе!")
    await dp.start_polling(bot)

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())