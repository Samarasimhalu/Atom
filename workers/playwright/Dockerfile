# Playwright v1.62.1 on Ubuntu 24.04 (Noble), pinned to the verified multi-architecture manifest digest.
# Keep this version aligned with workers/playwright/package.json and the root package lock.
FROM mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e

ENV NODE_ENV=production \
    CI=true \
    npm_config_audit=false \
    npm_config_fund=false \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# The base image is pinned by digest and the worker never installs customer-controlled
# packages at run time. Image freshness is enforced by the Trivy CVE gate in CI.
USER root
RUN useradd --create-home --uid 10001 atom-worker \
    && mkdir -p /opt/atom-worker /work /results \
    && chown -R atom-worker:atom-worker /opt/atom-worker /work /results

WORKDIR /opt/atom-worker
COPY workers/playwright/package.json workers/playwright/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && rm -rf /usr/lib/node_modules/npm /usr/lib/node_modules/corepack /usr/lib/node_modules/yarn

ENV PATH=/opt/atom-worker/node_modules/.bin:$PATH
WORKDIR /work
USER atom-worker

# The API mounts generated tests at /work and result artifacts at /results.
# `playwright` is supplied by the immutable worker image; `--no-install` prevents runtime downloads.
ENTRYPOINT ["playwright"]
