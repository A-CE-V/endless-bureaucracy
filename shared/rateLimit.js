import { db } from "./firebaseAdmin.js";

export async function enforceLimit(req, res, next, actionType) {
  try {
    const userRef = db.collection("users").doc(req.user.id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const data = userDoc.data();
    const today = new Date().toISOString().slice(0, 10);
    const limits = data.limits || {};
    const { selectedPlan = "free" } = data;

    // Define max daily actions per plan
    const planLimits = {
      free: { mails: 5, profileChanges: 3 },
      standard: { mails: 10, profileChanges: 5 },
      premium: { mails: 25, profileChanges: 10 },
      deluxe: { mails: 100, profileChanges: 20 },
    };

    const max = planLimits[selectedPlan.toLowerCase()] || planLimits.free;

    // Initialize today's counters if missing
    if (!limits.date || limits.date !== today) {
      limits.date = today;
      limits.mailsToday = 0;
      limits.profileChangesToday = 0;
    }

    // Check and increment the appropriate counter
    if (actionType === "mail") {
      if (limits.mailsToday >= max.mails) {
        return res.status(429).json({ error: "Daily email limit reached" });
      }
      limits.mailsToday += 1;
    }

    if (actionType === "profileChange") {
      if (limits.profileChangesToday >= max.profileChanges) {
        return res.status(429).json({ error: "Daily profile change limit reached" });
      }
      limits.profileChangesToday += 1;
    }

    await userRef.update({ limits });
    req.user.limits = limits;
    next();
  } catch (err) {
    console.error("Rate limit check failed:", err);
    res.status(500).json({ error: "Rate limit enforcement failed" });
  }
}
