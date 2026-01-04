import { createNodeMiddleware } from "@trpc/server/adapters/node-http";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";
import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

// tRPC middleware
app.use(
  "/api/trpc",
  createNodeMiddleware({
    router: appRouter,
    createContext,
  })
);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

export default app;
