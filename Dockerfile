FROM node:20-alpine

WORKDIR /app

# 复制 package.json 与应用源码
COPY package.json ./
COPY server.js ./
COPY public ./public
COPY examples ./examples

# 预先创建数据目录与挂载卷
RUN mkdir -p /app/data/backups /app/data/raw-reports

# 暴露服务端口
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# 启动服务
CMD ["node", "server.js"]
