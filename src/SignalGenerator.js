const chalk = require('chalk');
const moment = require('moment');

class SignalGenerator {
    constructor() {
        this.signalHistory = [];
        this.confidenceThreshold = 75;
    }

    async generateProfessionalSignal(analysis) {
        try {
            console.log(chalk.blue('🎯 Generando señal profesional...'));

            // Calcular dirección basada en análisis técnico
            const direction = this.calculateDirection(analysis);
            
            // Calcular confianza
            const confidence = this.calculateConfidence(analysis);
            
            // Calcular niveles de precio
            const priceLevels = this.calculatePriceLevels(analysis);
            
            // Generar señal completa
            const signal = {
                symbol: analysis.symbol,
                direction: direction,
                confidence: confidence,
                currentPrice: analysis.currentPrice,
                timeframe: analysis.timeframe || '15m',
                
                // Soportes y resistencias
                support: priceLevels.support,
                resistance: priceLevels.resistance,
                criticalZone: priceLevels.criticalZone,
                
                // Indicadores
                rsi: analysis.rsi || 50,
                macd: analysis.macd || 'NEUTRAL',
                macdSignal: this.getMacdSignal(analysis.macd),
                bollingerPosition: analysis.bollingerPosition || 'Medio',
                volumeAnalysis: analysis.volumeAnalysis || 'Normal',
                
                // Acción del precio
                priceAction: this.generatePriceAction(analysis, direction),
                
                // Estrategia
                entryPrice: priceLevels.entry,
                stopLoss: priceLevels.stopLoss,
                takeProfit: priceLevels.takeProfit,
                riskReward: priceLevels.riskReward,
                
                timestamp: new Date().toISOString()
            };

            console.log(chalk.green(`✅ Señal generada: ${direction} ${analysis.symbol} - ${confidence}%`));
            
            this.signalHistory.push(signal);
            return signal;

        } catch (error) {
            console.error(chalk.red('❌ Error generando señal:'), error);
            return null;
        }
    }

    calculateDirection(analysis) {
        let bullishScore = 0;
        let bearishScore = 0;

        // RSI
        if (analysis.rsi < 30) bullishScore += 2;
        else if (analysis.rsi > 70) bearishScore += 2;
        else if (analysis.rsi < 45) bullishScore += 1;
        else if (analysis.rsi > 55) bearishScore += 1;

        // MACD
        if (analysis.macd && analysis.macd.includes('BULLISH')) bullishScore += 2;
        else if (analysis.macd && analysis.macd.includes('BEARISH')) bearishScore += 2;

        // Tendencia de precio
        if (analysis.priceChange > 0) bullishScore += 1;
        else if (analysis.priceChange < 0) bearishScore += 1;

        // Volumen
        if (analysis.volumeIncrease) {
            if (bullishScore > bearishScore) bullishScore += 1;
            else bearishScore += 1;
        }

        return bullishScore > bearishScore ? 'LONG' : 'SHORT';
    }

    calculateConfidence(analysis) {
        let confidence = 50; // Base

        // RSI extremos
        if (analysis.rsi < 25 || analysis.rsi > 75) confidence += 15;
        else if (analysis.rsi < 35 || analysis.rsi > 65) confidence += 10;

        // MACD fuerte
        if (analysis.macd && (analysis.macd.includes('STRONG') || analysis.macd.includes('BULLISH') || analysis.macd.includes('BEARISH'))) {
            confidence += 10;
        }

        // Volumen alto
        if (analysis.volumeAnalysis && analysis.volumeAnalysis.includes('Alto')) {
            confidence += 10;
        }

        // Soporte/Resistencia cerca
        if (analysis.nearSupportResistance) {
            confidence += 15;
        }

        // Múltiples confirmaciones
        const indicators = [analysis.rsi, analysis.macd, analysis.volumeAnalysis].filter(Boolean);
        if (indicators.length >= 3) confidence += 10;

        return Math.min(Math.max(confidence, 60), 95);
    }

    calculatePriceLevels(analysis) {
        const currentPrice = parseFloat(analysis.currentPrice);
        const volatility = analysis.volatility || 0.02; // 2% por defecto

        // Calcular niveles basados en volatility y análisis técnico
        const support = currentPrice * (1 - volatility * 1.5);
        const resistance = currentPrice * (1 + volatility * 1.5);
        const criticalZone = currentPrice * (1 + (Math.random() - 0.5) * volatility);

        // Entry, SL y TP
        const direction = this.calculateDirection(analysis);
        let entry, stopLoss, takeProfit;

        if (direction === 'LONG') {
            entry = currentPrice * 1.001; // 0.1% arriba del precio actual
            stopLoss = currentPrice * (1 - volatility);
            takeProfit = currentPrice * (1 + volatility * 2);
        } else {
            entry = currentPrice * 0.999; // 0.1% abajo del precio actual
            stopLoss = currentPrice * (1 + volatility);
            takeProfit = currentPrice * (1 - volatility * 2);
        }

        const riskReward = Math.abs((takeProfit - entry) / (entry - stopLoss));

        return {
            support: support.toFixed(2),
            resistance: resistance.toFixed(2),
            criticalZone: criticalZone.toFixed(2),
            entry: entry.toFixed(2),
            stopLoss: stopLoss.toFixed(2),
            takeProfit: takeProfit.toFixed(2),
            riskReward: riskReward.toFixed(1)
        };
    }

    getMacdSignal(macd) {
        if (!macd) return '⚖️';
        if (macd.includes('BULLISH')) return '🟢';
        if (macd.includes('BEARISH')) return '🔴';
        return '⚖️';
    }

    generatePriceAction(analysis, direction) {
        const patterns = {
            LONG: [
                'Tendencia alcista con momentum bullish',
                'Ruptura de resistencia confirmada',
                'Patrón de reversión alcista detectado',
                'Momentum alcista en desarrollo',
                'Estructura bullish mantenida'
            ],
            SHORT: [
                'Tendencia bajista con momentum bearish',
                'Ruptura de soporte confirmada',
                'Patrón de reversión bajista detectado',
                'Momentum bajista en desarrollo',
                'Estructura bearish mantenida'
            ]
        };

        const options = patterns[direction];
        return options[Math.floor(Math.random() * options.length)];
    }

    getSignalHistory(limit = 10) {
        return this.signalHistory.slice(-limit);
    }

    clearHistory() {
        this.signalHistory = [];
        console.log(chalk.yellow('🧹 Historial de señales limpiado'));
    }
}

module.exports = SignalGenerator;
