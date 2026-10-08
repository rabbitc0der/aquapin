# 🌊 AquaPin — Real-Time Waterlogging & Flood Alert Map

> **Hackathon Project** — Community-powered flood reporting for urban resilience.

AquaPin lets citizens **drop a geo-tagged severity pin** at any waterlogged location in real time. Other users instantly see the map update with colour-coded warnings so they can re-route before their vehicle stalls.

---

## 🎯 Problem Statement

Every monsoon season, hundreds of vehicles stall and commuters are stranded because there is **no real-time, ground-truth source** for waterlogging severity. Official government channels lag by hours. AquaPin fills this gap with crowdsourced, timestamped, auto-expiring reports.

---

## ✨ Key Features

| Feature | Details |
|---------|---------|
| 🗺️ **Live Flood Map** | Full-screen Leaflet map centred on the user's GPS location |
| 📍 **Colour-coded Pins** | 🟡 Ankle-deep / 🟠 Knee-deep / 🔴 Road Blocked |
| 🚨 **One-tap Reporting** | FAB → bottom sheet → 3 severity options → pin drops instantly |
| ⏰ **Auto-expiry (TTL)** | Pins expire in 6 hours via DynamoDB TTL — map stays fresh |
| 🔔 **Toast Feedback** | Success / error notifications after every submission |
| 🔄 **Auto-refresh** | Frontend polls backend every 30 seconds for new pins |
| 📱 **Mobile-first** | Designed for phones — glassmorphism UI, spring animations |

---

## 🏗️ Architecture

```
┌─────────────────────────────────┐
│   Browser (React + Vite PWA)   │
│   Leaflet Map · ReportModal    │
│   FAB · Toast · Auto-refresh   │
└──────────────┬──────────────────┘
               │ HTTPS (API Gateway)
┌──────────────▼──────────────────┐
│      AWS HTTP API Gateway       │
│   GET /pins   POST /pins        │
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│      AWS Lambda (Node 20)       │
│  getPins.js    postPin.js       │
└──────────────┬──────────────────┘
               │
┌──────────────▼──────────────────┐
│   DynamoDB — aquapin-pins table │
│   PK: pinId  TTL: expiresAt    │
│   Fields: lat, lng, severity,   │
│           comment, createdAt    │
└─────────────────────────────────┘
```

---

## 🗂️ Project Structure

```
aquapin/
├── src/
│   ├── components/
│   │   ├── Header/          # Brand bar + severity legend chips
│   │   ├── MapView/         # Leaflet map, GPS, dynamic pin rendering
│   │   ├── FAB/             # "🚨 Report Flood" floating action button
│   │   ├── ReportModal/     # Bottom sheet with 3 severity option cards
│   │   └── Toast/           # Slide-in notification banner
│   ├── services/
│   │   └── api.js           # getPins() / postPin() — API client
│   ├── App.jsx              # Top-level shell, state, polling
│   └── index.css            # Design system: CSS tokens, typography
│
├── backend/
│   ├── lambdas/
│   │   ├── postPin.js       # Lambda: POST /pins → write to DynamoDB
│   │   └── getPins.js       # Lambda: GET /pins → read + filter DynamoDB
│   ├── db/
│   │   └── dynamoClient.js  # AWS SDK v3 DynamoDB Document Client
│   ├── server.js            # Local dev server (mirrors Lambda handlers)
│   └── template.yaml        # AWS SAM template for one-command deploy
│
└── package.json             # Frontend deps (React, Leaflet, Inter font)
```

---

## 🚀 Running Locally

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9

### 1. Install dependencies

```bash
# Frontend
npm install

# Backend
cd backend && npm install && cd ..
```

### 2. Start the backend dev server

```bash
cd backend
node server.js
# Running at http://localhost:3001
```

### 3. Start the frontend

```bash
npm run dev
# Running at http://localhost:5173
```

Open `http://localhost:5173` in your browser. The map loads with sample pins. Tap **🚨 Report Flood** to test the full reporting flow.

---

## ☁️ Deploying to AWS (Production)

Requires: [AWS CLI](https://aws.amazon.com/cli/) + [SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)

```bash
aws configure          # Enter your AWS Access Key + region (ap-south-1)

cd backend
sam deploy --guided    # Follow the prompts — takes ~3 minutes first time
```

SAM will output your **API Gateway endpoint URL**. Add it to the frontend:

```bash
# Create .env.production in the project root
echo "VITE_API_URL=https://YOUR-API-ID.execute-api.ap-south-1.amazonaws.com" > .env.production

npm run build          # Build with real API URL baked in
```

Upload the `dist/` folder to an S3 bucket with static website hosting enabled.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, Leaflet / react-leaflet |
| Styling | Vanilla CSS, Inter font, CSS custom properties |
| Backend | AWS Lambda (Node 20), AWS SDK v3 |
| Database | Amazon DynamoDB (PAY_PER_REQUEST + TTL) |
| API | AWS HTTP API Gateway (CORS enabled) |
| Deploy | AWS SAM (CloudFormation) |
| Hosting | Amazon S3 static website |

---

## 📦 API Reference

### `GET /pins`
Returns all active (non-expired) flood pins.

**Optional query params:** `?minLat=&maxLat=&minLng=&maxLng=` for bounding box filter.

**Response:**
```json
{
  "count": 3,
  "pins": [
    {
      "pinId": "pin_abc123",
      "lat": 28.7497,
      "lng": 77.1183,
      "severity": "danger",
      "comment": "Road blocked near Gate 1",
      "createdAt": "2024-08-15T10:30:00Z",
      "expiresAt": 1723721400
    }
  ]
}
```

### `POST /pins`
Submit a new waterlogging report.

**Body:**
```json
{
  "lat": 28.7497,
  "lng": 77.1183,
  "severity": "danger",
  "comment": "Knee-deep water near Admin block"
}
```

**Severity values:** `"caution"` (ankle-deep) · `"warning"` (knee-deep) · `"danger"` (road blocked)

---

## 👥 Team

**AquaPin** — Built for Environmental Hacks by **rabbitc0der**

---

## 📄 License

MIT
