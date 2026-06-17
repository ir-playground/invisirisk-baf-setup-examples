# InvisiRisk BAF Setup for GitLab CI/CD (Non Docker)

This guide explains how to integrate the InvisiRisk BAF into your GitLab CI/CD pipeline. This setup assumes a runner where dependencies are installed **directly in the job container** (no Docker build).

## Prerequisites

Ensure the `IR_TOKEN` CI/CD variable is set in your project before applying these changes.

To add the variable:
1. Go to your project on GitLab.
2. Navigate to **Settings → CI/CD → Variables**.
3. Click **Add variable**.
4. Set the key to `IR_TOKEN` and paste the app token received from the InvisiRisk portal.
5. Mark it **Masked** (and **Protected** if your pipeline runs only on protected branches).

---

## Modify `.gitlab-ci.yml`

Add the BAF setup at the **start** of every job's `script` and the cleanup at the **end**.

> **Note:** The setup and cleanup must be added to the `script` of **every job** that runs builds or dependency installs. They are not shared across jobs.

### Step 1: Setup — start the BAF (first commands in every job's script):

```yaml
- |
  curl -sSf -H "x-api-key: ${IR_TOKEN}" "https://app.invisirisk.com/ingestionapi/v1/pse/bootstrap" | bash
  . /tmp/ir_envs
```

### Step 2: Cleanup — send data to portal (last command in every job's script):

```yaml
- pse-data-collector cleanup
```

### Full `.gitlab-ci.yml` example:

```yaml
image: ruby:3.4.1

stages:
  - build

install_dependencies:
  stage: build
  script:
    # ============= InvisiRisk Setup =============
    - |
      curl -sSf -H "x-api-key: ${IR_TOKEN}" "https://app.invisirisk.com/ingestionapi/v1/pse/bootstrap" | bash
      . /tmp/ir_envs
    # ============= InvisiRisk Setup End =============

    - gem install bundler
    - bundle install
    - gem list

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

- The BAF setup must run **before** the install commands so that all network traffic during gem installation is routed correctly.
- `. /tmp/ir_envs` sources the proxy environment variables set by the bootstrap script, so `gem` and `bundler` automatically route traffic through the BAF.
- `pse-data-collector cleanup` runs last to send the collected dependency data to the InvisiRisk portal. To guarantee it runs even when an earlier command fails, place it in an `after_script` block instead of `script`.

---

## Appendix: What Changed in the Pipeline

The key change is the addition of the BAF setup and cleanup around your existing install commands:

| Addition | What it does |
|---|---|
| `curl ... /pse/bootstrap \| bash` | Downloads and starts the InvisiRisk PSE proxy in the job, and installs the PSE CA certificate so that HTTPS traffic can be inspected. Authenticated with `IR_TOKEN` via the `x-api-key` header. |
| `. /tmp/ir_envs` | Sources the proxy environment variables set by the bootstrap script. |
| `pse-data-collector cleanup` | Runs after the build to send the collected dependency data to the InvisiRisk portal. |
