const axios = require('axios');
const crypto = require('crypto');

class SignalValidatorAI {
    constructor(apiKey, logger, binanceApiKey, binanceSecretKey) {
        this.apiKey = apiKey;
        this.logger = logger;
        this.baseURL = 'https://api.groq.com/openai/v1';
        
        // BINANCE API PARA OBTENER DATOS TÉCNICOS
        this.binanceApiKey = binanceApiKey;
        this.binanceSecretKey = binanceSecretKey;
        this.binanceBaseURL = 'https://fapi.binance.com';
        
        // CONFIGURACIÓN PARA VALIDACIÓN DE SEÑALES (RESPETANDO LÍMITES GROQ)
        this.config = {
            MIN_CONFIDENCE: 80,           // Mínimo 80% para validar señal
            ENABLED: true,                // Habilitado por defecto
            MAX_VALIDATIONS_PER_HOUR: 20, // Reducido para respetar rate limits
            RETRY_DELAY: 2000,            // 2 segundos entre reintentos
            MAX_RETRIES: 2                // Máximo 2 reintentos
        };
        
        this.validationCount = 0;
        this.lastValidationHour = new Date().getHours();
    }

    // 🧠 PROMPT ESPECIALIZADO EN VALIDACIÓN DE SEÑALES
    getValidationPrompt() {
        return `Eres un EXPERTO VALIDADOR DE SEÑALES DE TRADING especializado en criptomonedas.

TU MISIÓN: Analizar señales generadas por SmartMoney y decidir si son oportunidades reales de trading.

CRITERIOS DE VALIDACIÓN:
1. ANÁLISIS TÉCNICO AVANZADO:
   - Confirmar la dirección de la tendencia en múltiples timeframes
   - Verificar niveles de soporte/resistencia relevantes
   - Evaluar momentum y volumen para confirmar la señal
   - Identificar posibles divergencias o señales contradictorias

2. CONTEXTO DE MERCADO:
   - Condiciones generales del mercado crypto
   - Correlación con Bitcoin y mercados principales
   - Volatilidad actual del activo
   - Liquidez y spread del par

3. GESTIÓN DE RIESGO:
   - Evaluar si el Risk/Reward es favorable (mínimo 1:2)
   - Verificar que los niveles de SL/TP son lógicos
   - Considerar el tamaño de posición apropiado
   - Evaluar timing de entrada

4. CONFLUENCIAS:
   - Múltiples indicadores alineados
   - Patrones de precio confirmados
   - Volumen validando el movimiento
   - Ausencia de noticias conflictivas

RESPUESTA REQUERIDA (JSON):
{
  "decision": "BUY" | "SELL" | "NO_TRADE",
  "confidence": 0-100,
  "reasoning": "Explicación detallada de la decisión",
  "risk_assessment": "LOW" | "MEDIUM" | "HIGH",
  "expected_move": "Porcentaje esperado de movimiento",
  "time_horizon": "Tiempo estimado para alcanzar objetivo"
}

IMPORTANTE: 
- Solo valida positivamente señales con 80%+ de confianza
- Sé EXTREMADAMENTE selectivo y conservador
- Prioriza la preservación de capital sobre las ganancias
- Si hay dudas, responde NO_TRADE`;
    }

    // VALIDAR SEÑAL DE SMARTMONEY CON ANÁLISIS TÉCNICO COMPLETO
    async validateSignal(signalData) {
        try {
            this.logger.info(`VALIDANDO señal SmartMoney: ${signalData.symbol} ${signalData.action}`);
            
            // Verificar límites de validación
            const currentHour = new Date().getHours();
            if (currentHour !== this.lastValidationHour) {
                this.validationCount = 0;
                this.lastValidationHour = currentHour;
            }
            
            if (this.validationCount >= this.config.MAX_VALIDATIONS_PER_HOUR) {
                this.logger.warn(`Límite de validaciones alcanzado: ${this.validationCount}/${this.config.MAX_VALIDATIONS_PER_HOUR} por hora`);
                return {
                    decision: 'NO_TRADE',
                    confidence: 0,
                    reasoning: 'Límite de validaciones por hora alcanzado'
                };
            }

            // OBTENER DATOS TÉCNICOS COMPLETOS DE BINANCE FUTURES
            this.logger.info(`Obteniendo análisis técnico completo para ${signalData.symbol}...`);
            const technicalData = await this.getCompleteTechnicalData(signalData.symbol);

            const prompt = `${this.getValidationPrompt()}

SEÑAL SMARTMONEY PARA VALIDAR:
Símbolo: ${signalData.symbol}
Acción SmartMoney: ${signalData.action}
Confianza SmartMoney: ${signalData.confidence}%

ANÁLISIS TÉCNICO COMPLETO DE BINANCE FUTURES:
Precio Actual: $${technicalData.price}
Cambio 24h: ${technicalData.priceChange24h}%
Volumen 24h: ${technicalData.volume24h}
Open Interest: ${technicalData.openInterest}
Funding Rate: ${technicalData.fundingRate}%

ANÁLISIS MULTI-TIMEFRAME:

1 MINUTO:
- Precio: $${technicalData.timeframes['1m'].currentPrice}
- RSI: ${technicalData.timeframes['1m'].rsi}
- Tendencia: ${technicalData.timeframes['1m'].trend}
- Volumen Ratio: ${technicalData.timeframes['1m'].volumeRatio}x
- EMA9: $${technicalData.timeframes['1m'].ema9}
- EMA21: $${technicalData.timeframes['1m'].ema21}
- Bollinger: Upper $${technicalData.timeframes['1m'].bollinger.upper}, Lower $${technicalData.timeframes['1m'].bollinger.lower}
- Soporte: $${technicalData.timeframes['1m'].support}
- Resistencia: $${technicalData.timeframes['1m'].resistance}

5 MINUTOS:
- RSI: ${technicalData.timeframes['5m'].rsi}
- Tendencia: ${technicalData.timeframes['5m'].trend}
- MACD: ${JSON.stringify(technicalData.timeframes['5m'].macd)}
- EMA50: $${technicalData.timeframes['5m'].ema50}
- Bollinger Position: ${technicalData.timeframes['5m'].bollinger.position}

15 MINUTOS:
- RSI: ${technicalData.timeframes['15m'].rsi}
- Tendencia: ${technicalData.timeframes['15m'].trend}
- EMA200: $${technicalData.timeframes['15m'].ema200}

1 HORA:
- RSI: ${technicalData.timeframes['1h'].rsi}
- Tendencia: ${technicalData.timeframes['1h'].trend}
- MACD: ${JSON.stringify(technicalData.timeframes['1h'].macd)}

4 HORAS:
- RSI: ${technicalData.timeframes['4h'].rsi}
- Tendencia: ${technicalData.timeframes['4h'].trend}
- MACD: ${JSON.stringify(technicalData.timeframes['4h'].macd)}

CONTEXTO FUTURES:
- Mercado: Binance Futures
- Apalancamiento: 15x disponible
- Tamaño posición: $0.85 USD
- Timestamp: ${technicalData.timestamp}

INSTRUCCIONES ESPECÍFICAS:
Analiza TODOS los datos técnicos obtenidos de Binance Futures y determina si esta señal SmartMoney es una oportunidad válida. 
Considera especialmente:
- Confluencias entre múltiples timeframes
- Niveles de RSI en diferentes marcos temporales
- Tendencias alineadas
- Volumen excepcional
- Posición en Bollinger Bands
- Soporte/Resistencia relevantes
- Open Interest y Funding Rate para contexto de futuros`;

            // Llamada con manejo de rate limits y reintentos
            const response = await this.makeGroqRequest({
                model: 'llama-3.1-8b-instant',  // Modelo de producción más estable
                messages: [
                    {
                        role: 'system',
                        content: 'Eres un experto validador de señales de trading. Responde SOLO en formato JSON válido.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.1,  // Más determinístico
                max_tokens: 500    // Reducido para evitar límites
            });

            const aiResponse = response.data.choices[0].message.content;
            this.logger.info(`🤖 Respuesta IA Validadora: ${aiResponse}`);

            // Parsear respuesta JSON
            let validation;
            try {
                validation = JSON.parse(aiResponse);
            } catch (parseError) {
                this.logger.error(`❌ Error parseando respuesta IA: ${parseError.message}`);
                return {
                    decision: 'NO_TRADE',
                    confidence: 0,
                    reasoning: 'Error en respuesta de IA'
                };
            }

            // Validar confianza mínima
            if (validation.confidence < this.config.MIN_CONFIDENCE) {
                this.logger.info(`📊 Validación: Confianza ${validation.confidence}% < ${this.config.MIN_CONFIDENCE}% - NO TRADE`);
                return {
                    decision: 'NO_TRADE',
                    confidence: validation.confidence,
                    reasoning: 'Confianza insuficiente para validar señal'
                };
            }

            this.validationCount++;
            this.logger.info(`✅ SEÑAL VALIDADA: ${validation.decision} - ${validation.confidence}%`);
            this.logger.info(`📊 Validaciones esta hora: ${this.validationCount}/${this.config.MAX_VALIDATIONS_PER_HOUR}`);

            return validation;

        } catch (error) {
            this.logger.error(`❌ Error validando señal: ${error.message}`);
            return {
                decision: 'NO_TRADE',
                confidence: 0,
                reasoning: `Error: ${error.message}`
            };
        }
    }

    // 📊 OBTENER DATOS TÉCNICOS COMPLETOS DE BINANCE FUTURES
    async getCompleteTechnicalData(symbol) {
        try {
            this.logger.info(`📊 Obteniendo datos técnicos completos para ${symbol} desde Binance Futures`);
            
            // Obtener datos en paralelo para múltiples timeframes
            const [
                klines1m,
                klines5m, 
                klines15m,
                klines1h,
                klines4h,
                ticker24h,
                openInterest,
                fundingRate
            ] = await Promise.all([
                this.getKlines(symbol, '1m', 100),
                this.getKlines(symbol, '5m', 100),
                this.getKlines(symbol, '15m', 100),
                this.getKlines(symbol, '1h', 100),
                this.getKlines(symbol, '4h', 100),
                this.get24hrTicker(symbol),
                this.getOpenInterest(symbol),
                this.getFundingRate(symbol)
            ]);

            // Calcular indicadores técnicos para cada timeframe
            const technicalAnalysis = {
                symbol: symbol,
                timestamp: new Date().toISOString(),
                price: parseFloat(ticker24h.lastPrice),
                volume24h: parseFloat(ticker24h.volume),
                priceChange24h: parseFloat(ticker24h.priceChangePercent),
                openInterest: parseFloat(openInterest.openInterest),
                fundingRate: parseFloat(fundingRate.fundingRate),
                
                timeframes: {
                    '1m': this.calculateIndicators(klines1m, '1m'),
                    '5m': this.calculateIndicators(klines5m, '5m'),
                    '15m': this.calculateIndicators(klines15m, '15m'),
                    '1h': this.calculateIndicators(klines1h, '1h'),
                    '4h': this.calculateIndicators(klines4h, '4h')
                }
            };

            this.logger.info(`✅ Datos técnicos obtenidos: ${symbol} - Precio: $${technicalAnalysis.price}`);
            return technicalAnalysis;

        } catch (error) {
            this.logger.error(`❌ Error obteniendo datos técnicos: ${error.message}`);
            throw error;
        }
    }

    // 📈 OBTENER KLINES DE BINANCE FUTURES
    async getKlines(symbol, interval, limit) {
        try {
            const response = await axios.get(`${this.binanceBaseURL}/fapi/v1/klines`, {
                params: {
                    symbol: symbol,
                    interval: interval,
                    limit: limit
                }
            });
            return response.data;
        } catch (error) {
            this.logger.error(`❌ Error obteniendo klines ${interval}: ${error.message}`);
            throw error;
        }
    }

    // 📊 OBTENER TICKER 24H
    async get24hrTicker(symbol) {
        try {
            const response = await axios.get(`${this.binanceBaseURL}/fapi/v1/ticker/24hr`, {
                params: { symbol: symbol }
            });
            return response.data;
        } catch (error) {
            this.logger.error(`❌ Error obteniendo ticker 24h: ${error.message}`);
            throw error;
        }
    }

    // 🔒 OBTENER OPEN INTEREST
    async getOpenInterest(symbol) {
        try {
            const response = await axios.get(`${this.binanceBaseURL}/fapi/v1/openInterest`, {
                params: { symbol: symbol }
            });
            return response.data;
        } catch (error) {
            this.logger.error(`❌ Error obteniendo open interest: ${error.message}`);
            throw error;
        }
    }

    // 💰 OBTENER FUNDING RATE
    async getFundingRate(symbol) {
        try {
            const response = await axios.get(`${this.binanceBaseURL}/fapi/v1/fundingRate`, {
                params: { 
                    symbol: symbol,
                    limit: 1
                }
            });
            return response.data[0] || { fundingRate: 0 };
        } catch (error) {
            this.logger.error(`❌ Error obteniendo funding rate: ${error.message}`);
            return { fundingRate: 0 };
        }
    }

    // 🧮 CALCULAR INDICADORES TÉCNICOS
    calculateIndicators(klines, timeframe) {
        try {
            const closes = klines.map(k => parseFloat(k[4])); // Precios de cierre
            const highs = klines.map(k => parseFloat(k[2]));  // Precios máximos
            const lows = klines.map(k => parseFloat(k[3]));   // Precios mínimos
            const volumes = klines.map(k => parseFloat(k[5])); // Volúmenes

            const currentPrice = closes[closes.length - 1];
            const previousPrice = closes[closes.length - 2];
            
            return {
                timeframe: timeframe,
                currentPrice: currentPrice,
                priceChange: ((currentPrice - previousPrice) / previousPrice * 100).toFixed(2),
                
                // RSI (Relative Strength Index)
                rsi: this.calculateRSI(closes, 14),
                
                // MACD
                macd: this.calculateMACD(closes),
                
                // Bollinger Bands
                bollinger: this.calculateBollingerBands(closes, 20),
                
                // EMAs
                ema9: this.calculateEMA(closes, 9),
                ema21: this.calculateEMA(closes, 21),
                ema50: this.calculateEMA(closes, 50),
                ema200: this.calculateEMA(closes, 200),
                
                // Volumen
                avgVolume: volumes.slice(-20).reduce((a, b) => a + b, 0) / 20,
                currentVolume: volumes[volumes.length - 1],
                volumeRatio: (volumes[volumes.length - 1] / (volumes.slice(-20).reduce((a, b) => a + b, 0) / 20)).toFixed(2),
                
                // Soporte y Resistencia
                support: Math.min(...lows.slice(-20)),
                resistance: Math.max(...highs.slice(-20)),
                
                // Tendencia
                trend: this.determineTrend(closes)
            };
        } catch (error) {
            this.logger.error(`❌ Error calculando indicadores: ${error.message}`);
            return {};
        }
    }

    // 📈 CALCULAR RSI
    calculateRSI(closes, period = 14) {
        if (closes.length < period + 1) return 50;
        
        let gains = 0;
        let losses = 0;
        
        for (let i = 1; i <= period; i++) {
            const change = closes[closes.length - i] - closes[closes.length - i - 1];
            if (change > 0) gains += change;
            else losses -= change;
        }
        
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        
        return parseFloat(rsi.toFixed(2));
    }

    // 📊 CALCULAR MACD
    calculateMACD(closes) {
        const ema12 = this.calculateEMA(closes, 12);
        const ema26 = this.calculateEMA(closes, 26);
        const macdLine = ema12 - ema26;
        
        return {
            macd: parseFloat(macdLine.toFixed(6)),
            signal: parseFloat((macdLine * 0.9).toFixed(6)), // Simplificado
            histogram: parseFloat((macdLine * 0.1).toFixed(6))
        };
    }

    // 📏 CALCULAR BOLLINGER BANDS
    calculateBollingerBands(closes, period = 20) {
        const sma = closes.slice(-period).reduce((a, b) => a + b, 0) / period;
        const variance = closes.slice(-period).reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
        const stdDev = Math.sqrt(variance);
        
        return {
            upper: parseFloat((sma + (stdDev * 2)).toFixed(6)),
            middle: parseFloat(sma.toFixed(6)),
            lower: parseFloat((sma - (stdDev * 2)).toFixed(6)),
            position: closes[closes.length - 1] > sma ? 'ABOVE' : 'BELOW'
        };
    }

    // 📈 CALCULAR EMA
    calculateEMA(closes, period) {
        if (closes.length < period) return closes[closes.length - 1];
        
        const multiplier = 2 / (period + 1);
        let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
        
        for (let i = period; i < closes.length; i++) {
            ema = (closes[i] * multiplier) + (ema * (1 - multiplier));
        }
        
        return parseFloat(ema.toFixed(6));
    }

    // 📊 DETERMINAR TENDENCIA
    determineTrend(closes) {
        const short = closes.slice(-5);
        const medium = closes.slice(-20);
        
        const shortTrend = short[short.length - 1] > short[0] ? 'UP' : 'DOWN';
        const mediumTrend = medium[medium.length - 1] > medium[0] ? 'UP' : 'DOWN';
        
        if (shortTrend === 'UP' && mediumTrend === 'UP') return 'STRONG_UP';
        if (shortTrend === 'DOWN' && mediumTrend === 'DOWN') return 'STRONG_DOWN';
        if (shortTrend === 'UP' && mediumTrend === 'DOWN') return 'REVERSAL_UP';
        if (shortTrend === 'DOWN' && mediumTrend === 'UP') return 'REVERSAL_DOWN';
        return 'SIDEWAYS';
    }

    // 🔄 MÉTODO ROBUSTO PARA LLAMADAS A GROQ CON RATE LIMIT HANDLING
    async makeGroqRequest(requestData, retryCount = 0) {
        try {
            const response = await axios.post(`${this.baseURL}/chat/completions`, requestData, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000  // 10 segundos timeout
            });

            return response;

        } catch (error) {
            // Manejo específico de rate limits (429)
            if (error.response?.status === 429) {
                const retryAfter = error.response.headers['retry-after'] || this.config.RETRY_DELAY / 1000;
                this.logger.warn(`⏳ Rate limit alcanzado, esperando ${retryAfter} segundos...`);
                
                if (retryCount < this.config.MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    return this.makeGroqRequest(requestData, retryCount + 1);
                } else {
                    throw new Error(`Rate limit excedido después de ${this.config.MAX_RETRIES} reintentos`);
                }
            }

            // Manejo de otros errores 400
            if (error.response?.status === 400) {
                this.logger.error(`❌ Error 400 en Groq API: ${error.response.data?.error?.message || 'Error desconocido'}`);
                throw new Error(`API Error 400: ${error.response.data?.error?.message || 'Solicitud inválida'}`);
            }

            // Otros errores
            this.logger.error(`❌ Error en Groq API: ${error.message}`);
            throw error;
        }
    }

    // 🎯 CONVERTIR DECISIÓN IA A ACCIÓN DE TRADING
    convertToTradeAction(validation, originalSignal) {
        if (validation.decision === 'NO_TRADE') {
            return null;
        }

        // Mapear decisión de IA a acción de trading
        let tradeAction;
        if (validation.decision === 'BUY') {
            tradeAction = 'ENTRAR LONG';
        } else if (validation.decision === 'SELL') {
            tradeAction = 'ENTRAR SHORT';
        } else {
            return null;
        }

        return {
            action: tradeAction,
            confidence: validation.confidence,
            reasoning: `SmartMoney: ${originalSignal.confidence}% + IA Validación: ${validation.confidence}%`,
            riskAssessment: validation.risk_assessment,
            expectedMove: validation.expected_move,
            timeHorizon: validation.time_horizon
        };
    }

    // ⚙️ CONFIGURACIÓN
    isEnabled() {
        return this.config.ENABLED;
    }

    enable() {
        this.config.ENABLED = true;
        this.logger.info(`🔍 IA VALIDADORA HABILITADA - Doble filtro activado`);
    }

    disable() {
        this.config.ENABLED = false;
        this.logger.info(`🛑 IA VALIDADORA DESHABILITADA`);
    }

    getStats() {
        return {
            validationsThisHour: this.validationCount,
            maxValidationsPerHour: this.config.MAX_VALIDATIONS_PER_HOUR,
            minConfidence: this.config.MIN_CONFIDENCE,
            enabled: this.config.ENABLED
        };
    }
}

module.exports = SignalValidatorAI;
