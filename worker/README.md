# Nova Email Worker

Receives forwarded lead emails and ingests them into the Nova inquiry database.

## Setup

1. Install wrangler: `npm install -g wrangler`
2. Login: `wrangler login`
3. Install deps: `cd worker && npm install`
4. Set up Cloudflare Email Routing:
   - Go to Cloudflare Dashboard → nova-cre.dev → Email → Email Routing
   - Enable Email Routing
   - Add a custom address: `leads@nova-cre.dev`
   - Route to: Worker → `nova-email-worker`
5. Deploy: `npm run deploy`
6. Update INGEST_URL in wrangler.toml to your production URL

## Usage

Forward any lead email to `leads@nova-cre.dev`. The worker will:
1. Parse the email for tenant info
2. Auto-detect the source (Spacelist, CBRE, etc.)
3. Create an inquiry in the Nova database

## Adding New Parsers

Edit `src/index.ts` and add source-specific parsers in the `parseEmail` function.
