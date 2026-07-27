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

const app = express();
app.use(cors());
// Gumroad sends Ping as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Gumroad Ping webhook ---
// Set this URL in Gumroad → Settings → Advanced → Ping
app.post("/gumroad-webhook", async (req, res) => {
  try {
    const body = req.body;

    // Confirm this sale is genuinely for our product, not a stray Ping
    if (process.env.GUMROAD_PRODUCT_PERMALINK &&
        body.permalink !== process.env.GUMROAD_PRODUCT_PERMALINK) {
      return res.status(200).send("ignored: different product");
    }

    // Extract the TabVault user ID we appended as a URL param at checkout,
    // e.g. https://you.gumroad.com/l/tabvault-premium?tv_uid=abc123
    let uid = null;
    if (body.url_params) {
      try {
        const params = JSON.parse(body.url_params);
        uid = params.tv_uid || null;
      } catch (e) {
        // url_params wasn't valid JSON — ignore
      }
    }

    if (!uid) {
      console.warn("Gumroad sale received with no tv_uid — needs manual matching by email:", body.email);
      return res.status(200).send("received: no uid, needs manual review");
    }

    // Refund handling — Gumroad marks refunded sales; treat as premium off
    if (body.refunded === "true" || body.refunded === true) {
      await db.collection("users").doc(uid).set({ premium: false }, { merge: true });
      console.log(`Premium disabled (refund) for uid=${uid}`);
      return res.status(200).send("refund processed");
    }

    await db.collection("users").doc(uid).set(
      {
        premium: true,
        gumroadSaleId: body.sale_id || null,
        gumroadEmail: body.email || null,
      },
      { merge: true }
    );
    console.log(`Premium enabled for uid=${uid}`);
    res.status(200).send("ok");
  } catch (err) {
    console.error(err);
    res.status(500).send("error processing webhook");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TabVault backend running on port ${PORT}`));
