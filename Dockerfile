# Use Node.js with Puppeteer support for web crawling
FROM apify/actor-node-puppeteer-chrome:20

# Set working directory
WORKDIR /app
# Copy package files for dependency installation
COPY --chown=myuser package*.json ./

# Install all dependencies (including dev dependencies for nodemon)
RUN npm --quiet set progress=false \
    && npm install --include=dev \
    && echo "Installed NPM packages:" \
    && (npm list --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version \
    && echo "Nodemon version:" \
    && (npx nodemon --version || echo "Nodemon not found")

# Copy Prisma schema first
COPY --chown=myuser prisma ./prisma

# Generate Prisma client during build
RUN npx prisma generate

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
    xdg-utils

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/chromium

# Copy rest of source code (this will be mounted as volume in development)
COPY --chown=myuser . ./

# Create storage directory for screenshots
RUN mkdir -p storage/screenshots && chown -R myuser:myuser storage

# Expose the application port
EXPOSE 5000

# Use nodemon for development to watch file changes
# Start XVFB and run the application with automatic migrations
CMD xvfb-run -a -s "-ac -screen 0 1920x1080x24+32 -nolisten tcp" sh -c "npm start"
