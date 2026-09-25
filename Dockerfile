FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci
COPY . .

FROM dependencies AS web
ENV API_INTERNAL_URL=http://livekit:4000
RUN npm run build -w @hotseat/web
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@hotseat/web"]

FROM dependencies AS server
RUN npm run agent:download -w @hotseat/server
EXPOSE 4000
CMD ["npx", "concurrently", "-k", "npm run start -w @hotseat/server", "npm run agent:production -w @hotseat/server"]
