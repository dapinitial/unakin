import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import './components/gradient-blob';
import './components/scramble-text';
import './components/wait-list';

// three.js is the heavy dependency — load the heart lazily so the static
// content paints immediately.
import('./components/heart-model');

gsap.registerPlugin(ScrollTrigger);

// Fade the banner out as it scrolls away.
gsap.fromTo(
  '.banner',
  { opacity: 1 },
  {
    opacity: 0,
    scrollTrigger: {
      trigger: '.banner',
      start: 'top top',
      end: 'bottom top',
      scrub: true,
    },
  }
);

// Reveal the definition only as you scroll into the lore section.
gsap.from('.definition', {
  opacity: 0,
  y: 40,
  scrollTrigger: {
    trigger: '.lore',
    start: 'top 85%',
    end: 'top 45%',
    scrub: true,
  },
});

// Signup success → swap the hero to the "you're in" scene; go-back reverts.
const banner = document.querySelector<HTMLElement>('.banner');
if (banner) {
  banner.addEventListener('waitlist:success', () => {
    banner.dataset.state = 'done';
    ScrollTrigger.refresh();
  });

  banner
    .querySelector<HTMLButtonElement>('[data-action="go-back"]')
    ?.addEventListener('click', () => {
      banner.dataset.state = 'prompt';
      document
        .querySelector('wait-list')
        ?.dispatchEvent(new CustomEvent('waitlist:reset'));
      ScrollTrigger.refresh();
    });
}
