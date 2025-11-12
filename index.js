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
import {Filter} from "bad-words";
import { verifyApiKey } from "./shared/apiKeyMiddleware.js";
import { enforceLimit } from "./shared/rateLimit.js";

const app = express();
const port = process.env.PORT || 3000;

const mailjet = new Mailjet({
  apiKey: process.env.MJ_APIKEY_PUBLIC,
  apiSecret: process.env.MJ_APIKEY_PRIVATE,
});

app.use(bodyParser.json());
app.use(express.json());
app.use(
  cors({
    origin: [
      "https://endlessforge.com",
      "https://endless-forge-web.web.app",
      "https://endless-forge-web.firebaseapp.com",
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

const filter = new Filter();

filter.addWords(
  "bitcoin", "crypto", "viagra", "loan", "casino",
  "forex", "porn", "betting", "telegram", "whatsapp",
  "click here", "earn money", "win big", "cheap pills"
);

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("[INFO] Created uploads directory");
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
const PINATA_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

app.post("/upload-profile-pic",
  verifyApiKey,
  (req, res, next) => enforceLimit(req, res, next, "profileChange"),
  upload.single("profilePic"),
  async (req, res) => {
  if (!req.file) return res.status(400).send("No file uploaded.");

  try {
    const formData = new FormData();
    formData.append("file", fs.createReadStream(req.file.path));

    const response = await axios.post(PINATA_URL, formData, {
      headers: {
        ...formData.getHeaders(),
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
    });

    const ipfsHash = response.data.IpfsHash;
    const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;

    fs.unlinkSync(req.file.path);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json({ imageUrl: ipfsUrl });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send("Error uploading image to Pinata.");
  }
});

app.post(
  "/update-profile-name",
  verifyApiKey,
  (req, res, next) => enforceLimit(req, res, next, "profileChange"),
  async (req, res) => {
    try {
      const { uid, newName } = req.body;

      if (!uid || !newName) {
        return res.status(400).json({ error: "Missing uid or newName" });
      }

      await admin.auth().updateUser(uid, { displayName: newName });

      const userRef = admin.firestore().collection("users").doc(uid);
      await userRef.update({
        displayName: newName,
        "profile.name": newName,
        "api.lastProfileNameUpdate": new Date().toISOString(),
      });

      console.log(`Updated display name for UID ${uid} → ${newName}`);

      res.json({
        success: true,
        message: "Profile name updated successfully",
        newName,
      });
    } catch (err) {
      console.error("Error updating profile name:", err);
      res.status(500).json({
        error: "Failed to update profile name",
        details: err.message,
      });
    }
  }
);

app.post("/contact",
  verifyApiKey,
  (req, res, next) => enforceLimit(req, res, next, "mail"),
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
    console.warn(`🚫 Message contains link, possible spam from ${email}`);
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
                      <h2>📩 New Contact Message</h2>
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
