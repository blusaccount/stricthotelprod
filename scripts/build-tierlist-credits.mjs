#!/usr/bin/env node
// Build attribution data for the Thing of the Week images.
//
// The images under public/assets/tierlist/ come from Wikipedia articles and are
// re-hosted on this server. Most Wikimedia media is Creative Commons, where
// naming the author and the licence is mandatory, and a minority is
// non-commercial, no-derivatives or outright non-free — none of which may be
// used here at all.
//
// This script resolves every catalogue entry back to its source file, pulls the
// licence metadata, classifies it, and writes
// public/assets/tierlist/attribution.json for the credits page to render.
//
//   node scripts/build-tierlist-credits.mjs           # report + write JSON
//   node scripts/build-tierlist-credits.mjs --prune   # also drop unusable items
//
// --prune removes every item whose licence does not permit commercial re-use
// from games/tierlist/js/items.js and deletes its image file. Anything the API
// cannot classify counts as unusable: silence is not permission.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ASSETS_DIR = path.join(ROOT, 'public', 'assets', 'tierlist');
const ITEMS_FILE = path.join(ROOT, 'games', 'tierlist', 'js', 'items.js');
const OUT_FILE = path.join(ASSETS_DIR, 'attribution.json');

const API = 'https://en.wikipedia.org/w/api.php';
// The Wikimedia user-agent policy wants a real contact address here.
const UA = 'StrictHotel-CreditsBuilder/1.0 (https://stricthotel.com; contact@stricthotel.com)';
const BATCH = 50;
const POLITE_DELAY_MS = 300;

const PRUNE = process.argv.includes('--prune');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- licence ---

// Licences that allow commercial re-use, which is what this site needs.
// Attribution is still mandatory for everything except the public-domain ones.
const FREE_PATTERNS = [
    /^cc0\b/i,
    /^cc[ -]by(?![ -]?n[cd])/i,        // CC BY / CC BY-SA, but not BY-NC / BY-ND
    /^public domain/i,
    /^pd([ -]|$)/i,
    /^pdm\b/i,
    /^gfdl/i,                           // free, though awkward; still commercial-OK
    /^attribution$/i,
    /^ofl\b|open font licen[cs]e/i,     // SIL OFL — free, commercial use allowed
];

// Explicitly unusable, listed so the report can say *why*.
const BLOCKED_PATTERNS = [
    [/n[ -]?c\b|noncommercial|non-commercial/i, 'non-commercial only'],
    [/n[ -]?d\b|noderiv|no derivative/i, 'no derivatives allowed'],
    [/fair use|non-free|fairuse/i, 'non-free / fair use'],
];

function classify(licenceShortName, usageTerms, restrictions) {
    const name = (licenceShortName || usageTerms || '').trim();
    if (!name) return { usable: false, reason: 'no licence reported by the API' };

    for (const [re, reason] of BLOCKED_PATTERNS) {
        if (re.test(name)) return { usable: false, reason };
    }
    for (const re of FREE_PATTERNS) {
        if (re.test(name)) {
            // Some files are freely licensed but carry extra restrictions
            // (trademark, personality rights). Surface them rather than hide them.
            const extra = (restrictions || '').trim();
            return { usable: true, reason: null, restrictions: extra || null };
        }
    }
    return { usable: false, reason: `unrecognised licence "${name}" — treated as unusable` };
}

// --------------------------------------------------------------- html ------

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

// File names round-trip through two APIs that disagree about Unicode form and
// about spaces vs underscores. Compare on a canonical key or entries with
// accented names silently fall out of the join.
function fileKey(name) {
    return String(name).normalize('NFC').replace(/_/g, ' ').trim();
}

function firstHref(html) {
    if (typeof html !== 'string') return null;
    const m = html.match(/href="([^"]+)"/);
    return m ? m[1] : null;
}

// ---------------------------------------------------------------- api ------

async function apiGet(params) {
    const url = API + '?' + new URLSearchParams({ format: 'json', ...params });
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`wikipedia API ${res.status} ${res.statusText}`);
    return res.json();
}

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

// Resolve requested titles forward to the page the API actually returned.
// Going forward is the only correct direction: several requested titles can
// collapse onto one page (the catalogue holds both "Lawn gnome" and "Garden
// gnome", and the former redirects to the latter), so inverting the API's
// normalisation and redirect lists loses every title but one.
function forwardResolver(query) {
    const norm = new Map();
    for (const n of query.normalized || []) norm.set(n.from, n.to);
    const redir = new Map();
    for (const r of query.redirects || []) redir.set(r.from, r.to);
    return (title) => {
        const normalised = norm.get(title) ?? title;
        return redir.get(normalised) ?? normalised;
    };
}

// Article title -> source file name.
async function resolvePageImages(titles) {
    const map = new Map();
    for (const group of chunk(titles, BATCH)) {
        const data = await apiGet({
            action: 'query',
            prop: 'pageimages',
            piprop: 'name',
            pilicense: 'any',
            redirects: '1',
            titles: group.join('|'),
        });
        const q = data?.query || {};
        const resolve = forwardResolver(q);
        const byTitle = new Map();
        for (const page of Object.values(q.pages || {})) byTitle.set(page.title, page);

        for (const requested of group) {
            const page = byTitle.get(resolve(requested));
            if (page?.pageimage) map.set(requested, page.pageimage);
        }
        await sleep(POLITE_DELAY_MS);
    }
    return map;
}

async function resolveFileMetadata(fileNames) {
    const map = new Map();
    for (const group of chunk(fileNames, BATCH)) {
        const data = await apiGet({
            action: 'query',
            prop: 'imageinfo',
            iiprop: 'extmetadata|url',
            iiextmetadatafilter:
                'LicenseShortName|LicenseUrl|Artist|Credit|AttributionRequired|UsageTerms|Restrictions',
            titles: group.map(f => 'File:' + f).join('|'),
        });
        const q = data?.query || {};
        const resolve = forwardResolver(q);
        const byTitle = new Map();
        for (const page of Object.values(q.pages || {})) byTitle.set(page.title, page);

        for (const name of group) {
            const page = byTitle.get(resolve('File:' + name));
            const info = page?.imageinfo?.[0];
            if (!info) continue;
            const em = info.extmetadata || {};
            const artistHtml = em.Artist?.value || '';
            map.set(fileKey(name), {
                descriptionUrl: info.descriptionurl || null,
                licence: stripHtml(em.LicenseShortName?.value) || null,
                licenceUrl: em.LicenseUrl?.value || null,
                usageTerms: stripHtml(em.UsageTerms?.value) || null,
                artist: stripHtml(artistHtml) || null,
                artistUrl: firstHref(artistHtml),
                credit: stripHtml(em.Credit?.value) || null,
                attributionRequired: (em.AttributionRequired?.value || '').toLowerCase() === 'true',
                restrictions: stripHtml(em.Restrictions?.value) || null,
            });
        }
        await sleep(POLITE_DELAY_MS);
    }
    return map;
}

// -------------------------------------------------------------- catalog ----

function parseCatalog(src) {
    const start = src.indexOf('var ITEM_CATALOG = [');
    if (start < 0) throw new Error('ITEM_CATALOG not found in items.js');
    const end = src.indexOf('\n];', start);
    const body = src.slice(start, end);
    const items = [];
    const re = /\{\s*name:\s*"((?:[^"\\]|\\.)*)"\s*,\s*image:\s*"([^"]+)"\s*,\s*category:\s*"([^"]+)"\s*\}/g;
    let m;
    while ((m = re.exec(body)) !== null) {
        items.push({ name: JSON.parse(`"${m[1]}"`), image: m[2], category: m[3] });
    }
    return items;
}

function renderCatalog(items) {
    return 'var ITEM_CATALOG = [\n' +
        items.map(it => '    { name: ' + JSON.stringify(it.name) +
            ', image: ' + JSON.stringify(it.image) +
            ', category: ' + JSON.stringify(it.category) + ' },').join('\n') +
        '\n];';
}

// ----------------------------------------------------------------- main ----

async function main() {
    const src = await fs.readFile(ITEMS_FILE, 'utf8');
    const items = parseCatalog(src);
    console.log(`Catalogue: ${items.length} items`);

    console.log('Resolving source files...');
    const titleToFile = await resolvePageImages(items.map(i => i.name));
    console.log(`  resolved ${titleToFile.size}/${items.length}`);

    console.log('Fetching licence metadata...');
    const fileToMeta = await resolveFileMetadata([...new Set(titleToFile.values())]);
    console.log(`  got metadata for ${fileToMeta.size} files`);

    const usable = [];
    const unusable = [];

    for (const item of items) {
        const file = titleToFile.get(item.name);
        const meta = file ? fileToMeta.get(fileKey(file)) : null;

        if (!meta) {
            unusable.push({ ...item, file: file || null, reason: 'no metadata returned for this file' });
            continue;
        }

        const verdict = classify(meta.licence, meta.usageTerms, meta.restrictions);
        const record = {
            name: item.name,
            image: item.image,
            category: item.category,
            file,
            artist: meta.artist,
            artistUrl: meta.artistUrl,
            licence: meta.licence || meta.usageTerms,
            licenceUrl: meta.licenceUrl,
            source: meta.descriptionUrl,
            attributionRequired: meta.attributionRequired,
            restrictions: verdict.restrictions || null,
        };

        if (verdict.usable) usable.push(record);
        else unusable.push({ ...record, reason: verdict.reason });
    }

    // ---- report ----
    console.log('\n=== LICENCE REPORT ===');
    console.log(`Usable (commercial re-use permitted): ${usable.length}`);
    console.log(`Unusable:                             ${unusable.length}`);

    const byLicence = new Map();
    for (const r of usable) byLicence.set(r.licence, (byLicence.get(r.licence) || 0) + 1);
    console.log('\nUsable by licence:');
    for (const [lic, n] of [...byLicence].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(n).padStart(4)}  ${lic}`);
    }

    if (unusable.length) {
        const byReason = new Map();
        for (const r of unusable) byReason.set(r.reason, (byReason.get(r.reason) || 0) + 1);
        console.log('\nUnusable by reason:');
        for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) {
            console.log(`  ${String(n).padStart(4)}  ${reason}`);
        }
        console.log('\nUnusable items:');
        for (const r of unusable) console.log(`  - ${r.name} (${r.licence || 'no licence'}) — ${r.reason}`);
    }

    const withRestrictions = usable.filter(r => r.restrictions);
    if (withRestrictions.length) {
        console.log('\nFreely licensed but carrying extra restrictions (review manually):');
        for (const r of withRestrictions) console.log(`  - ${r.name}: ${r.restrictions}`);
    }

    // ---- write attribution.json ----
    const payload = {
        generatedBy: 'scripts/build-tierlist-credits.mjs',
        source: 'English Wikipedia / Wikimedia Commons',
        note: 'Only images whose licence permits commercial re-use are listed. ' +
              'Attribution is reproduced as reported by the Wikimedia API.',
        count: usable.length,
        items: usable
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(r => ({
                name: r.name,
                file: r.file,
                artist: r.artist,
                artistUrl: r.artistUrl,
                licence: r.licence,
                licenceUrl: r.licenceUrl,
                source: r.source,
            })),
    };
    await fs.writeFile(OUT_FILE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    console.log(`\n✓ Wrote ${path.relative(ROOT, OUT_FILE)} (${usable.length} entries)`);

    // ---- prune ----
    if (!PRUNE) {
        if (unusable.length) {
            console.log('\nRun again with --prune to remove the unusable items and their files.');
        }
        return;
    }

    if (!unusable.length) {
        console.log('\nNothing to prune.');
        return;
    }

    const keep = new Set(usable.map(r => r.name));
    const kept = items.filter(i => keep.has(i.name));
    const out = src.replace(/var ITEM_CATALOG = \[[\s\S]*?\n\];/, renderCatalog(kept));
    if (out === src) {
        console.error('ERROR: could not rewrite ITEM_CATALOG — aborting without deleting anything');
        process.exit(1);
    }
    await fs.writeFile(ITEMS_FILE, out, 'utf8');
    console.log(`\n✓ items.js: ${items.length} → ${kept.length} entries`);

    let deleted = 0;
    for (const r of unusable) {
        const file = path.join(ROOT, 'public', r.image.replace(/^\//, ''));
        try {
            await fs.unlink(file);
            deleted++;
        } catch (err) {
            if (err.code !== 'ENOENT') console.warn(`  could not delete ${r.image}: ${err.message}`);
        }
    }
    console.log(`✓ Deleted ${deleted} image files`);
}

main().catch(err => { console.error(err); process.exit(1); });
