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
# libreoffice-writer — headless-конвертация .docx в PDF для печати договоров (см.
# contracts/docx-to-pdf.ts). ~350МБ в образе — сервер тесный по диску/RAM (см. промпт
# проекта), поэтому конвертации в коде идут строго последовательно, не параллельно.
# font-liberation — в базовом alpine-образе НЕТ вообще ни одного шрифта (fc-list пуст),
# без этого LibreOffice рисует кириллицу пустыми квадратами (tofu) вместо букв — не
# нашёл, чем отрисовать глифы. Бланки договоров используют Times New Roman
# (templates/*.docx) — Liberation Serif метрически совместим с ней и покрывает кириллицу.
RUN apk add --no-cache libreoffice-writer font-liberation
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma
COPY templates ./templates
COPY i18n ./i18n

EXPOSE 3000
CMD ["node", "dist/src/main"]
