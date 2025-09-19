# Dockerfile for Node.js

# 1. 基礎映像檔：告訴 Docker 使用哪個 Node.js 版本的環境
# 請將 "18-alpine" 換成您自己的 Node.js 版本
FROM node:18-alpine

# 2. 設定工作目錄：在容器(Container)內建立一個資料夾，並進入它
WORKDIR /app

# 3. 複製依賴檔並安裝：優化步驟，利用 Docker 的快取機制
# 先複製 package.json 和 package-lock.json (如果有的話)
COPY package*.json ./
# 執行 npm install 來安裝所有依賴套件
RUN npm install

# 4. 複製專案程式碼：將您本地的所有檔案複製到容器的 /app 資料夾中
COPY . .

# 5. (可選) 執行建置：如果您的專案需要編譯 (如 TypeScript)，請取消這行的註解
# RUN npm run build

# 6. 宣告端口：告訴 Docker 您的應用程式會在哪個端口上運行
EXPOSE 8080

# 7. 設定啟動指令：告訴 Docker 當容器啟動時，要執行什麼指令
# 請將下面的指令換成您自己的「啟動指令」
CMD [ "node", "index.js" ]
