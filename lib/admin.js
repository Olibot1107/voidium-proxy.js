const express = require('express');
const { listDomains, setDomain, removeDomain, normalizeDomain } = require('./customDomains');
const { log } = require('./logger');

function parseAuthToken(req) {
    const header = req.headers['authorization'] || '';
    if (header.toLowerCase().startsWith('bearer ')) {
        return header.slice(7).trim();
    }
    return req.headers['x-master-token'] || '';
}

function buildAdminRouter(db, targets, masterToken) {
    const router = express.Router();

    router.use((req, res, next) => {
        if (!masterToken) {
            return res.status(500).send('masterToken not configured in config.json.');
        }
        const token = parseAuthToken(req);
        if (!token || token !== masterToken) {
            return res.status(401).send('Unauthorized');
        }
        return next();
    });

    router.get('/domains', async (req, res) => {
        const domains = await listDomains(db);
        return res.json({ domains });
    });

    router.post('/domains', async (req, res) => {
        const domain = normalizeDomain(req.body?.domain);
        const targetName = String(req.body?.target || '').trim();
        const port = parseInt(req.body?.port, 10);
        const target = targets.find(t => t.name === targetName);

        if (!domain) return res.status(400).send('domain is required');
        if (!targetName) return res.status(400).send('target is required');
        if (!target) return res.status(400).send('target not found');
        if (Number.isNaN(port)) return res.status(400).send('port is required');

        await setDomain(db, domain, { target: targetName, port });
        log('info', 'Custom domain set', { domain, target: targetName, port });
        return res.status(201).json({ ok: true, domain, target: targetName, port });
    });

    router.delete('/domains', async (req, res) => {
        const domain = normalizeDomain(req.body?.domain);
        if (!domain) return res.status(400).send('domain is required');
        const removed = await removeDomain(db, domain);
        if (!removed) return res.status(404).send('domain not found');
        log('info', 'Custom domain removed', { domain });
        return res.json({ ok: true, domain });
    });

    return router;
}

module.exports = {
    buildAdminRouter
};
