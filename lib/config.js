const fs = require('fs');
const path = require('path');

function loadConfig() {
    const candidates = ['config.json', 'eg.config.json'];
    for (const filename of candidates) {
        const fullPath = path.resolve(__dirname, '..', filename);
        if (fs.existsSync(fullPath)) {
            const raw = fs.readFileSync(fullPath, 'utf8');
            return { config: JSON.parse(raw), source: fullPath };
        }
    }
    throw new Error('Missing config.json (or eg.config.json).');
}

function normalizeConfig(config, source) {
    if (!config || typeof config !== 'object') {
        throw new Error(`Invalid config in ${source}.`);
    }
    if (typeof config.domaincut !== 'string' || config.domaincut.length === 0) {
        throw new Error(`Invalid domaincut in ${source}.`);
    }
    const targets = [];
    if (config.targets && typeof config.targets === 'object') {
        if (Array.isArray(config.targets)) {
            for (const entry of config.targets) {
                targets.push(entry);
            }
        } else {
            for (const [name, entry] of Object.entries(config.targets)) {
                targets.push({ name, ...entry });
            }
        }
    } else if (config.pyro && typeof config.pyro === 'object') {
        targets.push({ name: 'pyro', ...config.pyro });
    } else {
        throw new Error(`Missing targets config in ${source}.`);
    }

    for (const target of targets) {
        if (!target || typeof target !== 'object') {
            throw new Error(`Invalid target in ${source}.`);
        }
        if (typeof target.name !== 'string' || target.name.length === 0) {
            throw new Error(`Invalid target name in ${source}.`);
        }
        if (target.scheme !== undefined) {
            if (typeof target.scheme !== 'string' || !['http', 'https'].includes(target.scheme)) {
                throw new Error(`Invalid ${target.name}.scheme in ${source}.`);
            }
        }
        if (target.letter !== undefined) {
            if (typeof target.letter !== 'string' || target.letter.length !== 1) {
                throw new Error(`Invalid ${target.name}.letter in ${source}.`);
            }
        }
        if (typeof target.host !== 'string' || target.host.length === 0) {
            throw new Error(`Invalid ${target.name}.host in ${source}.`);
        }
        if (target.preserveHost !== undefined && typeof target.preserveHost !== 'boolean') {
            throw new Error(`Invalid ${target.name}.preserveHost in ${source}.`);
        }
        if (target.tlsInsecure !== undefined && typeof target.tlsInsecure !== 'boolean') {
            throw new Error(`Invalid ${target.name}.tlsInsecure in ${source}.`);
        }
        if (target.portStart !== undefined && !Number.isInteger(target.portStart)) {
            throw new Error(`Invalid ${target.name}.portStart in ${source}.`);
        }
        if (target.portEnd !== undefined && !Number.isInteger(target.portEnd)) {
            throw new Error(`Invalid ${target.name}.portEnd in ${source}.`);
        }
    }

    return { domaincut: config.domaincut, targets };
}

module.exports = {
    loadConfig,
    normalizeConfig
};
