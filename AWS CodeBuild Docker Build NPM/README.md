# NPM Project - InvisiRisk BAF Example Setup

This guide explains how to integrate the InvisiRisk BAF into your AWS CodeBuild pipeline. This setup assumes an Ubuntu runner with Docker pre-installed.

## Prerequisites

Ensure the `API_URL` and `APP_TOKEN` environment variables are set in your CodeBuild project before applying these changes.

---

## Step 1: Modify `buildspec.yml`

Add the BAF startup and cleanup steps to your `buildspec.yml`, and update your `docker build` command in the `build` phase.

### `pre_build` phase - start the BAF:

```yaml
pre_build:
  commands:
    - echo "InvisiRisk startup script..."
    - curl $API_URL/pse/bitbucket-setup/pse_startup | bash # Download and execute the BAF setup script.
    - . /etc/profile.d/pse-proxy.sh # Source the environment variables set by the setup script.
```

### `build` phase - update your `docker build` command (required only if building Docker images, [see what changed](#appendix-what-changed-in-the-docker-build-command)):

```yaml
build:
  commands:
    - echo "Docker build..."
    - DOCKER_BUILDKIT=1 docker build --no-cache --platform linux/amd64 -t $IMAGE_NAME:$CODEBUILD_BUILD_NUMBER --build-arg BUILDKIT_SYNTAX=public.ecr.aws/w3c0c0n7/invisirisk/baf-buildkit:latest --secret id=pse-ca,src=/etc/ssl/certs/pse.pem --build-arg PSE_PROXY=http://${PSE_PROXY_IP}:3128 .
```

### `post_build` phase - run the cleanup script:

```yaml
post_build:
  commands:
    - echo "Build complete!"
    - bash /tmp/pse_cleanup/cleanup.sh # Sends build data to the InvisiRisk portal.
```

### Full `buildspec.yml` example:

```yaml
version: 0.2

phases:
  pre_build:
    commands:
      - echo "InvisiRisk startup script..."
      - curl $API_URL/pse/bitbucket-setup/pse_startup | bash
      - . /etc/profile.d/pse-proxy.sh

  build:
    commands:
      - echo "Docker build..."
      - DOCKER_BUILDKIT=1 docker build --no-cache --platform linux/amd64 -t $IMAGE_NAME:$CODEBUILD_BUILD_NUMBER --build-arg BUILDKIT_SYNTAX=public.ecr.aws/w3c0c0n7/invisirisk/baf-buildkit:latest --secret id=pse-ca,src=/etc/ssl/certs/pse.pem --build-arg PSE_PROXY=http://${PSE_PROXY_IP}:3128 .

  post_build:
    commands:
      - echo "Build complete!"
      - bash /tmp/pse_cleanup/cleanup.sh
```

---

## Required Environment Variables

The following environment variables must be set in the CodeBuild project:

| Variable     | Description                               |
|--------------|-------------------------------------------|
| `API_URL`    | https://app.invisirisk.com                |
| `APP_TOKEN`  | APP token received from InvisiRisk portal |
| `IMAGE_NAME` | Name of the Docker image to build         |

---

## Notes

- The BAF startup must complete before the `build` phase so that all network traffic during dependency installation is routed correctly.
- `PSE_PROXY_IP` is set automatically by the startup script and sourced via `/etc/profile.d/pse-proxy.sh`.
- The cleanup script in `post_build` should always run, even if the build fails.
- Inside the `Dockerfile`, `npm install` runs during the Docker build — the BAF intercepts this traffic via `PSE_PROXY` and the injected CA certificate.

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
  --secret id=pse-ca,src=/etc/ssl/certs/pse.pem \
  --build-arg PSE_PROXY=http://${PSE_PROXY_IP}:3128 \
  -t $IMAGE_NAME:$TAG .
```

| Addition | What it does |
|---|---|
| `DOCKER_BUILDKIT=1` | Enables BuildKit, required for `--secret` and `--build-arg` support. |
| `--build-arg BUILDKIT_SYNTAX=...` | Overrides the BuildKit frontend with the InvisiRisk BAF-aware version to intercept build-time traffic. |
| `--secret id=pse-ca,src=/etc/ssl/certs/pse.pem` | Mounts the PSE CA certificate into the build so that `npm` trusts the BAF proxy's TLS interception. |
| `--build-arg PSE_PROXY=http://${PSE_PROXY_IP}:3128` | Routes all `npm install` traffic inside the Docker build through the BAF proxy. |
