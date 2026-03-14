# voidium-proxy

A lightweight HTTP proxy that routes requests based on the host name, with per-target ports, safety warnings for suspicious pages, verbose structured logging, and an admin API for custom domains.

## How It Routes

The proxy looks at the incoming `Host` header, removes a configured suffix (`domaincut`), and then matches the remaining prefix to a target name (or a target letter). It then extracts a port from the remainder and proxies to the configured target host.

Example with `domaincut: ".voidium.uk"`:

- `p3000.voidium.uk` -> target `pyro` (letter `p`), port `3000`
- `pyro3001.voidium.uk` -> target `pyro` (name match), port `3001`
- `byto-4002.voidium.uk` -> target `byto`, port `4002`

If only one target exists, you can also use just a port:

- `3005.voidium.uk` -> target `pyro`, port `3005`

## Config

Create `config.json` (or use `eg.config.json`). You can use `targets` (preferred) or `pyro` (legacy single target).

### Multi-target (recommended)

```json
{
  "domaincut": ".voidium.uk",
  "masterToken": "change-me",
  "customDomainsDb": "./custom-domains.sqlite",
  "targets": {
    "pyro": { "letter": "p", "host": "192.168.1.100", "portStart": 3000, "portEnd": 3999 },
    "byto": { "host": "192.168.1.101", "portStart": 4000, "portEnd": 4999 }
  }
}
```

### Single target (legacy)

```json
{
  "domaincut": ".voidium.uk",
  "masterToken": "change-me",
  "customDomainsDb": "./custom-domains.sqlite",
  "pyro": { "letter": "p", "host": "192.168.1.100", "portStart": 3000, "portEnd": 3999 }
}
```

## Custom Domains API

You can create custom hostnames (like `name.c.voidium.uk`) that map to a specific target and port. These are stored in a SQLite database (`custom-domains.sqlite`).

### Add a custom domain

```
POST /__proxy-admin/domains
Authorization: Bearer <masterToken>
Content-Type: application/json

{ "domain": "name.c.voidium.uk", "target": "pyro", "port": 3007 }
```

### List all custom domains

```
GET /__proxy-admin/domains
Authorization: Bearer <masterToken>
```

### Remove a custom domain

```
DELETE /__proxy-admin/domains
Authorization: Bearer <masterToken>
Content-Type: application/json

{ "domain": "name.c.voidium.uk" }
```

## Safety Warning

If a request looks suspicious, the proxy serves a warning page once every 30 days per target. It only triggers for **HTML GET/HEAD** requests, so scripts, styles, and assets are not affected.

Suspicion rules include:
- URL path contains high-risk keywords (e.g. `login`, `verify`, `wallet`, `bank`)
- Very long paths or query strings
- Many digits in the host
- Missing User-Agent header

Users can continue via a one-click consent page. The consent is stored in a cookie for 30 days.

## Logging

Structured logging is on by default. Control verbosity with `LOG_LEVEL`:

```
LOG_LEVEL=debug
```

## Timeouts

Upstream fetches are aborted after `UPSTREAM_TIMEOUT_MS` (default 15000ms). Set it like:

```
UPSTREAM_TIMEOUT_MS=5000
```

## Run

```
npm install
npm start
```

Override the port with:

```
PORT=8080 npm start
```

## Notes

- This proxy does not terminate TLS. Run it behind a TLS terminator (like nginx or Caddy) if you need HTTPS.
- The routing logic assumes the target port is embedded in the host name (unless using a custom domain mapping).
