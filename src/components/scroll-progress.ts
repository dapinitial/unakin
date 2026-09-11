/**
 * <scroll-progress> — David's radial scroll-progress ring that doubles as a back-to-top button
 * (ported from davidpuerto.com), in the Unakin skin: glass puck, violet→accent→mint stroke.
 * Fades in after 50px of scroll; the ring's stroke tracks how far down the page you are.
 * Optional `label` attribute renders a small readout under the puck (deck mode: "7 / 28").
 */
export class ScrollProgress extends HTMLElement {
  #ac = new AbortController();

  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { position: fixed; right: 14px; bottom: 14px; z-index: 60; display: grid; justify-items: center; gap: 6px; pointer-events: none; }
        .wrap {
          pointer-events: auto; cursor: pointer; width: 44px; height: 44px; padding: 0; border: 1px solid rgba(255,255,255,.28); border-radius: 50%;
          background: rgba(255,255,255,.12); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
          box-shadow: 0 10px 30px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.25);
          position: relative; opacity: 0; transform: translateY(90px); transition: transform .35s cubic-bezier(.2,.8,.2,1), opacity .35s ease; will-change: transform;
        }
        .wrap.visible { opacity: 1; transform: translateY(0); }
        svg.ring { position: absolute; inset: 0; width: 100%; height: 100%; }
        svg.ring path { fill: none; stroke-width: 3.5; stroke-linecap: round; }
        .arrow { position: absolute; inset: 0; display: grid; place-items: center; color: #f4f5fb; transition: transform .25s ease; }
        .arrow svg { width: 14px; height: 14px; }
        .wrap:hover .arrow { transform: translateY(-2px); }
        .wrap:focus-visible { outline: 2px solid #bcc0ff; outline-offset: 2px; }
        .label { pointer-events: none; font: 500 10px/1 ui-monospace, Menlo, monospace; letter-spacing: .12em; color: #9a9fc4; opacity: 0; transition: opacity .35s ease; }
        .label.visible { opacity: 1; }
        @media (prefers-reduced-motion: reduce) { .wrap, .arrow, .label { transition: none; } }
      </style>
      <button type="button" class="wrap" aria-label="Scroll back to top">
        <svg class="ring" viewBox="-1 -1 102 102" aria-hidden="true">
          <defs>
            <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0" stop-color="rgba(255,255,255,.55)"/><stop offset="1" stop-color="#ffffff"/>
            </linearGradient>
          </defs>
          <path d="M50,1 a49,49 0 0,1 0,98 a49,49 0 0,1 0,-98" stroke="url(#g)"/>
        </svg>
        <span class="arrow" aria-hidden="true">
          ${this.getAttribute('icon') === 'book'
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5V5.5M20 18v3H6.5"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`}
        </span>
      </button>
      <span class="label"></span>`;

    const wrap = shadow.querySelector<HTMLButtonElement>('.wrap')!;
    const path = shadow.querySelector<SVGPathElement>('svg.ring path')!;
    const label = shadow.querySelector<HTMLElement>('.label')!;
    const L = path.getTotalLength();
    path.style.strokeDasharray = `${L} ${L}`;
    path.style.strokeDashoffset = `${L}`;

    // Two sources of truth: page scroll (default) or an explicit `progress` attribute (0–1) for
    // pages that don't scroll (the beat engine). Click emits `totop` and, if nothing handles it,
    // scrolls the window to the top.
    const onScroll = () => {
      const explicit = this.getAttribute('progress');
      let p: number, on: boolean;
      if (explicit !== null) { p = Math.max(0, Math.min(1, parseFloat(explicit) || 0)); on = p > 0.02; }
      else { const height = document.documentElement.scrollHeight - window.innerHeight; p = height > 0 ? Math.min(window.scrollY, height) / height : 0; on = window.scrollY > 50; }
      wrap.classList.toggle('visible', on);
      label.classList.toggle('visible', on && !!label.textContent);
      path.style.strokeDashoffset = `${L - p * L}`;
    };
    const { signal } = this.#ac;
    window.addEventListener('scroll', onScroll, { passive: true, signal });
    window.addEventListener('resize', onScroll, { passive: true, signal });
    wrap.addEventListener('click', () => {
      const ev = new CustomEvent('totop', { cancelable: true }); this.dispatchEvent(ev);
      if (this.getAttribute('progress') === null) window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }, { signal });
    new MutationObserver(() => { label.textContent = this.getAttribute('label') ?? ''; onScroll(); }).observe(this, { attributes: true, attributeFilter: ['label', 'progress'] });
    label.textContent = this.getAttribute('label') ?? '';
    onScroll();
  }

  disconnectedCallback() { this.#ac.abort(); }
}

customElements.define('scroll-progress', ScrollProgress);
