import "dotenv/config";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import apiRoutes from "./routes/apis.js";
import { startCleanupJob } from "./utils/cleanup.js";

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// CORS Setup
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        console.warn(`Blocked CORS request from: ${origin}`);
        return callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization", "x-internal-key"],
  })
);

// Routes
app.use("/", apiRoutes);

// Start Cron Jobs
startCleanupJob();

// Start Server
app.listen(port, () => console.log(`Server running on port ${port}`));