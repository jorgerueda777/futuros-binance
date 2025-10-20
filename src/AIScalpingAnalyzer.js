const axios = require('axios');
const { RSI, EMA, MACD } = require('technicalindicators');

class AIScalpingAnalyzer {
    constructor(logger) {
        this.logger = logger;
        this.groqApiKey = process.env.GROQ_API_KEY;
        this.openaiApiKey = process.env.OPENAI_API_KEY;
        
        // Debug: Mostrar todas las variables de entorno relacionadas con IA
        this.logger.info(`🔍 DEBUG - Variables de entorno IA:`);
        this.logger.info(`- GROQ_API_KEY: ${this.groqApiKey ? 'CONFIGURADA' : 'NO CONFIGURADA'}`);
        this.logger.info(`- OPENAI_API_KEY: ${this.openaiApiKey ? 'CONFIGURADA' : 'NO CONFIGURADA'}`);
        this.logger.info(`- AI_SCALPING_ENABLED: ${process.env.AI_SCALPING_ENABLED}`);
        this.logger.info(`- AUTO_TRADING_ENABLED: ${process.env.AUTO_TRADING_ENABLED}`);
        this.baseURL = 'https://fapi.binance.com';
        
        // Configuración para trading manual 5min
        this.scalpingConfig = {
            minConfidence: 80,          // Mínimo 80% para señal manual
            maxStopLoss: 0.5,           // -0.5% máximo (más conservador)
            minTakeProfit: 1.0,         // +1.0% mínimo (mejor R:R)
            maxDailyTrades: 20,         // Máximo 20 trades por día
            maxHourlyTrades: 5          // Máximo 5 por hora (menos agresivo)
        };
        
        this.hourlyTrades = 0;
        this.lastHourReset = new Date().getHours();
    }

    // Obtener datos ultra-detallados para scalping 1min
    async getScalpingData(symbol, currentPrice) {
        try {
            // Datos COMPLETOS para análisis profesional IA
            const [klines5m, klines15m, ticker24h, depth, openInterest, fundingRate] = await Promise.all([
                this.getKlines(symbol, '5m', 100),    // Más datos históricos
                this.getKlines(symbol, '15m', 50),
                this.get24hrTicker(symbol),
                this.getOrderBookDepth(symbol, 20),   // Más profundidad
                this.getOpenInterest(symbol),         // OI actual
                this.getFundingRate(symbol)           // Funding rate
            ]);

            if (!klines5m || klines5m.length < 20) {
                throw new Error('Datos insuficientes para trading');
            }

            // Calcular indicadores para 5min
            const closes5m = klines5m.map(k => k.close);
            const volumes5m = klines5m.map(k => k.volume);
            const closes15m = klines15m ? klines15m.map(k => k.close) : [];

            // Indicadores para trading manual 5min
            const rsi14 = RSI.calculate({ values: closes5m, period: 14 });
            const rsi21 = RSI.calculate({ values: closes5m, period: 21 });
            const ema9 = EMA.calculate({ values: closes5m, period: 9 });
            const ema21 = EMA.calculate({ values: closes5m, period: 21 });
            const macd = MACD.calculate({
                values: closes5m,
                fastPeriod: 12,
                slowPeriod: 26,
                signalPeriod: 9
            });

            // Análisis de volumen 5min
            const avgVolume = volumes5m.slice(-10).reduce((a, b) => a + b, 0) / 10;
            const currentVolume = volumes5m[volumes5m.length - 1];
            const volumeRatio = currentVolume / avgVolume;

            // Cambios de precio en timeframes más largos
            const priceChange5m = ((currentPrice - closes5m[closes5m.length - 2]) / closes5m[closes5m.length - 2]) * 100;
            const priceChange15m = ((currentPrice - closes5m[closes5m.length - 4]) / closes5m[closes5m.length - 4]) * 100;

            // Niveles de soporte y resistencia cercanos
            const levels = this.calculateNearestLevels(klines5m, currentPrice);

            // Tendencias multi-timeframe
            const trend5m = this.calculateTrend(closes5m.slice(-10));
            const trend15m = closes15m.length > 0 ? this.calculateTrend(closes15m.slice(-5)) : 'NEUTRAL';

            return {
                symbol,
                currentPrice,
                timestamp: new Date().toISOString(),
                
                // Indicadores
                rsi14: rsi14[rsi14.length - 1],
                rsi21: rsi21[rsi21.length - 1],
                ema9: ema9[ema9.length - 1],
                ema21: ema21[ema21.length - 1],
                macd: macd[macd.length - 1],
                
                // Precio y momentum
                priceChange5m: Math.round(priceChange5m * 1000) / 1000,
                priceChange15m: Math.round(priceChange15m * 1000) / 1000,
                
                // Volumen
                currentVolume,
                avgVolume,
                volumeRatio: Math.round(volumeRatio * 100) / 100,
                
                // Niveles críticos
                nearestResistance: levels.resistance,
                nearestSupport: levels.support,
                distanceToResistance: levels.distanceToResistance,
                distanceToSupport: levels.distanceToSupport,
                
                // Tendencias
                trend5m,
                trend15m,
                
                // Datos 24h
                priceChange24h: ticker24h ? ticker24h.priceChangePercent : 0,
                
                // Order book
                bidAskSpread: depth ? depth.spread : 0,
                orderBookImbalance: depth ? depth.imbalance : 0
            };

        } catch (error) {
            this.logger.error(`❌ Error obteniendo datos de scalping para ${symbol}:`, error.message);
            return null;
        }
    }

    // Análisis con IA (Groq GRATIS o OpenAI) para scalping
    async analyzeWithAI(scalpingData) {
        // Priorizar Groq (gratis) sobre OpenAI
        if (this.groqApiKey) {
            this.logger.info(`🆓 Usando Groq AI (GRATIS)`);
            return await this.analyzeWithGroq(scalpingData);
        } else if (this.openaiApiKey) {
            this.logger.info(`💰 Usando OpenAI (PAGADO)`);
            return await this.analyzeWithOpenAI(scalpingData);
        } else {
            this.logger.warn('⚠️ Ninguna API Key de IA configurada - usando análisis tradicional');
            return this.fallbackAnalysis(scalpingData);
        }
    }

    // Análisis con Groq (GRATIS)
    async analyzeWithGroq(scalpingData) {
        try {
            const prompt = this.createScalpingPrompt(scalpingData);
            
            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: 'llama-3.1-8b-instant', // Modelo más reciente disponible
                messages: [
                    {
                        role: 'system',
                        content: 'Eres un experto en scalping de criptomonedas. DEBES responder ÚNICAMENTE en formato JSON válido. NO agregues texto adicional, explicaciones o análisis fuera del JSON. SOLO JSON.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 300,
                temperature: 0.1
            }, {
                headers: {
                    'Authorization': `Bearer ${this.groqApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000 // 5 segundos máximo
            });

            const rawContent = response.data.choices[0].message.content;
            this.logger.info(`🤖 Respuesta cruda de Groq: ${rawContent.substring(0, 200)}...`);
            
            const aiResponse = JSON.parse(rawContent);
            
            if (this.validateAIResponse(aiResponse)) {
                this.logger.info(`🆓 Análisis Groq completado: ${aiResponse.action} - ${aiResponse.confidence}%`);
                return aiResponse;
            } else {
                this.logger.warn('⚠️ Respuesta Groq inválida - usando análisis tradicional');
                return this.fallbackAnalysis(scalpingData);
            }

        } catch (error) {
            this.logger.error('❌ Error en Groq AI:', error.message);
            this.logger.error('📊 Detalles del error Groq:', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            });
            return this.fallbackAnalysis(scalpingData);
        }
    }

    // Análisis con OpenAI (como respaldo)
    async analyzeWithOpenAI(scalpingData) {
        try {
            const prompt = this.createScalpingPrompt(scalpingData);
            
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o-mini', // Modelo más barato
                messages: [
                    {
                        role: 'system',
                        content: 'Eres un experto en scalping de criptomonedas de 1 minuto. Analiza datos y da recomendaciones ultra-precisas.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 300,
                temperature: 0.1
            }, {
                headers: {
                    'Authorization': `Bearer ${this.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 3000
            });

            const aiResponse = JSON.parse(response.data.choices[0].message.content);
            
            if (this.validateAIResponse(aiResponse)) {
                this.logger.info(`🤖 Análisis OpenAI completado: ${aiResponse.action} - ${aiResponse.confidence}%`);
                return aiResponse;
            } else {
                this.logger.warn('⚠️ Respuesta OpenAI inválida - usando análisis tradicional');
                return this.fallbackAnalysis(scalpingData);
            }

        } catch (error) {
            this.logger.error('❌ Error en OpenAI:', error.message);
            return this.fallbackAnalysis(scalpingData);
        }
    }

    // Crear prompt especializado para scalping
    createScalpingPrompt(data) {
        return `
ANÁLISIS TRADING MANUAL 5 MINUTOS - ${data.symbol}

DATOS ACTUALES:
- Precio: $${data.currentPrice}
- Cambio 5m: ${data.priceChange5m > 0 ? '+' : ''}${data.priceChange5m}%
- Cambio 15m: ${data.priceChange15m > 0 ? '+' : ''}${data.priceChange15m}%
- RSI(14): ${Math.round(data.rsi14)}
- RSI(21): ${Math.round(data.rsi21)}
- EMA9: $${data.ema9?.toFixed(6)}
- EMA21: $${data.ema21?.toFixed(6)}
- Volumen: ${data.volumeRatio}x promedio
- Resistencia: $${data.nearestResistance} (${data.distanceToResistance}%)
- Soporte: $${data.nearestSupport} (${data.distanceToSupport}%)
- Tendencia 5m: ${data.trend5m}
- Tendencia 15m: ${data.trend15m}
- Spread: ${data.bidAskSpread}%

CONTEXTO: Trading manual 5 minutos, señales estables para ejecución manual.

REQUISITOS:
- Solo responder si confianza ≥80%
- Stop Loss máximo: -0.5%
- Take Profit mínimo: +1.0%
- Si confianza <80%, responder "ESPERAR"

RESPONDE ÚNICAMENTE CON ESTE JSON (sin texto adicional):
{
  "action": "LONG/SHORT/ESPERAR",
  "confidence": 0-100,
  "entry": precio_exacto,
  "stopLoss": precio_exacto,
  "takeProfit": precio_exacto,
  "reason": "razón_en_una_línea"
}

NO agregues explicaciones, análisis o texto fuera del JSON.
`;
    }

    // Análisis tradicional mejorado como respaldo
    fallbackAnalysis(data) {
        let confidence = 0;
        let action = 'ESPERAR';
        let reasons = [];

        // RSI extremos (más peso)
        if (data.rsi2 < 5) {
            confidence += 40;
            action = 'LONG';
            reasons.push('RSI(2) oversold extremo');
        } else if (data.rsi2 > 95) {
            confidence += 40;
            action = 'SHORT';
            reasons.push('RSI(2) overbought extremo');
        } else if (data.rsi2 < 15) {
            confidence += 25;
            action = 'LONG';
            reasons.push('RSI(2) oversold');
        } else if (data.rsi2 > 85) {
            confidence += 25;
            action = 'SHORT';
            reasons.push('RSI(2) overbought');
        }

        // Momentum de precio fuerte
        if (Math.abs(data.priceChange1m) > 0.5) {
            confidence += 25;
            reasons.push('Momentum muy fuerte 1m');
        } else if (Math.abs(data.priceChange1m) > 0.3) {
            confidence += 15;
            reasons.push('Momentum fuerte 1m');
        }

        // Volumen confirmatorio
        if (data.volumeRatio > 3) {
            confidence += 20;
            reasons.push('Volumen muy alto');
        } else if (data.volumeRatio > 2) {
            confidence += 10;
            reasons.push('Volumen alto');
        }

        // Tendencia multi-timeframe
        if (data.trend1m === data.trend5m && data.trend1m !== 'NEUTRAL') {
            confidence += 15;
            reasons.push('Tendencias alineadas');
        }

        // Niveles de soporte/resistencia
        if (data.distanceToSupport < 0.5) {
            confidence += 10;
            reasons.push('Cerca de soporte');
        } else if (data.distanceToResistance < 0.5) {
            confidence += 10;
            reasons.push('Cerca de resistencia');
        }

        // Solo si confianza ≥90%
        if (confidence < 90) {
            action = 'ESPERAR';
        }

        const entry = data.currentPrice;
        const stopLoss = action === 'LONG' 
            ? entry * 0.997  // -0.3%
            : entry * 1.003; // +0.3%
        const takeProfit = action === 'LONG'
            ? entry * 1.005  // +0.5%
            : entry * 0.995; // -0.5%

        return {
            action,
            confidence,
            entry,
            stopLoss,
            takeProfit,
            reason: reasons.join(', ') || 'Análisis tradicional'
        };
    }

    // Validar respuesta de IA
    validateAIResponse(response) {
        return response &&
               ['LONG', 'SHORT', 'ESPERAR'].includes(response.action) &&
               typeof response.confidence === 'number' &&
               response.confidence >= 0 && response.confidence <= 100 &&
               (response.action === 'ESPERAR' || 
                (typeof response.entry === 'number' &&
                 typeof response.stopLoss === 'number' &&
                 typeof response.takeProfit === 'number'));
    }

    // Verificar límites de trading
    checkTradingLimits() {
        // Resetear contador cada hora
        const currentHour = new Date().getHours();
        if (currentHour !== this.lastHourReset) {
            this.hourlyTrades = 0;
            this.lastHourReset = currentHour;
        }

        if (this.hourlyTrades >= this.scalpingConfig.maxTradesPerHour) {
            this.logger.warn(`🚫 Límite horario alcanzado: ${this.hourlyTrades}/${this.scalpingConfig.maxTradesPerHour}`);
            return false;
        }

        return true;
    }

    // Procesar señal de scalping
    async processScalpingSignal(symbol, currentPrice) {
        try {
            // Verificar límites
            if (!this.checkTradingLimits()) {
                return null;
            }

            this.logger.info(`⚡ Analizando scalping: ${symbol} - $${currentPrice}`);

            // Obtener datos detallados
            const scalpingData = await this.getScalpingData(symbol, currentPrice);
            if (!scalpingData) {
                return null;
            }

            // Análisis con IA
            const aiAnalysis = await this.analyzeWithAI(scalpingData);
            
            // Solo ejecutar si confianza ≥90%
            if (aiAnalysis.confidence >= this.scalpingConfig.minConfidence && aiAnalysis.action !== 'ESPERAR') {
                this.hourlyTrades++;
                this.logger.info(`🎯 Señal de scalping: ${aiAnalysis.action} ${symbol} - ${aiAnalysis.confidence}%`);
                return aiAnalysis;
            }

            return null;

        } catch (error) {
            this.logger.error(`❌ Error procesando señal de scalping para ${symbol}:`, error.message);
            return null;
        }
    }

    // Métodos auxiliares
    async getKlines(symbol, interval, limit) {
        try {
            const response = await axios.get(`${this.baseURL}/fapi/v1/klines`, {
                params: { symbol, interval, limit },
                timeout: 2000
            });
            return response.data.map(k => ({
                openTime: k[0],
                open: parseFloat(k[1]),
                high: parseFloat(k[2]),
                low: parseFloat(k[3]),
                close: parseFloat(k[4]),
                volume: parseFloat(k[5])
            }));
        } catch (error) {
            return null;
        }
    }

    async get24hrTicker(symbol) {
        try {
            const response = await axios.get(`${this.baseURL}/fapi/v1/ticker/24hr`, {
                params: { symbol },
                timeout: 1000
            });
            return {
                priceChangePercent: parseFloat(response.data.priceChangePercent)
            };
        } catch (error) {
            this.logger.error(`Error obteniendo ticker 24h:`, error.message);
            return { priceChangePercent: 0 };
        }
    }

    async getOrderBookDepth(symbol, limit) {
        try {
            const response = await axios.get(`${this.baseURL}/fapi/v1/depth`, {
                params: { symbol, limit },
                timeout: 1000
            });
            const bids = response.data.bids.map(b => parseFloat(b[0]));
            const asks = response.data.asks.map(a => parseFloat(a[0]));
            const spread = ((asks[0] - bids[0]) / bids[0]) * 100;
            return { spread };
        } catch (error) {
            return null;
        }
    }

    calculateNearestLevels(klines, currentPrice) {
        const highs = klines.map(k => k.high);
        const lows = klines.map(k => k.low);
        
        const resistance = Math.min(...highs.filter(h => h > currentPrice));
        const support = Math.max(...lows.filter(l => l < currentPrice));
        
        return {
            resistance,
            support,
            distanceToResistance: ((resistance - currentPrice) / currentPrice * 100).toFixed(2),
            distanceToSupport: ((currentPrice - support) / currentPrice * 100).toFixed(2)
        };
    }

    calculateTrend(prices) {
        if (prices.length < 3) return 'NEUTRAL';
        
        const first = prices[0];
        const last = prices[prices.length - 1];
        const change = ((last - first) / first) * 100;
        
        if (change > 0.2) return 'BULLISH';
        if (change < -0.2) return 'BEARISH';
        return 'NEUTRAL';
    }
}

module.exports = AIScalpingAnalyzer;
