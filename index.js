import "dotenv/config";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import apiRoutes from "./routes/apis.js";
import { startCleanupJob } from "./utils/cleanup.js";
import { Readable } from 'stream';

const app = express();
const port = process.env.PORT || 3000;

app.use((req, res, next) => {
  let data = [];
  req.on('data', chunk => data.push(chunk));
  req.on('end', () => {
    const buffer = Buffer.concat(data);
    req.rawBody = buffer;

    if (req.headers['content-length'] > 0 || req.headers['transfer-encoding']) {
      const readable = new Readable();
      readable._read = () => {}; 
      readable.push(buffer);
      readable.push(null);
      
      Object.assign(readable, {
        headers: req.headers,
        method: req.method,
        url: req.url,
        rawBody: buffer
      });
      
      req.on = readable.on.bind(readable);
      req.once = readable.once.bind(readable);
      req.emit = readable.emit.bind(readable);
      req.resume = readable.resume.bind(readable);
      req.pause = readable.pause.bind(readable);
      req.pipe = readable.pipe.bind(readable);
      req.unpipe = readable.unpipe.bind(readable);

      // Manual JSON parsing for the /contact and /update-profile-name routes
      if (req.headers['content-type']?.includes('application/json')) {
        try {
          req.body = JSON.parse(buffer.toString());
        } catch (e) {
          req.body = {};
        }
      }
    }
    next();
  });
});


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