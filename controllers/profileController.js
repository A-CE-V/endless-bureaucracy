import fs from "fs";
import FormData from "form-data";
import axios from "axios";
import admin from "../config/firebase.js"; 
import imagekit from "../config/imagekit_temp.js";

export const uploadProfilePicPinata = async (req, res) => {
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
    console.error("IPFS upload error", error.response?.data || error.message);
    res.status(500).send("Error uploading image to Pinata.");
  }
};

// POST /upload-profile-pic-v2 (ImageKit)
export const uploadProfilePicImageKit = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });

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
};

// POST /update-profile-name
export const updateProfileName = async (req, res) => {
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
};