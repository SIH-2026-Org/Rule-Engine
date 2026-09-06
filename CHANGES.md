# SAARTHI-SETU — Deterministic Rule Engine (DRE): Changes, Architecture & Integration Guide

> **Smart India Hackathon 2026** | Problem Statement: **SIH26092**  
> **Topic**: AI-Driven Scheme Matching for Marginalized Entrepreneurs  
> **Team**: Manifestation | **Tagline**: *One Call. Right Scheme. Right Door.*

---

## 📑 Table of Contents
1. [Executive Summary of Changes](#1-executive-summary-of-changes)
2. [File-by-File Changes Summary](#2-file-by-file-changes-summary)
3. [How the Deterministic Rule Engine (DRE) Works](#3-how-the-deterministic-rule-engine-dre-works)
4. [DRE Core Functionalities & Subsystems](#4-dre-core-functionalities--subsystems)
   - [4.1 Scheme Schema & 11 Rule Types](#41-scheme-schema--11-rule-types)
   - [4.2 Eligibility Engine (3-State Verdicts)](#42-eligibility-engine-3-state-verdicts)
   - [4.3 Multi-Factor Weighted Scoring Model](#43-multi-factor-weighted-scoring-model)
   - [4.4 Financial Simulation Engine](#44-financial-simulation-engine)
   - [4.5 3-Tier Document Checklist Generator](#45-3-tier-document-checklist-generator)
   - [4.6 Conversational Profile Builder (NLP/Regex Extractor)](#46-conversational-profile-builder-nlpregex-extractor)
   - [4.7 Multi-Turn Session Profile Accumulator](#47-multi-turn-session-profile-accumulator)
5. [How to Test the System](#5-how-to-test-the-system)
   - [5.1 Automated Unit & Integration Tests (`npm test`)](#51-automated-unit--integration-tests-npm-test)
   - [5.2 REST API Manual Testing (cURL / HTTP Requests)](#52-rest-api-manual-testing-curl--http-requests)
   - [5.3 WhatsApp Webhook End-to-End Simulation](#53-whatsapp-webhook-end-to-end-simulation)
6. [Omnichannel Integration Guide](#6-omnichannel-integration-guide)
   - [6.1 WhatsApp Chatbot](#61-whatsapp-chatbot)
   - [6.2 IVR (Interactive Voice Response) / Telephony](#62-ivr-interactive-voice-response--telephony)
   - [6.3 SMS Gateway](#63-sms-gateway)
   - [6.4 Android / iOS Mobile Application](#64-android--ios-mobile-application)
   - [6.5 Web Dashboard & CSC / VLE Assisted Portals](#65-web-dashboard--csc--vle-assisted-portals)

---

## 1. Executive Summary of Changes

### The Problem Addressed
Previously, the backend only supported basic WhatsApp messaging and language selection. It lacked a standardized, auditable scheme evaluation engine and could not serve other channels like IVR, SMS, Web, or Mobile Apps.

### The Solution Built
We designed and implemented the **Central Deterministic Rule Engine (DRE)** — a modular, pure-logic, zero-dependency engine that sits at the core of SAARTHI-SETU. It evaluates complex government criteria (age, caste, gender, turnover, activities, state, margin money) deterministically without relying on LLMs for mathematical or eligibility decisions (preventing hallucinations while maintaining full auditability).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            OMNICHANNEL INTERFACES                           │
│  [ WhatsApp Bot ]   [ IVR Voice ]   [ SMS Gateway ]   [ Mobile / Web App ]  │
└────────┬───────────────────┬─────────────────┬───────────────────┬──────────┘
         │                   │                 │                   │
         └───────────────────┼─────────────────┼───────────────────┘
                             ▼                 ▼
             ┌─────────────────────────────────────────────────┐
             │       NLP / Regex Entity Profile Builder        │
             │ Extracts: Activity, Project Cost, State, Caste  │
             └───────────────────────┬─────────────────────────┘
                                     │ (Canonical BeneficiaryProfile)
                                     ▼
             ┌─────────────────────────────────────────────────┐
             │   CENTRAL DETERMINISTIC RULE ENGINE (DRE)       │
             │   -------------------------------------------   │
             │   1. Eligibility Engine  (11 Rule Types)        │
             │   2. Scoring Engine      (6 Weighted Factors)   │
             │   3. Financial Simulator (EMI + Subsidy Calc)   │
             │   4. Document Generator  (3-Tier Checklist)     │
             └───────────────────────┬─────────────────────────┘
                                     │
                                     ▼
             ┌─────────────────────────────────────────────────┐
             │           UNIFIED JSON RESPONSE / CARDS         │
             │  • Top Matched Schemes + Match Score (0–100)    │
             │  • Exact Monthly EMI & Front-Loaded Subsidy     │
             │  • Missing Fields Checklist (for IVR/Bot Q&A)   │
             │  • Actionable Document Preparation Guide        │
             └─────────────────────────────────────────────────┘
```

---

## 2. File-by-File Changes Summary

| File Path | Action | Description |
|---|---|---|
| [`src/engine/scheme.schema.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/engine/scheme.schema.js) | ✨ **Created** | Canonical JSDoc schema defining scheme attributes, 11 rule types, and schema validator `validateScheme()`. |
| [`src/engine/eligibility.engine.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/engine/eligibility.engine.js) | ✨ **Created** | Pure-function evaluator that checks beneficiary profile against scheme rules; returns `ELIGIBLE`, `NOT_ELIGIBLE`, or `NEEDS_MORE_INFO`. |
| [`src/engine/scoring.engine.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/engine/scoring.engine.js) | ✨ **Created** | 6-factor weighted ranking algorithm producing a 0–100 score per scheme. |
| [`src/engine/financial.simulator.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/engine/financial.simulator.js) | ✨ **Created** | Reducing-balance EMI calculator with moratorium interest and capital subsidy computation. |
| [`src/engine/document.generator.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/engine/document.generator.js) | ✨ **Created** | 3-tier document checklist generator (`available`, `obtain`, `required`) with guidance notes. |
| [`src/engine/rule.engine.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/engine/rule.engine.js) | ✨ **Created** | Master API orchestrator exposing `matchSchemes()`, `getSchemeById()`, and lazy database loader. |
| [`src/services/profile.builder.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/services/profile.builder.js) | ✨ **Created** | Entity extractor for informal conversational inputs (handles `1.2 lakh`, `dairy`, `SC`, `Rajasthan`, etc.). |
| [`src/services/session.service.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/services/session.service.js) | 🔄 **Modified** | Added multi-turn profile accumulation functions `mergeProfileData()`, `getProfile()`, and session state transitions. |
| [`src/controllers/engine.controller.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/controllers/engine.controller.js) | ✨ **Created** | REST controllers for `/api/v1/match`, `/api/v1/schemes`, `/api/v1/simulate`, `/api/v1/parse-profile`. |
| [`src/routes/engine.routes.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/routes/engine.routes.js) | ✨ **Created** | Express router exposing all DRE endpoints under `/api/v1/`. |
| [`src/controllers/webhook.controller.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/controllers/webhook.controller.js) | 🔄 **Modified** | Rewritten to integrate DRE directly into WhatsApp conversational turns with automatic profile accumulation. |
| [`src/config/env.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/config/env.js) | 🔄 **Modified** | Added fallback mock values for prototype/testing environments so tests run out-of-the-box. |
| [`src/app.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/app.js) | 🔄 **Modified** | Mounted `/api/v1` engine routes and added root discovery endpoint `GET /`. |
| [`test/engine.test.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/test/engine.test.js) | ✨ **Created** | Automated unit & integration test suite verifying extraction, eligibility, simulation, checklists, and scoring. |
| [`package.json`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/package.json) | 🔄 **Modified** | Configured `npm test` script to run all test suites across engine and webhook. |
| [`README.md`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/README.md) | 🔄 **Modified** | Comprehensive documentation of the platform, API reference, and omnichannel usage. |

---

## 3. How the Deterministic Rule Engine (DRE) Works

### Step-by-Step Evaluation Pipeline

```
1. INPUT INGESTION
   Beneficiary submits structured JSON (App/Web) OR informal text/speech (WhatsApp/IVR/SMS).
   ↓
2. PROFILE NORMALIZATION (`profile.builder.js`)
   Converts inputs into a standardized `BeneficiaryProfile` object:
   { age, gender, social_category, state, activity, project_cost, existing_documents, ... }
   ↓
3. DETERMINISTIC EVALUATION (`eligibility.engine.js`)
   For every active scheme in DB:
   • Checks all 11 criteria (Age bounds, Category list, Location, Activity synonyms, Project cost limits)
   • Flags scheme as:
     - ELIGIBLE: 100% criteria passed
     - NEEDS_MORE_INFO: No violations, but some fields (e.g. income/age) are null
     - NOT_ELIGIBLE: Hard violation (with specific reason why)
   ↓
4. WEIGHTED SCORING (`scoring.engine.js`)
   Calculates 0–100 multi-dimensional score for each eligible/partial scheme.
   ↓
5. FINANCIAL SIMULATION (`financial.simulator.js`)
   Computes exact financial projection:
   • Own Contribution (Borrower Margin)
   • Front-loaded Capital Subsidy
   • Net Loan Amount
   • Reducing-balance Monthly EMI & Moratorium Interest
   ↓
6. DOCUMENT CHECKLIST GENERATION (`document.generator.js`)
   Categorizes required documents into 3 actionable tiers (`available`, `obtain`, `required`).
   ↓
7. OUTPUT DELIVERY
   Returns top N ranked matches with full transparency, breakdown, and channel-partner routing.
```

---

## 4. DRE Core Functionalities & Subsystems

### 4.1 Scheme Schema & 11 Rule Types
Located in [`src/engine/scheme.schema.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/engine/scheme.schema.js). Every scheme adheres to a rigorous schema supporting 11 rule types:

1. **`range`**: Numerical boundaries (e.g., `min: 18, max: 65` for Age).
2. **`set`**: Allowed enum values (e.g., `["SC", "ST", "OBC", "GEN"]`).
3. **`exact`**: Strict value equality requirement.
4. **`boolean`**: True/false criteria (e.g., `disability: true`).
5. **`array_contains`**: Target value must be contained in user array.
6. **`array_intersects`**: Overlapping elements between user and scheme arrays.
7. **`activity_synonym`**: Maps informal Indian business aliases (`dairy`, `doodh`, `cattle`, `rehdi`, `thela`, `silai`) to official scheme activities.
8. **`state_eligibility`**: Location matching against specific states or `ALL_INDIA`.
9. **`urban_rural`**: Area classification (`URBAN`, `RURAL`, or `ALL`).
10. **`income_cap`**: Maximum annual household income ceilings.
11. **`custom`**: User-defined deterministic rule functions.

---

### 4.2 Eligibility Engine (3-State Verdicts)
Located in [`src/engine/eligibility.engine.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/engine/eligibility.engine.js). Evaluates rules deterministically and returns:
- **`ELIGIBLE`**: All required criteria are satisfied.
- **`NOT_ELIGIBLE`**: Failed one or more rules. Returns the exact rule failed and human-readable explanation.
- **`NEEDS_MORE_INFO`**: Passed all known criteria, but some parameters (e.g., age, income) were not yet provided. Returns `missing_fields` list, which directly prompts the conversational bot or IVR to ask targeted follow-up questions.

---

### 4.3 Multi-Factor Weighted Scoring Model
Located in [`src/engine/scoring.engine.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/engine/scoring.engine.js). Ranks schemes on a **0–100 scale**:

| Dimension | Default Weight | Criteria |
|---|---|---|
| **Eligibility Fit** | **30%** | Ratio of passed rules vs total applicable rules |
| **Financial Fit** | **25%** | How well the loan amount covers project cost + interest rate attractiveness |
| **Activity Specificity** | **15%** | Direct scheme focus vs broad general scheme |
| **User Preference Alignment** | **10%** | Reserved category match (SC/ST/Women/PwD) |
| **Channel Availability** | **10%** | Ease of access (PM-SURAJ portal, bank network breadth) |
| **Location Accessibility** | **10%** | State-level coverage and rural/urban alignment |

---

### 4.4 Financial Simulation Engine
Located in [`src/engine/financial.simulator.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/engine/financial.simulator.js). Computes loan economics without external dependencies:
- **Reducing-Balance Monthly EMI**:
  $$\text{EMI} = \frac{P \cdot r \cdot (1+r)^n}{(1+r)^n - 1}$$
  *(where $P$ is net loan principal after subsidy deduction, $r$ is monthly interest rate, and $n$ is repayment tenure in months).*
- **Moratorium Handling**: Simple interest accrued during repayment holiday added to principal.
- **Front-Loaded Capital Subsidy**: Calculates exact government grant portion.

---

### 4.5 3-Tier Document Checklist Generator
Located in [`src/engine/document.generator.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/engine/document.generator.js). Converts complex bureaucratic paperwork into 3 clear buckets:
1. **`available`**: Standard documents commonly possessed (Aadhaar, Bank Passbook, Photo).
2. **`obtain`**: Mandatory certificates the user needs to get + **exact instructions on where to get them** (e.g., *"Caste Certificate from Tehsildar Office or nearest CSC center"*).
3. **`required`**: Scheme-specific mandatory prerequisites.

---

### 4.6 Conversational Profile Builder (NLP/Regex Extractor)
Located in [`src/services/profile.builder.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/services/profile.builder.js). Extracts structured data from raw, informal Indian conversational text:
- **Monetary amounts**: Understands `"1.2 lakh"`, `"50k"`, `"₹25,000"`, `"2.5 crore"`.
- **Occupations & Business Activities**: 20+ synonym groups (`dairy`, `tailoring`, `street_vending`, `kirana`, `handicraft`, etc.).
- **Demographics**: States, Gender (`M`/`F`/`O`), Social Categories (`SC`/`ST`/`OBC`/`GEN`/`MINORITY`), Age (`"28 years"`, `"age: 32"`).

---

### 4.7 Multi-Turn Session Profile Accumulator
Located in [`src/services/session.service.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/services/session.service.js). Supports progressive discovery across multi-turn chats:
- As the user messages over WhatsApp or voice IVR, newly extracted fields are merged into `session.beneficiaryProfile` via `mergeProfileData()`.
- Once minimum critical criteria (activity + project cost) are met, the engine automatically matches schemes without requiring a rigid form.

---

## 5. How to Test the System

### 5.1 Automated Unit & Integration Tests (`npm test`)
The test suite validates all DRE modules and channel webhooks.

```bash
cd Chatbot

# Run all tests (Engine + Webhook)
npm test

# Run only DRE unit tests
npm run test:engine

# Run only WhatsApp webhook tests
npm run test:webhook
```

**Expected Test Output**:
```
✔ 1. NLP Profile Extraction from Hinglish Text (2.0ms)
✔ 2. Eligibility Evaluation with Missing Info (NEEDS_MORE_INFO) (0.8ms)
✔ 3. Eligibility Evaluation - Fully ELIGIBLE (14.3ms)
✔ 4. Eligibility Evaluation - NOT_ELIGIBLE (Age Underage) (0.2ms)
✔ 5. Financial Simulation (Reducing Balance EMI & Subsidy) (0.6ms)
✔ 6. 3-Tier Document Checklist Generation (0.6ms)
✔ 7. Weighted Scoring Calculation (0 - 100 Scale) (0.9ms)
✔ GET /health returns 200 and healthy status
✔ GET /webhook verification handshake works with correct token
✔ POST /webhook prompts language list on first contact
...
ℹ pass 18, fail 0 (100% SUCCESS)
```

---

### 5.2 REST API Manual Testing (cURL / HTTP Requests)

Start the server:
```bash
npm start
# Server listens on http://localhost:3000
```

#### Test 1: Check System Health
```bash
curl -X GET http://localhost:3000/api/v1/engine/health
```

#### Test 2: Text-Based Scheme Match (Omnichannel Chat / Speech Input)
```bash
curl -X POST http://localhost:3000/api/v1/match \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Mujhe dairy business ke liye 1.2 lakh chahiye. Main Rajasthan mein rehta hoon. SC category.",
    "channel": "WHATSAPP",
    "language_code": "hi-IN"
  }'
```

#### Test 3: Structured Profile Scheme Match (Mobile / Web App)
```bash
curl -X POST http://localhost:3000/api/v1/match \
  -H "Content-Type: application/json" \
  -d '{
    "profile": {
      "age": 29,
      "gender": "F",
      "social_category": "SC",
      "state": "Rajasthan",
      "activity": "dairy",
      "project_cost": 120000,
      "income_annual": 120000
    },
    "options": {
      "topN": 3,
      "simulate": true,
      "documents": true
    }
  }'
```

---

## 6. Omnichannel Integration Guide

All interfaces interact with the identical DRE backend through standard JSON structures.

### 6.1 WhatsApp Chatbot
1. User sends message (text or audio).
2. Sarvam AI translates regional language to English.
3. `profile.builder.js` extracts entities and merges them into `session.beneficiaryProfile`.
4. If missing critical info, bot replies with next question.
5. If enough info, calls `matchSchemes()` and sends interactive scheme cards with EMI & Subsidy.

### 6.2 IVR (Interactive Voice Response) / Telephony
1. Farmer/artisan calls toll-free IVR number.
2. Speech-to-Text (ASR) converts audio into text.
3. Telephony server posts text to `POST /api/v1/match`.
4. Engine returns `top_matches` and `missing_fields`.
5. IVR reads out scheme summary via TTS and asks voice prompt for any missing field.

### 6.3 SMS Gateway
1. User sends keyword SMS: `SCHEME DAIRY 1.2L SC RAJASTHAN` to shortcode.
2. Inbound SMS webhook posts to `POST /api/v1/match`.
3. Engine returns best match with score.
4. Outbound SMS gateway sends concise 160-character reply with scheme name, subsidy %, monthly EMI, and CSC routing code.

### 6.4 Android / iOS Mobile Application
1. Mobile app displays a multi-step assisted wizard or voice input.
2. App collects parameters and sends JSON directly to `POST /api/v1/match`.
3. App renders rich native UI with:
   - Interactive EMI slider
   - Scheme comparison table
   - Direct download of personalized Document Checklist PDF

### 6.5 Web Dashboard & CSC / VLE Assisted Portals
1. Village Level Entrepreneurs (VLEs) at CSC centres use the web portal to help walk-in rural citizens.
2. Enter Aadhaar demographic details.
3. Web app hits `POST /api/v1/match`.
4. Portal generates printable pre-filled application forms and official agency routing instructions.
