const axios = require('axios');
const crypto = require('crypto');
const chalk = require('chalk');

class BinanceAPI {
    constructor() {
        this.baseURL = 'https://api.binance.com';
        this.futuresURL = 'https://fapi.binance.com';
        this.apiKey = process.env.BINANCE_API_KEY;
        this.secretKey = process.env.BINANCE_SECRET_KEY;
        this.recvWindow = 5000;
    }

    async getMarketData(symbol) {
        try {
            console.log(chalk.blue(`📊 Obteniendo datos de mercado para ${symbol}`));

            // SOLO usar API de futuros
            const futuresResponse = await axios.get(`${this.futuresURL}/fapi/v1/ticker/24hr`, {
                params: { symbol: symbol },
                timeout: 10000
            });
            const ticker = futuresResponse.data;
            console.log(chalk.green(`✅ Datos obtenidos (futuros): ${symbol} - $${ticker.lastPrice}`));

            // Obtener orderbook de futuros
            const depthResponse = await axios.get(`${this.futuresURL}/fapi/v1/depth`, {
                params: { symbol: symbol, limit: 100 },
                timeout: 10000
            });

            const depth = depthResponse.data;

            // Calcular spread
            const bestBid = parseFloat(depth.bids[0][0]);
            const bestAsk = parseFloat(depth.asks[0][0]);
            const spread = ((bestAsk - bestBid) / bestAsk) * 100;

            const marketData = {
                symbol: symbol,
                price: parseFloat(ticker.lastPrice),
                priceChange: parseFloat(ticker.priceChange),
                priceChangePercent: parseFloat(ticker.priceChangePercent),
                volume: parseFloat(ticker.volume),
                quoteVolume: parseFloat(ticker.quoteVolume),
                openPrice: parseFloat(ticker.openPrice),
                highPrice: parseFloat(ticker.highPrice),
                lowPrice: parseFloat(ticker.lowPrice),
                bidPrice: bestBid,
                askPrice: bestAsk,
                spread: spread,
                count: parseInt(ticker.count),
                timestamp: Date.now()
            };

            console.log(chalk.green(`✅ Datos obtenidos: ${symbol} - $${marketData.price}`));
            return marketData;

        } catch (error) {
            console.error(chalk.red(`❌ Error obteniendo datos de ${symbol}:`), error.message);
            return null;
        }
    }

    async getFuturesMarketData(symbol) {
        try {
            console.log(chalk.blue(`🔮 Obteniendo datos de futuros para ${symbol}`));

            // Obtener precio de futuros
            const tickerResponse = await axios.get(`${this.futuresURL}/fapi/v1/ticker/24hr`, {
                params: { symbol: symbol },
                timeout: 10000
            });

            const ticker = tickerResponse.data;

            // Obtener funding rate
            const fundingResponse = await axios.get(`${this.futuresURL}/fapi/v1/premiumIndex`, {
                params: { symbol: symbol },
                timeout: 10000
            });

            const funding = fundingResponse.data;

            // Obtener open interest
            const oiResponse = await axios.get(`${this.futuresURL}/fapi/v1/openInterest`, {
                params: { symbol: symbol },
                timeout: 10000
            });

            const openInterest = oiResponse.data;

            const futuresData = {
                symbol: symbol,
                price: parseFloat(ticker.lastPrice),
                priceChange: parseFloat(ticker.priceChange),
                priceChangePercent: parseFloat(ticker.priceChangePercent),
                volume: parseFloat(ticker.volume),
                quoteVolume: parseFloat(ticker.quoteVolume),
                openPrice: parseFloat(ticker.openPrice),
                highPrice: parseFloat(ticker.highPrice),
                lowPrice: parseFloat(ticker.lowPrice),
                fundingRate: parseFloat(funding.lastFundingRate),
                markPrice: parseFloat(funding.markPrice),
                indexPrice: parseFloat(funding.indexPrice),
                openInterest: parseFloat(openInterest.openInterest),
                count: parseInt(ticker.count),
                timestamp: Date.now()
            };

            console.log(chalk.green(`✅ Datos de futuros obtenidos: ${symbol} - $${futuresData.price}`));
            return futuresData;

        } catch (error) {
            console.error(chalk.red(`❌ Error obteniendo datos de futuros ${symbol}:`), error.message);
            return null;
        }
    }

    async getKlines(symbol, interval = '15m', limit = 200) {
        try {
            const response = await axios.get(`${this.baseURL}/api/v3/klines`, {
                params: {
                    symbol: symbol,
                    interval: interval,
                    limit: limit
                },
                timeout: 15000
            });

            return response.data.map(kline => ({
                openTime: kline[0],
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5]),
                closeTime: kline[6],
                quoteAssetVolume: parseFloat(kline[7]),
                numberOfTrades: kline[8],
                takerBuyBaseAssetVolume: parseFloat(kline[9]),
                takerBuyQuoteAssetVolume: parseFloat(kline[10])
            }));

        } catch (error) {
            console.error(`Error obteniendo klines para ${symbol}:`, error.message);
            return null;
        }
    }

    async getFuturesKlines(symbol, interval = '15m', limit = 200) {
        try {
            const response = await axios.get(`${this.futuresURL}/fapi/v1/klines`, {
                params: {
                    symbol: symbol,
                    interval: interval,
                    limit: limit
                },
                timeout: 15000
            });

            return response.data.map(kline => ({
                openTime: kline[0],
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5]),
                closeTime: kline[6],
                quoteAssetVolume: parseFloat(kline[7]),
                numberOfTrades: kline[8],
                takerBuyBaseAssetVolume: parseFloat(kline[9]),
                takerBuyQuoteAssetVolume: parseFloat(kline[10])
            }));

        } catch (error) {
            console.error(`Error obteniendo klines de futuros para ${symbol}:`, error.message);
            return null;
        }
    }

    async getExchangeInfo() {
        try {
            const response = await axios.get(`${this.baseURL}/api/v3/exchangeInfo`, {
                timeout: 10000
            });

            return response.data;

        } catch (error) {
            console.error('Error obteniendo información del exchange:', error.message);
            return null;
        }
    }

    async getFuturesExchangeInfo() {
        try {
            const response = await axios.get(`${this.futuresURL}/fapi/v1/exchangeInfo`, {
                timeout: 10000
            });

            return response.data;

        } catch (error) {
            console.error('Error obteniendo información de futuros:', error.message);
            return null;
        }
    }

    async isValidSymbol(symbol) {
        try {
            // Verificar en spot
            const spotInfo = await this.getExchangeInfo();
            if (spotInfo && spotInfo.symbols) {
                const spotSymbol = spotInfo.symbols.find(s => s.symbol === symbol);
                if (spotSymbol && spotSymbol.status === 'TRADING') {
                    return { valid: true, type: 'SPOT', info: spotSymbol };
                }
            }

            // Verificar en futuros
            const futuresInfo = await this.getFuturesExchangeInfo();
            if (futuresInfo && futuresInfo.symbols) {
                const futuresSymbol = futuresInfo.symbols.find(s => s.symbol === symbol);
                if (futuresSymbol && futuresSymbol.status === 'TRADING') {
                    return { valid: true, type: 'FUTURES', info: futuresSymbol };
                }
            }

            return { valid: false, type: null, info: null };

        } catch (error) {
            console.error(`Error verificando símbolo ${symbol}:`, error.message);
            return { valid: false, type: null, info: null };
        }
    }

    async getTopVolumePairs(limit = 50) {
        try {
            const response = await axios.get(`${this.baseURL}/api/v3/ticker/24hr`, {
                timeout: 15000
            });

            return response.data
                .filter(ticker => ticker.symbol.endsWith('USDT'))
                .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
                .slice(0, limit)
                .map(ticker => ({
                    symbol: ticker.symbol,
                    price: parseFloat(ticker.lastPrice),
                    volume: parseFloat(ticker.volume),
                    quoteVolume: parseFloat(ticker.quoteVolume),
                    priceChangePercent: parseFloat(ticker.priceChangePercent)
                }));

        } catch (error) {
            console.error('Error obteniendo pares de mayor volumen:', error.message);
            return [];
        }
    }

    async getTopFuturesPairs(limit = 50) {
        try {
            const response = await axios.get(`${this.futuresURL}/fapi/v1/ticker/24hr`, {
                timeout: 15000
            });

            return response.data
                .filter(ticker => ticker.symbol.endsWith('USDT'))
                .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
                .slice(0, limit)
                .map(ticker => ({
                    symbol: ticker.symbol,
                    price: parseFloat(ticker.lastPrice),
                    volume: parseFloat(ticker.volume),
                    quoteVolume: parseFloat(ticker.quoteVolume),
                    priceChangePercent: parseFloat(ticker.priceChangePercent)
                }));

        } catch (error) {
            console.error('Error obteniendo pares de futuros de mayor volumen:', error.message);
            return [];
        }
    }

    async getAccountInfo() {
        try {
            if (!this.apiKey || !this.secretKey) {
                console.warn('⚠️ API keys no configuradas');
                return null;
            }

            const timestamp = Date.now();
            const queryString = `timestamp=${timestamp}&recvWindow=${this.recvWindow}`;
            const signature = crypto
                .createHmac('sha256', this.secretKey)
                .update(queryString)
                .digest('hex');

            const response = await axios.get(`${this.baseURL}/api/v3/account`, {
                params: {
                    timestamp: timestamp,
                    recvWindow: this.recvWindow,
                    signature: signature
                },
                headers: {
                    'X-MBX-APIKEY': this.apiKey
                },
                timeout: 10000
            });

            return response.data;

        } catch (error) {
            console.error('Error obteniendo información de cuenta:', error.message);
            return null;
        }
    }

    async testConnectivity() {
        try {
            console.log(chalk.blue('🔗 Probando conectividad con Binance...'));

            // Test spot API
            const spotResponse = await axios.get(`${this.baseURL}/api/v3/ping`, {
                timeout: 5000
            });

            // Test futures API
            const futuresResponse = await axios.get(`${this.futuresURL}/fapi/v1/ping`, {
                timeout: 5000
            });

            console.log(chalk.green('✅ Conectividad con Binance OK'));
            return {
                spot: spotResponse.status === 200,
                futures: futuresResponse.status === 200,
                timestamp: Date.now()
            };

        } catch (error) {
            console.error(chalk.red('❌ Error de conectividad con Binance:'), error.message);
            return {
                spot: false,
                futures: false,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }

    formatSymbol(baseSymbol) {
        // Asegurar que el símbolo termine en USDT
        if (!baseSymbol.endsWith('USDT')) {
            return baseSymbol + 'USDT';
        }
        return baseSymbol;
    }

    calculateLiquidationPrice(entryPrice, leverage, side, marginRatio = 0.8) {
        // Cálculo aproximado del precio de liquidación
        if (side.toLowerCase() === 'long') {
            return entryPrice * (1 - marginRatio / leverage);
        } else {
            return entryPrice * (1 + marginRatio / leverage);
        }
    }

    calculatePnL(entryPrice, currentPrice, quantity, side) {
        if (side.toLowerCase() === 'long') {
            return (currentPrice - entryPrice) * quantity;
        } else {
            return (entryPrice - currentPrice) * quantity;
        }
    }
}

module.exports = BinanceAPI;
