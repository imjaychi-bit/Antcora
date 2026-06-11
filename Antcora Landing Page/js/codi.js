// ── Cursor trail ──────────────────────────────────────────────
const cursor = document.getElementById('custom-cursor');
const canvas = document.getElementById('trail-canvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

const trail = [];
const MAX_TRAIL = 28;
const RETRACT_SPEED = 1.5;

let moving = false;
let stopTimer = null;
let retractAccum = 0;

document.addEventListener('mousemove', (e) => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top  = e.clientY + 'px';

    moving = true;
    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => { moving = false; }, 50);

    trail.push({ x: e.clientX, y: e.clientY });
    if (trail.length > MAX_TRAIL) trail.shift();
});

function drawTrail() {
    if (!moving && trail.length > 0) {
        retractAccum += RETRACT_SPEED;
        const toRemove = Math.floor(retractAccum);
        retractAccum -= toRemove;
        trail.splice(0, Math.min(toRemove, trail.length));
    } else {
        retractAccum = 0;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.lineCap = 'round';
    ctx.setLineDash([0, 80]);
    ctx.strokeStyle = 'rgba(255, 255, 255)';
    ctx.lineWidth = 15;

    for (let i = 1; i < trail.length; i++) {
        const progress = i / trail.length;
        ctx.globalAlpha = 1;
        ctx.lineDashOffset = -i * 14;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
    }

    ctx.globalAlpha = 1;

    requestAnimationFrame(drawTrail);
}

drawTrail();

// ── Floating face dots ─────────────────────────────────────────
const dotsContainer = document.getElementById('dots-container');
// Container is full face size; dotAppear animates to scale(0.14) so it looks like a tiny dot
const FACE_SIZES  = [80, 90, 100, 110];
const TOTAL_DOTS  = 9;

function buildFace() {
    const face = document.createElement('div');
    face.style.cssText = 'position:absolute;inset:0;opacity:0;transition:opacity 0.18s ease;';

    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    // Layer order (DOM bottom → top): skin, eyes, brows?, mouth, nose, hair?, glasses?
    const layers = [];

    layers.push({ src: pick(AVATAR_OPTIONS['Skin tone']), filter: null });
    layers.push({ src: pick(AVATAR_OPTIONS['Eyes']), filter: null });

    if (Math.random() < 0.75)
        layers.push({ src: pick(AVATAR_OPTIONS['Brows']), filter: null });

    layers.push({ src: pick(AVATAR_OPTIONS['Mouth']), filter: null });
    layers.push({ src: pick(AVATAR_OPTIONS['Nose']), filter: null });

    // 90% real hair, 10% bald category (none / bald_2 / bald_3 at equal probability)
    if (Math.random() < 0.9) {
        const hc = HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)];
        layers.push({ src: pick(AVATAR_OPTIONS['Hair'].slice(2)), filter: hc.filter || null });
    } else {
        const baldOpts = [null, AVATAR_OPTIONS['Hair'][0], AVATAR_OPTIONS['Hair'][1]];
        const baldSrc = pick(baldOpts);
        if (baldSrc) layers.push({ src: baldSrc, filter: null });
    }

    if (Math.random() < 0.2)
        layers.push({ src: pick(AVATAR_OPTIONS['Glasses']), filter: null });

    layers.forEach(({ src, filter }) => {
        const img = document.createElement('img');
        img.src = src;
        img.alt = '';
        img.draggable = false;
        img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;';
        if (filter) img.style.filter = filter;
        face.appendChild(img);
    });

    return face;
}

function makeDraggable(dot) {
    let grabbed     = false;
    let grabX       = 0, grabY = 0;
    let tx          = 0, ty    = 0;
    let velX        = 0, velY  = 0;
    let prevX       = 0, prevY = 0;
    let tiltX       = 0, tiltY = 0;
    let rafId       = null;
    let everGrabbed = false;

    dot._pendingLeave = null;  // set by spawnDot if leave fires while grabbed

    const tr = (scale = 1, rx = 0, ry = 0) =>
        `translate(${tx}px, ${ty}px) scale(${scale}) perspective(520px) rotateX(${rx}deg) rotateY(${ry}deg)`;

    const settle = () => {
        rafId = null;
        dot.style.zIndex = '';
        dot.style.scale = '';       // restore CSS hover scale
        dot.style.transform = tr(1, 0, 0);
        if (dot._pendingLeave) dot._pendingLeave();
    };

    const onDown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

        grabbed = true;
        everGrabbed = true;
        grabX = prevX = e.clientX;
        grabY = prevY = e.clientY;
        velX = velY = tiltX = tiltY = 0;

        dot.style.opacity = '1';
        dot.style.transition = 'none';
        dot.style.scale = '1';      // disable CSS hover scale while dragging
        dot.classList.remove('appearing', 'popping', 'floating', 'leaving');
        dot.style.transform = tr(1.1, 0, 0);
        dot.style.zIndex = '1000';
    };

    const onMove = (e) => {
        if (!grabbed) return;
        const dx = e.clientX - grabX;
        const dy = e.clientY - grabY;

        // Responsive velocity (less smoothing = snappier tilt)
        velX = (e.clientX - prevX) * 2 + velX * 0.1;
        velY = (e.clientY - prevY) * 2 + velY * 0.1;
        prevX = e.clientX;
        prevY = e.clientY;

        tiltX = Math.max(-60, Math.min(60, velY * -5));
        tiltY = Math.max(-60, Math.min(60, velX *  5));

        dot.style.transform = `translate(${tx + dx}px, ${ty + dy}px) scale(1.1) perspective(520px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
    };

    const onUp = (e) => {
        if (!grabbed) return;
        grabbed = false;
        tx += e.clientX - grabX;
        ty += e.clientY - grabY;

        let vx = velX * 3, vy = velY * 3;
        let rx = tiltX,    ry = tiltY;

        const step = () => {
            vx *= 0.90; vy *= 0.90;
            tx += vx;   ty += vy;
            rx *= 0.84; ry *= 0.84;

            dot.style.transform = tr(1, rx, ry);

            if (Math.abs(vx) > 0.35 || Math.abs(vy) > 0.35 || Math.abs(rx) > 0.5 || Math.abs(ry) > 0.5) {
                rafId = requestAnimationFrame(step);
            } else {
                settle();
            }
        };
        rafId = requestAnimationFrame(step);
    };

    dot.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    dot._cleanup = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    };
    dot._grabbed     = () => grabbed;
    dot._everGrabbed = () => everGrabbed;
    dot._tx          = () => tx;
    dot._ty          = () => ty;
}

function spawnDot() {
    const dot = document.createElement('div');
    const size = FACE_SIZES[Math.floor(Math.random() * FACE_SIZES.length)];
    const cW   = dotsContainer.offsetWidth  || window.innerWidth;
    const cH   = dotsContainer.offsetHeight || window.innerHeight;
    const padH = 24;   // side / bottom clearance
    const padT = 90;   // clear the nav bar at the top
    const x = padH + Math.random() * (cW - size - padH * 2);
    const y = padT + Math.random() * (cH - size - padH - padT);
    const idleMs   = 2500 + Math.random() * 3000;
    const floatDur = (2.5 + Math.random() * 2).toFixed(2) + 's';

    dot.className = 'dot appearing';
    dot.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        --float-dur: ${floatDur};
    `;

    const face = buildFace();
    dot.appendChild(face);
    dotsContainer.appendChild(dot);
    makeDraggable(dot);

    // Appear → pause as dot (~700ms) → pop into face
    setTimeout(() => {
        dot.style.opacity = '1';
        dot.classList.remove('appearing');
        dot.classList.add('popping');
        dot.style.background = 'transparent';
        requestAnimationFrame(() => { face.style.opacity = '1'; });
    }, 1100);   // 400ms appear + 700ms visible as dot

    // Float after pop
    setTimeout(() => {
        dot.classList.remove('popping');
        dot.classList.add('floating');
    }, 1600);   // 1100 + 500ms pop

    // Leave after idle — deferred if the dot is currently held
    const triggerLeave = () => {
        if (dot._cleanup) dot._cleanup();
        if (dot._everGrabbed()) {
            const finalTx = dot._tx(), finalTy = dot._ty();
            dot.style.transition = 'opacity 0.4s ease-in, transform 0.42s ease-in';
            dot.style.opacity = '0';
            dot.style.transform = `translate(${finalTx}px, ${finalTy}px) scale(0.75)`;
        } else {
            dot.classList.remove('floating');
            dot.classList.add('leaving');
        }
        setTimeout(() => { dot.remove(); spawnDot(); }, 450);
    };

    setTimeout(() => {
        if (dot._grabbed && dot._grabbed()) {
            dot._pendingLeave = triggerLeave;
        } else {
            triggerLeave();
        }
    }, 1600 + idleMs);
}

// Stagger initial spawn
for (let i = 0; i < TOTAL_DOTS; i++) {
    setTimeout(spawnDot, i * 350);
}

// ── Avatar customizer ──────────────────────────────────────────
const AVATAR_CATEGORIES = [
    'Skin tone', 'Hair', 'Eyes', 'Brows', 'Nose',
    'Mouth', 'Details', 'Glasses', 'Earrings'
];

const LAYER_IDS = {
    'Skin tone': 'layer-skin',
    'Hair':      'layer-hair',
    'Eyes':      'layer-eyes',
    'Brows':     'layer-brows',
    'Nose':      'layer-nose',
    'Mouth':     'layer-mouth',
    'Details':   'layer-details',
    'Glasses':   'layer-glasses',
    'Earrings':  'layer-earrings',
};

const HAIR_COLORS = [
    { id: 'dark',  swatch: '#1c1917', filter: 'brightness(0.15)' },
    { id: 'grey',  swatch: '#888580', filter: '' },
    { id: 'light', swatch: '#d6d0c8', filter: 'brightness(2.4) saturate(0)' },
];

const AVATAR_OPTIONS = {
    'Skin tone': [
        'Avatar components/Skin/Skin_1_antcora.svg',
        'Avatar components/Skin/Skin_2_antcora.svg',
        'Avatar components/Skin/Skin_3_antcora.svg',
        'Avatar components/Skin/Skin_4_antcora.svg',
        'Avatar components/Skin/Skin_5_antcora.svg',
        'Avatar components/Skin/Skin_6_antcora.svg',
    ],
    'Hair': [
        'Avatar components/Hair/Hair_bald_2_antcora.svg',
        'Avatar components/Hair/Hair_bald_3_antcora.svg',
        'Avatar components/Hair/Hair_two block grey.svg',
        'Avatar components/Hair/Hair_middle part grey.svg',
        'Avatar components/Hair/Hair_side part grey.svg',
        'Avatar components/Hair/Hair_long french grey.svg',
        'Avatar components/Hair/Hair_short french grey.svg',
        'Avatar components/Hair/Hair_tuppe grey.svg',
        'Avatar components/Hair/Hair_buzz cut grey.svg',
        'Avatar components/Hair/Hair_slick grey.svg',
        'Avatar components/Hair/Hair_fangs grey.svg',
        'Avatar components/Hair/Hair_bun grey.svg',
        'Avatar components/Hair/Hair_pony grey.svg',
        'Avatar components/Hair/Hair_middle bangs grey.svg',
        'Avatar components/Hair/Hair_open bangs grey.svg',
        'Avatar components/Hair/Hair_bangs cover grey.svg',
        'Avatar components/Hair/Hair_middle bangs cover grey.svg',
        'Avatar components/Hair/Hair_open bangs cover grey.svg',
    ],
    'Eyes': [
        'Avatar components/Eyes/Eyes_eyes 1.svg',
        'Avatar components/Eyes/Eyes_eyes 2.svg',
        'Avatar components/Eyes/Eyes_lashes 1.svg',
        'Avatar components/Eyes/Eyes_lashes 2.svg',
    ],
    'Brows': [
        'Avatar components/Brows/Brows_brows 1.svg',
        'Avatar components/Brows/Brows_brows 2.svg',
        'Avatar components/Brows/Brows_brows 3.svg',
        'Avatar components/Brows/Brows_brows 4.svg',
        'Avatar components/Brows/Brows_brows 5.svg',
        'Avatar components/Brows/Brows_brows 6.svg',
        'Avatar components/Brows/Brows_brows 7.svg',
        'Avatar components/Brows/Brows_brows 8.svg',
        'Avatar components/Brows/Brows_brows 9.svg',
    ],
    'Nose': [
        'Avatar components/Nose/Nose_nose 1.svg',
        'Avatar components/Nose/Nose_nose 2.svg',
        'Avatar components/Nose/Nose_nose 3.svg',
        'Avatar components/Nose/Nose_nose 4.svg',
        'Avatar components/Nose/Nose_nose 5.svg',
        'Avatar components/Nose/Nose_nose 6.svg',
        'Avatar components/Nose/Nose_nose 7.svg',
        'Avatar components/Nose/Nose_nose 8.svg',
        'Avatar components/Nose/Nose_nose 9.svg',
        'Avatar components/Nose/Nose_nose 10.svg',
        'Avatar components/Nose/Nose_nose 11.svg',
        'Avatar components/Nose/Nose_nose 12.svg',
    ],
    'Mouth': [
        'Avatar components/Mouth/Mouth_mouth 1.svg',
        'Avatar components/Mouth/Mouth_mouth 2.svg',
        'Avatar components/Mouth/Mouth_mouth 3.svg',
        'Avatar components/Mouth/Mouth_mouth 4.svg',
        'Avatar components/Mouth/Mouth_mouth 5.svg',
        'Avatar components/Mouth/Mouth_mouth 6.svg',
        'Avatar components/Mouth/Mouth_mouth 7.svg',
        'Avatar components/Mouth/Mouth_mouth 8.svg',
        'Avatar components/Mouth/Mouth_mouth 9.svg',
        'Avatar components/Mouth/Mouth_mouth 10.svg',
        'Avatar components/Mouth/Mouth_mouth 11.svg',
        'Avatar components/Mouth/Mouth_mouth 12.svg',
    ],
    'Details': [
        'Avatar components/Details/Details_cheeks.svg',
        'Avatar components/Details/Details_mole 1.svg',
        'Avatar components/Details/Details_mole 2.svg',
        'Avatar components/Details/Details_chin hair.svg',
        'Avatar components/Details/Details_moustache 1.svg',
        'Avatar components/Details/Details_moustache 2.svg',
        'Avatar components/Details/Details_jaw beard.svg',
        'Avatar components/Details/Details_beard 1.svg',
        'Avatar components/Details/Details_beard 2.svg',
    ],
    'Glasses': [
        'Avatar components/Glasses/Glasses_square glasses.svg',
        'Avatar components/Glasses/Glasses_round glasses.svg',
        'Avatar components/Glasses/Glasses_square sunglasses.svg',
        'Avatar components/Glasses/Glasses_round sunglasses.svg',
        'Avatar components/Glasses/Glasses_monocle.svg',
    ],
    'Earrings': [
        'Avatar components/Earrings/Earrings_earrings.svg',
        'Avatar components/Earrings/Earrings_earring.svg',
        'Avatar components/Earrings/Earrings_button earrings.svg',
    ],
};

// ── State ──
const MANDATORY_CATS = new Set(['Eyes', 'Nose', 'Mouth']);

const avatarState = {
    sel: Object.fromEntries(
        AVATAR_CATEGORIES.map(c => [
            c,
            (c === 'Skin tone' || MANDATORY_CATS.has(c))
                ? AVATAR_OPTIONS[c][0]
                : null
        ])
    ),
    hairColor: HAIR_COLORS[0],
    activeTab: 'Skin tone',
};

const tabsEl = document.getElementById('avatar-tabs');
const gridEl = document.getElementById('avatar-options-grid');

function currentSkin() {
    return avatarState.sel['Skin tone'] || AVATAR_OPTIONS['Skin tone'][0];
}

function setLayer(cat, src) {
    const id = LAYER_IDS[cat];
    [document.getElementById(id), document.getElementById('c' + id)].forEach(el => {
        if (!el) return;
        if (src) {
            el.src = src;
            el.style.display = '';
            if (cat === 'Hair') el.style.filter = avatarState.hairColor.filter;
        } else {
            el.src = '';
            el.style.display = 'none';
        }
    });
}

function applyHairColor() {
    ['layer-hair', 'clayer-hair'].forEach(id => {
        const el = document.getElementById(id);
        if (el && avatarState.sel['Hair']) el.style.filter = avatarState.hairColor.filter;
    });
    document.querySelectorAll('.opt-hair').forEach(img => {
        img.style.filter = avatarState.hairColor.filter;
    });
}

function makeOptStack(src, isHair) {
    const wrap = document.createElement('div');
    wrap.className = 'opt-stack';

    const skin = document.createElement('img');
    skin.className = 'opt-skin';
    skin.src = currentSkin();
    skin.alt = '';

    const layer = document.createElement('img');
    layer.className = 'opt-layer' + (isHair ? ' opt-hair' : '');
    layer.src = src;
    layer.alt = '';
    if (isHair) layer.style.filter = avatarState.hairColor.filter;

    wrap.appendChild(skin);
    wrap.appendChild(layer);
    return wrap;
}

function renderTabs() {
    tabsEl.innerHTML = '';
    AVATAR_CATEGORIES.forEach(cat => {
        const btn = document.createElement('div');
        btn.className = 'avatar-tab' + (cat === avatarState.activeTab ? ' active' : '');
        btn.textContent = cat;
        btn.setAttribute('role', 'button');
        btn.tabIndex = 0;
        btn.addEventListener('click', () => {
            avatarState.activeTab = cat;
            renderTabs();
            renderGrid();
        });
        tabsEl.appendChild(btn);
    });
}

function renderHairBar() {
    const bar = document.getElementById('hair-color-bar');
    if (!bar) return;
    const isHair = avatarState.activeTab === 'Hair';
    bar.style.display = isHair ? 'flex' : 'none';
    if (!isHair) return;
    bar.innerHTML = '';
    HAIR_COLORS.forEach(hc => {
        const sw = document.createElement('div');
        sw.className = 'hair-swatch' + (avatarState.hairColor.id === hc.id ? ' active' : '');
        sw.style.background = hc.swatch;
        sw.setAttribute('role', 'button');
        sw.tabIndex = 0;
        sw.addEventListener('click', () => {
            avatarState.hairColor = hc;
            bar.querySelectorAll('.hair-swatch').forEach(s => s.classList.remove('active'));
            sw.classList.add('active');
            applyHairColor();
        });
        bar.appendChild(sw);
    });
}

function renderGrid() {
    gridEl.innerHTML = '';
    const cat  = avatarState.activeTab;
    const opts = AVATAR_OPTIONS[cat];
    const cur  = avatarState.sel[cat];

    renderHairBar();

    if (opts.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'avatar-empty';
        msg.textContent = 'Coming soon';
        gridEl.appendChild(msg);
        setTimeout(updateGridLayout, 0);
        return;
    }

    // "None" for optional non-skin tabs only
    if (cat !== 'Skin tone' && !MANDATORY_CATS.has(cat)) {
        const nb = document.createElement('div');
        nb.className = 'avatar-option none-option' + (cur === null ? ' selected' : '');
        nb.setAttribute('role', 'button');
        nb.tabIndex = 0;
        const skinImg = document.createElement('img');
        skinImg.src = currentSkin();
        skinImg.alt = '';
        nb.appendChild(skinImg);
        nb.addEventListener('click', () => {
            avatarState.sel[cat] = null;
            setLayer(cat, null);
            renderGrid();
        });
        gridEl.appendChild(nb);
    }

    opts.forEach(src => {
        const btn = document.createElement('div');
        btn.className = 'avatar-option' + (cur === src ? ' selected' : '');
        btn.setAttribute('role', 'button');
        btn.tabIndex = 0;

        if (cat === 'Skin tone') {
            const img = document.createElement('img');
            img.src = src;
            img.alt = '';
            btn.appendChild(img);
        } else {
            btn.appendChild(makeOptStack(src, cat === 'Hair'));
        }

        btn.addEventListener('click', () => {
            avatarState.sel[cat] = src;
            setLayer(cat, src);
            renderGrid();
        });
        gridEl.appendChild(btn);
    });

    setTimeout(updateGridLayout, 0);
}

function updateGridLayout() {
    const scroll = document.getElementById('avatar-options-scroll');
    const grid   = document.getElementById('avatar-options-grid');
    if (!scroll || !grid) return;
    const gap = 14;
    const sz  = Math.floor((scroll.clientWidth - 2 * gap) / 3);
    scroll.style.setProperty('--item-sz', Math.max(sz, 60) + 'px');
}

window.addEventListener('resize', updateGridLayout);

// Init
AVATAR_CATEGORIES.forEach(cat => setLayer(cat, avatarState.sel[cat]));
renderTabs();
renderGrid();
setTimeout(updateGridLayout, 0);

// Community burst — fires once when section enters viewport
const communityBurst = document.getElementById('community-burst');
if (communityBurst) {
    new IntersectionObserver(([entry], obs) => {
        if (entry.isIntersecting) {
            communityBurst.classList.add('is-visible');
            obs.disconnect();
        }
    }, { threshold: 0.25 }).observe(communityBurst);
}

// ── ANTS showcase — per-avatar random layer mutations ──────────
(function () {
    const avatarEls = document.querySelectorAll('.ants-avatar');
    if (!avatarEls.length) return;

    function catFromSrc(src) {
        if (src.includes('/Skin/'))     return 'Skin tone';
        if (src.includes('/Eyes/'))     return 'Eyes';
        if (src.includes('/Brows/'))    return 'Brows';
        if (src.includes('/Earrings/')) return 'Earrings';
        if (src.includes('/Details/'))  return 'Details';
        if (src.includes('/Mouth/'))    return 'Mouth';
        if (src.includes('/Nose/'))     return 'Nose';
        if (src.includes('/Hair/'))     return 'Hair';
        if (src.includes('/Glasses/'))  return 'Glasses';
        return null;
    }

    function mutateOne(avatarEl) {
        const candidates = Array.from(avatarEl.querySelectorAll('img'))
            .map(img => ({ el: img, cat: catFromSrc(img.src) }))
            .filter(({ cat }) => cat && AVATAR_OPTIONS[cat] && AVATAR_OPTIONS[cat].length > 1);

        if (!candidates.length) return;

        const WEIGHTS = { 'Skin tone': 3, 'Hair': 3 };
        const weighted = candidates.flatMap(c => Array(WEIGHTS[c.cat] || 1).fill(c));
        const { el, cat } = weighted[Math.floor(Math.random() * weighted.length)];
        const opts   = AVATAR_OPTIONS[cat];
        const current = el.getAttribute('src');

        // Pick a different option
        let newSrc = current;
        for (let i = 0; i < 20 && newSrc === current; i++) {
            newSrc = opts[Math.floor(Math.random() * opts.length)];
        }
        if (newSrc === current) return;

        el.setAttribute('src', newSrc);
        if (cat === 'Hair') {
            const isBald = newSrc.includes('bald_2') || newSrc.includes('bald_3');
            el.style.filter = isBald ? '' : (HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)].filter || '');
        }
    }

    // Each avatar runs its own independent mutation loop
    avatarEls.forEach((avatarEl, i) => {
        function loop() {
            mutateOne(avatarEl);
            setTimeout(loop, 3000 + Math.random() * 3500);
        }
        // Stagger start so mutations don't all fire at once
        setTimeout(loop, 2000 + i * 250 + Math.random() * 600);

        avatarEl.addEventListener('click', () => mutateOne(avatarEl));
    });
})();

// ── Page-wide dark wave tied to badges section ────────────────
(function () {
    const section = document.querySelector('.badges-section');
    if (!section) return;

    const titleEl = section.querySelector('.badges-title');
    const descEl  = section.querySelector('.badges-desc');
    const btnEl   = section.querySelector('.badges-content .btn-pill');
    const navEl   = document.querySelector('.nav-logo');
    const navBtn  = document.querySelector('.nav-btn');

    const CREAM       = [237, 232, 220];
    const DARK        = [30,  28,  26 ];
    const WHITE       = [255, 255, 255];
    const MUTED_DARK  = [74,  69,  64 ];
    const MUTED_LIGHT = [160, 155, 148];

    function lerp(a, b, t) { return a + (b - a) * t; }
    function lerpC(c1, c2, t) { return c1.map((v, i) => Math.round(lerp(v, c2[i], t))); }
    function rgb(c)  { return `rgb(${c[0]},${c[1]},${c[2]})`; }
    function ease(t) { return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2; }

    let rafPending = false;

    function update() {
        rafPending = false;

        const rect    = section.getBoundingClientRect();
        const sH      = section.offsetHeight;
        const vpH     = window.innerHeight;
        const scrollY = window.pageYOffset;

        // Absolute positions (constant regardless of scroll)
        const secCenter = scrollY + rect.top + sH * 0.5;
        const secBottom = scrollY + rect.top + sH;

        // Trapezoid envelope:
        //  Rise  0→1  from darkStart  → fullDarkAt  (section entering, before center)
        //  Flat  1    from fullDarkAt → startFall   (fully dark through + past center)
        //  Fall  1→0  from startFall  → lightAgain  (section exiting, back to cream)
        const darkStart  = secCenter - vpH * 1.0;   // start darkening as section enters
        const fullDarkAt = secCenter - vpH * 0.65;  // fully black before section reaches center
        const startFall  = secCenter - vpH * 0.1;   // hold dark past center, then release
        const lightAgain = secBottom;               // cream restored when section has scrolled off

        let rawD;
        if      (scrollY <= darkStart)  rawD = 0;
        else if (scrollY < fullDarkAt)  rawD = (scrollY - darkStart)  / (fullDarkAt - darkStart);
        else if (scrollY < startFall)   rawD = 1;
        else if (scrollY < lightAgain)  rawD = (lightAgain - scrollY) / (lightAgain - startFall);
        else                            rawD = 0;

        const d = ease(rawD);

        // ── Whole-page background (<html> paints the viewport canvas) ──
        const bgVal = rgb(lerpC(CREAM, DARK, d));
        document.documentElement.style.backgroundColor = bgVal;
        document.body.style.backgroundColor = bgVal;

        // ── Nav ──
        if (navEl)  navEl.style.color    = rgb(lerpC(DARK,  WHITE, d));
        if (navBtn) {
            navBtn.style.backgroundColor = rgb(lerpC(DARK,  WHITE, d));
            navBtn.style.color           = rgb(lerpC(CREAM, DARK,  d));
        }

        // ── Badges section text + button ──
        if (titleEl) titleEl.style.color        = rgb(lerpC(DARK,       WHITE,       d));
        if (descEl)  descEl.style.color         = rgb(lerpC(MUTED_DARK, MUTED_LIGHT, d));
        if (btnEl) {
            btnEl.style.backgroundColor         = rgb(lerpC(DARK,  WHITE, d));
            btnEl.style.color                   = rgb(lerpC(CREAM, DARK,  d));
        }
    }

    window.addEventListener('scroll', () => {
        if (!rafPending) { rafPending = true; requestAnimationFrame(update); }
    }, { passive: true });

    window.addEventListener('resize', update);
    update();
})();

// ── Custom overlay scrollbar for avatar options ───────────────
(function () {
    const scroll = document.getElementById('avatar-options-scroll');
    const card   = scroll && scroll.closest('.avatar-options-card');
    if (!scroll || !card) return;

    const track = document.createElement('div');
    track.className = 'avatar-scrollbar';
    const thumb = document.createElement('div');
    thumb.className = 'avatar-scrollbar-thumb';
    track.appendChild(thumb);
    card.appendChild(track);

    function positionTrack() {
        // Align track exactly with the scroll container bounds (offsetParent = card)
        track.style.top    = scroll.offsetTop + 'px';
        track.style.height = scroll.clientHeight + 'px';
        track.style.right  = (card.offsetWidth - scroll.offsetLeft - scroll.offsetWidth) + 'px';
        track.style.bottom = 'auto';
    }

    function updateThumb() {
        const { scrollTop, scrollHeight, clientHeight } = scroll;
        const needsScroll = scrollHeight > clientHeight + 1;
        track.classList.toggle('is-visible', needsScroll);
        if (!needsScroll) return;

        const trackH = track.clientHeight;
        const thumbH = Math.max(20, Math.round((clientHeight / scrollHeight) * trackH));
        const range  = scrollHeight - clientHeight;
        const thumbY = range > 0 ? Math.round((scrollTop / range) * (trackH - thumbH)) : 0;
        thumb.style.height = thumbH + 'px';
        thumb.style.top    = thumbY + 'px';
    }

    function update() { positionTrack(); updateThumb(); }

    const grid = document.getElementById('avatar-options-grid');

    scroll.addEventListener('scroll', updateThumb, { passive: true });
    new ResizeObserver(update).observe(scroll);
    if (grid) new ResizeObserver(updateThumb).observe(grid);
    update();
})();

// ── Notif carousel ─────────────────────────────────────────────
(() => {
    const track    = document.getElementById('notif-track');
    const dotsWrap = document.getElementById('notif-dots');
    const carousel = document.getElementById('notif-carousel');
    if (!track || !dotsWrap || !carousel) return;

    const dots = Array.from(dotsWrap.querySelectorAll('.notif-dot'));
    const REAL = dots.length;

    // DOM: [cloneLast, card1, card2, card3, cloneFirst]
    track.insertBefore(track.lastElementChild.cloneNode(true), track.firstElementChild);
    track.appendChild(track.children[1].cloneNode(true));

    // pos: DOM index — real cards at 1…REAL, clones at 0 and REAL+1
    let pos = 1;
    let busy = false;

    function cw()  { return track.children[1].offsetWidth; }
    function gap() { return parseInt(getComputedStyle(track).gap) || 20; }

    function setDots(i) {
        dots.forEach((d, j) => d.classList.toggle('notif-dot--active', j === i));
    }

    function moveTo(p, silent = false) {
        if (silent) track.style.transition = 'none';
        track.style.transform = `translateX(${-p * (cw() + gap())}px)`;
        if (silent) { track.offsetHeight; track.style.transition = ''; }
    }

    // Inicializar en la primera card real sin animación
    moveTo(1, true);
    setDots(0);

    function advance() {
        if (busy) return;
        busy = true;
        pos++;
        moveTo(pos);
        setDots(pos > REAL ? 0 : pos - 1);
        if (pos > REAL) {
            track.addEventListener('transitionend', () => {
                pos = 1;
                moveTo(1, true);
                busy = false;
            }, { once: true });
        } else {
            track.addEventListener('transitionend', () => { busy = false; }, { once: true });
        }
    }

    function retreat() {
        if (busy) return;
        busy = true;
        pos--;
        moveTo(pos);
        setDots(pos < 1 ? REAL - 1 : pos - 1);
        if (pos < 1) {
            track.addEventListener('transitionend', () => {
                pos = REAL;
                moveTo(REAL, true);
                busy = false;
            }, { once: true });
        } else {
            track.addEventListener('transitionend', () => { busy = false; }, { once: true });
        }
    }

    dots.forEach((dot, i) => dot.addEventListener('click', () => {
        if (busy) return;
        pos = i + 1;
        moveTo(pos);
        setDots(i);
    }));

    carousel.addEventListener('click', e => {
        const x = e.clientX - carousel.getBoundingClientRect().left;
        if (x > cw() + gap()) advance();
        if (x < 0) retreat();
    });

    let touchX = 0;
    track.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener('touchend', e => {
        const diff = touchX - e.changedTouches[0].clientX;
        if (Math.abs(diff) < 40) return;
        diff > 0 ? advance() : retreat();
    });
})();

// ── Reading Radius animation ────────────────────────────────────
(() => {
    const container  = document.querySelector('.radius-anim');
    const sharpLayer = document.querySelector('.ra-layer--sharp');
    const scope      = document.querySelector('.ra-scope');
    const ring       = document.querySelector('.ra-ring');
    if (!container || !sharpLayer || !scope || !ring) return;

    // Waypoints as [x%, y%] within the container
    const pts = [
        [50, 50], [32, 33], [66, 30], [70, 60],
        [42, 68], [34, 45], [60, 36], [50, 50]
    ];
    const DURATION = 18000;

    function easeInOut(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    function getXY(ms) {
        const n      = pts.length - 1;
        const segMs  = DURATION / n;
        const t0     = ms % DURATION;
        const seg    = Math.min(Math.floor(t0 / segMs), n - 1);
        const t      = easeInOut((t0 - seg * segMs) / segMs);
        const [x0, y0] = pts[seg];
        const [x1, y1] = pts[seg + 1];
        return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    }

    let start = null;

    function tick(ts) {
        if (start === null) start = ts;
        const [px, py] = getXY(ts - start);

        const W = container.offsetWidth;
        const H = container.offsetHeight;
        const r = ring.offsetWidth / 2;   // exact pixel radius — always matches the ring
        const x = px / 100 * W;
        const y = py / 100 * H;

        sharpLayer.style.clipPath = `circle(${r}px at ${x}px ${y}px)`;
        scope.style.transform     = `translate(${x - W / 2}px, ${y - H / 2}px)`;

        requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
})();

// ── 3D Earth globe ─────────────────────────────────────────
(() => {
    const el = document.getElementById('earth-canvas');
    if (!el) return;

    const dpr  = window.devicePixelRatio || 1;
    const CSS  = 160;
    el.width   = CSS * dpr;
    el.height  = CSS * dpr;
    const gctx = el.getContext('2d');
    gctx.scale(dpr, dpr);

    const cx = CSS / 2;
    const cy = CSS / 2;
    const R  = CSS * 0.44;   // ~70 px radius

    // Cycle timing (ms)
    const T_GLOBE   = 2800;  // globe visible, rotating
    const T_FILL    = 1400;  // fill to black
    const T_BLACK   = 2200;  // stay as dot
    const T_UNFILL  = 1400;  // uncover to globe
    const TOTAL = T_GLOBE + T_FILL + T_BLACK + T_UNFILL;

    const ROT_SPEED = 0.55; // rad/s

    function ease(t) { return t < .5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2; }

    // --- wireframe drawing ---
    function drawWire(rot, alpha) {
        const LATS = [-60, -30, 0, 30, 60];
        const MERS = 12;

        // latitude parallels: front arc solid, back arc dashed + dim
        for (const deg of LATS) {
            const phi = deg * Math.PI / 180;
            const r   = R * Math.cos(phi);
            const sy  = cy - R * Math.sin(phi);

            // back (dashed)
            gctx.strokeStyle = `rgba(30,28,26,${alpha * 0.22})`;
            gctx.lineWidth   = 0.7;
            gctx.setLineDash([2, 4]);
            gctx.beginPath();
            let on = false;
            for (let t = 0; t <= Math.PI * 2 + 0.05; t += 0.03) {
                const z  = Math.cos(phi) * Math.cos(t + rot);
                const sx = cx + r * Math.sin(t + rot);
                if (z < 0) {
                    on ? gctx.lineTo(sx, sy) : gctx.moveTo(sx, sy);
                    on = true;
                } else { on = false; }
            }
            gctx.stroke();
            gctx.setLineDash([]);

            // front (solid)
            gctx.strokeStyle = `rgba(30,28,26,${alpha * 0.9})`;
            gctx.beginPath();
            on = false;
            for (let t = 0; t <= Math.PI * 2 + 0.05; t += 0.03) {
                const z  = Math.cos(phi) * Math.cos(t + rot);
                const sx = cx + r * Math.sin(t + rot);
                if (z >= 0) {
                    on ? gctx.lineTo(sx, sy) : gctx.moveTo(sx, sy);
                    on = true;
                } else { on = false; }
            }
            gctx.stroke();
        }

        // longitude meridians: front solid, back dashed + dim
        for (let i = 0; i < MERS; i++) {
            const lam   = (i / MERS) * Math.PI * 2;
            const zFace = Math.cos(lam + rot);
            const pts   = [];
            for (let j = 0; j <= 60; j++) {
                const p  = (j / 60) * Math.PI - Math.PI / 2;
                pts.push([cx + R * Math.cos(p) * Math.sin(lam + rot), cy - R * Math.sin(p)]);
            }

            // back
            gctx.strokeStyle = `rgba(30,28,26,${alpha * 0.22})`;
            gctx.lineWidth   = 0.7;
            gctx.setLineDash([2, 4]);
            if (zFace < 0) {
                gctx.beginPath();
                pts.forEach(([x, y], j) => j === 0 ? gctx.moveTo(x, y) : gctx.lineTo(x, y));
                gctx.stroke();
            }
            gctx.setLineDash([]);

            // front
            if (zFace >= 0) {
                gctx.strokeStyle = `rgba(30,28,26,${alpha * 0.9})`;
                gctx.beginPath();
                pts.forEach(([x, y], j) => j === 0 ? gctx.moveTo(x, y) : gctx.lineTo(x, y));
                gctx.stroke();
            }
        }
    }

    // --- 3D black hemisphere (terminator sweep) ---
    // coverageAngle 0→π: amount of black coverage
    // filling=true  → black enters from LEFT, grows rightward
    // filling=false → black retreats to RIGHT, shrinks rightward
    function drawBlackHemisphere(coverageAngle, filling) {
        if (coverageAngle <= 0) return;
        const cosA  = Math.cos(coverageAngle);
        const steps = 80;

        gctx.beginPath();
        gctx.moveTo(cx, cy - R);
        for (let i = 0; i <= steps; i++) {
            const phi = Math.PI / 2 - (i / steps) * Math.PI;
            // fill: terminator starts at left edge (−cosA), sweeps right
            // uncover: terminator starts at left edge (+cosA reversed), retreats right
            const tx = filling ? cx - R * cosA * Math.cos(phi)
                               : cx + R * cosA * Math.cos(phi);
            gctx.lineTo(tx, cy - R * Math.sin(phi));
        }
        // fill: close with LEFT arc  (clockwise,        anticlockwise=false)
        // uncover: close with RIGHT arc (anticlockwise, anticlockwise=true)
        gctx.arc(cx, cy, R, Math.PI / 2, -Math.PI / 2, !filling);
        gctx.closePath();
        gctx.fillStyle = '#1e1c1a';
        gctx.fill();
    }

    // --- full frame ---
    function render(rot, bp, filling) {
        gctx.clearRect(0, 0, CSS, CSS);
        drawWire(rot, 1.0);
        if (bp > 0) drawBlackHemisphere(bp * Math.PI, filling);
        gctx.beginPath();
        gctx.arc(cx, cy, R, 0, Math.PI * 2);
        gctx.strokeStyle = '#1e1c1a';
        gctx.lineWidth   = 1.3;
        gctx.stroke();
    }

    let t0 = null;
    function tick(ts) {
        if (!t0) t0 = ts;
        const elapsed = (ts - t0) % TOTAL;
        const rot     = ((ts - t0) / 1000) * ROT_SPEED;

        let bp = 0, filling = true;
        if (elapsed < T_GLOBE) {
            bp = 0;
        } else if (elapsed < T_GLOBE + T_FILL) {
            bp = ease((elapsed - T_GLOBE) / T_FILL);
            filling = true;   // black enters from left
        } else if (elapsed < T_GLOBE + T_FILL + T_BLACK) {
            bp = 1;
        } else {
            bp = 1 - ease((elapsed - T_GLOBE - T_FILL - T_BLACK) / T_UNFILL);
            filling = false;  // black retreats to right
        }

        render(rot, bp, filling);
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
})();
