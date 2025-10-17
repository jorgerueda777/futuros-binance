const axios = require('axios');
const crypto = require('crypto');

class AutoTrader {
    constructor(apiKey, secretKey, logger) {
        this.apiKey = apiKey;
        this.secretKey = secretKey;
        this.logger = logger;
        this.baseURL = 'https://fapi.binance.com';
        
        // CONFIGURACIÓN DE SEGURIDAD
        this.config = {
            MIN_CONFIDENCE: 80,           // Mínimo 80% confianza
            POSITION_SIZE_USD: 1,         // $1 USD por operación
            STOP_LOSS_USD: 0.50,          // -$0.50 USD stop loss
            TAKE_PROFIT_USD: 1.00,        // +$1.00 USD take profit
            MAX_DAILY_TRADES: 10,         // Máximo 10 operaciones por día
            MAX_OPEN_POSITIONS: 3,        // Máximo 3 posiciones abiertas
            TRADING_ENABLED: false        // DESHABILITADO por defecto (SEGURIDAD)
        };
        
        this.dailyTrades = 0;
        this.openPositions = new Map();
        this.lastTradeDate = new Date().toDateString();
    }

    // Generar firma para Binance API
    generateSignature(queryString) {
        return crypto
            .createHmac('sha256', this.secretKey)
            .update(queryString)
            .digest('hex');
    }

    // Hacer request a Binance Futures API
    async makeRequest(endpoint, params = {}, method = 'GET') {
        try {
            const timestamp = Date.now();
            const queryString = new URLSearchParams({
                ...params,
                timestamp
            }).toString();
            
            const signature = this.generateSignature(queryString);
            const url = `${this.baseURL}${endpoint}?${queryString}&signature=${signature}`;
            
            const config = {
                method,
                url,
                headers: {
                    'X-MBX-APIKEY': this.apiKey
                }
            };
            
            const response = await axios(config);
            return response.data;
        } catch (error) {
            this.logger.error('❌ Error en Binance API:', error.response?.data || error.message);
            throw error;
        }
    }

    // Obtener información de la cuenta
    async getAccountInfo() {
        try {
            const accountInfo = await this.makeRequest('/fapi/v2/account');
            const balance = parseFloat(accountInfo.totalWalletBalance);
            
            this.logger.info(`💰 Balance total: $${balance.toFixed(2)} USDT`);
            return accountInfo;
        } catch (error) {
            this.logger.error('❌ Error obteniendo info de cuenta:', error.message);
            return null;
        }
    }

    // Obtener precio actual del símbolo
    async getCurrentPrice(symbol) {
        try {
            const ticker = await this.makeRequest('/fapi/v1/ticker/price', { symbol });
            return parseFloat(ticker.price);
        } catch (error) {
            this.logger.error(`❌ Error obteniendo precio de ${symbol}:`, error.message);
            return null;
        }
    }

    // Calcular cantidad mínima para $1 USD
    async calculateMinQuantity(symbol, priceUSD = null) {
        try {
            const price = priceUSD || await this.getCurrentPrice(symbol);
            if (!price) return null;

            // Obtener información del símbolo para decimales permitidos
            const exchangeInfo = await this.makeRequest('/fapi/v1/exchangeInfo');
            const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === symbol);
            
            if (!symbolInfo) {
                this.logger.error(`❌ Símbolo ${symbol} no encontrado`);
                return null;
            }

            // Calcular cantidad para $1 USD
            const quantity = this.config.POSITION_SIZE_USD / price;
            
            // Aplicar filtros de cantidad mínima
            const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
            const minQty = parseFloat(lotSizeFilter.minQty);
            const stepSize = parseFloat(lotSizeFilter.stepSize);
            
            // Ajustar a step size
            const adjustedQty = Math.max(minQty, Math.floor(quantity / stepSize) * stepSize);
            
            this.logger.info(`📊 ${symbol}: Precio $${price.toFixed(6)}, Cantidad: ${adjustedQty}`);
            return adjustedQty;
        } catch (error) {
            this.logger.error(`❌ Error calculando cantidad para ${symbol}:`, error.message);
            return null;
        }
    }

    // Verificar límites de seguridad
    checkSafetyLimits() {
        // Resetear contador diario
        const today = new Date().toDateString();
        if (this.lastTradeDate !== today) {
            this.dailyTrades = 0;
            this.lastTradeDate = today;
        }

        // Verificar límites
        if (!this.config.TRADING_ENABLED) {
            this.logger.warn('🚫 Trading automático DESHABILITADO por seguridad');
            return false;
        }

        if (this.dailyTrades >= this.config.MAX_DAILY_TRADES) {
            this.logger.warn(`🚫 Límite diario alcanzado: ${this.dailyTrades}/${this.config.MAX_DAILY_TRADES}`);
            return false;
        }

        if (this.openPositions.size >= this.config.MAX_OPEN_POSITIONS) {
            this.logger.warn(`🚫 Máximo de posiciones abiertas: ${this.openPositions.size}/${this.config.MAX_OPEN_POSITIONS}`);
            return false;
        }

        return true;
    }

    // Ejecutar orden de mercado
    async executeMarketOrder(symbol, side, quantity, confidence) {
        try {
            if (!this.checkSafetyLimits()) {
                return null;
            }

            this.logger.info(`🚀 Ejecutando orden: ${side} ${quantity} ${symbol} (Confianza: ${confidence}%)`);

            const orderParams = {
                symbol,
                side,
                type: 'MARKET',
                quantity: quantity.toString()
            };

            const order = await this.makeRequest('/fapi/v1/order', orderParams, 'POST');
            
            if (order.status === 'FILLED') {
                this.dailyTrades++;
                this.openPositions.set(symbol, {
                    orderId: order.orderId,
                    side,
                    quantity,
                    entryPrice: parseFloat(order.avgPrice || order.price),
                    confidence,
                    timestamp: new Date()
                });

                this.logger.info(`✅ Orden ejecutada: ${order.orderId}`);
                
                // Configurar Stop Loss y Take Profit
                await this.setStopLossAndTakeProfit(symbol, side, parseFloat(order.avgPrice || order.price));
                
                return order;
            }

            return null;
        } catch (error) {
            this.logger.error(`❌ Error ejecutando orden para ${symbol}:`, error.message);
            return null;
        }
    }

    // Configurar Stop Loss y Take Profit
    async setStopLossAndTakeProfit(symbol, side, entryPrice) {
        try {
            const position = this.openPositions.get(symbol);
            if (!position) return;

            // Calcular precios de SL y TP
            const isLong = side === 'BUY';
            const slPrice = isLong 
                ? entryPrice - (this.config.STOP_LOSS_USD / position.quantity)
                : entryPrice + (this.config.STOP_LOSS_USD / position.quantity);
                
            const tpPrice = isLong
                ? entryPrice + (this.config.TAKE_PROFIT_USD / position.quantity)
                : entryPrice - (this.config.TAKE_PROFIT_USD / position.quantity);

            // Stop Loss
            const slOrder = await this.makeRequest('/fapi/v1/order', {
                symbol,
                side: isLong ? 'SELL' : 'BUY',
                type: 'STOP_MARKET',
                quantity: position.quantity.toString(),
                stopPrice: slPrice.toFixed(6)
            }, 'POST');

            // Take Profit
            const tpOrder = await this.makeRequest('/fapi/v1/order', {
                symbol,
                side: isLong ? 'SELL' : 'BUY',
                type: 'TAKE_PROFIT_MARKET',
                quantity: position.quantity.toString(),
                stopPrice: tpPrice.toFixed(6)
            }, 'POST');

            this.logger.info(`🛑 SL configurado: $${slPrice.toFixed(6)} | 🎯 TP configurado: $${tpPrice.toFixed(6)}`);

        } catch (error) {
            this.logger.error(`❌ Error configurando SL/TP para ${symbol}:`, error.message);
        }
    }

    // Procesar señal de trading
    async processSignal(token, recommendation, confidence, analysis) {
        try {
            // Verificar confianza mínima
            if (confidence < this.config.MIN_CONFIDENCE) {
                this.logger.info(`⚠️ Confianza insuficiente para ${token}: ${confidence}% < ${this.config.MIN_CONFIDENCE}%`);
                return null;
            }

            // Verificar si ya tenemos posición abierta
            if (this.openPositions.has(token)) {
                this.logger.info(`⚠️ Ya existe posición abierta para ${token}`);
                return null;
            }

            const symbol = token.replace('USDT', '') + 'USDT';
            
            // Determinar dirección
            let side = null;
            if (recommendation.includes('LONG') || recommendation.includes('COMPRAR')) {
                side = 'BUY';
            } else if (recommendation.includes('SHORT') || recommendation.includes('VENDER')) {
                side = 'SELL';
            } else {
                this.logger.info(`⚠️ Señal no clara para ${token}: ${recommendation}`);
                return null;
            }

            // Calcular cantidad
            const quantity = await this.calculateMinQuantity(symbol);
            if (!quantity) {
                this.logger.error(`❌ No se pudo calcular cantidad para ${symbol}`);
                return null;
            }

            // Ejecutar orden
            const order = await this.executeMarketOrder(symbol, side, quantity, confidence);
            
            if (order) {
                this.logger.info(`🎉 TRADE AUTOMÁTICO EJECUTADO: ${side} ${symbol} - Confianza: ${confidence}%`);
                return order;
            }

            return null;
        } catch (error) {
            this.logger.error(`❌ Error procesando señal para ${token}:`, error.message);
            return null;
        }
    }

    // Habilitar/deshabilitar trading
    enableTrading(enabled = true) {
        this.config.TRADING_ENABLED = enabled;
        this.logger.info(`🔄 Trading automático ${enabled ? 'HABILITADO' : 'DESHABILITADO'}`);
    }

    // Obtener estadísticas
    getStats() {
        return {
            tradingEnabled: this.config.TRADING_ENABLED,
            dailyTrades: this.dailyTrades,
            maxDailyTrades: this.config.MAX_DAILY_TRADES,
            openPositions: this.openPositions.size,
            maxOpenPositions: this.config.MAX_OPEN_POSITIONS,
            minConfidence: this.config.MIN_CONFIDENCE
        };
    }
}

module.exports = AutoTrader;
