import { createApp } from "./app.mjs";
import { PORT, PROXY_VERSION, MODELS } from "./config/index.mjs";
import { loadKeys, apiKeys } from "./auth.mjs";
import { logLine, logStatusLine } from "./logger.mjs";

loadKeys();

const app = createApp();
app.listen(PORT, "0.0.0.0", () => {
  logLine(`OpenCode Free Proxy v${PROXY_VERSION} on http://0.0.0.0:${PORT}`);
  logLine("  OpenAI:    POST /v1/chat/completions");
  logLine("  Anthropic: POST /v1/messages");
  logLine("  Models:    GET  /v1/models");
  logLine("  Health:    GET  /health");
  logLine("  Models:", MODELS.join(", "));
  logStatusLine();
  logLine("  API keys:", Object.keys(apiKeys).length, "loaded");
});
