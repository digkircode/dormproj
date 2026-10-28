FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libreoffice-writer font-liberation
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
COPY templates ./templates
COPY scripts/uno-convert.py ./scripts/uno-convert.py
COPY i18n ./i18n

EXPOSE 3000
CMD ["node", "dist/src/main"]
