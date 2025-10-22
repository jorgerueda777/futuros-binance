const TelegramBot = require('node-telegram-bot-api');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: './config.env' });

const TechnicalAnalyzer = require('./src/TechnicalAnalyzer');
const ImageProcessor = require('./src/ImageProcessor');
const BinanceAPI = require('./src/BinanceAPI');
const SignalGenerator = require('./src/SignalGenerator');
const SmartMoneyAnalyzer = require('./src/SmartMoneyAnalyzer');
const Logger = require('./src/Logger');
const AutoTrader = require('./src/AutoTrader');
// const ScalpingAI = require('./src/ScalpingAI'); // ELIMINADO COMPLETAMENTE
// IA VALIDADORA - Doble filtro SmartMoney + IA
// IA ELIMINADA - Solo análisis técnico tradicional

class DefBinanceProfessionalBot {
    constructor() {
        // Bot API para comandos con mejor manejo de errores
        this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
            polling: {
                interval: 2000,
                autoStart: true,
                params: {
                    timeout: 10
                }
            }
        });
        
        // Tu Telegram API para leer mensajes completos
        this.apiId = parseInt(process.env.TELEGRAM_API_ID);
        this.apiHash = process.env.TELEGRAM_API_HASH;
        this.sessionString = process.env.TELEGRAM_SESSION_STRING;
        this.telegramClient = null;
        
        this.technicalAnalyzer = new TechnicalAnalyzer();
        this.imageProcessor = new ImageProcessor();
        this.binanceAPI = new BinanceAPI();
        this.signalGenerator = new SignalGenerator();
        this.smartMoneyAnalyzer = new SmartMoneyAnalyzer();
        this.logger = new Logger();
        
        // AutoTrader para operaciones automáticas (DESHABILITADO por defecto)
        this.autoTrader = new AutoTrader(
            process.env.BINANCE_API_KEY,
            process.env.BINANCE_SECRET_KEY,
            this.logger
        );
        
        // IA SCALPING ELIMINADA COMPLETAMENTE
        
        // Restaurar estado de trading si estaba habilitado
        if (process.env.AUTO_TRADING_ENABLED === 'true') {
            this.autoTrader.enableTrading(true);
            this.logger.info('🔄 Trading automático restaurado desde variables de entorno');
        }
        
        this.isRunning = false;
        this.processedSignals = new Set();
        this.signalCount = { hourly: 0, lastHour: new Date().getHours() };
        this.lastAnalysisTime = 0;
        
        this.setupDirectories();
        this.setupEventHandlers();
        this.initializeTelegramAPI();
        
        console.log(chalk.bold.green('🤖 DEF BINANCE PROFESSIONAL BOT INICIADO'));
        console.log(chalk.cyan('📊 Análisis Técnico Profesional Activado'));
        console.log(chalk.yellow('🎯 Monitoreando: Grupo de Señales (-1001959577386)'));
        console.log(chalk.white('💬 Enviando señales al mismo grupo'));
        console.log('');
    }

    setupDirectories() {
        const dirs = [
            './data',
            './data/images',
            './data/analysis',
            './data/signals',
            './logs'
        ];
        
        dirs.forEach(dir => {
            fs.ensureDirSync(dir);
        });
    }

    async initializeTelegramAPI() {
        try {
            console.log(chalk.blue('🔗 Inicializando tu Telegram API...'));
            
            const session = new StringSession(this.sessionString);
            this.telegramClient = new TelegramClient(session, this.apiId, this.apiHash, {
                connectionRetries: 5,
            });

            await this.telegramClient.start({
                phoneNumber: async () => '',
                password: async () => '',
                phoneCode: async () => '',
                onError: (err) => console.log(err),
            });

            console.log(chalk.green('✅ Telegram API conectada - Acceso completo activado'));
            
            // Configurar listener para el grupo de señales
            await this.setupMessageListener();
            
        } catch (error) {
            console.error(chalk.red('❌ Error inicializando Telegram API:'), error);
            console.log(chalk.yellow('⚠️ Continuando solo con Bot API...'));
        }
    }

    async setupMessageListener() {
        try {
            const sourceChannelId = process.env.SOURCE_CHANNEL_ID;
            console.log(chalk.yellow(`👂 Configurando listener para ${sourceChannelId}...`));
            
            const { NewMessage } = require('telegram/events');
            
            this.telegramClient.addEventHandler(async (event) => {
                try {
                    if (event.message) {
                        console.log(chalk.green('📨 ¡Nuevo mensaje detectado!'));
                        console.log(chalk.cyan(`📝 Mensaje: ${event.message.message?.substring(0, 100) || 'Sin texto'}...`));
                        await this.processNewMessage(event.message);
                    }
                } catch (error) {
                    console.error(chalk.red('❌ Error procesando evento:'), error);
                }
            }, new NewMessage({}));
            
            console.log(chalk.green('✅ Listener configurado correctamente'));
            
            // Bot listo para funcionar automáticamente
            
        } catch (error) {
            console.error(chalk.red('❌ Error configurando listener:'), error);
        }
    }

    async processNewMessage(message) {
        try {
            console.log(chalk.blue('🔍 Procesando nuevo mensaje...'));
            
            const text = message.message || '';
            
            // Ignorar mensajes del propio bot para evitar loops
            if (text.includes('BOT F77 - ANÁLISIS PROFESIONAL')) {
                console.log(chalk.yellow('⚠️ Ignorando mensaje del propio bot'));
                return;
            }
            console.log(chalk.cyan(`📝 Texto: ${text.substring(0, 100)}...`));
            
            // Extraer símbolo
            const symbol = await this.extractSymbolFromText(text);
            
            if (symbol) {
                console.log(chalk.green(`🎯 Token detectado: ${symbol}`));
                
                // Crear ID único para la señal basado en símbolo y contenido
                const signalId = `${symbol}_${text.substring(0, 50).replace(/\s+/g, '_')}`;
                
                // Verificar si ya procesamos esta señal
                if (this.processedSignals.has(signalId)) {
                    console.log(chalk.yellow(`⚠️ Señal ${symbol} ya procesada, ignorando duplicado`));
                    return;
                }
                
                // Control de rate limiting - esperar al menos 10 segundos entre análisis
                const now = Date.now();
                const timeSinceLastAnalysis = now - this.lastAnalysisTime;
                if (timeSinceLastAnalysis < 10000) {
                    console.log(chalk.yellow(`⏳ Esperando ${Math.ceil((10000 - timeSinceLastAnalysis) / 1000)}s antes del próximo análisis...`));
                    return;
                }
                this.lastAnalysisTime = now;
                
                // Marcar señal como procesada
                this.processedSignals.add(signalId);
                
                // Extraer información completa de la señal
                const signalInfo = this.extractSignalInfo(text);
                
                await this.performUltraFastAnalysis(symbol, signalInfo, message.id);
            } else {
                console.log(chalk.yellow('⚠️ No se detectó token en el mensaje'));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Error procesando mensaje:'), error);
        }
    }

    setupEventHandlers() {
        // Manejar mensajes del canal fuente
        this.bot.on('channel_post', async (msg) => {
            if (this.isFromSourceChannel(msg)) {
                await this.processChannelMessage(msg);
            }
        });

        // Manejar mensajes de grupos
        this.bot.on('message', async (msg) => {
            if (this.isFromSourceChannel(msg)) {
                await this.processChannelMessage(msg);
            }
        });

        // Manejar comandos directos
        this.bot.onText(/\/start/, (msg) => {
            this.sendWelcomeMessage(msg.chat.id);
        });

        this.bot.onText(/\/status/, (msg) => {
            this.sendStatusMessage(msg.chat.id);
        });

        this.bot.onText(/\/analyze (.+)/, async (msg, match) => {
            const symbol = match[1].toUpperCase();
            await this.manualAnalysis(msg.chat.id, symbol);
        });

        this.bot.onText(/\/listgroups/, async (msg) => {
            await this.listAllGroups(msg.chat.id);
        });

        this.bot.onText(/\/findvolumen/, async (msg) => {
            await this.findVolumenGroup(msg.chat.id);
        });

        this.bot.onText(/\/test/, async (msg) => {
            await this.testSignal(msg.chat.id);
        });


        this.bot.onText(/\/check/, async (msg) => {
            await this.checkGroupAccess(msg.chat.id);
        });

        this.bot.onText(/\/getchatid/, async (msg) => {
            await this.bot.sendMessage(msg.chat.id, `📋 Chat ID: ${msg.chat.id}\n👥 Tipo: ${msg.chat.type}\n📝 Título: ${msg.chat.title || 'Sin título'}`);
        });

        // 🚀 COMANDOS DE TRADING AUTOMÁTICO
        this.bot.onText(/\/trading_enable/, async (msg) => {
            await this.handleTradingEnable(msg.chat.id);
        });

        this.bot.onText(/\/trading_disable/, async (msg) => {
            await this.handleTradingDisable(msg.chat.id);
        });

        this.bot.onText(/\/trading_stats/, async (msg) => {
            await this.handleTradingStats(msg.chat.id);
        });


        // 🛡️ COMANDO PARA VERIFICAR Y CORREGIR SL/TP
        this.bot.onText(/\/fix_sltp/, async (msg) => {
            await this.handleFixSLTP(msg.chat.id);
        });

        // 🚀 COMANDOS DE IA SCALPING
        this.bot.onText(/\/scalping_enable/, async (msg) => {
            await this.handleScalpingEnable(msg.chat.id);
        });

        this.bot.onText(/\/scalping_disable/, async (msg) => {
            await this.handleScalpingDisable(msg.chat.id);
        });

        this.bot.onText(/\/scalping_stats/, async (msg) => {
            await this.handleScalpingStats(msg.chat.id);
        });

        // Manejo de errores
        this.bot.on('error', (error) => {
            this.logger.error('Bot error:', error);
        });

        this.bot.on('polling_error', (error) => {
            // Solo loggear errores críticos, ignorar errores temporales de red
            if (!error.message.includes('ENOTFOUND') && !error.message.includes('ECONNRESET')) {
                this.logger.error('Polling error:', error);
            }
            
            // Intentar reconectar después de errores de red
            if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNRESET')) {
                setTimeout(() => {
                    console.log('🔄 Intentando reconectar...');
                }, 5000);
            }
        });
    }

    isFromSourceChannel(msg) {
        const sourceChannelId = process.env.SOURCE_CHANNEL_ID;
        const sourceChannelUsername = process.env.SOURCE_CHANNEL_USERNAME;
        
        return msg.chat.id.toString() === sourceChannelId || 
               msg.chat.username === sourceChannelUsername;
    }

    async processChannelMessage(msg) {
        try {
            this.logger.info(`📨 Nuevo mensaje del canal: ${msg.message_id}`);
            
            // Verificar límite de señales por hora
            if (!this.checkHourlyLimit()) {
                this.logger.warn('⏰ Límite de señales por hora alcanzado');
                return;
            }

            let symbol = null;

            // Procesar imagen si existe
            if (msg.photo && msg.photo.length > 0) {
                this.logger.info('🖼️ Procesando imagen...');
                symbol = await this.processImageMessage(msg);
            }

            // Procesar texto si existe
            if (msg.text || msg.caption) {
                const text = msg.text || msg.caption;
                this.logger.info(`📝 Procesando texto: ${text.substring(0, 100)}...`);
                
                if (!symbol) {
                    symbol = await this.extractSymbolFromText(text);
                }
            }

            if (symbol) {
                this.logger.info(`🎯 Token detectado: ${symbol}`);
                
                // Extraer información completa de la señal
                const signalInfo = this.extractSignalInfo(text || msg.caption || '');
                
                await this.performUltraFastAnalysis(symbol, signalInfo, msg.message_id);
            } else {
                this.logger.warn('❌ No se pudo extraer símbolo del mensaje');
            }

        } catch (error) {
            this.logger.error('Error procesando mensaje del canal:', error);
        }
    }

    async processImageMessage(msg) {
        try {
            const photo = msg.photo[msg.photo.length - 1]; // Imagen de mayor resolución
            const fileId = photo.file_id;
            
            // Descargar imagen
            const fileInfo = await this.bot.getFile(fileId);
            const filePath = `./data/images/${Date.now()}_${fileId}.jpg`;
            
            await this.bot.downloadFile(fileId, './data/images/');
            
            // Extraer texto de la imagen usando OCR
            const extractedText = await this.imageProcessor.extractTextFromImage(filePath);
            this.logger.info(`📖 Texto extraído: ${extractedText}`);
            
            // Extraer símbolo del texto
            const symbol = this.extractSymbolFromText(extractedText);
            
            return symbol;
            
        } catch (error) {
            this.logger.error('Error procesando imagen:', error);
            return null;
        }
    }

    async extractSymbolFromText(text) {
        try {
            this.logger.info(`🔍 DEBUG: Analizando texto para extraer símbolo: "${text.substring(0, 200)}"`);
            
            const patterns = [
                /#([0-9A-Z]{2,15}USDT)/gi,       // #KAVAUSDT, #1000PEPEUSDT
                /([0-9A-Z]{2,15}USDT)/gi,        // KAVAUSDT, 1000PEPEUSDT
                /#([0-9A-Z]{2,10}USDT)\s+LONG/gi, // #KAVAUSDT LONG
                /#([0-9A-Z]{2,10}USDT)\s+SHORT/gi, // #KAVAUSDT SHORT
                /#([0-9A-Z]{2,10})\s+LONG/gi,    // #KAVA LONG
                /#([0-9A-Z]{2,10})\s+SHORT/gi,   // #KAVA SHORT
                /EMA\s+CROSS.*#([0-9A-Z]{2,15}USDT)/gi, // EMA CROSS #AKEUSDT
                /ALERTAS.*EMA.*#([0-9A-Z]{2,15}USDT)/gi, // ALERTAS EMA CROSS #AKEUSDT
                /#([0-9A-Z]{2,15}USDT).*EMA/gi,  // #AKEUSDT EMA
                /([0-9A-Z]{2,10})\s*📈/gi,       // KAVA 📈
                /([0-9A-Z]{2,10})\s*📉/gi,       // KAVA 📉
                /([0-9A-Z]{2,10})\s*🟢/gi,       // KAVA 🟢
                /([0-9A-Z]{2,10})\s*🔴/gi,       // KAVA 🔴
                /([0-9A-Z]{2,10})\s*LONG/gi,     // KAVA LONG
                /([0-9A-Z]{2,10})\s*SHORT/gi,    // KAVA SHORT
                /([0-9A-Z]{2,10})\s*signal/gi    // KAVA signal
            ];

            for (let i = 0; i < patterns.length; i++) {
                const pattern = patterns[i];
                const matches = text.match(pattern);
                if (matches && matches.length > 0) {
                    let symbol = matches[0].replace(/[^0-9A-Z]/g, '');
                    this.logger.info(`🎯 DEBUG: Patrón ${i+1} encontró: "${matches[0]}" → símbolo: "${symbol}"`);
                    
                    // Si ya termina en USDT, verificar directamente
                    if (symbol.endsWith('USDT')) {
                        this.logger.info(`🔍 DEBUG: Verificando símbolo completo: ${symbol}`);
                        const isValid = await this.isValidCryptoSymbol(symbol);
                        if (isValid) {
                            this.logger.info(`✅ DEBUG: Símbolo válido encontrado: ${symbol}`);
                            return symbol;
                        }
                    } else {
                        // Intentar con USDT añadido
                        const symbolWithUSDT = symbol + 'USDT';
                        this.logger.info(`🔍 DEBUG: Verificando símbolo con USDT: ${symbolWithUSDT}`);
                        const isValid = await this.isValidCryptoSymbol(symbolWithUSDT);
                        if (isValid) {
                            this.logger.info(`✅ DEBUG: Símbolo válido encontrado: ${symbolWithUSDT}`);
                            return symbolWithUSDT;
                        }
                    }
                }
            }

            return null;
        } catch (error) {
            this.logger.error('Error extrayendo símbolo:', error);
            return null;
        }
    }

    // VALIDAR SÍMBOLO CON BINANCE API (NO LISTA FIJA)
    async isValidCryptoSymbol(symbol) {
        try {
            // Validación básica de formato (acepta números y letras)
            if (!symbol || symbol.length < 2 || symbol.length > 15 || !/^[0-9A-Z]+$/.test(symbol)) {
                return false;
            }
            
            // Consultar Binance API para verificar si el símbolo existe
            const response = await axios.get(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`);
            
            if (response.status === 200 && response.data) {
                this.logger.info(`✅ Símbolo válido encontrado en Binance: ${symbol}`);
                return true;
            }
            
            return false;
            
        } catch (error) {
            // Si da error 400, el símbolo no existe
            if (error.response && error.response.status === 400) {
                this.logger.warn(`❌ Símbolo no existe en Binance: ${symbol}`);
                return false;
            }
            
            this.logger.error(`⚠️ Error verificando símbolo ${symbol}:`, error.message);
            return false;
        }
    }

    extractSignalInfo(text) {
        try {
            const info = {
                direction: null,
                entryPrices: [],
                takeProfits: [],
                stopLoss: null,
                leverage: null
            };

            // Detectar dirección LONG/SHORT (incluye FIBONACCI)
            if (/LONG/i.test(text) || /🟢/i.test(text)) {
                info.direction = 'LONG';
                this.logger.info(`🟢 DIRECCIÓN DETECTADA: LONG (ALCISTA)`);
            }
            if (/SHORT/i.test(text) || /🔴/i.test(text)) {
                info.direction = 'SHORT';
                this.logger.info(`🔴 DIRECCIÓN DETECTADA: SHORT (BAJISTA)`);
            }
            
            // Detectar si es señal FIBONACCI
            if (/FIBO/i.test(text)) {
                info.type = 'FIBONACCI';
                info.timeframe = '4h'; // FIBONACCI siempre en 4H
                this.logger.info(`🔢 Señal FIBONACCI detectada - Dirección: ${info.direction} - Timeframe: 4H`);
                
                // FORZAR dirección correcta para FIBONACCI
                if (/LONG.*FIBO|FIBO.*LONG/i.test(text)) {
                    info.direction = 'LONG';
                    this.logger.info(`🔢 FIBONACCI LONG confirmado - ALCISTA`);
                }
                if (/SHORT.*FIBO|FIBO.*SHORT/i.test(text)) {
                    info.direction = 'SHORT';
                    this.logger.info(`🔢 FIBONACCI SHORT confirmado - BAJISTA`);
                }
                
                // Marcar para análisis FIBONACCI específico
                info.requiresFibonacci = true;
            }
            
            // Detectar si es señal EMA CROSS
            if (/EMA.*CROSS|ALERTAS.*EMA/i.test(text)) {
                info.type = 'EMA_CROSS';
                
                // Extraer timeframe (m5, m15, h1, etc.)
                const timeframeMatch = text.match(/\(([mh]\d+)\)/i);
                if (timeframeMatch) {
                    info.timeframe = timeframeMatch[1].toLowerCase();
                    this.logger.info(`📊 Señal EMA CROSS detectada - Timeframe: ${info.timeframe}`);
                } else {
                    info.timeframe = '5m'; // Default para EMA CROSS
                    this.logger.info(`📊 Señal EMA CROSS detectada - Timeframe: 5m (default)`);
                }
                
                // Extraer EMAs (50/200, 20/50, etc.)
                const emaMatch = text.match(/EMA.*?(\d+)\/(\d+)/i);
                if (emaMatch) {
                    info.emaFast = parseInt(emaMatch[1]);
                    info.emaSlow = parseInt(emaMatch[2]);
                    this.logger.info(`📈 EMAs detectadas: ${info.emaFast}/${info.emaSlow}`);
                }
                
                // Para EMA CROSS, necesitamos determinar la dirección analizando el mercado
                info.requiresEmaAnalysis = true;
                this.logger.info(`📊 EMA CROSS requiere análisis de dirección`);
            }

            // Extraer precios de entrada (mejorado)
            const entrySection = text.match(/ENTRADA[\s\S]*?(?=🚀|TP|Apalancamiento|STOP)/i);
            if (entrySection) {
                const priceMatches = entrySection[0].match(/\$\s*([\d.]+)/g);
                if (priceMatches) {
                    priceMatches.forEach(match => {
                        const price = match.match(/\$\s*([\d.]+)/);
                        if (price) info.entryPrices.push(parseFloat(price[1]));
                    });
                }
            }

            // Extraer Take Profits (formato mejorado para TP'S)
            const tpSection = text.match(/TP'?S?[\s\S]*?(?=Apalancamiento|STOP|$)/i);
            if (tpSection) {
                const tpPrices = tpSection[0].match(/\$\s*([\d.]+)/g);
                if (tpPrices) {
                    tpPrices.forEach((match, index) => {
                        const price = match.match(/\$\s*([\d.]+)/);
                        if (price) {
                            info.takeProfits.push({
                                level: index + 1,
                                price: parseFloat(price[1])
                            });
                        }
                    });
                }
            }
            
            // Fallback: formato anterior con porcentajes
            if (info.takeProfits.length === 0) {
                const tpMatches = text.match(/(\d+)\s*%\s*\(\$\s*([\d.]+)\)/gi);
                if (tpMatches) {
                    tpMatches.forEach(match => {
                        const parts = match.match(/(\d+)\s*%\s*\(\$\s*([\d.]+)\)/i);
                        if (parts) {
                            info.takeProfits.push({
                                percentage: parseInt(parts[1]),
                                price: parseFloat(parts[2])
                            });
                        }
                    });
                }
            }

            // Extraer Stop Loss
            const slMatch = text.match(/STOP\s*LOSS[:\s]*[\d.]+\s*%\s*\(\$\s*([\d.]+)\)/i);
            if (slMatch) {
                info.stopLoss = parseFloat(slMatch[1]);
            }

            // Extraer Apalancamiento
            const leverageMatch = text.match(/Apalancamiento.*?(\d+)\s*X/i);
            if (leverageMatch) {
                info.leverage = parseInt(leverageMatch[1]);
            }

            // Log de información extraída
            this.logger.info(`📊 INFO EXTRAÍDA: Dirección=${info.direction}, Entradas=${info.entryPrices.length}, TPs=${info.takeProfits.length}, SL=${info.stopLoss}, Leverage=${info.leverage}`);
            if (info.entryPrices.length > 0) {
                this.logger.info(`💰 Precios entrada: ${info.entryPrices.join(', ')}`);
            }
            if (info.takeProfits.length > 0) {
                this.logger.info(`🎯 Take Profits: ${info.takeProfits.map(tp => `$${tp.price}`).join(', ')}`);
            }

            return info;
        } catch (error) {
            this.logger.error('Error extrayendo información de señal:', error);
            return {};
        }
    }

    async performUltraFastAnalysis(symbol, signalInfo, messageId) {
        try {
            this.logger.info(`⚡ ANÁLISIS ULTRA RÁPIDO: ${symbol} ${signalInfo.direction || 'DETECTANDO'}`);
            
            // Si es señal FIBONACCI, hacer análisis específico
            if (signalInfo.requiresFibonacci) {
                await this.analyzeFibonacci(symbol, signalInfo);
            }
            
            // Si es señal EMA CROSS, hacer análisis específico
            if (signalInfo.requiresEmaAnalysis) {
                await this.analyzeEmaCross(symbol, signalInfo);
            }
            
            const startTime = Date.now();
            
            // 1. Obtener datos de mercado RÁPIDO
            const marketData = await this.binanceAPI.getMarketData(symbol);
            if (!marketData) {
                this.logger.error(`❌ No se pudieron obtener datos de ${symbol}`);
                return;
            }

            this.logger.info(`🚀 INICIANDO análisis SmartMoney para ${symbol}`);
            
            // IA ELIMINADA - Solo análisis SmartMoney profesional

            // 2. Análisis técnico ULTRA RÁPIDO (Smart Money, Soportes, Resistencias)
            this.logger.info(`📊 Iniciando análisis Smart Money para ${symbol}`);
            const ultraAnalysis = await this.performSmartMoneyAnalysis(symbol, marketData, signalInfo);
            
            // 3. DECISIÓN INMEDIATA: ENTRAR, ESPERAR
            this.logger.info(`🎯 Tomando decisión instantánea para ${symbol}`);
            const decision = this.makeInstantDecision(ultraAnalysis, signalInfo);
            
            // 4. Enviar respuesta INMEDIATA
            this.logger.info(`📤 Enviando respuesta ultra rápida para ${symbol}`);
            await this.sendUltraFastResponse(decision, symbol, signalInfo, marketData);
            
            const analysisTime = Date.now() - startTime;
            this.logger.info(`⚡ Análisis completado en ${analysisTime}ms`);

        } catch (error) {
            this.logger.error(`Error en análisis ultra rápido de ${symbol}:`, error);
        }
    }

    async performSmartMoneyAnalysis(symbol, marketData, signalInfo) {
        return await this.smartMoneyAnalyzer.performSmartMoneyAnalysis(symbol, marketData, signalInfo);
    }

    makeInstantDecision(ultraAnalysis, signalInfo) {
        return this.smartMoneyAnalyzer.makeInstantDecision(ultraAnalysis, signalInfo);
    }

    // 💰 CALCULAR POSICIÓN INTELIGENTE CON BINANCE API (SIN IA)
    async calculateIntelligentPosition(symbol, price, balance = 20) {
        try {
            this.logger.info(`💰 Calculando posición para ${symbol} - Balance: $${balance}`);
            
            // 1. Obtener información del símbolo de Binance Futures
            const exchangeInfo = await this.binanceAPI.getFuturesExchangeInfo();
            const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === symbol);
            
            if (!symbolInfo) {
                throw new Error(`Símbolo ${symbol} no encontrado`);
            }
            
            // 2. Extraer límites del símbolo
            const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
            const minQty = parseFloat(lotSizeFilter.minQty);
            const stepSize = parseFloat(lotSizeFilter.stepSize);
            
            // 3. Obtener apalancamiento máximo (limitado a 15x)
            let maxLeverage = 15; // Por defecto 15x
            try {
                const leverageInfo = await this.binanceAPI.getLeverageBracket(symbol);
                maxLeverage = Math.min(leverageInfo[0].maxLeverage || 15, 15); // Máximo 15x
            } catch (e) {
                this.logger.warn(`⚠️ No se pudo obtener leverage para ${symbol}, usando 15x`);
            }
            
            // 4. Calcular posición objetivo ($0.40 USD)
            const targetUSD = 0.40; // $0.40 USD por trade
            const leverage = maxLeverage;
            
            // 5. Calcular cantidad exacta
            const notionalValue = targetUSD * leverage; // Valor nocional con apalancamiento
            const quantity = notionalValue / price; // Cantidad en el activo base
            
            // 6. Ajustar a step size de Binance
            const adjustedQuantity = Math.max(
                minQty,
                Math.floor(quantity / stepSize) * stepSize
            );
            
            this.logger.info(`📊 ${symbol}: Precio $${price}, Leverage ${leverage}x`);
            this.logger.info(`💰 Posición: $${targetUSD} USD = ${adjustedQuantity} ${symbol.replace('USDT', '')}`);
            this.logger.info(`📏 Límites: Min ${minQty}, Step ${stepSize}`);
            
            return {
                quantity: adjustedQuantity,
                leverage: leverage,
                notionalValue: adjustedQuantity * price,
                targetUSD: targetUSD
            };
            
        } catch (error) {
            this.logger.error(`❌ Error calculando posición inteligente:`, error.message);
            // Fallback seguro
            return {
                quantity: 0.001,
                leverage: 15,
                notionalValue: 0.001 * price,
                targetUSD: 0.40
            };
        }
    }

    // 🛑 CALCULAR STOP LOSS DINÁMICO (PÉRDIDA EXACTA $0.15)
    calculateStopLoss(price, action) {
        const percentage = 0.0118; // 1.18% stop loss (pérdida $0.15)
        if (action.includes('LONG')) {
            return price * (1 - percentage);
        } else {
            return price * (1 + percentage);
        }
    }

    // 🎯 CALCULAR TAKE PROFIT DINÁMICO (GANANCIA EXACTA $0.37)
    calculateTakeProfit(price, action) {
        const percentage = 0.029; // 2.9% take profit (ganancia $0.37)
        if (action.includes('LONG')) {
            return price * (1 + percentage);
        } else {
            return price * (1 - percentage);
        }
    }

    async sendUltraFastResponse(decision, symbol, signalInfo, marketData) {
        try {
            // SOLO ENVIAR SI CONFIANZA ≥80%
            if (decision.confidence < 80) {
                this.logger.info(`⚠️ Confianza ${decision.confidence}% < 80% - NO enviando al F77`);
                return;
            }

            // Enviar al chat F77 configurado
            const chatId = process.env.TELEGRAM_CHAT_ID_F77;
            
            const directionEmoji = decision.action.includes('LONG') ? '🟢' : 
                                 decision.action.includes('SHORT') ? '🔴' : '⚪';
            
            const confidenceEmoji = decision.confidence >= 80 ? '🔥🔥🔥' :
                                  decision.confidence >= 70 ? '🔥🔥' :
                                  decision.confidence >= 60 ? '🔥' : '⚡';

            // Determinar la recomendación clara
            let recommendation = '';
            if (decision.action.includes('ENTRAR LONG')) {
                recommendation = '🟢 ENTRAR LONG';
            } else if (decision.action.includes('ENTRAR SHORT')) {
                recommendation = '🔴 ENTRAR SHORT';
            } else if (decision.action.includes('LONG')) {
                recommendation = '🟢 ENTRAR LONG';
            } else if (decision.action.includes('SHORT')) {
                recommendation = '🔴 ENTRAR SHORT';
            } else {
                recommendation = '⚪ ESPERAR';
            }

            // Agregar recomendación específica solo si es ESPERAR
            const waitRecommendationText = (recommendation === '⚪ ESPERAR' && decision.waitRecommendation) ? 
                `\n⏳ <b>QUÉ ESPERAR:</b> ${decision.waitRecommendation}` : '';

            const message = `
🤖 <b>BOT F77 - ANÁLISIS PROFESIONAL</b>
${directionEmoji} <b>${symbol}</b>

🎯 <b>RECOMENDACIÓN: ${recommendation}</b>
📊 Confianza: ${decision.confidence}% ${confidenceEmoji}${waitRecommendationText}

📋 <b>SEÑAL ORIGINAL:</b> ${signalInfo.direction || 'N/A'}
💰 <b>Precio Actual:</b> $${decision.analysis?.currentPrice || 'N/A'}
${signalInfo.entryPrices?.length ? `🎯 <b>Entry Sugerido:</b> $${signalInfo.entryPrices[0]}` : ''}
${signalInfo.stopLoss ? `🛑 <b>Stop Loss:</b> $${signalInfo.stopLoss}` : ''}

📊 <b>ANÁLISIS TÉCNICO:</b>
• Smart Money: ${decision.analysis?.smartMoneyScore || 0}/5 ⭐
• Momentum: ${decision.analysis?.momentum?.direction || 'NEUTRAL'}
• Volumen: ${decision.analysis?.volumeAnalysis?.level || 'NORMAL'}

💡 <b>RAZONES:</b>
${decision.reasons.map(r => `• ${r}`).join('\n')}

⏰ <i>Análisis automático en tiempo real</i>
            `.trim();

            // Usar bot API para enviar (más confiable)
            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });

            this.logger.info(`✅ Respuesta ultra rápida enviada: ${decision.action} - ${decision.confidence}%`);

            // ⚡ SMARTMONEY PRINCIPAL - IA ELIMINADA COMPLETAMENTE
            if (decision.confidence >= 80 && this.autoTrader && this.autoTrader.isEnabled()) {
                
                // IDENTIFICAR RAZÓN DE LA DECISIÓN
                let decisionReason = '';
                if (signalInfo.fibonacci && signalInfo.fibonacci.currentAnalysis.atOptimalLevel) {
                    decisionReason = 'FIBONACCI';
                    this.logger.info(`✅ DECISIÓN TOMADA POR FIBONACCI - Ejecutando trade`);
                } else if (signalInfo.emaCross && signalInfo.emaCross.confidence >= 70) {
                    decisionReason = 'EMA CROSS';
                    this.logger.info(`✅ DECISIÓN TOMADA POR EMA CROSS - Ejecutando trade`);
                } else {
                    decisionReason = 'SOPORTES Y RESISTENCIAS';
                    this.logger.info(`✅ DECISIÓN TOMADA POR SOPORTES Y RESISTENCIAS - Ejecutando trade`);
                }
                
                this.logger.info(`⚡ EJECUTANDO SmartMoney (${decisionReason}): ${symbol} - ${decision.confidence}%`);
                
                try {
                    const positionInfo = await this.calculateIntelligentPosition(symbol, marketData.price, 15);
                    
                    const tradeConfig = {
                        symbol: symbol,
                        side: decision.action.includes('LONG') ? 'BUY' : 'SELL',
                        quantity: positionInfo.quantity,
                        price: marketData.price,
                        stopLoss: this.calculateStopLoss(marketData.price, decision.action),
                        takeProfit: this.calculateTakeProfit(marketData.price, decision.action),
                        leverage: positionInfo.leverage,
                        targetUSD: positionInfo.targetUSD
                    };
                    
                    this.logger.info(`🎯 EJECUTANDO (Solo SmartMoney): ${tradeConfig.side} ${positionInfo.quantity} ${symbol}`);
                    this.logger.info(`💰 Valor: $${positionInfo.targetUSD} USD con ${positionInfo.leverage}x leverage`);
                    this.logger.info(`🛡️ SL/TP calculados: SL=$${tradeConfig.stopLoss} TP=$${tradeConfig.takeProfit}`);
                    
                    await this.autoTrader.executeTrade(tradeConfig);
                    this.logger.info(`✅ Trade SmartMoney ejecutado: ${symbol} ${tradeConfig.side} - $${positionInfo.targetUSD}`);
                    
                } catch (error) {
                    this.logger.error(`❌ Error ejecutando trade SmartMoney:`, error.message);
                }
            } else if (decision.confidence >= 70) {
                this.logger.info(`⚠️ Señal SmartMoney ≥70% pero trading automático deshabilitado`);
            } else {
                this.logger.info(`📊 Trading automático: Confianza ${decision.confidence}% < 70% - Solo análisis`);
            }

        } catch (error) {
            this.logger.error('Error enviando respuesta ultra rápida:', error);
        }
    }

    async performProfessionalAnalysis(symbol, messageId) {
        try {
            this.logger.info(`🔍 Iniciando análisis profesional de ${symbol}`);
            
            // Evitar análisis duplicados
            const signalKey = `${symbol}_${Date.now()}`;
            if (this.processedSignals.has(signalKey)) {
                return;
            }
            this.processedSignals.add(signalKey);

            // 1. Obtener datos de mercado
            const marketData = await this.binanceAPI.getMarketData(symbol);
            if (!marketData) {
                this.logger.error(`❌ No se pudieron obtener datos de ${symbol}`);
                return;
            }

            // 2. Realizar análisis técnico profesional
            const analysis = await this.technicalAnalyzer.performCompleteAnalysis(symbol, marketData);
            
            // 3. Generar señal profesional
            const signal = await this.signalGenerator.generateProfessionalSignal(analysis);
            
            // 4. Validar confianza mínima
            if (signal.confidence < process.env.MIN_CONFIDENCE_LEVEL) {
                this.logger.warn(`⚠️ Confianza insuficiente para ${symbol}: ${signal.confidence}%`);
                return;
            }

            // 5. Enviar señal a f77
            await this.sendProfessionalSignal(signal);
            
            // 6. Guardar análisis
            await this.saveAnalysis(signal, messageId);
            
            this.signalCount.hourly++;
            this.logger.info(`✅ Señal enviada para ${symbol} - Confianza: ${signal.confidence}%`);

        } catch (error) {
            this.logger.error(`Error en análisis profesional de ${symbol}:`, error);
        }
    }

    async sendProfessionalSignal(signal) {
        try {
            const chatId = process.env.TELEGRAM_CHAT_ID_F77;
            
            const message = this.formatProfessionalSignal(signal);
            
            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });

            // Enviar imagen de análisis si está disponible
            if (signal.analysisImagePath) {
                await this.bot.sendPhoto(chatId, signal.analysisImagePath, {
                    caption: `📊 Análisis técnico detallado de ${signal.symbol}`
                });
            }

        } catch (error) {
            this.logger.error('Error enviando señal profesional:', error);
        }
    }

    formatProfessionalSignal(signal) {
        const directionEmoji = signal.direction === 'LONG' ? '🟢' : '🔴';
        const strengthEmoji = this.getStrengthEmoji(signal.confidence);
        
        return `
🤖 <b>DEF BINANCE PROFESSIONAL</b>
${directionEmoji} <b>${signal.direction} ${signal.symbol}</b>

📊 <b>ANÁLISIS TÉCNICO:</b>
• Confianza: ${signal.confidence}% ${strengthEmoji}
• Precio Actual: $${signal.currentPrice}
• Timeframe: ${signal.timeframe}

🎯 <b>SOPORTES Y RESISTENCIAS:</b>
• Soporte: $${signal.support}
• Resistencia: $${signal.resistance}
• Zona Crítica: $${signal.criticalZone}

📈 <b>INDICADORES:</b>
• RSI: ${signal.rsi} ${this.getRSIStatus(signal.rsi)}
• MACD: ${signal.macd} ${signal.macdSignal}
• Bollinger: ${signal.bollingerPosition}
• Volume: ${signal.volumeAnalysis}

⚡ <b>ACCIÓN DEL PRECIO:</b>
${signal.priceAction}

🎲 <b>ESTRATEGIA:</b>
• Entry: $${signal.entryPrice}
• Stop Loss: $${signal.stopLoss}
• Take Profit: $${signal.takeProfit}
• Risk/Reward: 1:${signal.riskReward}

⏰ <i>Análisis: ${new Date().toLocaleString()}</i>
🔥 <i>Señal automática - Verificar antes de operar</i>
        `.trim();
    }

    getStrengthEmoji(confidence) {
        if (confidence >= 90) return '🔥🔥🔥';
        if (confidence >= 80) return '🔥🔥';
        if (confidence >= 70) return '🔥';
        return '⚡';
    }

    getRSIStatus(rsi) {
        if (rsi < 30) return '(Oversold 📉)';
        if (rsi > 70) return '(Overbought 📈)';
        return '(Neutral ⚖️)';
    }

    checkHourlyLimit() {
        const currentHour = new Date().getHours();
        if (currentHour !== this.signalCount.lastHour) {
            this.signalCount.hourly = 0;
            this.signalCount.lastHour = currentHour;
        }
        
        return this.signalCount.hourly < process.env.MAX_SIGNALS_PER_HOUR;
    }

    async saveAnalysis(signal, messageId) {
        try {
            const analysisData = {
                timestamp: new Date().toISOString(),
                messageId: messageId,
                signal: signal,
                processed: true
            };
            
            const filename = `./data/analysis/${signal.symbol}_${Date.now()}.json`;
            await fs.writeJSON(filename, analysisData, { spaces: 2 });
            
        } catch (error) {
            this.logger.error('Error guardando análisis:', error);
        }
    }

    async manualAnalysis(chatId, symbol) {
        try {
            await this.bot.sendMessage(chatId, `🔍 Analizando ${symbol}...`);
            await this.performProfessionalAnalysis(symbol, 'manual');
            
        } catch (error) {
            await this.bot.sendMessage(chatId, `❌ Error analizando ${symbol}: ${error.message}`);
        }
    }

    async testSignal(chatId) {
        try {
            await this.bot.sendMessage(chatId, `🧪 Generando señal de prueba...`);
            
            // Simular análisis de BTCUSDT
            const mockAnalysis = {
                symbol: 'BTCUSDT',
                currentPrice: '67250.50',
                timeframe: '15m',
                rsi: 45,
                macd: 'BULLISH',
                bollingerPosition: 'Mitad superior',
                volumeAnalysis: 'Alto',
                priceChange: 1.2,
                volumeIncrease: true,
                volatility: 0.025
            };

            // Generar señal
            const signal = await this.signalGenerator.generateProfessionalSignal(mockAnalysis);
            
            if (signal) {
                // Enviar al grupo f77
                const f77ChatId = process.env.TELEGRAM_CHAT_ID_F77;
                await this.sendProfessionalSignal(signal);
                await this.bot.sendMessage(chatId, `✅ Señal de prueba enviada al grupo f77`);
            }
            
        } catch (error) {
            await this.bot.sendMessage(chatId, `❌ Error en prueba: ${error.message}`);
        }
    }

    async createTestSignal(chatId) {
        try {
            await this.bot.sendMessage(chatId, `🧪 Creando señal de prueba completa...`);
            
            // Crear una señal realista de BTCUSDT
            const testSignalText = `📥 #BTCUSDT 🟢 LONG

🎯 ENTRADA
  1⃣  $ 67250.00
  2⃣  $ 66800.00

🚀 TP'S
  1⃣  5 % ($ 70612.50)
  2⃣  10 % ($ 73975.00)

Apalancamiento máximo 10 X

🛑 STOP LOSS: 2.5 % ($ 65568.75)`;

            await this.bot.sendMessage(chatId, `📝 Señal de prueba creada:\n\n${testSignalText}`);
            
            // Simular el procesamiento como si viniera del grupo
            console.log(chalk.blue('🧪 Procesando señal de prueba...'));
            
            // Extraer información de la señal
            const symbol = this.extractSymbolFromText(testSignalText);
            const signalInfo = this.extractSignalInfo(testSignalText);
            
            if (symbol) {
                console.log(chalk.green(`🎯 Token detectado en prueba: ${symbol}`));
                await this.performUltraFastAnalysis(symbol, signalInfo, 'test_signal');
                await this.bot.sendMessage(chatId, `✅ Señal procesada y enviada al bot F77`);
            } else {
                await this.bot.sendMessage(chatId, `❌ No se pudo extraer el símbolo de la señal`);
            }
            
        } catch (error) {
            console.error('Error creando señal de prueba:', error);
            await this.bot.sendMessage(chatId, `❌ Error creando señal: ${error.message}`);
        }
    }

    async sendAutomaticTestSignal() {
        try {
            console.log(chalk.blue('🚀 Enviando señal de prueba automática...'));
            
            // Crear una señal realista de BTCUSDT
            const testSignalText = `📥 #BTCUSDT 🟢 LONG

🎯 ENTRADA
  1⃣  $ 67250.00
  2⃣  $ 66800.00

🚀 TP'S
  1⃣  5 % ($ 70612.50)
  2⃣  10 % ($ 73975.00)

Apalancamiento máximo 10 X

🛑 STOP LOSS: 2.5 % ($ 65568.75)`;

            console.log(chalk.yellow('📝 Señal de prueba creada automáticamente'));
            
            // Extraer información de la señal
            const symbol = this.extractSymbolFromText(testSignalText);
            const signalInfo = this.extractSignalInfo(testSignalText);
            
            if (symbol) {
                console.log(chalk.green(`🎯 Token detectado automáticamente: ${symbol}`));
                await this.performUltraFastAnalysis(symbol, signalInfo, 'auto_test');
                console.log(chalk.green('✅ Señal de prueba procesada y enviada automáticamente'));
            } else {
                console.log(chalk.red('❌ No se pudo extraer el símbolo de la señal automática'));
            }
            
        } catch (error) {
            console.error(chalk.red('Error enviando señal automática:'), error);
        }
    }

    async testDirectMessage() {
        try {
            const chatId = process.env.TELEGRAM_CHAT_ID_F77;
            console.log(chalk.blue(`🧪 Probando envío directo a chat ${chatId}...`));
            
            await this.bot.sendMessage(chatId, `🧪 Mensaje de prueba - ${new Date().toLocaleTimeString()}`);
            console.log(chalk.green('✅ Mensaje de prueba enviado correctamente'));
            
        } catch (error) {
            console.error(chalk.red('❌ Error enviando mensaje de prueba:'), error);
            console.log(chalk.yellow('💡 Verifica que el token del bot sea correcto'));
        }
    }

    async checkGroupAccess(chatId) {
        try {
            const sourceChannelId = process.env.SOURCE_CHANNEL_ID;
            const f77ChatId = process.env.TELEGRAM_CHAT_ID_F77;
            
            await this.bot.sendMessage(chatId, `🔍 Verificando acceso a grupos...`);
            
            let message = `📊 <b>DIAGNÓSTICO DEL BOT</b>\n\n`;
            
            // Verificar grupo fuente
            try {
                const sourceChat = await this.bot.getChat(sourceChannelId);
                message += `✅ <b>Grupo Fuente:</b> ${sourceChat.title || 'Sin título'}\n`;
                message += `📋 ID: ${sourceChannelId}\n`;
                message += `👥 Tipo: ${sourceChat.type}\n\n`;
            } catch (error) {
                message += `❌ <b>Grupo Fuente:</b> No accesible\n`;
                message += `📋 ID: ${sourceChannelId}\n`;
                message += `🚫 Error: ${error.message}\n\n`;
            }
            
            // Verificar grupo f77
            try {
                const f77Chat = await this.bot.getChat(f77ChatId);
                message += `✅ <b>Grupo F77:</b> ${f77Chat.title || 'Sin título'}\n`;
                message += `📋 ID: ${f77ChatId}\n`;
                message += `👥 Tipo: ${f77Chat.type}\n\n`;
            } catch (error) {
                message += `❌ <b>Grupo F77:</b> No accesible\n`;
                message += `📋 ID: ${f77ChatId}\n`;
                message += `🚫 Error: ${error.message}\n\n`;
            }
            
            // Información del chat actual
            message += `💬 <b>Chat Actual:</b>\n`;
            message += `📋 ID: ${chatId}\n`;
            message += `🤖 Bot funcionando: ✅\n`;
            
            await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
            
        } catch (error) {
            await this.bot.sendMessage(chatId, `❌ Error en verificación: ${error.message}`);
        }
    }

    sendWelcomeMessage(chatId) {
        const message = `
🤖 <b>DEF BINANCE PROFESSIONAL BOT</b>

🎯 <b>Funciones:</b>
• Análisis técnico profesional
• Detección automática de señales
• Soportes y resistencias
• Predicción SHORT/LONG

📊 <b>Comandos:</b>
/status - Estado del bot
/analyze SYMBOL - Análisis manual
/test - Enviar señal de prueba
/check - Verificar acceso a grupos

🚀 <b>Trading Automático:</b>
/trading_enable - Habilitar trading automático
/trading_disable - Deshabilitar trading automático
/trading_stats - Estadísticas de trading

🔥 <b>Bot activo y monitoreando...</b>
        `;
        
        this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    }

    sendStatusMessage(chatId) {
        const message = `
📊 <b>ESTADO DEL BOT</b>

🟢 Estado: Activo
📈 Señales enviadas (hora): ${this.signalCount.hourly}/${process.env.MAX_SIGNALS_PER_HOUR}
🎯 Confianza mínima: ${process.env.MIN_CONFIDENCE_LEVEL}%
⏰ Último reinicio: ${new Date().toLocaleString()}

🔥 <b>Monitoreando Grupo de Señales</b>
        `;
        
        this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    }

    start() {
        this.isRunning = true;
        this.logger.info('🚀 Bot DefBinance Professional iniciado correctamente');
        this.logger.info('📊 Escuchando canales fuente...');
        this.logger.info('⚡ Sistema SmartMoney activo (80%+)');
        this.logger.info('⚡ Solo SmartMoney activo (IA eliminada) + FIBONACCI 4H');
        
        // Limpiar señales procesadas cada hora
        setInterval(() => {
            this.processedSignals.clear();
            this.logger.info('🧹 Cache de señales limpiado');
        }, 3600000); // 1 hora
    }

    async findVolumenGroup(chatId) {
        try {
            await this.bot.sendMessage(chatId, `🔍 Buscando subgrupo "VOLUMEN"...`);
            
            if (!this.telegramClient) {
                await this.bot.sendMessage(chatId, `❌ Telegram API no disponible`);
                return;
            }

            const dialogs = await this.telegramClient.getDialogs({ limit: 200 });
            
            let message = `📋 <b>BUSCANDO SUBGRUPO "VOLUMEN"</b>\n\n`;
            let found = false;
            
            for (const dialog of dialogs) {
                const entity = dialog.entity;
                const title = entity.title || '';
                
                if (title.toLowerCase().includes('volumen') || 
                    title.toLowerCase().includes('volume') ||
                    title.toUpperCase().includes('VOLUMEN')) {
                    
                    found = true;
                    const id = entity.id ? `-100${entity.id}` : 'Sin ID';
                    const type = entity.className;
                    
                    message += `✅ <b>ENCONTRADO: ${title}</b>\n`;
                    message += `   📋 ID: <code>${id}</code>\n`;
                    message += `   👥 Tipo: ${type}\n`;
                    message += `   🔗 Enlace: https://t.me/c/${id.replace('-100', '')}/1\n\n`;
                    
                    if (title.toLowerCase() === 'volumen') {
                        message += `🎯 <b>RECOMENDADO:</b> Este es el subgrupo correcto\n\n`;
                    }
                }
            }
            
            if (!found) {
                message += `❌ No se encontró subgrupo "VOLUMEN"\n`;
                message += `💡 Usa /listgroups para ver todos los grupos\n`;
            }
            
            await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
            
        } catch (error) {
            await this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    // 📡 ENVIAR SEÑAL IA AL CANAL F77
    async sendAISignalToF77(symbol, aiAnalysis) {
        try {
            const directionEmoji = aiAnalysis.action === 'LONG' ? '🟢' : aiAnalysis.action === 'SHORT' ? '🔴' : '⚪';
            
            const message = `
🤖 <b>RECOMENDACIÓN IA GROQ</b>
${directionEmoji} <b>${symbol}</b>

📊 <b>Acción:</b> ${aiAnalysis.action}
📈 <b>Confianza IA:</b> ${aiAnalysis.confidence}%
💰 <b>Entrada:</b> $${aiAnalysis.entry}
🛑 <b>Stop Loss:</b> $${aiAnalysis.stopLoss}
🎯 <b>Take Profit:</b> $${aiAnalysis.takeProfit}

🧠 <b>Razón IA:</b> ${aiAnalysis.reason}

⚡ <i>Ejecutando automáticamente...</i>
            `.trim();

            await this.bot.sendMessage(process.env.TELEGRAM_CHAT_ID_F77, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });

            this.logger.info(`📡 Señal IA enviada al F77: ${symbol} - ${aiAnalysis.action}`);

        } catch (error) {
            this.logger.error(`❌ Error enviando señal IA al F77:`, error.message);
        }
    }

    // 💰 CALCULAR POSICIÓN INTELIGENTE CON BINANCE API
    async calculateIntelligentPosition(symbol, price, balance = 20) {
        try {
            this.logger.info(`💰 Calculando posición para ${symbol} - Balance: $${balance}`);
            
            // 1. Obtener información del símbolo de Binance Futures
            const exchangeInfo = await this.binanceAPI.getFuturesExchangeInfo();
            const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === symbol);
            
            if (!symbolInfo) {
                throw new Error(`Símbolo ${symbol} no encontrado`);
            }
            
            // 2. Extraer límites del símbolo
            const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
            const minQty = parseFloat(lotSizeFilter.minQty);
            const stepSize = parseFloat(lotSizeFilter.stepSize);
            
            // 3. Obtener apalancamiento máximo
            let maxLeverage = 20; // Por defecto
            try {
                const leverageInfo = await this.binanceAPI.getLeverageBracket(symbol);
                maxLeverage = Math.min(leverageInfo[0].maxLeverage || 20, 50); // Máximo 50x
            } catch (e) {
                this.logger.warn(`⚠️ No se pudo obtener leverage para ${symbol}, usando 20x`);
            }
            
            // 4. Calcular posición objetivo ($0.70 - $1.00 USD)
            const targetUSD = 0.85; // $0.85 USD por trade
            const leverage = 15; // FORZAR 15x para coincidir con cálculos SL/TP
            
            // 5. Calcular cantidad exacta
            const notionalValue = targetUSD * leverage; // Valor nocional con apalancamiento
            const quantity = notionalValue / price; // Cantidad en el activo base
            
            // 6. Ajustar a step size de Binance
            const adjustedQuantity = Math.max(
                minQty,
                Math.floor(quantity / stepSize) * stepSize
            );
            
            this.logger.info(`📊 ${symbol}: Precio $${price}, Leverage ${leverage}x`);
            this.logger.info(`💰 Posición: $${targetUSD} USD = ${adjustedQuantity} ${symbol.replace('USDT', '')}`);
            this.logger.info(`📏 Límites: Min ${minQty}, Step ${stepSize}`);
            
            return {
                quantity: adjustedQuantity,
                leverage: leverage,
                notionalValue: adjustedQuantity * price,
                targetUSD: targetUSD
            };
            
        } catch (error) {
            this.logger.error(`❌ Error calculando posición inteligente:`, error.message);
            // Fallback seguro
            return {
                quantity: 0.001,
                leverage: 20,
                notionalValue: 0.001 * price,
                targetUSD: 0.5
            };
        }
    }

    // 🤖 EJECUTAR TRADE CON ANÁLISIS IA
    async executeAIScalpingTrade(symbol, aiAnalysis) {
        try {
            this.logger.info(`🤖 Ejecutando trade IA: ${aiAnalysis.action} ${symbol} - Confianza: ${aiAnalysis.confidence}%`);
            
            // Configurar parámetros específicos de IA
            const tradeParams = {
                symbol: symbol,
                side: aiAnalysis.action === 'LONG' ? 'BUY' : 'SELL',
                quantity: await this.autoTrader.calculateMinQuantity(symbol, aiAnalysis.entry),
                entryPrice: aiAnalysis.entry,
                stopLoss: aiAnalysis.stopLoss,
                takeProfit: aiAnalysis.takeProfit,
                confidence: aiAnalysis.confidence,
                reason: aiAnalysis.reason,
                type: 'AI_SCALPING'
            };

            // Ejecutar orden con AutoTrader
            const order = await this.autoTrader.executeMarketOrder(
                tradeParams.symbol,
                tradeParams.side,
                tradeParams.quantity,
                tradeParams.confidence
            );

            if (order) {
                // Notificar ejecución exitosa
                const message = `
🤖 <b>SCALPING IA EJECUTADO</b>

🎯 <b>${symbol}</b>
📊 Acción: ${aiAnalysis.action}
💰 Entrada: $${aiAnalysis.entry}
🛑 Stop Loss: $${aiAnalysis.stopLoss}
🎯 Take Profit: $${aiAnalysis.takeProfit}
📈 Confianza: ${aiAnalysis.confidence}%
🧠 Razón: ${aiAnalysis.reason}

⚡ <i>Análisis IA + Ejecución automática</i>
                `.trim();

                await this.bot.sendMessage(process.env.TELEGRAM_CHAT_ID_F77, message, {
                    parse_mode: 'HTML'
                });

                this.logger.info(`✅ Trade IA ejecutado exitosamente: ${order.orderId}`);
            }

        } catch (error) {
            this.logger.error(`❌ Error ejecutando trade IA para ${symbol}:`, error.message);
        }
    }

    // 🚀 MÉTODOS DE TRADING AUTOMÁTICO
    async handleTradingEnable(chatId) {
        try {
            this.autoTrader.enableTrading(true);
            process.env.AUTO_TRADING_ENABLED = 'true'; // Persistir estado
            
            const stats = this.autoTrader.getStats();
            const message = `
🚀 <b>TRADING AUTOMÁTICO INTELIGENTE HABILITADO</b>

🤖 <b>CONFIGURACIÓN INTELIGENTE:</b>
💰 Monto: $${stats.positionSizeUSD} USD por operación
⚡ Apalancamiento: ${stats.leverage === 'DYNAMIC' ? 'DINÁMICO (20x-50x según activo)' : stats.leverage + 'x'}
🛑 Stop Loss: ${stats.stopLossDynamic ? 'DINÁMICO (según análisis IA)' : 'FIJO'}
🎯 Take Profit: ${stats.takeProfitDynamic ? 'DINÁMICO (según análisis IA)' : 'FIJO'}
📊 Confianza mínima: ${stats.minConfidence}% (ultra-selectivo)
📈 Máx. operaciones/día: ${stats.maxDailyTrades}
🔒 Máx. posiciones abiertas: ${stats.maxOpenPositions}

✅ <b>El bot ejecutará operaciones automáticamente SOLO con señales IA de máxima calidad (${stats.minConfidence}%+)</b>

🎯 <b>Sistema inteligente:</b> Consulta Binance API en tiempo real para cálculo óptimo de posición y apalancamiento

⚠️ <i>Usa esta función bajo tu propia responsabilidad</i>
            `.trim();
            
            await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
            this.logger.info('🚀 Trading automático HABILITADO por usuario');
            
        } catch (error) {
            await this.bot.sendMessage(chatId, `❌ Error habilitando trading: ${error.message}`);
        }
    }

    async handleTradingDisable(chatId) {
        try {
            this.autoTrader.enableTrading(false);
            process.env.AUTO_TRADING_ENABLED = 'false'; // Persistir estado
            
            const message = `
🛑 <b>TRADING AUTOMÁTICO DESHABILITADO</b>

✅ El bot ya NO ejecutará operaciones automáticamente
📊 Solo enviará análisis y recomendaciones
🔒 Todas las funciones de seguridad mantienen activas

💡 Para reactivar usa: /trading_enable
            `.trim();
            
            await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
            this.logger.info('🛑 Trading automático DESHABILITADO por usuario');
            
        } catch (error) {
            await this.bot.sendMessage(chatId, `❌ Error deshabilitando trading: ${error.message}`);
        }
    }

    async handleTradingStats(chatId) {
        try {
            const stats = this.autoTrader.getStats();
            
            const message = `
📊 <b>ESTADÍSTICAS DE TRADING AUTOMÁTICO</b>

🔄 <b>Estado:</b> ${stats.tradingEnabled ? '✅ HABILITADO' : '🛑 DESHABILITADO'}

📈 <b>Operaciones Hoy:</b> ${stats.dailyTrades}/${stats.maxDailyTrades}
🔒 <b>Posiciones Abiertas:</b> ${stats.openPositions}/${stats.maxOpenPositions}
📊 <b>Confianza Mínima:</b> ${stats.minConfidence}%

💰 <b>Configuración INTELIGENTE:</b>
• Monto: $${stats.positionSizeUSD} USD por operación
• Apalancamiento: ${stats.leverage === 'DYNAMIC' ? 'DINÁMICO (20x-50x)' : stats.leverage + 'x'}
• Stop Loss: ${stats.stopLossDynamic ? 'DINÁMICO (según IA)' : 'FIJO'}
• Take Profit: ${stats.takeProfitDynamic ? 'DINÁMICO (según IA)' : 'FIJO'}
• Sistema: ${stats.useIntelligentSizing ? '🤖 INTELIGENTE' : '📊 BÁSICO'}

⚠️ <b>Límites de Seguridad:</b>
• Máx. ${stats.maxDailyTrades} operaciones/día
• Máx. ${stats.maxOpenPositions} posiciones simultáneas
• Solo señales IA ${stats.minConfidence}%+ confianza
• Cálculo automático según Binance API
            `.trim();
            
            await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
            
        } catch (error) {
            await this.bot.sendMessage(chatId, `❌ Error obteniendo estadísticas: ${error.message}`);
        }
    }



    stop() {
        this.isRunning = false;
        this.bot.stopPolling();
        this.logger.info('🛑 Bot DefBinance Professional detenido');
    }

    // 🛡️ VERIFICAR Y CORREGIR POSICIONES SIN SL/TP
    async handleFixSLTP(chatId) {
        try {
            if (!this.autoTrader || !this.autoTrader.isEnabled()) {
                await this.bot.sendMessage(chatId, '❌ Trading automático no está habilitado');
                return;
            }

            const message = `
🔍 <b>VERIFICANDO POSICIONES SIN SL/TP</b>

⏳ Escaneando todas las posiciones abiertas...
🛡️ Aplicando SL/TP de emergencia si es necesario...

<i>Esto puede tomar unos segundos...</i>
            `.trim();

            await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });

            // Ejecutar verificación
            await this.autoTrader.checkAndFixPositionsWithoutSLTP();

            const successMessage = `
✅ <b>VERIFICACIÓN COMPLETADA</b>

🛡️ <b>TODAS LAS POSICIONES VERIFICADAS</b>
📊 SL/TP aplicados donde era necesario
🔧 Configuración actual: SL=$0.15, TP=$0.37

💡 <i>Revisa los logs para detalles específicos</i>
            `.trim();

            await this.bot.sendMessage(chatId, successMessage, { parse_mode: 'HTML' });

        } catch (error) {
            this.logger.error('Error verificando SL/TP:', error);
            await this.bot.sendMessage(chatId, `❌ Error verificando SL/TP: ${error.message}`);
        }
    }

    // 🛡️ VERIFICAR CONFLICTOS SMARTMONEY vs IA SCALPING
    async checkSmartMoneyConflict(symbol, smartMoneyAction) {
        try {
            if (!this.autoTrader) return false;
            
            // Obtener posiciones abiertas del símbolo
            const positions = await this.autoTrader.getOpenPositions();
            
            if (!positions || positions.length === 0) {
                return false; // No hay posiciones, no hay conflicto
            }
            
            const targetPosition = positions.find(pos => pos.symbol === symbol);
            if (!targetPosition || parseFloat(targetPosition.positionAmt) === 0) {
                return false; // No hay posición en este símbolo
            }
            
            const currentPositionAmt = parseFloat(targetPosition.positionAmt);
            const isCurrentLong = currentPositionAmt > 0;
            const isSmartMoneyLong = smartMoneyAction.includes('LONG');
            
            // Verificar si son direcciones opuestas
            if (isCurrentLong !== isSmartMoneyLong) {
                this.logger.warn(`🔍 CONFLICTO DETECTADO: ${symbol}`);
                this.logger.warn(`📊 Posición actual: ${isCurrentLong ? 'LONG' : 'SHORT'} (${currentPositionAmt})`);
                this.logger.warn(`📊 SmartMoney quiere: ${isSmartMoneyLong ? 'LONG' : 'SHORT'}`);
                return true; // HAY CONFLICTO
            }
            
            return false; // No hay conflicto
            
        } catch (error) {
            this.logger.error(`❌ Error verificando conflictos SmartMoney ${symbol}:`, error.message);
            return true; // En caso de error, evitar trade por seguridad
        }
    }

    // MÉTODOS DE IA SCALPING ELIMINADOS COMPLETAMENTE

    // 🔢 ANÁLISIS FIBONACCI ESPECÍFICO
    async analyzeFibonacci(symbol, signalInfo) {
        try {
            this.logger.info(`🔢 INICIANDO ANÁLISIS FIBONACCI 4H: ${symbol}`);
            
            // Obtener datos de 4H para FIBONACCI
            let klines4h = await this.binanceAPI.getFuturesKlines(symbol, '4h', 100);
            this.logger.info(`📊 Klines 4H recibidos: ${klines4h?.length || 0} velas para ${symbol}`);
            
            if (klines4h && klines4h.length > 0) {
                this.logger.info(`📊 Primera vela 4H: ${JSON.stringify(klines4h[0])}`);
            }
            
            // Si no hay datos 4H suficientes, intentar con 1H
            if (!klines4h || klines4h.length < 50) {
                this.logger.warn(`⚠️ Datos 4H insuficientes (${klines4h?.length || 0}), intentando con 1H`);
                klines4h = await this.binanceAPI.getFuturesKlines(symbol, '1h', 200);
                this.logger.info(`📊 Klines 1H recibidos: ${klines4h?.length || 0} velas para ${symbol}`);
                
                if (!klines4h || klines4h.length < 50) {
                    this.logger.error(`❌ Datos insuficientes para FIBONACCI - 4H: ${klines4h?.length || 0}`);
                    return;
                }
            }
            
            // Validar que los datos no estén vacíos o corruptos
            const validKlines = klines4h.filter(k => {
                if (!k || k.length < 6) return false;
                const close = parseFloat(k[4]);
                const high = parseFloat(k[2]);
                const low = parseFloat(k[3]);
                return !isNaN(close) && !isNaN(high) && !isNaN(low) && close > 0 && high > 0 && low > 0;
            });
            this.logger.info(`📊 Velas válidas: ${validKlines.length}/${klines4h.length} para ${symbol}`);
            
            if (validKlines.length < 20) {
                this.logger.error(`❌ Muy pocas velas válidas para FIBONACCI: ${validKlines.length}`);
                // Mostrar algunas velas para debug
                if (klines4h.length > 0) {
                    this.logger.info(`📊 Ejemplo vela: ${JSON.stringify(klines4h[0])}`);
                    this.logger.info(`📊 Close: ${parseFloat(klines4h[0][4])}, High: ${parseFloat(klines4h[0][2])}, Low: ${parseFloat(klines4h[0][3])}`);
                }
                return;
            }
            
            // Usar solo velas válidas
            klines4h = validKlines;
            
            const prices = klines4h.map(k => parseFloat(k[4])).filter(p => !isNaN(p)); // Precios de cierre
            const highs = klines4h.map(k => parseFloat(k[2])).filter(p => !isNaN(p));  // Máximos
            const lows = klines4h.map(k => parseFloat(k[3])).filter(p => !isNaN(p));   // Mínimos
            
            // Validar que tenemos datos válidos
            if (prices.length === 0 || highs.length === 0 || lows.length === 0) {
                this.logger.error(`❌ Datos 4H inválidos para FIBONACCI - precios: ${prices.length}, highs: ${highs.length}, lows: ${lows.length}`);
                return;
            }
            
            // Encontrar swing high y swing low recientes
            const recentHigh = Math.max(...highs.slice(-20));
            const recentLow = Math.min(...lows.slice(-20));
            const currentPrice = prices[prices.length - 1];
            
            // Validar que los valores no son NaN
            if (isNaN(recentHigh) || isNaN(recentLow) || isNaN(currentPrice)) {
                this.logger.error(`❌ Valores FIBONACCI inválidos - High: ${recentHigh}, Low: ${recentLow}, Current: ${currentPrice}`);
                return;
            }
            
            // Calcular niveles de FIBONACCI
            const fibLevels = this.calculateFibonacciLevels(recentHigh, recentLow, signalInfo.direction);
            
            // Determinar nivel más efectivo basado en datos históricos
            const mostEffectiveLevel = await this.findMostEffectiveFibLevel(symbol, fibLevels, prices);
            
            // Analizar posición actual del precio
            const priceAnalysis = this.analyzePricePosition(currentPrice, fibLevels, mostEffectiveLevel);
            
            this.logger.info(`🔢 FIBONACCI CALCULADO:`);
            this.logger.info(`📊 Swing High: $${recentHigh.toFixed(6)}`);
            this.logger.info(`📊 Swing Low: $${recentLow.toFixed(6)}`);
            this.logger.info(`💰 Precio Actual: $${currentPrice.toFixed(6)}`);
            this.logger.info(`🎯 Nivel más efectivo: ${mostEffectiveLevel.level} ($${mostEffectiveLevel.price.toFixed(6)})`);
            this.logger.info(`📍 ${priceAnalysis.decision}`);
            
            // DECISIÓN FIBONACCI
            if (priceAnalysis.atOptimalLevel) {
                this.logger.info(`✅ DECISIÓN TOMADA POR FIBONACCI - Precio en zona óptima`);
            } else {
                this.logger.info(`⏳ ESPERAR - ${priceAnalysis.waitRecommendation}`);
            }
            
            // Agregar información FIBONACCI a signalInfo
            signalInfo.fibonacci = {
                levels: fibLevels,
                mostEffective: mostEffectiveLevel,
                currentAnalysis: priceAnalysis,
                swingHigh: recentHigh,
                swingLow: recentLow
            };
            
        } catch (error) {
            this.logger.error(`❌ Error en análisis FIBONACCI:`, error.message);
        }
    }
    
    // 📊 CALCULAR NIVELES DE FIBONACCI
    calculateFibonacciLevels(high, low, direction) {
        // Validar inputs
        if (isNaN(high) || isNaN(low) || high <= 0 || low <= 0) {
            this.logger.error(`❌ Inputs FIBONACCI inválidos - High: ${high}, Low: ${low}`);
            return {};
        }
        
        // Asegurar que high > low
        if (high <= low) {
            this.logger.error(`❌ High debe ser mayor que Low - High: ${high}, Low: ${low}`);
            return {};
        }
        
        const range = high - low;
        
        // Niveles estándar de Fibonacci
        const levels = {
            '0.0': direction === 'LONG' ? low : high,
            '0.236': direction === 'LONG' ? low + (range * 0.236) : high - (range * 0.236),
            '0.382': direction === 'LONG' ? low + (range * 0.382) : high - (range * 0.382),
            '0.500': direction === 'LONG' ? low + (range * 0.500) : high - (range * 0.500),
            '0.618': direction === 'LONG' ? low + (range * 0.618) : high - (range * 0.618),
            '0.786': direction === 'LONG' ? low + (range * 0.786) : high - (range * 0.786),
            '1.0': direction === 'LONG' ? high : low
        };
        
        // Validar que todos los niveles son números válidos
        for (const [level, price] of Object.entries(levels)) {
            if (isNaN(price)) {
                this.logger.error(`❌ Nivel FIBONACCI ${level} inválido: ${price}`);
                return {};
            }
        }
        
        return levels;
    }
    
    // 🎯 ENCONTRAR NIVEL MÁS EFECTIVO
    async findMostEffectiveFibLevel(symbol, fibLevels, historicalPrices) {
        try {
            // Analizar rebotes históricos en cada nivel
            const levelEffectiveness = {};
            
            Object.keys(fibLevels).forEach(level => {
                const price = fibLevels[level];
                let bounces = 0;
                
                // Contar cuántas veces el precio rebotó en este nivel (±0.5%)
                for (let i = 1; i < historicalPrices.length - 1; i++) {
                    const prevPrice = historicalPrices[i - 1];
                    const currentPrice = historicalPrices[i];
                    const nextPrice = historicalPrices[i + 1];
                    
                    const tolerance = price * 0.005; // 0.5% tolerancia
                    
                    if (Math.abs(currentPrice - price) <= tolerance) {
                        // Verificar si hubo rebote
                        if ((prevPrice > price && nextPrice > price) || (prevPrice < price && nextPrice < price)) {
                            bounces++;
                        }
                    }
                }
                
                levelEffectiveness[level] = {
                    level: level,
                    price: price,
                    bounces: bounces,
                    effectiveness: bounces / historicalPrices.length * 100
                };
            });
            
            // Encontrar el nivel más efectivo
            let mostEffective = { level: '0.618', price: fibLevels['0.618'], bounces: 0, effectiveness: 0 };
            
            Object.values(levelEffectiveness).forEach(levelData => {
                if (levelData.bounces > mostEffective.bounces) {
                    mostEffective = levelData;
                }
            });
            
            // Si no hay datos suficientes, usar 0.618 como default (nivel dorado)
            if (mostEffective.bounces === 0) {
                mostEffective = {
                    level: '0.618',
                    price: fibLevels['0.618'],
                    bounces: 0,
                    effectiveness: 61.8,
                    note: 'Nivel dorado (default)'
                };
            }
            
            return mostEffective;
            
        } catch (error) {
            // Fallback al nivel dorado
            return {
                level: '0.618',
                price: fibLevels['0.618'],
                bounces: 0,
                effectiveness: 61.8,
                note: 'Nivel dorado (fallback)'
            };
        }
    }
    
    // 📍 ANALIZAR POSICIÓN DEL PRECIO
    analyzePricePosition(currentPrice, fibLevels, mostEffectiveLevel) {
        const optimalPrice = mostEffectiveLevel.price;
        const optimalLevel = mostEffectiveLevel.level;
        
        // Calcular distancia al nivel óptimo
        const distance = Math.abs(currentPrice - optimalPrice);
        const percentDistance = (distance / currentPrice) * 100;
        
        let decision = '';
        let atOptimalLevel = false;
        let waitRecommendation = '';
        
        if (percentDistance < 0.5) { // Menos del 0.5% = está en el nivel
            atOptimalLevel = true;
            decision = `PRECIO EN NIVEL ÓPTIMO ${optimalLevel} - EJECUTAR TRADE`;
        } else {
            atOptimalLevel = false;
            
            if (currentPrice > optimalPrice) {
                // Precio arriba del nivel óptimo
                decision = `Precio actual $${currentPrice.toFixed(6)} ARRIBA del nivel ${optimalLevel} ($${optimalPrice.toFixed(6)})`;
                waitRecommendation = `Precio actual $${currentPrice.toFixed(6)}, nivel ${optimalLevel} en $${optimalPrice.toFixed(6)} - PONER ORDEN LIMIT`;
            } else {
                // Precio abajo del nivel óptimo
                decision = `Precio actual $${currentPrice.toFixed(6)} ABAJO del nivel ${optimalLevel} ($${optimalPrice.toFixed(6)})`;
                waitRecommendation = `Precio actual $${currentPrice.toFixed(6)}, nivel ${optimalLevel} en $${optimalPrice.toFixed(6)} - PONER ORDEN LIMIT`;
            }
        }
        
        return {
            decision: decision,
            atOptimalLevel: atOptimalLevel,
            waitRecommendation: waitRecommendation,
            optimalPrice: optimalPrice,
            optimalLevel: optimalLevel,
            currentPrice: currentPrice,
            distance: distance,
            percentDistance: percentDistance
        };
    }

    // 📍 ANALIZAR POSICIÓN DEL PRECIO
    analyzePricePosition(currentPrice, fibLevels, mostEffectiveLevel) {
    const optimalPrice = mostEffectiveLevel.price;
    const optimalLevel = mostEffectiveLevel.level;

    // Calcular distancia al nivel óptimo
    const distance = Math.abs(currentPrice - optimalPrice);
    const percentDistance = (distance / currentPrice) * 100;

    let decision = '';
    let atOptimalLevel = false;
    let waitRecommendation = '';

    if (percentDistance < 0.5) { // Menos del 0.5% = está en el nivel
        atOptimalLevel = true;
        decision = `PRECIO EN NIVEL ÓPTIMO ${optimalLevel} - EJECUTAR TRADE`;
    } else {
        atOptimalLevel = false;

        if (currentPrice > optimalPrice) {
            // Precio arriba del nivel óptimo
            decision = `Precio actual $${currentPrice.toFixed(6)} ARRIBA del nivel ${optimalLevel} ($${optimalPrice.toFixed(6)})`;
            waitRecommendation = `Precio actual $${currentPrice.toFixed(6)}, nivel ${optimalLevel} en $${optimalPrice.toFixed(6)} - PONER ORDEN LIMIT`;
        } else {
            // Precio abajo del nivel óptimo
            decision = `Precio actual $${currentPrice.toFixed(6)} ABAJO del nivel ${optimalLevel} ($${optimalPrice.toFixed(6)})`;
            waitRecommendation = `Precio actual $${currentPrice.toFixed(6)}, nivel ${optimalLevel} en $${optimalPrice.toFixed(6)} - PONER ORDEN LIMIT`;
        }
    }

    return {
        decision: decision,
        atOptimalLevel: atOptimalLevel,
        waitRecommendation: waitRecommendation,
        optimalPrice: optimalPrice,
        optimalLevel: optimalLevel,
        currentPrice: currentPrice,
        distance: distance,
        percentDistance: percentDistance
    };
    }

    // 📊 ANÁLISIS EMA CROSS ESPECÍFICO
    async analyzeEmaCross(symbol, signalInfo) {
        try {
            this.logger.info(`📊 INICIANDO ANÁLISIS EMA CROSS: ${symbol} - ${signalInfo.emaFast}/${signalInfo.emaSlow} (${signalInfo.timeframe})`);

            // Verificar que el símbolo existe en Futures antes de analizar EMA
            const isValidFutures = await this.isValidCryptoSymbol(symbol);
            if (!isValidFutures) {
                this.logger.error(`❌ ${symbol} NO disponible en Binance Futures - Saltando análisis EMA CROSS`);
                return;
            }

            let klines = await this.binanceAPI.getFuturesKlines(symbol, signalInfo.timeframe || '5m', 250);
            this.logger.info(`📊 Klines ${signalInfo.timeframe || '5m'} recibidos: ${klines?.length || 0} velas para ${symbol}`);

            if (klines && klines.length > 0) {
                this.logger.info(`📊 Primera vela ${signalInfo.timeframe || '5m'}: ${JSON.stringify(klines[0])}`);
            }

            // Si no hay datos suficientes, intentar con timeframe mayor
            if (!klines || klines.length < 200) {
                this.logger.warn(`⚠️ Datos ${signalInfo.timeframe || '5m'} insuficientes (${klines?.length || 0}), intentando con 15m`);
                klines = await this.binanceAPI.getFuturesKlines(symbol, '15m', 300);
                this.logger.info(`📊 Klines 15m recibidos: ${klines?.length || 0} velas para ${symbol}`);

                if (!klines || klines.length < 200) {
                    this.logger.error(`❌ Datos insuficientes para EMA CROSS - ${signalInfo.timeframe || '5m'}: ${klines?.length || 0}`);
                    return;
                }
            }
            
            // Validar que los datos no estén vacíos o corruptos
            let debugCount = 0;
            const validKlines = klines.filter(k => {
                if (!k || k.length < 6) return false;
                const close = parseFloat(k[4]);
                
                // Debug limitado (solo primeras 3 velas con error)
                if (isNaN(close) && debugCount < 3) {
                    this.logger.info(`🔍 DEBUG NaN #${debugCount + 1}: k[4]="${k[4]}", type=${typeof k[4]}`);
                    debugCount++;
                }
                
                return !isNaN(close) && close > 0;
            });
            this.logger.info(`📊 Velas válidas EMA: ${validKlines.length}/${klines.length} para ${symbol}`);
            
            if (validKlines.length < 50) { // Reducir umbral para testing
                this.logger.error(`❌ Muy pocas velas válidas para EMA CROSS: ${validKlines.length}`);
                // Mostrar debug detallado
                if (klines.length > 0) {
                    this.logger.info(`📊 Ejemplo vela EMA: ${JSON.stringify(klines[0])}`);
                    this.logger.info(`📊 Close raw: "${klines[0][4]}", type: ${typeof klines[0][4]}`);
                    this.logger.info(`📊 Close parsed: ${parseFloat(klines[0][4])}`);
                    this.logger.info(`📊 Close Number(): ${Number(klines[0][4])}`);
                    
                    // Intentar conversión alternativa
                    const altClose = Number(String(klines[0][4]));
                    this.logger.info(`📊 Close alternativo: ${altClose}`);
                }
                
                // FALLBACK: Si hay datos pero no son válidos, usar análisis básico
                this.logger.warn(`⚠️ FALLBACK EMA CROSS: API datos corruptos para ${symbol}`);
                
                // FALLBACK GARANTIZADO: Usar dirección de la señal original
                const fallbackDirection = signalInfo.direction || 'LONG';
                signalInfo.emaCross = {
                    type: 'FALLBACK_API_ERROR',
                    confidence: 65,
                    reason: `API Binance datos corruptos - usando dirección señal: ${fallbackDirection}`,
                    apiError: true
                };
                
                this.logger.info(`✅ DECISIÓN TOMADA POR EMA CROSS (FALLBACK) - ${fallbackDirection} con 65% confianza`);
                this.logger.info(`📊 Razón: API Binance devolvió datos undefined/corruptos`);
                return;
            }
            
            // Usar solo velas válidas
            klines = validKlines;
            
            const prices = klines.map(k => parseFloat(k[4])); // Precios de cierre
            const currentPrice = prices[prices.length - 1];
            
            // Calcular EMAs
            const emaFast = this.calculateEMA(prices, signalInfo.emaFast || 50);
            const emaSlow = this.calculateEMA(prices, signalInfo.emaSlow || 200);
            
            const currentEmaFast = emaFast[emaFast.length - 1];
            const currentEmaSlow = emaSlow[emaSlow.length - 1];
            const prevEmaFast = emaFast[emaFast.length - 2];
            const prevEmaSlow = emaSlow[emaSlow.length - 2];
            
            // Determinar tipo de cruce
            let crossType = 'NONE';
            let direction = null;
            
            if (prevEmaFast <= prevEmaSlow && currentEmaFast > currentEmaSlow) {
                crossType = 'GOLDEN_CROSS';
                direction = 'LONG';
                this.logger.info(`🟢 GOLDEN CROSS detectado - EMA ${signalInfo.emaFast} cruza ARRIBA de EMA ${signalInfo.emaSlow}`);
            } else if (prevEmaFast >= prevEmaSlow && currentEmaFast < currentEmaSlow) {
                crossType = 'DEATH_CROSS';
                direction = 'SHORT';
                this.logger.info(`🔴 DEATH CROSS detectado - EMA ${signalInfo.emaFast} cruza ABAJO de EMA ${signalInfo.emaSlow}`);
            } else if (currentEmaFast > currentEmaSlow) {
                crossType = 'ABOVE';
                direction = 'LONG';
                this.logger.info(`📈 EMA ${signalInfo.emaFast} está ARRIBA de EMA ${signalInfo.emaSlow} - Tendencia ALCISTA`);
            } else {
                crossType = 'BELOW';
                direction = 'SHORT';
                this.logger.info(`📉 EMA ${signalInfo.emaFast} está ABAJO de EMA ${signalInfo.emaSlow} - Tendencia BAJISTA`);
            }
            
            // Calcular fuerza del cruce
            const separation = Math.abs(currentEmaFast - currentEmaSlow);
            const separationPercent = (separation / currentPrice) * 100;
            
            // Determinar confianza basada en el cruce
            let confidence = 50; // Base
            
            if (crossType === 'GOLDEN_CROSS' || crossType === 'DEATH_CROSS') {
                confidence += 25; // Cruce reciente es más fuerte
                this.logger.info(`🔥 CRUCE RECIENTE detectado - +25% confianza`);
            }
            
            if (separationPercent > 0.5) {
                confidence += 15; // Separación significativa
                this.logger.info(`📊 Separación significativa ${separationPercent.toFixed(2)}% - +15% confianza`);
            }
            
            // Verificar tendencia consistente (últimas 5 velas)
            const recentEmaFast = emaFast.slice(-5);
            const recentEmaSlow = emaSlow.slice(-5);
            let consistentTrend = true;
            
            for (let i = 1; i < recentEmaFast.length; i++) {
                if (direction === 'LONG' && recentEmaFast[i] <= recentEmaSlow[i]) {
                    consistentTrend = false;
                    break;
                }
                if (direction === 'SHORT' && recentEmaFast[i] >= recentEmaSlow[i]) {
                    consistentTrend = false;
                    break;
                }
            }
            
            if (consistentTrend) {
                confidence += 10;
                this.logger.info(`✅ Tendencia consistente - +10% confianza`);
            }
            
            this.logger.info(`📊 EMA CROSS CALCULADO:`);
            this.logger.info(`📈 EMA ${signalInfo.emaFast}: $${currentEmaFast.toFixed(6)}`);
            this.logger.info(`📉 EMA ${signalInfo.emaSlow}: $${currentEmaSlow.toFixed(6)}`);
            this.logger.info(`💰 Precio Actual: $${currentPrice.toFixed(6)}`);
            this.logger.info(`🎯 Tipo de cruce: ${crossType}`);
            this.logger.info(`📊 Separación: ${separationPercent.toFixed(2)}%`);
            this.logger.info(`🔥 Confianza EMA: ${confidence}%`);
            
            // DECISIÓN EMA CROSS
            if (confidence >= 70) {
                this.logger.info(`✅ DECISIÓN TOMADA POR EMA CROSS - ${direction} con ${confidence}% confianza`);
            } else {
                this.logger.info(`⏳ EMA CROSS débil - Confianza ${confidence}% < 70%`);
            }
            
            // Agregar información EMA CROSS a signalInfo
            signalInfo.direction = direction; // Establecer dirección basada en EMA
            signalInfo.emaCross = {
                type: crossType,
                emaFast: currentEmaFast,
                emaSlow: currentEmaSlow,
                separation: separationPercent,
                confidence: confidence,
                timeframe: timeframe
            };
            
        } catch (error) {
            this.logger.error(`❌ Error en análisis EMA CROSS:`, error.message);
        }
    }
    
    // 📈 CALCULAR EMA (Exponential Moving Average)
    calculateEMA(prices, period) {
        const ema = [];
        const multiplier = 2 / (period + 1);
        
        // Primera EMA es SMA
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += prices[i];
        }
        ema[period - 1] = sum / period;
        
        // Calcular EMAs restantes
        for (let i = period; i < prices.length; i++) {
            ema[i] = (prices[i] * multiplier) + (ema[i - 1] * (1 - multiplier));
        }
        
        return ema;
    }

    // TODOS LOS MÉTODOS DE IA SCALPING ELIMINADOS
}

// Servidor web simple para Render
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.json({
        status: 'Bot DefBinance funcionando correctamente',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', bot: 'running' });
});

app.get('/ip', async (req, res) => {
    try {
        const axios = require('axios');
        const ipResponse = await axios.get('https://api.ipify.org?format=json');
        res.json({ 
            server_ip: ipResponse.data.ip,
            timestamp: new Date().toISOString(),
            region: 'Frankfurt EU Central'
        });
    } catch (error) {
        res.json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor web iniciado en puerto ${PORT}`);
});

// Keep-alive ping cada 3 minutos para evitar spin down
setInterval(() => {
    const axios = require('axios');
    const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    
    axios.get(`${url}/health`)
        .then(() => console.log('🏓 Keep-alive ping exitoso'))
        .catch(() => console.log('🏓 Keep-alive ping (manteniendo despierto)'));
}, 3 * 60 * 1000); // 3 minutos

const bot = new DefBinanceProfessionalBot();
bot.start();

// Manejo de señales del sistema
process.on('SIGINT', () => {
    console.log(chalk.yellow('\n👋 Cerrando DefBinance Professional Bot...'));
    bot.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log(chalk.yellow('\n⚠️ SIGTERM recibido - Cerrando gracefully...'));
    bot.stop();
    process.exit(0);
});

// Monitoreo de memoria cada 30 segundos
setInterval(() => {
    const memUsage = process.memoryUsage();
    const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    console.log(`📊 Memoria: ${memMB}MB`);
    
    // Si usa más de 400MB, forzar garbage collection
    if (memMB > 400 && global.gc) {
        global.gc();
        console.log('🧹 Garbage collection ejecutado');
    }
}, 30000);

process.on('uncaughtException', (error) => {
    console.error(chalk.red('Error no capturado:'), error);
});

module.exports = DefBinanceProfessionalBot;
