function parsePortFromSuffix(suffix) {
    if (!suffix) return null;
    const trimmed = suffix.replace(/^[-_.]/, '');
    const port = parseInt(trimmed, 10);
    return Number.isNaN(port) ? null : port;
}

function matchTarget(domaincut, targets) {
    if (!domaincut) {
        return { error: 'No target specified.' };
    }

    for (const target of targets) {
        if (target.letter && domaincut.startsWith(target.letter)) {
            const port = parsePortFromSuffix(domaincut.slice(1));
            if (port !== null) {
                return { target, port };
            }
        }
        if (domaincut.startsWith(target.name)) {
            const port = parsePortFromSuffix(domaincut.slice(target.name.length));
            if (port !== null) {
                return { target, port };
            }
        }
    }

    if (targets.length === 1) {
        const target = targets[0];
        const port = parsePortFromSuffix(domaincut);
        if (port !== null) {
            return { target, port };
        }
    }

    return { error: 'Target not matched.' };
}

module.exports = {
    parsePortFromSuffix,
    matchTarget
};
