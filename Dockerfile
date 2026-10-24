# syntax=docker/dockerfile:1
# One image runs the web app, the background worker, the dev MQTT broker and migrations.
# Dev dependencies are kept because the worker and scripts run through tsx.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
# Optional build secret for networks behind a TLS-intercepting proxy:
#   docker build --secret id=npm_ca,src=/path/to/ca.crt .
RUN --mount=type=secret,id=npm_ca,required=false \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; npm ci
COPY . .
# Build-time placeholders only; real values come from the runtime environment.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" AUTH_SECRET="build-only-placeholder" npx next build
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000 1883
CMD ["npx", "next", "start"]
