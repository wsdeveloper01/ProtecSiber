(() => {
'use strict';

/* ==========================================
   ProtecSiber
   Sumber data: berita.php (lewat rewrite /api/berita di vercel.json, cadangan: langsung dari browser)
   ========================================== */

const UPSTREAM  = 'https://obfustext.is-great.org/berita.json';
const CACHE_KEY = 'ps:cache:v1';
const SAVED_KEY = 'ps:saved:v1';

const h  = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- Ikon ---------- */
const PATHS = {
    home:    '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    breach:  '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    attack:  '<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    vuln:    '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.5-2"/>',
    saved:   '<path d="M6 3h12v18l-6-4-6 4z"/>',
    share:   '<path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/>',
    back:    '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
    refresh: '<path d="M21 12a9 9 0 11-3-6.7"/><path d="M21 4v5h-5"/>',
    search:  '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    link:    '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
    alert:   '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>'
};
const icon = (name, size = 20, fill = false) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;

const LOGO = (size = 24) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z" fill="currentColor"/><path d="M8.5 12l2.5 2.5 4.5-5" fill="none" style="stroke:var(--logo-check)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* ---------- Normalisasi data ---------- */
function slugify(t) {
    return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'berita';
}
function pick(o, keys) {
    for (const k of keys) {
        if (o && o[k] != null && String(o[k]).trim() !== '') return o[k];
    }
    return '';
}
function levelOf(v) {
    const s = String(v).toLowerCase();
    if (/tinggi|kritis|critical|high|parah/.test(s)) return 'high';
    if (/rendah|low|ringan/.test(s)) return 'low';
    return 'mid';
}
const CATS = { breach: 'Data Breach', attack: 'Cyber Attack', vuln: 'Vulnerability', other: 'Lainnya' };
function catOf(text) {
    const s = String(text).toLowerCase();
    if (/bocor|kebocoran|breach|leak|dump|dijual|credential|data pribadi/.test(s)) return 'breach';
    if (/kerentanan|vulnerab|cve-|exploit|zero.?day|patch|celah/.test(s)) return 'vuln';
    if (/serang|attack|ransomware|ddos|phishing|malware|peretas|hack|deface|bobol/.test(s)) return 'attack';
    return 'other';
}

function normalize(raw) {
    const list = Array.isArray(raw) ? raw : (raw && (raw.berita || raw.data || raw.items));
    if (!Array.isArray(list)) return null;

    const timestamp = (raw && !Array.isArray(raw) && (raw.timestamp || raw.updated || raw.diperbarui)) || '';
    const seen = {};

    const items = list.filter((it) => it && typeof it === 'object').map((it) => {
        const title = String(pick(it, ['judul_berita', 'judul', 'title']) || 'Tanpa judul');
        const body  = String(pick(it, ['isi_berita', 'isi', 'content', 'deskripsi']));
        const levelRaw = String(pick(it, ['tingkat_bahaya', 'level', 'risiko']));
        const kategori = String(pick(it, ['kategori', 'category']));

        let slug = slugify(title);
        seen[slug] = (seen[slug] || 0) + 1;
        if (seen[slug] > 1) slug += '-' + seen[slug];

        return {
            slug, title, body,
            actor:  String(pick(it, ['pelaku', 'actor', 'threat_actor'])),
            advice: String(pick(it, ['himbauan', 'saran', 'advice'])),
            source: String(pick(it, ['sumber_forum', 'sumber', 'source'])),
            level:  levelOf(levelRaw),
            levelLabel: levelRaw || 'Sedang',
            cat:    catOf(kategori || (title + ' ' + body)),
            time:   String(pick(it, ['tanggal', 'waktu', 'created_at', 'published_at', 'date']) || timestamp)
        };
    });

    return { items, timestamp: String(timestamp) };
}

/* ---------- Pengambilan data berlapis ---------- */
async function getJSON(url, ms = 10000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
        const txt = await r.text();
        if (!r.ok) throw new Error('HTTP ' + r.status);
        try {
            return JSON.parse(txt.replace(/^\uFEFF/, ''));
        } catch (e) {
            throw new Error('Respons bukan JSON' + (/aes|__test|<script/i.test(txt) ? ' (kemungkinan diblokir anti-bot hosting)' : ''));
        }
    } catch (e) {
        if (e.name === 'AbortError') throw new Error('Timeout');
        if (e instanceof TypeError) throw new Error('Gagal terhubung (kemungkinan diblokir CORS, atau sumber tidak terjangkau)');
        throw new Error(e.message);
    } finally {
        clearTimeout(timer);
    }
}

let pendingLoad = null;
function loadNews(force = false) {
    if (pendingLoad && !force) return pendingLoad;
    pendingLoad = (async () => {
        const attempts = [];
        const sources = [['server', '/api/berita'], ['langsung', UPSTREAM + '?i=1']];

        for (const [name, url] of sources) {
            try {
                const raw  = await getJSON(url);
                const data = normalize(raw);
                if (!data) throw new Error('Format data tidak dikenali (kunci yang ada: ' + (raw && typeof raw === 'object' ? Object.keys(raw).join(', ') || 'kosong' : typeof raw) + ')');
                try { localStorage.setItem(CACHE_KEY, JSON.stringify({ raw, at: Date.now() })); } catch (e) {}
                return { ...data, source: name };
            } catch (e) {
                attempts.push(name + ': ' + e.message);
            }
        }

        try {
            const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
            const data = c && normalize(c.raw);
            if (data) return { ...data, source: 'cache' };
        } catch (e) {}

        const err = new Error('Semua sumber gagal');
        err.attempts = attempts;
        throw err;
    })();
    return pendingLoad;
}

/* ---------- Simpanan (bookmark) ---------- */
const store = {
    all() {
        try { return new Set(JSON.parse(localStorage.getItem(SAVED_KEY) || '[]')); } catch (e) { return new Set(); }
    },
    has(slug) { return this.all().has(slug); },
    toggle(slug) {
        const s = this.all();
        const on = !s.has(slug);
        on ? s.add(slug) : s.delete(slug);
        try { localStorage.setItem(SAVED_KEY, JSON.stringify([...s])); } catch (e) {}
        return on;
    }
};

/* ---------- Waktu ---------- */
function parseDate(v) {
    if (!v) return null;
    const s = String(v).trim();
    const d = new Date(/^\d{4}-\d{2}-\d{2} /.test(s) ? s.replace(' ', 'T') : s);
    return isNaN(d) ? null : d;
}
function relTime(v) {
    const d = parseDate(v);
    if (!d) return String(v || '');
    const s = Math.max(0, (Date.now() - d) / 1000);
    if (s < 60) return 'baru saja';
    if (s < 3600) return Math.floor(s / 60) + ' mnt';
    if (s < 86400) return Math.floor(s / 3600) + ' j';
    if (s < 604800) return Math.floor(s / 86400) + ' h';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
function fullTime(v) {
    const d = parseDate(v);
    return d ? d.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }) : String(v || '');
}

/* ---------- Toast, salin, bagikan ---------- */
let toastTimer;
function toast(msg) {
    let t = $('#toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        t.setAttribute('role', 'status');
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}
async function copyText(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (e) {}
    const t = document.createElement('textarea');
    t.value = text;
    t.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(t);
    return ok;
}
const urlOf = (it) => location.origin + '/berita/' + encodeURIComponent(it.slug);
async function share(it) {
    if (navigator.share) {
        try { await navigator.share({ title: it.title, url: urlOf(it) }); return; }
        catch (e) { if (e.name === 'AbortError') return; }
    }
    toast((await copyText(urlOf(it))) ? 'Tautan disalin' : 'Gagal menyalin tautan');
}

/* ---------- Kerangka halaman ---------- */
const NAV = [
    ['home',   'Beranda',      'home',   '/#home'],
    ['breach', 'Data Breach',  'breach', '/#breach'],
    ['attack', 'Cyber Attack', 'attack', '/#attack'],
    ['vuln',   'Vulnerability','vuln',   '/#vuln'],
    ['saved',  'Tersimpan',    'saved',  '/#saved']
];
const navHTML = (active) => NAV.map(([k, label, ic, href]) =>
    `<a class="nav-item${k === active ? ' active' : ''}" href="${href}" data-nav="${k}"${k === active ? ' aria-current="page"' : ''}>${icon(ic, 26)}<span>${label}</span></a>`
).join('');

function setActive(key) {
    $$('[data-nav]').forEach((a) => {
        const on = a.dataset.nav === key;
        a.classList.toggle('active', on);
        on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    });
}

function buildShell(active) {
    $('#rail').innerHTML =
        `<div class="rail-in"><a class="brand" href="/" aria-label="ProtecSiber, ke beranda">${LOGO(34)}<span>ProtecSiber</span></a><nav aria-label="Menu utama">${navHTML(active)}</nav></div>`;
    $('#tabbar').innerHTML = navHTML(active);
    $('#side').innerHTML =
        `<div class="side-in">
            <form class="search" role="search" action="/" method="get">${icon('search', 18)}<input class="qinput" type="search" name="q" placeholder="Cari berita" autocomplete="off" aria-label="Cari berita"></form>
            <section class="panel"><h3>Ringkasan ancaman</h3><div id="panel-summary" class="muted small">Memuat…</div></section>
            <section class="panel"><h3>Pelaku teratas</h3><div id="panel-actors" class="muted small">Memuat…</div></section>
            <p class="side-foot">ProtecSiber merangkum berita ancaman siber. Selalu verifikasi sumber sebelum bertindak.</p>
        </div>`;
}

function fillSide(data) {
    const count = (lv) => data.items.filter((x) => x.level === lv).length;
    const rows = [['high', 'Risiko tinggi'], ['mid', 'Risiko sedang'], ['low', 'Risiko rendah']]
        .map(([lv, label]) => `<div class="row"><span><i class="dot dot-${lv}"></i>${label}</span><b>${count(lv)}</b></div>`).join('');
    $('#panel-summary').className = '';
    $('#panel-summary').innerHTML = rows + `<div class="row total"><span>Total berita</span><b>${data.items.length}</b></div>`;

    const tally = {};
    data.items.forEach((x) => { if (x.actor) tally[x.actor] = (tally[x.actor] || 0) + 1; });
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5);
    $('#panel-actors').className = '';
    $('#panel-actors').innerHTML = top.length
        ? top.map(([name, n]) => `<div class="row"><span class="ellipsis">${h(name)}</span><b>${n}</b></div>`).join('')
        : '<div class="muted small">Belum ada data pelaku.</div>';
}

/* ---------- Komponen ---------- */
const skeleton = (n = 4) => Array.from({ length: n }, () =>
    `<div class="post sk-post"><div class="avatar sk"></div><div class="post-main"><div class="sk sk-line w40"></div><div class="sk sk-line w90"></div><div class="sk sk-line w75"></div><div class="sk sk-card"></div></div></div>`
).join('');

const riskChip = (it) => `<span class="chip risk-${it.level}"><i class="dot dot-${it.level}"></i>${h(it.levelLabel)}</span>`;

function actionsHTML(it) {
    const on = store.has(it.slug);
    return `<div class="actions">
        <button type="button" class="act" data-act="share" aria-label="Bagikan">${icon('share', 18)}<span>Bagikan</span></button>
        <button type="button" class="act${on ? ' on' : ''}" data-act="save" aria-pressed="${on}" aria-label="${on ? 'Hapus dari simpanan' : 'Simpan'}">${icon('saved', 18, on)}<span>${on ? 'Tersimpan' : 'Simpan'}</span></button>
    </div>`;
}

function postHTML(it) {
    const excerpt = it.body.replace(/\s+/g, ' ').trim().slice(0, 240);
    return `<article class="post" data-slug="${h(it.slug)}">
        <a class="post-link" href="/berita/${encodeURIComponent(it.slug)}" aria-label="Buka berita: ${h(it.title)}"></a>
        <div class="avatar">${LOGO(22)}</div>
        <div class="post-main">
            <div class="post-head"><span class="name">ProtecSiber</span><span class="handle">@protecsiber</span><span class="sep">·</span><time>${h(relTime(it.time))}</time></div>
            <h2 class="post-title">${h(it.title)}</h2>
            ${excerpt ? `<p class="post-text">${h(excerpt)}</p>` : ''}
            <div class="linkcard">
                <div class="chips">${riskChip(it)}<span class="chip cat">${h(CATS[it.cat])}</span></div>
                ${it.actor ? `<div class="kv"><span>Pelaku</span><b>${h(it.actor)}</b></div>` : ''}
                ${it.source ? `<div class="kv"><span>Sumber</span><b>${h(it.source)}</b></div>` : ''}
            </div>
            ${actionsHTML(it)}
        </div>
    </article>`;
}

function errorHTML(err) {
    const lines = (err.attempts || [String(err.message)]).join('\n');
    return `<div class="errorbox">
        <h2>Berita belum bisa dimuat</h2>
        <p>Server berita tidak merespons dengan benar. Coba muat ulang sebentar lagi.</p>
        <button type="button" class="btn" id="retry">Coba lagi</button>
        <details open><summary>Detail teknis</summary><pre>${h(lines)}</pre></details>
    </div>`;
}

function bindActions(container, find, onChange) {
    container.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const slug = b.closest('[data-slug]')?.dataset.slug;
        const it = find(slug);
        if (!it) return;
        if (b.dataset.act === 'share') {
            share(it);
        } else {
            const on = store.toggle(it.slug);
            toast(on ? 'Disimpan' : 'Dihapus dari simpanan');
            onChange();
        }
    });
}

/* ---------- Halaman: beranda ---------- */
async function initFeed() {
    const TITLES = { home: 'Beranda', breach: 'Data Breach', attack: 'Cyber Attack', vuln: 'Vulnerability', saved: 'Tersimpan' };
    const st = { risk: 'all', view: 'home', q: new URLSearchParams(location.search).get('q') || '' };
    let data = null;

    const readHash = () => {
        const k = location.hash.replace('#', '');
        st.view = TITLES[k] ? k : 'home';
    };
    readHash();
    buildShell(st.view);

    $('#main').innerHTML =
        `<header class="topbar">
            <div class="topbar-row"><h1 id="feed-title">${TITLES[st.view]}</h1><button type="button" class="iconbtn" id="refresh" aria-label="Muat ulang">${icon('refresh', 20)}</button></div>
            <form class="search m-search" role="search" action="/" method="get">${icon('search', 18)}<input class="qinput" type="search" name="q" placeholder="Cari berita" autocomplete="off" aria-label="Cari berita"></form>
            <div class="tabs" role="tablist" aria-label="Filter risiko">
                ${[['all', 'Semua'], ['high', 'Tinggi'], ['mid', 'Sedang'], ['low', 'Rendah']].map(([k, l]) =>
                    `<button type="button" role="tab" class="tab${k === 'all' ? ' active' : ''}" data-risk="${k}" aria-selected="${k === 'all'}">${l}</button>`).join('')}
            </div>
        </header>
        <div id="status"></div>
        <div id="feed" aria-live="polite">${skeleton()}</div>`;

    $$('.qinput').forEach((i) => { i.value = st.q; });

    const feed = $('#feed');

    function render() {
        if (!data) return;
        const saved = store.all();
        const q = st.q.trim().toLowerCase();
        const list = data.items.filter((it) =>
            (st.risk === 'all' || it.level === st.risk) &&
            (['home', 'saved'].includes(st.view) || it.cat === st.view) &&
            (st.view !== 'saved' || saved.has(it.slug)) &&
            (!q || (it.title + ' ' + it.body + ' ' + it.actor + ' ' + it.source).toLowerCase().includes(q))
        );

        if (!list.length) {
            feed.innerHTML = `<div class="empty"><h2>${st.view === 'saved' && !q ? 'Belum ada yang disimpan' : 'Tidak ada berita yang cocok'}</h2><p>${st.view === 'saved' && !q ? 'Tekan Simpan pada berita untuk menaruhnya di sini.' : 'Coba ganti filter atau kata kunci.'}</p></div>`;
            return;
        }
        feed.innerHTML = list.map(postHTML).join('');
    }

    function setStatus() {
        const s = $('#status');
        if (!data) { s.innerHTML = ''; return; }
        if (data.source === 'cache') {
            s.innerHTML = '<div class="notice warn">Sumber berita sedang tidak bisa dijangkau. Menampilkan data terakhir yang tersimpan di perangkat ini.</div>';
        } else if (data.timestamp) {
            s.innerHTML = `<div class="notice">Diperbarui ${h(fullTime(data.timestamp))}</div>`;
        } else {
            s.innerHTML = '';
        }
    }

    async function boot(force) {
        feed.innerHTML = skeleton();
        $('#status').innerHTML = '';
        try {
            data = await loadNews(force);
        } catch (err) {
            data = null;
            feed.innerHTML = errorHTML(err);
            $('#retry').addEventListener('click', () => boot(true));
            return;
        }
        fillSide(data);
        setStatus();
        render();
    }

    bindActions(feed, (slug) => data && data.items.find((x) => x.slug === slug), render);

    $$('.tab').forEach((t) => t.addEventListener('click', () => {
        st.risk = t.dataset.risk;
        $$('.tab').forEach((x) => {
            const on = x === t;
            x.classList.toggle('active', on);
            x.setAttribute('aria-selected', on);
        });
        render();
    }));

    $$('.qinput').forEach((i) => {
        i.addEventListener('input', () => {
            st.q = i.value;
            $$('.qinput').forEach((o) => { if (o !== i) o.value = i.value; });
            render();
        });
        i.form.addEventListener('submit', (e) => e.preventDefault());
    });

    $('#refresh').addEventListener('click', () => boot(true));

    window.addEventListener('hashchange', () => {
        readHash();
        setActive(st.view);
        $('#feed-title').textContent = TITLES[st.view];
        document.title = (st.view === 'home' ? 'ProtecSiber' : TITLES[st.view] + ' – ProtecSiber');
        window.scrollTo({ top: 0 });
        render();
    });

    boot(false);
}

/* ---------- Halaman: satu berita ---------- */
async function initArticle() {
    const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
    buildShell('');

    const main = $('#main');
    const back = (e) => {
        const sameSite = document.referrer.startsWith(location.origin);
        if (sameSite && history.length > 1) { e.preventDefault(); history.back(); }
    };

    const topbar = `<header class="topbar"><div class="topbar-row"><a class="iconbtn" href="/" id="back" aria-label="Kembali">${icon('back', 20)}</a><h1>Berita</h1></div></header>`;
    main.innerHTML = topbar + `<div id="body">${skeleton(1)}</div>`;
    $('#back').addEventListener('click', back);

    let data = null;

    function render() {
        const it = data.items.find((x) => x.slug === slug);
        const body = $('#body');

        if (!it) {
            document.title = 'Berita tidak ditemukan – ProtecSiber';
            body.innerHTML = `<div class="empty"><h2>Berita tidak ditemukan</h2><p>Berita ini mungkin sudah dihapus atau tautannya salah.</p><a class="btn" href="/">Ke beranda</a></div>`;
            return;
        }

        document.title = it.title + ' – ProtecSiber';
        const meta = $('meta[name="description"]');
        if (meta) meta.setAttribute('content', it.body.replace(/\s+/g, ' ').slice(0, 160));

        const paras = it.body.split(/\n+/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${h(p)}</p>`).join('');
        const others = data.items.filter((x) => x.slug !== slug).slice(0, 8);
        const on = store.has(it.slug);

        body.innerHTML = `
            <article class="full" data-slug="${h(it.slug)}">
                <div class="post-head big">
                    <div class="avatar">${LOGO(22)}</div>
                    <div><div class="name">ProtecSiber</div><div class="handle">@protecsiber</div></div>
                </div>
                <h1 class="full-title">${h(it.title)}</h1>
                <div class="chips">${riskChip(it)}<span class="chip cat">${h(CATS[it.cat])}</span></div>
                ${paras ? `<div class="full-body">${paras}</div>` : ''}
                <div class="linkcard">
                    ${it.actor ? `<div class="kv"><span>Pelaku</span><b>${h(it.actor)}</b></div>` : ''}
                    ${it.source ? `<div class="kv"><span>Sumber</span><b>${h(it.source)}</b></div>` : ''}
                </div>
                ${it.advice ? `<aside class="advice">${icon('alert', 22)}<div><strong>Himbauan</strong><p>${h(it.advice)}</p></div></aside>` : ''}
                ${it.time ? `<div class="full-meta">${h(fullTime(it.time))}</div>` : ''}
                <div class="actions wide">
                    <button type="button" class="act" data-act="share">${icon('share', 18)}<span>Bagikan</span></button>
                    <button type="button" class="act" data-act="copy">${icon('link', 18)}<span>Salin tautan</span></button>
                    <button type="button" class="act${on ? ' on' : ''}" data-act="save" aria-pressed="${on}">${icon('saved', 18, on)}<span>${on ? 'Tersimpan' : 'Simpan'}</span></button>
                </div>
            </article>
            ${others.length ? `<h2 class="section-title">Berita lainnya</h2><div id="more">${others.map(postHTML).join('')}</div>` : ''}`;
    }

    main.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]');
        if (!b || !data) return;
        const owner = b.closest('[data-slug]');
        const it = data.items.find((x) => x.slug === owner.dataset.slug);
        if (!it) return;

        if (b.dataset.act === 'share') {
            share(it);
        } else if (b.dataset.act === 'copy') {
            toast((await copyText(urlOf(it))) ? 'Tautan disalin' : 'Gagal menyalin tautan');
        } else {
            const on = store.toggle(it.slug);
            toast(on ? 'Disimpan' : 'Dihapus dari simpanan');
            render();
        }
    });

    async function boot(force) {
        $('#body').innerHTML = skeleton(1);
        try {
            data = await loadNews(force);
        } catch (err) {
            data = null;
            $('#body').innerHTML = errorHTML(err);
            $('#retry').addEventListener('click', () => boot(true));
            return;
        }
        fillSide(data);
        render();
    }
    boot(false);
}

document.body.dataset.page === 'article' ? initArticle() : initFeed();
})();
