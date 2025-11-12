import "dotenv/config";
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

// ===========================
// Setup
// ===========================
const app = express();
const port = process.env.PORT || 3000;

const mailjet = new Mailjet({
  apiKey: process.env.MJ_APIKEY_PUBLIC,
  apiSecret: process.env.MJ_APIKEY_PRIVATE,
});

app.use(bodyParser.json());
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

app.post("/upload-profile-pic", upload.single("profilePic"), async (req, res) => {
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


app.post("/contact", async (req, res) => {
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
              <h2>New Contact Message</h2>
              <p><b>Name:</b> ${name}</p>
              <p><b>Email:</b> ${email}</p>
              <p><b>Message:</b></p>
              <p style="white-space: pre-wrap;">${message}</p>
              <hr/>
              <small>Sent from Endless Forge Contact Form</small>
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
