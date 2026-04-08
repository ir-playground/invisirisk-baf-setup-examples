# InvisiRisk BAF Setup for GitHub Actions (Non Docker)

This guide explains how to integrate the InvisiRisk BAF into your GitHub Actions pipeline. This setup assumes an `ubuntu-latest` runner where dependencies are installed **directly on the build machine**.

## Prerequisites

Ensure the `IR_API_KEY` secret is set in your repository before applying these changes.

To add the secret:
1. Go to your repository on GitHub.
2. Navigate to **Settings → Secrets and variables → Actions → Repository secrets**.
3. Click **New repository secret**.
4. Set the name to `IR_API_KEY` and paste the app token received from the InvisiRisk portal.

---

## Modify your workflow file

Add the PSE setup step at the **start** of your job steps and the PSE cleanup step at the **end**.

### Step 1: Setup PSE — start the BAF:

```yaml
- name: Setup PSE
  uses: invisirisk/pse-action@latest
  with:
    app_token: ${{ secrets.IR_API_KEY }}
```

### Step 2: Perform your installs — then add the Cleanup PSE step last:

```yaml
- name: Cleanup PSE
  if: always()
  uses: invisirisk/pse-action@latest
  with:
    cleanup: "true"
```

### Full workflow example:

> **Note:** The workflow filename can be anything (e.g. `build.yml`, `ci.yml`). It does not need to be named `install.yml`.

```yaml
name: Ruby build
on:
  workflow_dispatch:

jobs:
  RUBY:
    runs-on: ubuntu-latest
    name: Run build
    steps:
      - name: Setup PSE
        uses: invisirisk/pse-action@latest
        with:
          app_token: ${{ secrets.IR_API_KEY }}

      - uses: actions/checkout@v4

      - name: Set up Ruby
        uses: ruby/setup-ruby@v1
        with:
          ruby-version: '3.4.1'

      - name: Install dependencies
        run: |
          gem install bundler
          bundle install
          gem list

      - name: Cleanup PSE
        if: always()
        uses: invisirisk/pse-action@latest
        with:
          cleanup: "true"
```

---

## Required Secret

The following secret must be set in the repository (**Settings → Secrets and variables → Actions → Repository secrets**):

| Secret        | Description                               |
|---------------|-------------------------------------------|
| `IR_API_KEY`  | APP token received from InvisiRisk portal |

---

## Notes

- The PSE setup step must run **before** the install step so that all network traffic during gem installation is routed correctly.
- The cleanup step uses `if: always()` to ensure it runs even if a previous step fails, so dependency data is always sent to the InvisiRisk portal.

---

## Appendix: What Changed in the Workflow

The key change is the addition of the BAF setup and cleanup steps around your existing install commands:

| Addition | What it does |
|---|---|
| `invisirisk/pse-action@latest` (setup) | Starts the InvisiRisk PSE proxy on the runner and installs the PSE CA certificate so that HTTPS traffic can be inspected. |
| `app_token: ${{ secrets.IR_API_KEY }}` | Authenticates the runner with the InvisiRisk portal using the secret you configured. |
| `invisirisk/pse-action@latest` (cleanup) | Runs after the build to send the collected dependency data to the InvisiRisk portal. |
