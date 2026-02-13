FROM node:24-slim
WORKDIR /app

COPY apps/api/package.json ./package.json
RUN npm install --omit=dev

COPY apps/api/src ./src

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/index.js"]
