const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { log, maskHeaders, safeJson } = require('./logger');
const { isSuspiciousRequest, buildWarningPage } = require('./suspicion');

function buildForwardHeaders(req, targetHost) {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;
    // Avoid compressed responses that can mismatch streamed bodies.
    headers['accept-encoding'] = 'identity';
    headers['x-forwarded-host'] = req.get('host') || '';
    headers['x-forwarded-proto'] = req.protocol || 'http';
    headers['x-forwarded-for'] = req.ip || '';
    // Preserve the original host to satisfy upstream host checks.
    headers.host = req.get('host') || targetHost;
    return headers;
}

async function proxyRequest(url, req, res, reqId, context) {
    try {
        const targetHost = new URL(url).host;
        const headers = buildForwardHeaders(req, targetHost);
        const hasBody = !['GET', 'HEAD'].includes(req.method);
        const controller = null;

        log('info', 'Proxy request', { id: reqId, url, method: req.method, hasBody });
        log('debug', 'Upstream headers', { id: reqId, headers: maskHeaders(headers) });

        const response = await fetch(url, {
            method: req.method,
            headers,
            body: hasBody ? req : undefined,
            duplex: hasBody ? 'half' : undefined,
            signal: undefined
        });

        const contentType = response.headers.get('content-type') || '';
        const isHtml = contentType.toLowerCase().includes('text/html');
        const isPageRequest = req.method === 'GET' || req.method === 'HEAD';
        const suspicious = isSuspiciousRequest(req);
        const shouldWarn = isHtml && isPageRequest && suspicious && !context.hasConsent;

        if (shouldWarn) {
            log('warn', 'Suspicious page intercepted', {
                id: reqId,
                url,
                contentType,
                target: context.target.name
            });
            res.status(200);
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.setHeader('cache-control', 'no-store');
            return res.send(buildWarningPage({
                nextUrl: req.originalUrl,
                targetName: context.target.name
            }));
        }

        res.status(response.status);
        response.headers.forEach((value, key) => {
            const lower = key.toLowerCase();
            if (lower === 'content-encoding' || lower === 'content-length') {
                return;
            }
            if (key.toLowerCase() === 'set-cookie') {
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

        if (typeof res.flushHeaders === 'function') {
            res.flushHeaders();
        }

        if (response.body) {
            const debugBody = process.env.DEBUG_403 === '1' || process.env.DEBUG_UPSTREAM_BODY === '1';
            const shouldCapture = debugBody && response.status >= 400;
            const captureLimit = 2048;
            let captured = Buffer.alloc(0);

            const tap = shouldCapture ? new Transform({
                transform(chunk, _enc, cb) {
                    if (captured.length < captureLimit) {
                        const slice = chunk.slice(0, captureLimit - captured.length);
                        captured = Buffer.concat([captured, Buffer.from(slice)]);
                    }
                    cb(null, chunk);
                }
            }) : null;

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
        } else {
            res.end();
        }
    } catch (error) {
        const message = String(error);
        if (message.includes('AbortError') || message.includes('aborted')) {
            log('warn', 'Upstream timeout', { id: reqId, ms: Number(process.env.UPSTREAM_TIMEOUT_MS) || 15000 });
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
