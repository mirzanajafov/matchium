FROM node:24-slim AS build
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
COPY api/prisma ./prisma
COPY api/prisma.config.ts ./
RUN npm ci --no-audit --no-fund
COPY api/nest-cli.json api/tsconfig.json api/tsconfig.build.json ./
COPY api/src ./src
RUN npx prisma generate && npm run build

FROM build AS migrate
COPY contract /app/contract
USER node
CMD ["sh", "-c", "npx prisma migrate deploy && exec node prisma/seed.ts"]

FROM node:24-slim AS runtime-deps
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-slim
WORKDIR /app/api
ENV NODE_ENV=production
COPY --from=runtime-deps /app/api/node_modules ./node_modules
COPY --from=build /app/api/dist ./dist
COPY api/package.json ./
COPY api/prisma/grant-admin.ts ./prisma/
USER node
EXPOSE 3100
CMD ["node", "dist/main"]
