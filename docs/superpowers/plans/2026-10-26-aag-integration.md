# AAG Integration Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. Steps use checkboxes for tracking.

**Goal:** Publish AAG Interactive under `/aag` on the existing site from a separate branch.

**Architecture:** A standalone AAG Node container holds its own SQLite database and uploads. Next.js proxies `/aag/*` to it, while the original group API remains at `/api/*`.

**Tech Stack:** Node.js 22, Docker Compose, Next.js 16, SQLite.

**Spec:** `docs/aag-integration-design.md`

## Global constraints

- Work in `codex/aag-interactive` and keep user data out of Git.
- Public address is `https://is2612.ru/aag`; start with an empty AAG database.
- Preserve existing group and CYBER SAFE services.

## Review focus

- API requests from AAG pages must reach AAG, not the group API.
- Relative page links and assets must work after the `/aag` redirect.
- QR links must include `/aag/participant.html`.
- Login cookies must be scoped to `/aag` and work over HTTPS.
- AAG data must survive container recreation.

## Tasks

### 1. Prefix and security

- [ ] Add failing tests for AAG links, API path, QR link, and cookie behavior.
- [ ] Prefix browser API calls and adapt the server's public URL and cookies.
- [ ] Run the tests and fix failures.

### 2. Site and container

- [ ] Add failing route checks for `/aag` and `/aag/api/health`.
- [ ] Add the standalone Docker service, Next rewrite, redirect, and link on the site.
- [ ] Check Docker configuration, build, and local HTTP routes.

### 3. Publish and verify

- [ ] Run AAG tests and site checks; inspect Git diff and sensitive files.
- [ ] Commit and push only the separate branch.
- [ ] Back up the server, deploy the verified branch without losing existing data, bootstrap the admin privately, and test host and participant flows.
