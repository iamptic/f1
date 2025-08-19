import os
from telegram import (
    Update, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
)
from telegram.ext import (
    Application, CommandHandler, ContextTypes
)

BOT_TOKEN = os.getenv("BOT_TOKEN")  # обязательно в Railway Variables
WEBAPP_BUYER_URL = os.getenv("WEBAPP_BUYER_URL", "https://foodyweb-production.up.railway.app/web/buyer/")
WEBAPP_MERCHANT_URL = os.getenv("WEBAPP_MERCHANT_URL", "https://foodyweb-production.up.railway.app/web/merchant/")

INTRO = (
    "Выберите раздел Mini App:\n"
    "• 🛍️ Витрина — смотреть офферы\n"
    "• 👨‍🍳 ЛК ресторана — создавать и управлять офферами"
)

def kb_two_tabs() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("🛍️ Витрина", web_app=WebAppInfo(url=WEBAPP_BUYER_URL))],
            [InlineKeyboardButton("👨‍🍳 ЛК ресторана", web_app=WebAppInfo(url=WEBAPP_MERCHANT_URL))],
        ]
    )

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    # /start [buyer|merchant] — необязательный быстр. переход
    arg = (context.args[0].lower() if context.args else "")
    if arg == "buyer":
        await update.message.reply_text("Открыть витрину:", reply_markup=kb_two_tabs())
        return
    if arg == "merchant":
        await update.message.reply_text("Открыть ЛК ресторана:", reply_markup=kb_two_tabs())
        return
    await update.message.reply_text(INTRO, reply_markup=kb_two_tabs())

async def app_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(INTRO, reply_markup=kb_two_tabs())

def main() -> None:
    if not BOT_TOKEN:
        raise SystemExit("BOT_TOKEN is not set")
    application = Application.builder().token(BOT_TOKEN).build()

    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("app", app_cmd))

    # Простой и надёжный вариант — polling (не требует вебхуков)
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()
