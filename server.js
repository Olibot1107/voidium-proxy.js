const express = require('express');
const { loadConfig, normalizeConfig } = require('./lib/config');
const { matchTarget } = require('./lib/routing');
const { log, maskHeaders } = require('./lib/logger');
const { parseCookies, sanitizeCookieKey } = require('./lib/suspicion');
const { proxyRequest } = require('./lib/proxy');
const { initDb, getDomain } = require('./lib/customDomains');
const { findTargetByName } = require('./lib/targets');
const { buildAdminRouter } = require('./lib/admin');

const app = express();

const CONSENT_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const CONSENT_COOKIE_PREFIX = 'proxy_consent_';

let requestCounter = 0;

const { config, source: configSource } = loadConfig();
const normalizedConfig = normalizeConfig(config, configSource);

const masterToken = config.masterToken || config.admin?.masterToken || '';
const customDomainsDbPath = config.customDomainsDb || config.admin?.customDomainsDb;

async function main() {
    const { db, path: dbPath } = await initDb(customDomainsDbPath);

    log('info', 'Config loaded', { source: configSource, targets: normalizedConfig.targets.map(t => t.name) });
    log('info', 'Custom domains DB ready', { path: dbPath });

    app.use('/__proxy-admin', express.json({ limit: '100kb' }));
    app.use('/__proxy-admin', buildAdminRouter(db, normalizedConfig.targets, masterToken));

    app.use(async (req, res) => {
        const reqId = ++requestCounter;
        const start = Date.now();
        const hostHeader = req.get('host') || '';
        const hostOnly = hostHeader.split(':')[0].toLowerCase();

        log('info', 'Incoming request', {
            id: reqId,
            method: req.method,
            url: req.originalUrl,
            host: hostHeader,
            ip: req.ip
        });
        log('debug', 'Request headers', { id: reqId, headers: maskHeaders(req.headers) });

        let target = null;
        let port = null;
        let customDomain = false;

        const customEntry = await getDomain(db, hostOnly);
        if (customEntry) {
            target = findTargetByName(normalizedConfig.targets, customEntry.target);
            port = customEntry.port;
            customDomain = true;
        }

        if (!target) {
            const domaincut = hostOnly.endsWith(normalizedConfig.domaincut)
                ? hostOnly.slice(0, -normalizedConfig.domaincut.length)
                : '';

            const match = matchTarget(domaincut, normalizedConfig.targets);
            if (match.error) {
                log('warn', 'Target error', { id: reqId, error: match.error, host: hostOnly });
                return res.status(404).send(match.error);
            }

            target = match.target;
            port = match.port;
        }

        const cookies = parseCookies(req.headers.cookie || '');
        const consentKey = CONSENT_COOKIE_PREFIX + sanitizeCookieKey(target.name);
        const hasConsent = cookies[consentKey] === '1';

        if (Number.isInteger(target.portStart) && port < target.portStart) {
            log('warn', 'Port out of range (low)', { id: reqId, port, min: target.portStart, target: target.name });
            return res.status(400).send('Port out of range');
        }
        if (Number.isInteger(target.portEnd) && port > target.portEnd) {
            log('warn', 'Port out of range (high)', { id: reqId, port, max: target.portEnd, target: target.name });
            return res.status(400).send('Port out of range');
        }

        log('info', 'Routing decision', { id: reqId, target: target.name, host: target.host, port, customDomain });

        res.on('finish', () => {
            const ms = Date.now() - start;
            log('info', 'Response sent', {
                id: reqId,
                status: res.statusCode,
                ms
            });
        });

        if (req.path === '/__proxy-consent' && req.method === 'GET') {
            const nextParam = req.query?.next;
            const nextUrl = typeof nextParam === 'string' && nextParam.startsWith('/')
                ? nextParam
                : '/';
            log('info', 'Consent accepted', { id: reqId, target: target.name, next: nextUrl });
            res.cookie(consentKey, '1', {
                maxAge: CONSENT_MAX_AGE_SECONDS * 1000,
                httpOnly: true,
                sameSite: 'lax',
                path: '/'
            });
            return res.redirect(302, nextUrl);
        }

        const scheme = target.scheme || 'http';
        return await proxyRequest(
            `${scheme}://${target.host}:${port}${req.originalUrl}`,
            req,
            res,
            reqId,
            { target, hasConsent }
        );
    });

    const PORT = Number(process.env.PORT) || 1234;
    app.listen(PORT, () => {
        log('info', `Proxy listening on port ${PORT} using ${configSource}`);
    });
}

main().catch((err) => {
    log('error', 'Fatal startup error', { error: String(err) });
    process.exit(1);
});
