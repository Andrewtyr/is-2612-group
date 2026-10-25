FROM node:22-alpine
WORKDIR /app
COPY . .
RUN mkdir -p /app/data && chown node:node /app/data
ENV NODE_ENV=production
ENV PORT=8000
EXPOSE 8000
VOLUME ["/app/data"]
USER node
CMD ["node", "server.js"]
