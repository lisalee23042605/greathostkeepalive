FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app

# 先装依赖（利用缓存）
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# 复制代码
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
