const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeLog } = require('../src/sanitizer/logSanitizer');

const cases = [
  ['Bearer token', 'Authorization: Bearer demoToken123', 'Authorization: Bearer [REDACTED]'],
  ['Basic authorization', 'Authorization: Basic ZGVtbzpkZW1v', 'Authorization: Basic [REDACTED]'],
  ['standalone Bearer', 'Bearer demoToken123', 'Bearer [REDACTED]'],
  ['opaque authorization', 'Authorization: demoToken123', 'Authorization: [REDACTED]'],
  ['password equals', 'password=demoSecret123', 'password=[REDACTED]'],
  ['password colon', 'password: demoSecret123', 'password: [REDACTED]'],
  ['pwd equals', 'pwd=demoSecret123', 'pwd=[REDACTED]'],
  ['api_key', 'api_key=demoKey123', 'api_key=[REDACTED]'],
  ['apikey', 'apikey=demoKey123', 'apikey=[REDACTED]'],
  ['api-key', 'api-key: demoKey123', 'api-key: [REDACTED]'],
  ['JWT-like token', 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiMTIzIn0.signature', '[REDACTED]'],
  ['case-insensitive authorization', 'AUTHORIZATION: bEaReR demoToken123', 'AUTHORIZATION: bEaReR [REDACTED]'],
  ['case-insensitive Basic', 'authorization: BASIC demoToken123', 'authorization: BASIC [REDACTED]'],
  ['case-insensitive password', 'PASSWORD=demoSecret123', 'PASSWORD=[REDACTED]'],
  ['case-insensitive pwd', 'PwD: demoSecret123', 'PwD: [REDACTED]'],
  ['case-insensitive API key', 'API_KEY=demoKey123 ApiKey: demoKey456 API-KEY=demoKey789', 'API_KEY=[REDACTED] ApiKey: [REDACTED] API-KEY=[REDACTED]'],
  ['double-quoted value', 'password="demo secret" ERROR connection refused', 'password="[REDACTED]" ERROR connection refused'],
  ['single-quoted value', "pwd='demo secret'", "pwd='[REDACTED]'"],
  ['JSON-style fields', '{"password":"demo secret","api_key":"demoKey"}', '{"password":"[REDACTED]","api_key":"[REDACTED]"}'],
  ['multiple assignments', 'password=demoSecret; api_key=demoKey, pwd=demoPwd', 'password=[REDACTED]; api_key=[REDACTED], pwd=[REDACTED]'],
  ['non-sensitive line', 'INFO Loaded 12 records successfully', 'INFO Loaded 12 records successfully'],
  ['diagnostic context', 'ERROR authentication failed password=demoSecret; connection refused', 'ERROR authentication failed password=[REDACTED]; connection refused'],
  ['empty input', '', ''],
  ['no value on following line', 'password:\nERROR connection refused', 'password:\nERROR connection refused']
];

for (const [label, input, expected] of cases) {
  test(`sanitizes ${label}`, () => {
    assert.equal(sanitizeLog(input), expected);
    assert.equal(sanitizeLog(expected), expected, 'Sanitization should be idempotent');
  });
}

test('preserves blank lines, whitespace, and original line endings', () => {
  const input = 'INFO starting\r\n\r\n  ERROR password=demoSecret\r\nINFO finished\r\n';
  assert.equal(sanitizeLog(input), 'INFO starting\r\n\r\n  ERROR password=[REDACTED]\r\nINFO finished\r\n');
});