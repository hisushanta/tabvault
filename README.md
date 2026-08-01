# Tabodex Payments — Gumroad Setup

## 1. Firebase (free — Spark plan)
1. https://console.firebase.google.com → your project
2. Build → Authentication → Sign-in method → Email/Password enabled
3. Build → Firestore Database → make sure it's created (Native mode)
4. Paste `firestore.rules` into Firestore → Rules tab → Publish
5. `../firebase-config.js` already has your real `apiKey`/`projectId` — no change needed unless you create a new project

## 2. Gumroad
1. https://gumroad.com → your product ("Tabodex Premium" or similar)
2. Copy the product URL (e.g. `https://yourname.gumroad.com/l/yourpermalink`) →
   confirm it matches `GUMROAD_PRODUCT_URL` in `../background.js`
3. Note the permalink itself (the last part of the URL, e.g. `soboo`) — this
   is what you'll use for `GUMROAD_PRODUCT_PERMALINK` below, **not** the full URL

## 3. Deploy the backend (Render, free tier)
1. Push `backend/` to a GitHub repo
2. https://render.com → New → Web Service → connect the repo
3. Build command: `npm install` · Start command: `npm start`
4. Environment variables:
   - `FIREBASE_SERVICE_ACCOUNT_JSON` (Firebase Console → Project settings →
     Service accounts → Generate new private key → paste the whole JSON as one line)
   - `GUMROAD_PRODUCT_PERMALINK` — optional but recommended; must be exactly
     the short permalink code (e.g. `soboo`), not a URL
5. Deploy → confirm the base URL loads a plain text message (not an error)

## 4. Connect Gumroad's Ping (webhook)
1. Gumroad Dashboard → Settings → Advanced → Ping
2. URL: `https://YOUR-RENDER-URL/gumroad-webhook`
3. Save

## 5. Point the extension at it
`../background.js` should already have your real `BACKEND_URL` and
`GUMROAD_PRODUCT_URL` set — double check both are correct, not placeholders.

## How it flows end to end
1. User clicks "Upgrade" in the extension → Gumroad opens with their account
   ID attached as a URL param → they complete checkout on Gumroad's page
2. Gumroad sends a Ping to your backend on every sale and renewal
3. Backend reads the account ID back out of the Ping, calculates an expiry
   date from the billing cycle, and writes `premium: true` + `premiumExpiresAt`
   to that user's Firestore doc
4. If a renewal ever fails or gets cancelled, no new Ping arrives, and the
   existing expiry date simply passes — no separate "cancellation" handling needed

## Free-tier caveat
Render's free tier sleeps after 15 minutes idle — first webhook after that
takes ~30-50 seconds to wake up. Fine for this use case. Upgrade to Render's
paid tier only once real revenue justifies it.
