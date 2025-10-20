const axios = require('axios');
const crypto = require('crypto');

class AutoTrader {
    constructor(apiKey, secretKey, logger) {
        this.apiKey = apiKey;
        this.secretKey = secretKey;
        this.logger = logger;
        this.baseURL = 'https://fapi.binance.com';
        
        // CONFIGURACIÓN INTELIGENTE ACTUALIZADA
        this.config = {
            MIN_CONFIDENCE: 80,           // Mínimo 80% confianza IA (selectivo)
            POSITION_SIZE_USD: 0.85,      // $0.85 USD por operación (inteligente)
            LEVERAGE: 'DYNAMIC',          // Apalancamiento dinámico según activo
            STOP_LOSS_DYNAMIC: true,      // SL según análisis IA
            TAKE_PROFIT_DYNAMIC: true,    // TP según análisis IA
            MAX_DAILY_TRADES: 5,          // Máximo 5 operaciones por día (conservador)
            MAX_OPEN_POSITIONS: 2,        // Máximo 2 posiciones abiertas (seguro)
            TRADING_ENABLED: false,       // Estado actual (se mantiene)
            USE_INTELLIGENT_SIZING: true  // Usar sistema inteligente Binance API
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
            
            const config = {
                method,
                url: `${this.baseURL}${endpoint}`,
                headers: {
                    'X-MBX-APIKEY': this.apiKey
                },
                params: {
                    ...params,
                    timestamp,
                    signature
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
            
            // Ajustar a step size y redondear correctamente
            let adjustedQty = Math.max(minQty, Math.floor(quantity / stepSize) * stepSize);
            
            // Redondear según la precisión del step size
            const decimals = stepSize.toString().split('.')[1]?.length || 0;
            adjustedQty = parseFloat(adjustedQty.toFixed(decimals));
            
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

    // Configurar apalancamiento para el símbolo
    async setLeverage(symbol) {
        try {
            await this.makeRequest('/fapi/v1/leverage', {
                symbol,
                leverage: this.config.LEVERAGE
            }, 'POST');
            
            this.logger.info(`⚡ Apalancamiento configurado: ${symbol} = ${this.config.LEVERAGE}x`);
        } catch (error) {
            this.logger.warn(`⚠️ Error configurando apalancamiento para ${symbol}:`, error.message);
            // No es crítico, continúa con la operación
        }
    }

    // Ejecutar orden de mercado
    async executeMarketOrder(symbol, side, quantity, confidence) {
        try {
            if (!this.checkSafetyLimits()) {
                return null;
            }

            // Configurar apalancamiento primero
            await this.setLeverage(symbol);

            this.logger.info(`🚀 Ejecutando orden: ${side} ${quantity} ${symbol} (Confianza: ${confidence}%) - Apalancamiento: ${this.config.LEVERAGE}x`);

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

    // 🚀 EJECUTAR TRADE CON SISTEMA INTELIGENTE
    async executeTrade(tradeConfig) {
        try {
            const { symbol, side, quantity, price, stopLoss, takeProfit, leverage, targetUSD } = tradeConfig;
            
            this.logger.info(`🚀 EJECUTANDO TRADE INTELIGENTE: ${side} ${quantity} ${symbol}`);
            this.logger.info(`💰 Valor: $${targetUSD} USD con ${leverage}x leverage`);
            
            if (!this.checkSafetyLimits()) {
                return null;
            }

            // 1. Configurar apalancamiento dinámico
            await this.setDynamicLeverage(symbol, leverage);

            // 2. Ejecutar orden de mercado
            const timestamp = Date.now();
            const orderParams = {
                symbol: symbol,
                side: side,
                type: 'MARKET',
                quantity: quantity.toString(),
                timestamp: timestamp
            };

            const orderQueryString = new URLSearchParams(orderParams).toString();
            const orderSignature = this.generateSignature(orderQueryString);
            
            const orderResponse = await axios.post(`${this.baseURL}/fapi/v1/order`, 
                orderQueryString + `&signature=${orderSignature}`, {
                headers: {
                    'X-MBX-APIKEY': this.apiKey,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            
            const order = orderResponse.data;
            
            if (order.status === 'FILLED') {
                this.dailyTrades++;
                const entryPrice = parseFloat(order.avgPrice || order.price);
                
                this.openPositions.set(symbol, {
                    orderId: order.orderId,
                    side,
                    quantity,
                    entryPrice,
                    stopLoss,
                    takeProfit,
                    leverage,
                    targetUSD,
                    timestamp: new Date()
                });

                this.logger.info(`✅ Orden ejecutada: ${order.orderId} - Entry: $${entryPrice}`);
                
                // 3. Configurar SL/TP dinámicos según IA
                this.logger.info(`🛡️ CONFIGURANDO SL/TP: SL=$${stopLoss} TP=$${takeProfit}`);
                await this.setDynamicStopLossAndTakeProfit(symbol, side, entryPrice, stopLoss, takeProfit, quantity);
                this.logger.info(`✅ SL/TP configuración completada para ${symbol}`);
                
                return order;
            }

            return null;
        } catch (error) {
            this.logger.error(`❌ Error ejecutando trade inteligente:`, error.message);
            return null;
        }
    }

    // 🎯 CONFIGURAR APALANCAMIENTO DINÁMICO
    async setDynamicLeverage(symbol, leverage) {
        try {
            const timestamp = Date.now();
            const params = {
                symbol: symbol,
                leverage: leverage,
                timestamp: timestamp
            };
            
            const queryString = new URLSearchParams(params).toString();
            const signature = this.generateSignature(queryString);
            
            const response = await axios.post(`${this.baseURL}/fapi/v1/leverage`, 
                queryString + `&signature=${signature}`, {
                headers: {
                    'X-MBX-APIKEY': this.apiKey,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            
            this.logger.info(`⚡ Apalancamiento configurado: ${symbol} = ${leverage}x`);
            return response.data;
        } catch (error) {
            this.logger.warn(`⚠️ Error configurando leverage ${leverage}x para ${symbol}:`, error.message);
        }
    }

    // 🛡️ CONFIGURAR SL/TP DINÁMICOS SEGÚN IA
    async setDynamicStopLossAndTakeProfit(symbol, side, entryPrice, stopLoss, takeProfit, quantity) {
        try {
            this.logger.info(`🔧 INICIANDO configuración SL/TP para ${symbol}`);
            this.logger.info(`📊 Parámetros: Side=${side}, Entry=$${entryPrice}, SL=$${stopLoss}, TP=$${takeProfit}, Qty=${quantity}`);
            
            const isLong = side === 'BUY';
            
            // Stop Loss según análisis IA
            if (stopLoss && stopLoss > 0) {
                try {
                    const timestamp = Date.now();
                    const slParams = {
                        symbol: symbol,
                        side: isLong ? 'SELL' : 'BUY',
                        type: 'STOP_MARKET',
                        quantity: quantity.toString(),
                        stopPrice: stopLoss.toString(),
                        reduceOnly: 'true',  // ✅ CRÍTICO: Solo para cerrar posición
                        timeInForce: 'GTC',  // ✅ Good Till Cancelled
                        timestamp: timestamp
                    };
                    
                    const slQueryString = new URLSearchParams(slParams).toString();
                    const slSignature = this.generateSignature(slQueryString);
                    
                    const slResponse = await axios.post(`${this.baseURL}/fapi/v1/order`, 
                        slQueryString + `&signature=${slSignature}`, {
                        headers: {
                            'X-MBX-APIKEY': this.apiKey,
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    });
                    
                    const slOrder = slResponse.data;
                    this.logger.info(`🛑 SL dinámico configurado: $${stopLoss} - OrderID: ${slOrder.orderId}`);
                    this.logger.info(`📊 SL Status: ${slOrder.status} - Type: ${slOrder.type}`);
                } catch (slError) {
                    this.logger.error(`❌ Error configurando SL: ${slError.message}`);
                    this.logger.error(`📊 SL Error details:`, slError.response?.data || slError);
                }
            }

            // Take Profit según análisis IA
            if (takeProfit && takeProfit > 0) {
                try {
                    const timestamp = Date.now();
                    const tpParams = {
                        symbol: symbol,
                        side: isLong ? 'SELL' : 'BUY',
                        type: 'TAKE_PROFIT_MARKET',
                        quantity: quantity.toString(),
                        stopPrice: takeProfit.toString(),
                        reduceOnly: 'true',  // ✅ CRÍTICO: Solo para cerrar posición
                        timeInForce: 'GTC',  // ✅ Good Till Cancelled
                        timestamp: timestamp
                    };
                    
                    const tpQueryString = new URLSearchParams(tpParams).toString();
                    const tpSignature = this.generateSignature(tpQueryString);
                    
                    const tpResponse = await axios.post(`${this.baseURL}/fapi/v1/order`, 
                        tpQueryString + `&signature=${tpSignature}`, {
                        headers: {
                            'X-MBX-APIKEY': this.apiKey,
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    });
                    
                    const tpOrder = tpResponse.data;
                    this.logger.info(`🎯 TP dinámico configurado: $${takeProfit} - OrderID: ${tpOrder.orderId}`);
                    this.logger.info(`📊 TP Status: ${tpOrder.status} - Type: ${tpOrder.type}`);
                } catch (tpError) {
                    this.logger.error(`❌ Error configurando TP: ${tpError.message}`);
                    this.logger.error(`📊 TP Error details:`, tpError.response?.data || tpError);
                }
            }

        } catch (error) {
            this.logger.error(`❌ Error configurando SL/TP dinámicos:`, error.message);
        }
    }

    // Habilitar/deshabilitar trading
    enableTrading(enabled = true) {
        this.config.TRADING_ENABLED = enabled;
        this.logger.info(`🔄 Trading automático ${enabled ? 'HABILITADO' : 'DESHABILITADO'}`);
    }

    // Obtener estadísticas actualizadas
    getStats() {
        return {
            tradingEnabled: this.config.TRADING_ENABLED,
            dailyTrades: this.dailyTrades,
            maxDailyTrades: this.config.MAX_DAILY_TRADES,
            openPositions: this.openPositions.size,
            maxOpenPositions: this.config.MAX_OPEN_POSITIONS,
            minConfidence: this.config.MIN_CONFIDENCE,
            positionSizeUSD: this.config.POSITION_SIZE_USD,
            leverage: this.config.LEVERAGE,
            useIntelligentSizing: this.config.USE_INTELLIGENT_SIZING,
            stopLossDynamic: this.config.STOP_LOSS_DYNAMIC,
            takeProfitDynamic: this.config.TAKE_PROFIT_DYNAMIC
        };
    }

    // Verificar si está habilitado
    isEnabled() {
        return this.config.TRADING_ENABLED;
    }
}

module.exports = AutoTrader;
