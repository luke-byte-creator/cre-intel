// Cloudflare Email Worker for Nova Research
// Sends the raw email to the app for server-side parsing

let rateLimitData = { senderCounts: {}, globalCount: [], lastCleanup: Date.now() };

function checkRateLimit(senderEmail) {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  // cleanup
  if (now - rateLimitData.lastCleanup > 600000) {
    for (const [s, ts] of Object.entries(rateLimitData.senderCounts)) {
      rateLimitData.senderCounts[s] = ts.filter(t => now - t < oneHour);
      if (rateLimitData.senderCounts[s].length === 0) delete rateLimitData.senderCounts[s];
    }
    rateLimitData.globalCount = rateLimitData.globalCount.filter(t => now - t < oneHour);
    rateLimitData.lastCleanup = now;
  }
  const sender = senderEmail.toLowerCase();
  const recent = (rateLimitData.senderCounts[sender] || []).filter(t => now - t < oneHour);
  if (recent.length >= 30) return { allowed: false };
  if (rateLimitData.globalCount.filter(t => now - t < oneHour).length >= 100) return { allowed: false };
  recent.push(now);
  rateLimitData.senderCounts[sender] = recent;
  rateLimitData.globalCount.push(now);
  return { allowed: true };
}

export default {
  async email(message, env, ctx) {
    try {
      const from = message.from;
      const to = message.to;
      const subject = message.headers.get("subject") || "";

      // Rate limit
      if (!checkRateLimit(from).allowed) return;

      // Whitelist
      const whitelist = (env.EMAIL_WHITELIST || "").split(",").map(e => e.trim().toLowerCase()).filter(e => e);
      if (!whitelist.some(w => from.toLowerCase().includes(w))) return;

      // SPF/DKIM
      const authHeaders = [
        message.headers.get("Authentication-Results") || "",
        message.headers.get("ARC-Authentication-Results") || "",
        message.headers.get("Received-SPF") || ""
      ].join("\n");
      const spfPass = /spf=pass/i.test(authHeaders);
      const dkimPass = /dkim=pass/i.test(authHeaders);
      if (!spfPass || !dkimPass) return;

      // Read entire raw email and base64 encode it
      const rawArrayBuffer = await new Response(message.raw).arrayBuffer();
      const rawBytes = new Uint8Array(rawArrayBuffer);

      // Convert to base64 in chunks
      let binary = "";
      for (let i = 0; i < rawBytes.length; i += 8192) {
        const chunk = rawBytes.subarray(i, i + 8192);
        for (let j = 0; j < chunk.length; j++) {
          binary += String.fromCharCode(chunk[j]);
        }
      }
      const rawBase64 = btoa(binary);

      // Send raw email to app — let server-side parse it properly
      const payload = {
        from,
        to,
        subject,
        rawEmail: rawBase64,
        authenticated: true,
        receivedAt: new Date().toISOString()
      };

      const response = await fetch(env.API_URL || "https://novaresearch.ca/api/email/inbound", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + (env.API_SECRET || ""),
          "User-Agent": "Nova-Email-Worker/3.0"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const err = await response.text().catch(() => "");
        console.error("API error:", response.status, err.slice(0, 300));
      }
    } catch (error) {
      console.error("Worker error:", error.message);
    }
  }
};
