FROM node:24.15.0-bookworm-slim AS build
WORKDIR /app
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY backend backend
RUN npm run build -w @noter/backend

FROM node:24.15.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system noter && useradd --system --gid noter --home-dir /app noter
COPY --from=build --chown=noter:noter /app/package.json /app/package-lock.json ./
COPY --from=build --chown=noter:noter /app/node_modules node_modules
COPY --from=build --chown=noter:noter /app/backend backend
COPY --from=build --chown=noter:noter /app/packages packages
RUN mkdir -p /app/backend/storage/media && chown -R noter:noter /app/backend/storage
USER noter
WORKDIR /app/backend
CMD ["node", "dist/main.js"]
