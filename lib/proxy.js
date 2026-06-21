const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { Agent } = require('undici');
const { log, maskHeaders, safeJson } = require('./logger');
const { buildWarningPage } = require('./suspicion');

const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS) || 30000;

const HOP_BY_HOP = new Set([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade'
]);

function buildForwardHeaders(req, targetHost, target) {
    const headers = {};
    for (const [key, val] of Object.entries(req.headers)) {
        if (HOP_BY_HOP.has(key.toLowerCase())) continue;
        headers[key] = val;
    }
    headers['accept-encoding'] = 'identity';
    headers['x-forwarded-host'] = req.get('host') || '';
    headers['x-forwarded-proto'] = req.get('x-forwarded-proto') || req.protocol || 'http';
    headers['x-forwarded-for'] = req.get('x-forwarded-for') || req.ip || '';
    const preserveHost = target?.preserveHost === true;
    headers.host = preserveHost ? (req.get('host') || targetHost) : targetHost;
    return headers;
}

async function proxyRequest(url, req, res, reqId, context) {
    try {
        const urlObj = new URL(url);
        const targetHost = urlObj.host;
        const headers = buildForwardHeaders(req, targetHost, context.target);
        const hasBody = !['GET', 'HEAD'].includes(req.method);

        log('info', 'Proxy request', { id: reqId, url, method: req.method, hasBody });
        log('debug', 'Upstream headers', { id: reqId, headers: maskHeaders(headers) });

        const isHttps = urlObj.protocol === 'https:';
        const tlsInsecure = context.target?.tlsInsecure === true;
        const dispatcher = isHttps && tlsInsecure
            ? new Agent({ connect: { rejectUnauthorized: false, servername: urlObj.hostname } })
            : undefined;

        const signal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
        const response = await fetch(url, {
            method: req.method,
            headers,
            body: hasBody ? req : undefined,
            duplex: hasBody ? 'half' : undefined,
            signal,
            dispatcher
        });

        const contentType = response.headers.get('content-type') || '';
        const isHtml = contentType.toLowerCase().includes('text/html');
        const isPageRequest = req.method === 'GET' || req.method === 'HEAD';
        const isBrowser = (req.headers['user-agent'] || '').includes('Mozilla');
        const shouldWarn = isHtml && isPageRequest && isBrowser && !context.hasConsent;

        if (shouldWarn) {
            log('info', 'Showing proxy notice page', { id: reqId, url, target: context.target.name });
            response.body?.cancel().catch(() => {});
            res.status(200);
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.setHeader('cache-control', 'no-store');
            return res.send(buildWarningPage({
                nextUrl: req.originalUrl,
                targetName: context.target.name,
                noticeRoute: '/__proxy-notice'
            }));
        }

        res.status(response.status);
        response.headers.forEach((value, key) => {
            const lower = key.toLowerCase();
            if (lower === 'content-encoding' || lower === 'content-length') return;
            if (lower === 'set-cookie') {
                const cookies = response.headers.getSetCookie
                    ? response.headers.getSetCookie()
                    : [value];
                res.setHeader('set-cookie', cookies);
            } else {
                res.setHeader(key, value);
            }
        });

        log('info', 'Upstream response', {
            id: reqId,
            status: response.status,
            headers: maskHeaders(safeJson(Object.fromEntries(response.headers.entries())))
        });

        if (typeof res.flushHeaders === 'function') res.flushHeaders();

        if (response.body) {
            const debugBody = process.env.DEBUG_403 === '1' || process.env.DEBUG_UPSTREAM_BODY === '1';
            const shouldCapture = debugBody && response.status >= 400;
            const captureLimit = 2048;
            let captured = Buffer.alloc(0);

            const tap = shouldCapture ? new Transform({
                transform(chunk, _enc, cb) {
                    if (captured.length < captureLimit) {
                        captured = Buffer.concat([captured, Buffer.from(chunk.subarray(0, captureLimit - captured.length))]);
                    }
                    cb(null, chunk);
                }
            }) : null;

            try {
                if (tap) {
                    await pipeline(Readable.fromWeb(response.body), tap, res);
                    if (captured.length > 0) {
                        log('warn', 'Upstream error body (truncated)', {
                            id: reqId,
                            status: response.status,
                            body: captured.toString('utf8')
                        });
                    }
                } else {
                    await pipeline(Readable.fromWeb(response.body), res);
                }
            } catch (pipeErr) {
                if (!res.writableEnded) {
                    log('warn', 'Stream pipeline interrupted', { id: reqId, error: String(pipeErr) });
                }
            }
        } else {
            res.end();
        }
    } catch (error) {
        const message = String(error);
        const isTimeout = message.includes('TimeoutError') || message.includes('AbortError') || message.includes('aborted');
        if (res.headersSent) return;
        if (isTimeout) {
            log('warn', 'Upstream timeout', { id: reqId, ms: UPSTREAM_TIMEOUT_MS });
            res.status(504).set('content-type', 'text/plain').send('Upstream timeout.');
        } else {
            log('error', 'Fetch error', { id: reqId, error: message });
            res.status(502).set('content-type', 'text/plain').send('Upstream fetch error.');
        }
    }
}

module.exports = {
    buildForwardHeaders,
    proxyRequest
};
