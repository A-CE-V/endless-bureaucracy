require('dotenv').config();

const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');  
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// Pinata API credentials
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;

// Pinata API URL
const PINATA_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

app.post('/upload-profile-pic', upload.single('profilePic'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  try {
    // Prepare the form data to upload to Pinata
    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path));

    const response = await axios.post(PINATA_URL, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
    });

    const ipfsHash = response.data.IpfsHash;
    const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
    res.json({ imageUrl: ipfsUrl });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error uploading image to Pinata.');
  }
});

app.get("/health", (req, res) => {
  res.send({ status: "OK", uptime: process.uptime() });
});

app.get("/", (req, res) => {
  res.send({ status: "Endless Bureaucracy Conversion Api", uptime: process.uptime() });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

