const TelegramBot = require('node-telegram-bot-api');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config({ path: './config.env' });

const TechnicalAnalyzer = require('./src/TechnicalAnalyzer');
const ImageProcessor = require('./src/ImageProcessor');
const BinanceAPI = require('./src/BinanceAPI');
const SignalGenerator = require('./src/SignalGenerator');
const SmartMoneyAnalyzer = require('./src/SmartMoneyAnalyzer');
const Logger = require('./src/Logger');
const AutoTrader = require('./src/AutoTrader');

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
            const symbol = this.extractSymbolFromText(text);
            
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
                    symbol = this.extractSymbolFromText(text);
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

    extractSymbolFromText(text) {
        try {
            // Patrones para detectar símbolos de criptomonedas (incluyendo formato #AGTUSDT)
            const patterns = [
                /#([A-Z]{2,10}USDT)/gi,          // #AGTUSDT, #BTCUSDT
                /([A-Z]{2,10})USDT/gi,           // BTCUSDT, ETHUSDT
                /([A-Z]{2,10})\/USDT/gi,         // BTC/USDT
                /([A-Z]{2,10})\s*USDT/gi,        // BTC USDT
                /\$([A-Z]{2,10})/gi,             // $BTC
                /([A-Z]{2,10})\s*PERP/gi,        // BTC PERP
                /([A-Z]{2,10})\s*futures?/gi,    // BTC futures
                /signal[:\s]*([A-Z]{2,10})/gi,   // Signal: BTC
                /([A-Z]{2,10})\s*signal/gi       // BTC signal
            ];

            for (const pattern of patterns) {
                const matches = text.match(pattern);
                if (matches && matches.length > 0) {
                    let symbol = matches[0].replace(/[^A-Z]/g, '');
                    
                    // Si ya termina en USDT, usar tal como está
                    if (symbol.endsWith('USDT')) {
                        return symbol;
                    }
                    
                    // Filtrar símbolos conocidos
                    if (this.isValidCryptoSymbol(symbol)) {
                        return symbol + 'USDT';
                    }
                }
            }

            return null;
        } catch (error) {
            this.logger.error('Error extrayendo símbolo:', error);
            return null;
        }
    }

    isValidCryptoSymbol(symbol) {
        const validSymbols = [
            'BTC', 'ETH', 'BNB', 'ADA', 'SOL', 'XRP', 'DOGE', 'MATIC', 'DOT', 'AVAX',
            'LINK', 'UNI', 'ATOM', 'XLM', 'ALGO', 'VET', 'FIL', 'AAVE', 'SUSHI', 'COMP',
            'LTC', 'BCH', 'ETC', 'TRX', 'XTZ', 'NEAR', 'LUNA', 'FTT', 'CRO', 'LEO',
            'SHIB', 'WBTC', 'DAI', 'BUSD', 'USDC', 'APE', 'SAND', 'MANA', 'AXS', 'CHZ'
        ];
        
        return validSymbols.includes(symbol) && symbol.length >= 2 && symbol.length <= 10;
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

            // Detectar dirección LONG/SHORT
            if (/LONG/i.test(text)) info.direction = 'LONG';
            if (/SHORT/i.test(text)) info.direction = 'SHORT';

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

            // Extraer Take Profits
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

            return info;
        } catch (error) {
            this.logger.error('Error extrayendo información de señal:', error);
            return {};
        }
    }

    async performUltraFastAnalysis(symbol, signalInfo, messageId) {
        try {
            this.logger.info(`⚡ ANÁLISIS ULTRA RÁPIDO: ${symbol} ${signalInfo.direction || 'DETECTANDO'}`);
            
            const startTime = Date.now();
            
            // 1. Obtener datos de mercado RÁPIDO
            const marketData = await this.binanceAPI.getMarketData(symbol);
            if (!marketData) {
                this.logger.error(`❌ No se pudieron obtener datos de ${symbol}`);
                return;
            }

            // 2. Análisis técnico ULTRA RÁPIDO (Smart Money, Soportes, Resistencias)
            const ultraAnalysis = await this.performSmartMoneyAnalysis(symbol, marketData, signalInfo);
            
            // 3. DECISIÓN INMEDIATA: ENTRAR, ESPERAR
            const decision = this.makeInstantDecision(ultraAnalysis, signalInfo);
            
            // 4. Enviar respuesta INMEDIATA
            await this.sendUltraFastResponse(decision, symbol, signalInfo);
            
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

    async sendUltraFastResponse(decision, symbol, signalInfo) {
        try {
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

            // 🚀 TRADING AUTOMÁTICO - Procesar señal si cumple criterios
            try {
                await this.autoTrader.processSignal(symbol, decision.action, decision.confidence, decision);
            } catch (error) {
                this.logger.error('❌ Error en AutoTrader:', error.message);
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

    // 🚀 MÉTODOS DE TRADING AUTOMÁTICO
    async handleTradingEnable(chatId) {
        try {
            this.autoTrader.enableTrading(true);
            
            const stats = this.autoTrader.getStats();
            const message = `
🚀 <b>TRADING AUTOMÁTICO HABILITADO</b>

⚠️ <b>CONFIGURACIÓN DE SEGURIDAD:</b>
💰 Monto por operación: $1.00 USD
🛑 Stop Loss: -$0.50 USD
🎯 Take Profit: +$1.00 USD
📊 Confianza mínima: ${stats.minConfidence}%
📈 Máx. operaciones/día: ${stats.maxDailyTrades}
🔒 Máx. posiciones abiertas: ${stats.maxOpenPositions}

✅ <b>El bot ejecutará operaciones automáticamente cuando detecte señales de alta confianza (${stats.minConfidence}%+)</b>

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

💰 <b>Configuración:</b>
• Monto: $1.00 USD por operación
• Stop Loss: -$0.50 USD
• Take Profit: +$1.00 USD

⚠️ <b>Límites de Seguridad:</b>
• Máx. ${stats.maxDailyTrades} operaciones/día
• Máx. ${stats.maxOpenPositions} posiciones simultáneas
• Solo señales ${stats.minConfidence}%+ confianza
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
