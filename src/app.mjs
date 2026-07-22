import express from "express";
import modelsRouter from "./routes/models.mjs";
import chatRouter from "./routes/chat.mjs";
import messagesRouter from "./routes/messages.mjs";
import healthRouter from "./routes/health.mjs";

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(modelsRouter);
  app.use(chatRouter);
  app.use(messagesRouter);
  app.use(healthRouter);
  return app;
}
