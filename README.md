# Nova CRE Intel

Commercial real estate intelligence platform built with Next.js, TypeScript, and SQLite.

## Security Features

### Email Authentication
- **SPF/DKIM Verification**: Cloudflare Email Worker verifies sender authentication
- **Sender Whitelist**: Only authorized CBRE email addresses can submit emails
- **Defense in Depth**: Both worker and server-side authentication verification

### Emergency Kill Switch
- **Admin Interface**: `/admin/security` for manual emergency shutdown
- **Telegram Trigger**: `watermelon` message activates emergency shutdown via OpenClaw
- **System Protection**: Blocks all API routes except admin controls when active
- **Process Termination**: Kills Next.js server and Cloudflare tunnel on activation
- **Recovery**: Admin authentication required for system restoration

### Implementation Details
- Kill switch status stored in `data/killswitch.lock`
- All shutdowns logged to `data/killswitch.log` with timestamps and user info
- API routes protected via `checkKillSwitch()` utility function
- Telegram trigger script: `/Users/lukejansen/.openclaw/workspace/kill-nova.sh`

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
