# SAARTHI-SETU — Core Backend & Omnichannel Deterministic Rule Engine (DRE)

> **Smart India Hackathon 2026** | Problem Statement ID: **SIH26092**  
> **Problem Statement**: AI-Driven Scheme Matching for Marginalized Entrepreneurs  
> **Team**: Manifestation | **Tagline**: *One Call. Right Scheme. Right Door.*

---

## 📖 Overview

**SAARTHI-SETU** is an omnichannel, multilingual, low-bandwidth financial guidance and government scheme discovery platform designed for marginalized and underserved Indian entrepreneurs (street vendors, rural artisans, SHGs, farmers, SC/ST/OBC/Women entrepreneurs).

This repository contains the **Central Deterministic Rule Engine (DRE)** and the **Omnichannel Backend API**. It acts as the single source of truth for eligibility matching, scoring, financial EMI/subsidy simulation, and document checklist generation across **all channels** — WhatsApp Bot, IVR Voice, SMS, Mobile App, Web Portal, and Common Service Centres (CSC).

---

## 🏛️ System Architecture: The DRE Principle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             OMNICHANNEL CLIENTS                             │
│  [ WhatsApp Bot ]   [ IVR / Voice ]   [ SMS Gateway ]   [ Mobile / Web App ]│
└────────┬───────────────────┬─────────────────┬───────────────────┬──────────┘
         │                   │                 │                   │
         └───────────────────┼─────────────────┼───────────────────┘
                             ▼                 ▼
             ┌─────────────────────────────────────────────────┐
             │       NLP / Regex Profile Extractor & Sarvam AI │
             │  Extracts: Activity, Cost, State, Category, etc.│
             └───────────────────────┬─────────────────────────┘
                                     │ (Canonical BeneficiaryProfile)
                                     ▼
             ┌─────────────────────────────────────────────────┐
             │   CENTRAL DETERMINISTIC RULE ENGINE (DRE)       │
             │   -------------------------------------------   │
             │   1. Eligibility Engine  (11 Rule Types)        │
             │   2. Scoring Engine      (6 Weighted Factors)   │
             │   3. Financial Engine    (EMI + Subsidy Calc)   │
             │   4. Document Generator  (3-Tier Checklist)     │
             └───────────────────────┬─────────────────────────┘
                                     │
                                     ▼
             ┌─────────────────────────────────────────────────┐
             │            SCHEME DATABASE (schemes.db.js)      │
             │     MUDRA, PMEGP, Stand-Up India, NABARD, etc.   │
             └─────────────────────────────────────────────────┘
```

### Why a Deterministic Rule Engine?
- **Zero Hallucinations**: Government scheme eligibility criteria (age bounds, turnover caps, caste/gender reservations, collateral mandates) are evaluated with mathematical precision.
- **100% Auditability**: Every scheme evaluation produces an auditable rule breakdown (`PASSED`, `FAILED`, or `NEEDS_MORE_INFO` with missing fields).
- **Omnichannel Reusability**: The identical engine powers real-time WhatsApp interactive cards, IVR automated voice prompts, SMS 160-char summaries, and Mobile App dashboards without duplicating business logic.

---

## 📁 Project Structure & Summary of Changes

```
Chatbot/
├── src/
│   ├── engine/                       ✨ [NEW ENGINE SUBSYSTEM]
│   │   ├── scheme.schema.js          # Canonical JSDoc schema & scheme validator (11 rule types)
│   │   ├── eligibility.engine.js     # Pure deterministic eligibility evaluator & missing-field detector
│   │   ├── scoring.engine.js         # 6-factor weighted ranking algorithm (0-100 score)
│   │   ├── financial.simulator.js    # Reducing-balance EMI, moratorium & capital subsidy calculator
│   │   ├── document.generator.js     # 3-tier document checklist generator (Available / Obtain / Required)
│   │   ├── rule.engine.js            # Master orchestrator API (`matchSchemes()`, lazy DB loader)
│   │   └── schemes.db.js             # Scheme dataset (MUDRA, NABARD Dairy, PM SVANidhi, PMEGP, etc.)
│   ├── services/
│   │   ├── profile.builder.js        ✨ [NEW] Regex & NLP entity extractor for informal conversational inputs
│   │   ├── session.service.js        🔄 [MODIFIED] Added multi-turn profile accumulation & state tracking
│   │   ├── translation.service.js    # Sarvam AI multilingual translation (10 Indian languages)
│   │   └── whatsapp.service.js       # Meta Cloud API message/interactive buttons dispatcher
│   ├── controllers/
│   │   ├── engine.controller.js      ✨ [NEW] 5 REST API handlers for matching, simulation, parsing
│   │   └── webhook.controller.js     🔄 [MODIFIED] Rewritten to integrate DRE directly into WhatsApp chat
│   ├── routes/
│   │   ├── engine.routes.js          ✨ [NEW] Express router mounting /api/v1/ endpoints
│   │   └── webhook.routes.js         # Express router for /webhook
│   ├── config/
│   │   └── env.js                    # Environment variable validation
│   ├── constants/
│   │   └── messages.js               # Multilingual response templates & button configs
│   ├── app.js                        🔄 [MODIFIED] Mounted /api/v1 routes and added system status route
│   └── server.js                     # HTTP server startup
├── test.js                           ✨ [NEW] Live test script verifying NLP extraction & DRE match
├── package.json
└── README.md
```

---

## 🛠️ Detailed Breakdown of Modules

### 1. Scheme Schema & Rule Validation (`src/engine/scheme.schema.js`)
Defines the canonical structure for all government schemes and supports **11 deterministic rule types**:
- `range`: Numerical bounds (e.g., `min: 18, max: 65` for age).
- `set`: Strict allowed values (e.g., `["SC", "ST", "OBC", "GEN"]`).
- `exact`: Single exact value requirement.
- `boolean`: Flags (e.g., `requires_prior_experience: false`).
- `array_contains`: Target must exist inside applicant's array.
- `array_intersects`: At least one common element required.
- `activity_synonym`: Matches informal business terms to official scheme activities.
- `state_eligibility`: Matches state or `"ALL_INDIA"`.
- `urban_rural`: `"URBAN"`, `"RURAL"`, or `"ALL"`.
- `income_cap`: Annual family income ceilings.
- `custom`: Custom deterministic validation callback.

---

### 2. Deterministic Eligibility Evaluator (`src/engine/eligibility.engine.js`)
- Evaluates an applicant's `BeneficiaryProfile` against scheme rules.
- Returns one of three verdicts per scheme:
  - `ELIGIBLE`: All required criteria fully satisfied.
  - `INELIGIBLE`: Failed one or more hard eligibility rules (provides exact failure reasons).
  - `NEEDS_MORE_INFO`: Passed known criteria, but critical fields (e.g., age, income) are missing. Returns `missing_fields` list to drive follow-up questions on IVR/WhatsApp.

---

### 3. Weighted Scoring Algorithm (`src/engine/scoring.engine.js`)
Ranks eligible schemes on a **0–100 scale** using 6 prioritized factors:

| Factor | Weight | Evaluation Criteria |
|---|---|---|
| **Subsidy Match** | 25% | Presence and magnitude of non-repayable capital/interest subsidy |
| **Document Readiness** | 20% | Ratio of documents the applicant already possesses |
| **Activity Relevance** | 20% | Direct vs. broad business activity compatibility |
| **Margin Money Affordability** | 15% | Applicant savings vs. required borrower contribution |
| **Special Category Fit** | 10% | Women, SC/ST, Minority, PwD specific reservations |
| **Processing Speed** | 10% | Turnaround time of the nodal agency (e.g., direct DBT vs. bank loan) |

---

### 4. Financial Simulator (`src/engine/financial.simulator.js`)
Provides instant, transparent loan math without requiring external banking calculators:
- **Reducing-Balance EMI**:
  $$\text{EMI} = \frac{P \times r \times (1+r)^n}{(1+r)^n - 1}$$
- **Capital Subsidy Calculation**: Computes exact government contribution based on social category, gender, and location.
- **Moratorium Support**: Handles repayment holiday periods where interest accrues or is waived.

---

### 5. Document Checklist Generator (`src/engine/document.generator.js`)
Classifies documents into 3 actionable categories for the beneficiary:
1. `already_available`: Documents the applicant declared having (e.g., Aadhaar Card, Photo).
2. `need_to_obtain`: Missing documents + **actionable instructions** on where to get them (e.g., *"Caste Certificate from Tehsildar office / CSC"*).
3. `mandatory_for_disbursal`: Strict prerequisites before loan release.

---

### 6. Conversational Profile Builder (`src/services/profile.builder.js`)
Parses informal, unstructured Hinglish/English/regional messages and extracts structured profile data:
- **Amounts**: Recognizes `"1.2 lakh"`, `"50k"`, `"₹25,000"`, `"2 crore"`.
- **Activities**: Maps informal terms (`"dairy"`, `"doodh"`, `"chai ki dukan"`, `"kirana"`, `"silai"`, `"auto"`, `"sabji"`) to canonical categories.
- **Demographics**: Extracts Age, Gender, Social Category (`SC`/`ST`/`OBC`/`GEN`), Location/State (`Rajasthan`, `Delhi`, `UP`, etc.).

---

### 7. Multi-Turn Session Accumulator (`src/services/session.service.js`)
- Maintains stateful user sessions across WhatsApp / IVR conversation turns.
- Gradually builds and enriches the `beneficiaryProfile` as the user answers follow-up questions.

---

## 🌐 Unified REST API Reference

All omnichannel clients (Mobile, Web, IVR, SMS, CSC) connect to the engine via `/api/v1`.

### 1. `POST /api/v1/match` (Primary Scheme Matcher)
Accepts either a structured `BeneficiaryProfile` OR raw text.

**Request Body (Structured Profile):**
```json
{
  "profile": {
    "age": 28,
    "gender": "FEMALE",
    "social_category": "SC",
    "annual_income": 120000,
    "state": "Rajasthan",
    "business_activity": "dairy",
    "project_cost": 120000,
    "existing_documents": ["AADHAAR_CARD", "PASSPORT_PHOTO"]
  },
  "options": {
    "top_n": 3,
    "include_ineligible": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_schemes_evaluated": 15,
    "matched_count": 2,
    "top_matches": [
      {
        "scheme_id": "NABARD_DAIRY_01",
        "scheme_name": "NABARD Dairy Entrepreneurship Development Scheme",
        "nodal_ministry": "Ministry of Fisheries, Animal Husbandry and Dairying",
        "match_score": 96,
        "score_breakdown": {
          "subsidy_match": 25,
          "document_readiness": 16,
          "activity_relevance": 20,
          "margin_affordability": 15,
          "special_category_fit": 10,
          "processing_speed": 10
        },
        "financial_simulation": {
          "total_project_cost": 120000,
          "subsidy_amount": 39600,
          "borrower_contribution": 12000,
          "net_loan_amount": 68400,
          "monthly_emi": 1092,
          "tenure_months": 84,
          "interest_rate_pct": 8.5
        },
        "document_checklist": {
          "already_available": ["Aadhaar Card", "Passport Size Photographs"],
          "need_to_obtain": [
            {
              "name": "Caste Certificate",
              "where_to_get": "Tehsildar Office or nearest CSC center",
              "estimated_days": 7
            }
          ]
        },
        "application_routing": {
          "mode": "HYBRID",
          "online_portal_url": "https://nabard.org",
          "nearest_channel_partner": "Regional Rural Bank (RRB) / NABARD District Office"
        }
      }
    ]
  }
}
```

---

### 2. `POST /api/v1/match/text` (Raw Text Input)
Direct text query without client-side parsing.

**Request Body:**
```json
{
  "text": "Mujhe dairy business ke liye 1.2 lakh chahiye. Main Rajasthan mein rehta hoon. SC category.",
  "channel": "WHATSAPP",
  "language_code": "hi-IN"
}
```

---

### 3. `POST /api/v1/simulate` (Standalone Loan & Subsidy Calculator)
Calculates EMI, subsidy, and total payout for a specific scheme without running a full eligibility match.

**Request Body:**
```json
{
  "scheme_id": "MUDRA_KISHORE",
  "project_cost": 200000,
  "social_category": "OBC",
  "gender": "FEMALE",
  "tenure_months": 60
}
```

---

### 4. `POST /api/v1/parse-profile` (Entity Extractor Only)
Extracts key demographic and business entities from free-form conversational text.

---

### 5. `GET /api/v1/health`
Returns live system status, engine status, and number of loaded schemes.

---

## 📱 How Each Channel Uses the DRE

| Channel | Input Method | Processing Flow | Output Delivered |
|---|---|---|---|
| **WhatsApp Bot** | Free text / Voice note / Button tap | Sarvam translation -> `profile.builder.js` -> Multi-turn session accumulation -> `matchSchemes()` | Interactive WhatsApp cards with scheme name, subsidy %, monthly EMI, and application button. |
| **IVR / Voice Call** | Spoken audio (regional language) | ASR (Sarvam/Bhashini) -> Text -> `POST /api/v1/match` -> Returns top scheme + missing info questions | Synthesized speech (TTS) answers user and asks only for missing fields. |
| **SMS Gateway** | Short 160-character SMS | Inbound webhook -> `profile.builder.js` -> `matchSchemes({ top_n: 1 })` | Single SMS with best scheme, subsidy amount, and CSC center routing code. |
| **Mobile & Web App** | Structured wizard form + Voice assistant | Form JSON directly sent to `POST /api/v1/match` | Full interactive dashboard with side-by-side scheme comparison, slider simulation, and document upload checklist. |
| **CSC / VLE Portal** | Assisted entry by Village Level Entrepreneur | Direct API call with applicant Aadhaar metadata | Printable PDF document checklist and pre-filled scheme application form. |

---

## 🚀 Getting Started

### 1. Environment Configuration
Create a `.env` file based on `.env.example`:
```bash
PORT=3000
META_VERIFY_TOKEN="your_verify_token"
META_APP_SECRET="your_meta_app_secret"
WHATSAPP_TOKEN="your_whatsapp_access_token"
PHONE_NUMBER_ID="your_phone_number_id"
SARVAM_API="your_sarvam_api_key"
```

### 2. Install Dependencies & Run
```bash
# Install packages
npm install

# Start in development mode (with auto-reload)
npm run dev

# Start in production mode
npm start
```

### 3. Run Verification Tests
```bash
# Test the DRE and NLP Profile Builder
node test.js

# Run integration tests
npm test
```

---

## 🏆 Key SIH 2026 Innovation Highlights
1. **Explainable AI**: The engine provides transparent reasons for both qualification and rejection, empowering marginalized applicants to fix disqualifying criteria (e.g., getting a missing certificate).
2. **Channel-Partner Routing**: Seamlessly routes applicants to the correct doorstep — Banks, Microfinance Institutions, District Industries Centres (DIC), or CSCs.
3. **Ultra Low-Bandwidth Friendly**: Works fully over 2G voice (IVR) and SMS, ensuring financial inclusion reaches the remotest rural entrepreneurs.
