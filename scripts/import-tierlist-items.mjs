#!/usr/bin/env node
// Import tierlist items from Wikipedia.
//
// Reads scripts/tierlist-titles.txt (one entry per line: "Article Title, category"),
// looks up each title's representative image via the Wikipedia API, downloads
// it to public/assets/tierlist/<slug>.<ext>, and rewrites games/tierlist/js/items.js.
//
// Existing local images are not re-downloaded. Titles that fail (no image,
// not found, etc.) are skipped and reported.
//
// Usage: node scripts/import-tierlist-items.mjs

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const TITLES_FILE = path.join(__dirname, 'tierlist-titles.txt');
const ASSETS_DIR = path.join(ROOT, 'public', 'assets', 'tierlist');
const ITEMS_FILE = path.join(ROOT, 'games', 'tierlist', 'js', 'items.js');

const UA = 'StrictHotel/1.0 (https://stricthotel.com; contact@stricthotel.com)';
const THUMB_SIZE = 300;
const POLITE_DELAY_MS = 200;

function slugify(s) {
    return s.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function extFromContentType(ct) {
    if (!ct) return '.jpg';
    if (ct.includes('png'))  return '.png';
    if (ct.includes('jpeg')) return '.jpg';
    if (ct.includes('jpg'))  return '.jpg';
    if (ct.includes('webp')) return '.webp';
    if (ct.includes('gif'))  return '.gif';
    if (ct.includes('svg'))  return '.svg';
    return '.jpg';
}

async function fetchPageImage(title) {
    const url = 'https://en.wikipedia.org/w/api.php?' +
        'action=query&format=json&prop=pageimages&pithumbsize=' + THUMB_SIZE +
        '&pilicense=any&redirects=1&titles=' + encodeURIComponent(title);
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error('API ' + r.status);
    const data = await r.json();
    const pages = data?.query?.pages || {};
    const page = Object.values(pages)[0];
    if (!page || page.missing !== undefined) throw new Error('article not found');
    const thumb = page.thumbnail?.source;
    if (!thumb) throw new Error('no representative image on this article');
    return { url: thumb, canonicalTitle: page.title || title };
}

async function downloadImageOnce(url, destPathNoExt) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'image/*' } });
    if (r.status === 429) { const e = new Error('download 429'); e.status = 429; throw e; }
    if (!r.ok) throw new Error('download ' + r.status);
    const ct = r.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) throw new Error('not an image: ' + ct);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 200) throw new Error('image too small: ' + buf.length + ' bytes');
    const ext = extFromContentType(ct);
    const dest = destPathNoExt + ext;
    await fs.writeFile(dest, buf);
    return ext;
}

async function downloadImage(url, destPathNoExt) {
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            return await downloadImageOnce(url, destPathNoExt);
        } catch (err) {
            if (err.status === 429 && attempt < 4) {
                await sleep(3000 * (attempt + 1));
                continue;
            }
            throw err;
        }
    }
}

async function existsCached(slug) {
    const exts = ['.jpg', '.png', '.webp', '.gif', '.svg'];
    for (const ext of exts) {
        try {
            await fs.stat(path.join(ASSETS_DIR, slug + ext));
            return slug + ext;
        } catch {}
    }
    return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function readTitles() {
    const src = await fs.readFile(TITLES_FILE, 'utf8');
    const out = [];
    for (const raw of src.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const [title, category] = line.split('|').map(s => s.trim());
        out.push({ title, category: category || 'random' });
    }
    return out;
}

async function main() {
    await fs.mkdir(ASSETS_DIR, { recursive: true });
    const entries = await readTitles();
    console.log('Importing ' + entries.length + ' items...');

    const items = [];
    const failed = [];
    let i = 0;

    for (const entry of entries) {
        i++;
        const { title, category } = entry;
        const slug = slugify(title);
        if (!slug) { failed.push({ title, reason: 'empty slug' }); continue; }

        let filename = await existsCached(slug);
        if (filename) {
            items.push({ name: title, image: '/assets/tierlist/' + filename, category });
            if (i % 25 === 0) console.log('  ' + i + '/' + entries.length + ' (cached)');
            continue;
        }

        try {
            const { url } = await fetchPageImage(title);
            const destPathNoExt = path.join(ASSETS_DIR, slug);
            const ext = await downloadImage(url, destPathNoExt);
            items.push({ name: title, image: '/assets/tierlist/' + slug + ext, category });
            console.log('  ✓ [' + i + '/' + entries.length + '] ' + title + ' → ' + slug + ext);
        } catch (err) {
            failed.push({ title, reason: err.message });
            console.warn('  ✗ [' + i + '/' + entries.length + '] ' + title + ': ' + err.message);
        }
        await sleep(POLITE_DELAY_MS);
    }

    console.log('\n=== SUMMARY ===');
    console.log('Imported: ' + items.length);
    console.log('Failed:   ' + failed.length);
    if (failed.length) {
        console.log('\nFailed items:');
        for (const f of failed) console.log('  - ' + f.title + ' (' + f.reason + ')');
    }

    // Rewrite items.js — replace the ITEM_CATALOG array literal
    const src = await fs.readFile(ITEMS_FILE, 'utf8');
    const newArr = 'var ITEM_CATALOG = [\n' +
        items.map(it => '    { name: ' + JSON.stringify(it.name) +
            ', image: ' + JSON.stringify(it.image) +
            ', category: ' + JSON.stringify(it.category) + ' },').join('\n') +
        '\n];';
    const out = src.replace(/var ITEM_CATALOG = \[[\s\S]*?\n\];/, newArr);
    if (out === src) {
        console.error('ERROR: could not locate ITEM_CATALOG in items.js — did the format change?');
        process.exit(1);
    }
    await fs.writeFile(ITEMS_FILE, out, 'utf8');
    console.log('\n✓ Rewrote items.js with ' + items.length + ' entries');
}

main().catch(err => { console.error(err); process.exit(1); });
