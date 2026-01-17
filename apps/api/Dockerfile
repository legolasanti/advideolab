FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma
RUN npm install

COPY src ./src

RUN npm run build

FROM node:20-alpine
WORKDIR /app

COPY --from=base /app/package*.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/prisma ./prisma

ENV NODE_ENV=production

CMD ["node", "dist/src/server.js"]
