FROM node:22-alpine
RUN npm install -g pnpm@11.19.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
ENV API_INTERNAL_URL=http://api:4000
RUN pnpm --filter @group/web build
EXPOSE 3000
CMD ["pnpm", "--filter", "@group/web", "start"]
