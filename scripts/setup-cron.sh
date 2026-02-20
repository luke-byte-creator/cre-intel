#!/bin/bash
# Setup cron jobs for Nova CRE scraping infrastructure
# Schedules scrapers to run weekly at 2-4 AM CST

PROJECT_DIR="/Users/lukejansen/.openclaw/workspace/cre-intel"
SCRIPT_PATH="$PROJECT_DIR/scripts/run-scrapers.js"

echo "Setting up Nova CRE scraper cron jobs..."

# Create logs directory
mkdir -p "$PROJECT_DIR/logs"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "Error: Node.js not found. Please install Node.js first."
    exit 1
fi

# Make the script executable
chmod +x "$SCRIPT_PATH"

# Add cron job entries
CRON_ENTRIES=(
    # Weekly scrapers - Sundays at 2 AM CST
    "0 2 * * 0 cd $PROJECT_DIR && /usr/local/bin/node scripts/run-scrapers.js >> logs/cron.log 2>&1"
    
    # Alternative: Individual scrapers on different days (uncomment if preferred)
    # "0 2 * * 1 cd $PROJECT_DIR && /usr/local/bin/node -e \"require('./scripts/run-scrapers.js').runScraper('icr')\" >> logs/cron.log 2>&1"
    # "0 2 * * 2 cd $PROJECT_DIR && /usr/local/bin/node -e \"require('./scripts/run-scrapers.js').runScraper('cbre')\" >> logs/cron.log 2>&1"
    # "0 3 * * 3 cd $PROJECT_DIR && /usr/local/bin/node -e \"require('./scripts/run-scrapers.js').runScraper('colliers')\" >> logs/cron.log 2>&1"
    # "0 3 * * 4 cd $PROJECT_DIR && /usr/local/bin/node -e \"require('./scripts/run-scrapers.js').runScraper('epermitting')\" >> logs/cron.log 2>&1"
    # "0 4 * * 5 cd $PROJECT_DIR && /usr/local/bin/node -e \"require('./scripts/run-scrapers.js').runScraper('sasktenders')\" >> logs/cron.log 2>&1"
)

# Get current crontab
crontab -l > /tmp/current_cron 2>/dev/null || true

# Add our entries
echo "# Nova CRE Intelligence Platform - Scrapers" >> /tmp/current_cron
for entry in "${CRON_ENTRIES[@]}"; do
    echo "$entry" >> /tmp/current_cron
done

# Install the new crontab
crontab /tmp/current_cron

# Clean up
rm /tmp/current_cron

echo "✅ Cron jobs installed successfully!"
echo ""
echo "Scheduled scrapers:"
echo "  - All scrapers: Sundays at 2:00 AM CST"
echo ""
echo "Logs will be written to:"
echo "  - $PROJECT_DIR/logs/scrapers.log (JSON format)"
echo "  - $PROJECT_DIR/logs/cron.log (cron output)"
echo ""
echo "To view current cron jobs: crontab -l"
echo "To remove cron jobs: crontab -e (then delete the Nova CRE lines)"
echo ""
echo "Note: Make sure the Nova CRE app is running for scrapers to access the database."