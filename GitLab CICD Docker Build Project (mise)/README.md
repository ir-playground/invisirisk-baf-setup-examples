# Docker Project - InvisiRisk BAF Example Setup (GitLab CI/CD, Docker Build, mise)

This guide explains how to integrate the InvisiRisk BAF into a GitLab CI/CD Docker build using `mise`. This project builds two Docker services:

- `python-api` from `./python-api`
- `node-api` from `./node-api`

The GitLab jobs include local workflow files and call one wrapper task: `mise run ir_wrapped`. The wrapper task handles BAF setup, the Docker build, and cleanup.

## Project Structure

```text
docker-project/
├── .gitlab-ci.yml
├── .gitlab/
│   └── workflows/
│       ├── mise-task.yml
│       ├── npm.yml
│       └── python.yml
├── mise.toml
├── docker-compose.yml
├── node-api/
│   ├── Dockerfile
│   ├── package.json
│   └── src/index.js
└── python-api/
    ├── Dockerfile
    ├── requirements.txt
    └── app/main.py
```

## Prerequisites

Ensure the `IR_TOKEN` CI/CD variable is set in your project before applying these changes.

To add the variable:
1. Go to your project on GitLab.
2. Navigate to **Settings -> CI/CD -> Variables**.
3. Click **Add variable**.
4. Set the key to `IR_TOKEN` and paste the app token received from the InvisiRisk portal.
5. Mark it **Masked** and **Protected** if your pipeline runs only on protected branches.

Also set `IR_URL` to your InvisiRisk API URL.

---

## Step 1: Add `mise.toml`

The project keeps the BAF lifecycle in root-level `mise` tasks:

```toml
[tasks."pse:setup"]
hide = true
run = '''
curl -fsSL -H "x-api-key: ${IR_TOKEN}" "${IR_URL}/ingestionapi/v1/pse/bootstrap?mode=native&runner=${RUNNER:-any}" | bash
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
  -t "${CI_REGISTRY_IMAGE}:${CI_COMMIT_SHA}" "${PROJECT_PATH}"
'''

[tasks."ir_wrapped"]
depends = ["pse:setup"]
depends_post = ["pse:cleanup"]
run = "mise run docker:build"
```

`ir_wrapped` is the only task each Docker build job needs to call.

---

## Step 2: Add the local GitLab include

The root `.gitlab-ci.yml` includes the shared mise task and the service-specific jobs:

```yaml
variables:
  CI_RUNNER_IMAGE: "nikolaik/python-nodejs:python3.12-nodejs22"
  DOCKER_IMAGE: "docker:27"
  DOCKER_TLS_CERTDIR: "/certs"
  MISE_PYTHON_COMPILE: "false"

default:
  image: $CI_RUNNER_IMAGE

stages:
  - python
  - npm

include:
  - local: .gitlab/workflows/mise-task.yml
  - local: .gitlab/workflows/npm.yml
  - local: .gitlab/workflows/python.yml
```

The local `.mise-task` template installs `mise` and runs the task passed by each job:

```yaml
.mise-task:
  image: docker:27
  services:
    - docker:27-dind
  before_script:
    - apk add --no-cache bash curl
    - curl -fsSL https://mise.run | sh
    - export PATH="${HOME}/.local/bin:${PATH}"
  script:
    - mise run "${MISE_TASK}"
  variables:
    DOCKER_TLS_CERTDIR: ""
```

---

## Step 3: Wrap each Docker build job

The Node job points `PROJECT_PATH` at `./node-api`:

```yaml
docker:build:node:
  extends: .mise-task
  variables:
    MISE_TASK: ir_wrapped
    CI_REGISTRY_IMAGE: node-api
    CI_COMMIT_SHA: latest
    PROJECT_PATH: ./node-api
  stage: npm
  rules:
    - when: always
```

The Python job points `PROJECT_PATH` at `./python-api`:

```yaml
docker:build:python:
  extends: .mise-task
  variables:
    MISE_TASK: ir_wrapped
    CI_REGISTRY_IMAGE: python-api
    CI_COMMIT_SHA: latest
    PROJECT_PATH: ./python-api
  stage: python
  rules:
    - when: always
```

---

## Required CI/CD Variables

The following variables must be set in the project (**Settings -> CI/CD -> Variables**):

| Variable | Description |
|---|---|
| `IR_TOKEN` | APP token received from InvisiRisk portal |
| `IR_URL` | InvisiRisk API URL used by the bootstrap command |

---

## Notes

- `pse:setup` runs before each wrapped Docker build job.
- `pse:cleanup` runs as a `depends_post` task for each wrapped Docker build job.
- `. /tmp/ir_envs` is sourced inside `docker:build` so the proxy and CA certificate values are available to Docker BuildKit.
- The Node and Python Dockerfiles both receive the same BAF BuildKit arguments through the shared `docker:build` task.
