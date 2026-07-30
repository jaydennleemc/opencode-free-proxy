import fs from "fs";

export const PORT = process.env.PROXY_PORT || 6446;
export const OC_VERSION = "1.15.0";

const pkg = JSON.parse(
  fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
);
export const PROXY_VERSION = pkg.version;

export const MODELS = JSON.parse(
  fs.readFileSync(new URL("../../models.json", import.meta.url), "utf8"),
);
export const KEYS_FILE = process.env.KEYS_FILE || "./api-keys.json";
