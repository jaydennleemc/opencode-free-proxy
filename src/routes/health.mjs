import { Router } from "express";
import { PROXY_VERSION, MODELS, OC_BASE_URL } from "../config/index.mjs";
import { health as ocHealth } from "../oc-client.mjs";

const router = Router();

router.get("/health", async (_req, res) => {
  let opencode = false;
  try {
    opencode = await ocHealth();
  } catch {}
  res.json({
    status: opencode ? "ok" : "degraded",
    version: `v${PROXY_VERSION}`,
    models: MODELS.length,
    opencode: { url: OC_BASE_URL, up: opencode },
    endpoints: ["/v1/chat/completions", "/v1/messages", "/v1/models"],
  });
});

export default router;
