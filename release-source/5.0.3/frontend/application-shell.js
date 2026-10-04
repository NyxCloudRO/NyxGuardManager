/* Layout only: attach scroll ownership to the existing bounded page frame.
 * No route state, API, data, form or navigation behavior is changed here. */
(function () {
  'use strict';
  function connectFrame() {
    const main = document.querySelector('.nyx-dashboard-viewport');
    if (!main) return;
    const support = main.querySelector(':scope > .nyx-support-page');
    const bounded = main.querySelector('.nyx-route-content .container-xl,.nyx-route-content .container-tight');
    const frame = support || bounded;
    if (!frame) return;
    if (!frame.classList.contains('nyx-central-scroll-frame')) {
      frame.classList.add('nyx-central-scroll-frame');
      if (!frame.hasAttribute('tabindex')) frame.setAttribute('tabindex', '0');
      if (!frame.hasAttribute('role')) frame.setAttribute('role', 'region');
      if (!frame.hasAttribute('aria-label')) frame.setAttribute('aria-label', 'Page content');
    }
    for (let bridge = frame.parentElement; bridge && bridge !== main; bridge = bridge.parentElement) {
      if (!bridge.classList.contains('nyx-scroll-bridge')) bridge.classList.add('nyx-scroll-bridge');
    }
  }
  connectFrame();
  new MutationObserver(connectFrame).observe(document.documentElement, {childList: true, subtree: true});
})();
