import fs from "fs";
import path from "path";
import { promisify } from "util";
import cron from "node-cron";

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);

const CLEANUP_CRON = process.env.CLEANUP_CRON || "0 3 * * *";
const MAX_UPLOAD_FILE_AGE_HOURS = Number(process.env.MAX_UPLOAD_FILE_AGE_HOURS || 24);
const CLEANUP_DRY_RUN = (process.env.CLEANUP_DRY_RUN || "false").toLowerCase() === "true";
const uploadDir = path.join(process.cwd(), "uploads");

async function cleanupUploads() {
  try {
    const resolvedUploadDir = path.resolve(uploadDir);

    // Safety checks
    if (!resolvedUploadDir.includes(path.resolve(process.cwd()))) return;
    if (!fs.existsSync(resolvedUploadDir)) return;

    const files = await readdir(resolvedUploadDir);
    if (!files || files.length === 0) return;

    const now = Date.now();
    const maxAgeMs = MAX_UPLOAD_FILE_AGE_HOURS * 60 * 60 * 1000;
    let deleted = 0;

    for (const file of files) {
      const filePath = path.join(resolvedUploadDir, file);
      try {
        const stats = await stat(filePath);
        if (!stats.isFile()) continue;

        const age = now - stats.mtimeMs;
        if (age > maxAgeMs) {
            if (CLEANUP_DRY_RUN) {
                 console.log(`[CLEANUP][DRY_RUN] Would delete: ${filePath}`);
            } else {
                await unlink(filePath);
                deleted++;
                console.log(`[CLEANUP] Deleted: ${filePath}`);
            }
        }
      } catch (err) {
        console.warn(`[CLEANUP] Skipping ${file}: ${err.message}`);
      }
    }
    console.log(`[CLEANUP] Completed. Deleted: ${deleted}`);
  } catch (err) {
    console.error("[CLEANUP] Error:", err);
  }
}

export function startCleanupJob() {
  // Run once on startup
  cleanupUploads().catch(err => console.error("[CLEANUP] startup error:", err));
  
  // Schedule cron
  cron.schedule(CLEANUP_CRON, () => {
    console.log(`[CLEANUP] Running scheduled cleanup.`);
    cleanupUploads();
  }, {
    timezone: process.env.CLEANUP_TIMEZONE || "UTC"
  });
  console.log(`[CLEANUP] Job scheduled: ${CLEANUP_CRON}`);
}