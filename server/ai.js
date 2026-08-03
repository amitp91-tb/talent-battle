// ai.js — optional AI features via the Anthropic Claude API (Messages API).
// Uses Node's built-in https so the ZERO-npm-dependency rule is preserved.
// Enabled only when ANTHROPIC_API_KEY is set in the environment; otherwise every
// call returns null and callers fall back to the static complexity we already store.
//
// Env:
//   ANTHROPIC_API_KEY  — required to enable AI features (never commit this)
//   TB_AI_MODEL        — optional model override (default: claude-haiku-4-5)
const https = require('https');

const MODEL = process.env.TB_AI_MODEL || 'claude-haiku-4-5';
const key = () => process.env.ANTHROPIC_API_KEY || '';
const enabled = () => !!key();

// One raw call to POST /v1/messages. Resolves the concatenated text, or rejects.
function callClaude({ system, user, maxTokens = 600, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    if (!key()) return reject(new Error('no_api_key'));
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key(),
        'anthropic-version': '2023-06-01',
        'content-length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('api_' + res.statusCode + ': ' + data.slice(0, 200)));
        try {
          const j = JSON.parse(data);
          const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
          resolve(text);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.write(body); req.end();
  });
}

// Pull the first {...} JSON object out of a model reply (tolerates ``` fences / stray prose).
function extractJson(text) {
  if (!text) return null;
  let t = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  try { return JSON.parse(t); } catch { return null; }
}

// #7 — estimate time/space complexity with an explanation + suggestions.
async function analyzeComplexity({ language, code, title, statement }) {
  const system = 'You are a precise algorithm-complexity analyst for a coding-education platform. '
    + 'Given a student solution, estimate its Big-O time and space complexity in terms of the main input size n, '
    + 'and give a short, correct, encouraging explanation plus concrete optimization suggestions. '
    + 'Account for loops, recursion, sorting, and data-structure operations. Respond ONLY with a JSON object, no prose.';
  const user = `Problem: ${title || ''}\n`
    + (statement ? `Statement: ${String(statement).slice(0, 600)}\n` : '')
    + `Language: ${language}\nStudent code:\n\`\`\`\n${String(code).slice(0, 6000)}\n\`\`\`\n\n`
    + 'Return JSON with keys: time (e.g. "O(n log n)"), space (e.g. "O(n)"), confidence (integer 0-100), '
    + 'explanation (2-4 sentences), suggestions (array of 0-3 short strings; empty if already optimal). '
    + 'Output only the JSON object.';
  const text = await callClaude({ system, user, maxTokens: 600 });
  const j = extractJson(text);
  if (!j || !j.time) throw new Error('parse_failed');
  return {
    time: String(j.time).slice(0, 40),
    space: String(j.space || '').slice(0, 40),
    confidence: Math.max(0, Math.min(100, parseInt(j.confidence, 10) || 0)),
    explanation: String(j.explanation || '').slice(0, 800),
    suggestions: Array.isArray(j.suggestions) ? j.suggestions.slice(0, 3).map((s) => String(s).slice(0, 200)) : [],
    model: MODEL,
  };
}

module.exports = { enabled, model: () => MODEL, analyzeComplexity, callClaude, extractJson };
