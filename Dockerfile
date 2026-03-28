FROM node:20-alpine

WORKDIR /app

# Copy everything FIRST (important)
COPY . .

# Install deps AFTER prisma is present
RUN npm install

# Generate prisma client
RUN npx prisma generate

# Build app
RUN npm run build

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 8080

CMD ["npm", "start"]