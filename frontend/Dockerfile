# LostFinder web app (Next.js) in Docker.
#
# The browser runs on YOUR computer, so it calls the branches through the ports published on
# your computer (localhost:8001/8002/8003), not through Docker's internal names. Next.js puts
# these addresses into the JavaScript at build time, so they are build arguments.

# ---- 1. install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- 2. build
FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_BRANCH_A_URL=http://localhost:8001
ARG NEXT_PUBLIC_BRANCH_B_URL=http://localhost:8002
ARG NEXT_PUBLIC_BRANCH_C_URL=http://localhost:8003
ENV NEXT_PUBLIC_BRANCH_A_URL=$NEXT_PUBLIC_BRANCH_A_URL \
    NEXT_PUBLIC_BRANCH_B_URL=$NEXT_PUBLIC_BRANCH_B_URL \
    NEXT_PUBLIC_BRANCH_C_URL=$NEXT_PUBLIC_BRANCH_C_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- 3. run (only the standalone server and static files: a small image)
FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
CMD ["node", "server.js"]
