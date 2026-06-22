# NPM Project - InvisiRisk BAF Example Setup (GitLab CI/CD, Docker Build, mise)

This guide explains how to integrate the InvisiRisk BAF into a GitLab CI/CD Docker build using `mise`. This setup assumes a runner with Docker-in-Docker (`dind`) available for building Docker images.

With this pattern, GitLab only runs one task: `mise run ir_wrapped`. The `mise.toml` file keeps the BAF setup, Docker build, and cleanup in one small wrapper task.

## Prerequisites

Ensure the `IR_TOKEN` CI/CD variable is set in your project before applying these changes.

To add the variable:
1. Go to your project on GitLab.
2. Navigate to **Settings -> CI/CD -> Variables**.
3. Click **Add variable**.
4. Set the key to `IR_TOKEN` and paste the app token received from the InvisiRisk portal.
5. Mark it **Masked** and **Protected** if your pipeline runs only on protected branches.

If you use a custom InvisiRisk endpoint, also set `IR_URL`. Otherwise the example defaults to `https://app.invisirisk.com`.

---

## Step 1: Add `mise.toml`

Add the BAF setup task, cleanup task, Docker build task, and wrapper task:

```toml
[tools]
node = "20"

[tasks."pse:setup"]
hide = true
run = '''
curl -fsSL -H "x-api-key: ${IR_TOKEN}" "${IR_URL:-https://app.invisirisk.com}/ingestionapi/v1/pse/bootstrap?mode=native&runner=${RUNNER:-any}" | bash
'''

[tasks."pse:cleanup"]
hide = true
run = '''
pse-data-collector cleanup
'''

[tasks."docker:build"]
hide = true
run = '''
. /tmp/ir_envs
DOCKER_BUILDKIT=1 docker build \
  --build-arg BUILDKIT_SYNTAX=public.ecr.aws/w3c0c0n7/invisirisk/baf-buildkit:latest \
  --secret id=pse-ca,src="${PSE_CA_CERT_PATH}" \
  --build-arg PSE_PROXY="${PSE_PROXY:-http://${PSE_PROXY_IP}:3128}" \
  -t "${IMAGE_NAME}:latest" .
'''

[tasks."ir_wrapped"]
depends = ["pse:setup"]
depends_post = ["pse:cleanup"]
run = "mise run docker:build"
```

`ir_wrapped` runs the setup first, runs the Docker build, and runs cleanup as a post dependency.

---

## Step 2: Modify `.gitlab-ci.yml`

Install `mise` in the job and call the wrapper task:

```yaml
image: docker:24

services:
  - docker:24-dind

variables:
  IMAGE_NAME: sample-npm-build

stages:
  - build

build_image:
  stage: build
  before_script:
    - apk add --no-cache bash curl
    - curl -fsSL https://mise.run | sh
    - export PATH="${HOME}/.local/bin:${PATH}"
  script:
    - mise run ir_wrapped
```

---

## Required CI/CD Variables

The following variable must be set in the project (**Settings -> CI/CD -> Variables**):

| Variable | Description |
|---|---|
| `IR_TOKEN` | APP token received from InvisiRisk portal |
| `IR_URL` | Optional InvisiRisk API URL. Defaults to `https://app.invisirisk.com` when unset. |

---

## Notes

- `pse:setup` must run before the Docker build so the proxy and PSE CA certificate are ready before `npm install`.
- `. /tmp/ir_envs` is sourced inside the Docker build task because the bootstrap environment needs to be available to that command.
- `pse:cleanup` runs as a `depends_post` task so dependency data is sent to the InvisiRisk portal after the wrapped task finishes.
- Inside the `Dockerfile`, `npm install` runs during the Docker build. The BAF intercepts this traffic via `PSE_PROXY` and the injected CA certificate.

---

## Appendix: What Changed in the `docker build` Command

**Before:**
```sh
docker build -t $IMAGE_NAME:latest .
```

**After:**
```sh
DOCKER_BUILDKIT=1 docker build \
  --build-arg BUILDKIT_SYNTAX=public.ecr.aws/w3c0c0n7/invisirisk/baf-buildkit:latest \
  --secret id=pse-ca,src="${PSE_CA_CERT_PATH}" \
  --build-arg PSE_PROXY="${PSE_PROXY:-http://${PSE_PROXY_IP}:3128}" \
  -t "${IMAGE_NAME}:latest" .
```

| Addition | What it does |
|---|---|
| `DOCKER_BUILDKIT=1` | Enables BuildKit mode, required for the custom frontend and secrets support. |
| `--build-arg BUILDKIT_SYNTAX=public.ecr.aws/w3c0c0n7/invisirisk/baf-buildkit:latest` | Uses the InvisiRisk custom BuildKit frontend. |
| `--secret id=pse-ca,src="${PSE_CA_CERT_PATH}"` | Passes the PSE CA certificate into the build without embedding it in the final image. |
| `--build-arg PSE_PROXY="${PSE_PROXY:-http://${PSE_PROXY_IP}:3128}"` | Tells the build which proxy endpoint to use. |

---

## Appendix: What the BAF Lines in the `Dockerfile` Do

These lines in the `Dockerfile` consume the secret and build argument passed by the Docker build command above. Add them to the build stage that runs `npm install`.

```dockerfile
RUN --mount=type=secret,id=pse-ca \
    cp /run/secrets/pse-ca /usr/local/share/ca-certificates/pse.crt && \
    update-ca-certificates

ARG PSE_PROXY
RUN if [ -n "$PSE_PROXY" ]; then \
      npm config set proxy $PSE_PROXY && \
      npm config set https-proxy $PSE_PROXY; \
    fi
```

| Line | What it does |
|---|---|
| `--mount=type=secret,id=pse-ca` | Mounts the PSE CA certificate at `/run/secrets/pse-ca` for this `RUN` only. |
| `update-ca-certificates` | Installs the PSE CA into the system trust store for build-time HTTPS traffic. |
| `ARG PSE_PROXY` | Receives the proxy endpoint passed by `--build-arg PSE_PROXY=...`. |
| `npm config set proxy` and `npm config set https-proxy` | Routes `npm install` traffic through the BAF proxy. |
