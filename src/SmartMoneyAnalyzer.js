const chalk = require('chalk');

class SmartMoneyAnalyzer {
    constructor() {
        this.name = 'SmartMoneyAnalyzer';
    }

    async performSmartMoneyAnalysis(symbol, marketData, signalInfo) {
        try {
            console.log(chalk.blue(`⚡ Análisis Smart Money para ${symbol}...`));
            
            const currentPrice = parseFloat(marketData.price);
            const volume24h = parseFloat(marketData.volume);
            const priceChange24h = parseFloat(marketData.priceChangePercent);
            
            // Análisis de Smart Money
            const smartMoneyScore = this.calculateSmartMoneyScore(marketData);
            
            // Análisis de Soportes y Resistencias
            const supportResistance = this.calculateSupportResistance(currentPrice, signalInfo);
            
            // Análisis de Momentum
            const momentum = this.calculateMomentum(marketData);
            
            // Análisis de Volumen
            const volumeAnalysis = this.analyzeVolume(volume24h, priceChange24h);
            
            return {
                symbol,
                currentPrice,
                smartMoneyScore,
                supportResistance,
                momentum,
                volumeAnalysis,
                priceChange24h,
                volume24h,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error(chalk.red('❌ Error en análisis Smart Money:'), error);
            return null;
        }
    }

    calculateSmartMoneyScore(marketData) {
        let score = 0;
        const currentPrice = parseFloat(marketData.price);
        const volume = parseFloat(marketData.volume);
        const priceChange = parseFloat(marketData.priceChangePercent);
        
        // Volumen alto + precio estable = Smart Money acumulando
        if (volume > 1000000 && Math.abs(priceChange) < 2) {
            score += 2;
        }
        
        // Volumen muy alto + movimiento direccional = Smart Money moviendo
        if (volume > 5000000 && Math.abs(priceChange) > 3) {
            score += 3;
        }
        
        // Precio cerca de números redondos (zonas psicológicas)
        const roundNumbers = [0.001, 0.01, 0.1, 1, 10, 100, 1000];
        for (const round of roundNumbers) {
            if (Math.abs(currentPrice - round) / round < 0.05) {
                score += 1;
                break;
            }
        }
        
        return Math.min(score, 5); // Máximo 5 puntos
    }

    calculateSupportResistance(currentPrice, signalInfo) {
        const analysis = {
            nearSupport: false,
            nearResistance: false,
            supportLevel: null,
            resistanceLevel: null,
            riskLevel: 'MEDIUM'
        };

        if (signalInfo.entryPrices && signalInfo.entryPrices.length > 0) {
            const avgEntry = signalInfo.entryPrices.reduce((a, b) => a + b, 0) / signalInfo.entryPrices.length;
            
            // Calcular distancia al precio de entrada
            const distanceToEntry = Math.abs(currentPrice - avgEntry) / avgEntry;
            
            if (distanceToEntry < 0.01) { // Menos del 1%
                analysis.nearSupport = signalInfo.direction === 'LONG';
                analysis.nearResistance = signalInfo.direction === 'SHORT';
                analysis.riskLevel = 'LOW';
            } else if (distanceToEntry > 0.05) { // Más del 5%
                analysis.riskLevel = 'HIGH';
            }
            
            // Establecer niveles basados en la señal
            if (signalInfo.direction === 'LONG') {
                analysis.supportLevel = signalInfo.stopLoss || avgEntry * 0.95;
                analysis.resistanceLevel = signalInfo.takeProfits?.[0]?.price || avgEntry * 1.1;
            } else {
                analysis.resistanceLevel = signalInfo.stopLoss || avgEntry * 1.05;
                analysis.supportLevel = signalInfo.takeProfits?.[0]?.price || avgEntry * 0.9;
            }
        }

        return analysis;
    }

    calculateMomentum(marketData) {
        const priceChange = parseFloat(marketData.priceChangePercent);
        const volume = parseFloat(marketData.volume);
        
        let momentum = 'NEUTRAL';
        let strength = 0;
        
        if (Math.abs(priceChange) > 5) {
            momentum = priceChange > 0 ? 'BULLISH' : 'BEARISH';
            strength = Math.min(Math.abs(priceChange) / 10, 1); // Normalizar a 0-1
        }
        
        // Ajustar por volumen
        if (volume > 1000000) {
            strength *= 1.5;
        }
        
        return {
            direction: momentum,
            strength: Math.min(strength, 1),
            reliable: volume > 500000
        };
    }

    analyzeVolume(volume24h, priceChange24h) {
        let analysis = 'NORMAL';
        let significance = 'LOW';
        
        if (volume24h > 10000000) {
            analysis = 'VERY_HIGH';
            significance = 'HIGH';
        } else if (volume24h > 5000000) {
            analysis = 'HIGH';
            significance = 'MEDIUM';
        } else if (volume24h > 1000000) {
            analysis = 'MEDIUM';
            significance = 'MEDIUM';
        }
        
        // Volumen alto con poco movimiento = Acumulación/Distribución
        if (volume24h > 5000000 && Math.abs(priceChange24h) < 2) {
            analysis += '_ACCUMULATION';
        }
        
        return {
            level: analysis,
            significance,
            volume24h
        };
    }

    makeInstantDecision(analysis, signalInfo) {
        if (!analysis) {
            return {
                action: 'ESPERAR',
                reason: 'Error en análisis',
                confidence: 0,
                waitRecommendation: 'Esperar datos de mercado válidos'
            };
        }

        let confidence = 50; // Base
        let action = 'ESPERAR';
        let reasons = [];
        let waitRecommendation = '';

        // Smart Money Score
        if (analysis.smartMoneyScore >= 4) {
            confidence += 20;
            reasons.push('Smart Money muy activo');
        } else if (analysis.smartMoneyScore >= 2) {
            confidence += 10;
            reasons.push('Smart Money moderado');
        }

        // Soporte/Resistencia
        if (analysis.supportResistance.riskLevel === 'LOW') {
            confidence += 15;
            reasons.push('Cerca de nivel clave');
        } else if (analysis.supportResistance.riskLevel === 'HIGH') {
            confidence -= 15;
            reasons.push('Lejos de niveles clave');
        }

        // Momentum
        if (analysis.momentum.reliable && analysis.momentum.strength > 0.7) {
            confidence += 15;
            reasons.push(`Momentum ${analysis.momentum.direction} fuerte`);
            
            // Alinear con la señal
            if (signalInfo.direction === 'LONG' && analysis.momentum.direction === 'BULLISH') {
                confidence += 10;
                reasons.push('Momentum alineado con señal');
            } else if (signalInfo.direction === 'SHORT' && analysis.momentum.direction === 'BEARISH') {
                confidence += 10;
                reasons.push('Momentum alineado con señal');
            } else {
                confidence -= 20;
                reasons.push('Momentum contrario a señal');
            }
        }

        // Volumen
        if (analysis.volumeAnalysis.significance === 'HIGH') {
            confidence += 10;
            reasons.push('Volumen muy alto');
        }

        // Decisión final - Solo ENTRAR si confianza >= 80%
        if (confidence >= 80) {
            action = `ENTRAR ${signalInfo.direction || 'DETECTAR'}`;
        } else {
            action = 'ESPERAR';
            if (confidence >= 60) {
                reasons.push('Confianza moderada - esperar mejor oportunidad');
            } else {
                reasons.push('Confianza insuficiente');
            }
            
            // Generar recomendación específica de qué esperar
            waitRecommendation = this.generateWaitRecommendation(analysis, signalInfo, confidence);
        }

        return {
            action,
            confidence: Math.min(confidence, 95),
            reasons,
            analysis,
            waitRecommendation
        };
    }

    generateWaitRecommendation(analysis, signalInfo, confidence) {
        const currentPrice = analysis.currentPrice;
        const recommendations = [];

        // Solo dar recomendaciones específicas para 70-79% de confianza
        if (confidence < 70) {
            return 'Esperar mejores condiciones de mercado';
        }

        // Mensaje específico solo para señales casi listas (70-79%)
        let projectedConfidence = Math.min(confidence + 15, 95); // Proyectar +15% al cumplirse
        let confidenceMessage = ``; // Sin mensaje inicial, directo al precio

        // Basado en soporte/resistencia con precios exactos
        if (analysis.supportResistance.supportLevel && analysis.supportResistance.resistanceLevel) {
            const support = analysis.supportResistance.supportLevel;
            const resistance = analysis.supportResistance.resistanceLevel;
            const distanceToSupport = Math.abs(currentPrice - support) / support * 100;
            const distanceToResistance = Math.abs(currentPrice - resistance) / resistance * 100;
            
            if (signalInfo.direction === 'LONG') {
                if (currentPrice > support * 1.02) {
                    // Precio está arriba del soporte, esperar rebote
                    recommendations.push(`Esperar precio llegue a $${support.toFixed(4)} (soporte) y rebote → ENTRAR LONG (confianza ${projectedConfidence}%)`);
                } else {
                    // Precio está cerca de resistencia, esperar ruptura
                    recommendations.push(`Esperar precio rompa $${resistance.toFixed(4)} (resistencia) con volumen → ENTRAR LONG (confianza ${projectedConfidence}%)`);
                }
            } else if (signalInfo.direction === 'SHORT') {
                if (currentPrice < resistance * 0.98) {
                    // Precio está abajo de resistencia, esperar rechazo
                    recommendations.push(`Esperar precio llegue a $${resistance.toFixed(4)} (resistencia) y sea rechazado → ENTRAR SHORT (confianza ${projectedConfidence}%)`);
                } else {
                    // Precio está cerca de soporte, esperar ruptura
                    recommendations.push(`Esperar precio rompa $${support.toFixed(4)} (soporte) con volumen → ENTRAR SHORT (confianza ${projectedConfidence}%)`);
                }
            }
        }

        // Basado en momentum con especificidad
        if (analysis.momentum.direction === 'NEUTRAL') {
            const direction = signalInfo.direction === 'LONG' ? 'alcista' : 'bajista';
            const currentMomentum = (analysis.momentum.strength * 100).toFixed(0);
            recommendations.push(`momentum ${direction} >70% (actual ${currentMomentum}%) → ENTRAR ${signalInfo.direction} (confianza ${projectedConfidence}%)`);
        } else if (analysis.momentum.strength < 0.5) {
            const currentMomentum = (analysis.momentum.strength * 100).toFixed(0);
            const targetMomentum = signalInfo.direction === 'LONG' ? '75%' : '75%';
            recommendations.push(`momentum fortalezca a ${targetMomentum} (actual ${currentMomentum}%) → ENTRAR ${signalInfo.direction} (confianza ${projectedConfidence}%)`);
        }

        // Basado en volumen con números específicos
        if (analysis.volumeAnalysis.significance === 'LOW') {
            const currentVolume = (analysis.volumeAnalysis.volume24h / 1000000).toFixed(1);
            recommendations.push(`volumen >5M USDT (actual ${currentVolume}M) con movimiento direccional → ENTRAR ${signalInfo.direction} (confianza ${projectedConfidence}%)`);
        }

        // Basado en Smart Money con score específico
        if (analysis.smartMoneyScore < 2) {
            recommendations.push(`Smart Money score ≥3 (actual ${analysis.smartMoneyScore}/5) con acumulación → ENTRAR ${signalInfo.direction} (confianza ${projectedConfidence}%)`);
        }

        // Recomendaciones específicas por precio de entrada
        const entryPrice = signalInfo.entryPrices?.[0];
        if (entryPrice) {
            const distanceToEntry = Math.abs(currentPrice - entryPrice) / entryPrice * 100;
            if (distanceToEntry > 3) {
                const direction = currentPrice > entryPrice ? 'baje' : 'suba';
                recommendations.push(`precio ${direction} a zona de entrada $${entryPrice.toFixed(4)} (${distanceToEntry.toFixed(1)}% de distancia) → ENTRAR ${signalInfo.direction} (confianza ${projectedConfidence}%)`);
            }
        }

        // Si no hay recomendaciones específicas, crear una basada en precio actual
        if (recommendations.length === 0) {
            const entryPrice = signalInfo.entryPrices?.[0] || currentPrice;
            if (signalInfo.direction === 'LONG') {
                const targetPrice = (entryPrice * 0.98).toFixed(4); // 2% abajo para entrada
                recommendations.push(`Esperar precio llegue a $${targetPrice} (zona de entrada) → ENTRAR LONG (confianza ${projectedConfidence}%)`);
            } else {
                const targetPrice = (entryPrice * 1.02).toFixed(4); // 2% arriba para entrada
                recommendations.push(`Esperar precio llegue a $${targetPrice} (zona de entrada) → ENTRAR SHORT (confianza ${projectedConfidence}%)`);
            }
        }

        // Formatear la recomendación final con acción clara
        let finalRecommendation = confidenceMessage;
        if (recommendations.length === 1) {
            finalRecommendation += recommendations[0];
        } else if (recommendations.length === 2) {
            finalRecommendation += `${recommendations[0]} O ${recommendations[1]}`;
        } else {
            finalRecommendation += `${recommendations.slice(0, -1).join(' O ')} O ${recommendations[recommendations.length - 1]}`;
        }

        return finalRecommendation;
    }
}

module.exports = SmartMoneyAnalyzer;
