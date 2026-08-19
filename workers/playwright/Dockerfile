# Pinned browser/runtime image. Build and scan this image in CI; never install
# customer-controlled dependencies during a test run.
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

ENV NODE_ENV=production \
    CI=true \
    npm_config_ignore_scripts=true \
    npm_config_audit=false \
    npm_config_fund=false

WORKDIR /work
RUN useradd --create-home --uid 10001 atom-worker \
    && chown -R atom-worker:atom-worker /work
USER atom-worker

# The API mounts a generated test directory at /work and a private result
# directory at /results. The runtime already contains Playwright.
ENTRYPOINT ["npx", "playwright"]
