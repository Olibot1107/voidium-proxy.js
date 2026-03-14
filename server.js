const express = require('express');
const fs = require('fs');
const app = express();

const config = JSON.parse(fs.readFileSync('./config.json'));

app.use(async (req, res, next) => {
    const domain = req.get('host');
    const domaincut = domain.split(config.domaincut)[1];

    console.log('Domain:', domain);
    console.log('Cut:', domaincut);

    if (domaincut && domaincut.startsWith(config.pyro.letter)) {

        const pyroPort = parseInt(domaincut.slice(1));

        if (!isNaN(pyroPort)) {
            console.log('Pyro Port:', pyroPort);

            const coede = await fetchweb(
                `http://${config.pyro.host}:${pyroPort}${req.originalUrl}`,
                req
            );

            res.status(coede.status);

            for (const key in coede.headers) {
                if (key.toLowerCase() === 'set-cookie') {
                    res.setHeader('set-cookie', coede.headers[key]);
                } else {
                    res.setHeader(key, coede.headers[key]);
                }
            }

            return res.send(coede.body);
        } else {
            console.log('Pyro Port: Not a number');
            return res.status(400).send('Pyro Port: Not a number');
        }
    }

    res.send('welllll this is a wherd one ant it?');
});

async function fetchweb(url, req) {
    try {

        const headers = {
            'cookie': req.headers.cookie || '',
            'user-agent': req.headers['user-agent'] || '',
            'accept': req.headers['accept'] || '*/*'
        };

        const response = await fetch(url, {
            method: req.method,
            headers: headers
        });

        const outHeaders = {};

        response.headers.forEach((value, key) => {
            if (key.toLowerCase() === 'set-cookie') {
                outHeaders[key] = response.headers.getSetCookie
                    ? response.headers.getSetCookie()
                    : [value];
            } else {
                outHeaders[key] = value;
            }
        });

        return {
            status: response.status,
            headers: outHeaders,
            body: await response.text()
        };

    } catch (error) {
        console.log('Fetch error:', error);

        return {
            status: 502,
            headers: { "content-type": "text/plain" },
            body: "welll i did not expect this to happen"
        };
    }
}

app.listen(3000, () => {
    console.log('Example app listening on port 3000!');
});