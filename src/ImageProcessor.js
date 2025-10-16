const Tesseract = require('tesseract.js');
const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

class ImageProcessor {
    constructor() {
        this.tesseractWorker = null;
        this.initializeTesseract();
    }

    async initializeTesseract() {
        try {
            console.log(chalk.blue('🔍 Inicializando OCR Tesseract...'));
            this.tesseractWorker = await Tesseract.createWorker('eng');
            console.log(chalk.green('✅ OCR Tesseract listo'));
        } catch (error) {
            console.error(chalk.red('❌ Error inicializando Tesseract:'), error);
        }
    }

    async extractTextFromImage(imagePath) {
        try {
            console.log(chalk.blue(`🖼️ Procesando imagen: ${path.basename(imagePath)}`));

            // Verificar si el archivo existe
            if (!await fs.pathExists(imagePath)) {
                throw new Error('Archivo de imagen no encontrado');
            }

            // Preprocesar imagen para mejor OCR
            const processedImagePath = await this.preprocessImage(imagePath);

            // Extraer texto usando Tesseract
            const { data: { text } } = await this.tesseractWorker.recognize(processedImagePath);

            // Limpiar texto extraído
            const cleanText = this.cleanExtractedText(text);

            console.log(chalk.green(`✅ Texto extraído: "${cleanText.substring(0, 100)}..."`));

            // Limpiar archivo temporal
            if (processedImagePath !== imagePath) {
                await fs.remove(processedImagePath);
            }

            return cleanText;

        } catch (error) {
            console.error(chalk.red('❌ Error extrayendo texto de imagen:'), error);
            return '';
        }
    }

    async preprocessImage(imagePath) {
        try {
            // Sin sharp, usamos la imagen original directamente
            console.log(chalk.yellow('⚠️ Usando imagen original (sharp no disponible)'));
            return imagePath;

        } catch (error) {
            console.error('Error preprocesando imagen:', error);
            return imagePath; // Devolver imagen original si falla el procesamiento
        }
    }

    cleanExtractedText(text) {
        if (!text) return '';

        return text
            .replace(/\n+/g, ' ')           // Reemplazar saltos de línea
            .replace(/\s+/g, ' ')           // Normalizar espacios
            .replace(/[^\w\s\/\$\-\.:]/g, '') // Mantener solo caracteres relevantes
            .trim()
            .toUpperCase();
    }

    async extractCryptoSymbols(imagePath) {
        try {
            const text = await this.extractTextFromImage(imagePath);
            return this.findCryptoSymbolsInText(text);
        } catch (error) {
            console.error('Error extrayendo símbolos crypto:', error);
            return [];
        }
    }

    findCryptoSymbolsInText(text) {
        const symbols = [];
        
        // Patrones para detectar símbolos de criptomonedas
        const patterns = [
            /([A-Z]{2,10})USDT/g,           // BTCUSDT
            /([A-Z]{2,10})\/USDT/g,         // BTC/USDT
            /([A-Z]{2,10})\s*USDT/g,        // BTC USDT
            /\$([A-Z]{2,10})/g,             // $BTC
            /([A-Z]{2,10})\s*PERP/g,        // BTC PERP
            /([A-Z]{2,10})\s*FUTURES?/g,    // BTC FUTURES
            /SIGNAL[:\s]*([A-Z]{2,10})/g,   // SIGNAL: BTC
            /([A-Z]{2,10})\s*SIGNAL/g,      // BTC SIGNAL
            /LONG[:\s]*([A-Z]{2,10})/g,     // LONG: BTC
            /SHORT[:\s]*([A-Z]{2,10})/g,    // SHORT: BTC
            /([A-Z]{2,10})\s*LONG/g,        // BTC LONG
            /([A-Z]{2,10})\s*SHORT/g        // BTC SHORT
        ];

        const knownCryptos = [
            'BTC', 'ETH', 'BNB', 'ADA', 'SOL', 'XRP', 'DOGE', 'MATIC', 'DOT', 'AVAX',
            'LINK', 'UNI', 'ATOM', 'XLM', 'ALGO', 'VET', 'FIL', 'AAVE', 'SUSHI', 'COMP',
            'LTC', 'BCH', 'ETC', 'TRX', 'XTZ', 'NEAR', 'LUNA', 'FTT', 'CRO', 'LEO',
            'SHIB', 'WBTC', 'DAI', 'BUSD', 'USDC', 'APE', 'SAND', 'MANA', 'AXS', 'CHZ',
            'ENJ', 'BAT', 'ZEC', 'DASH', 'EOS', 'NEO', 'IOTA', 'XMR', 'THETA', 'TFUEL'
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const symbol = match[1];
                if (knownCryptos.includes(symbol) && !symbols.includes(symbol)) {
                    symbols.push(symbol);
                }
            }
        }

        return symbols;
    }

    async analyzeChartImage(imagePath) {
        try {
            // Análisis básico sin sharp
            const stats = await fs.stat(imagePath);
            
            return {
                size: stats.size,
                path: imagePath,
                isChart: await this.detectChartElements(imagePath)
            };

        } catch (error) {
            console.error('Error analizando imagen de gráfico:', error);
            return null;
        }
    }

    async detectChartElements(imagePath) {
        // Implementación básica - se puede mejorar con ML
        try {
            const text = await this.extractTextFromImage(imagePath);
            const chartKeywords = [
                'PRICE', 'VOLUME', 'CHART', 'CANDLE', 'RSI', 'MACD', 
                'SUPPORT', 'RESISTANCE', 'TREND', 'BULLISH', 'BEARISH'
            ];

            return chartKeywords.some(keyword => text.includes(keyword));
        } catch (error) {
            return false;
        }
    }

    async saveProcessedImage(imagePath, analysis) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `analysis_${timestamp}.json`;
            const outputPath = path.join('./data/images/', filename);

            const data = {
                originalImage: imagePath,
                timestamp: new Date().toISOString(),
                analysis: analysis,
                processed: true
            };

            await fs.writeJSON(outputPath, data, { spaces: 2 });
            return outputPath;

        } catch (error) {
            console.error('Error guardando imagen procesada:', error);
            return null;
        }
    }

    async cleanup() {
        try {
            if (this.tesseractWorker) {
                await this.tesseractWorker.terminate();
                console.log(chalk.yellow('🧹 OCR Tesseract terminado'));
            }
        } catch (error) {
            console.error('Error limpiando ImageProcessor:', error);
        }
    }
}

module.exports = ImageProcessor;
