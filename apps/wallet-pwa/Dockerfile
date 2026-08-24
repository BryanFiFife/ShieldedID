FROM node:20-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/wallet-pwa/package.json ./apps/wallet-pwa/package.json
COPY packages/age-zk/package.json ./packages/age-zk/package.json
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS build
WORKDIR /app
RUN npm install -g pnpm
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/wallet-pwa/node_modules ./apps/wallet-pwa/node_modules
COPY --from=deps /app/packages/age-zk/node_modules ./packages/age-zk/node_modules
COPY packages/age-zk ./packages/age-zk
COPY apps/wallet-pwa/ ./apps/wallet-pwa/
RUN pnpm -F shielded-wallet-pwa build

FROM nginx:alpine AS runner
WORKDIR /usr/share/nginx/html
COPY --from=build /app/apps/wallet-pwa/dist ./
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
