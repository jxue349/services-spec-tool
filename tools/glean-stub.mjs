/**
 * Local stand-in for Glean's POST /rest/api/v1/chat.
 *
 * Dev/demo only — never imported by the app. It lets you exercise the whole
 * compile path (routes, lib/glean.ts, the UI) with no Glean token and no
 * quota burn, which also makes the demo rehearsable offline.
 *
 *   npm run stub:glean
 *   # then, in .env:
 *   GLEAN_API_KEY=local-stub-token
 *   GLEAN_BASE_URL=http://127.0.0.1:3399
 *
 * It replies the way a chat assistant actually does — prose wrapped around a
 * ```json fence — so the extraction pipeline is genuinely under test rather
 * than being handed clean JSON.
 *
 * GET /__log returns what it received (agent, headers, prompt facts), which is
 * how you confirm agent: "GPT" is really going over the wire.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.STUB_PORT ?? 3399);
const log = [];

const TESTS = {
  tests: [
    {
      id: 'T-01',
      scenario: 'Renewal payment fails on a website-purchased Cam Unlimited',
      expected: 'No grace period is granted; the subscription expires at period end',
      priority: 'P1',
      rules: ['LIFE-015'],
      inPrototype: false,
    },
    {
      id: 'T-02',
      scenario: 'Account holds Cam Unlimited while a device holds Cam Plus via iOS IAP',
      expected: 'Device resolves to Cam Unlimited; both subscriptions continue to bill',
      priority: 'P1',
      rules: ['TIER-001', 'ENT-005'],
      inPrototype: false,
    },
    {
      id: 'T-03',
      scenario: 'Retail-activated Cam Plus reaches the end of its term',
      expected: 'Entitlement expires with no renewal attempt and no charge',
      priority: 'P2',
      rules: ['ADDON-011'],
      inPrototype: false,
    },
    {
      id: 'T-04',
      scenario: 'User cancels a website annual plan mid-term',
      expected: 'Entitlement persists until the end of the paid period',
      priority: 'P2',
      rules: ['LIFE-002'],
      inPrototype: true,
    },
    {
      id: 'T-05',
      scenario: 'User opens Services page for an Android IAP subscription',
      expected: 'Page deep-links to Google Play rather than managing in place',
      priority: 'P3',
      rules: ['LIFE-009'],
      inPrototype: true,
    },
  ],
};

const STATES = {
  states: ['Active', 'Cancelled pending expiry', 'Expired', 'Renewing', 'Grace period', 'Refunded'],
  transitions: [
    { from: 'Active', to: 'Cancelled pending expiry', event: 'user cancels', rules: ['LIFE-002'], note: 'Entitlement persists to period end.' },
    { from: 'Cancelled pending expiry', to: 'Expired', event: 'paid period ends', rules: ['LIFE-002'], note: '' },
    { from: 'Active', to: 'Renewing', event: 'renewal due', rules: [], note: 'Spec does not define what triggers Renewing.' },
    { from: 'Renewing', to: 'Grace period', event: 'renewal payment fails (IAP only)', rules: ['LIFE-015'], note: 'Spec does not define the website equivalent.' },
    { from: 'Grace period', to: 'Expired', event: '16 days elapse', rules: ['LIFE-015'], note: '' },
    { from: 'Active', to: 'Refunded', event: 'refund issued', rules: ['LIFE-015'], note: 'Revoked immediately.' },
  ],
};

const CONSISTENCY = {
  headline: 'LIFE-015 is the highest-risk rule: no prototype flow reaches a plan change.',
  findings: [
    { rule: 'TIER-001', summary: 'Account entitlement covers all devices', prototype: 'covered', qa: 'covered', note: 'Website purchase flow exercises it.' },
    { rule: 'LEGACY-102', summary: 'Higher entitlement wins on overlap', prototype: 'partial', qa: 'covered', note: 'Upgrade flow shows the swap but never the dual-billing state.' },
    { rule: 'DUP-001', summary: 'No duplicate cross-channel entitlement', prototype: 'missing', qa: 'missing', note: 'No flow attempts a duplicate purchase.' },
    { rule: 'ADDON-011', summary: 'Retail activation, no billing or renewal', prototype: 'missing', qa: 'covered', note: 'Retail redemption is not in the prototype.' },
    { rule: 'LIFE-002', summary: 'Cancel keeps entitlement to period end', prototype: 'covered', qa: 'covered', note: '' },
    { rule: 'LIFE-015', summary: '16-day grace period, IAP only', prototype: 'missing', qa: 'covered', note: 'Nothing reaches a failed renewal.' },
    { rule: 'LIFE-015', summary: 'Refund revokes immediately', prototype: 'missing', qa: 'missing', note: '' },
    { rule: 'LIFE-009', summary: 'Manage in purchase channel', prototype: 'covered', qa: 'covered', note: '' },
  ],
};

const CONFLICTS = {
  headline: 'The child spec contradicts the parent on grace-period length (16 vs 30 days).',
  findings: [
    {
      kind: 'contradiction',
      childRule: 'PROAI-002',
      parentRule: 'LIFE-015',
      summary: 'Child grants a 30-day grace period; the parent grants 16 days, IAP only.',
      recommendation: 'Spec owners must decide which length is correct before this can merge.',
    },
    {
      kind: 'addition',
      childRule: 'PROAI-001',
      parentRule: null,
      summary: 'Parent is silent on per-device upsell prompts.',
      recommendation: 'Safe to merge into the parent as a new rule.',
    },
    {
      kind: 'duplicate',
      childRule: 'PROAI-004',
      parentRule: 'TIER-001',
      summary: 'Restates account-level coverage, which the parent already defines.',
      recommendation: 'Nothing to merge.',
    },
  ],
  proposedAdditions: [
    {
      ruleId: 'PROAI-001',
      markdown: '- **PROAI-001** — A device-level upsell prompt is shown at most once per billing period.',
    },
  ],
};

const WHAT_IF = {
  answer: 'Voluntary cancellation is not a refund; the entitlement runs to period end (LIFE-015).',
  rules: ['LIFE-015', 'LIFE-015'],
  specGap: 'The spec does not say whether unused grace-period days are refunded pro rata.',
};

const SCENARIO = {
  accountSummary: 'Cam Unlimited at account level covers every eligible camera on the account.',
  devices: [
    { name: 'Cam v3 (kitchen)', effectiveEntitlement: 'Cam Unlimited', why: 'Account-level coverage applies and the higher entitlement wins over the device-level Cam Plus. Both continue to bill.', rules: ['TIER-001', 'ENT-005'] },
    { name: 'Cam Pan v3 (porch)', effectiveEntitlement: 'Cam Unlimited', why: 'Covered by the account-level entitlement with no device-level subscription of its own.', rules: ['TIER-001'] },
  ],
  notes: 'The device is billed twice until the Cam Plus subscription is cancelled in the App Store (ENT-005).',
};

/** Route on the task line each prompt builder emits. */
function replyFor(prompt) {
  if (prompt.includes('compile a QA test matrix')) return TESTS;
  if (prompt.includes('lifecycle state machine')) return STATES;
  if (prompt.includes('check the spec against the prototype')) return CONSISTENCY;
  if (prompt.includes('what the parent must change')) return CONFLICTS;
  if (prompt.includes('answer a what-if question')) return WHAT_IF;
  return SCENARIO;
}

const server = createServer((req, res) => {
  if (req.url === '/__log') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(log, null, 2));
    return;
  }

  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    let parsed = {};
    try {
      parsed = JSON.parse(body || '{}');
    } catch {
      // fall through with an empty prompt
    }
    const prompt = parsed.messages?.[0]?.fragments?.[0]?.text ?? '';

    log.push({
      at: new Date().toISOString(),
      url: req.url,
      authorization: req.headers.authorization ? 'Bearer [present]' : null,
      actAs: req.headers['x-glean-actas'] ?? null,
      agentConfig: parsed.agentConfig,
      saveChat: parsed.saveChat,
      promptBytes: prompt.length,
      promptHasSpec: prompt.includes('<spec>'),
      promptForbidsOtherSources: prompt.includes('Do not use any other company document'),
    });

    const text =
      'Sure — here is the compiled result:\n\n```json\n' +
      JSON.stringify(replyFor(prompt)) +
      '\n```\n\nLet me know if you want it narrowed down.';

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        messages: [
          { author: 'GLEAN_AI', messageType: 'UPDATE', fragments: [{ text: 'Working on it…' }] },
          { author: 'GLEAN_AI', messageType: 'CONTENT', fragments: [{ text }] },
        ],
      }),
    );
  });
});

// The common case is starting a second copy while one is already running.
// An unhandled 'error' event dumps a stack trace for that, which reads like a
// bug in the tool rather than "it's already up".
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use — the stub is probably already running.`);
    console.error('Either use the one that is up, or:');
    console.error(`  lsof -ti:${PORT} | xargs kill      # stop it`);
    console.error(`  STUB_PORT=3400 npm run stub:glean  # or run on another port`);
    process.exit(1);
  }
  console.error(`Glean stub failed to start: ${err.message}`);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Glean stub listening on http://127.0.0.1:${PORT}`);
  console.log(`Set GLEAN_BASE_URL=http://127.0.0.1:${PORT} and GLEAN_API_KEY=local-stub-token`);
  console.log(`Inspect what the app sent: curl -s http://127.0.0.1:${PORT}/__log`);
});

// Ctrl-C should free the port immediately rather than leaving it held.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
