FROM node:20-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/verifier-sdk ./packages/verifier-sdk
COPY apps/verifier-demo ./apps/verifier-demo
RUN pnpm install --frozen-lockfile
WORKDIR /app/apps/verifier-demo
EXPOSE 5174 5050
ENV VITE_BACKEND_URL=http://localhost:5050
CMD ["sh", "-c", "pnpm run server & sleep 2 && pnpm run dev -- --host 0.0.0.0 --port 5174"]
