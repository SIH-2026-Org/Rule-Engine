# SAARTHI-SETU — Omnichannel Integration Manual (`integrate.md`)

> **Smart India Hackathon 2026** | Problem Statement: **SIH26092**  
> **Topic**: AI-Driven Scheme Matching for Marginalized Entrepreneurs  
> **Team**: Manifestation | **Tagline**: *One Call. Right Scheme. Right Door.*

---

## 📑 Table of Contents
1. [Central Integration Philosophy](#1-central-integration-philosophy)
2. [Unified API Contract (`POST /api/v1/match`)](#2-unified-api-contract-post-apiv1match)
3. [WhatsApp Chatbot Integration](#3-whatsapp-chatbot-integration)
4. [IVR / Voice Telephony Integration (Toll-Free 2G Voice)](#4-ivr--voice-telephony-integration-toll-free-2g-voice)
5. [Android Mobile App Integration (Kotlin / Retrofit)](#5-android-mobile-app-integration-kotlin--retrofit)
6. [Two-Way SMS Gateway Integration](#6-two-way-sms-gateway-integration)
7. [Web Portal & CSC / VLE Assisted Interface Integration](#7-web-portal--csc--vle-assisted-interface-integration)
8. [Error Handling & Edge Cases Checklist](#8-error-handling--edge-cases-checklist)

---

## 1. Central Integration Philosophy

All omnichannel interfaces connect to **one central backend engine**. No channel implements its own eligibility rules, financial math, or document requirements.

```
                               ┌──────────────────────────────────────────────┐
                               │            CENTRAL BACKEND API               │
                               │           http://localhost:3000/             │
                               └──────────────────────┬───────────────────────┘
                                                      │
         ┌────────────────────────┬───────────────────┼───────────────────┬────────────────────────┐
         │                        │                   │                   │                        │
         ▼                        ▼                   ▼                   ▼                        ▼
┌─────────────────┐      ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐      ┌─────────────────┐
│  WhatsApp Bot   │      │  IVR / Voice    │ │  Mobile App     │ │  SMS Gateway    │      │  CSC / Web App  │
│  Meta Cloud API │      │  Telephony ASR  │ │  Android/Kotlin │ │  Two-way GSM    │      │  React/Next.js  │
│  Webhook        │      │  Twilio/Exotel  │ │  Retrofit       │ │  Shortcode      │      │  VLE Portal     │
└─────────────────┘      └─────────────────┘ └─────────────────┘ └─────────────────┘      └─────────────────┘
```

---

## 2. Unified API Contract (`POST /api/v1/match`)

Every channel interacts with this primary endpoint.

### Option A: Structured Profile Input (Mobile App, Web, CSC)
```http
POST /api/v1/match
Content-Type: application/json

{
  "profile": {
    "age": 28,
    "gender": "F",
    "social_category": "SC",
    "state": "Rajasthan",
    "activity": "dairy",
    "project_cost": 120000,
    "income_annual": 120000,
    "existing_documents": ["aadhaar", "photo"]
  },
  "options": {
    "topN": 3,
    "simulate": true,
    "documents": true
  }
}
```

### Option B: Conversational / Raw Text Input (WhatsApp, IVR Speech-to-Text, SMS)
```http
POST /api/v1/match
Content-Type: application/json

{
  "text": "Mujhe dairy business ke liye 1.2 lakh chahiye. Main Rajasthan se hoon. SC category.",
  "channel": "WHATSAPP",
  "language_code": "hi-IN"
}
```

### Standard Response Format (Consumed by All Clients)
```json
{
  "success": true,
  "data": {
    "beneficiary_profile": {
      "activity": "dairy",
      "project_cost": 120000,
      "state": "Rajasthan",
      "social_category": "SC",
      "gender": "F",
      "age": 28
    },
    "total_evaluated": 15,
    "matched_count": 2,
    "top_matches": [
      {
        "scheme_id": "NABARD_DAIRY_01",
        "scheme_name": "NABARD Dairy Entrepreneurship Scheme",
        "short_name": "NABARD Dairy",
        "category": "ANIMAL_HUSBANDRY",
        "match_score": 94,
        "score_breakdown": {
          "eligibility_fit": 30,
          "financial_fit": 24,
          "activity_fit": 15,
          "preference_fit": 10,
          "channel_availability": 8,
          "location_accessibility": 10
        },
        "financial_simulation": {
          "project_cost": 120000,
          "own_contribution": 12000,
          "eligible_financing": 108000,
          "subsidy_received": 27000,
          "net_loan_amount": 81000,
          "interest_rate_effective": 8.5,
          "repayment_months": 78,
          "moratorium_months": 6,
          "emi_monthly": 1354,
          "total_repayment": 105612,
          "summary_text": "💰 Financial Estimate (Loan + Subsidy):\n• Project Cost: ₹1,20,000\n• Your Margin: ₹12,000 (10%)\n• Subsidy: ₹27,000\n• Net Loan: ₹81,000\n• EMI: ₹1,354/month (8.5% p.a.)"
        },
        "document_checklist": {
          "readiness_pct": 50,
          "available": [
            { "id": "aadhaar", "name": "Aadhaar Card", "required": true }
          ],
          "obtain": [
            {
              "id": "category_cert",
              "name": "Caste Certificate",
              "required": true,
              "note": "Obtain from Tehsildar office / nearest CSC center"
            }
          ]
        },
        "channel_partners": {
          "types": ["Commercial Banks", "Regional Rural Banks (RRBs)", "Cooperative Banks"],
          "pm_suraj_integrated": true
        }
      }
    ],
    "missing_critical_fields": []
  }
}
```

---

## 3. WhatsApp Chatbot Integration

The WhatsApp controller is located at [`Chatbot/src/controllers/webhook.controller.js`](file:///c:/Users/parth/Desktop/sih_2026/Chatbot/src/controllers/webhook.controller.js).

### Flow Architecture
```
User (WhatsApp) 
  ──> Meta Cloud API Webhook 
  ──> POST /webhook 
  ──> verifySignature.js (HMAC-SHA256)
  ──> webhook.controller.js
  ──> session.service.js (accumulates profile)
  ──> profile.builder.js (extracts entities)
  ──> rule.engine.js (matchSchemes)
  ──> translation.service.js (Sarvam AI multilingual)
  ──> whatsapp.service.js (Interactive Cards / Reply Buttons)
```

### Sending Dynamic Interactive Scheme Cards
When scheme matches are found, send an interactive button message:

```javascript
import { sendInteractiveButtons, sendTextMessage } from '../services/whatsapp.service.js';
import { translateText } from '../services/translation.service.js';

export async function sendSchemeMatchCard(recipientPhone, matchResult, langCode) {
  const topMatch = matchResult.top_matches[0];
  const fin = topMatch.financial_simulation;

  const header = `🌟 Best Match: ${topMatch.short_name} (${topMatch.match_score}/100)`;
  const bodyText = 
    `• Project Cost: ₹${fin.project_cost.toLocaleString('en-IN')}\n` +
    `• Govt. Subsidy: ₹${fin.subsidy_received.toLocaleString('en-IN')}\n` +
    `• Monthly EMI: ₹${fin.emi_monthly.toLocaleString('en-IN')}/mo\n` +
    `• Interest: ${fin.interest_rate_effective}% p.a.`;

  // Translate body to user's selected language via Sarvam AI
  const translatedBody = await translateText(bodyText, langCode);

  const buttons = [
    { id: `APPLY_${topMatch.scheme_id}`, title: '📝 How to Apply' },
    { id: `DOCS_${topMatch.scheme_id}`, title: '📋 Document List' },
    { id: `NEXT_SCHEMES`, title: '🔍 More Schemes' }
  ];

  await sendInteractiveButtons(recipientPhone, translatedBody, buttons, header);
}
```

---

## 4. IVR / Voice Telephony Integration (Toll-Free 2G Voice)

Provides voice-guided scheme discovery for citizens who cannot read or type. Compatible with **Exotel, Twilio Voice, Asterisk, or FreeSWITCH**.

### IVR Architecture
```
Citizen Dials Toll-Free Number (e.g. 1800-XXX-XXXX)
  ↓
IVR Telephony Gateway (Exotel/Twilio)
  ↓
Spoken Regional Audio Stream (e.g., Hindi / Bhojpuri / Marathi / Tamil)
  ↓
Sarvam AI / Bhashini ASR (Speech-to-Text)
  ↓
POST http://localhost:3000/api/v1/match (with text + channel: "IVR")
  ↓
DRE Match Result:
  - If missing fields: IVR asks: "Aapki umar kitni hai?" (TTS)
  - If matched: IVR speaks: "Aapke liye NABARD Dairy yojana upyukt hai..." (TTS)
```

### Complete IVR Webhook Implementation (Node.js / Express)

```javascript
import express from 'express';
import axios from 'axios';

const ivrRouter = express.Router();
const ENGINE_API = 'http://localhost:3000/api/v1/match';

/**
 * Handles incoming voice transcription from IVR telephony webhook
 */
ivrRouter.post('/ivr/voice-turn', async (req, res) => {
  try {
    const { CallSid, SpeechResult, Caller, Language = 'hi-IN' } = req.body;

    // Call Central Rule Engine API
    const response = await axios.post(ENGINE_API, {
      text: SpeechResult,
      channel: 'IVR',
      language_code: Language,
      session_id: CallSid
    });

    const data = response.data.data;

    // If missing critical information, ask targeted follow-up question
    if (data.missing_critical_fields && data.missing_critical_fields.length > 0) {
      const nextField = data.missing_critical_fields[0];
      const prompts = {
        age: 'Kripya batayein, aapki umar kitne saal hai?',
        social_category: 'Aap kis varg se hain? Jaise General, OBC, SC, ya ST?',
        state: 'Aap kis rajya mein rehte hain?'
      };

      const promptVoice = prompts[nextField] || 'Kripya thodi aur jaankari dein.';

      // Return TwiML / NCCO Voice Response
      return res.type('text/xml').send(`
        <Response>
          <Say language="${Language}">${promptVoice}</Say>
          <Gather input="speech" timeout="5" action="/ivr/voice-turn" language="${Language}" />
        </Response>
      `);
    }

    // Top match found! Speak the financial outcome to caller
    const topScheme = data.top_matches[0];
    const fin = topScheme.financial_simulation;

    const speechText = 
      `Aapke liye sabse achhi yojana hai: ${topScheme.short_name}. ` +
      `Isme aapko lagbhag ${fin.subsidy_received} rupaye ki sarkari subsidy milegi, ` +
      `aur mahine ki EMI lagbhag ${fin.emi_monthly} rupaye hogi. ` +
      `Aavedan karne ke liye apne nazdeeki bank ya CSC center par jayein. Dhanyavaad.`;

    return res.type('text/xml').send(`
      <Response>
        <Say language="${Language}">${speechText}</Say>
        <Hangup/>
      </Response>
    `);

  } catch (err) {
    console.error('[IVR Error]', err);
    return res.type('text/xml').send(`
      <Response>
        <Say language="hi-IN">Kshama karein, takneeki samasya aayi hai. Kripya punah prayas karein.</Say>
      </Response>
    `);
  }
});

export default ivrRouter;
```

---

## 5. Android Mobile App Integration (Kotlin / Retrofit)

The Android app is located in [`Mobile-App/`](file:///c:/Users/parth/Desktop/sih_2026/Mobile-App/).

### 5.1 Add Gradle Dependencies (`app/build.gradle.kts`)
```kotlin
dependencies {
    // Retrofit & Moshi / Gson for Networking
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    // Coroutines & Lifecycle
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.5")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.5")
}
```

### 5.2 Kotlin Data Models (`SchemeModels.kt`)
```kotlin
data class MatchRequest(
    val profile: BeneficiaryProfile,
    val options: MatchOptions = MatchOptions()
)

data class BeneficiaryProfile(
    val age: Int? = null,
    val gender: String? = null,              // "M", "F", "O"
    val social_category: String? = null,     // "SC", "ST", "OBC", "GEN"
    val state: String? = null,
    val activity: String? = null,
    val project_cost: Long? = null,
    val income_annual: Long? = null,
    val existing_documents: List<String> = emptyList()
)

data class MatchOptions(
    val topN: Int = 5,
    val simulate: Boolean = true,
    val documents: Boolean = true
)

data class MatchResponse(
    val success: Boolean,
    val data: MatchData?
)

data class MatchData(
    val total_evaluated: Int,
    val matched_count: Int,
    val top_matches: List<SchemeMatchItem>
)

data class SchemeMatchItem(
    val scheme_id: String,
    val scheme_name: String,
    val short_name: String,
    val match_score: Int,
    val financial_simulation: FinancialSimulation,
    val document_checklist: DocumentChecklist
)

data class FinancialSimulation(
    val project_cost: Long,
    val own_contribution: Long,
    val subsidy_received: Long,
    val net_loan_amount: Long,
    val interest_rate_effective: Double,
    val emi_monthly: Long,
    val repayment_months: Int
)

data class DocumentChecklist(
    val readiness_pct: Int,
    val available: List<DocumentItem>,
    val obtain: List<DocumentItem>
)

data class DocumentItem(
    val id: String,
    val name: String,
    val required: Boolean,
    val note: String?
)
```

### 5.3 Retrofit API Service (`SaarthiApiService.kt`)
```kotlin
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

interface SaarthiApiService {
    @POST("api/v1/match")
    suspend fun matchSchemes(@Body request: MatchRequest): Response<MatchResponse>
    
    @POST("api/v1/match")
    suspend fun matchByText(@Body request: Map<String, String>): Response<MatchResponse>
}
```

### 5.4 Retrofit Client Instance (`ApiClient.kt`)
```kotlin
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

object ApiClient {
    // Replace with your server IP (or 10.0.2.2 for Android Emulator)
    private const val BASE_URL = "http://10.0.2.2:3000/"

    private val logging = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    private val httpClient = OkHttpClient.Builder()
        .addInterceptor(logging)
        .build()

    val apiService: SaarthiApiService by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(httpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(SaarthiApiService::class.java)
    }
}
```

### 5.5 Repository & ViewModel Usage (`SchemeViewModel.kt`)
```kotlin
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class UiState {
    object Idle : UiState()
    object Loading : UiState()
    data class Success(val matches: List<SchemeMatchItem>) : UiState()
    data class Error(val message: String) : UiState()
}

class SchemeViewModel : ViewModel() {
    private val _uiState = MutableStateFlow<UiState>(UiState.Idle)
    val uiState = _uiState.asStateFlow()

    fun findSchemes(profile: BeneficiaryProfile) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            try {
                val response = ApiClient.apiService.matchSchemes(MatchRequest(profile))
                if (response.isSuccessful && response.body()?.success == true) {
                    val list = response.body()?.data?.top_matches ?: emptyList()
                    _uiState.value = UiState.Success(list)
                } else {
                    _uiState.value = UiState.Error("Failed to match schemes")
                }
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.localizedMessage ?: "Network error")
            }
        }
    }
}
```

---

## 6. Two-Way SMS Gateway Integration

Designed for basic feature phones with zero internet connectivity.

### Flow & Format
```
Beneficiary SMS ──> "SCHEME DAIRY 1.2L SC RAJASTHAN" ──> Shortcode 56161
  ↓
SMS Gateway Webhook (POST /sms/inbound)
  ↓
Calls POST /api/v1/match { text: "..." }
  ↓
Generates Compact 160-Character SMS
  ↓
Outbound SMS Gateway delivers to phone
```

### Node.js SMS Gateway Webhook Handler
```javascript
import express from 'express';
import axios from 'axios';

const smsRouter = express.Router();

smsRouter.post('/sms/inbound', async (req, res) => {
  try {
    const { from, message } = req.body; // e.g. "SCHEME DAIRY 1.2L SC"

    const response = await axios.post('http://localhost:3000/api/v1/match', {
      text: message,
      channel: 'SMS',
      session_id: from
    });

    const matches = response.data.data.top_matches;
    let smsReply = '';

    if (!matches || matches.length === 0) {
      smsReply = 'SAARTHI: Koi yojana nahi mili. Detail SMS karein: SCHEME <Kaam> <Rakam> <Caste> <State>';
    } else {
      const top = matches[0];
      const fin = top.financial_simulation;
      smsReply = `SAARTHI: Yojna: ${top.short_name}\n` +
                 `Subsidy: Rs.${fin.subsidy_received}\n` +
                 `EMI: Rs.${fin.emi_monthly}/mahina\n` +
                 `Apply: Nazdeeki Bank/CSC jayein.`;
    }

    // Return response to SMS gateway provider
    return res.status(200).json({ to: from, message: smsReply.slice(0, 160) });

  } catch (err) {
    console.error('[SMS Error]', err);
    return res.status(500).send('SMS processing error');
  }
});

export default smsRouter;
```

---

## 7. Web Portal & CSC / VLE Assisted Interface Integration

Assisted discovery interface for **Common Service Centre (CSC)** village operators and web portals.

### React / Next.js Form Submission Handler
```typescript
interface BeneficiaryFormData {
  age: number;
  gender: string;
  social_category: string;
  state: string;
  activity: string;
  project_cost: number;
  income_annual: number;
  existing_documents: string[];
}

export async function submitSchemeDiscovery(formData: BeneficiaryFormData) {
  const response = await fetch('/api/v1/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile: formData,
      options: {
        topN: 5,
        simulate: true,
        documents: true
      }
    })
  });

  const json = await response.json();
  if (!json.success) {
    throw new Error(json.errors?.join(', ') || 'Scheme matching failed');
  }

  return json.data.top_matches;
}
```

---

## 8. Error Handling & Edge Cases Checklist

| Edge Case | Engine Behavior | Recommended Client Action |
|---|---|---|
| **Missing Critical Fields** (e.g. project cost or activity not given) | Returns `missing_critical_fields: ["activity", "project_cost"]` | Prompt the user specifically for the missing item (do not reject). |
| **No Eligible Schemes Found** | Returns `matched_count: 0` and `top_matches: []` | Display alternative counseling advice or closest near-miss criteria. |
| **Informal Slang / Colloquial Hindi** (`"doodh ka kaam"`, `"rehdi"`, `"silai"`) | Normalizer automatically maps to canonical activities (`dairy`, `street_vending`, `tailoring`) | Send user text directly to `POST /api/v1/match` without pre-filtering. |
| **High Loan Request Exceeding Scheme Limit** | Calculates maximum allowed funding under the scheme and flags partial coverage | Display clear warning: *"Scheme covers up to ₹X. Remaining must be self-financed."* |
| **Invalid Access Token (Meta / WhatsApp)** | Logs warning and handles session in memory | Ensure `.env` contains valid credentials. |
