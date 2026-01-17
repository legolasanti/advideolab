FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_BASE_URL=http://localhost:4000/api
ARG VITE_API_BASE=http://localhost:4000/api
ARG VITE_SITE_URL=https://example.com
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_SITE_URL=$VITE_SITE_URL

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 4173
CMD ["npm","run","preview","--","--host","0.0.0.0","--port","4173"]
