const axios = require('axios');
const { RSI, EMA, MACD } = require('technicalindicators');

class AIScalpingAnalyzer {
    constructor(logger) {
        this.logger = logger;
        this.openaiApiKey = process.env.OPENAI_API_KEY;
        this.baseURL = 'https://fapi.binance.com';
        
        // Configuración para scalping 1min
        this.scalpingConfig = {
            minConfidence: 90,          // Mínimo 90% para auto-ejecución
            maxRiskPercent: 0.3,        // Máximo -0.3% riesgo
            minRewardPercent: 0.5,      // Mínimo +0.5% ganancia
            maxTradesPerHour: 5,        // Máximo 5 trades/hora
            maxTradeDuration: 60,       // Máximo 60 segundos
            timeframe: '1m'             // Scalping 1 minuto
        };
        
        this.hourlyTrades = 0;
        this.lastHourReset = new Date().getHours();
    }

    // Obtener datos ultra-detallados para scalping 1min
    async getScalpingData(symbol, currentPrice) {
        try {
            // Datos paralelos para máxima velocidad
            const [klines1m, klines5m, ticker24h, depth] = await Promise.all([
                this.getKlines(symbol, '1m', 50),
                this.getKlines(symbol, '5m', 20),
                this.get24hrTicker(symbol),
                this.getOrderBookDepth(symbol, 10)
            ]);

            if (!klines1m || klines1m.length < 20) {
                throw new Error('Datos insuficientes para scalping');
            }

            // Calcular indicadores ultra-rápidos
            const closes1m = klines1m.map(k => k.close);
            const volumes1m = klines1m.map(k => k.volume);
            const closes5m = klines5m ? klines5m.map(k => k.close) : [];

            // Indicadores específicos para scalping
            const rsi2 = RSI.calculate({ values: closes1m, period: 2 });
            const rsi14 = RSI.calculate({ values: closes1m, period: 14 });
            const ema9 = EMA.calculate({ values: closes1m, period: 9 });
            const ema21 = EMA.calculate({ values: closes1m, period: 21 });
            const macd = MACD.calculate({
                values: closes1m,
                fastPeriod: 12,
                slowPeriod: 26,
                signalPeriod: 9
            });

            // Análisis de volumen
            const avgVolume = volumes1m.slice(-10).reduce((a, b) => a + b, 0) / 10;
            const currentVolume = volumes1m[volumes1m.length - 1];
            const volumeRatio = currentVolume / avgVolume;

            // Cambios de precio recientes
            const priceChange1m = ((currentPrice - closes1m[closes1m.length - 2]) / closes1m[closes1m.length - 2]) * 100;
            const priceChange5m = ((currentPrice - closes1m[closes1m.length - 6]) / closes1m[closes1m.length - 6]) * 100;

            // Niveles de soporte y resistencia cercanos
            const levels = this.calculateNearestLevels(klines1m, currentPrice);

            // Tendencias multi-timeframe
            const trend1m = this.calculateTrend(closes1m.slice(-10));
            const trend5m = closes5m.length > 0 ? this.calculateTrend(closes5m.slice(-5)) : 'NEUTRAL';

            return {
                symbol,
                currentPrice,
                timestamp: new Date().toISOString(),
                
                // Indicadores
                rsi2: rsi2[rsi2.length - 1],
                rsi14: rsi14[rsi14.length - 1],
                ema9: ema9[ema9.length - 1],
                ema21: ema21[ema21.length - 1],
                macd: macd[macd.length - 1],
                
                // Precio y momentum
                priceChange1m: Math.round(priceChange1m * 1000) / 1000,
                priceChange5m: Math.round(priceChange5m * 1000) / 1000,
                
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
                trend1m,
                trend5m,
                
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

    // Análisis con IA (GPT-4o) para scalping
    async analyzeWithAI(scalpingData) {
        if (!this.openaiApiKey) {
            this.logger.warn('⚠️ OpenAI API Key no configurada - usando análisis tradicional');
            return this.fallbackAnalysis(scalpingData);
        }

        try {
            const prompt = this.createScalpingPrompt(scalpingData);
            
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o',
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
                timeout: 3000 // 3 segundos máximo
            });

            const aiResponse = JSON.parse(response.data.choices[0].message.content);
            
            // Validar respuesta de IA
            if (this.validateAIResponse(aiResponse)) {
                this.logger.info(`🤖 Análisis IA completado: ${aiResponse.action} - ${aiResponse.confidence}%`);
                return aiResponse;
            } else {
                this.logger.warn('⚠️ Respuesta IA inválida - usando análisis tradicional');
                return this.fallbackAnalysis(scalpingData);
            }

        } catch (error) {
            this.logger.error('❌ Error en análisis IA:', error.message);
            return this.fallbackAnalysis(scalpingData);
        }
    }

    // Crear prompt especializado para scalping
    createScalpingPrompt(data) {
        return `
ANÁLISIS SCALPING 1 MINUTO - ${data.symbol}

DATOS ACTUALES:
- Precio: $${data.currentPrice}
- Cambio 1m: ${data.priceChange1m > 0 ? '+' : ''}${data.priceChange1m}%
- Cambio 5m: ${data.priceChange5m > 0 ? '+' : ''}${data.priceChange5m}%
- RSI(2): ${Math.round(data.rsi2)}
- RSI(14): ${Math.round(data.rsi14)}
- EMA9: $${data.ema9?.toFixed(6)}
- EMA21: $${data.ema21?.toFixed(6)}
- Volumen: ${data.volumeRatio}x promedio
- Resistencia: $${data.nearestResistance} (${data.distanceToResistance}%)
- Soporte: $${data.nearestSupport} (${data.distanceToSupport}%)
- Tendencia 1m: ${data.trend1m}
- Tendencia 5m: ${data.trend5m}
- Spread: ${data.bidAskSpread}%

CONTEXTO: Scalping 1 minuto, operaciones de 30-60 segundos máximo.

REQUISITOS:
- Solo responder si confianza ≥90%
- Stop Loss máximo: -0.3%
- Take Profit mínimo: +0.5%
- Si confianza <90%, responder "ESPERAR"

RESPONDE EN JSON:
{
  "action": "LONG/SHORT/ESPERAR",
  "confidence": 0-100,
  "entry": precio_exacto,
  "stopLoss": precio_exacto,
  "takeProfit": precio_exacto,
  "reason": "razón_en_una_línea"
}
`;
    }

    // Análisis tradicional como respaldo
    fallbackAnalysis(data) {
        let confidence = 0;
        let action = 'ESPERAR';
        let reasons = [];

        // RSI extremos
        if (data.rsi2 < 10) {
            confidence += 30;
            action = 'LONG';
            reasons.push('RSI(2) oversold extremo');
        } else if (data.rsi2 > 90) {
            confidence += 30;
            action = 'SHORT';
            reasons.push('RSI(2) overbought extremo');
        }

        // Momentum de precio
        if (Math.abs(data.priceChange1m) > 0.3) {
            confidence += 20;
            reasons.push('Momentum fuerte 1m');
        }

        // Volumen confirmatorio
        if (data.volumeRatio > 2) {
            confidence += 15;
            reasons.push('Volumen alto');
        }

        // Tendencia multi-timeframe
        if (data.trend1m === data.trend5m && data.trend1m !== 'NEUTRAL') {
            confidence += 25;
            reasons.push('Tendencias alineadas');
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
            return null;
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
