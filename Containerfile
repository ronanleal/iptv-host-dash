# Imagem base oficial Node 20 LTS Alpine
FROM node:20-alpine

# Ferramentas nativas para dependências e curl para healthcheck
RUN apk add --no-cache python3 make g++ curl sqlite

# Diretório da aplicação
WORKDIR /app

# Instalação de dependências
COPY package*.json ./
RUN npm install --omit=dev

# Código-fonte
COPY . .

# Diretório para dados SQLite
RUN mkdir -p /app/data

# Liberação de portas
EXPOSE 3000

# Variáveis de ambiente do container
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DB_PATH=/app/data/iptv_hosts.sqlite

# Volume de persistência
VOLUME ["/app/data"]

# Healthcheck do container
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/iptv/host || exit 1

# Inicialização da aplicação
CMD ["node", "server.js"]
