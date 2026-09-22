import { Router } from "express";
import { auth } from "../auth.mjs";
import { queryMetrics, RANGES } from "../metrics.mjs";

const router = Router();

/**
 * GET /v1/metrics?range=1h|24h|7d|30d  (default 24h)
 * Aggregated request/token metrics recorded by the proxy pipes.
 */
router.get(["/v1/metrics", "/metrics"], (req, res) => {
  const user = auth(req);
  if (!user) {
    return res
      .status(401)
      .json({ error: { message: "Invalid API key", type: "authentication_error" } });
  }

  const range = typeof req.query.range === "string" ? req.query.range : "24h";
  if (!RANGES[range]) {
    return res.status(400).json({
      error: {
        message: `range must be one of: ${Object.keys(RANGES).join(", ")}`,
        type: "invalid_request_error",
      },
    });
  }

  res.json(queryMetrics(range));
});

export default router;
