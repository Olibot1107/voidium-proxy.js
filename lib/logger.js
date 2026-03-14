const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const CURRENT_LEVEL = LEVELS[LOG_LEVEL] ?? LEVELS.info;

function log(level, message, meta) {
    const lvl = LEVELS[level] ?? LEVELS.info;
    if (lvl < CURRENT_LEVEL) return;
    const ts = new Date().toISOString();
    if (meta !== undefined) {
        console.log(`[${ts}] [${level}] ${message}`, meta);
    } else {
        console.log(`[${ts}] [${level}] ${message}`);
    }
}

function safeJson(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return String(value);
    }
}

function maskHeaders(headers) {
    const masked = { ...headers };
    if (masked.authorization) masked.authorization = '[redacted]';
    if (masked.cookie) masked.cookie = '[redacted]';
    if (masked['set-cookie']) masked['set-cookie'] = '[redacted]';
    return masked;
}

module.exports = {
    log,
    safeJson,
    maskHeaders
};
