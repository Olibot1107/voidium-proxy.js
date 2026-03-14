function parseCookies(cookieHeader) {
    if (!cookieHeader) return {};
    const out = {};
    const parts = cookieHeader.split(';');
    for (const part of parts) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (!key) continue;
        out[key] = value;
    }
    return out;
}

function sanitizeCookieKey(value) {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function isSuspiciousRequest(req) {
    const path = req.path || '';
    const query = req.originalUrl?.split('?')[1] || '';
    const host = req.get('host') || '';
    const ua = req.headers['user-agent'] || '';

    const keywords = [
        'login', 'signin', 'verify', 'account', 'password',
        'reset', 'secure', 'update', 'wallet', 'bank', 'crypto'
    ];

    const lowerPath = path.toLowerCase();
    const hasKeyword = keywords.some(k => lowerPath.includes(k));
    const longQuery = query.length > 120;
    const longPath = path.length > 120;
    const manyDigits = (host.match(/\d/g) || []).length >= 5;
    const missingUA = ua.length === 0;

    return hasKeyword || longQuery || longPath || manyDigits || missingUA;
}

function buildWarningPage({ nextUrl, targetName }) {
    const safeNext = nextUrl.replace(/"/g, '&quot;');
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Safety Warning</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 24px; background: #0b0c10; color: #e8e8e8; }
    .card { max-width: 720px; margin: 48px auto; background: #14161c; border: 1px solid #2a2d36; border-radius: 12px; padding: 24px; }
    h1 { margin: 0 0 12px; font-size: 22px; }
    p { margin: 0 0 16px; line-height: 1.5; }
    .meta { font-size: 12px; color: #a6a6a6; margin-bottom: 16px; }
    .btn { display: inline-block; padding: 12px 16px; background: #1f6feb; color: #fff; text-decoration: none; border-radius: 8px; }
    .btn:focus { outline: 2px solid #fff; outline-offset: 2px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Heads up</h1>
    <p>This page was flagged as potentially risky. If you trust it, you can continue. You’ll only see this warning once every 30 days for this target.</p>
    <div class="meta">Target: ${targetName}</div>
    <a class="btn" href="/__proxy-consent?next=${encodeURIComponent(safeNext)}">I understand, continue</a>
  </div>
</body>
</html>`;
}

module.exports = {
    parseCookies,
    sanitizeCookieKey,
    isSuspiciousRequest,
    buildWarningPage
};
