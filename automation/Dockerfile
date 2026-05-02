# Uses the official Playwright image — Chromium + all system dependencies
# are pre-installed, so no manual apt-get setup needed.
FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

# Install Node dependencies (including multer, express, xlsx)
COPY package*.json ./
RUN npm ci

# Copy automation source
COPY . .

# Ensure output directories exist
RUN mkdir -p reports audit

# Playwright browsers are already installed in the base image.
# Point Playwright to the pre-installed Chromium so it doesn't
# try to download a second copy at runtime.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Service config
ENV PORT=3000
ENV SITE_URL=http://demo-site:8080
ENV HEADLESS=true

EXPOSE 3000

CMD ["node", "server.js"]
