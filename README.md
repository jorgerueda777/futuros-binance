# 🤖 DEF BINANCE PROFESSIONAL BOT

Bot profesional de análisis técnico que monitorea señales de Telegram y genera predicciones SHORT/LONG con análisis técnico avanzado.

## 🚀 Características

- **Monitoreo automático** del canal AlertasCriptoFuturos
- **OCR avanzado** para extraer tokens de imágenes
- **Análisis técnico profesional** con 15+ indicadores
- **Soportes y resistencias** automáticos
- **Predicciones SHORT/LONG** con confianza
- **Envío automático** de señales a Telegram

## 📊 Indicadores Técnicos

- RSI (Relative Strength Index)
- MACD (Moving Average Convergence Divergence)
- Bollinger Bands
- EMAs (9, 21, 50)
- SMAs (20, 50)
- Stochastic
- Volume Analysis
- Price Action Patterns

## 🛠️ Instalación

1. **Clonar y configurar:**
```bash
cd D:\botdefbinance
npm install
```

2. **Configurar variables de entorno:**
Editar `config.env`:
```env
TELEGRAM_BOT_TOKEN=tu_bot_token
TELEGRAM_CHAT_ID_F77=tu_chat_id
SOURCE_CHANNEL_ID=id_del_canal_fuente
BINANCE_API_KEY=tu_api_key
BINANCE_SECRET_KEY=tu_secret_key
```

3. **Ejecutar:**
```bash
npm start
```

## 📱 Comandos del Bot

- `/start` - Inicializar bot
- `/status` - Estado actual
- `/analyze SYMBOL` - Análisis manual

## 🎯 Configuración de Señales

- **Confianza mínima:** 75%
- **Máximo señales/hora:** 5
- **Timeframes:** 1m, 5m, 15m, 1h, 4h
- **Risk/Reward mínimo:** 1:2

## 📈 Ejemplo de Señal

```
🤖 DEF BINANCE PROFESSIONAL
🟢 LONG BTCUSDT

📊 ANÁLISIS TÉCNICO:
• Confianza: 85% 🔥🔥
• Precio Actual: $67,250
• Timeframe: 15m

🎯 SOPORTES Y RESISTENCIAS:
• Soporte: $66,800
• Resistencia: $67,800
• Zona Crítica: $67,000

📈 INDICADORES:
• RSI: 45 (Neutral ⚖️)
• MACD: BULLISH 
• Bollinger: Mitad superior (Alcista)
• Volume: Alto (Buena confirmación)

⚡ ACCIÓN DEL PRECIO:
Tendencia alcista con momentum bullish

🎲 ESTRATEGIA:
• Entry: $67,180
• Stop Loss: $66,650
• Take Profit: $68,240
• Risk/Reward: 1:2.1
```

## 🔧 Estructura del Proyecto

```
D:\botdefbinance\
├── main.js                 # Archivo principal
├── package.json           # Dependencias
├── config.env            # Configuración
├── README.md             # Documentación
├── src/
│   ├── TechnicalAnalyzer.js    # Análisis técnico
│   ├── ImageProcessor.js       # Procesamiento OCR
│   ├── BinanceAPI.js          # API de Binance
│   ├── SignalGenerator.js     # Generador de señales
│   └── Logger.js              # Sistema de logs
├── data/
│   ├── images/           # Imágenes procesadas
│   ├── analysis/         # Análisis guardados
│   └── signals/          # Señales generadas
└── logs/                 # Archivos de log
```

## ⚠️ Importante

- **Verificar señales** antes de operar
- **Gestión de riesgo** siempre activa
- **No es asesoría financiera**
- **Usar en cuenta demo** primero

## 🔥 Próximas Características

- [ ] Machine Learning para patrones
- [ ] Análisis de sentimiento
- [ ] Backtesting automático
- [ ] Dashboard web
- [ ] Alertas por WhatsApp

---

**Desarrollado por DefBinance Professional Team**
