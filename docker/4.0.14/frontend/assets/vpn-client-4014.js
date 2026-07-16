(function () {
	"use strict";

	var vpnActive = false;
	var refreshTimer = null;
	var busy = false;
	var adding = false;
	var renaming = false;
	var selectedId = null;
	var currentData = { loaded: false, agentAvailable: true, sites: [], summary: { total: 0, connected: 0, active: 0 } };

	function authToken() {
		try {
			var stored = JSON.parse(localStorage.getItem("authentications") || "[]");
			return Array.isArray(stored) && stored.length ? stored[stored.length - 1].token : null;
		} catch (_) {
			return null;
		}
	}

	async function api(path, options) {
		var token = authToken();
		if (!token) throw new Error("Your session is not available. Sign in again.");
		options = options || {};
		var headers = Object.assign({ Accept: "application/json", Authorization: "Bearer " + token }, options.headers || {});
		if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
		var response = await fetch("/api/vpn-client" + path, Object.assign({}, options, { headers: headers }));
		var result = await response.json().catch(function () { return {}; });
		if (!response.ok) throw new Error(result.error && result.error.message ? result.error.message : "HTTP " + response.status);
		return result;
	}

	function escapeHtml(value) {
		return String(value == null ? "" : value)
			.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;").replace(/'/g, "&#039;");
	}

	function formatBytes(value) {
		var bytes = Number(value) || 0;
		if (bytes < 1024) return bytes + " B";
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KiB";
		if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MiB";
		return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GiB";
	}

	function formatHandshake(value) {
		if (!value) return "No handshake yet";
		var seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
		if (seconds < 60) return seconds + " seconds ago";
		if (seconds < 3600) return Math.floor(seconds / 60) + " minutes ago";
		return Math.floor(seconds / 3600) + " hours ago";
	}

	function stateLabel(state) {
		return { connected: "Connected", "interface-up": "Waiting", disconnected: "Disconnected", unavailable: "Unavailable" }[state] || "Unknown";
	}

	function panelMarkup() {
		return [
			'<div class="nyx-vpn-intro" style="margin:0 0 16px!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;background-color:transparent!important;box-shadow:none!important;outline:0!important">',
			'<span class="nyx-vpn-intro-copy">Connect NyxGuard to multiple remote sites with isolated WireGuard client profiles. Each site receives its own interface, routes, status, and connectivity test.</span>',
			'<div class="nyx-vpn-safety"><strong>Safe routing:</strong> remote networks must not overlap between sites. Full-tunnel routes are replaced with the explicit private networks you provide; DNS changes and executable <code>PreUp/PostUp</code> hooks never reach the host.</div>',
			'</div>',
			'<div id="nyx-vpn-message" class="nyx-vpn-message" hidden></div>',
			'<section class="nyx-vpn-fleet-head"><div><h3>VPN sites</h3><p>Manage independent tunnels without exposing remote applications publicly.</p></div><div class="nyx-vpn-fleet-tools"><div id="nyx-vpn-summary" class="nyx-vpn-summary"></div><button class="nyx-vpn-secondary" type="button" data-vpn-action="refresh">Refresh</button><button class="nyx-vpn-primary nyx-vpn-add-launch" type="button" data-vpn-action="add"><span aria-hidden="true">+</span> Add VPN site</button></div></section>',
			'<div class="nyx-vpn-workspace"><aside class="nyx-vpn-site-pane"><div id="nyx-vpn-site-list" class="nyx-vpn-site-list"></div></aside><main id="nyx-vpn-detail" class="nyx-vpn-detail"></main></div>',
			'<details class="nyx-vpn-guide"><summary>How multi-site VPN works</summary><ol>',
			'<li>Add one dedicated WireGuard client profile for each remote site and give it a clear name.</li>',
			'<li>Use only that site’s private networks. NyxGuard blocks overlapping routes so traffic cannot enter the wrong tunnel.</li>',
			'<li>Connect sites independently. A recent handshake confirms that the selected remote peer answered.</li>',
			'<li>Test an internal address from the selected tunnel, then use that private address as a Proxy Host upstream.</li>',
			'</ol></details>'
		].join("");
	}

	function message(panel, text, kind) {
		var element = panel.querySelector("#nyx-vpn-message");
		if (!text) {
			element.hidden = true;
			return;
		}
		element.className = "nyx-vpn-message nyx-vpn-message-" + (kind || "info");
		element.textContent = text;
		element.hidden = false;
	}

	function selectedSite() {
		return (currentData.sites || []).find(function (site) { return site.id === selectedId; }) || null;
	}

	function summaryMarkup() {
		var summary = currentData.summary || {};
		return '<span><strong>' + Number(summary.connected || 0) + '</strong> connected</span><span><strong>' + Number(summary.total || 0) + '</strong> configured</span>';
	}

	function siteListMarkup() {
		var sites = currentData.sites || [];
		if (!sites.length) return '<div class="nyx-vpn-empty-list"><span>No VPN sites yet</span><small>Add a client profile to begin.</small></div>';
		return sites.map(function (site) {
			var route = (site.allowedIps || []).join(", ") || "No routes";
			var quickConnect = site.interfaceUp ? "" : '<button type="button" class="nyx-vpn-quick-connect" data-vpn-quick-connect="' + escapeHtml(site.id) + '" aria-label="Connect ' + escapeHtml(site.name) + '"><span class="nyx-vpn-connect-dot" aria-hidden="true"></span>Connect</button>';
			return '<div class="nyx-vpn-site-item ' + (site.id === selectedId && !adding ? "is-selected" : "") + '">' +
				'<button type="button" class="nyx-vpn-site-select" data-site-id="' + escapeHtml(site.id) + '">' +
				'<span class="nyx-vpn-site-dot is-' + escapeHtml(site.state) + '"></span><span class="nyx-vpn-site-copy"><strong>' + escapeHtml(site.name) + '</strong><small>' + escapeHtml(route) + '</small></span>' +
				'<span class="nyx-vpn-mini-state is-' + escapeHtml(site.state) + '">' + escapeHtml(stateLabel(site.state)) + '</span></button>' + quickConnect + '</div>';
		}).join("");
	}

	function addFormMarkup() {
		return [
			'<section class="nyx-vpn-detail-card nyx-vpn-add-card"><div class="nyx-vpn-detail-head"><div><span class="nyx-vpn-eyebrow">New connection</span><h3>Add VPN site</h3><p>Upload a dedicated WireGuard client profile. NyxGuard validates routes and security settings before storing it.</p></div><span class="nyx-vpn-ready-badge">Ready for profile</span></div>',
			'<form id="nyx-vpn-add-form" class="nyx-vpn-add-form">',
			'<div class="nyx-vpn-add-step"><span>1</span><div><strong>Name the remote site</strong><small>Optional. If left empty, NyxGuard uses the configuration filename.</small></div></div>',
			'<label class="nyx-vpn-label" for="nyx-vpn-site-name">Site name <span>(optional)</span></label><input id="nyx-vpn-site-name" class="nyx-vpn-input" type="text" maxlength="60" placeholder="Branch office" autocomplete="off">',
			'<div class="nyx-vpn-add-step"><span>2</span><div><strong>Select the client profile</strong><small>Use one standard WireGuard <code>.conf</code> file dedicated to this NyxGuard site.</small></div></div>',
			'<label class="nyx-vpn-label" for="nyx-vpn-file">Client configuration</label><input id="nyx-vpn-file" class="nyx-vpn-input nyx-vpn-file-input" type="file" accept=".conf,text/plain">',
			'<label class="nyx-vpn-label" for="nyx-vpn-route-override">Remote networks <span>(required only for full-tunnel profiles)</span></label><input id="nyx-vpn-route-override" class="nyx-vpn-input" type="text" placeholder="10.20.0.0/24" autocomplete="off">',
			'<small>Comma-separated CIDRs. Any private LAN range is supported when it does not overlap another VPN site or a network already used by NyxGuard.</small>',
			'<div id="nyx-vpn-add-readiness" class="nyx-vpn-add-readiness"><span class="nyx-vpn-site-dot"></span><span>Choose a WireGuard .conf file to continue.</span></div>',
			'<div class="nyx-vpn-actions"><button class="nyx-vpn-primary nyx-vpn-add-submit" type="submit">Validate and add VPN site</button>' + ((currentData.sites || []).length ? '<button class="nyx-vpn-secondary" type="button" data-vpn-action="cancel-add">Cancel</button>' : '') + '</div>',
			'</form></section>'
		].join("");
	}

	function updateAddReadiness(panel) {
		var fileInput = panel.querySelector("#nyx-vpn-file");
		var readiness = panel.querySelector("#nyx-vpn-add-readiness");
		if (!fileInput || !readiness) return;
		var file = fileInput.files && fileInput.files[0];
		readiness.classList.toggle("is-ready", !!file);
		if (file) message(panel, "");
		readiness.innerHTML = file
			? '<span class="nyx-vpn-site-dot is-connected"></span><span><strong>' + escapeHtml(file.name) + '</strong> selected. Ready to validate and add.</span>'
			: '<span class="nyx-vpn-site-dot"></span><span>Choose a WireGuard .conf file to continue.</span>';
	}

	function fact(label, value) {
		return '<div><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value || "—") + '</dd></div>';
	}

	function detailMarkup(site, preservedTarget) {
		var warnings = site.warnings && site.warnings.length ? '<div class="nyx-vpn-warnings"><strong>Profile notes</strong>' + site.warnings.map(function (warning) { return '<span>' + escapeHtml(warning) + '</span>'; }).join("") + '</div>' : '';
		var title = renaming
			? '<form id="nyx-vpn-rename-form" class="nyx-vpn-rename-form"><input id="nyx-vpn-rename-input" class="nyx-vpn-input" type="text" maxlength="60" value="' + escapeHtml(site.name) + '" required><button class="nyx-vpn-primary" type="submit">Save</button><button class="nyx-vpn-secondary" type="button" data-vpn-action="cancel-rename">Cancel</button></form>'
			: '<h3>' + escapeHtml(site.name) + '</h3>';
		return [
			'<section class="nyx-vpn-detail-card"><div class="nyx-vpn-detail-head"><div class="nyx-vpn-detail-title"><span class="nyx-vpn-eyebrow">Remote site</span>' + title + '<p>' + escapeHtml(site.filename) + '</p></div><div class="nyx-vpn-detail-head-tools"><span class="nyx-vpn-badge nyx-vpn-badge-' + escapeHtml(site.state) + '">' + escapeHtml(stateLabel(site.state)) + '</span>' + (renaming ? '' : '<button class="nyx-vpn-secondary nyx-vpn-rename-button" type="button" data-vpn-action="rename">Rename</button>') + '</div></div>',
			'<dl class="nyx-vpn-detail-grid">',
			fact("Interface", site.interface + (site.interfaceUp ? " (up)" : " (down)")),
			fact("Tunnel address", (site.addresses || []).join(", ")),
			fact("Remote networks", (site.allowedIps || []).join(", ")),
			fact("Endpoint", (site.endpoints || []).join(", ")),
			fact("Latest handshake", formatHandshake(site.latestHandshake)),
			fact("Transfer", formatBytes(site.transferRx) + " received / " + formatBytes(site.transferTx) + " sent"),
			fact("Reconnect after restart", site.autoConnect ? "Enabled" : "Disabled until first successful connection"),
			'</dl>', warnings,
			'<div class="nyx-vpn-actions"><button class="nyx-vpn-primary nyx-vpn-connect" type="button" data-vpn-action="connect" ' + (site.interfaceUp ? "disabled" : "") + '><span class="nyx-vpn-connect-dot" aria-hidden="true"></span>Connect VPN</button><button class="nyx-vpn-secondary" type="button" data-vpn-action="disconnect" ' + (!site.interfaceUp ? "disabled" : "") + '>Disconnect</button><button class="nyx-vpn-danger" type="button" data-vpn-action="delete" ' + (site.interfaceUp ? "disabled" : "") + '>Delete site</button></div>',
			'<div class="nyx-vpn-site-test"><div><h4>Test this site</h4><p>Ping an address through <code>' + escapeHtml(site.interface) + '</code>.</p></div><div class="nyx-vpn-test-row"><input id="nyx-vpn-target" class="nyx-vpn-input" type="text" value="' + escapeHtml(preservedTarget || "") + '" placeholder="10.20.0.10" autocomplete="off"><button class="nyx-vpn-primary" type="button" data-vpn-action="test" ' + (!site.interfaceUp ? "disabled" : "") + '>Run ping test</button></div><pre id="nyx-vpn-test-output" class="nyx-vpn-output" hidden></pre></div>',
			'</section>'
		].join("");
	}

	function render(panel) {
		var sites = currentData.sites || [];
		if (selectedId && !sites.some(function (site) { return site.id === selectedId; })) selectedId = null;
		if (!selectedId && sites.length) selectedId = sites[0].id;
		if (currentData.loaded && !sites.length) adding = true;
		var targetField = panel.querySelector("#nyx-vpn-target");
		var preservedTarget = targetField ? targetField.value : "";
		panel.querySelector("#nyx-vpn-summary").innerHTML = summaryMarkup();
		panel.querySelector("#nyx-vpn-site-list").innerHTML = siteListMarkup();
		var detail = panel.querySelector("#nyx-vpn-detail");
		detail.innerHTML = adding ? addFormMarkup() : detailMarkup(selectedSite(), preservedTarget);
		panel.classList.toggle("is-busy", busy);
		if (busy) panel.querySelectorAll("button,input").forEach(function (element) { element.disabled = true; });
	}

	async function refresh(panel, quiet) {
		if (quiet && (adding || renaming)) return currentData;
		try {
			var firstLoad = !currentData.loaded;
			currentData = await api("/sites");
			currentData.loaded = true;
			if (firstLoad && currentData.sites && currentData.sites.length) adding = false;
			render(panel);
			if (currentData.error && !quiet) message(panel, currentData.error, "error");
			return currentData;
		} catch (error) {
			if (!quiet) message(panel, error.message, "error");
			return null;
		}
	}

	async function runAction(panel, action) {
		var site = selectedSite();
		if (!site || busy) return;
		if (action === "delete" && !window.confirm('Delete VPN site “' + site.name + '”?')) return;
		busy = true;
		render(panel);
		message(panel, "Working…", "info");
		try {
			if (action === "delete") {
				await api("/sites/" + encodeURIComponent(site.id), { method: "DELETE" });
				selectedId = null;
				message(panel, "VPN site deleted.", "success");
			} else {
				await api("/sites/" + encodeURIComponent(site.id) + "/" + action, { method: "POST" });
				message(panel, action === "connect" ? "WireGuard interface started. Waiting for a handshake from the remote peer." : "VPN site disconnected and its routes were removed.", "success");
			}
		} catch (error) {
			message(panel, error.message, "error");
		} finally {
			busy = false;
			await refresh(panel, false);
		}
	}

	async function addSite(panel, form) {
		if (busy) return;
		var file = form.querySelector("#nyx-vpn-file").files[0];
		if (!file) return message(panel, "Select a WireGuard .conf file first.", "error");
		var data = new FormData();
		data.append("config", file);
		data.append("name", form.querySelector("#nyx-vpn-site-name").value.trim());
		data.append("routeOverride", form.querySelector("#nyx-vpn-route-override").value.trim());
		busy = true;
		render(panel);
		message(panel, "Validating and adding VPN site…", "info");
		try {
			var site = await api("/sites", { method: "POST", body: data });
			selectedId = site.id;
			adding = false;
			message(panel, "VPN site added. Review its routes, then connect it.", "success");
		} catch (error) {
			message(panel, error.message, "error");
		} finally {
			busy = false;
			await refresh(panel, false);
		}
	}

	async function renameSite(panel, form) {
		var site = selectedSite();
		var name = form.querySelector("#nyx-vpn-rename-input").value.replace(/\s+/g, " ").trim();
		if (!site || !name || busy) return message(panel, "Enter a site name.", "error");
		busy = true;
		render(panel);
		message(panel, "Renaming VPN site…", "info");
		try {
			await api("/sites/" + encodeURIComponent(site.id), { method: "PATCH", body: JSON.stringify({ name: name }) });
			renaming = false;
			message(panel, "VPN site renamed.", "success");
		} catch (error) {
			message(panel, error.message, "error");
		} finally {
			busy = false;
			await refresh(panel, false);
		}
	}

	async function testSite(panel) {
		var site = selectedSite();
		var input = panel.querySelector("#nyx-vpn-target");
		var output = panel.querySelector("#nyx-vpn-test-output");
		var target = input && input.value.trim();
		if (!site || !target || busy) return message(panel, "Enter an internal IP address or hostname for this site.", "error");
		busy = true;
		panel.classList.add("is-busy");
		output.hidden = false;
		output.textContent = "Testing " + target + " through " + site.interface + "…";
		try {
			var result = await api("/sites/" + encodeURIComponent(site.id) + "/test", { method: "POST", body: JSON.stringify({ target: target }) });
			output.textContent = result.output || (result.ok ? "Ping succeeded." : "Ping failed.");
			message(panel, result.ok ? "The remote host answered through the selected VPN site." : "Ping did not receive a reply. Check the remote firewall and target host.", result.ok ? "success" : "error");
		} catch (error) {
			output.textContent = error.message;
			message(panel, error.message, "error");
		} finally {
			busy = false;
			panel.classList.remove("is-busy");
		}
	}

	function bindPanel(panel) {
		if (panel.dataset.bound === "1") return;
		panel.dataset.bound = "1";
		panel.innerHTML = panelMarkup();
		panel.addEventListener("click", function (event) {
			var quickConnect = event.target.closest("[data-vpn-quick-connect]");
			if (quickConnect && !busy) {
				selectedId = quickConnect.dataset.vpnQuickConnect;
				adding = false;
				renaming = false;
				render(panel);
				runAction(panel, "connect");
				return;
			}
			var siteButton = event.target.closest("[data-site-id]");
			if (siteButton && !busy) {
				selectedId = siteButton.dataset.siteId;
				adding = false;
				renaming = false;
				render(panel);
				return;
			}
			var actionButton = event.target.closest("[data-vpn-action]");
			if (!actionButton || busy) return;
			var action = actionButton.dataset.vpnAction;
			if (action === "add") {
				adding = true;
				renaming = false;
				selectedId = null;
				render(panel);
			} else if (action === "cancel-add") {
				adding = false;
				if (!selectedId && currentData.sites && currentData.sites.length) selectedId = currentData.sites[0].id;
				render(panel);
			} else if (action === "rename") {
				renaming = true;
				render(panel);
				var renameInput = panel.querySelector("#nyx-vpn-rename-input");
				if (renameInput) { renameInput.focus(); renameInput.select(); }
			} else if (action === "cancel-rename") {
				renaming = false;
				render(panel);
			} else if (action === "refresh") refresh(panel, false);
			else if (action === "test") testSite(panel);
			else runAction(panel, action);
		});
		panel.addEventListener("submit", function (event) {
			if (event.target.id === "nyx-vpn-add-form") {
				event.preventDefault();
				addSite(panel, event.target);
			} else if (event.target.id === "nyx-vpn-rename-form") {
				event.preventDefault();
				renameSite(panel, event.target);
			}
		});
		panel.addEventListener("change", function (event) {
			if (event.target.id === "nyx-vpn-file") updateAddReadiness(panel);
		});
		render(panel);
	}

	function findLanTab() {
		var labels = ["lan access", "acces lan", "acceso lan", "accès lan", "accesso lan"];
		return Array.from(document.querySelectorAll("button")).find(function (button) {
			return labels.indexOf((button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase()) !== -1;
		}) || null;
	}

	function deactivate(card, panel, button) {
		vpnActive = false;
		card.classList.remove("nyx-vpn-mode");
		button.classList.remove("nyx-vpn-tab-active");
		panel.hidden = true;
		Array.from(card.children).forEach(function (child) {
			if (child.dataset.nyxVpnHidden === "1") {
				child.style.removeProperty("display");
				delete child.dataset.nyxVpnHidden;
			}
		});
		if (refreshTimer) clearInterval(refreshTimer);
		refreshTimer = null;
	}

	function activate(card, tabBar, panel, button) {
		var alreadyActive = card.classList.contains("nyx-vpn-mode");
		vpnActive = true;
		card.classList.add("nyx-vpn-mode");
		button.classList.add("nyx-vpn-tab-active");
		panel.hidden = false;
		var afterTabBar = false;
		Array.from(card.children).forEach(function (child) {
			if (child === tabBar) { afterTabBar = true; return; }
			if (afterTabBar && child !== panel) {
				child.dataset.nyxVpnHidden = "1";
				child.style.setProperty("display", "none", "important");
			}
		});
		if (alreadyActive) return;
		refresh(panel, false);
		if (refreshTimer) clearInterval(refreshTimer);
		refreshTimer = setInterval(function () { if (vpnActive && !busy) refresh(panel, true); }, 5000);
	}

	function enhanceSettings() {
		if (!/^\/settings\/?$/.test(window.location.pathname)) return;
		var lanTab = findLanTab();
		if (!lanTab) return;
		var tabBar = lanTab.parentElement;
		var card = tabBar && tabBar.parentElement;
		if (!tabBar || !card) return;
		var button = tabBar.querySelector(".nyx-vpn-tab");
		var panel = card.querySelector(":scope > .nyx-vpn-panel");
		if (!button) {
			button = lanTab.cloneNode(false);
			button.type = "button";
			button.classList.add("nyx-vpn-tab");
			button.textContent = "VPN Client";
			lanTab.insertAdjacentElement("afterend", button);
		}
		if (!panel) {
			panel = document.createElement("div");
			panel.className = "nyx-vpn-panel";
			panel.style.cssText = "color:var(--app-text-primary);background:transparent!important;background-color:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;outline:0!important;padding:0!important";
			panel.hidden = true;
			tabBar.insertAdjacentElement("afterend", panel);
			bindPanel(panel);
		}
		if (button.dataset.nyxVpnBound !== "1") {
			button.dataset.nyxVpnBound = "1";
			button.addEventListener("click", function () { activate(card, tabBar, panel, button); });
		}
		Array.from(tabBar.querySelectorAll("button:not(.nyx-vpn-tab)")).forEach(function (nativeButton) {
			if (nativeButton.dataset.nyxVpnNativeBound === "1") return;
			nativeButton.dataset.nyxVpnNativeBound = "1";
			nativeButton.addEventListener("click", function () { deactivate(card, panel, button); }, true);
		});
		if (vpnActive) activate(card, tabBar, panel, button);
	}

	var scheduled = false;
	function scheduleEnhance() {
		if (scheduled) return;
		scheduled = true;
		setTimeout(function () { scheduled = false; enhanceSettings(); }, 80);
	}

	scheduleEnhance();
	new MutationObserver(scheduleEnhance).observe(document.body || document.documentElement, { childList: true, subtree: true });
	window.addEventListener("popstate", scheduleEnhance);
	window.addEventListener("hashchange", scheduleEnhance);
})();
