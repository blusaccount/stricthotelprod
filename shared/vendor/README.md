# Vendored third-party browser libraries

Served from this origin instead of a public CDN so that no visitor IP address
is transmitted to a third party without consent (GDPR).

| File | Library | Version | License |
| --- | --- | --- | --- |
| `chart.umd.min.js` | Chart.js | 4.4.7 | MIT |
| `confetti.browser.min.js` | canvas-confetti | 1.6.0 | ISC |

To update: download the new version from jsDelivr, replace the file, bump the
version in this table, and check the pages that load it
(`games/stocks/index.html`, `games/strictbrain/index.html`).
