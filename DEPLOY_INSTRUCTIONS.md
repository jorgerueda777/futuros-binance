# 🚀 INSTRUCCIONES PARA DEPLOY EN LA NUBE

## 📋 Variables de Entorno Necesarias

Cuando subas el bot a Railway, necesitarás configurar estas variables:

```
TELEGRAM_BOT_TOKEN=tu_bot_token_aqui
TELEGRAM_CHAT_ID_F77=tu_chat_id_aqui
SOURCE_CHANNEL_ID=-1001959577386
TELEGRAM_API_ID=tu_api_id_aqui
TELEGRAM_API_HASH=tu_api_hash_aqui
TELEGRAM_SESSION_STRING=tu_session_string_aqui
BINANCE_API_KEY=tu_binance_api_key_aqui
BINANCE_SECRET_KEY=tu_binance_secret_key_aqui
MIN_CONFIDENCE_LEVEL=75
MAX_SIGNALS_PER_HOUR=999
```

## 🔧 Pasos en Railway:

1. **Crear proyecto** en railway.app
2. **Conectar GitHub** repo
3. **Agregar variables** de entorno
4. **Deploy automático**

## ✅ El bot se ejecutará 24/7 gratis con $5 de créditos mensuales

## 📱 Para verificar que funciona:
- Revisa los logs en Railway dashboard
- Envía una señal de prueba
- Verifica que responda en Telegram
