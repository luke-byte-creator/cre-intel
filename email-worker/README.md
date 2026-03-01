# Nova Email Worker Setup

This Cloudflare Worker receives emails at `nova@novaresearch.ca` and forwards them to the CRE Intel application for processing.

## Deployment Steps

1. **Create the Worker in Cloudflare Dashboard**
   - Go to Workers & Pages → Create Application → Create Worker
   - Name: `nova-email-worker`
   - Replace default code with the content from `worker.js`

2. **Configure Environment Variables**
   In the Worker settings, add these environment variables:
   ```
   API_URL = https://novaresearch.ca/api/email/inbound
   API_SECRET = [generate with: openssl rand -base64 32]
   EMAIL_WHITELIST = luke.jansen@cbre.com,michael.bratvold@cbre.com,shane.endicott@cbre.com,dallon.kuprowski@cbre.com,ben.kelley@cbre.com,kim.klippenstein@cbre.com
   MONITORING_WEBHOOK = [optional - for email rejection monitoring]
   ```

3. **Set up Email Routing**
   - Go to Email → Email Routing in your domain dashboard
   - Add custom address: `nova@novaresearch.ca`
   - Set destination to: Worker → `nova-email-worker`
   - Enable the route

4. **DNS Configuration** (if not already set up)
   Add these DNS records for receiving emails:
   ```
   MX    @    route1.mx.cloudflare.net    (Priority: 10)
   MX    @    route2.mx.cloudflare.net    (Priority: 20)  
   MX    @    route3.mx.cloudflare.net    (Priority: 30)
   TXT   @    "v=spf1 include:_spf.mx.cloudflare.net ~all"
   ```

   **SPF/DKIM Authentication Setup:**
   The worker now verifies SPF and DKIM authentication for all incoming emails. Cloudflare Email Routing automatically performs these checks and includes results in headers. The worker parses:
   - `Authentication-Results` header
   - `ARC-Authentication-Results` header 
   - `Received-SPF` header
   
   Emails failing SPF or DKIM verification are rejected and logged for monitoring.

   **Rate Limiting:**
   The worker implements automatic rate limiting to prevent abuse:
   - **Per-sender limit**: 30 emails per hour per sender address
   - **Global limit**: 100 emails per hour total (across all senders)
   - Uses in-memory counting that persists across requests within the same isolate
   - Rate-limited emails are rejected with logging but not forwarded to the webhook
   - No additional configuration required - runs automatically

5. **Update App Environment**
   Add to the main app's `.env` file:
   ```
   NOVA_EMAIL_SECRET=[same value as API_SECRET above]
   NOVA_EMAIL_WHITELIST=luke.jansen@cbre.com
   ```

## Testing

Send a test email to `nova@novaresearch.ca` with:
- Subject: `Test #drafter email`  
- Body with instructions
- Attach a .docx file

Check the Worker logs in Cloudflare dashboard and the app logs to verify processing.

## Email Format

The worker expects:
- **Subject**: Can contain #tag (e.g., "#drafter", "#comp", "#permit", "#prospect") 
- **Body**: User instructions above forwarded content
- **Attachments**: .docx, .pdf files encoded as base64

## Supported #tags

- **#drafter**: Process document with AI edits (requires .docx attachment)
- **#comp**: Extract comparable sale/lease data (pending review)
- **#permit**: Extract building permit data (direct insert)
- **#prospect**: Extract contact information (direct insert with smart dedup)

The worker forwards a JSON payload to `/api/email/inbound`:
```json
{
  "from": "sender@domain.com",
  "to": "nova@novaresearch.ca", 
  "subject": "Test #drafter request",
  "body": "Email body text...",
  "messageId": "unique-message-id",
  "attachments": [
    {
      "filename": "document.docx",
      "contentType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "size": 12345,
      "data": "base64-encoded-content..."
    }
  ],
  "receivedAt": "2024-02-17T18:00:00.000Z"
}
```

## Troubleshooting

- **Worker not receiving emails**: Check Email Routing configuration
- **API calls failing**: Verify API_SECRET matches between worker and app
- **Attachments too large**: Cloudflare Workers have memory limits
- **Permission errors**: Ensure the worker has the Email Handler binding