FROM public.ecr.aws/docker/library/ruby:3.2.2 AS base

# Set production environment
ENV RAILS_ENV="production" \
    APP_USER="user" \
    APP_GROUP="user" \
    APP_DIR="app" \
    BUNDLE_PATH="/usr/local/bundle" \
    BUNDLE_WITHOUT="development test private"

WORKDIR /$APP_DIR

# Throw-away build stage to reduce size of final image
FROM base AS build

# Install native dependencies
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    bash \
    build-essential \
    libxml2-dev \
    libxslt-dev \
    postgresql \
    libpq-dev \
    nodejs \
    curl \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Accept the PSE proxy CA certificate (injected by InvisiRisk BAF at build time)
RUN --mount=type=secret,id=pse-ca \
    cp /run/secrets/pse-ca /usr/local/share/ca-certificates/pse.crt && \
    update-ca-certificates

# Configure bundler to use the BAF proxy
ARG PSE_PROXY
RUN if [ -n "$PSE_PROXY" ]; then bundle config set --global https_proxy $PSE_PROXY; fi

# Install application gems
COPY Gemfile Gemfile.lock ./
RUN gem install bundler -v 2.4.22 && bundle install
RUN rm -rf ~/.bundle/ "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git

# Copy application code
COPY . .

# Final stage for app image
FROM base

# Install packages needed for deployment
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    libxml2 \
    libxslt1.1 \
    postgresql-client \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Run as non-root user
RUN adduser --disabled-password $APP_USER
USER $APP_USER

# Copy built artifacts from build stage
COPY --from=build /usr/local/bundle /usr/local/bundle
COPY --from=build --chown=$APP_USER:$APP_GROUP /$APP_DIR .

EXPOSE 3000
CMD ["bundle", "exec", "ruby", "app.rb"]
