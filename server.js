// server.js — TabVault backend (Gumroad version)
// One job: when Gumroad notifies us of a sale (via "Ping"), verify it's real,
// find the TabVault user ID that was passed at checkout, and flip
// `premium: true` on their Firestore doc.
//
// You don't need to deploy this until manual link-sharing gets tedious.
// Until then, Path A (see backend/README.md) handles everything by hand.

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  ),
});
const db = admin.firestore();

// How long each billing cycle covers, in milliseconds. Uses the standard
// "30 days per month" convention (so quarterly = 90 days, not a calendar-
// accurate but confusing 93) since that's what people actually expect a
// subscription period to mean. A small grace period is added on top so a
// slightly delayed renewal charge (Gumroad can retry failed payments for a
// few days) doesn't cut someone off right at the boundary.
const GRACE_MS = 2 * 24 * 60 * 60 * 1000;
const RECURRENCE_MS = {
  monthly: 30 * 24 * 60 * 60 * 1000,
  quarterly: 90 * 24 * 60 * 60 * 1000,
  biannually: 180 * 24 * 60 * 60 * 1000,
  yearly: 365 * 24 * 60 * 60 * 1000,
  every_two_years: 730 * 24 * 60 * 60 * 1000,
};
function computeExpiry(recurrence, saleTimestamp) {
  const base = saleTimestamp ? new Date(saleTimestamp).getTime() : Date.now();
  const duration = RECURRENCE_MS[recurrence] || RECURRENCE_MS.monthly; // safe short default if unrecognized
  return base + duration + GRACE_MS;
}

const app = express();
app.use(cors());
// Gumroad sends Ping as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Simple health check — visiting the base URL in a browser should show this,
// not an error. Useful for confirming the server itself deployed correctly,
// separate from confirming the /gumroad-webhook path specifically.
app.get("/", (req, res) => {
  res.send("TabVault backend is running. Gumroad Ping URL: /gumroad-webhook");
});

// --- Gumroad Ping webhook ---
// Set this URL in Gumroad → Settings → Advanced → Ping
app.post("/gumroad-webhook", async (req, res) => {
  try {
    const body = req.body;

    // Log every incoming Ping in full — check Render → Logs after a test
    // purchase to see exactly what Gumroad actually sent.
    console.log("Gumroad Ping received:", JSON.stringify(body));

    // Confirm this sale is genuinely for our product, not a stray Ping
    if (process.env.GUMROAD_PRODUCT_PERMALINK &&
        body.permalink !== process.env.GUMROAD_PRODUCT_PERMALINK) {
      console.log(`Ignored: permalink "${body.permalink}" does not match configured "${process.env.GUMROAD_PRODUCT_PERMALINK}"`);
      return res.status(200).send("ignored: different product");
    }

    // Try each way of finding the TabVault user ID, in order of preference:
    let uid = null;

    // 1. URL param appended automatically by the extension's Upgrade button
    //    e.g. https://you.gumroad.com/l/tabvault-premium?tv_uid=abc123
    if (body.url_params) {
      try {
        const params = JSON.parse(body.url_params);
        uid = params.tv_uid || null;
      } catch (e) { /* not valid JSON — ignore */ }
    }

    // 2. A custom checkout field, if the buyer typed their ID in by hand
    if (!uid && body.custom_fields) {
      try {
        const fields = typeof body.custom_fields === "string"
          ? JSON.parse(body.custom_fields)
          : body.custom_fields;
        const fieldArray = Array.isArray(fields) ? fields : Object.values(fields || {});
        for (const f of fieldArray) {
          const val = typeof f === "string" ? f : f?.value;
          if (val && val.length > 15) { uid = val.trim(); break; } // Firebase uids are long strings
        }
      } catch (e) { /* ignore */ }
    }

    // 3. Last resort: match by the email used at checkout against Firebase Auth
    if (!uid && body.email) {
      try {
        const userRecord = await admin.auth().getUserByEmail(body.email);
        uid = userRecord.uid;
        console.log(`Matched by email fallback: ${body.email} -> uid=${uid}`);
      } catch (e) {
        console.warn(`No Firebase user found for email ${body.email}`);
      }
    }

    if (!uid) {
      console.warn("Gumroad sale received with no matchable uid — needs manual review. Email:", body.email);
      return res.status(200).send("received: no uid, needs manual review");
    }

    // Refund handling — Gumroad marks refunded sales; treat as premium off
    if (body.refunded === "true" || body.refunded === true) {
      await db.collection("users").doc(uid).set({ premium: false }, { merge: true });
      console.log(`Premium disabled (refund) for uid=${uid}`);
      return res.status(200).send("refund processed");
    }

    const expiresAt = computeExpiry(body.recurrence, body.sale_timestamp);

    await db.collection("users").doc(uid).set(
      {
        premium: true,
        premiumExpiresAt: expiresAt,
        gumroadRecurrence: body.recurrence || null,
        gumroadSaleId: body.sale_id || null,
        gumroadSubscriptionId: body.subscription_id || null,
        gumroadEmail: body.email || null,
      },
      { merge: true }
    );
    console.log(`Premium enabled for uid=${uid}, expires ${new Date(expiresAt).toISOString()}`);
    res.status(200).send("ok");
  } catch (err) {
    console.error(err);
    res.status(500).send("error processing webhook");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TabVault backend running on port ${PORT}`));
