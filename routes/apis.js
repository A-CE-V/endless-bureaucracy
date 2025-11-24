import express from "express";
import { verifyInternalKey } from "../middleware/apiKey.js";
import { uploadDisk, uploadMemory } from "../middleware/upload.js";
import { uploadProfilePicPinata, uploadProfilePicImageKit, updateProfileName } from "../controllers/profileController.js";
import { sendContactEmail } from "../controllers/contactController.js";

const router = express.Router();

// Health Check
router.get("/health", (req, res) => res.send({ status: "OK", uptime: process.uptime() }));
router.get("/", (req, res) => res.send({ status: "Endless Bureaucracy Conversion API", uptime: process.uptime() }));

// Profile Routes
router.post(
  "/upload-profile-pic", 
  verifyInternalKey, 
  uploadDisk.single("profilePic"), 
  uploadProfilePicPinata
);

router.post(
  "/upload-profile-pic-v2", 
  verifyInternalKey, 
  uploadMemory.single("profilePic"), 
  uploadProfilePicImageKit
);

router.post(
  "/update-profile-name", 
  verifyInternalKey, 
  updateProfileName
);

// Contact Routes
router.post(
  "/contact", 
  verifyInternalKey, 
  sendContactEmail
);

export default router;