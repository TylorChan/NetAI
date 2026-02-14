FROM node:24-slim
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/package.json
RUN npm ci --omit=dev --workspace @netai/worker

COPY apps/worker/src apps/worker/src
WORKDIR /app/apps/worker

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/index.js"]
