(function () {
  "use strict";

  var LICENSE_HASH = "#nyxguard-license";
  var SUPPORT_HASH = "#nyxguard-diagnostics-support";
  var LEGACY_HASH = "#nyxguard-professional-support";
  var tabs = ["Overview", "Diagnostics", "Troubleshooting", "Support Bundle"];
  var tabSlugs = ["overview", "diagnostics", "troubleshooting", "support-bundle"];
  var systemChecks = new Set(["application_version", "backend_health", "database_reachability", "migrations_current", "openresty_health", "configuration_valid", "disk_capacity", "memory_pressure", "uptime", "restart_indicator", "error_indicator"]);
  var tlsChecks = new Set(["certificate_presence", "certificate_expiry", "san_match", "chain_valid", "renewal_ready", "acme_ready", "dns_challenge_ready"]);
  var guidance = {
    database_reachability: "Check the MariaDB service and its connection settings.",
    migrations_current: "Confirm that the 5.0.0 migration completed.",
    openresty_health: "Validate the OpenResty configuration and service health.",
    disk_capacity: "Free disk space before writes fail.",
    memory_pressure: "Review memory pressure on the NyxGuard host.",
    dns_resolution: "Check the configured upstream name and DNS resolver.",
    listener_match: "Confirm the proxy host is enabled and listens on the expected port.",
    route_match: "Review the configured hostname and route rules.",
    upstream_tcp: "Check the configured upstream service and port.",
    upstream_tls: "Check the upstream certificate, name, and trust chain.",
    upstream_http: "Inspect the upstream service response.",
    certificate_presence: "Assign a certificate to this configured proxy host.",
    certificate_expiry: "Renew or replace the certificate.",
  };
  var page = null;
  var mainNode = null;
  var routeWrapper = null;
  var currentRoute = "";
  var latestStatus = null;
  var lastDiagnostics = null;
  var lastBundle = null;
  var lastBundleBytes = null;
  var lastSupportId = null;
  var scheduled = false;

  if (location.pathname === "/nyxguard-professional-support") {
    location.replace("/" + SUPPORT_HASH);
    return;
  }

  function token() {
    try {
      var entries = JSON.parse(localStorage.getItem("authentications") || "[]");
      return Array.isArray(entries) && entries.length ? String(entries[entries.length - 1].token || "") : "";
    } catch (_) { return ""; }
  }

  function element(tag, className, value) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = String(value);
    return node;
  }

  function button(label, action, className) {
    var node = element("button", "nyx-support-button " + (className || ""), label);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }

  function notice(parent, message, error) {
    var node = parent.querySelector(":scope > .nyx-support-notice");
    if (!node) {
      node = element("p", "nyx-support-notice");
      node.setAttribute("role", "status");
      parent.append(node);
    }
    node.classList.toggle("nyx-support-error", !!error);
    node.setAttribute("role", error ? "alert" : "status");
    node.textContent = message || "";
  }

  function statusError(parent, error) {
    var panel = card(parent, "Support status unavailable", "NyxGuard could not load the entitlement state for this installation.");
    notice(panel, error.message, true);
    panel.append(button("Try again", function () { unmount(); renderRoute(); }, "nyx-support-button-secondary"));
  }

  function statusLabel(state) {
    return ({
      NOT_CONFIGURED: "Not configured", ACTIVE: "Active", EXPIRED: "Expired",
      REVOKED: "Revoked", REFRESH_REQUIRED: "Refresh required",
      AUTHORITY_UNAVAILABLE: "Authority unavailable", OFFLINE_GRACE: "Offline grace",
      INVALID: "Invalid"
    })[state] || "Unavailable";
  }

  function productLabel(product) {
    if (product === "nyxguard-manager-professional-support") return "NyxGuard Manager Professional Support";
    if (product === "nyxcloud-premium-support") return "NyxCloud Premium Support";
    return "Not available";
  }

  function dateLabel(raw) {
    if (!raw) return "Not available";
    var date = new Date(raw);
    return Number.isNaN(date.getTime()) ? "Not available" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function canDiagnose() { return !!(latestStatus && latestStatus.enabled); }
  function canUpload() { return !!(latestStatus && latestStatus.state === "ACTIVE"); }

  async function request(path, options) {
    var auth = token();
    if (!auth) throw new Error("Sign in to use Professional Support.");
    var response = await fetch(path, {
      method: options && options.method || "GET",
      credentials: "same-origin",
      headers: {
        Authorization: "Bearer " + auth,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: options && options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!response.ok) throw new Error("Request failed (HTTP " + response.status + ").");
    return response.json();
  }

  function field(parent, title, value) {
    var cell = element("div", "nyx-support-field");
    cell.append(element("span", "nyx-support-field-label", title), element("strong", "", value == null ? "Not available" : value));
    parent.append(cell);
    return cell;
  }

  function card(parent, title, copy) {
    var node = element("section", "nyx-support-card");
    node.append(element("h2", "", title));
    if (copy) node.append(element("p", "nyx-support-muted", copy));
    parent.append(node);
    return node;
  }

  function sectionHeading(parent, title, copy) {
    var header = element("div", "nyx-support-section-heading");
    header.append(element("h2", "", title));
    if (copy) header.append(element("p", "", copy));
    parent.append(header);
  }

  function inactiveNote(parent) {
    if (canDiagnose()) return;
    var note = element("div", "nyx-support-callout");
    note.append(element("strong", "", "Support is locked. "), document.createTextNode("An active Professional Support entitlement is required for these tools. Core NyxGuard functionality remains available."));
    parent.append(note);
  }

  async function loadStatus(onReady, target) {
    try {
      latestStatus = await request("/api/professional-support/status");
      if (target && !target.isConnected) return;
      onReady(null, latestStatus);
    } catch (error) {
      if (target && !target.isConnected) return;
      onReady(error);
    }
  }

  function statusFields(parent, status) {
    var grid = element("div", "nyx-support-metrics");
    field(grid, "Status", statusLabel(status.state));
    field(grid, "Entitlement expiry", dateLabel(status.expires_at));
    field(grid, "Installation", status.installation_id ? "Bound to this installation" : "Not configured");
    field(grid, "Authority", status.state === "AUTHORITY_UNAVAILABLE" || status.state === "OFFLINE_GRACE" ? "Unavailable" : status.state === "REFRESH_REQUIRED" ? "Refresh required" : status.state === "NOT_CONFIGURED" ? "Not configured" : "Available");
    parent.append(grid);
  }

  async function performAction(target, path, body) {
    notice(target, "Working…");
    try {
      await request("/api/professional-support" + path, { method: "POST", body: body });
      latestStatus = null;
      unmount();
      renderRoute();
    } catch (error) { notice(target, error.message, true); }
  }

  function licenseContent(parent) {
    var header = element("header", "nyx-support-page-header");
    header.append(element("span", "nyx-support-eyebrow", "NYXGUARD MANAGER 5.0.0"), element("h1", "", "Professional Support License"),
      element("p", "", "Manage NyxGuard Manager Professional Support or NyxCloud Premium Support for diagnostics and support. Core NyxGuard remains available without a license."));
    parent.append(header);
    var details = card(parent, "License status", "Entitlement details are verified by the NyxGuard backend.");
    notice(details, "Loading license status…");
    loadStatus(function (error, status) {
      if (error) {
        notice(details, error.message, true);
        details.append(button("Try again", function () { unmount(); renderRoute(); }, "nyx-support-button-secondary"));
        return;
      }
      notice(details, "");
      statusFields(details, status);
      var identity = element("div", "nyx-support-metrics nyx-support-identity");
      field(identity, "License product", productLabel(status.product));
      field(identity, "Capability", "Diagnostics & Support");
      details.append(identity);
      inactiveNote(details);
      var actions = element("div", "nyx-support-actions");
      var product = element("select", "nyx-support-input");
      product.setAttribute("aria-label", "Support product");
      var nativeOption = element("option", "", "NyxGuard Manager Professional Support");
      nativeOption.value = "nyxguard-manager-professional-support";
      var premiumOption = element("option", "", "NyxCloud Premium Support");
      premiumOption.value = "nyxcloud-premium-support";
      product.append(nativeOption, premiumOption);
      var claim = element("input", "nyx-support-input");
      claim.type = "text";
      claim.autocomplete = "off";
      claim.placeholder = "Claim code";
      claim.setAttribute("aria-label", "Claim code");
      var claimButton = button("Claim", function () {
        var code = claim.value.trim();
        claim.value = "";
        performAction(details, "/claim", { claim_code: code, product: product.value });
      });
      actions.append(product, claim, claimButton);
      if (status.activation_pending) actions.append(button("Activate", function () { performAction(details, "/activate", {}); }));
      actions.append(button("Refresh status", function () { performAction(details, "/refresh", {}); }, "nyx-support-button-secondary"));
      details.append(actions);
    }, details);
  }

  function overviewContent(parent) {
    var grid = element("div", "nyx-support-overview-grid");
    parent.append(grid);
    var license = card(grid, "Professional Support", "Current entitlement and authority state.");
    notice(license, "Loading status…");
    var workflow = card(grid, "Support workflow", "Generate a redacted bundle and upload when entitled.");
    field(workflow, "Bundle", lastBundle ? "Generated " + dateLabel(lastBundle.generated_at) : "Not generated this session");
    field(workflow, "Support ID", lastSupportId || "No upload this session");
    var uploadField = field(workflow, "Upload", "Checking entitlement…");
    loadStatus(function (error, status) {
      if (error) {
        notice(license, error.message, true);
        license.append(button("Try again", function () { unmount(); renderRoute(); }, "nyx-support-button-secondary"));
        uploadField.querySelector("strong").textContent = "Status unavailable";
        return;
      }
      notice(license, "");
      statusFields(license, status);
      inactiveNote(license);
      uploadField.querySelector("strong").textContent = canUpload() ? "Available" : "Requires an active online entitlement";
    }, license);
    var diagnostics = card(grid, "Diagnostics summary", "System, proxy and routing, and TLS.");
    field(diagnostics, "Last run", lastDiagnostics ? dateLabel(lastDiagnostics.at) : "Not run this session");
    field(diagnostics, "System", lastDiagnostics ? lastDiagnostics.system : "Not run");
    field(diagnostics, "Proxy & Routing", lastDiagnostics ? lastDiagnostics.routing : "Not run");
    field(diagnostics, "TLS", lastDiagnostics ? lastDiagnostics.tls : "Not run");
  }

  function friendlyCheck(name) {
    return String(name || "Check").replaceAll("_", " ").replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }

  function resultCard(parent, record) {
    var state = ["PASS", "WARNING", "FAIL", "SKIPPED"].includes(record.state) ? record.state : "SKIPPED";
    var row = element("article", "nyx-support-result");
    var heading = element("div", "nyx-support-result-heading");
    heading.append(element("strong", "", friendlyCheck(record.check)), element("span", "nyx-support-state state-" + state.toLowerCase(), state));
    row.append(heading);
    if (typeof record.summary === "string" && record.summary) row.append(element("p", "", record.summary));
    var evidence = record.evidence || {};
    var safeEvidence = [];
    if (Number.isSafeInteger(evidence.host_id)) safeEvidence.push("Proxy host " + evidence.host_id);
    if (Number.isSafeInteger(evidence.status_code)) safeEvidence.push("HTTP " + evidence.status_code);
    if (Number.isFinite(evidence.free_percent)) safeEvidence.push(Math.round(evidence.free_percent) + "% free");
    if (Number.isFinite(evidence.days_remaining)) safeEvidence.push(evidence.days_remaining + " days remaining");
    if (Number.isFinite(evidence.seconds)) safeEvidence.push(evidence.seconds + " seconds uptime");
    if (safeEvidence.length) row.append(element("p", "nyx-support-evidence", safeEvidence.join(" · ")));
    if (state !== "PASS") row.append(element("p", "nyx-support-guidance", guidance[record.check] || (state === "SKIPPED" ? "This check needs more configured data or a reachable service." : "Review this check and its configured resource.")));
    parent.append(row);
  }

  function checkGroup(parent, title, records) {
    var group = card(parent, title);
    group.classList.add("nyx-support-result-group");
    if (!records.length) group.append(element("p", "nyx-support-muted", "No configured resources produced checks in this group."));
    records.forEach(function (record) { resultCard(group, record); });
  }

  function summarize(records) {
    if (!records.length) return "No configured checks";
    if (records.some(function (r) { return r.state === "FAIL"; })) return "Needs attention";
    if (records.some(function (r) { return r.state === "WARNING"; })) return "Warnings";
    if (records.every(function (r) { return r.state === "SKIPPED"; })) return "Not assessed";
    return "Passing";
  }

  function diagnosticsContent(parent) {
    sectionHeading(parent, "Diagnostics", "Run bounded checks against this installation and configured resources.");
    notice(parent, "");
    var controls = element("div", "nyx-support-actions");
    var run = button("Run diagnostics", async function () {
      notice(parent, "Running diagnostics…");
      try {
        var data = await request("/api/professional-support/diagnostics");
        if (!parent.isConnected) return;
        var records = Array.isArray(data.checks) ? data.checks : [];
        var system = records.filter(function (r) { return systemChecks.has(r.check); });
        var tls = records.filter(function (r) { return tlsChecks.has(r.check); });
        var routing = records.filter(function (r) { return !systemChecks.has(r.check) && !tlsChecks.has(r.check); });
        var output = parent.querySelector(".nyx-support-check-groups");
        output.replaceChildren();
        checkGroup(output, "System", system);
        checkGroup(output, "Proxy & Routing", routing);
        checkGroup(output, "TLS", tls);
        lastDiagnostics = { at: new Date().toISOString(), system: summarize(system), routing: summarize(routing), tls: summarize(tls) };
        notice(parent, "Diagnostics completed.");
      } catch (error) { notice(parent, error.message, true); }
    });
    run.disabled = !canDiagnose();
    controls.append(run);
    parent.append(controls);
    inactiveNote(parent);
    parent.append(element("div", "nyx-support-check-groups"));
  }

  async function loadHosts(select, hostNotice) {
    try {
      var rows = await request("/api/nginx/proxy-hosts");
      if (!select.isConnected) return;
      select.replaceChildren();
      select.append(element("option", "", "Select a configured proxy host"));
      select.firstChild.value = "";
      (Array.isArray(rows) ? rows : []).filter(function (row) { return Number.isSafeInteger(row.id) && !row.is_deleted; }).forEach(function (row) {
        var names = Array.isArray(row.domain_names) ? row.domain_names : [];
        var label = names.length ? String(names[0]) : "Proxy host " + row.id;
        var option = element("option", "", label + " · #" + row.id);
        option.value = String(row.id);
        select.append(option);
      });
      if (select.options.length === 1) {
        select.disabled = true;
        hostNotice.textContent = "No configured proxy hosts are available for this workflow.";
      } else hostNotice.textContent = "Only hosts already configured in NyxGuard can be selected.";
    } catch (error) { hostNotice.textContent = error.message; select.disabled = true; }
  }

  function troubleshootingContent(parent) {
    sectionHeading(parent, "Troubleshooting", "Guided 502 / Upstream unavailable workflow for an existing proxy host.");
    var cardNode = card(parent, "502 / Upstream unavailable", "Choose an authorized proxy host. Arbitrary URLs and addresses are not accepted.");
    notice(cardNode, "");
    var form = element("div", "nyx-support-actions");
    var hostSelect = element("select", "nyx-support-input");
    hostSelect.setAttribute("aria-label", "Configured proxy host");
    hostSelect.append(element("option", "", "Loading configured hosts…"));
    var hostNotice = element("p", "nyx-support-muted", "");
    var run = button("Run 502 workflow", async function () {
      var id = Number(hostSelect.value);
      if (!Number.isSafeInteger(id) || id < 1) { notice(cardNode, "Select a configured proxy host.", true); return; }
      notice(cardNode, "Running troubleshooting…");
      try {
        var data = await request("/api/professional-support/troubleshoot", { method: "POST", body: { workflow: "upstream_502", proxy_host_id: id } });
        if (!cardNode.isConnected) return;
        var output = cardNode.querySelector(".nyx-support-results");
        output.replaceChildren();
        (Array.isArray(data.steps) ? data.steps : []).forEach(function (record) { resultCard(output, record); });
        notice(cardNode, "Workflow completed.");
      } catch (error) { notice(cardNode, error.message, true); }
    });
    run.disabled = !canDiagnose();
    form.append(hostSelect, run);
    cardNode.append(form, hostNotice, element("div", "nyx-support-results"));
    inactiveNote(cardNode);
    if (canDiagnose()) loadHosts(hostSelect, hostNotice);
    else { hostSelect.disabled = true; hostNotice.textContent = "An active entitlement is required to run this workflow."; }
  }

  function downloadBundle() {
    if (!lastBundleBytes) return;
    var url = URL.createObjectURL(new Blob([lastBundleBytes], { type: "application/json" }));
    var link = element("a");
    link.href = url;
    link.download = "nyxguard-support-bundle.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function bundleContent(parent) {
    sectionHeading(parent, "Support Bundle", "Generate and review safe metadata before downloading or uploading a structured support bundle.");
    var cardNode = card(parent, "Bundle workflow", "The bundle is redacted JSON, never a filesystem archive.");
    notice(cardNode, "");
    var info = element("div", "nyx-support-metrics");
    var actions = element("div", "nyx-support-actions");
    var download = button("Download bundle", downloadBundle, "nyx-support-button-secondary");
    download.disabled = !lastBundleBytes;
    var generate = button("Generate Support Bundle", async function () {
      notice(cardNode, "Generating bundle…");
      try {
        var data = await request("/api/professional-support/bundle");
        if (!cardNode.isConnected) return;
        lastBundle = data;
        lastBundleBytes = JSON.stringify(data, null, 2);
        info.replaceChildren();
        field(info, "Format", data.format || "Unknown");
        field(info, "Size", new Blob([lastBundleBytes]).size.toLocaleString() + " bytes");
        field(info, "Generated", dateLabel(data.generated_at));
        download.disabled = false;
        notice(cardNode, "Bundle ready to review or download.");
      } catch (error) { notice(cardNode, error.message, true); }
    });
    generate.disabled = !canDiagnose();
    var upload = button("Upload Support Bundle", async function () {
      notice(cardNode, "Uploading a freshly generated bundle…");
      try {
        var receipt = await request("/api/professional-support/upload", { method: "POST", body: {} });
        if (!cardNode.isConnected) return;
        lastSupportId = receipt.support_id || null;
        notice(cardNode, lastSupportId ? "Upload accepted. Support ID: " + lastSupportId : "Upload completed.");
        if (receipt.expires_at) field(info, "Available until", dateLabel(receipt.expires_at));
      } catch (error) { notice(cardNode, error.message, true); }
    });
    upload.disabled = !canUpload();
    actions.append(generate, download, upload);
    cardNode.append(info, actions);
    inactiveNote(cardNode);
    if (lastBundle) {
      field(info, "Format", lastBundle.format || "Unknown");
      field(info, "Size", new Blob([lastBundleBytes]).size.toLocaleString() + " bytes");
      field(info, "Generated", dateLabel(lastBundle.generated_at));
    }
    if (lastSupportId) field(info, "Support ID", lastSupportId);
  }

  function route() {
    if (location.hash === LEGACY_HASH) {
      history.replaceState(null, "", "/" + SUPPORT_HASH);
    }
    if (location.hash === LICENSE_HASH) return "license";
    if (location.hash === SUPPORT_HASH) return "support:overview";
    var prefix = SUPPORT_HASH + "/";
    if (location.hash.startsWith(prefix)) {
      var slug = location.hash.slice(prefix.length);
      if (tabSlugs.includes(slug)) return "support:" + slug;
    }
    return "";
  }

  function navigate(hash) {
    if (location.hash !== hash || location.pathname !== "/") history.pushState(null, "", "/" + hash);
    renderRoute();
  }

  function supportContent(parent, slug) {
    var header = element("header", "nyx-support-page-header");
    header.append(element("span", "nyx-support-eyebrow", "PROFESSIONAL SUPPORT"), element("h1", "", "Diagnostics & Support"),
      element("p", "", "Health checks, guided troubleshooting, and secure support workflows for this installation."));
    parent.append(header);
    var nav = element("nav", "nyx-support-tabs");
    nav.setAttribute("aria-label", "Diagnostics and support sections");
    tabs.forEach(function (name, index) {
      var tab = button(name, function () { navigate(SUPPORT_HASH + "/" + tabSlugs[index]); });
      tab.classList.toggle("nyx-support-tab-active", slug === tabSlugs[index]);
      if (slug === tabSlugs[index]) tab.setAttribute("aria-current", "page");
      nav.append(tab);
    });
    parent.append(nav);
    var content = element("div", "nyx-support-page-content");
    parent.append(content);
    if (slug === "overview") overviewContent(content);
    if (slug === "diagnostics") {
      notice(content, "Loading support status…");
      loadStatus(function (error) {
        content.replaceChildren();
        if (error) statusError(content, error);
        else diagnosticsContent(content);
      }, content);
    }
    if (slug === "troubleshooting") {
      notice(content, "Loading support status…");
      loadStatus(function (error) {
        content.replaceChildren();
        if (error) statusError(content, error);
        else troubleshootingContent(content);
      }, content);
    }
    if (slug === "support-bundle") {
      notice(content, "Loading support status…");
      loadStatus(function (error) {
        content.replaceChildren();
        if (error) statusError(content, error);
        else bundleContent(content);
      }, content);
    }
  }

  function updateLowerNavigation(next) {
    document.querySelectorAll(".prefs-action-links .nyx-support-license-nav,.prefs-action-links .nyx-support-diagnostics-nav").forEach(function (link) {
      var active = link.classList.contains("nyx-support-license-nav") ? next === "license" : next.startsWith("support:");
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function unmount() {
    if (page) page.remove();
    if (routeWrapper) routeWrapper.classList.remove("nyx-support-route-hidden");
    if (mainNode) mainNode.classList.remove("nyx-support-main-active");
    page = mainNode = routeWrapper = null;
    currentRoute = "";
  }

  function renderRoute() {
    var next = route();
    updateLowerNavigation(next);
    if (!next) { unmount(); return; }
    var main = document.querySelectorAll("#root ._main_f6sqx_21");
    if (main.length !== 1) { unmount(); return; }
    var wrappers = main[0].querySelectorAll(":scope > .w-100.py-0.min-w-0.h-100.d-flex.flex-column");
    if (wrappers.length !== 1) { unmount(); return; }
    if (page && page.isConnected && mainNode === main[0] && routeWrapper === wrappers[0] && currentRoute === next) return;
    unmount();
    mainNode = main[0];
    routeWrapper = wrappers[0];
    routeWrapper.classList.add("nyx-support-route-hidden");
    mainNode.classList.add("nyx-support-main-active");
    page = element("div", "nyx-support-page");
    page.setAttribute("data-nyx-support-view", next);
    mainNode.append(page);
    currentRoute = next;
    if (next === "license") licenseContent(page);
    else supportContent(page, next.split(":")[1]);
  }

  function scheduleRender() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () { scheduled = false; renderRoute(); });
  }

  document.addEventListener("click", function (event) {
    var link = event.target.closest && event.target.closest("a.nyx-support-license-nav,a.nyx-support-diagnostics-nav");
    if (!link || !link.closest(".prefs-action-links")) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(link.classList.contains("nyx-support-license-nav") ? LICENSE_HASH : SUPPORT_HASH);
  }, true);
  document.addEventListener("click", function (event) {
    if (!currentRoute || !event.target.closest || !event.target.closest("#navbar-menu")) return;
    history.replaceState(null, "", location.pathname + location.search);
    unmount();
  }, true);
  window.addEventListener("hashchange", scheduleRender);
  window.addEventListener("popstate", scheduleRender);
  new MutationObserver(scheduleRender).observe(document.documentElement, { childList: true, subtree: true });
  scheduleRender();
})();
