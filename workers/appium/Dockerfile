# Node 22 Bookworm Slim, pinned to an immutable multi-architecture manifest.
# Keep this digest and workers/appium/package-lock.json aligned with the release evidence.
FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436

ENV NODE_ENV=production \
    CI=true \
    npm_config_audit=false \
    npm_config_fund=false \
    HOME=/home/atom-worker

# Dependencies are installed only while building the signed/scanned image. The
# runtime has no Docker socket, USB mounts, host network, or privileged mode.
USER root
RUN useradd --create-home --uid 10002 atom-worker \
    && mkdir -p /opt/atom-appium-worker /work /results \
    && chown -R atom-worker:atom-worker /opt/atom-appium-worker /work /results

WORKDIR /opt/atom-appium-worker
COPY workers/appium/package.json workers/appium/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/yarn
COPY workers/appium/run-mobile-test.js workers/appium/tsconfig.json ./
RUN chown atom-worker:atom-worker /opt/atom-appium-worker/run-mobile-test.js /opt/atom-appium-worker/tsconfig.json \
    && chmod 0550 /opt/atom-appium-worker/run-mobile-test.js

ENV PATH=/opt/atom-appium-worker/node_modules/.bin:$PATH
WORKDIR /work
USER atom-worker

# The runner accepts only the server-created /work/mobile-run.json config and
# connects to a server-configured managed Appium device broker. It never starts
# a public Appium listener and never enables Appium insecure features.
ENTRYPOINT ["node", "/opt/atom-appium-worker/run-mobile-test.js"]
