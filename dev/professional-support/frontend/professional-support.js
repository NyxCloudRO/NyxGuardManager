(function () {
  "use strict";

  var LICENSE_HASH = "#nyxguard-license";
  var SUPPORT_HASH = "#nyxguard-diagnostics-support";
  var LEGACY_HASH = "#nyxguard-professional-support";
  var tabs = ["Overview", "Diagnostics", "Troubleshooting", "Support Bundle"];
  var tabSlugs = ["overview", "diagnostics", "troubleshooting", "support-bundle"];
  var systemChecks = new Set(["application_version", "backend_health", "database_reachability", "migrations_current", "openresty_health", "configuration_valid", "disk_capacity", "memory_pressure", "cpu_usage", "uptime", "restart_indicator", "error_indicator"]);
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
  var lastBundleSha = null;
  var lastSupportId = null;
  var pendingHostId = null;
  var pendingDiagnosticsRun = false;
  var pendingBundleGeneration = false;
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

  async function requestResponse(path, options) {
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
    return response;
  }

  async function request(path, options) {
    return (await requestResponse(path, options)).json();
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
    header.append(element("h1", "", "Professional Support License"),
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
    var bundleAction = button("Generate Support Bundle", function () {
      pendingBundleGeneration = true;
      navigate(SUPPORT_HASH + "/support-bundle");
    });
    bundleAction.disabled = true;
    var workflowActions = element("div", "nyx-support-actions");
    workflowActions.append(bundleAction);
    workflow.append(workflowActions);
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
      bundleAction.disabled = !canDiagnose();
      diagnosticsAction.disabled = !canDiagnose();
      troubleshootAction.disabled = !canDiagnose();
      problemsPanel(problems, true);
    }, license);
    var diagnostics = card(grid, "Diagnostics summary", "System, proxy and routing, and TLS.");
    field(diagnostics, "Last run", lastDiagnostics ? dateLabel(lastDiagnostics.at) : "Not run this session");
    field(diagnostics, "System", lastDiagnostics ? lastDiagnostics.system : "Not run");
    field(diagnostics, "Proxy & Routing", lastDiagnostics ? lastDiagnostics.routing : "Not run");
    field(diagnostics, "TLS", lastDiagnostics ? lastDiagnostics.tls : "Not run");
    var diagnosticActions = element("div", "nyx-support-actions");
    var diagnosticsAction = button("Run Diagnostics", function () {
      pendingDiagnosticsRun = true;
      navigate(SUPPORT_HASH + "/diagnostics");
    });
    var troubleshootAction = button("Troubleshoot", function () { navigate(SUPPORT_HASH + "/troubleshooting"); }, "nyx-support-button-secondary");
    diagnosticsAction.disabled = true;
    troubleshootAction.disabled = true;
    diagnosticActions.append(diagnosticsAction, troubleshootAction);
    diagnostics.append(diagnosticActions);
    var problems = card(grid, "Recent problems", "Current service and proxy issues from this installation.");
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
    if (typeof record.summary === "string" && record.summary) row.append(element("p", "", record.summary.slice(0, 240)));
    var evidence = record.evidence || {};
    var safeEvidence = [];
    if (Number.isSafeInteger(evidence.host_id)) safeEvidence.push("Proxy host " + evidence.host_id);
    if (Number.isSafeInteger(evidence.status_code)) safeEvidence.push("HTTP " + evidence.status_code);
    if (Number.isFinite(evidence.free_percent)) safeEvidence.push(Math.round(evidence.free_percent) + "% free");
    if (Number.isFinite(evidence.days_remaining)) safeEvidence.push(evidence.days_remaining + " days remaining");
    if (Number.isFinite(evidence.seconds)) safeEvidence.push(evidence.seconds + " seconds uptime");
    if (Number.isSafeInteger(evidence.count)) safeEvidence.push(evidence.count + " occurrences");
    if (typeof evidence.failure === "string" && /^[a-z_]{1,32}$/.test(evidence.failure)) safeEvidence.push(friendlyCheck(evidence.failure));
    if (safeEvidence.length) row.append(element("p", "nyx-support-evidence", safeEvidence.join(" · ")));
    var recommendation = record.recommendation || record.remediation;
    if (state !== "PASS") row.append(element("p", "nyx-support-guidance", typeof recommendation === "string" && recommendation.length <= 240 ? recommendation : guidance[record.check] || (state === "SKIPPED" ? "This check needs more configured data or a reachable service." : "Review this check and its configured resource.")));
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

  function troubleshootHost(id) {
    if (!Number.isSafeInteger(id) || id < 1) return;
    pendingHostId = id;
    navigate(SUPPORT_HASH + "/troubleshooting");
  }

  function problemsPanel(parent, compact) {
    var controls = element("div", "nyx-support-actions");
    var windowSelect = element("select", "nyx-support-input");
    windowSelect.setAttribute("aria-label", "Recent problems time window");
    [["15", "Last 15 minutes"], ["60", "Last hour"], ["1440", "Last 24 hours"]].forEach(function (entry) {
      var option = element("option", "", entry[1]);
      option.value = entry[0];
      windowSelect.append(option);
    });
    if (compact) windowSelect.value = "60";
    var refresh = button("Refresh problems", load, "nyx-support-button-secondary");
    refresh.disabled = !canDiagnose();
    controls.append(windowSelect, refresh);
    var output = element("div", "nyx-support-problems");
    parent.append(controls, output);
    windowSelect.addEventListener("change", load);
    async function load() {
      if (!canDiagnose()) { output.replaceChildren(element("p", "nyx-support-muted", "An active entitlement is required.")); return; }
      output.replaceChildren(element("p", "nyx-support-muted", "Loading recent problems…"));
      try {
        var data = await request("/api/professional-support/problems?window=" + windowSelect.value);
        if (!parent.isConnected) return;
        output.replaceChildren();
        var items = Array.isArray(data.problems) ? data.problems.slice(0, 20) : [];
        if (data.source_available === false) output.append(element("p", "nyx-support-callout", "Recent log sources are unavailable. Problem counts may be incomplete; check logging and try again."));
        if (!items.length && data.source_available !== false) output.append(element("p", "nyx-support-muted", "No recent problems were detected in this window."));
        items.forEach(function (item) {
          var row = element("article", "nyx-support-problem");
          var title = /^[a-z][a-z0-9_]{0,63}$/.test(item.category || "") ? friendlyCheck(item.category) : "Service problem";
          var state = ["FAIL", "WARNING", "PASS"].includes(item.state) ? item.state : "WARNING";
          var heading = element("div", "nyx-support-result-heading");
          heading.append(element("strong", "", title), element("span", "nyx-support-state state-" + state.toLowerCase(), state));
          row.append(heading);
          var details = [];
          if (Number.isSafeInteger(item.host_id) && item.host_id > 0) details.push("Proxy host #" + item.host_id);
          if (Number.isSafeInteger(item.count) && item.count >= 0) details.push(item.count + " occurrences");
          if (item.last_seen) details.push("Last seen " + dateLabel(item.last_seen));
          if (details.length) row.append(element("p", "nyx-support-evidence", details.join(" · ")));
          if (Number.isSafeInteger(item.host_id) && item.host_id > 0) row.append(button("Troubleshoot host #" + item.host_id, function () { troubleshootHost(item.host_id); }, "nyx-support-button-secondary"));
          output.append(row);
        });
      } catch (error) { output.replaceChildren(element("p", "nyx-support-error", error.message)); }
    }
    load();
  }

  function renderDiagnostics(parent, data) {
    var records = Array.isArray(data.checks) ? data.checks : [];
    var hosts = Array.isArray(data.hosts) ? data.hosts : [];
    var system = records.filter(function (r) { return systemChecks.has(r.check); });
    var tls = records.filter(function (r) { return tlsChecks.has(r.check); });
    var routing = records.filter(function (r) { return !systemChecks.has(r.check) && !tlsChecks.has(r.check); });
    var output = parent.querySelector(".nyx-support-check-groups");
    output.replaceChildren();
    checkGroup(output, "System", system);
    if (hosts.length) {
      hosts.forEach(function (host) {
        if (!Number.isSafeInteger(host.id) || host.id < 1) return;
        var names = Array.isArray(host.domains) ? host.domains.filter(function (name) { return typeof name === "string" && name.length <= 253; }) : [];
        var group = card(output, "Proxy host #" + host.id, names.slice(0, 2).join(", ") || "Configured proxy host");
        group.classList.add("nyx-support-result-group", "nyx-support-host-group");
        group.append(element("p", "nyx-support-muted", host.enabled ? "Enabled" : "Disabled"));
        var hostChecks = Array.isArray(host.checks) ? host.checks : [];
        var details = element("details", "nyx-support-host-details");
        var summary = element("summary", "", summarize(hostChecks) + " · " + hostChecks.length + " checks");
        details.append(summary);
        if (hostChecks.some(function (record) { return record.state === "FAIL" || record.state === "WARNING"; })) details.open = true;
        if (!hostChecks.length) details.append(element("p", "nyx-support-muted", "No checks available for this host."));
        hostChecks.forEach(function (record) { resultCard(details, record); });
        details.append(button("Troubleshoot this host", function () { troubleshootHost(host.id); }, "nyx-support-button-secondary"));
        group.append(details);
      });
    } else {
      checkGroup(output, "Proxy & Routing", routing);
      checkGroup(output, "TLS", tls);
    }
    var allHostChecks = hosts.flatMap(function (h) { return Array.isArray(h.checks) ? h.checks : []; });
    var hostTls = allHostChecks.filter(function (r) { return tlsChecks.has(r.check); });
    var hostRouting = allHostChecks.filter(function (r) { return !tlsChecks.has(r.check); });
    lastDiagnostics = { at: data.generated_at || new Date().toISOString(), system: summarize(system),
      routing: summarize(hosts.length ? hostRouting : routing), tls: summarize(hosts.length ? hostTls : tls) };
    var summary = parent.querySelector(".nyx-support-summary");
    summary.replaceChildren();
    if (data.summary) ["pass", "warning", "fail", "skipped"].forEach(function (key) {
      if (Number.isSafeInteger(data.summary[key])) field(summary, friendlyCheck(key), data.summary[key]);
    });
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
        renderDiagnostics(parent, data);
        notice(parent, "Diagnostics completed.");
      } catch (error) { notice(parent, error.message, true); }
    });
    run.disabled = !canDiagnose();
    controls.append(run);
    parent.append(controls);
    inactiveNote(parent);
    parent.append(element("div", "nyx-support-metrics nyx-support-summary"));
    var problems = card(parent, "Recent problems", "Issues detected from bounded logs and service events.");
    problemsPanel(problems, false);
    parent.append(element("div", "nyx-support-check-groups"));
    if (pendingDiagnosticsRun && canDiagnose()) {
      pendingDiagnosticsRun = false;
      run.click();
    }
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
      } else {
        hostNotice.textContent = "Only hosts already configured in NyxGuard can be selected.";
        if (pendingHostId && Array.from(select.options).some(function (option) { return option.value === String(pendingHostId); })) select.value = String(pendingHostId);
        pendingHostId = null;
      }
    } catch (error) { hostNotice.textContent = error.message; select.disabled = true; }
  }

  function troubleshootingContent(parent) {
    sectionHeading(parent, "Troubleshooting", "Guided routing and upstream checks for an existing proxy host.");
    var cardNode = card(parent, "Configured host workflow", "Choose an authorized proxy host and focus. The same bounded connectivity probe checks the configured upstream; arbitrary URLs and addresses are not accepted.");
    notice(cardNode, "");
    var form = element("div", "nyx-support-actions");
    var hostSelect = element("select", "nyx-support-input");
    hostSelect.setAttribute("aria-label", "Configured proxy host");
    hostSelect.append(element("option", "", "Loading configured hosts…"));
    var focusSelect = element("select", "nyx-support-input");
    focusSelect.setAttribute("aria-label", "Troubleshooting focus");
    [["all", "502 / Full route"], ["dns", "DNS resolution"], ["tcp", "Upstream connection"], ["tls", "Upstream TLS"], ["http", "Upstream HTTP"]].forEach(function (entry) {
      var option = element("option", "", entry[1]);
      option.value = entry[0];
      focusSelect.append(option);
    });
    var hostNotice = element("p", "nyx-support-muted", "");
    var run = button("Run workflow", async function () {
      var id = Number(hostSelect.value);
      if (!Number.isSafeInteger(id) || id < 1) { notice(cardNode, "Select a configured proxy host.", true); return; }
      notice(cardNode, "Running troubleshooting…");
      try {
        var data = await request("/api/professional-support/troubleshoot", { method: "POST", body: { workflow: "upstream_502", proxy_host_id: id } });
        if (!cardNode.isConnected) return;
        var output = cardNode.querySelector(".nyx-support-results");
        output.replaceChildren();
        var steps = Array.isArray(data.steps) ? data.steps : [];
        var focus = focusSelect.value;
        var focusedChecks = { dns: ["dns_resolution"], tcp: ["dns_resolution", "upstream_tcp"],
          tls: ["dns_resolution", "upstream_tcp", "upstream_tls"], http: ["dns_resolution", "upstream_tcp", "upstream_tls", "upstream_http"] };
        if (focus !== "all") steps = steps.filter(function (record) { return focusedChecks[focus] && focusedChecks[focus].includes(record.check); });
        steps.forEach(function (record) { resultCard(output, record); });
        if (!steps.length) output.append(element("p", "nyx-support-muted", "No steps were returned for this focus."));
        notice(cardNode, "Workflow completed.");
      } catch (error) { notice(cardNode, error.message, true); }
    });
    run.disabled = !canDiagnose();
    form.append(hostSelect, focusSelect, run);
    cardNode.append(form, hostNotice, element("div", "nyx-support-results"));
    inactiveNote(cardNode);
    if (canDiagnose()) loadHosts(hostSelect, hostNotice);
    else { hostSelect.disabled = true; hostNotice.textContent = "An active entitlement is required to run this workflow."; }
  }

  async function downloadBundle(cardNode) {
    if (!lastBundleSha) return;
    notice(cardNode, "Downloading verified bundle…");
    try {
    var response = await requestResponse("/api/professional-support/bundle/" + lastBundleSha + "/download");
    var raw = await response.text();
    var bytes = new TextEncoder().encode(raw);
    var hash = await crypto.subtle.digest("SHA-256", bytes);
    var actual = Array.from(new Uint8Array(hash), function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
    if (actual !== lastBundleSha) throw new Error("Downloaded bundle digest verification failed.");
    var url = URL.createObjectURL(new Blob([bytes], { type: "application/json" }));
    var link = element("a");
    link.href = url;
    link.download = "nyxguard-support-bundle.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    notice(cardNode, "Bundle downloaded and verified.");
    } catch (error) { notice(cardNode, error.message, true); }
  }

  async function fetchBundle() {
    var response = await requestResponse("/api/professional-support/bundle");
    var raw = await response.text();
    var bytes = new TextEncoder().encode(raw);
    var expected = response.headers.get("X-NyxGuard-Bundle-SHA256");
    if (!expected || !/^[0-9a-f]{64}$/i.test(expected)) throw new Error("Bundle digest is missing or invalid.");
    if (!window.crypto || !crypto.subtle) throw new Error("Secure bundle verification is unavailable in this browser.");
    var hash = await crypto.subtle.digest("SHA-256", bytes);
    var actual = Array.from(new Uint8Array(hash), function (byte) { return byte.toString(16).padStart(2, "0"); }).join("");
    if (actual !== expected.toLowerCase()) throw new Error("Bundle digest verification failed.");
    return { data: JSON.parse(raw), bytes: bytes, sha256: actual };
  }

  function bundleContent(parent) {
    sectionHeading(parent, "Support Bundle", "Generate and review safe metadata before downloading or uploading a structured support bundle.");
    var cardNode = card(parent, "Bundle workflow", "The bundle is redacted JSON, never a filesystem archive.");
    notice(cardNode, "");
    var info = element("div", "nyx-support-metrics");
    var actions = element("div", "nyx-support-actions");
    var download = button("Download bundle", function () { downloadBundle(cardNode); }, "nyx-support-button-secondary");
    download.disabled = !lastBundleBytes;
    var generate = button("Generate Support Bundle", async function () {
      notice(cardNode, "Generating bundle…");
      try {
        var fetched = await fetchBundle();
        if (!cardNode.isConnected) return;
        lastBundle = fetched.data;
        lastBundleBytes = fetched.bytes;
        lastBundleSha = fetched.sha256;
        info.replaceChildren();
        field(info, "Format", lastBundle.format || "Unknown");
        field(info, "Size", lastBundleBytes.length.toLocaleString() + " bytes");
        field(info, "SHA-256", lastBundleSha);
        field(info, "Generated", dateLabel(lastBundle.generated_at));
        download.disabled = false;
        notice(cardNode, "Bundle ready to download or upload.");
      } catch (error) { notice(cardNode, error.message, true); }
    });
    generate.disabled = !canDiagnose();
    var upload = button("Upload Support Bundle", async function () {
      notice(cardNode, "Preparing verified bundle for upload…");
      try {
        if (!lastBundleSha) {
          var fetched = await fetchBundle();
          lastBundle = fetched.data;
          lastBundleBytes = fetched.bytes;
          lastBundleSha = fetched.sha256;
          download.disabled = false;
          info.replaceChildren();
          field(info, "Format", lastBundle.format || "Unknown");
          field(info, "Size", lastBundleBytes.length.toLocaleString() + " bytes");
          field(info, "SHA-256", lastBundleSha);
          field(info, "Generated", dateLabel(lastBundle.generated_at));
        }
        notice(cardNode, "Uploading verified bundle…");
        var receipt = await request("/api/professional-support/upload", { method: "POST", body: { sha256: lastBundleSha } });
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
      field(info, "Size", lastBundleBytes.length.toLocaleString() + " bytes");
      if (lastBundleSha) field(info, "SHA-256", lastBundleSha);
      field(info, "Generated", dateLabel(lastBundle.generated_at));
    }
    if (lastSupportId) field(info, "Support ID", lastSupportId);
    if (pendingBundleGeneration && canDiagnose()) {
      pendingBundleGeneration = false;
      generate.click();
    }
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
    header.append(element("h1", "", "Diagnostics & Support"),
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
