FROM node:22-alpine
RUN npm install -g pnpm@11.19.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
RUN pnpm --filter @group/api db:generate && pnpm --filter @group/api build
EXPOSE 4000
CMD ["pnpm", "--filter", "@group/api", "start"]
