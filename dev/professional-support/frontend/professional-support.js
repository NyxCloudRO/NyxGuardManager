(function () {
  "use strict";

  var HASH = "#nyxguard-professional-support";
  var BASE = "/api/professional-support";
  var root = null;
  var previousFocus = null;
  var appWasInert = false;
  var appAriaHidden = null;
  var activeTab = "Overview";
  var latestStatus = null;
  var tabs = ["Overview", "Diagnostics", "Troubleshooting", "Support Bundle"];
  var guidance = {
    database_reachability: "Check the MariaDB service and its connection settings.",
    migrations_current: "Check whether the 5.0.0 database migration completed.",
    openresty_health: "Validate the OpenResty configuration and service health.",
    disk_capacity: "Free disk space before logs, certificates, or database writes fail.",
    memory_pressure: "Review memory pressure on the NyxGuard host.",
    dns_resolution: "Check the configured upstream hostname and DNS resolver.",
    listener_match: "Confirm the proxy host is enabled and listens on the expected port.",
    route_match: "Review the configured hostname and route rules.",
    upstream_tcp: "Check that the configured upstream accepts connections on its port.",
    upstream_tls: "Check the upstream certificate, name, and trust chain.",
    upstream_http: "Inspect the configured upstream service response.",
    certificate_presence: "Assign a certificate to the configured proxy host.",
    certificate_expiry: "Renew or replace the expiring certificate.",
  };

  function token() {
    try {
      var entries = JSON.parse(localStorage.getItem("authentications") || "[]");
      return Array.isArray(entries) && entries.length ? String(entries[entries.length - 1].token || "") : "";
    } catch (_) { return ""; }
  }

  function element(tag, className, label) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (label != null) node.textContent = String(label);
    return node;
  }

  function button(label, action, disabled) {
    var node = element("button", "nyx-support-button", label);
    node.type = "button";
    node.disabled = !!disabled;
    node.addEventListener("click", action);
    return node;
  }

  function notice(container, value, isError) {
    var node = container.querySelector(".nyx-support-notice");
    if (!node) {
      node = element("p", "nyx-support-notice");
      node.setAttribute("role", "status");
      container.prepend(node);
    }
    node.classList.toggle("nyx-support-error", !!isError);
    node.textContent = value;
  }

  async function request(path, options) {
    var auth = token();
    if (!auth) throw new Error("Sign in to use Professional Support.");
    var response = await fetch(BASE + path, {
      method: options && options.method || "GET",
      credentials: "same-origin",
      headers: { Authorization: "Bearer " + auth, Accept: "application/json", "Content-Type": "application/json" },
      body: options && options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!response.ok) throw new Error("Request failed (HTTP " + response.status + ").");
    return response.json();
  }

  function panel() { return root && root.querySelector(".nyx-support-content"); }

  function line(container, title, value) {
    var row = element("div", "nyx-support-row");
    row.append(element("span", "nyx-support-label", title), element("span", "nyx-support-value", value == null ? "—" : value));
    container.append(row);
  }

  function active() { return latestStatus && latestStatus.enabled === true && latestStatus.state === "ACTIVE"; }

  function gatedButton(label, action) {
    var node = button(label, action, !active());
    node.setAttribute("data-support-gated", "true");
    return node;
  }

  function refreshGates() {
    if (!root) return;
    root.querySelectorAll("[data-support-gated]").forEach(function (node) { node.disabled = !active(); });
  }

  async function loadStatus(container) {
    notice(container, "Loading Professional Support status…");
    try {
      latestStatus = await request("/status");
      refreshGates();
      notice(container, "");
      line(container, "Status", latestStatus.state || "UNKNOWN");
      line(container, "Entitlement expires", latestStatus.expires_at || "—");
      line(container, "Installation", latestStatus.installation_id || "—");
      if (!active()) notice(container, "Professional Support features require an active entitlement. Core NyxGuard features remain available.");
    } catch (error) { notice(container, error.message, true); }
  }

  async function action(container, path, body) {
    notice(container, "Working…");
    try {
      await request(path, { method: "POST", body: body });
      switchTab("Overview");
    } catch (error) { notice(container, error.message, true); }
  }

  function overview(container) {
    container.append(element("h2", "", "Professional Support"));
    container.append(element("p", "nyx-support-intro", "Optional support for diagnostics, guided troubleshooting, and secure support bundles."));
    loadStatus(container);
    var claim = element("div", "nyx-support-form");
    var claimCode = element("input", "nyx-support-input");
    claimCode.type = "text";
    claimCode.autocomplete = "off";
    claimCode.placeholder = "Claim code";
    claimCode.setAttribute("aria-label", "Claim code");
    claim.append(claimCode, button("Claim", function () { action(container, "/claim", { claim_code: claimCode.value.trim() }); }));
    container.append(claim, button("Activate", function () { action(container, "/activate", {}); }),
      button("Refresh status", function () { action(container, "/refresh", {}); }));
  }

  function renderChecks(container, records) {
    if (!Array.isArray(records) || records.length === 0) {
      notice(container, "No diagnostic results are available.");
      return;
    }
    records.forEach(function (record) {
      var card = element("article", "nyx-support-result");
      var state = ["PASS", "WARNING", "FAIL", "SKIPPED"].includes(record.state) ? record.state : "SKIPPED";
      card.append(element("strong", "", record.check ? record.check.replaceAll("_", " ") : "Check"),
        element("span", "nyx-support-state state-" + state.toLowerCase(), state));
      if (Number.isSafeInteger(record.evidence && record.evidence.host_id)) {
        card.append(element("p", "", "Proxy host " + record.evidence.host_id));
      }
      if (typeof record.summary === "string") card.append(element("p", "", record.summary));
      if ((state === "FAIL" || state === "WARNING") && Object.hasOwn(guidance, record.check)) {
        card.append(element("p", "", guidance[record.check]));
      }
      container.append(card);
    });
  }

  function diagnostics(container) {
    container.append(element("h2", "", "Diagnostics"));
    container.append(element("p", "nyx-support-intro", "System, proxy and routing, and TLS checks for configured resources."));
    var results = element("div", "nyx-support-results");
    container.append(gatedButton("Run diagnostics", async function () {
      results.replaceChildren();
      notice(container, "Running diagnostics…");
      try {
        var data = await request("/diagnostics");
        notice(container, "");
        renderChecks(results, data.checks);
      } catch (error) { notice(container, error.message, true); }
    }), results);
  }

  function troubleshooting(container) {
    container.append(element("h2", "", "Troubleshooting"));
    container.append(element("p", "nyx-support-intro", "Trace an upstream 502 for an existing proxy host."));
    var form = element("div", "nyx-support-form");
    var hostId = element("input", "nyx-support-input");
    hostId.type = "number";
    hostId.min = "1";
    hostId.step = "1";
    hostId.placeholder = "Proxy host ID";
    hostId.setAttribute("aria-label", "Existing proxy host ID");
    var results = element("div", "nyx-support-results");
    form.append(hostId, gatedButton("Run 502 workflow", async function () {
      var id = Number(hostId.value);
      if (!Number.isSafeInteger(id) || id < 1) { notice(container, "Enter an existing proxy host ID.", true); return; }
      results.replaceChildren();
      notice(container, "Running troubleshooting…");
      try {
        var data = await request("/troubleshoot", { method: "POST", body: { workflow: "upstream_502", proxy_host_id: id } });
        notice(container, "");
        renderChecks(results, data.steps);
      } catch (error) { notice(container, error.message, true); }
    }));
    container.append(form, results);
  }

  function bundle(container) {
    container.append(element("h2", "", "Support Bundle"));
    container.append(element("p", "nyx-support-intro", "Generate a structured, redacted JSON bundle or upload it through NyxCloud Support."));
    container.append(gatedButton("Download bundle", async function () {
      notice(container, "Generating bundle…");
      try {
        var data = await request("/bundle");
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var link = element("a");
        link.href = url;
        link.download = "nyxguard-support-bundle.json";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        notice(container, "Bundle downloaded.");
      } catch (error) { notice(container, error.message, true); }
    }));
    container.append(gatedButton("Upload bundle", async function () {
      notice(container, "Uploading bundle…");
      try {
        var data = await request("/upload", { method: "POST", body: {} });
        notice(container, data.support_id ? "Support ID: " + data.support_id : "Upload complete.");
        if (data.expires_at) line(container, "Available until", data.expires_at);
      } catch (error) { notice(container, error.message, true); }
    }));
  }

  function switchTab(name) {
    if (!root || !tabs.includes(name)) return;
    activeTab = name;
    root.querySelectorAll("[role=tab]").forEach(function (tab) {
      var selected = tab.textContent === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    var content = panel();
    content.replaceChildren();
    if (name === "Overview") overview(content);
    if (name === "Diagnostics") diagnostics(content);
    if (name === "Troubleshooting") troubleshooting(content);
    if (name === "Support Bundle") bundle(content);
    refreshGates();
  }

  function close() {
    if (!root) return;
    root.remove();
    root = null;
    var app = document.getElementById("root");
    if (app) {
      app.inert = appWasInert;
      if (appAriaHidden == null) app.removeAttribute("aria-hidden");
      else app.setAttribute("aria-hidden", appAriaHidden);
    }
    document.body.classList.remove("nyx-support-open");
    if (location.hash === HASH) history.replaceState(null, "", location.pathname + location.search);
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
  }

  function open() {
    if (root || !token()) return;
    previousFocus = document.activeElement;
    root = element("div", "nyx-support-backdrop");
    root.addEventListener("mousedown", function (event) { if (event.target === root) close(); });
    var dialog = element("section", "nyx-support-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "nyx-support-title");
    var header = element("header", "nyx-support-header");
    var title = element("h1", "", "Support NyxGuard");
    title.id = "nyx-support-title";
    var dismiss = button("Close", close);
    dismiss.setAttribute("aria-label", "Close Support NyxGuard");
    header.append(title, dismiss);
    var nav = element("div", "nyx-support-tabs");
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-label", "Support sections");
    tabs.forEach(function (name) {
      var tab = button(name, function () { switchTab(name); });
      tab.setAttribute("role", "tab");
      nav.append(tab);
    });
    var content = element("div", "nyx-support-content");
    content.setAttribute("role", "tabpanel");
    dialog.append(header, nav, content);
    root.append(dialog);
    var app = document.getElementById("root");
    if (app) {
      appWasInert = app.inert;
      appAriaHidden = app.getAttribute("aria-hidden");
      app.setAttribute("aria-hidden", "true");
      app.inert = true;
    }
    document.body.append(root);
    document.body.classList.add("nyx-support-open");
    switchTab(activeTab);
    dismiss.focus();
  }

  document.addEventListener("click", function (event) {
    var link = event.target.closest && event.target.closest("a.prefs-action-support");
    if (!link || !link.closest(".prefs-action-links")) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    location.hash = HASH;
    open();
  }, true);
  document.addEventListener("keydown", function (event) {
    if (!root) return;
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    var items = Array.from(root.querySelectorAll("button:not([disabled]),input:not([disabled])"));
    if (!items.length) return;
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
    if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
  }, true);
  window.addEventListener("hashchange", function () { if (location.hash === HASH) open(); else close(); });
  if (location.hash === HASH) {
    var timer = setInterval(function () { if (token() && document.getElementById("root")) { clearInterval(timer); open(); } }, 250);
    setTimeout(function () { clearInterval(timer); }, 10000);
  }
})();
