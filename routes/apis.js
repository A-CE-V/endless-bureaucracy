import express from "express";
import { uploadDisk, uploadMemory } from "../middleware/upload.js";
import { uploadProfilePicPinata, uploadProfilePicImageKit, updateProfileName } from "../controllers/profileController.js";
import { sendContactEmail } from "../controllers/contactController.js";

/**
 * Commit V.3.0.0 - 2026-01-09
 * 
 * ------------------------------
 *  PDF(CONVERSION) Microservice
 * ------------------------------
 * Features:
 *  - Pdf to images and viceversa conversions.
 *  - Secured with HMAC authentication middleware [Added on this commit]
 * 
 * 
 */
import { verifyInternalKey } from "../middleware/apiKey.js";

const router = express.Router();

// Health Check
router.get("/health", (req, res) => res.send({ status: "OK", uptime: process.uptime() }));
router.get("/", (req, res) => res.send({ status: "Endless Bureaucracy Conversion API", uptime: process.uptime() }));

// Profile Routes
router.post(
  "/upload-profile-pic", 
  uploadDisk.single("profilePic"), 
  verifyInternalKey, 
  uploadProfilePicPinata
);

router.post(
  "/upload-profile-pic-v2", 
  uploadMemory.single("profilePic"), 
  verifyInternalKey, 
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