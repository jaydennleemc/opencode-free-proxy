import { createApp } from "./app.mjs";
import { PORT, PROXY_VERSION, MODELS } from "./config/index.mjs";
import { loadKeys, apiKeys } from "./auth.mjs";
import { logStatusLine } from "./logger.mjs";

loadKeys();

const app = createApp();
app.listen(PORT, "0.0.0.0", () => {
  console.log(`OpenCode Free Proxy v${PROXY_VERSION} on http://0.0.0.0:${PORT}`);
  console.log("  OpenAI:    POST /v1/chat/completions");
  console.log("  Anthropic: POST /v1/messages");
  console.log("  Models:    GET  /v1/models");
  console.log("  Health:    GET  /health");
  console.log("  Models:", MODELS.join(", "));
  logStatusLine();
  for (const [name, key] of Object.entries(apiKeys)) {
    console.log(`  ${name.padEnd(15)} ${key}`);
  }
});
