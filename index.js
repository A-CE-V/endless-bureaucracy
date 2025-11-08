require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

const app = express();
const port = process.env.PORT || 3000;

// ✅ Enable CORS
app.use(cors({
  origin: ["http://localhost:8080", "https://endlessforge.com"],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Ensure uploads folder exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("[INFO] Created uploads directory");
}

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// Pinata API keys
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
const PINATA_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

// Upload endpoint
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

    res.setHeader("Access-Control-Allow-Origin", "*"); // optional redundancy
    res.json({ imageUrl: ipfsUrl });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send("Error uploading image to Pinata.");
  }
});

app.get("/health", (req, res) => res.send({ status: "OK", uptime: process.uptime() }));
app.get("/", (req, res) => res.send({ status: "Endless Bureaucracy Conversion API", uptime: process.uptime() }));

app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
