# Ruby Project - InvisiRisk BAF Example Setup (GitLab CI/CD, Docker Build)

This guide explains how to integrate the InvisiRisk BAF into your GitLab CI/CD pipeline. This setup assumes a runner with Docker-in-Docker (`dind`) available for building Docker images.

## Prerequisites

Ensure the `IR_TOKEN` CI/CD variable is set in your project before applying these changes.

To add the variable:
1. Go to your project on GitLab.
2. Navigate to **Settings → CI/CD → Variables**.
3. Click **Add variable**.
4. Set the key to `IR_TOKEN` and paste the app token received from the InvisiRisk portal.
5. Mark it **Masked** (and **Protected** if your pipeline runs only on protected branches).

---

## Step 1: Modify `.gitlab-ci.yml`

Add the BAF setup at the **start** of every job's `script` and the cleanup at the **end**. Update the `docker build` command with the BAF build arguments.

> **Note:** The setup and cleanup must be added to the `script` of **every job** that runs a Docker build. They are not shared across jobs.

### Setup — start the BAF (first commands in every job's script):

```yaml
# The docker:24 image is Alpine-based; bash and curl are needed for the bootstrap.
- apk add --no-cache bash curl
- |
  curl -sSf -H "x-api-key: ${IR_TOKEN}" "https://app.invisirisk.com/ingestionapi/v1/pse/bootstrap" | bash
  . /tmp/ir_envs
```

### Update your `docker build` command ([see what changed](#appendix-what-changed-in-the-docker-build-command)):

```yaml
- |
  DOCKER_BUILDKIT=1 docker build \
    -t $IMAGE_NAME:latest \
    --build-arg BUILDKIT_SYNTAX=public.ecr.aws/w3c0c0n7/invisirisk/baf-buildkit:latest \
    --secret id=pse-ca,src=${PSE_CA_CERT_PATH} \
    --build-arg PSE_PROXY=http://${PSE_PROXY_IP}:3128 \
    .
```

### Cleanup — send data to portal (last command in every job's script):

```yaml
- pse-data-collector cleanup
```

### Full `.gitlab-ci.yml` example:

```yaml
image: docker:24

services:
  - docker:24-dind

variables:
  IMAGE_NAME: sample-ruby-build

stages:
  - build

build_image:
  stage: build
  script:
    # ============= InvisiRisk Setup =============
    - apk add --no-cache bash curl
    - |
      curl -sSf -H "x-api-key: ${IR_TOKEN}" "https://app.invisirisk.com/ingestionapi/v1/pse/bootstrap" | bash
      . /tmp/ir_envs
    # ============= InvisiRisk Setup End =============

    - |
      DOCKER_BUILDKIT=1 docker build \
        -t $IMAGE_NAME:latest \
        --build-arg BUILDKIT_SYNTAX=public.ecr.aws/w3c0c0n7/invisirisk/baf-buildkit:latest \
        --secret id=pse-ca,src=${PSE_CA_CERT_PATH} \
        --build-arg PSE_PROXY=http://${PSE_PROXY_IP}:3128 \
        .

    # ============= InvisiRisk Cleanup =============
    - pse-data-collector cleanup
    # ============= InvisiRisk Cleanup End =============
```

---

## Required CI/CD Variable

The following variable must be set in the project (**Settings → CI/CD → Variables**):

| Variable    | Description                               |
|-------------|-------------------------------------------|
| `IR_TOKEN`  | APP token received from InvisiRisk portal |

---

## Notes

- The BAF setup must run **before** the `docker build` step so that the proxy is active and the PSE CA certificate is installed before any build-time network traffic occurs.
- `. /tmp/ir_envs` sources the proxy environment variables set by the bootstrap script, including `PSE_PROXY_IP`, which the `docker build` command references.
- `pse-data-collector cleanup` runs last to send the collected dependency data to the InvisiRisk portal. To guarantee it runs even when the build fails, place it in an `after_script` block instead of `script`.
- Inside the `Dockerfile`, `bundle install` runs during the Docker build — the BAF intercepts this traffic via `PSE_PROXY` and the injected CA certificate.

---

## Appendix: What Changed in the `docker build` Command

**Before:**
```sh
docker build -t $IMAGE_NAME:$TAG .
```

**After:**
```sh
DOCKER_BUILDKIT=1 docker build \
  --build-arg BUILDKIT_SYNTAX=public.ecr.aws/w3c0c0n7/invisirisk/baf-buildkit:latest \
  --secret id=pse-ca,src=${PSE_CA_CERT_PATH} \
  --build-arg PSE_PROXY=http://${PSE_PROXY_IP}:3128 \
  -t $IMAGE_NAME:$TAG .
```

| Addition | What it does |
|---|---|
| `DOCKER_BUILDKIT=1` | Enables BuildKit mode, required for the custom frontend and secrets support. Add this as a prefix if not already set. |
| `--build-arg BUILDKIT_SYNTAX=public.ecr.aws/w3c0c0n7/invisirisk/baf-buildkit:latest` | Swaps in the InvisiRisk custom BuildKit frontend, which transparently routes build-time traffic through the BAF. |
| `--secret id=pse-ca,src=${PSE_CA_CERT_PATH} | Passes the PSE CA certificate into the build without embedding it in the final image. |
| `--build-arg PSE_PROXY=http://${PSE_PROXY_IP}:3128` | Tells the frontend which proxy endpoint to use. `PSE_PROXY_IP` is set by the bootstrap script and sourced from `/tmp/ir_envs`. |

---

## Appendix: What the BAF Lines in the `Dockerfile` Do

These lines in the `Dockerfile` consume the secret and build-arg passed by the `docker build` command above. Add them to the build stage that runs `bundle install`.

```dockerfile
# Accept the PSE proxy CA certificate (injected by InvisiRisk BAF at build time)
RUN --mount=type=secret,id=pse-ca \
    cp /run/secrets/pse-ca /usr/local/share/ca-certificates/pse.crt && \
    update-ca-certificates

# Configure bundler to use the BAF proxy
ARG PSE_PROXY
RUN if [ -n "$PSE_PROXY" ]; then bundle config set --global https_proxy $PSE_PROXY; fi
```

| Line | What it does |
|---|---|
| `--mount=type=secret,id=pse-ca` | Mounts the PSE CA certificate (passed via `--secret id=pse-ca`) at `/run/secrets/pse-ca` for this `RUN` only — never baked into an image layer. |
| `cp /run/secrets/pse-ca /usr/local/share/ca-certificates/pse.crt && update-ca-certificates` | Installs the PSE CA into the system trust store so HTTPS traffic to the proxy is trusted during the build. |
| `ARG PSE_PROXY` | Receives the proxy endpoint passed via `--build-arg PSE_PROXY=...`. Build-arg, not a runtime env var — it exists only during the build. |
| `bundle config set --global https_proxy $PSE_PROXY` | Routes all `bundle install` HTTPS traffic through the BAF proxy so dependency fetches are inspected. Guarded by `if [ -n "$PSE_PROXY" ]` so the build still works when no proxy is set. |
