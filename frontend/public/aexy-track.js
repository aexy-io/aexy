/**
 * Aexy Tracking Pixel — lightweight visitor tracking (<5KB)
 *
 * Usage:
 *   <script src="https://yourapp.com/aexy-track.js"
 *           data-workspace="WORKSPACE_ID"
 *           data-api="https://yourapp.com/api/v1"></script>
 *
 * Features:
 *   - Cookie-based anonymous_id (1-year TTL)
 *   - Automatic page view tracking
 *   - UTM parameter capture
 *   - Scroll depth tracking
 *   - Time-on-page heartbeats
 *   - sendBeacon() for reliable delivery
 *   - Event batching (flush every 5s or on unload)
 */
(function () {
  "use strict";

  // Configuration from script tag
  var script = document.currentScript;
  if (!script) return;

  var WORKSPACE = script.getAttribute("data-workspace");
  var API_BASE = script.getAttribute("data-api") || "";
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!WORKSPACE || !UUID_RE.test(WORKSPACE)) { return; }

  var ENDPOINT = API_BASE + "/t/" + WORKSPACE + "/events";
  var COOKIE_NAME = "_aexy_id";
  var COOKIE_DAYS = 365;
  var FLUSH_INTERVAL = 5000; // 5 seconds
  var HEARTBEAT_INTERVAL = 15000; // 15 seconds
  var MAX_BATCH = 50;

  // Event queue
  var queue = [];
  var flushTimer = null;
  var heartbeatTimer = null;
  var scrollDepth = 0;
  var pageStartTime = Date.now();

  // ==========================================================================
  // Anonymous ID (cookie-based)
  // ==========================================================================

  function getAnonymousId() {
    var id = getCookie(COOKIE_NAME);
    if (!id) {
      id = generateId();
      setCookie(COOKIE_NAME, id, COOKIE_DAYS);
    }
    return id;
  }

  function generateId() {
    // Simple UUID-like ID
    var d = Date.now();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? decodeURIComponent(match[2]) : null;
  }

  function setCookie(name, value, days) {
    var date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie =
      name +
      "=" +
      encodeURIComponent(value) +
      ";expires=" +
      date.toUTCString() +
      ";path=/;SameSite=Lax" +
      (location.protocol === "https:" ? ";Secure" : "");
  }

  // ==========================================================================
  // UTM Parameters
  // ==========================================================================

  function getUTMParams() {
    var params = {};
    var search = window.location.search;
    if (!search) return params;

    var utmKeys = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
    ];
    utmKeys.forEach(function (key) {
      var match = search.match(new RegExp("[?&]" + key + "=([^&]+)"));
      if (match) {
        params[key] = decodeURIComponent(match[1]);
      }
    });
    return params;
  }

  // ==========================================================================
  // Event Tracking
  // ==========================================================================

  var anonymousId = getAnonymousId();
  var utmParams = getUTMParams();

  function track(eventType, properties) {
    var event = {
      anonymous_id: anonymousId,
      event_type: eventType,
      page_url: window.location.href,
      page_title: document.title,
      referrer: document.referrer || null,
      properties: properties || {},
      occurred_at: new Date().toISOString(),
    };

    // Attach UTMs to first event
    if (utmParams.utm_source) event.utm_source = utmParams.utm_source;
    if (utmParams.utm_medium) event.utm_medium = utmParams.utm_medium;
    if (utmParams.utm_campaign) event.utm_campaign = utmParams.utm_campaign;
    if (utmParams.utm_term) event.utm_term = utmParams.utm_term;
    if (utmParams.utm_content) event.utm_content = utmParams.utm_content;

    queue.push(event);

    if (queue.length >= MAX_BATCH) {
      flush();
    }
  }

  // ==========================================================================
  // Flush (send events)
  // ==========================================================================

  function flush() {
    if (queue.length === 0) return;

    var batch = queue.slice(0, MAX_BATCH);
    var payload = JSON.stringify({ events: batch });

    // Prefer sendBeacon for reliability on page unload
    if (navigator.sendBeacon) {
      var blob = new Blob([payload], { type: "application/json" });
      var sent = navigator.sendBeacon(ENDPOINT, blob);
      if (sent) {
        queue.splice(0, batch.length);
      } else {
        // Fallback to fetch if beacon fails
        sendViaFetch(payload);
        queue.splice(0, batch.length);
      }
    } else {
      sendViaFetch(payload);
      queue.splice(0, batch.length);
    }
  }

  function sendViaFetch(payload) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", ENDPOINT, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(payload);
    } catch (e) {
      // Silently fail — tracking should never break the host page
    }
  }

  // ==========================================================================
  // Scroll Depth Tracking
  // ==========================================================================

  function getScrollDepth() {
    var h = document.documentElement;
    var scrollTop = window.pageYOffset || h.scrollTop || 0;
    var scrollHeight = h.scrollHeight || 0;
    var clientHeight = h.clientHeight || 0;

    if (scrollHeight <= clientHeight) return 100;
    return Math.round((scrollTop / (scrollHeight - clientHeight)) * 100);
  }

  var scrollHandler = null;
  function trackScrollDepth() {
    if (scrollHandler) return;
    scrollHandler = function () {
      var depth = getScrollDepth();
      if (depth > scrollDepth) {
        scrollDepth = depth;
      }
    };
    window.addEventListener("scroll", scrollHandler, { passive: true });
  }

  // ==========================================================================
  // Heartbeat (time-on-page)
  // ==========================================================================

  function startHeartbeat() {
    heartbeatTimer = setInterval(function () {
      var timeOnPage = Math.round((Date.now() - pageStartTime) / 1000);
      track("heartbeat", {
        time_on_page: timeOnPage,
        scroll_depth: scrollDepth,
      });
    }, HEARTBEAT_INTERVAL);
  }

  // ==========================================================================
  // Initialize
  // ==========================================================================

  // Track initial page view
  track("page_view", {
    scroll_depth: 0,
  });

  // Start scroll tracking
  trackScrollDepth();

  // Start heartbeat
  startHeartbeat();

  // Periodic flush
  flushTimer = setInterval(flush, FLUSH_INTERVAL);

  // Flush on page unload
  function onUnload() {
    // Send final scroll depth and time-on-page
    var timeOnPage = Math.round((Date.now() - pageStartTime) / 1000);
    track("page_exit", {
      scroll_depth: scrollDepth,
      time_on_page: timeOnPage,
    });
    flush();
  }

  window.addEventListener("beforeunload", onUnload);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      clearInterval(heartbeatTimer);
      flush();
    } else {
      startHeartbeat();
    }
  });

  // SPA support — track route changes
  var lastUrl = window.location.href;
  function checkUrlChange() {
    if (window.location.href !== lastUrl) {
      // Send exit event for previous page
      var timeOnPage = Math.round((Date.now() - pageStartTime) / 1000);
      track("page_exit", {
        scroll_depth: scrollDepth,
        time_on_page: timeOnPage,
        page_url: lastUrl,
      });

      // Reset for new page
      lastUrl = window.location.href;
      pageStartTime = Date.now();
      scrollDepth = 0;

      // Track new page view
      track("page_view", { scroll_depth: 0 });
    }
  }

  // Listen for History API changes (SPAs)
  var origPushState = history.pushState;
  history.pushState = function () {
    origPushState.apply(this, arguments);
    setTimeout(checkUrlChange, 0);
  };

  var origReplaceState = history.replaceState;
  history.replaceState = function () {
    origReplaceState.apply(this, arguments);
    setTimeout(checkUrlChange, 0);
  };

  window.addEventListener("popstate", function () {
    setTimeout(checkUrlChange, 0);
  });

  // Expose manual tracking API
  window.aexy = {
    track: track,
    identify: function (email, properties) {
      track("identify", Object.assign({ email: email }, properties || {}));
    },
    flush: flush,
  };
})();
