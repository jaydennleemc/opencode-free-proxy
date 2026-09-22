import { Router } from "express";
import { auth, apiKeys, addKey, deleteKey } from "../auth.mjs";

const router = Router();

const err = (res, status, message) =>
  res.status(status).json({ error: { message, type: "invalid_request_error" } });

/** All /v1/keys endpoints require the key named "admin". */
function adminOnly(req, res) {
  const user = auth(req);
  if (!user) {
    err(res, 401, "Invalid API key");
    return false;
  }
  if (user !== "admin") {
    err(res, 403, "Key management requires the admin key");
    return false;
  }
  return true;
}

router.get("/v1/keys", (req, res) => {
  if (!adminOnly(req, res)) return;
  res.json({
    object: "list",
    data: Object.entries(apiKeys).map(([name, key]) => ({ name, key })),
  });
});

router.post("/v1/keys", (req, res) => {
  if (!adminOnly(req, res)) return;
  const name = req.body?.name;
  const key = addKey(name);
  if (!key) {
    return err(
      res,
      409,
      "name is required (1–64 chars: a-z 0-9 - _) and must not already exist",
    );
  }
  res.status(201).json({ name, key });
});

router.delete("/v1/keys/:name", (req, res) => {
  if (!adminOnly(req, res)) return;
  const { name } = req.params;
  if (name === "admin") return err(res, 400, "the admin key cannot be deleted");
  if (!deleteKey(name)) return err(res, 404, `no key named ${name}`);
  res.json({ deleted: name });
});

export default router;
