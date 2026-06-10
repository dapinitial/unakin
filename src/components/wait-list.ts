/**
 * <wait-list endpoint="/api/signup"> — email capture for the unakin waitlist.
 *
 * OPSEC by construction:
 *  - collects only an email; no cookies, no analytics, no third-party requests
 *  - icons are inline SVG (an icon CDN would leak every visitor's IP)
 *  - a honeypot field (`company`) traps bots; humans never see it
 *  - the server hashes IPs, rate-limits, and never reveals if an email is
 *    already on the list — so this form can't be used to enumerate members
 *
 * The privacy chips make three literally-true claims: replies land in a
 * Proton-encrypted inbox, we store only your email, and nothing on this page
 * talks to a third party.
 */
// Official Proton "P" mark — extracted from Proton's brand SVG (wordmark
// dropped, viewBox cropped to the glyph). Inlined so there's no third-party
// request.
const PROTON_ICON = /* html */ `
  <svg class="proton-mark" viewBox="0 0 20 25" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <path d="M.299 18.12v6.38h4.478v-6.103a2.24 2.24 0 0 1 2.24-2.24h4.591a8.08 8.08 0 0 0 8.077-8.078A8.079 8.079 0 0 0 11.607 0H.3v7.975h4.478v-3.76h6.528a3.823 3.823 0 0 1 3.823 3.822 3.823 3.823 0 0 1-3.823 3.822H6.56A6.258 6.258 0 0 0 .3 18.12Z" fill="#6D4AFF"/>
    <path d="M7.015 16.158A6.717 6.717 0 0 0 .3 22.874v1.627h4.478v-6.104a2.24 2.24 0 0 1 2.238-2.24Z" fill="url(#proton-mark-grad)"/>
    <defs>
      <linearGradient gradientUnits="userSpaceOnUse" id="proton-mark-grad" x1="3.657" x2="3.657" y1="23.294" y2="13.919">
        <stop stop-color="#6D4BFD"/>
        <stop offset="1" stop-color="#1C0554"/>
      </linearGradient>
    </defs>
  </svg>`;

const MAIL_ICON = /* html */ `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.6"/>
  </svg>`;

const NOTRACK_ICON = /* html */ `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <path d="M6.5 6.5 17.5 17.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
  </svg>`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export class WaitList extends HTMLElement {
  #abort = new AbortController();

  connectedCallback() {
    const endpoint = this.getAttribute('endpoint') ?? '/api/signup';

    this.innerHTML = /* html */ `
      <form class="waitlist" novalidate>
        <div class="waitlist-row">
          <label class="visually-hidden" for="wl-email">Email address</label>
          <input
            id="wl-email"
            type="email"
            name="email"
            inputmode="email"
            autocomplete="email"
            placeholder="your@email.com"
            required
          />
          <!-- honeypot: off-screen, not focusable, bots fill it -->
          <input
            class="visually-hidden"
            type="text"
            name="company"
            tabindex="-1"
            autocomplete="off"
            aria-hidden="true"
          />
          <button type="submit">be first</button>
        </div>
        <p class="waitlist-status" role="status" aria-live="polite"></p>
        <p class="waitlist-trust">
          <span class="chip chip-proton" tabindex="0">
            ${PROTON_ICON}<a href="https://proton.me" target="_blank" rel="noopener noreferrer">Encrypted via Proton</a>
            <span class="tip" role="tooltip">Secured by Proton Mail — replies reach our encrypted inbox</span>
          </span>
          <span class="chip">${MAIL_ICON}Email only</span>
          <span class="chip">${NOTRACK_ICON}No tracking</span>
        </p>
      </form>
    `;

    const form = this.querySelector('form')!;
    const input = this.querySelector<HTMLInputElement>('#wl-email')!;
    const honeypot = this.querySelector<HTMLInputElement>('[name="company"]')!;
    const button = this.querySelector('button')!;
    const status = this.querySelector<HTMLParagraphElement>('.waitlist-status')!;

    const setStatus = (msg: string, kind: 'ok' | 'err' | '') => {
      status.textContent = msg;
      status.dataset.kind = kind;
    };

    form.addEventListener(
      'submit',
      async (event) => {
        event.preventDefault();
        const email = input.value.trim();

        if (!EMAIL_RE.test(email)) {
          setStatus('That email looks off — mind checking it?', 'err');
          input.focus();
          return;
        }

        button.disabled = true;
        setStatus('Adding you…', '');

        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, company: honeypot.value }),
            signal: AbortSignal.timeout(10_000),
          });

          if (res.ok) {
            // Hand off to the page, which swaps the hero to the "you're in"
            // scene. Keep the form intact so go-back can restore it.
            input.value = '';
            setStatus('', '');
            this.dispatchEvent(
              new CustomEvent('waitlist:success', {
                bubbles: true,
                composed: true,
                detail: { email },
              })
            );
            return;
          }
          if (res.status === 429) {
            setStatus('Easy there — try again in a minute.', 'err');
          } else {
            setStatus('Something hiccuped. Try again?', 'err');
          }
        } catch {
          setStatus('Network trouble — try again?', 'err');
        } finally {
          button.disabled = false;
        }
      },
      { signal: this.#abort.signal }
    );

    // The page fires this when the visitor taps "go back" from the
    // confirmation scene — return the form to a clean state.
    this.addEventListener(
      'waitlist:reset',
      () => {
        input.value = '';
        honeypot.value = '';
        button.disabled = false;
        setStatus('', '');
      },
      { signal: this.#abort.signal }
    );
  }

  disconnectedCallback() {
    this.#abort.abort();
  }
}

customElements.define('wait-list', WaitList);
