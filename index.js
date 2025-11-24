import "dotenv/config";

import admin from "firebase-admin";
import express from "express";
import cors from "cors";
import multer from "multer";
import axios from "axios";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import bodyParser from "body-parser";
import Mailjet from "node-mailjet";
import { Filter } from "bad-words";
import { verifyInternalKey } from "./shared/apiKeyMiddleware.js";
import { enforceLimit } from "./shared/rateLimit.js";
import ImageKit from "imagekit";


if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}


const app = express();
const port = process.env.PORT || 3000;


const mailjet = new Mailjet({
  apiKey: process.env.MJ_APIKEY_PUBLIC,
  apiSecret: process.env.MJ_APIKEY_PRIVATE,
});


const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : [];

app.use(bodyParser.json());

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


const CLEANUP_CRON = process.env.CLEANUP_CRON || "0 3 * * *";
const MAX_UPLOAD_FILE_AGE_HOURS = Number(process.env.MAX_UPLOAD_FILE_AGE_HOURS || 24);
const CLEANUP_DRY_RUN = (process.env.CLEANUP_DRY_RUN || "false").toLowerCase() === "true";

const filter = new Filter();
filter.addWords("bitcoin","crypto","viagra","loan","casino","forex","porn","betting");

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});


const memoryStorage = multer.memoryStorage();

const uploadDisk = multer({
  storage: diskStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/"))
      return cb(new Error("Only images allowed"));
    cb(null, true);
  },
});

const uploadMemory = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/"))
      return cb(new Error("Only images allowed"));
    cb(null, true);
  },
});

async function cleanupUploads() {
  try {
    const resolvedUploadDir = path.resolve(uploadDir);

    if (!resolvedUploadDir.includes(path.resolve(process.cwd()))) {
      console.warn(`[CLEANUP] Refusing to run: uploadDir (${resolvedUploadDir}) not inside project root.`);
      return;
    }
    if (!resolvedUploadDir.endsWith("uploads") && !resolvedUploadDir.includes(`${path.sep}uploads`)) {
      console.warn(`[CLEANUP] Refusing to run: uploadDir (${resolvedUploadDir}) does not look like './uploads'.`);
      return;
    }

    const files = await readdir(resolvedUploadDir);
    if (!files || files.length === 0) {
      console.log("[CLEANUP] No files found in uploads directory.");
      return;
    }

    const now = Date.now();
    const maxAgeMs = MAX_UPLOAD_FILE_AGE_HOURS * 60 * 60 * 1000;

    let deleted = 0;
    for (const file of files) {
      const filePath = path.join(resolvedUploadDir, file);
      let stats;
      try {
        stats = await stat(filePath);
      } catch (err) {
        console.warn(`[CLEANUP] Skipping ${file}: cannot stat: ${err.message}`);
        continue;
      }

      if (!stats.isFile()) {
        continue;
      }

      const age = now - stats.mtimeMs;
      if (age > maxAgeMs) {
        if (CLEANUP_DRY_RUN) {
          console.log(`[CLEANUP][DRY_RUN] Would delete: ${filePath} (age ${(age/3600000).toFixed(2)}h)`);
        } else {
          try {
            await unlink(filePath);
            deleted++;
            console.log(`[CLEANUP] Deleted: ${filePath}`);
          } catch (err) {
            console.error(`[CLEANUP] Failed to delete ${filePath}:`, err.message);
          }
        }
      }
    }

    console.log(`[CLEANUP] Completed. ${CLEANUP_DRY_RUN ? 'DRY_RUN mode — no files deleted.' : `${deleted} file(s) deleted.`}`);
  } catch (err) {
    console.error("[CLEANUP] Error running cleanupUploads:", err);
  }
}

cleanupUploads().catch(err => console.error("[CLEANUP] startup run error:", err));

try {
  cron.schedule(CLEANUP_CRON, () => {
    console.log(`[CLEANUP] Running scheduled cleanup: ${CLEANUP_CRON}`);
    cleanupUploads().catch(err => console.error("[CLEANUP] scheduled run error:", err));
  }, {
    timezone: process.env.CLEANUP_TIMEZONE || "UTC"
  });
  console.log(`[CLEANUP] Scheduled cleanup job created (cron="${CLEANUP_CRON}", maxAgeHours=${MAX_UPLOAD_FILE_AGE_HOURS}, dryRun=${CLEANUP_DRY_RUN})`);
} catch (err) {
  console.error("[CLEANUP] Failed to schedule cleanup cron:", err);
}


app.post(
  "/upload-profile-pic",
  verifyInternalKey,
  uploadDisk.single("profilePic"),
  async (req, res) => {
    if (!req.file) return res.status(400).send("No file uploaded.");

    try {
      const formData = new FormData();
      formData.append("file", fs.createReadStream(req.file.path));

      const response = await axios.post(
        process.env.PINATA_UPLOAD_URL,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            pinata_api_key: process.env.PINATA_API_KEY,
            pinata_secret_api_key: process.env.PINATA_SECRET_KEY,
          },
        }
      );

      fs.unlinkSync(req.file.path);

      const ipfsHash = response.data.IpfsHash;
      res.json({ imageUrl: `https://gateway.pinata.cloud/ipfs/${ipfsHash}` });
    } catch (error) {
      console.error("IPFS upload error", error.response?.data);
      res.status(500).send("Error uploading image to Pinata.");
    }
  }
);


app.post(
  "/upload-profile-pic-v2",
  verifyInternalKey,
  uploadMemory.single("profilePic"),
  async (req, res) => {
    if (!req.file)
      return res.status(400).json({ error: "No file uploaded." });

    try {
      const result = await imagekit.upload({
        file: req.file.buffer,
        fileName: `profile_${Date.now()}`,
        folder: "/profiles",
      });

      res.json({ success: true, imageUrl: result.url });
    } catch (error) {
      console.error("ImageKit upload error:", error);
      res.status(500).json({ error: "Failed to upload image to ImageKit." });
    }
  }
);

app.post("/update-profile-name", verifyInternalKey, async (req, res) => {
  try {
    const { uid, newName } = req.body;

    if (!uid || !newName)
      return res.status(400).json({ error: "Missing uid or newName" });

    await admin.auth().updateUser(uid, { displayName: newName });

    await admin.firestore().collection("users").doc(uid).update({
      displayName: newName,
      "profile.name": newName,
      "api.lastProfileNameUpdate": new Date().toISOString(),
    });

    res.json({ success: true, newName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update profile name" });
  }
});

app.post(
  "/contact",
  verifyInternalKey,
  async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: "Missing required fields." });
  }

  if (filter.isProfane(message) || filter.isProfane(name)) {
    console.warn(`Blocked spam or profanity from ${email}`);
    return res.status(400).json({ success: false, error: "Inappropriate or spammy content detected." });
  }

  const linkPattern = /(http:\/\/|https:\/\/|www\.)/i;
  if (linkPattern.test(message)) {
    console.warn(`Message contains link, possible spam from ${email}`);
    return res.status(400).json({ success: false, error: "Links are not allowed in messages." });
  }


  try {
    const request = mailjet
      .post("send", { version: "v3.1" })
      .request({
        Messages: [
          {
            From: {
              Email: process.env.MJ_SENDER_EMAIL,
              Name: process.env.MJ_SENDER_NAME,
            },
            To: [
              {
                Email: process.env.CONTACT_RECEIVER,
                Name: "Site Admin",
              },
            ],
            Subject: `Message from ${name} at Endless Forge`,
            TextPart: `New message from ${name} (${email}):\n\n${message}`,
            HTMLPart: `
              <html>
                <head>
                  <meta charset="UTF-8" />
                  <meta name="color-scheme" content="light dark" />
                  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                  <style>
                    body {
                      margin: 0;
                      padding: 0;
                      background-color: #f7f9fc;
                      font-family: Arial, Helvetica, sans-serif;
                      color: #333;
                    }
                    .container {
                      max-width: 600px;
                      margin: 40px auto;
                      background: #ffffff;
                      border-radius: 8px;
                      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                      overflow: hidden;
                    }
                    .header {
                      background: #111827;
                      color: #ffffff;
                      padding: 20px;
                      text-align: center;
                    }
                    .header h1 {
                      margin: 0;
                      font-size: 20px;
                      letter-spacing: 0.5px;
                    }
                    .content {
                      padding: 25px 30px;
                      line-height: 1.6;
                    }
                    .content h2 {
                      font-size: 18px;
                      margin-bottom: 15px;
                      color: #111827;
                    }
                    .content p {
                      margin: 8px 0;
                    }
                    .label {
                      font-weight: bold;
                      color: #374151;
                    }
                    .footer {
                      text-align: center;
                      font-size: 13px;
                      color: #6b7280;
                      background: #f3f4f6;
                      padding: 15px;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="header">
                      <h1>Endless Forge</h1>
                    </div>
                    <div class="content">
                      <h2>Endless Forge - Contact Form from ${name}</h2>
                      <p><span class="label">Name:</span> ${name}</p>
                      <p><span class="label">Email:</span> ${email}</p>
                      <p><span class="label">Message:</span></p>
                      <p style="white-space: pre-wrap;">${message}</p>
                    </div>
                    <div class="footer">
                      Sent from the <b>Endless Forge</b> Contact Form<br />
                      <small>© ${new Date().getFullYear()} Endless Forge. All rights reserved.</small>
                    </div>
                  </div>
                </body>
              </html>
            `,
          },
        ],
      });

    await request;
    console.log(`Email sent from ${email} (${name})`);
    res.json({ success: true, message: "Email sent successfully!" });
  } catch (err) {
    console.error("[Mailjet Error]", err?.response?.data || err.message);
    res.status(500).json({ success: false, error: "Failed to send email." });
  }
});



app.get("/health", (req, res) => res.send({ status: "OK", uptime: process.uptime() }));
app.get("/", (req, res) => res.send({ status: "Endless Bureaucracy Conversion API", uptime: process.uptime() }));

app.listen(port, () => console.log(`Server running on port ${port}`));
