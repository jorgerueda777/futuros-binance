const axios = require('axios');
const crypto = require('crypto');

class ScalpingAI {
    constructor(groqApiKey, logger, binanceApiKey, binanceSecretKey, autoTrader, telegramBot) {
        this.groqApiKey = groqApiKey;
        this.logger = logger;
        this.autoTrader = autoTrader;
        this.telegramBot = telegramBot;
        this.baseURL = 'https://api.groq.com/openai/v1';
        
        // BINANCE API PARA DATOS EN TIEMPO REAL
        this.binanceApiKey = binanceApiKey;
        this.binanceSecretKey = binanceSecretKey;
        this.binanceBaseURL = 'https://fapi.binance.com';
        
        // CONFIGURACIÓN SCALPING AGRESIVA
        this.config = {
            ENABLED: true,
            ANALYSIS_INTERVAL: 60000,        // 1 minuto
            MIN_CONFIDENCE: 80,              // 80% mínimo para scalping
            MAX_TRADES_PER_HOUR: 50,         // Muy agresivo
            SYMBOLS: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 'XRPUSDT', 'DOGEUSDT'],
            
            // PARÁMETROS SCALPING (VALORES FIJOS)
            SCALP_SL_USD: 0.18,              // $0.18 pérdida máxima (18%)
            SCALP_TP_USD: 0.44,              // $0.44 ganancia objetivo (44%)
            POSITION_SIZE_USD: 1.00,         // $1.00 por scalp
            LEVERAGE: 15,                    // 15x para scalping (REVERTIDO)
            
            // TIMEFRAMES PARA ANÁLISIS
            TIMEFRAMES: ['1m', '5m', '15m'],
            
            // FILTROS DE CALIDAD
            MIN_VOLUME_24H: 100000000,       // $100M volumen mínimo
            MAX_SPREAD_PERCENT: 0.1,         // 0.1% spread máximo
        };
        
        this.isRunning = false;
        this.analysisCount = 0;
        this.lastAnalysisHour = new Date().getHours();
        this.activeSymbols = new Set();
        
        // CANAL FUENTE (MISMO QUE EL BOT PRINCIPAL)
        this.sourceChannels = [
            '@AlertasCriptoFuturos',
            '@AlertasCriptoFuturos2'
        ];
    }

    // INICIAR ESCUCHA DE CANAL (MISMO QUE SMARTMONEY)
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.logger.info('🚀 IA SCALPING INICIADA - Escuchando mismo canal que SmartMoney');
        this.logger.info('👂 Esperando señales del canal para análisis IA...');
        
        // Ya no hace análisis continuo automático
        // Ahora solo responde a señales del canal
    }

    // 📡 ANALIZAR SEÑAL DEL CANAL (LLAMADO DESDE MAIN.JS)
    async analyzeChannelSignal(symbol, signalText, marketData) {
        try {
            if (!this.isRunning || !this.config.ENABLED) {
                return null;
            }

            // Reset contador por hora
            const currentHour = new Date().getHours();
            if (currentHour !== this.lastAnalysisHour) {
                this.analysisCount = 0;
                this.lastAnalysisHour = currentHour;
            }
            
            // Límite por hora
            if (this.analysisCount >= this.config.MAX_TRADES_PER_HOUR) {
                this.logger.info(`⏳ IA Scalping: Límite de trades/hora alcanzado: ${this.analysisCount}/${this.config.MAX_TRADES_PER_HOUR}`);
                return null;
            }

            this.logger.info(`🧠 IA SCALPING analizando señal: ${symbol}`);
            this.logger.info(`📝 Señal original: ${signalText.substring(0, 100)}...`);
            
            // Obtener datos técnicos para análisis IA
            const technicalData = await this.getTechnicalData(symbol);
            if (!technicalData) {
                this.logger.warn(`❌ No se pudieron obtener datos técnicos para ${symbol}`);
                return null;
            }
            
            // Análisis IA de la señal del canal
            const aiDecision = await this.analyzeSignalWithAI(symbol, signalText, marketData, technicalData);
            
            if (aiDecision && aiDecision.decision !== 'NO_TRADE' && aiDecision.confidence >= this.config.MIN_CONFIDENCE) {
                this.logger.info(`✅ IA SCALPING aprueba señal: ${symbol} ${aiDecision.decision} - ${aiDecision.confidence}%`);
                
                // 📤 ENVIAR SEÑAL IA AL CANAL F77
                await this.sendAISignalToF77(symbol, aiDecision, signalText);
                
                return aiDecision;
            } else if (aiDecision) {
                this.logger.info(`❌ IA SCALPING rechaza señal: ${symbol} - Confianza: ${aiDecision.confidence}% < ${this.config.MIN_CONFIDENCE}%`);
                return null;
            } else {
                // FALLBACK: Si IA falla completamente, crear decisión básica
                this.logger.warn(`⚠️ IA SCALPING falló completamente para ${symbol} - Usando análisis básico`);
                
                const basicDecision = this.createBasicDecision(symbol, signalText, marketData, technicalData);
                if (basicDecision) {
                    this.logger.info(`🔄 Análisis básico: ${symbol} ${basicDecision.decision} - ${basicDecision.confidence}%`);
                    return basicDecision;
                }
                
                return null;
            }
            
        } catch (error) {
            this.logger.error(`❌ Error en análisis IA Scalping ${symbol}:`, error.message);
            return null;
        }
    }

    // DETENER IA SCALPING
    stop() {
        this.isRunning = false;
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
        }
        this.logger.info('🛑 IA SCALPING DETENIDA');
    }

    // ANÁLISIS SCALPING PRINCIPAL
    async runScalpingAnalysis() {
        if (!this.isRunning || !this.config.ENABLED) return;
        
        try {
            // Reset contador por hora
            const currentHour = new Date().getHours();
            if (currentHour !== this.lastAnalysisHour) {
                this.analysisCount = 0;
                this.lastAnalysisHour = currentHour;
            }
            
            // Límite por hora
            if (this.analysisCount >= this.config.MAX_TRADES_PER_HOUR) {
                this.logger.info(`⏳ Límite de trades/hora alcanzado: ${this.analysisCount}/${this.config.MAX_TRADES_PER_HOUR}`);
                return;
            }
            
            this.logger.info('🔍 INICIANDO análisis scalping 1min...');
            
            // Analizar cada símbolo
            for (const symbol of this.config.SYMBOLS) {
                try {
                    await this.analyzeSymbolForScalping(symbol);
                    await new Promise(resolve => setTimeout(resolve, 2000)); // 2s entre símbolos
                } catch (error) {
                    this.logger.error(`❌ Error analizando ${symbol}:`, error.message);
                }
            }
            
        } catch (error) {
            this.logger.error('❌ Error en análisis scalping:', error.message);
        }
    }

    // ANALIZAR SÍMBOLO ESPECÍFICO PARA SCALPING
    async analyzeSymbolForScalping(symbol) {
        try {
            this.logger.info(`📊 Analizando ${symbol} para scalping...`);
            
            // 1. Obtener datos de mercado en tiempo real
            const marketData = await this.getRealtimeMarketData(symbol);
            if (!marketData) return;
            
            // 2. Filtros de calidad
            if (!this.passesQualityFilters(marketData)) {
                return;
            }
            
            // 3. Obtener datos técnicos multi-timeframe
            const technicalData = await this.getTechnicalData(symbol);
            if (!technicalData) return;
            
            // 4. Análisis IA para scalping
            const scalpingDecision = await this.analyzeWithAI(symbol, marketData, technicalData);
            if (!scalpingDecision || scalpingDecision.decision === 'NO_TRADE') {
                return;
            }
            
            // 5. Ejecutar scalp si pasa todos los filtros
            if (scalpingDecision.confidence >= this.config.MIN_CONFIDENCE) {
                await this.executeScalpTrade(symbol, scalpingDecision, marketData);
            }
            
        } catch (error) {
            this.logger.error(`❌ Error analizando ${symbol} para scalping:`, error.message);
        }
    }

    // OBTENER DATOS DE MERCADO EN TIEMPO REAL
    async getRealtimeMarketData(symbol) {
        try {
            const [ticker, bookTicker] = await Promise.all([
                this.binanceRequest('/fapi/v1/ticker/24hr', { symbol }),
                this.binanceRequest('/fapi/v1/ticker/bookTicker', { symbol })
            ]);
            
            return {
                symbol,
                price: parseFloat(ticker.lastPrice),
                volume24h: parseFloat(ticker.volume),
                priceChange24h: parseFloat(ticker.priceChangePercent),
                bidPrice: parseFloat(bookTicker.bidPrice),
                askPrice: parseFloat(bookTicker.askPrice),
                spread: ((parseFloat(bookTicker.askPrice) - parseFloat(bookTicker.bidPrice)) / parseFloat(bookTicker.bidPrice)) * 100
            };
        } catch (error) {
            this.logger.error(`❌ Error obteniendo datos de ${symbol}:`, error.message);
            return null;
        }
    }

    // FILTROS DE CALIDAD PARA SCALPING
    passesQualityFilters(marketData) {
        // Volumen mínimo
        if (marketData.volume24h < this.config.MIN_VOLUME_24H) {
            return false;
        }
        
        // Spread máximo
        if (marketData.spread > this.config.MAX_SPREAD_PERCENT) {
            return false;
        }
        
        return true;
    }

    // OBTENER DATOS TÉCNICOS MULTI-TIMEFRAME
    async getTechnicalData(symbol) {
        try {
            const technicalData = {};
            
            // Obtener klines para cada timeframe
            for (const timeframe of this.config.TIMEFRAMES) {
                const klines = await this.binanceRequest('/fapi/v1/klines', {
                    symbol,
                    interval: timeframe,
                    limit: 100
                });
                
                if (klines && klines.length > 0) {
                    technicalData[timeframe] = this.calculateIndicators(klines);
                }
            }
            
            // Datos adicionales
            const [openInterest, fundingRate] = await Promise.all([
                this.binanceRequest('/fapi/v1/openInterest', { symbol }).catch(() => null),
                this.binanceRequest('/fapi/v1/fundingRate', { symbol, limit: 1 }).catch(() => null)
            ]);
            
            technicalData.openInterest = openInterest?.openInterest || 0;
            technicalData.fundingRate = fundingRate?.[0]?.fundingRate || 0;
            
            return technicalData;
        } catch (error) {
            this.logger.error(`❌ Error obteniendo datos técnicos de ${symbol}:`, error.message);
            return null;
        }
    }

    // CALCULAR INDICADORES TÉCNICOS
    calculateIndicators(klines) {
        const closes = klines.map(k => parseFloat(k[4]));
        const highs = klines.map(k => parseFloat(k[2]));
        const lows = klines.map(k => parseFloat(k[3]));
        const volumes = klines.map(k => parseFloat(k[5]));
        
        return {
            currentPrice: closes[closes.length - 1],
            rsi: this.calculateRSI(closes, 14),
            ema9: this.calculateEMA(closes, 9),
            ema21: this.calculateEMA(closes, 21),
            ema50: this.calculateEMA(closes, 50),
            macd: this.calculateMACD(closes),
            bollinger: this.calculateBollinger(closes, 20),
            volumeAvg: volumes.slice(-20).reduce((a, b) => a + b) / 20,
            currentVolume: volumes[volumes.length - 1],
            priceChange: ((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 100
        };
    }

    // ANÁLISIS IA PARA SEÑALES DEL CANAL
    async analyzeSignalWithAI(symbol, signalText, marketData, technicalData) {
        try {
            // Validar API Key
            if (!this.groqApiKey || this.groqApiKey === 'undefined') {
                this.logger.error('❌ GROQ_API_KEY no configurada correctamente');
                return null;
            }

            const prompt = this.buildChannelSignalPrompt(symbol, signalText, marketData, technicalData);
            
            // Limitar tamaño del prompt
            const limitedPrompt = prompt.length > 3000 ? prompt.substring(0, 3000) + '...' : prompt;
            
            this.logger.info(`🧠 Enviando request a Groq API para ${symbol}...`);
            
            const response = await axios.post(`${this.baseURL}/chat/completions`, {
                model: 'llama-3.1-8b-instant',
                messages: [
                    {
                        role: 'system',
                        content: 'Eres un experto en análisis de señales de trading. Analiza la señal del canal junto con datos técnicos y decide si ejecutar o no.'
                    },
                    {
                        role: 'user',
                        content: limitedPrompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 500
            }, {
                headers: {
                    'Authorization': `Bearer ${this.groqApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000 // 10 segundos timeout
            });
            
            this.logger.info(`✅ Respuesta recibida de Groq API para ${symbol}`);
            
            const aiResponse = response.data.choices[0].message.content;
            return this.parseAIResponse(aiResponse);
            
        } catch (error) {
            this.logger.error(`❌ Error en análisis IA para señal ${symbol}:`, error.message);
            
            // Log detallado del error
            if (error.response) {
                this.logger.error(`📊 Status: ${error.response.status}`);
                this.logger.error(`📊 Data:`, error.response.data);
            } else if (error.request) {
                this.logger.error(`📊 No response received`);
            } else {
                this.logger.error(`📊 Request setup error:`, error.message);
            }
            
            return null;
        }
    }

    // ANÁLISIS IA PARA SCALPING AUTÓNOMO (YA NO SE USA)
    async analyzeWithAI_OLD(symbol, marketData, technicalData) {
        try {
            const prompt = this.buildScalpingPrompt(symbol, marketData, technicalData);
            
            const response = await axios.post(`${this.baseURL}/chat/completions`, {
                model: 'llama-3.1-8b-instant',
                messages: [
                    {
                        role: 'system',
                        content: 'Eres un experto en scalping de criptomonedas. Analiza datos técnicos y decide si hay oportunidad de scalping A FAVOR o CONTRA la tendencia.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 500
            }, {
                headers: {
                    'Authorization': `Bearer ${this.groqApiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const aiResponse = response.data.choices[0].message.content;
            return this.parseAIResponse(aiResponse);
            
        } catch (error) {
            this.logger.error(`❌ Error en análisis IA para ${symbol}:`, error.message);
            return null;
        }
    }

    // CONSTRUIR PROMPT PARA SEÑALES DEL CANAL (SIMPLIFICADO)
    buildChannelSignalPrompt(symbol, signalText, marketData, technicalData) {
        // Limpiar signalText de caracteres problemáticos
        const cleanSignal = signalText.replace(/[^\w\s\-\.\$\%\#\@]/g, ' ').substring(0, 200);
        
        return `ERES UN TRADER PROFESIONAL AGRESIVO. Analiza esta señal:

SÍMBOLO: ${symbol}
SEÑAL DEL CANAL: "${cleanSignal}"
PRECIO ACTUAL: $${marketData.price}
CAMBIO 24H: ${marketData.priceChange24h || 0}%

ANÁLISIS TÉCNICO:
RSI 1min: ${technicalData['1m']?.rsi?.toFixed(2) || 'N/A'}
EMA9 1min: ${technicalData['1m']?.ema9?.toFixed(6) || 'N/A'}
EMA21 1min: ${technicalData['1m']?.ema21?.toFixed(6) || 'N/A'}
RSI 5min: ${technicalData['5m']?.rsi?.toFixed(2) || 'N/A'}

CONTEXTO SCALPING:
- Operación rápida: $1.00 USD con 15x leverage
- Riesgo controlado: -$0.18 máximo | +$0.44 objetivo
- Solo necesitas 60%+ confianza para ejecutar

INSTRUCCIONES AGRESIVAS:
✅ SÉ AGRESIVO: Las señales del canal son PRE-FILTRADAS
✅ CONFÍA EN LA SEÑAL: Si el canal dice LONG/SHORT, hay razón
✅ RSI 30-70 es PERFECTO para scalping (no sobrecomprado/vendido)
✅ Si EMA9 > precio = tendencia alcista, EMA9 < precio = bajista
✅ Cambio 24h positivo + LONG = muy buena señal
✅ Cambio 24h negativo + SHORT = muy buena señal

Responde SOLO en JSON:
{
  "decision": "BUY" | "SELL" | "NO_TRADE",
  "confidence": 0-100,
  "reasoning": "Breve explicación",
  "signal_validation": "CONFIRM" | "REJECT" | "CONTRADICT",
  "technical_reason": "Razón técnica"
}`;
    }

    // CONSTRUIR PROMPT PARA SCALPING AUTÓNOMO (YA NO SE USA)
    buildScalpingPrompt_OLD(symbol, marketData, technicalData) {
        return `
ANÁLISIS SCALPING ${symbol}:

📊 DATOS DE MERCADO:
- Precio: $${marketData.price}
- Cambio 24h: ${marketData.priceChange24h}%
- Volumen 24h: $${(marketData.volume24h / 1000000).toFixed(2)}M
- Spread: ${marketData.spread.toFixed(4)}%

📈 ANÁLISIS TÉCNICO 1MIN:
- RSI: ${technicalData['1m']?.rsi?.toFixed(2)}
- EMA9: $${technicalData['1m']?.ema9?.toFixed(6)}
- EMA21: $${technicalData['1m']?.ema21?.toFixed(6)}
- Precio vs EMA9: ${((marketData.price - technicalData['1m']?.ema9) / technicalData['1m']?.ema9 * 100).toFixed(2)}%
- MACD: ${JSON.stringify(technicalData['1m']?.macd)}
- Bollinger: ${JSON.stringify(technicalData['1m']?.bollinger)}

📊 ANÁLISIS TÉCNICO 5MIN:
- RSI: ${technicalData['5m']?.rsi?.toFixed(2)}
- EMA9: $${technicalData['5m']?.ema9?.toFixed(6)}
- EMA21: $${technicalData['5m']?.ema21?.toFixed(6)}

📈 ANÁLISIS TÉCNICO 15MIN:
- RSI: ${technicalData['15m']?.rsi?.toFixed(2)}
- EMA50: $${technicalData['15m']?.ema50?.toFixed(6)}

🔍 DATOS ADICIONALES:
- Open Interest: ${technicalData.openInterest}
- Funding Rate: ${(parseFloat(technicalData.fundingRate) * 100).toFixed(4)}%

INSTRUCCIONES SCALPING:
1. Detecta oportunidades A FAVOR de tendencia (momentum)
2. Detecta oportunidades CONTRA tendencia (reversiones)
3. Considera RSI sobrecomprado (>70) o sobrevendido (<30)
4. Analiza si precio está por encima/debajo de EMAs
5. Evalúa MACD para momentum
6. Considera Bollinger Bands para volatilidad
7. Mínimo 75% confianza para ejecutar

Responde SOLO en formato JSON:
{
  "decision": "BUY" | "SELL" | "NO_TRADE",
  "confidence": 0-100,
  "reasoning": "Explicación detallada",
  "type": "TREND_FOLLOWING" | "COUNTER_TREND" | "NONE",
  "timeframe": "1m" | "5m" | "15m",
  "entry_reason": "Razón específica de entrada"
}`;
    }

    // PARSEAR RESPUESTA DE IA
    parseAIResponse(aiResponse) {
        try {
            // Extraer JSON de la respuesta
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return null;
            
            return JSON.parse(jsonMatch[0]);
        } catch (error) {
            this.logger.error('❌ Error parseando respuesta IA:', error.message);
            return null;
        }
    }

    // EJECUTAR TRADE DE SCALPING (IA PRINCIPAL - NO VERIFICA CONFLICTOS)
    async executeScalpTrade(symbol, decision, marketData) {
        try {
            this.analysisCount++;
            
            this.logger.info(`🚀 EJECUTANDO SCALP: ${symbol} ${decision.decision} - Confianza: ${decision.confidence}%`);
            this.logger.info(`📊 Tipo: ${decision.type} - Razón: ${decision.entry_reason}`);
            
            // Calcular SL/TP para scalping (VALORES FIJOS EN USD)
            const entryPrice = marketData.price;
            const isLong = decision.decision === 'BUY';
            
            // Obtener filtros de Binance para el símbolo
            const symbolInfo = await this.getSymbolFilters(symbol);
            if (!symbolInfo) {
                this.logger.error(`❌ No se pudieron obtener filtros para ${symbol}`);
                return;
            }
            
            // Calcular cantidad total con leverage
            const totalExposure = this.config.POSITION_SIZE_USD * this.config.LEVERAGE;
            const rawQuantity = totalExposure / entryPrice;
            
            // Aplicar filtros de Binance
            const quantity = this.applyQuantityFilters(rawQuantity, symbolInfo);
            
            // Calcular SL/TP basado en USD fijos
            const slDistance = this.config.SCALP_SL_USD / quantity; // Distancia en precio para perder $0.18
            const tpDistance = this.config.SCALP_TP_USD / quantity; // Distancia en precio para ganar $0.44
            
            this.logger.info(`🔍 DEBUG SL/TP: Quantity=${quantity}, SL_USD=${this.config.SCALP_SL_USD}, TP_USD=${this.config.SCALP_TP_USD}`);
            this.logger.info(`🔍 DEBUG Distancias: slDistance=${slDistance}, tpDistance=${tpDistance}`);
            this.logger.info(`🔍 DEBUG Entry: ${entryPrice}, isLong: ${isLong}`);
            
            const stopLoss = isLong ? 
                entryPrice - slDistance : 
                entryPrice + slDistance;
                
            const takeProfit = isLong ? 
                entryPrice + tpDistance : 
                entryPrice - tpDistance;
                
            this.logger.info(`🔍 DEBUG Calculado: SL=${stopLoss}, TP=${takeProfit}`);
            
            // Configurar trade
            const tradeConfig = {
                symbol: symbol,
                side: isLong ? 'BUY' : 'SELL',
                quantity: quantity,
                price: entryPrice,
                stopLoss: parseFloat(stopLoss.toFixed(8)),
                takeProfit: parseFloat(takeProfit.toFixed(8)),
                leverage: this.config.LEVERAGE,
                targetUSD: this.config.POSITION_SIZE_USD
            };
            
            this.logger.info(`💰 SCALP CONFIG: $${this.config.POSITION_SIZE_USD} USD, ${this.config.LEVERAGE}x leverage`);
            this.logger.info(`💸 RIESGO: -$${this.config.SCALP_SL_USD} | GANANCIA: +$${this.config.SCALP_TP_USD}`);
            this.logger.info(`🛡️ SL: $${stopLoss.toFixed(6)} | TP: $${takeProfit.toFixed(6)}`);
            this.logger.info(`📊 Cantidad: ${quantity} ${symbol.replace('USDT', '')}`);
            this.logger.info(`📈 Entrada: $${entryPrice} | Dirección: ${isLong ? 'LONG' : 'SHORT'}`);
            
            // Ejecutar con AutoTrader
            if (this.autoTrader && this.autoTrader.isEnabled()) {
                this.logger.info(`🚀 Enviando trade a AutoTrader...`);
                await this.autoTrader.executeTrade(tradeConfig);
                this.logger.info(`✅ SCALP EJECUTADO: ${symbol} ${decision.decision} - ${decision.type}`);
            } else {
                this.logger.warn('⚠️ AutoTrader no disponible para scalping');
            }
            
        } catch (error) {
            this.logger.error(`❌ Error ejecutando scalp ${symbol}:`, error.message);
        }
    }

    // 📊 OBTENER FILTROS DE BINANCE PARA SÍMBOLO
    async getSymbolFilters(symbol) {
        try {
            const response = await axios.get(`https://fapi.binance.com/fapi/v1/exchangeInfo`);
            const symbolInfo = response.data.symbols.find(s => s.symbol === symbol);
            
            if (!symbolInfo) {
                this.logger.error(`❌ Símbolo ${symbol} no encontrado en exchangeInfo`);
                return null;
            }
            
            // Extraer filtros importantes
            const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
            const priceFilter = symbolInfo.filters.find(f => f.filterType === 'PRICE_FILTER');
            
            return {
                symbol: symbol,
                quantityPrecision: symbolInfo.quantityPrecision,
                pricePrecision: symbolInfo.pricePrecision,
                minQty: parseFloat(lotSizeFilter?.minQty || '0'),
                maxQty: parseFloat(lotSizeFilter?.maxQty || '999999999'),
                stepSize: parseFloat(lotSizeFilter?.stepSize || '1'),
                minPrice: parseFloat(priceFilter?.minPrice || '0'),
                maxPrice: parseFloat(priceFilter?.maxPrice || '999999999'),
                tickSize: parseFloat(priceFilter?.tickSize || '0.01')
            };
            
        } catch (error) {
            this.logger.error(`❌ Error obteniendo filtros para ${symbol}:`, error.message);
            return null;
        }
    }

    // 🔧 APLICAR FILTROS DE CANTIDAD DE BINANCE
    applyQuantityFilters(rawQuantity, symbolInfo) {
        try {
            // Redondear según stepSize
            const stepSize = symbolInfo.stepSize;
            const precision = symbolInfo.quantityPrecision;
            
            // Calcular cantidad ajustada al stepSize
            const adjustedQuantity = Math.floor(rawQuantity / stepSize) * stepSize;
            
            // Redondear a la precisión correcta
            const finalQuantity = parseFloat(adjustedQuantity.toFixed(precision));
            
            // Verificar límites
            if (finalQuantity < symbolInfo.minQty) {
                this.logger.warn(`⚠️ Cantidad ${finalQuantity} < mínimo ${symbolInfo.minQty}`);
                return symbolInfo.minQty;
            }
            
            if (finalQuantity > symbolInfo.maxQty) {
                this.logger.warn(`⚠️ Cantidad ${finalQuantity} > máximo ${symbolInfo.maxQty}`);
                return symbolInfo.maxQty;
            }
            
            this.logger.info(`🔧 Cantidad ajustada: ${rawQuantity.toFixed(8)} → ${finalQuantity}`);
            return finalQuantity;
            
        } catch (error) {
            this.logger.error(`❌ Error aplicando filtros:`, error.message);
            return parseFloat(rawQuantity.toFixed(6)); // Fallback
        }
    }

    // 🔄 ANÁLISIS BÁSICO DE FALLBACK (SI IA FALLA)
    createBasicDecision(symbol, signalText, marketData, technicalData) {
        try {
            // Análisis técnico básico sin IA
            const rsi1m = technicalData['1m']?.rsi;
            const rsi5m = technicalData['5m']?.rsi;
            const ema9_1m = technicalData['1m']?.ema9;
            const price = marketData.price;
            
            // Detectar dirección de la señal original
            const isLongSignal = signalText.toLowerCase().includes('long') || 
                               signalText.toLowerCase().includes('buy') || 
                               signalText.includes('🟢');
            
            const isShortSignal = signalText.toLowerCase().includes('short') || 
                                signalText.toLowerCase().includes('sell') || 
                                signalText.includes('🔴');
            
            if (!isLongSignal && !isShortSignal) {
                return null; // No se puede determinar dirección
            }
            
            // Análisis técnico básico
            let confidence = 60; // Base
            let decision = 'NO_TRADE';
            let reasoning = 'Análisis técnico básico';
            
            if (rsi1m && ema9_1m) {
                if (isLongSignal) {
                    if (price > ema9_1m && rsi1m < 70) {
                        decision = 'BUY';
                        confidence = 75;
                        reasoning = 'Precio sobre EMA9, RSI no sobrecomprado';
                    }
                } else if (isShortSignal) {
                    if (price < ema9_1m && rsi1m > 30) {
                        decision = 'SELL';
                        confidence = 75;
                        reasoning = 'Precio bajo EMA9, RSI no sobrevendido';
                    }
                }
                
                // Boost de confianza con RSI 5m
                if (rsi5m && decision !== 'NO_TRADE') {
                    if ((decision === 'BUY' && rsi5m < 60) || (decision === 'SELL' && rsi5m > 40)) {
                        confidence += 10;
                    }
                }
            }
            
            if (confidence >= this.config.MIN_CONFIDENCE) {
                return {
                    decision: decision,
                    confidence: confidence,
                    reasoning: reasoning,
                    signal_validation: 'CONFIRM',
                    technical_reason: 'Análisis técnico básico de fallback'
                };
            }
            
            return null;
            
        } catch (error) {
            this.logger.error(`❌ Error en análisis básico para ${symbol}:`, error.message);
            return null;
        }
    }

    // 📤 ENVIAR SEÑAL IA AL CANAL F77
    async sendAISignalToF77(symbol, aiDecision, originalSignal) {
        try {
            if (!this.telegramBot) {
                this.logger.warn('⚠️ Bot de Telegram no disponible para enviar señales');
                return;
            }

            const chatId = process.env.TELEGRAM_CHAT_ID_F77;
            if (!chatId) {
                this.logger.warn('⚠️ TELEGRAM_CHAT_ID_F77 no configurado');
                return;
            }

            const directionEmoji = aiDecision.decision === 'BUY' ? '🟢' : '🔴';
            const validationEmoji = aiDecision.signal_validation === 'CONFIRM' ? '✅' : 
                                   aiDecision.signal_validation === 'CONTRADICT' ? '🔄' : '❌';
            
            const confidenceEmoji = aiDecision.confidence >= 90 ? '🔥🔥🔥' :
                                   aiDecision.confidence >= 85 ? '🔥🔥' : '🔥';

            // Limpiar texto de caracteres problemáticos
            const cleanReasoning = (aiDecision.reasoning || '').replace(/[<>]/g, '').substring(0, 150);
            const cleanTechnical = (aiDecision.technical_reason || '').replace(/[<>]/g, '').substring(0, 150);
            const cleanOriginal = (originalSignal || '').replace(/[<>]/g, '').substring(0, 80);

            const message = `
🤖 IA SCALPING ANÁLISIS

${directionEmoji} ${symbol} ${aiDecision.decision} ${confidenceEmoji}
📊 Confianza IA: ${aiDecision.confidence}%
${validationEmoji} Validación: ${aiDecision.signal_validation}

🧠 ANÁLISIS IA:
${cleanReasoning}

🔍 RAZÓN TÉCNICA:
${cleanTechnical}

📡 SEÑAL ORIGINAL:
${cleanOriginal}

⚙️ CONFIGURACIÓN SCALPING:
💰 Capital: $1.00 USD
⚡ Leverage: 15x
🛡️ SL: $0.18 | TP: $0.44

🤖 Análisis generado por IA Scalping
            `.trim();

            await this.telegramBot.sendMessage(chatId, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });

            this.logger.info(`📤 Señal IA enviada al F77: ${symbol} ${aiDecision.decision} - ${aiDecision.confidence}%`);

        } catch (error) {
            this.logger.error(`❌ Error enviando señal IA al F77:`, error.message);
        }
    }

    // 🛡️ VERIFICAR CONFLICTOS CON POSICIONES EXISTENTES
    async checkPositionConflict(symbol, newDirection) {
        try {
            // Obtener posiciones abiertas del símbolo
            const positions = await this.binanceRequest('/fapi/v2/positionRisk', { symbol });
            
            if (!positions || positions.length === 0) {
                return false; // No hay posiciones, no hay conflicto
            }
            
            for (const position of positions) {
                const positionAmt = parseFloat(position.positionAmt);
                
                if (positionAmt === 0) continue; // Posición cerrada
                
                const isCurrentLong = positionAmt > 0;
                const isNewLong = newDirection === 'BUY';
                
                // Verificar si son direcciones opuestas
                if (isCurrentLong !== isNewLong) {
                    this.logger.warn(`🔍 CONFLICTO: ${symbol} actual=${isCurrentLong ? 'LONG' : 'SHORT'}, nuevo=${isNewLong ? 'LONG' : 'SHORT'}`);
                    return true; // HAY CONFLICTO
                }
            }
            
            return false; // No hay conflicto
            
        } catch (error) {
            this.logger.error(`❌ Error verificando conflictos ${symbol}:`, error.message);
            return true; // En caso de error, evitar trade por seguridad
        }
    }

    // REQUEST A BINANCE API
    async binanceRequest(endpoint, params = {}) {
        try {
            const timestamp = Date.now();
            const queryString = new URLSearchParams({
                ...params,
                timestamp
            }).toString();
            
            const signature = crypto
                .createHmac('sha256', this.binanceSecretKey)
                .update(queryString)
                .digest('hex');
            
            const response = await axios.get(`${this.binanceBaseURL}${endpoint}?${queryString}&signature=${signature}`, {
                headers: { 'X-MBX-APIKEY': this.binanceApiKey }
            });
            
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    // CALCULAR RSI
    calculateRSI(prices, period = 14) {
        if (prices.length < period + 1) return 50;
        
        let gains = 0;
        let losses = 0;
        
        for (let i = 1; i <= period; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) gains += change;
            else losses -= change;
        }
        
        let avgGain = gains / period;
        let avgLoss = losses / period;
        
        for (let i = period + 1; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) {
                avgGain = (avgGain * (period - 1) + change) / period;
                avgLoss = (avgLoss * (period - 1)) / period;
            } else {
                avgGain = (avgGain * (period - 1)) / period;
                avgLoss = (avgLoss * (period - 1) - change) / period;
            }
        }
        
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    // CALCULAR EMA
    calculateEMA(prices, period) {
        if (prices.length < period) return prices[prices.length - 1];
        
        const multiplier = 2 / (period + 1);
        let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;
        
        for (let i = period; i < prices.length; i++) {
            ema = (prices[i] - ema) * multiplier + ema;
        }
        
        return ema;
    }

    // CALCULAR MACD
    calculateMACD(prices) {
        const ema12 = this.calculateEMA(prices, 12);
        const ema26 = this.calculateEMA(prices, 26);
        const macdLine = ema12 - ema26;
        
        return {
            macd: macdLine,
            signal: macdLine, // Simplificado
            histogram: 0
        };
    }

    // CALCULAR BOLLINGER BANDS
    calculateBollinger(prices, period = 20) {
        if (prices.length < period) return { upper: 0, middle: 0, lower: 0 };
        
        const recentPrices = prices.slice(-period);
        const sma = recentPrices.reduce((a, b) => a + b) / period;
        const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
        const stdDev = Math.sqrt(variance);
        
        return {
            upper: sma + (stdDev * 2),
            middle: sma,
            lower: sma - (stdDev * 2)
        };
    }

    // OBTENER ESTADÍSTICAS
    getStats() {
        return {
            enabled: this.config.ENABLED,
            isRunning: this.isRunning,
            analysisCount: this.analysisCount,
            maxTradesPerHour: this.config.MAX_TRADES_PER_HOUR,
            minConfidence: this.config.MIN_CONFIDENCE,
            positionSize: this.config.POSITION_SIZE_USD,
            leverage: this.config.LEVERAGE,
            slPercent: this.config.SCALP_SL_PERCENT * 100,
            tpPercent: this.config.SCALP_TP_PERCENT * 100,
            symbols: this.config.SYMBOLS,
            timeframes: this.config.TIMEFRAMES
        };
    }

    // HABILITAR/DESHABILITAR
    enable() { this.config.ENABLED = true; }
    disable() { this.config.ENABLED = false; }
    isEnabled() { return this.config.ENABLED; }
}

module.exports = ScalpingAI;
