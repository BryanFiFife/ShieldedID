FROM node:20-alpine AS build
WORKDIR /app
RUN npm install -g pnpm
# Copy the full workspace so the file:/workspace:* symlinks resolve correctly
# during install (a partial copy breaks @shielded-id/* resolution).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/age-zk ./packages/age-zk
COPY packages/verifier-sdk ./packages/verifier-sdk
COPY apps/verifier-demo ./apps/verifier-demo
RUN pnpm install --frozen-lockfile
RUN pnpm -F @shielded-id/verifier-sdk build
RUN pnpm -F shielded-verifier-demo build

FROM node:20-alpine AS runner
WORKDIR /app
RUN npm install -g pnpm
ENV NODE_ENV=production
ENV VITE_BACKEND_URL=http://localhost:5050
# Frontend built assets (served by vite preview, not a dev server)
COPY --from=build /app/apps/verifier-demo/dist ./apps/verifier-demo/dist
# Backend source + node_modules (preserve the pnpm workspace layout so the
# .bin symlinks and the virtual store resolve correctly at runtime)
COPY --from=build /app/apps/verifier-demo/src ./apps/verifier-demo/src
COPY --from=build /app/apps/verifier-demo/package.json ./apps/verifier-demo/package.json
COPY --from=build /app/apps/verifier-demo/tsconfig.json ./apps/verifier-demo/tsconfig.json
COPY --from=build /app/apps/verifier-demo/node_modules ./apps/verifier-demo/node_modules
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/age-zk ./packages/age-zk
COPY --from=build /app/packages/verifier-sdk ./packages/verifier-sdk
WORKDIR /app/apps/verifier-demo
EXPOSE 5174 5050
CMD ["sh", "-c", "pnpm run server & sleep 2 && ./node_modules/.bin/vite preview --host 0.0.0.0 --port 5174"]
