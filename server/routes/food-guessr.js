// Server-side proxy for the Wikimedia data Food Guessr needs.
//
// The client used to call en.wikipedia.org and wikimedia.org directly, which
// transmitted every player's IP address to the Wikimedia Foundation on every
// round, and loaded the photos straight from upload.wikimedia.org on top. Both
// are third-party transfers with no legal basis and no way for a visitor to
// avoid them. Routing everything through this server removes them, and lets us
// send one honest User-Agent as the Wikimedia policy asks rather than whatever
// each browser reports.
//
// Endpoints (all behind the session gate, like every other /api route):
//   GET /api/fg/dish?title=X   -> { image, artist, licence, licenceUrl, source }
//   GET /api/fg/image?title=X  -> the photo bytes
//   GET /api/fg/views?title=X  -> { views } average monthly pageviews

import { Router } from 'express';
import { rateLimiter } from '../rate-limit.js';

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const PAGEVIEWS_API = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/';

// The Wikimedia user-agent policy asks for a descriptive agent with a contact
// address. Keep it accurate if the domain changes.
const UA = 'StrictHotel/1.0 (https://stricthotel.com; contact@stricthotel.com)';

const FETCH_TIMEOUT_MS = 8000;
const DISH_CACHE_MS = 24 * 60 * 60 * 1000;   // metadata barely changes
const VIEWS_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const IMAGE_CACHE_MS = 24 * 60 * 60 * 1000;
// Wide enough for the 16:10 photo panel on a high-DPI screen, small enough that
// the cache below stays in the tens of megabytes rather than the hundreds.
const IMAGE_WIDTH = 1024;
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

const MAX_CACHE_ENTRIES = 500;
// Images are held as buffers, so this is bounded by total bytes as well as by
// entry count — a handful of large photos must not evict the whole cache's
// worth of memory budget.
const MAX_IMAGE_ENTRIES = 80;
const MAX_IMAGE_CACHE_BYTES = 48 * 1024 * 1024;

const dishCache = new Map();    // title -> { data, ts }
const viewsCache = new Map();   // title -> { views, ts }
const imageCache = new Map();   // title -> { buf, contentType, ts }

// Evict by entry count and by total bytes, oldest first.
function cacheImage(key, value) {
    imageCache.delete(key);
    imageCache.set(key, value);
    let bytes = 0;
    for (const v of imageCache.values()) bytes += v.buf.length;
    while (imageCache.size > MAX_IMAGE_ENTRIES || bytes > MAX_IMAGE_CACHE_BYTES) {
        const oldest = imageCache.keys().next().value;
        if (oldest === undefined) break;
        bytes -= imageCache.get(oldest).buf.length;
        imageCache.delete(oldest);
    }
}

function cacheSet(map, key, value, limit) {
    map.set(key, value);
    if (map.size > limit) {
        const oldest = map.keys().next().value;
        map.delete(oldest);
    }
}

// Article titles arrive from the client, so they are validated rather than
// trusted: anything outside this shape never reaches an outbound URL. The
// catalogue's 183 titles use only letters, digits, spaces, underscores,
// parentheses, hyphens and one apostrophe — slashes and colons are excluded so
// a path or a URL can never be smuggled through as a "title".
function cleanTitle(raw) {
    if (typeof raw !== 'string') return '';
    const t = raw.trim();
    if (!t || t.length > 120) return '';
    if (!/^[\p{L}\p{N} _()'\-.,&!]+$/u.test(t)) return '';
    return t;
}

async function fetchJson(url) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': UA, Accept: 'application/json' },
            signal: ac.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

function stripHtml(html) {
    if (typeof html !== 'string') return '';
    return html
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

// Resolve an article to its lead photo plus the attribution that photo needs.
async function resolveDish(title) {
    // pageimages gives a server-side-scaled thumbnail and the source file name
    // in one call. The REST summary endpoint would hand back the full-resolution
    // original instead — several megabytes for a photo shown in a 16:10 panel,
    // which this server would then have to hold in memory and pay egress on.
    const params = new URLSearchParams({
        action: 'query',
        format: 'json',
        prop: 'pageimages',
        piprop: 'name|thumbnail',
        pithumbsize: String(IMAGE_WIDTH),
        pilicense: 'any',
        redirects: '1',
        titles: title,
    });
    const page = Object.values(
        (await fetchJson(`${WIKI_API}?${params}`))?.query?.pages || {}
    )[0];
    const src = page?.thumbnail?.source || null;
    if (!src) throw new Error('no image on this article');

    // The thumbnail carries no licence, so the source file is looked up
    // separately for the attribution CC-BY-SA requires.
    let artist = null;
    let artistUrl = null;
    let licence = null;
    let licenceUrl = null;
    let source = null;
    try {
        const file = page?.pageimage;
        if (file) {
            const fileParams = new URLSearchParams({
                action: 'query',
                format: 'json',
                prop: 'imageinfo',
                iiprop: 'extmetadata|url',
                iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist',
                titles: 'File:' + file,
            });
            const filePage = Object.values(
                (await fetchJson(`${WIKI_API}?${fileParams}`))?.query?.pages || {}
            )[0];
            const info = filePage?.imageinfo?.[0];
            const em = info?.extmetadata || {};
            const artistHtml = em.Artist?.value || '';
            artist = stripHtml(artistHtml) || null;
            const href = artistHtml.match(/href="([^"]+)"/);
            artistUrl = href ? (href[1].startsWith('//') ? 'https:' + href[1] : href[1]) : null;
            licence = stripHtml(em.LicenseShortName?.value) || null;
            licenceUrl = em.LicenseUrl?.value || null;
            source = info?.descriptionurl || null;
        }
    } catch {
        // Attribution lookup is best-effort — a missing credit must not cost
        // the player their photo. The credits page carries the blanket notice.
    }

    return { upstream: src, artist, artistUrl, licence, licenceUrl, source };
}

async function loadDish(title) {
    const hit = dishCache.get(title);
    if (hit && Date.now() - hit.ts < DISH_CACHE_MS) return hit.data;
    const data = await resolveDish(title);
    cacheSet(dishCache, title, { data, ts: Date.now() }, MAX_CACHE_ENTRIES);
    return data;
}

function yyyymmddhh(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}00`;
}

export function createFoodGuessrRouter() {
    const router = Router();
    // One budget for all three endpoints: a round pulls a dish, its photo and
    // sometimes its pageviews, so ~3 calls per round per player.
    const limit = rateLimiter(60);

    // Photo plus the credit that photo carries.
    router.get('/api/fg/dish', limit, async (req, res) => {
        const title = cleanTitle(req.query.title);
        if (!title) return res.status(400).json({ error: 'Invalid title' });
        try {
            const d = await loadDish(title);
            res.set('Cache-Control', 'public, max-age=3600');
            res.json({
                image: '/api/fg/image?title=' + encodeURIComponent(title),
                artist: d.artist,
                artistUrl: d.artistUrl,
                licence: d.licence,
                licenceUrl: d.licenceUrl,
                source: d.source,
            });
        } catch (err) {
            res.status(502).json({ error: err.message });
        }
    });

    // The photo itself, streamed through so the browser never talks to
    // upload.wikimedia.org.
    router.get('/api/fg/image', limit, async (req, res) => {
        const title = cleanTitle(req.query.title);
        if (!title) return res.status(400).send('Invalid title');

        const hit = imageCache.get(title);
        if (hit && Date.now() - hit.ts < IMAGE_CACHE_MS) {
            res.set('Content-Type', hit.contentType);
            res.set('Cache-Control', 'public, max-age=86400');
            return res.send(hit.buf);
        }

        try {
            const { upstream } = await loadDish(title);
            const ac = new AbortController();
            const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
            let upstreamRes;
            try {
                upstreamRes = await fetch(upstream, {
                    headers: { 'User-Agent': UA, Accept: 'image/*' },
                    signal: ac.signal,
                });
            } finally {
                clearTimeout(timer);
            }
            if (!upstreamRes.ok) {
                return res.status(502).send(`upstream ${upstreamRes.status}`);
            }
            const contentType = upstreamRes.headers.get('content-type') || '';
            if (!contentType.startsWith('image/')) {
                return res.status(502).send('not an image');
            }
            const buf = Buffer.from(await upstreamRes.arrayBuffer());
            if (buf.length > IMAGE_MAX_BYTES) {
                return res.status(502).send('image too large');
            }

            cacheImage(title, { buf, contentType, ts: Date.now() });
            res.set('Content-Type', contentType);
            res.set('Cache-Control', 'public, max-age=86400');
            res.send(buf);
        } catch (err) {
            res.status(502).send('image fetch failed');
        }
    });

    // Average monthly pageviews over the last six full months — the rating
    // signal behind the "Scrandle Wiki" mode.
    router.get('/api/fg/views', limit, async (req, res) => {
        const title = cleanTitle(req.query.title);
        if (!title) return res.status(400).json({ error: 'Invalid title' });

        const hit = viewsCache.get(title);
        if (hit && Date.now() - hit.ts < VIEWS_CACHE_MS) {
            return res.json({ views: hit.views });
        }

        try {
            const end = new Date();
            end.setUTCDate(1);
            end.setUTCHours(0, 0, 0, 0);
            end.setUTCDate(end.getUTCDate() - 1);   // last day of the previous month
            const start = new Date(end);
            start.setUTCMonth(start.getUTCMonth() - 5);
            start.setUTCDate(1);

            const url = PAGEVIEWS_API + 'en.wikipedia/all-access/all-agents/' +
                encodeURIComponent(title) + '/monthly/' +
                yyyymmddhh(start) + '/' + yyyymmddhh(end);

            const data = await fetchJson(url);
            const items = data?.items || [];
            if (!items.length) throw new Error('no pageview data');
            const sum = items.reduce((acc, it) => acc + (Number(it.views) || 0), 0);
            const views = Math.round(sum / items.length);

            cacheSet(viewsCache, title, { views, ts: Date.now() }, MAX_CACHE_ENTRIES);
            res.set('Cache-Control', 'public, max-age=3600');
            res.json({ views });
        } catch (err) {
            // Soft-cache the miss for an hour so a dish without stats does not
            // hammer Wikimedia once per round.
            cacheSet(viewsCache, title,
                { views: null, ts: Date.now() - VIEWS_CACHE_MS + 60 * 60 * 1000 },
                MAX_CACHE_ENTRIES);
            res.json({ views: null });
        }
    });

    return router;
}

// Exported for tests.
export const _internals = { cleanTitle, stripHtml, yyyymmddhh };
