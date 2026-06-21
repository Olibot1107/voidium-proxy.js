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

function buildWarningPage({ nextUrl, targetName, noticeRoute }) {
    const safeNext = nextUrl.replace(/"/g, '&quot;');
    const route = noticeRoute || '/__proxy-notice';
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>heads up</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0d0e12;
      color: #d4d4d8;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 520px;
      background: #111318;
      border: 1px solid #1e2028;
      border-radius: 16px;
      padding: 36px 32px 28px;
    }
    .icon {
      width: 36px;
      height: 36px;
      background: #1c1a10;
      border: 1px solid #3a3010;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      margin-bottom: 20px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 17px;
      font-weight: 600;
      color: #f0f0f2;
      letter-spacing: -0.01em;
    }
    p {
      margin: 0 0 10px;
      font-size: 13.5px;
      line-height: 1.65;
      color: #8a8a96;
    }
    .note {
      margin-top: 20px;
      padding: 12px 14px;
      background: #16171d;
      border: 1px solid #1e2028;
      border-radius: 10px;
      font-size: 12.5px;
      color: #5a5a66;
      line-height: 1.5;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 22px;
    }
    .btn {
      flex: 1;
      display: block;
      text-align: center;
      padding: 10px 16px;
      border-radius: 9px;
      font-size: 13.5px;
      font-weight: 500;
      text-decoration: none;
      transition: opacity .15s;
    }
    .btn:hover { opacity: .85; }
    .btn-go { background: #f0f0f2; color: #0d0e12; }
    .btn-back { background: #1a1b21; color: #8a8a96; border: 1px solid #1e2028; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>This isn't an official site</h1>
    <p>You're going through a proxy run by a regular person, not the people behind <strong style="color:#c4c4cc">${targetName}</strong>. It's not affiliated with or endorsed by them in any way.</p>
    <p>Your traffic passes through whoever's running this before it hits the real service, so don't put in passwords or anything sensitive unless you're cool with that.</p>
    <div class="note">You won't see this again for 30 days.</div>
    <div class="actions">
      <a class="btn btn-go" href="${route}?next=${encodeURIComponent(safeNext)}">Got it, take me in</a>
      <a class="btn btn-back" href="javascript:history.back()">Go back</a>
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
    parseCookies,
    sanitizeCookieKey,
    buildWarningPage
};
