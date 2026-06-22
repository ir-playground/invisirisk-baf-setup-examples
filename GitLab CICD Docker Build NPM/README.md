# NPM Project - InvisiRisk BAF Example Setup (GitLab CI/CD, Docker Build, mise)

This example shows the GitLab Docker build flow using `mise` to wrap the InvisiRisk BAF setup and cleanup around the actual build.

## Required CI/CD variables

Set these in **Settings -> CI/CD -> Variables**:

- `IR_TOKEN`
- `IR_URL` if you are not using `https://app.invisirisk.com`

## Files

- `.gitlab-ci.yml` installs `mise` and runs `mise run ir_wrapped`
- `mise.toml` contains the PSE lifecycle tasks
- `Dockerfile` shows the BuildKit secret and proxy usage for `npm install`

## How it works

`ir_wrapped` is the only task GitLab needs to call.

1. `pse:setup` starts PSE through the bootstrap endpoint
2. `docker:build` sources `/tmp/ir_envs` and runs `docker build`
3. `pse:cleanup` runs as a post dependency

## `.gitlab-ci.yml`

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

## `mise.toml`

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
