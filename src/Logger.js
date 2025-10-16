const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

class Logger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.logFile = path.join('./logs/', `bot_${new Date().toISOString().split('T')[0]}.log`);
        this.ensureLogDirectory();
    }

    async ensureLogDirectory() {
        await fs.ensureDir('./logs/');
    }

    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            data
        };

        // Console output
        this.consoleLog(level, message, data);

        // File output
        this.fileLog(logEntry);
    }

    consoleLog(level, message, data) {
        const timestamp = new Date().toLocaleTimeString();
        let coloredMessage;

        switch (level) {
            case 'error':
                coloredMessage = chalk.red(`[${timestamp}] ERROR: ${message}`);
                break;
            case 'warn':
                coloredMessage = chalk.yellow(`[${timestamp}] WARN: ${message}`);
                break;
            case 'info':
                coloredMessage = chalk.blue(`[${timestamp}] INFO: ${message}`);
                break;
            case 'debug':
                coloredMessage = chalk.gray(`[${timestamp}] DEBUG: ${message}`);
                break;
            default:
                coloredMessage = `[${timestamp}] ${message}`;
        }

        console.log(coloredMessage);
        if (data) {
            console.log(chalk.gray(JSON.stringify(data, null, 2)));
        }
    }

    async fileLog(logEntry) {
        try {
            const logLine = JSON.stringify(logEntry) + '\n';
            await fs.appendFile(this.logFile, logLine);
        } catch (error) {
            console.error('Error escribiendo log:', error);
        }
    }

    info(message, data) {
        this.log('info', message, data);
    }

    warn(message, data) {
        this.log('warn', message, data);
    }

    error(message, data) {
        this.log('error', message, data);
    }

    debug(message, data) {
        if (this.logLevel === 'debug') {
            this.log('debug', message, data);
        }
    }
}

module.exports = Logger;
