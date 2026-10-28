/* Marks sticky elements with data-stuck while they are pinned, so they only get a frosted
   background when something actually scrolls underneath them (styles.css .dd-stick). */
export function trackStuck(root: HTMLElement | Window, selector: string, scope: ParentNode = document) {
  let frame = 0;
  const update = () => {
    frame = 0;
    const top = root instanceof Window ? 0 : root.getBoundingClientRect().top;
    scope.querySelectorAll<HTMLElement>(selector).forEach(el => {
      const pin = parseFloat(getComputedStyle(el).top) || 0;
      const stuck = el.getBoundingClientRect().top <= top + pin + 0.5 && (root instanceof Window ? scrollY : (root as HTMLElement).scrollTop) > 0;
      if (stuck) el.setAttribute('data-stuck', '');
      else el.removeAttribute('data-stuck');
    });
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  root.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();
  return () => {
    cancelAnimationFrame(frame);
    root.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
  };
}
