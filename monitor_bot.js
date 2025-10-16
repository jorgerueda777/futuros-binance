const { exec } = require('child_process');
const fs = require('fs');

class BotMonitor {
    constructor() {
        this.checkInterval = 30000; // 30 segundos
        this.lastSignalTime = Date.now();
        this.maxSilenceTime = 300000; // 5 minutos sin señales
    }

    async checkBotHealth() {
        try {
            // Verificar si PM2 está corriendo
            const pmStatus = await this.runCommand('pm2 status defbinance-bot');
            
            if (!pmStatus.includes('online')) {
                console.log('🚨 Bot no está online, reiniciando...');
                await this.runCommand('pm2 start main.js --name defbinance-bot');
                return;
            }

            // Verificar logs recientes
            const logPath = './logs/bot_2025-10-16.log';
            if (fs.existsSync(logPath)) {
                const stats = fs.statSync(logPath);
                const lastModified = stats.mtime.getTime();
                const timeSinceLastLog = Date.now() - lastModified;

                // Si no hay logs recientes, reiniciar
                if (timeSinceLastLog > this.maxSilenceTime) {
                    console.log('🚨 Bot silencioso por más de 5 minutos, reiniciando...');
                    await this.runCommand('pm2 restart defbinance-bot');
                }
            }

            // Verificar conectividad a Telegram
            const pingResult = await this.runCommand('ping api.telegram.org -n 1');
            if (pingResult.includes('Request timed out') || pingResult.includes('could not find host')) {
                console.log('🚨 Problemas de conectividad detectados');
            }

            console.log('✅ Bot health check completado');

        } catch (error) {
            console.error('❌ Error en health check:', error);
        }
    }

    runCommand(command) {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(stdout);
            });
        });
    }

    start() {
        console.log('🔍 Iniciando monitor del bot...');
        setInterval(() => {
            this.checkBotHealth();
        }, this.checkInterval);
        
        // Check inicial
        this.checkBotHealth();
    }
}

const monitor = new BotMonitor();
monitor.start();
