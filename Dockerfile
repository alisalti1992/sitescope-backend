# Use Node.js with Puppeteer support for web crawling
FROM apify/actor-node-puppeteer-chrome:20

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY --chown=myuser package*.json ./

# Install dependencies
RUN npm --quiet set progress=false \
    && npm install \
    && echo "Installed NPM packages:" \
    && (npm list --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version

# Copy Prisma schema first
COPY --chown=myuser prisma ./prisma

# Generate Prisma client during build
RUN npx prisma generate

# Install system dependencies for Chromium and Puppeteer
USER root
RUN apt-get update && apt-get install -y \
    chromium \
    libgconf-2-4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libnss3 \
    libx11-xcb1 \
    libxss1 \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libdrm2 \
    libxkbcommon0 \
    xdg-utils \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create storage directories with proper permissions (as root)
RUN mkdir -p storage/screenshots storage/request_queues storage/key_value_stores \
    && chown -R myuser:myuser storage

# Switch back to myuser
USER myuser

# Copy source code and views
COPY --chown=myuser src ./src
COPY --chown=myuser views ./views

# Copy and set up entrypoint script
COPY --chown=myuser docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Expose the application port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Use entrypoint script to handle storage setup and start application
CMD ["./docker-entrypoint.sh"]