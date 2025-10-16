const axios = require('axios');
const { RSI, MACD, BollingerBands, SMA, EMA, Stochastic } = require('technicalindicators');
const chalk = require('chalk');

class TechnicalAnalyzer {
    constructor() {
        this.timeframes = ['1m', '5m', '15m', '1h', '4h'];
        this.indicators = {};
    }

    async performCompleteAnalysis(symbol, marketData) {
        try {
            console.log(chalk.blue(`🔍 Iniciando análisis técnico profesional de ${symbol}`));
            
            const analysis = {
                symbol: symbol,
                timestamp: new Date().toISOString(),
                currentPrice: marketData.price,
                timeframe: '15m', // Timeframe principal
                confidence: 0,
                direction: null,
                strength: 'NEUTRAL'
            };

            // 1. Obtener datos históricos para múltiples timeframes
            const historicalData = await this.getHistoricalData(symbol);
            if (!historicalData || historicalData.length < 50) {
                throw new Error('Datos históricos insuficientes');
            }

            // 2. Calcular indicadores técnicos
            analysis.indicators = await this.calculateAllIndicators(historicalData);
            
            // 3. Identificar soportes y resistencias
            analysis.supportResistance = this.identifySupportResistance(historicalData);
            
            // 4. Analizar acción del precio
            analysis.priceAction = this.analyzePriceAction(historicalData);
            
            // 5. Analizar volumen
            analysis.volumeAnalysis = this.analyzeVolume(historicalData);
            
            // 6. Detectar patrones
            analysis.patterns = this.detectPatterns(historicalData);
            
            // 7. Calcular confluencias
            analysis.confluences = this.calculateConfluences(analysis);
            
            // 8. Determinar dirección y confianza
            const prediction = this.generatePrediction(analysis);
            analysis.direction = prediction.direction;
            analysis.confidence = prediction.confidence;
            analysis.reasoning = prediction.reasoning;
            
            // 9. Calcular niveles de entrada y salida
            analysis.tradingLevels = this.calculateTradingLevels(analysis);

            console.log(chalk.green(`✅ Análisis completado: ${symbol} - ${analysis.direction} (${analysis.confidence}%)`));
            
            return analysis;

        } catch (error) {
            console.error(chalk.red(`❌ Error en análisis técnico de ${symbol}:`), error);
            return null;
        }
    }

    async getHistoricalData(symbol, timeframe = '15m', limit = 200) {
        try {
            const url = `https://api.binance.com/api/v3/klines`;
            const params = {
                symbol: symbol,
                interval: timeframe,
                limit: limit
            };

            const response = await axios.get(url, { params, timeout: 10000 });
            
            return response.data.map(kline => ({
                timestamp: kline[0],
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5]),
                closeTime: kline[6],
                quoteVolume: parseFloat(kline[7]),
                trades: kline[8]
            }));

        } catch (error) {
            console.error('Error obteniendo datos históricos:', error);
            return null;
        }
    }

    async calculateAllIndicators(data) {
        try {
            const closes = data.map(d => d.close);
            const highs = data.map(d => d.high);
            const lows = data.map(d => d.low);
            const volumes = data.map(d => d.volume);

            // RSI
            const rsi = RSI.calculate({ values: closes, period: 14 });
            const currentRSI = rsi[rsi.length - 1];

            // MACD
            const macd = MACD.calculate({
                values: closes,
                fastPeriod: 12,
                slowPeriod: 26,
                signalPeriod: 9,
                SimpleMAOscillator: false,
                SimpleMASignal: false
            });
            const currentMACD = macd[macd.length - 1];

            // Bollinger Bands
            const bb = BollingerBands.calculate({
                period: 20,
                values: closes,
                stdDev: 2
            });
            const currentBB = bb[bb.length - 1];

            // EMAs
            const ema9 = EMA.calculate({ period: 9, values: closes });
            const ema21 = EMA.calculate({ period: 21, values: closes });
            const ema50 = EMA.calculate({ period: 50, values: closes });

            // SMAs
            const sma20 = SMA.calculate({ period: 20, values: closes });
            const sma50 = SMA.calculate({ period: 50, values: closes });

            // Stochastic
            const stoch = Stochastic.calculate({
                high: highs,
                low: lows,
                close: closes,
                period: 14,
                signalPeriod: 3
            });
            const currentStoch = stoch[stoch.length - 1];

            return {
                rsi: {
                    value: Math.round(currentRSI * 100) / 100,
                    signal: this.getRSISignal(currentRSI),
                    strength: this.getRSIStrength(currentRSI)
                },
                macd: {
                    macd: Math.round(currentMACD.MACD * 100000) / 100000,
                    signal: Math.round(currentMACD.signal * 100000) / 100000,
                    histogram: Math.round(currentMACD.histogram * 100000) / 100000,
                    trend: currentMACD.MACD > currentMACD.signal ? 'BULLISH' : 'BEARISH',
                    strength: Math.abs(currentMACD.histogram) > 0.001 ? 'STRONG' : 'WEAK'
                },
                bollinger: {
                    upper: Math.round(currentBB.upper * 100) / 100,
                    middle: Math.round(currentBB.middle * 100) / 100,
                    lower: Math.round(currentBB.lower * 100) / 100,
                    position: this.getBollingerPosition(closes[closes.length - 1], currentBB),
                    squeeze: (currentBB.upper - currentBB.lower) / currentBB.middle < 0.02
                },
                emas: {
                    ema9: Math.round(ema9[ema9.length - 1] * 100) / 100,
                    ema21: Math.round(ema21[ema21.length - 1] * 100) / 100,
                    ema50: Math.round(ema50[ema50.length - 1] * 100) / 100,
                    alignment: this.getEMAAlignment(ema9, ema21, ema50)
                },
                smas: {
                    sma20: Math.round(sma20[sma20.length - 1] * 100) / 100,
                    sma50: Math.round(sma50[sma50.length - 1] * 100) / 100
                },
                stochastic: {
                    k: Math.round(currentStoch.k * 100) / 100,
                    d: Math.round(currentStoch.d * 100) / 100,
                    signal: this.getStochasticSignal(currentStoch)
                }
            };

        } catch (error) {
            console.error('Error calculando indicadores:', error);
            return {};
        }
    }

    identifySupportResistance(data) {
        try {
            const pivots = this.findPivotPoints(data);
            const supports = pivots.lows.sort((a, b) => b.strength - a.strength).slice(0, 3);
            const resistances = pivots.highs.sort((a, b) => b.strength - a.strength).slice(0, 3);

            return {
                supports: supports.map(s => ({
                    level: Math.round(s.price * 100) / 100,
                    strength: s.strength,
                    touches: s.touches
                })),
                resistances: resistances.map(r => ({
                    level: Math.round(r.price * 100) / 100,
                    strength: r.strength,
                    touches: r.touches
                })),
                keyLevel: this.findKeyLevel(data, supports, resistances)
            };

        } catch (error) {
            console.error('Error identificando soportes/resistencias:', error);
            return { supports: [], resistances: [], keyLevel: null };
        }
    }

    findPivotPoints(data, window = 5) {
        const highs = [];
        const lows = [];

        for (let i = window; i < data.length - window; i++) {
            const current = data[i];
            let isHigh = true;
            let isLow = true;

            // Verificar si es un máximo local
            for (let j = i - window; j <= i + window; j++) {
                if (j !== i && data[j].high >= current.high) {
                    isHigh = false;
                }
                if (j !== i && data[j].low <= current.low) {
                    isLow = false;
                }
            }

            if (isHigh) {
                const strength = this.calculatePivotStrength(data, i, 'high');
                highs.push({
                    index: i,
                    price: current.high,
                    strength: strength,
                    touches: this.countTouches(data, current.high, 0.002)
                });
            }

            if (isLow) {
                const strength = this.calculatePivotStrength(data, i, 'low');
                lows.push({
                    index: i,
                    price: current.low,
                    strength: strength,
                    touches: this.countTouches(data, current.low, 0.002)
                });
            }
        }

        return { highs, lows };
    }

    calculatePivotStrength(data, index, type) {
        let strength = 1;
        const current = data[index];
        const price = type === 'high' ? current.high : current.low;

        // Fuerza basada en volumen
        const avgVolume = data.slice(Math.max(0, index - 10), index + 10)
            .reduce((sum, d) => sum + d.volume, 0) / 20;
        if (current.volume > avgVolume * 1.5) strength += 2;

        // Fuerza basada en tiempo
        const age = data.length - index;
        if (age > 50) strength += 1;

        return strength;
    }

    countTouches(data, level, tolerance) {
        let touches = 0;
        for (const candle of data) {
            if (Math.abs(candle.high - level) / level < tolerance ||
                Math.abs(candle.low - level) / level < tolerance) {
                touches++;
            }
        }
        return touches;
    }

    analyzePriceAction(data) {
        try {
            const recent = data.slice(-10);
            const current = data[data.length - 1];
            const previous = data[data.length - 2];

            // Tendencia reciente
            const trend = this.identifyTrend(recent);
            
            // Momentum
            const momentum = this.calculateMomentum(recent);
            
            // Patrones de velas
            const candlePattern = this.identifyCandlePatterns(data.slice(-5));
            
            // Breakouts
            const breakout = this.detectBreakout(data);

            return {
                trend: trend,
                momentum: momentum,
                candlePattern: candlePattern,
                breakout: breakout,
                volatility: this.calculateVolatility(recent),
                bodySize: Math.abs(current.close - current.open) / current.open,
                wickAnalysis: this.analyzeWicks(current)
            };

        } catch (error) {
            console.error('Error analizando acción del precio:', error);
            return {};
        }
    }

    identifyTrend(data) {
        const closes = data.map(d => d.close);
        const highs = data.map(d => d.high);
        const lows = data.map(d => d.low);

        // Tendencia de precios de cierre
        const closeTrend = closes[closes.length - 1] > closes[0] ? 'UP' : 'DOWN';
        
        // Tendencia de máximos y mínimos
        const highTrend = highs.slice(-3).every((h, i, arr) => i === 0 || h >= arr[i-1]) ? 'UP' : 'DOWN';
        const lowTrend = lows.slice(-3).every((l, i, arr) => i === 0 || l >= arr[i-1]) ? 'UP' : 'DOWN';

        if (closeTrend === 'UP' && highTrend === 'UP' && lowTrend === 'UP') return 'STRONG_UPTREND';
        if (closeTrend === 'DOWN' && highTrend === 'DOWN' && lowTrend === 'DOWN') return 'STRONG_DOWNTREND';
        if (closeTrend === 'UP') return 'UPTREND';
        if (closeTrend === 'DOWN') return 'DOWNTREND';
        return 'SIDEWAYS';
    }

    calculateMomentum(data) {
        const closes = data.map(d => d.close);
        const momentum = (closes[closes.length - 1] - closes[0]) / closes[0] * 100;
        
        if (momentum > 2) return 'STRONG_BULLISH';
        if (momentum > 0.5) return 'BULLISH';
        if (momentum < -2) return 'STRONG_BEARISH';
        if (momentum < -0.5) return 'BEARISH';
        return 'NEUTRAL';
    }

    identifyCandlePatterns(data) {
        if (data.length < 3) return 'INSUFFICIENT_DATA';

        const current = data[data.length - 1];
        const previous = data[data.length - 2];
        const before = data[data.length - 3];

        // Doji
        if (Math.abs(current.close - current.open) / (current.high - current.low) < 0.1) {
            return 'DOJI';
        }

        // Hammer/Hanging Man
        const bodySize = Math.abs(current.close - current.open);
        const lowerWick = Math.min(current.open, current.close) - current.low;
        const upperWick = current.high - Math.max(current.open, current.close);

        if (lowerWick > bodySize * 2 && upperWick < bodySize * 0.5) {
            return current.close > current.open ? 'HAMMER' : 'HANGING_MAN';
        }

        // Engulfing
        if (previous.close > previous.open && current.close < current.open &&
            current.open > previous.close && current.close < previous.open) {
            return 'BEARISH_ENGULFING';
        }

        if (previous.close < previous.open && current.close > current.open &&
            current.open < previous.close && current.close > previous.open) {
            return 'BULLISH_ENGULFING';
        }

        return 'NO_PATTERN';
    }

    analyzeVolume(data) {
        try {
            const volumes = data.map(d => d.volume);
            const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
            const currentVolume = volumes[volumes.length - 1];
            const volumeRatio = currentVolume / avgVolume;

            let analysis = 'NORMAL';
            if (volumeRatio > 2) analysis = 'VERY_HIGH';
            else if (volumeRatio > 1.5) analysis = 'HIGH';
            else if (volumeRatio < 0.5) analysis = 'LOW';

            return {
                current: Math.round(currentVolume),
                average: Math.round(avgVolume),
                ratio: Math.round(volumeRatio * 100) / 100,
                analysis: analysis,
                trend: this.getVolumeTrend(volumes.slice(-5))
            };

        } catch (error) {
            return { analysis: 'ERROR' };
        }
    }

    getVolumeTrend(volumes) {
        if (volumes.length < 3) return 'INSUFFICIENT_DATA';
        
        const recent = volumes.slice(-3);
        if (recent.every((v, i) => i === 0 || v >= recent[i-1])) return 'INCREASING';
        if (recent.every((v, i) => i === 0 || v <= recent[i-1])) return 'DECREASING';
        return 'MIXED';
    }

    detectPatterns(data) {
        // Implementar detección de patrones chartistas
        return {
            triangles: this.detectTriangles(data),
            channels: this.detectChannels(data),
            headAndShoulders: this.detectHeadAndShoulders(data),
            doubleTopBottom: this.detectDoubleTopBottom(data)
        };
    }

    calculateConfluences(analysis) {
        let bullishSignals = 0;
        let bearishSignals = 0;
        const confluences = [];

        // RSI
        if (analysis.indicators.rsi.value < 30) {
            bearishSignals++;
            confluences.push('RSI Oversold');
        } else if (analysis.indicators.rsi.value > 70) {
            bullishSignals++;
            confluences.push('RSI Overbought');
        }

        // MACD
        if (analysis.indicators.macd.trend === 'BULLISH') {
            bullishSignals++;
            confluences.push('MACD Bullish');
        } else {
            bearishSignals++;
            confluences.push('MACD Bearish');
        }

        // Bollinger Bands
        if (analysis.indicators.bollinger.position === 'BELOW_LOWER') {
            bullishSignals++;
            confluences.push('BB Oversold');
        } else if (analysis.indicators.bollinger.position === 'ABOVE_UPPER') {
            bearishSignals++;
            confluences.push('BB Overbought');
        }

        // Price Action
        if (analysis.priceAction.trend.includes('UP')) {
            bullishSignals++;
            confluences.push('Uptrend');
        } else if (analysis.priceAction.trend.includes('DOWN')) {
            bearishSignals++;
            confluences.push('Downtrend');
        }

        return {
            bullish: bullishSignals,
            bearish: bearishSignals,
            total: bullishSignals + bearishSignals,
            list: confluences
        };
    }

    generatePrediction(analysis) {
        try {
            const confluences = analysis.confluences;
            let confidence = 0;
            let direction = 'NEUTRAL';
            let reasoning = [];

            // Calcular confianza basada en confluencias
            const totalSignals = confluences.bullish + confluences.bearish;
            const dominantSignals = Math.max(confluences.bullish, confluences.bearish);
            
            if (totalSignals > 0) {
                confidence = Math.round((dominantSignals / totalSignals) * 100);
                direction = confluences.bullish > confluences.bearish ? 'LONG' : 'SHORT';
            }

            // Ajustar confianza por fuerza de indicadores
            if (analysis.indicators.rsi.strength === 'STRONG') confidence += 10;
            if (analysis.indicators.macd.strength === 'STRONG') confidence += 10;
            if (analysis.priceAction.momentum.includes('STRONG')) confidence += 15;
            if (analysis.volumeAnalysis.analysis === 'VERY_HIGH') confidence += 10;

            // Penalizar por señales mixtas
            if (Math.abs(confluences.bullish - confluences.bearish) <= 1) {
                confidence -= 20;
            }

            // Limitar confianza
            confidence = Math.max(0, Math.min(100, confidence));

            // Generar razonamiento
            reasoning = confluences.list;

            return {
                direction: confidence < 60 ? 'NEUTRAL' : direction,
                confidence: confidence,
                reasoning: reasoning.join(', ')
            };

        } catch (error) {
            console.error('Error generando predicción:', error);
            return {
                direction: 'NEUTRAL',
                confidence: 0,
                reasoning: 'Error en análisis'
            };
        }
    }

    calculateTradingLevels(analysis) {
        try {
            const currentPrice = analysis.currentPrice;
            const supports = analysis.supportResistance.supports;
            const resistances = analysis.supportResistance.resistances;

            let entry, stopLoss, takeProfit;

            if (analysis.direction === 'LONG') {
                entry = currentPrice * 0.999; // Entrada ligeramente por debajo
                stopLoss = supports.length > 0 ? supports[0].level * 0.995 : currentPrice * 0.98;
                takeProfit = resistances.length > 0 ? resistances[0].level * 0.995 : currentPrice * 1.03;
            } else if (analysis.direction === 'SHORT') {
                entry = currentPrice * 1.001; // Entrada ligeramente por encima
                stopLoss = resistances.length > 0 ? resistances[0].level * 1.005 : currentPrice * 1.02;
                takeProfit = supports.length > 0 ? supports[0].level * 1.005 : currentPrice * 0.97;
            } else {
                return null;
            }

            const riskReward = Math.abs(takeProfit - entry) / Math.abs(entry - stopLoss);

            return {
                entry: Math.round(entry * 100) / 100,
                stopLoss: Math.round(stopLoss * 100) / 100,
                takeProfit: Math.round(takeProfit * 100) / 100,
                riskReward: Math.round(riskReward * 100) / 100
            };

        } catch (error) {
            return null;
        }
    }

    // Métodos auxiliares
    getRSISignal(rsi) {
        if (rsi < 30) return 'OVERSOLD';
        if (rsi > 70) return 'OVERBOUGHT';
        return 'NEUTRAL';
    }

    getRSIStrength(rsi) {
        if (rsi < 20 || rsi > 80) return 'STRONG';
        if (rsi < 30 || rsi > 70) return 'MODERATE';
        return 'WEAK';
    }

    getBollingerPosition(price, bb) {
        if (price > bb.upper) return 'ABOVE_UPPER';
        if (price < bb.lower) return 'BELOW_LOWER';
        if (price > bb.middle) return 'UPPER_HALF';
        return 'LOWER_HALF';
    }

    getEMAAlignment(ema9, ema21, ema50) {
        const current9 = ema9[ema9.length - 1];
        const current21 = ema21[ema21.length - 1];
        const current50 = ema50[ema50.length - 1];

        if (current9 > current21 && current21 > current50) return 'BULLISH';
        if (current9 < current21 && current21 < current50) return 'BEARISH';
        return 'MIXED';
    }

    getStochasticSignal(stoch) {
        if (stoch.k < 20 && stoch.d < 20) return 'OVERSOLD';
        if (stoch.k > 80 && stoch.d > 80) return 'OVERBOUGHT';
        return 'NEUTRAL';
    }

    calculateVolatility(data) {
        const returns = [];
        for (let i = 1; i < data.length; i++) {
            returns.push((data[i].close - data[i-1].close) / data[i-1].close);
        }
        
        const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
        
        return Math.sqrt(variance) * 100;
    }

    analyzeWicks(candle) {
        const bodySize = Math.abs(candle.close - candle.open);
        const upperWick = candle.high - Math.max(candle.open, candle.close);
        const lowerWick = Math.min(candle.open, candle.close) - candle.low;
        
        return {
            upperWick: upperWick,
            lowerWick: lowerWick,
            bodySize: bodySize,
            upperWickRatio: bodySize > 0 ? upperWick / bodySize : 0,
            lowerWickRatio: bodySize > 0 ? lowerWick / bodySize : 0
        };
    }

    // Métodos de detección de patrones (simplificados)
    detectTriangles(data) { return 'NONE'; }
    detectChannels(data) { return 'NONE'; }
    detectHeadAndShoulders(data) { return 'NONE'; }
    detectDoubleTopBottom(data) { return 'NONE'; }
    detectBreakout(data) { return 'NONE'; }
    findKeyLevel(data, supports, resistances) { return null; }
}

module.exports = TechnicalAnalyzer;
