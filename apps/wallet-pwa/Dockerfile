FROM node:20-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY apps/wallet-pwa/package.json ./
RUN pnpm install
COPY apps/wallet-pwa/ ./
EXPOSE 5173
CMD ["sh", "-c", "pnpm run dev -- --host 0.0.0.0 --port 5173"]
