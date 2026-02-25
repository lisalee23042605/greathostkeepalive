# 直接用官方带浏览器依赖的镜像
FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
