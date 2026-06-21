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
  <title>Proxy Notice</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; margin: 0; padding: 24px; background: #0b0c10; color: #e8e8e8; }
    .card { max-width: 680px; margin: 60px auto; background: #14161c; border: 1px solid #2a2d36; border-radius: 14px; padding: 32px; }
    .badge { display: inline-block; background: #2d1f00; color: #e8a020; font-size: 12px; font-weight: 600; letter-spacing: .5px; padding: 4px 10px; border-radius: 6px; margin-bottom: 18px; text-transform: uppercase; }
    h1 { margin: 0 0 14px; font-size: 20px; font-weight: 600; }
    p { margin: 0 0 14px; line-height: 1.6; color: #c0c0c8; font-size: 14px; }
    .meta { font-size: 12px; color: #666; margin: 18px 0; border-top: 1px solid #2a2d36; padding-top: 14px; }
    .actions { display: flex; gap: 10px; margin-top: 22px; flex-wrap: wrap; }
    .btn-primary { display: inline-block; padding: 11px 20px; background: #1f6feb; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500; }
    .btn-primary:hover { background: #2a7fff; }
    .btn-secondary { display: inline-block; padding: 11px 20px; background: transparent; color: #888; text-decoration: none; border-radius: 8px; font-size: 14px; border: 1px solid #2a2d36; }
    .btn-secondary:hover { color: #ccc; border-color: #444; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Unofficial Proxy</div>
    <h1>This is not an official website</h1>
    <p>
      You are accessing <strong>${targetName}</strong> through a <strong>user-run proxy server</strong>.
      This site is not operated by or affiliated with the official service — it is hosted and managed by a private individual.
    </p>
    <p>
      Your connection goes through a third-party server before reaching the destination.
      Do not enter sensitive credentials or personal information unless you trust the proxy operator.
    </p>
    <div class="meta">Proxy target: ${targetName} &nbsp;·&nbsp; You won't see this notice again for 30 days.</div>
    <div class="actions">
      <a class="btn-primary" href="${route}?next=${encodeURIComponent(safeNext)}">I understand, continue</a>
      <a class="btn-secondary" href="javascript:history.back()">Go back</a>
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
