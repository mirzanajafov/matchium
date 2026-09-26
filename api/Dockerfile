FROM node:24-slim AS build
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
COPY api/prisma ./prisma
COPY api/prisma.config.ts ./
RUN npm ci --no-audit --no-fund
COPY api/ ./
RUN npx prisma generate && npm run build

FROM node:24-slim
WORKDIR /app/api
ENV NODE_ENV=production
COPY --from=build /app/api/node_modules ./node_modules
COPY --from=build /app/api/dist ./dist
COPY api/package.json api/prisma.config.ts ./
COPY api/prisma ./prisma
COPY contract /app/contract
USER node
EXPOSE 3100
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.ts && node dist/main"]
