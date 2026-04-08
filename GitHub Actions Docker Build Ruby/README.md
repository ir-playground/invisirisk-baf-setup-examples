# Ruby Project - InvisiRisk BAF Example Setup

This guide explains how to integrate the InvisiRisk BAF into your GitHub Actions pipeline. This setup assumes an `ubuntu-latest` runner with Docker available.

## Prerequisites

Ensure the `IR_API_KEY` secret is set in your repository before applying these changes.

To add the secret:
1. Go to your repository on GitHub.
2. Navigate to **Settings → Secrets and variables → Actions → Repository secrets**.
3. Click **New repository secret**.
4. Set the name to `IR_API_KEY` and paste the app token received from the InvisiRisk portal.

---

## Step 1: Modify your workflow file

Add the PSE setup step at the **start** of each job's steps and the PSE cleanup step at the **end**. Update the `docker build` command with the BAF build arguments.

> **Note:** The `Setup PSE` and `Cleanup PSE` steps must be added to **every job** that runs a Docker build. They cannot be shared across jobs.

### Setup PSE step — start the BAF (first step in every job):

```yaml
# ============= InvisiRisk Setup =============
- name: Setup PSE
  uses: invisirisk/pse-action@latest
  with:
    app_token: ${{ secrets.IR_API_KEY }}
# ============= InvisiRisk Setup End =============
```

### Update your `docker build` command ([see what changed](#appendix-what-changed-in-the-docker-build-command)):

```yaml
- name: Build Docker image
  run: |    DOCKER_BUILDKIT=1 docker build \
      -t $IMAGE_NAME:latest \
      --build-arg BUILDKIT_SYNTAX=public.ecr.aws/w3c0c0n7/invisirisk/baf-buildkit:latest \
      --secret id=pse-ca,src=/etc/ssl/certs/pse.pem \
      --build-arg PSE_PROXY=http://${PSE_PROXY_IP}:3128 \
      .
```

### Cleanup PSE step — send data to portal (last step in every job, with `if: always()`):

```yaml
# ============= InvisiRisk Cleanup =============
- name: Cleanup PSE
  if: always()
  uses: invisirisk/pse-action@latest
  with:
    cleanup: "true"
# ============= InvisiRisk Cleanup End =============
```

### Full workflow example:

> **Note:** The workflow filename can be anything (e.g. `build.yml`, `ci.yml`). It does not need to be named `install.yml`.

```yaml
name: Build Docker Image

on:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      # ============= InvisiRisk Setup =============
      - name: Setup PSE
        uses: invisirisk/pse-action@latest
        with:
          app_token: ${{ secrets.IR_API_KEY }}
      # ============= InvisiRisk Setup End =============

      - name: Checkout code
        uses: actions/checkout@v4

      - name: Build Docker image
        run: |
          DOCKER_BUILDKIT=1 docker build \
            -t sample-ruby-build:latest \
            --build-arg BUILDKIT_SYNTAX=public.ecr.aws/w3c0c0n7/invisirisk/baf-buildkit:latest \
            --secret id=pse-ca,src=/etc/ssl/certs/pse.pem \
            --build-arg PSE_PROXY=http://${PSE_PROXY_IP}:3128 \
            .

      # ============= InvisiRisk Cleanup =============
      - name: Cleanup PSE
        if: always()
        uses: invisirisk/pse-action@latest
        with:
          cleanup: "true"
      # ============= InvisiRisk Cleanup End =============
```

---

## Required Secret

The following secret must be set in the repository (**Settings → Secrets and variables → Actions → Repository secrets**):

| Secret        | Description                               |
|---------------|-------------------------------------------|
| `IR_API_KEY`  | APP token received from InvisiRisk portal |

---

## Notes

- The `Setup PSE` step must run **before** the `docker build` step so that the proxy is active and the PSE CA certificate is installed before any build-time network traffic occurs.
- The `Cleanup PSE` step uses `if: always()` to ensure it runs even if a previous step fails, so dependency data is always sent to the InvisiRisk portal.
- The `Setup PSE` and `Cleanup PSE` steps must be present in **every job** that performs a Docker build — they are not shared across jobs automatically.
- `PSE_PROXY_IP` is set automatically by the `Setup PSE` action and is available as an environment variable for the duration of the job.

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
| `DOCKER_BUILDKIT=1` | Enables BuildKit mode, required for the custom frontend and secrets support. Add this as a prefix if not already set. |
| `--build-arg BUILDKIT_SYNTAX=public.ecr.aws/w3c0c0n7/invisirisk/baf-buildkit:latest` | Swaps in the InvisiRisk custom BuildKit frontend, which transparently routes build-time traffic through the BAF. |
| `--secret id=pse-ca,src=/etc/ssl/certs/pse.pem` | Passes the PSE CA certificate into the build without embedding it in the final image. |
| `--build-arg PSE_PROXY=http://${PSE_PROXY_IP}:3128` | Tells the frontend which proxy endpoint to use. `PSE_PROXY_IP` is set by the `Setup PSE` action. |
