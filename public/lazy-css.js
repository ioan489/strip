/**
 * lazy-css.js
 *
 * Swaps deferred stylesheets from media="print" to media="all" after load.
 *
 * Served from /public so it is copied to dist/client/lazy-css.js by Vite
 * and served at /lazy-css.js. Being an external file means it is covered by
 * `script-src 'self'` in the Content-Security-Policy — no 'unsafe-inline'
 * exemption needed for scripts, which was the only reason the inline version
 * required it.
 *
 * Loaded as <script src="/lazy-css.js"> by head-builder.js when any deferred
 * stylesheet is present on the page.
 */

(function () {
  // MutationObserver: catches stylesheets injected dynamically after parse
  // (e.g. by client-side navigation or late island hydration).
  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var nodes = mutations[i].addedNodes;
      for (var j = 0; j < nodes.length; j++) {
        var el = nodes[j];
        if (el instanceof HTMLLinkElement && el.dataset.jsLazyStyle !== undefined) {
          el.addEventListener('load', function () {
            this.media = 'all';
          });
        }
      }
    }
  });
  observer.observe(document.head, { childList: true });

  // DOMContentLoaded: catches stylesheets already in the DOM at parse time.
  document.addEventListener('DOMContentLoaded', function () {
    var links = document.querySelectorAll('link[data-js-lazy-style]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].media !== 'all') {
        links[i].media = 'all';
      }
    }
  });
})();
