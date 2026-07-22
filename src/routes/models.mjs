import { Router } from "express";
import { MODELS } from "../config/index.mjs";

const router = Router();

router.get("/v1/models", (_req, res) => {
  res.json({
    object: "list",
    data: MODELS.map((id) => ({
      id, object: "model", created: 1779000000, owned_by: "opencode-free",
    })),
  });
});

export default router;
