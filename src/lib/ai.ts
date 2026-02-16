import fs from "fs";
import path from "path";

function getGatewayConfig() {
  const configPath = path.join(process.env.HOME || "", ".openclaw", "openclaw.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  return {
    port: config.gateway?.port || 18789,
    token: config.gateway?.auth?.token || "",
  };
}

export async function callAI(messages: { role: string; content: string }[], maxTokens = 8000) {
  const { port, token } = getGatewayConfig();
  const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4-20250514",
      messages,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`AI call failed: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
