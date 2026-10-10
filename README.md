# 🌊 AquaPin — Real-Time Waterlogging & Flood Alert Map

> **Civic Tech & Urban Resilience Platform** — Crowdsourced, AI-verified waterlogging intelligence with self-healing community consensus.

[![React 19](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF.svg)](https://vitejs.dev/)
[![AWS Serverless](https://img.shields.io/badge/AWS-Lambda%20%7C%20DynamoDB%20%7C%20API%20Gateway-FF9900.svg)](https://aws.amazon.com/)
[![Computer Vision](https://img.shields.io/badge/AI-AquaVision%20Edge%20CV-00C7B7.svg)](#-ai-photo-verification-aquavision-edge)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

AquaPin empowers citizens to **report and verify urban waterlogging in real time**. Using real-time computer vision and decentralized community consensus, AquaPin eliminates fake reports and stale data, ensuring commuters never steer into a submerged road.

---

## 🎯 The Urban Crisis

Every monsoon season, hundreds of vehicles stall, emergency services are delayed, and commuters are stranded because **traditional flood advisories lag by hours**. 
* **The Problem:** Flash waterlogging is hyper-local and dynamic. Municipal pumps or gravity drainage clear puddles in 45–90 minutes, yet static maps keep displaying outdated warnings.
* **The Exploit:** Traditional crowdsourcing platforms suffer from spam, fake reports, and outdated gallery uploads.
* **The Solution:** AquaPin combines **Live Camera Capture**, **AquaVision Edge AI Verification**, **Rapid Urban Response TTL**, and **Self-Healing Community Consensus**.

---

## ✨ Flagship Innovations

### 🤖 1. AquaVision Edge (Real-Time AI Flood Verification)
* **Pixel-Level Surface Inspection:** Inspects raw RGBA canvas buffers to detect turbid floodwater pigments, wet asphalt reflections, and light refraction.
* **Anti-Spoofing / Portrait Rejection:** Built-in Kovac/Peer skin-tone detection algorithms instantly reject selfies, portraits, and indoor photos (e.g. `⚠️ No Floodwater Detected (14% match)`).
* **Severity Recommendation:** Automatically suggests appropriate severity (Ankle-deep, Knee-deep, Road Blocked) based on water submersion depth.
* **AWS Rekognition Ready:** Production-ready dual engine supporting AWS Rekognition for cloud inference and AquaVision Edge for zero-latency edge computing.

### 👥 2. Self-Healing Community Consensus ("Still Flooded?" vs "Water Cleared")
* **Dual-Action Commuter Voting:** Anyone viewing a pin can tap:
  * **🌊 Still Flooded (+1):** Re-affirms hazard presence and dynamically extends the alert lifespan (+15m to +45m).
  * **✅ Water Cleared (-1):** Reports that water has drained.
* **Auto-Resolution Threshold:** When $\ge 2$ community members confirm the water has cleared, the pin **visually self-heals**:
  * Teardrop shifts to an **emerald green icon with a `✓` checkmark**.
  * Shows a verified **"✓ Road Clear — Safe to Traverse"** banner.
  * Decrements active emergency counts in the top header.

### ⚡ 3. Rapid Urban Response TTL (Dynamic Auto-Decay)
Instead of static multi-hour timers that mislead commuters, AquaPin applies real-world drainage rates:
* **Caution (Ankle-deep):** **30 minutes** base lifespan (+15 min extension on confirmation).
* **Warning (Knee-deep):** **60 minutes** base lifespan (+30 min extension on confirmation).
* **Danger (Road Blocked):** **90 minutes** base lifespan (+45 min extension on confirmation).
* Pins naturally expire if no longer active, keeping the map perpetually fresh.

### 📸 4. Strict Live Camera Capture (Anti-Tampering)
* Mobile inputs enforce `capture="environment"`, launching the native rear camera directly.
* Prevents uploading 3-year-old photos from local device storage, proving physical presence at the scene.
* Includes a built-in **Demo Simulator** for indoor hackathon judging presentations.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Browser (React 19 + Vite PWA)               │
│  Leaflet Map · Interactive Severity Chips · GPS Pulse       │
│  AquaVision Edge (Local CV Engine) · Consensus Voting UI   │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / JSON
┌──────────────────────────────▼──────────────────────────────┐
│                    AWS HTTP API Gateway                     │
│    GET /pins  ·  POST /pins  ·  POST /pins/:id/vote         │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    AWS Lambda (Node 20)                     │
│  • getPins.js: TTL-filtered spatial query                   │
│  • postPin.js: AI metadata + DynamoDB Put                   │
│  • votePin.js: Community consensus tally & resolution       │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│               Amazon DynamoDB (PAY_PER_REQUEST)             │
│  Table: AquaPin_Reports                                     │
│  PK: pinId  ·  TTL: expiresAt (automated epoch cleanup)    │
│  Fields: lat, lng, severity, status, stillFloodedCount,     │
│          clearedCount, aiVerified, aiConfidence, aiTags     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🗂️ Project Structure

```
aquapin/
├── src/
│   ├── components/
│   │   ├── Header/          # Brand + live 30s auto-refresh pill + severity filter chips
│   │   ├── MapView/         # Leaflet map, GPS pulse dot, custom teardrop icons, consensus popups
│   │   ├── FAB/             # Floating "🚨 Report Flood" action button
│   │   ├── ReportModal/     # Bottom sheet, live camera capture, AquaVision AI scanner
│   │   └── Toast/           # Real-time alert notifications (info, success, warning)
│   ├── services/
│   │   └── api.js           # getPins(), postPin(), votePin(), analyzePhoto()
│   ├── App.jsx              # Root state, optimistic updates, polling loop
│   └── index.css            # Dark mode design system: tokens, typography, glassmorphism
│
├── backend/
│   ├── lambdas/
│   │   ├── postPin.js       # Lambda: POST /pins with AI analysis & Option 1 TTL
│   │   └── getPins.js       # Lambda: GET /pins with TTL & status filters
│   ├── services/
│   │   └── aiVisionService.js # AquaVision Edge CV engine + AWS Rekognition adapter
│   ├── db/
│   │   └── dynamoClient.js  # AWS SDK v3 DynamoDB Document Client
│   ├── server.js            # Node dev server mirroring Lambda handlers + voting API
│   └── template.yaml        # AWS SAM Infrastructure as Code (IaC) template
│
└── package.json
```

---

## 🚀 Running Locally

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9

### 1. Install Dependencies
```bash
# Frontend
npm install

# Backend
cd backend && npm install && cd ..
```

### 2. Start the Backend Dev Server
```bash
cd backend
node server.js
# Running at http://localhost:3001
```

### 3. Start the Frontend
```bash
npm run dev
# Running at http://localhost:5173
```

Open `http://localhost:5173` in your browser.
* Click any pin to see the **live countdown timer** and vote **Still Flooded** or **Water Cleared**.
* Inspect `mock-5` on the map to see a **visually self-healed emerald route**.
* Click **🚨 Report Flood** to test **AquaVision AI** with real camera or demo presets.

---

## ☁️ Deploying to AWS (Production)

Requires: [AWS CLI v2](https://aws.amazon.com/cli/) + [SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)

### 1. Configure AWS Credentials
```bash
aws configure
# AWS Access Key ID [****************]
# AWS Secret Access Key [****************]
# Default region name: ap-south-1 (Mumbai) or us-east-1
```

### 2. Deploy Infrastructure via SAM
```bash
cd backend
sam build
sam deploy --guided
```

SAM deploys:
1. `AquaPin_Reports` DynamoDB table with automated TTL on `expiresAt`.
2. Lambda execution roles with least-privilege IAM policies.
3. HTTP API Gateway with CORS enabled.

### 3. Build & Host Frontend
```bash
# Create .env.production with your API Gateway URL
echo "VITE_API_URL=https://YOUR-API-ID.execute-api.ap-south-1.amazonaws.com" > .env.production

npm run build
```
Upload the compiled `dist/` directory to an Amazon S3 static website bucket or AWS Amplify.

---

## 📦 API Reference

### 1. `GET /pins`
Fetches active and recently self-healed flood pins within TTL.

**Response:**
```json
{
  "count": 5,
  "pins": [
    {
      "pinId": "mock-1",
      "lat": 28.7520,
      "lng": 77.1150,
      "severity": "danger",
      "status": "active",
      "comment": "Road blocked near DTU Gate 1 (Submerged underpass)",
      "aiVerified": true,
      "aiConfidence": 96,
      "aiTags": ["Severe Submersion", "Road Impassable"],
      "stillFloodedCount": 3,
      "clearedCount": 0,
      "createdAt": "2026-10-10T08:00:00.000Z",
      "expiresAt": 1791575400
    }
  ]
}
```

### 2. `POST /pins`
Submits a verified flood report.

**Request Payload:**
```json
{
  "lat": 28.7497,
  "lng": 77.1183,
  "severity": "danger",
  "comment": "Underpass submerged",
  "photo": "data:image/jpeg;base64,...",
  "pixelMetrics": {
    "isFloodWater": true,
    "isPortraitOrSelfie": false,
    "waterRatio": 0.42
  }
}
```

### 3. `POST /pins/:pinId/vote`
Records a community consensus vote (`still_flooded` or `cleared`).

**Request Payload:**
```json
{
  "voteType": "cleared"
}
```

**Response (Consensus Reached):**
```json
{
  "success": true,
  "message": "Community consensus reached: Water marked cleared!",
  "voteType": "cleared",
  "resolved": true,
  "pin": {
    "pinId": "mock-3",
    "status": "resolved",
    "clearedCount": 2,
    "resolvedAt": "2026-10-10T08:15:00.000Z"
  }
}
```

### 4. `POST /api/analyze-photo`
Real-time pre-submission AI analysis for uploaded photo buffers.

---

## 🔒 Security Architecture & Launch Hardening

AquaPin implements a defense-in-depth posture adhering to the **5 Pre-Launch Security Audits**:

| Audit Domain | Controls Implemented |
|---|---|
| **01. Secret Leak Prevention** | Zero secrets in source code. `.gitignore` explicitly blocks `.env*`, AWS credentials, and `.pem`/`.key` files. `.env.example` templates provided. Automated credential scanning confirmed no keys committed in Git history. *(Security Warning: Rotate any local development AWS credentials periodically).* |
| **02. Personal Data Flow** | **Zero-PII Storage Policy**. No user accounts, passwords, emails, or phone numbers collected. Coordinates rounded to 5 decimal places (~1.1m precision) to prevent micro-tracking. CloudWatch/console logs redact sensitive request payloads and base64 imagery. |
| **03. Pre-Deploy Production Audit** | Hardened security headers on all responses (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Content-Security-Policy`). Sanitized error responses with opaque UUID `correlationId` (no internal stack traces or database schema leaked). |
| **04. Deep Logic & XSS Protection** | HTML entity sanitization (`escapeHtml`) on all user comments, severity tags, and pin popups prevents Stored XSS (CWE-79). Strict URL scheme validation (`isSafeMediaUrl`) blocks `javascript:` and arbitrary URI attacks. Payload stream capped at 5MB with 413 rejection to prevent heap exhaustion. |
| **05. Attacker Perspective Defense** | Sliding-window IP rate limiting on pin creation (10/min), photo analysis (15/min), and consensus voting (20/min). Duplicate voting prevention per IP per pin prevents malicious clearance vote stacking or artificial TTL extension. |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 8, Leaflet, Inter Typography |
| **Styling** | Vanilla CSS (Glassmorphism, CSS Custom Properties, Zero runtime overhead) |
| **Edge AI** | AquaVision Edge (Canvas Buffer RGBA CV classification) |
| **Cloud AI** | AWS Rekognition (Production adapter) |
| **Backend** | AWS Lambda (Node 20), AWS SDK v3 |
| **Database** | Amazon DynamoDB (PAY_PER_REQUEST, Automated TTL Expiry) |
| **API** | AWS HTTP API Gateway (v2) |
| **IaC** | AWS SAM (CloudFormation) |

---

## 👥 Authors & Acknowledgments

* **rabbitc0der** — Full-Stack Architecture, Computer Vision & Cloud Engineering
* Built for civic impact and monsoon flood resilience.

---

## 📄 License

MIT License © 2026 AquaPin Team
