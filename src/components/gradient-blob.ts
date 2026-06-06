/**
 * <gradient-blob> — fixed full-viewport animated gradient background with a
 * goo-filtered blob that lazily follows the cursor.
 *
 * Renders into light DOM (styles in styles.css): the goo effect relies on
 * `filter: url(#goo)` resolving against the document, which is unreliable
 * across a shadow boundary.
 */
export class GradientBlob extends HTMLElement {
  #frameId = 0;
  #abort = new AbortController();

  connectedCallback() {
    this.innerHTML = /* html */ `
      <svg xmlns="http://www.w3.org/2000/svg" class="goo-defs" aria-hidden="true">
        <defs>
          <filter id="goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="goo" />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      <div class="gradients-container">
        <div class="g1"></div>
        <div class="g2"></div>
        <div class="g3"></div>
        <div class="g4"></div>
        <div class="g5"></div>
        <div class="interactive"></div>
      </div>
    `;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const blob = this.querySelector<HTMLDivElement>('.interactive')!;
    let curX = 0;
    let curY = 0;
    let tgX = 0;
    let tgY = 0;

    const move = () => {
      curX += (tgX - curX) / 20;
      curY += (tgY - curY) / 20;
      blob.style.transform = `translate(${Math.round(curX)}px, ${Math.round(curY)}px)`;
      this.#frameId = requestAnimationFrame(move);
    };

    window.addEventListener(
      'mousemove',
      (event) => {
        tgX = event.clientX;
        tgY = event.clientY;
      },
      { signal: this.#abort.signal }
    );

    this.#frameId = requestAnimationFrame(move);
  }

  disconnectedCallback() {
    this.#abort.abort();
    cancelAnimationFrame(this.#frameId);
  }
}

customElements.define('gradient-blob', GradientBlob);
