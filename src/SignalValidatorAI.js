const axios = require('axios');

class SignalValidatorAI {
    constructor(apiKey, logger) {
        this.apiKey = apiKey;
        this.logger = logger;
        this.baseURL = 'https://api.groq.com/openai/v1';
        
        // CONFIGURACIÓN PARA VALIDACIÓN DE SEÑALES (RESPETANDO LÍMITES GROQ)
        this.config = {
            MIN_CONFIDENCE: 70,           // Mínimo 70% para validar señal
            ENABLED: true,                // Habilitado por defecto
            MAX_VALIDATIONS_PER_HOUR: 20, // Reducido para respetar rate limits
            RETRY_DELAY: 2000,            // 2 segundos entre reintentos
            MAX_RETRIES: 2                // Máximo 2 reintentos
        };
        
        this.validationCount = 0;
        this.lastValidationHour = new Date().getHours();
    }

    // 🧠 PROMPT ESPECIALIZADO EN VALIDACIÓN DE SEÑALES
    getValidationPrompt() {
        return `Eres un EXPERTO VALIDADOR DE SEÑALES DE TRADING especializado en criptomonedas.

TU MISIÓN: Analizar señales generadas por SmartMoney y decidir si son oportunidades reales de trading.

CRITERIOS DE VALIDACIÓN:
1. ANÁLISIS TÉCNICO AVANZADO:
   - Confirmar la dirección de la tendencia en múltiples timeframes
   - Verificar niveles de soporte/resistencia relevantes
   - Evaluar momentum y volumen para confirmar la señal
   - Identificar posibles divergencias o señales contradictorias

2. CONTEXTO DE MERCADO:
   - Condiciones generales del mercado crypto
   - Correlación con Bitcoin y mercados principales
   - Volatilidad actual del activo
   - Liquidez y spread del par

3. GESTIÓN DE RIESGO:
   - Evaluar si el Risk/Reward es favorable (mínimo 1:2)
   - Verificar que los niveles de SL/TP son lógicos
   - Considerar el tamaño de posición apropiado
   - Evaluar timing de entrada

4. CONFLUENCIAS:
   - Múltiples indicadores alineados
   - Patrones de precio confirmados
   - Volumen validando el movimiento
   - Ausencia de noticias conflictivas

RESPUESTA REQUERIDA (JSON):
{
  "decision": "BUY" | "SELL" | "NO_TRADE",
  "confidence": 0-100,
  "reasoning": "Explicación detallada de la decisión",
  "risk_assessment": "LOW" | "MEDIUM" | "HIGH",
  "expected_move": "Porcentaje esperado de movimiento",
  "time_horizon": "Tiempo estimado para alcanzar objetivo"
}

IMPORTANTE: 
- Solo valida positivamente señales con 70%+ de confianza
- Sé EXTREMADAMENTE selectivo y conservador
- Prioriza la preservación de capital sobre las ganancias
- Si hay dudas, responde NO_TRADE`;
    }

    // 🔍 VALIDAR SEÑAL DE SMARTMONEY
    async validateSignal(signalData) {
        try {
            this.logger.info(`🔍 VALIDANDO señal SmartMoney: ${signalData.symbol} ${signalData.action}`);
            
            // Verificar límites de validación
            const currentHour = new Date().getHours();
            if (currentHour !== this.lastValidationHour) {
                this.validationCount = 0;
                this.lastValidationHour = currentHour;
            }
            
            if (this.validationCount >= this.config.MAX_VALIDATIONS_PER_HOUR) {
                this.logger.warn(`⚠️ Límite de validaciones alcanzado: ${this.validationCount}/${this.config.MAX_VALIDATIONS_PER_HOUR} por hora`);
                return {
                    decision: 'NO_TRADE',
                    confidence: 0,
                    reasoning: 'Límite de validaciones por hora alcanzado'
                };
            }

            const prompt = `${this.getValidationPrompt()}

SEÑAL SMARTMONEY PARA VALIDAR:
Símbolo: ${signalData.symbol}
Acción SmartMoney: ${signalData.action}
Confianza SmartMoney: ${signalData.confidence}%
Precio Actual: $${signalData.price}
Volumen 24h: ${signalData.volume}
Cambio 24h: ${signalData.priceChange}%

DATOS TÉCNICOS:
${JSON.stringify(signalData.technicalData || {}, null, 2)}

CONTEXTO ADICIONAL:
- Timestamp: ${new Date().toISOString()}
- Mercado: Binance Futures
- Apalancamiento disponible: 15x
- Tamaño posición: $0.40 USD

Analiza esta señal SmartMoney y decide si es una oportunidad válida de trading.`;

            // Llamada con manejo de rate limits y reintentos
            const response = await this.makeGroqRequest({
                model: 'llama-3.1-8b-instant',  // Modelo de producción más estable
                messages: [
                    {
                        role: 'system',
                        content: 'Eres un experto validador de señales de trading. Responde SOLO en formato JSON válido.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.1,  // Más determinístico
                max_tokens: 500    // Reducido para evitar límites
            });

            const aiResponse = response.data.choices[0].message.content;
            this.logger.info(`🤖 Respuesta IA Validadora: ${aiResponse}`);

            // Parsear respuesta JSON
            let validation;
            try {
                validation = JSON.parse(aiResponse);
            } catch (parseError) {
                this.logger.error(`❌ Error parseando respuesta IA: ${parseError.message}`);
                return {
                    decision: 'NO_TRADE',
                    confidence: 0,
                    reasoning: 'Error en respuesta de IA'
                };
            }

            // Validar confianza mínima
            if (validation.confidence < this.config.MIN_CONFIDENCE) {
                this.logger.info(`📊 Validación: Confianza ${validation.confidence}% < ${this.config.MIN_CONFIDENCE}% - NO TRADE`);
                return {
                    decision: 'NO_TRADE',
                    confidence: validation.confidence,
                    reasoning: 'Confianza insuficiente para validar señal'
                };
            }

            this.validationCount++;
            this.logger.info(`✅ SEÑAL VALIDADA: ${validation.decision} - ${validation.confidence}%`);
            this.logger.info(`📊 Validaciones esta hora: ${this.validationCount}/${this.config.MAX_VALIDATIONS_PER_HOUR}`);

            return validation;

        } catch (error) {
            this.logger.error(`❌ Error validando señal: ${error.message}`);
            return {
                decision: 'NO_TRADE',
                confidence: 0,
                reasoning: `Error: ${error.message}`
            };
        }
    }

    // 🔄 MÉTODO ROBUSTO PARA LLAMADAS A GROQ CON RATE LIMIT HANDLING
    async makeGroqRequest(requestData, retryCount = 0) {
        try {
            const response = await axios.post(`${this.baseURL}/chat/completions`, requestData, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000  // 10 segundos timeout
            });

            return response;

        } catch (error) {
            // Manejo específico de rate limits (429)
            if (error.response?.status === 429) {
                const retryAfter = error.response.headers['retry-after'] || this.config.RETRY_DELAY / 1000;
                this.logger.warn(`⏳ Rate limit alcanzado, esperando ${retryAfter} segundos...`);
                
                if (retryCount < this.config.MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    return this.makeGroqRequest(requestData, retryCount + 1);
                } else {
                    throw new Error(`Rate limit excedido después de ${this.config.MAX_RETRIES} reintentos`);
                }
            }

            // Manejo de otros errores 400
            if (error.response?.status === 400) {
                this.logger.error(`❌ Error 400 en Groq API: ${error.response.data?.error?.message || 'Error desconocido'}`);
                throw new Error(`API Error 400: ${error.response.data?.error?.message || 'Solicitud inválida'}`);
            }

            // Otros errores
            this.logger.error(`❌ Error en Groq API: ${error.message}`);
            throw error;
        }
    }

    // 🎯 CONVERTIR DECISIÓN IA A ACCIÓN DE TRADING
    convertToTradeAction(validation, originalSignal) {
        if (validation.decision === 'NO_TRADE') {
            return null;
        }

        // Mapear decisión de IA a acción de trading
        let tradeAction;
        if (validation.decision === 'BUY') {
            tradeAction = 'ENTRAR LONG';
        } else if (validation.decision === 'SELL') {
            tradeAction = 'ENTRAR SHORT';
        } else {
            return null;
        }

        return {
            action: tradeAction,
            confidence: validation.confidence,
            reasoning: `SmartMoney: ${originalSignal.confidence}% + IA Validación: ${validation.confidence}%`,
            riskAssessment: validation.risk_assessment,
            expectedMove: validation.expected_move,
            timeHorizon: validation.time_horizon
        };
    }

    // ⚙️ CONFIGURACIÓN
    isEnabled() {
        return this.config.ENABLED;
    }

    enable() {
        this.config.ENABLED = true;
        this.logger.info(`🔍 IA VALIDADORA HABILITADA - Doble filtro activado`);
    }

    disable() {
        this.config.ENABLED = false;
        this.logger.info(`🛑 IA VALIDADORA DESHABILITADA`);
    }

    getStats() {
        return {
            validationsThisHour: this.validationCount,
            maxValidationsPerHour: this.config.MAX_VALIDATIONS_PER_HOUR,
            minConfidence: this.config.MIN_CONFIDENCE,
            enabled: this.config.ENABLED
        };
    }
}

module.exports = SignalValidatorAI;
