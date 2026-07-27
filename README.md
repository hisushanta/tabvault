# TabVault Payments — Gumroad + Firebase

**Path A (start here, zero setup cost, works today):** manual Gumroad sale +
manual Firestore flag.

**Path B (automate later):** deploy `server.js` so Path A happens
automatically via Gumroad's webhook ("Ping").

You can stay on Path A indefinitely — nothing forces a move to Path B except
your own time.

---

## Path A — Manual, no backend, no domain, start today

### 1. Firebase (free — Spark plan)
1. https://console.firebase.google.com → Create project
2. Build → Authentication → Sign-in method → enable Email/Password
3. Build → Firestore Database → Create database → production mode
4. Paste `firestore.rules` into Firestore → Rules tab → Publish
5. Project settings → General → Your apps → Add app → Web → copy `apiKey`
   and `projectId` into `../firebase-config.js`

### 2. Gumroad
1. https://gumroad.com → Sign up
2. Products → New Product → "TabVault Premium"
3. Set price (e.g. $3.99/year — Gumroad supports recurring "Membership"
   pricing under product settings, or a simple one-time annual price if you
   prefer to handle renewals manually at first)
4. Under the product's checkout settings, add a **custom field**: label it
   "Your TabVault ID" and mark it required — this is how you'll know which
   user paid
5. Publish → copy the product URL (e.g. `https://yourname.gumroad.com/l/tabvault-premium`)
   → paste into `../background.js` as `GUMROAD_PRODUCT_URL`

No domain, no business registration, no website verification needed for any
of this — Gumroad hosts the entire checkout.

### 3. When a user upgrades
1. They click "Upgrade" in the extension → Gumroad opens in a new tab → the
   popup shows them their TabVault ID to paste into the custom field
2. They complete checkout on Gumroad's page
3. You check Gumroad → Sales → find their entry → copy the "Your TabVault ID"
   value they entered
4. Go to Firebase Console → Firestore → `users/{that-id}` → add field
   `premium: true` (boolean)
5. Their extension picks this up automatically next time it checks — no
   redeploy needed

**Total cost so far: ₹0.** Gumroad takes its fee only from an actual sale
(currently around 10% flat, which includes payment processing — check
Gumroad's current pricing page for the exact number, as fee structures do
get updated).

---

## Path B — Automate when manual matching gets old

Move here once checking Gumroad sales and updating Firestore by hand for
every purchase takes too much of your time.

### Deploy the backend (Render, free tier)
1. Push `backend/` to a GitHub repo
2. https://render.com → New → Web Service → connect the repo
3. Build command: `npm install` · Start command: `npm start`
4. Environment variables:
   - `FIREBASE_SERVICE_ACCOUNT_JSON` (Project settings → Service accounts →
     Generate new private key → paste the whole JSON as one line)
   - `GUMROAD_PRODUCT_PERMALINK` (the last part of your product URL, e.g.
     `tabvault-premium`) — optional but recommended, filters out unrelated Pings
5. Deploy → copy the resulting URL

### Connect Gumroad's Ping (webhook)
1. Gumroad → Settings → Advanced → Ping
2. Paste: `https://YOUR-RENDER-URL/gumroad-webhook`
3. Save

### Point the extension at it
Open `../background.js` → replace the placeholder `BACKEND_URL` with your
real Render URL. Once set, "Upgrade" appends the signed-in user's ID to the
Gumroad link automatically, and Gumroad's Ping (sent right after checkout)
lets the backend flip `premium: true` with no manual step.

### Free-tier caveat
Render's free tier sleeps after 15 minutes idle — first webhook after that
takes ~30-50 seconds to wake up. Fine for this use case. Upgrade to Render's
paid tier (~$7/month) only once real revenue justifies it.
