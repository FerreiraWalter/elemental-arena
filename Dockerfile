FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.html ./
COPY src ./src
COPY server ./server
COPY assets/monsters ./assets/monsters
# Hospedagens definem PORT; o padrão local é 8140.
ENV PORT=8140
EXPOSE 8140
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1
CMD ["node", "server/server.js"]
