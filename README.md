# WA TV Poster 📺

Post WhatsApp status without opening WhatsApp. Built for WhatsApp TV operators with 3k+ contacts.

---

## Features
- 🔗 Link WhatsApp via pairing code (one phone, no QR stress)
- 📤 Post status instantly (image, video, or text)
- ⏰ Schedule posts for future dates/times
- 💬 Save and reuse captions
- 📋 View last 10 post history
- 🔄 Auto-reconnect if connection drops

---

## Setup Guide

### Step 1 — Clone and install
```bash
git clone https://github.com/YOUR_USERNAME/watv-poster.git
cd watv-poster
npm install
```

### Step 2 — Set up environment variables
Copy `.env.example` to `.env` and fill in:
```
MONGODB_URI=your_mongodb_atlas_connection_string
PORT=3000
```

### Step 3 — Run locally
```bash
npm start
```
Open `http://localhost:3000` in your browser.

---

## Deploy to Railway

1. Push code to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repo
4. Add environment variables:
   - `MONGODB_URI` = your MongoDB Atlas URI
5. Deploy — Railway gives you a public URL

---

## How to Link WhatsApp

1. Open your Railway app URL on your phone
2. Go to **Connect** tab
3. Enter your WhatsApp number (with country code, no +)
   - Example: `2348012345678`
4. Tap **Get Pairing Code**
5. Open WhatsApp → Settings → Linked Devices → Link a Device
6. Tap **"Link with phone number instead"** at the bottom
7. Type the code shown on the website
8. Done ✅

---

## MongoDB Atlas (Free)

1. Go to [mongodb.com/atlas](https://mongodb.com/atlas)
2. Create free account → Create free cluster
3. Database Access → Add user with password
4. Network Access → Allow from anywhere (0.0.0.0/0)
5. Connect → Drivers → Copy connection string
6. Replace `<password>` with your password

---

## Notes
- Keep your phone connected to internet (at least once every 14 days)
- Don't spam — post like a normal human (1-10 statuses/day max)
- Uploads folder is gitignored — Railway uses ephemeral storage
