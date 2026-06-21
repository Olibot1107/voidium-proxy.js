const http = require('http');
const net = require('net');
const express = require('express');
const { loadConfig, normalizeConfig } = require('./lib/config');
const { matchTarget } = require('./lib/routing');
const { log, maskHeaders } = require('./lib/logger');
const { parseCookies, buildWarningPage } = require('./lib/suspicion');
const { proxyRequest } = require('./lib/proxy');

const app = express();

const CONSENT_COOKIE = 'proxy_site_notice';
const CONSENT_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

let requestCounter = 0;

const { config, source: configSource } = loadConfig();
const normalizedConfig = normalizeConfig(config, configSource);

function resolveTarget(hostHeader) {
    const hostOnly = (hostHeader || '').split(':')[0].toLowerCase();
    const domaincut = hostOnly.endsWith(normalizedConfig.domaincut)
        ? hostOnly.slice(0, -normalizedConfig.domaincut.length)
        : '';
    return matchTarget(domaincut, normalizedConfig.targets);
}

app.use(async (req, res) => {
    const reqId = ++requestCounter;
    const start = Date.now();

    log('info', 'Incoming request', {
        id: reqId,
        method: req.method,
        url: req.originalUrl,
        host: req.get('host'),
        ip: req.ip
    });
    log('debug', 'Request headers', { id: reqId, headers: maskHeaders(req.headers) });

    const match = resolveTarget(req.get('host'));
    if (match.error) {
        log('warn', 'Target error', { id: reqId, error: match.error, host: req.get('host') });
        return res.status(404).send(match.error);
    }

    const { target, port } = match;

    if (Number.isInteger(target.portStart) && port < target.portStart) {
        log('warn', 'Port out of range (low)', { id: reqId, port, min: target.portStart, target: target.name });
        return res.status(400).send('Port out of range');
    }
    if (Number.isInteger(target.portEnd) && port > target.portEnd) {
        log('warn', 'Port out of range (high)', { id: reqId, port, max: target.portEnd, target: target.name });
        return res.status(400).send('Port out of range');
    }

    log('info', 'Routing decision', { id: reqId, target: target.name, host: target.host, port });

    if (req.path === '/__proxy-notice' && req.method === 'GET') {
        const nextParam = req.query?.next;
        const nextUrl = typeof nextParam === 'string' && nextParam.startsWith('/') ? nextParam : '/';
        log('info', 'Notice accepted', { id: reqId, target: target.name, next: nextUrl });
        res.cookie(CONSENT_COOKIE, '1', {
            maxAge: CONSENT_MAX_AGE,
            httpOnly: true,
            sameSite: 'lax',
            path: '/'
        });
        return res.redirect(302, nextUrl);
    }

    const cookies = parseCookies(req.headers.cookie || '');
    const hasConsent = cookies[CONSENT_COOKIE] === '1';

    res.on('finish', () => {
        log('info', 'Response sent', { id: reqId, status: res.statusCode, ms: Date.now() - start });
    });

    const scheme = target.scheme || 'http';
    return await proxyRequest(
        `${scheme}://${target.host}:${port}${req.originalUrl}`,
        req,
        res,
        reqId,
        { target, hasConsent }
    );
});

const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
    const match = resolveTarget(req.headers.host);
    if (match.error) {
        log('warn', 'WebSocket target error', { error: match.error, host: req.headers.host });
        socket.write('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n');
        socket.destroy();
        return;
    }

    const { target, port } = match;

    if (Number.isInteger(target.portStart) && port < target.portStart) {
        socket.write('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n');
        socket.destroy();
        return;
    }
    if (Number.isInteger(target.portEnd) && port > target.portEnd) {
        socket.write('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n');
        socket.destroy();
        return;
    }

    log('info', 'WebSocket upgrade', { url: req.url, target: target.name, host: target.host, port });

    const upstream = net.connect(port, target.host, () => {
        let reqHead = `${req.method} ${req.url} HTTP/1.1\r\n`;
        for (const [key, val] of Object.entries(req.headers)) {
            if (key.toLowerCase() === 'host') {
                reqHead += `host: ${target.host}:${port}\r\n`;
            } else {
                reqHead += `${key}: ${val}\r\n`;
            }
        }
        reqHead += '\r\n';
        upstream.write(reqHead);
        if (head && head.length) upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
    });

    upstream.on('error', (err) => {
        log('error', 'WebSocket upstream error', { error: String(err), target: target.name, port });
        try { socket.write('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n'); } catch (_) {}
        socket.destroy();
    });

    socket.on('error', () => upstream.destroy());
});

const PORT = Number(process.env.PORT) || 1234;
server.listen(PORT, () => {
    log('info', `Proxy listening on port ${PORT} using ${configSource}`);
});
