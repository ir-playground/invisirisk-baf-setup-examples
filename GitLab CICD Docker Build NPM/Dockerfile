FROM public.ecr.aws/docker/library/node:20-slim AS base

ENV NODE_ENV="production" \
    APP_USER="user" \
    APP_DIR="app"

WORKDIR /$APP_DIR

FROM base AS build

RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    bash \
    build-essential \
    curl \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN --mount=type=secret,id=pse-ca \
    cp /run/secrets/pse-ca /usr/local/share/ca-certificates/pse.crt && \
    update-ca-certificates

ARG PSE_PROXY
RUN if [ -n "$PSE_PROXY" ]; then \
      npm config set proxy $PSE_PROXY && \
      npm config set https-proxy $PSE_PROXY; \
    fi

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

FROM base

RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN adduser --disabled-password $APP_USER
USER $APP_USER

COPY --from=build --chown=$APP_USER:$APP_USER /$APP_DIR .

EXPOSE 3000
CMD ["node", "index.js"]
