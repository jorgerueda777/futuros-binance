# Usar Node.js 18
FROM node:18-alpine

# Crear directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar código fuente
COPY . .

# Crear directorios necesarios
RUN mkdir -p data/images data/analysis data/signals logs

# Exponer puerto (Railway lo asigna automáticamente)
EXPOSE $PORT

# Comando para iniciar el bot
CMD ["npm", "start"]
