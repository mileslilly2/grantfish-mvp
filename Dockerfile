FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Required for Prisma during build
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"
ENV NEXT_TELEMETRY_DISABLED=1

RUN npx prisma generate
RUN npm run build

EXPOSE 8080

CMD ["npm", "start"]