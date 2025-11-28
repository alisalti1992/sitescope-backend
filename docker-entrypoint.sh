#!/bin/sh
set -e

# Function to create directory with fallback
ensure_dir() {
    if [ ! -d "$1" ]; then
        mkdir -p "$1" 2>/dev/null || echo "Directory $1 already exists or will be created by application"
    fi
    # Try to set permissions, but don't fail if we can't
    chmod -R 755 "$1" 2>/dev/null || true
}

# Ensure storage directories exist
ensure_dir "storage/screenshots"
ensure_dir "storage/request_queues"
ensure_dir "storage/key_value_stores"

# Start the application with xvfb for headless browser support
exec xvfb-run -a -s "-ac -screen 0 1920x1080x24+32 -nolisten tcp" npm start
