const { TelegramApi } = require('telegram');
const { StringSession } = require('telegram/sessions');
const chalk = require('chalk');

class TelegramClient {
    constructor() {
        this.apiId = parseInt(process.env.TELEGRAM_API_ID);
        this.apiHash = process.env.TELEGRAM_API_HASH;
        this.sessionString = process.env.TELEGRAM_SESSION_STRING;
        this.client = null;
        this.isConnected = false;
    }

    async initialize() {
        try {
            console.log(chalk.blue('🔗 Inicializando Telegram API Client...'));
            
            const session = new StringSession(this.sessionString);
            this.client = new TelegramApi(session, this.apiId, this.apiHash, {
                connectionRetries: 5,
            });

            await this.client.start({
                phoneNumber: async () => await input.text('Número de teléfono: '),
                password: async () => await input.text('Contraseña: '),
                phoneCode: async () => await input.text('Código: '),
                onError: (err) => console.log(err),
            });

            this.isConnected = true;
            console.log(chalk.green('✅ Telegram API Client conectado'));
            
        } catch (error) {
            console.error(chalk.red('❌ Error inicializando Telegram API:'), error);
            this.isConnected = false;
        }
    }

    async getMessages(chatId, limit = 10) {
        try {
            if (!this.isConnected) {
                await this.initialize();
            }

            const messages = await this.client.getMessages(chatId, {
                limit: limit
            });

            return messages;
        } catch (error) {
            console.error(chalk.red('❌ Error obteniendo mensajes:'), error);
            return [];
        }
    }

    async sendMessage(chatId, message) {
        try {
            if (!this.isConnected) {
                await this.initialize();
            }

            await this.client.sendMessage(chatId, {
                message: message,
                parseMode: 'html'
            });

            console.log(chalk.green(`✅ Mensaje enviado a ${chatId}`));
            
        } catch (error) {
            console.error(chalk.red('❌ Error enviando mensaje:'), error);
        }
    }

    async listenForMessages(chatId, callback) {
        try {
            if (!this.isConnected) {
                await this.initialize();
            }

            console.log(chalk.yellow(`👂 Escuchando mensajes en ${chatId}...`));

            this.client.addEventHandler(async (event) => {
                if (event.message && event.message.chatId.toString() === chatId.toString()) {
                    await callback(event.message);
                }
            }, {});

        } catch (error) {
            console.error(chalk.red('❌ Error configurando listener:'), error);
        }
    }

    async getChatInfo(chatId) {
        try {
            if (!this.isConnected) {
                await this.initialize();
            }

            const chat = await this.client.getEntity(chatId);
            return {
                id: chat.id,
                title: chat.title,
                type: chat.className,
                accessHash: chat.accessHash
            };
            
        } catch (error) {
            console.error(chalk.red(`❌ Error obteniendo info del chat ${chatId}:`), error);
            return null;
        }
    }

    async disconnect() {
        try {
            if (this.client && this.isConnected) {
                await this.client.disconnect();
                this.isConnected = false;
                console.log(chalk.yellow('🔌 Telegram API Client desconectado'));
            }
        } catch (error) {
            console.error(chalk.red('❌ Error desconectando:'), error);
        }
    }
}

module.exports = TelegramClient;
