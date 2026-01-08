FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm
COPY apps/registry-server/package.json apps/registry-server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
RUN pnpm rebuild better-sqlite3

FROM node:20-alpine AS build
WORKDIR /app
RUN npm install -g pnpm
COPY --from=deps /app/node_modules ./node_modules
COPY apps/registry-server/ ./
RUN pnpm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /app/node_modules ./node_modules
COPY apps/registry-server/src/db/schema.sql ./dist/db/schema.sql
COPY apps/registry-server/public ./public
RUN npm rebuild better-sqlite3
EXPOSE 3000
CMD ["node", "dist/server.js"]
