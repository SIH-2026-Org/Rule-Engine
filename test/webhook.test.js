process.env.META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'test_verify_token';
process.env.META_APP_SECRET = process.env.META_APP_SECRET || 'test_app_secret_12345';
process.env.WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || 'test_whatsapp_token';
process.env.PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '1234567890';
process.env.SARVAM_API = process.env.SARVAM_API || 'test_sarvam_api_key';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import app from '../src/app.js';
import config from '../src/config/env.js';
import * as sessionService from '../src/services/session.service.js';
import { SUPPORTED_LANGUAGES } from '../src/constants/messages.js';

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('GET /health returns 200 and healthy status', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'healthy');
});

test('SUPPORTED_LANGUAGES contains English and the 10 Indian scheduled languages supported by Sarvam', () => {
  assert.equal(SUPPORTED_LANGUAGES.length, 11);
  const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
  assert.ok(codes.includes('en-IN'));
  assert.ok(codes.includes('hi-IN'));
  assert.ok(codes.includes('bn-IN'));
  assert.ok(codes.includes('mr-IN'));
  assert.ok(codes.includes('te-IN'));
  assert.ok(codes.includes('ta-IN'));
  assert.ok(codes.includes('gu-IN'));
  assert.ok(codes.includes('kn-IN'));
  assert.ok(codes.includes('od-IN'));
  assert.ok(codes.includes('ml-IN'));
  assert.ok(codes.includes('pa-IN'));
});

test('GET /webhook verification handshake works with correct token', async () => {
  const verifyToken = config.META_VERIFY_TOKEN;
  const challenge = '1158201444';
  const url = `${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=${challenge}`;

  const res = await fetch(url);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.equal(text, challenge);
});

test('GET /webhook returns 403 with incorrect token', async () => {
  const url = `${baseUrl}/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=123`;
  const res = await fetch(url);
  assert.equal(res.status, 403);
});

test('POST /webhook prompts language list on first contact', async () => {
  const userPhone = '919876543210';
  sessionService.resetSession(userPhone);

  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '123456', phone_number_id: '123' },
              messages: [
                {
                  from: userPhone,
                  id: 'wamid.HBgLMTIzNDU2Nzg5',
                  timestamp: '1725619200',
                  text: { body: 'Hello' },
                  type: 'text',
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const payloadString = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', config.META_APP_SECRET);
  hmac.update(payloadString);
  const signature = `sha256=${hmac.digest('hex')}`;

  const res = await fetch(`${baseUrl}/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': signature,
    },
    body: payloadString,
  });

  assert.equal(res.status, 200);

  const session = sessionService.getSession(userPhone);
  assert.ok(session);
  assert.equal(session.stage, 'AWAITING_LANGUAGE');
});

test('POST /webhook saves chosen language when user selects from interactive list (list_reply: LANG_pa-IN)', async () => {
  const userPhone = '919876543210';

  const interactivePayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '123456', phone_number_id: '123' },
              messages: [
                {
                  from: userPhone,
                  id: 'wamid.HBgLMTIzNDU2Nzkx',
                  timestamp: '1725619300',
                  type: 'interactive',
                  interactive: {
                    type: 'list_reply',
                    list_reply: {
                      id: 'LANG_pa-IN',
                      title: 'ਪੰਜਾਬੀ (Punjabi)',
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const payloadString = JSON.stringify(interactivePayload);
  const hmac = crypto.createHmac('sha256', config.META_APP_SECRET);
  hmac.update(payloadString);
  const signature = `sha256=${hmac.digest('hex')}`;

  const res = await fetch(`${baseUrl}/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': signature,
    },
    body: payloadString,
  });

  assert.equal(res.status, 200);

  const session = sessionService.getSession(userPhone);
  assert.ok(session);
  assert.equal(session.selectedLanguageCode, 'pa-IN');
  assert.equal(session.stage, 'AWAITING_SCHEME_CATEGORY');
});

test('POST /webhook accepts text alias for language selection (e.g. typing "4" for Marathi or "english")', async () => {
  const userPhone = '919999988888';
  sessionService.resetSession(userPhone);

  // Initialize session in awaiting language
  sessionService.updateSession(userPhone, { stage: 'AWAITING_LANGUAGE' });

  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '123456', phone_number_id: '123' },
              messages: [
                {
                  from: userPhone,
                  id: 'wamid.HBgLMTIzNDU2Nzk0',
                  timestamp: '1725619350',
                  text: { body: '4' }, // Alias for mr-IN (Marathi)
                  type: 'text',
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const payloadString = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', config.META_APP_SECRET);
  hmac.update(payloadString);
  const signature = `sha256=${hmac.digest('hex')}`;

  const res = await fetch(`${baseUrl}/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': signature,
    },
    body: payloadString,
  });

  assert.equal(res.status, 200);

  const session = sessionService.getSession(userPhone);
  assert.ok(session);
  assert.equal(session.selectedLanguageCode, 'mr-IN');
  assert.equal(session.stage, 'AWAITING_SCHEME_CATEGORY');
});

test('POST /webhook allows selecting English via interactive list (LANG_en-IN)', async () => {
  const englishUserPhone = '919111122222';
  sessionService.resetSession(englishUserPhone);

  const interactivePayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '123456', phone_number_id: '123' },
              messages: [
                {
                  from: englishUserPhone,
                  id: 'wamid.HBgLMTIzNDU2ODAw',
                  timestamp: '1725619360',
                  type: 'interactive',
                  interactive: {
                    type: 'list_reply',
                    list_reply: {
                      id: 'LANG_en-IN',
                      title: 'English',
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const payloadString = JSON.stringify(interactivePayload);
  const hmac = crypto.createHmac('sha256', config.META_APP_SECRET);
  hmac.update(payloadString);
  const signature = `sha256=${hmac.digest('hex')}`;

  const res = await fetch(`${baseUrl}/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': signature,
    },
    body: payloadString,
  });

  assert.equal(res.status, 200);

  const session = sessionService.getSession(englishUserPhone);
  assert.ok(session);
  assert.equal(session.selectedLanguageCode, 'en-IN');
  assert.equal(session.stage, 'AWAITING_SCHEME_CATEGORY');
});

test('POST /webhook handles scheme loan category button (LOAN_FARM)', async () => {
  const userPhone = '919876543210';

  const loanPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '123456', phone_number_id: '123' },
              messages: [
                {
                  from: userPhone,
                  id: 'wamid.HBgLMTIzNDU2Nzky',
                  timestamp: '1725619400',
                  type: 'interactive',
                  interactive: {
                    type: 'button_reply',
                    button_reply: {
                      id: 'LOAN_FARM',
                      title: 'ਖੇਤੀ ਕਰਜ਼ਾ',
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const payloadString = JSON.stringify(loanPayload);
  const hmac = crypto.createHmac('sha256', config.META_APP_SECRET);
  hmac.update(payloadString);
  const signature = `sha256=${hmac.digest('hex')}`;

  const res = await fetch(`${baseUrl}/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': signature,
    },
    body: payloadString,
  });

  assert.equal(res.status, 200);

  const session = sessionService.getSession(userPhone);
  assert.equal(session.stage, 'IN_CONVERSATION');
});

test('POST /webhook resets active session and restarts language list if user types Hi mid-session', async () => {
  const userPhone = '919876543210';

  // Ensure an active session exists
  sessionService.updateSession(userPhone, {
    selectedLanguageCode: 'pa-IN',
    stage: 'IN_CONVERSATION',
  });

  const activeSession = sessionService.getSession(userPhone);
  assert.equal(activeSession.stage, 'IN_CONVERSATION');
  assert.equal(activeSession.selectedLanguageCode, 'pa-IN');

  // User types "Hi" mid-session
  const greetingPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '123456', phone_number_id: '123' },
              messages: [
                {
                  from: userPhone,
                  id: 'wamid.HBgLMTIzNDU2Nzg5',
                  timestamp: '1725619600',
                  text: { body: 'Hi' },
                  type: 'text',
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const payloadString = JSON.stringify(greetingPayload);
  const hmac = crypto.createHmac('sha256', config.META_APP_SECRET);
  hmac.update(payloadString);
  const signature = `sha256=${hmac.digest('hex')}`;

  const res = await fetch(`${baseUrl}/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': signature,
    },
    body: payloadString,
  });

  assert.equal(res.status, 200);

  // Session restarted: stage must be AWAITING_LANGUAGE and language cleared
  const restartedSession = sessionService.getSession(userPhone);
  assert.ok(restartedSession);
  assert.equal(restartedSession.stage, 'AWAITING_LANGUAGE');
  assert.equal(restartedSession.selectedLanguageCode, null);
});

test('POST /webhook handles delivery/read status updates without error', async () => {
  const statusPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '123456', phone_number_id: '123' },
              statuses: [
                {
                  id: 'wamid.HBgLMTIzNDU2Nzg5',
                  status: 'read',
                  timestamp: '1725619500',
                  recipient_id: '919876543210',
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const payloadString = JSON.stringify(statusPayload);
  const hmac = crypto.createHmac('sha256', config.META_APP_SECRET);
  hmac.update(payloadString);
  const signature = `sha256=${hmac.digest('hex')}`;

  const res = await fetch(`${baseUrl}/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': signature,
    },
    body: payloadString,
  });

  assert.equal(res.status, 200);
});
