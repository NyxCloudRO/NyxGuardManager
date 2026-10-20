(function() {
    "use strict";
 const nyxT=(source,values)=>window.NyxI18n.t(source,values);

    var vpnActive = false;
    var refreshTimer = null;
    var busy = false;
    var adding = false;
    var renaming = false;
    var selectedId = null;
    var currentData = {
        loaded: false,
        agentAvailable: true,
        sites: [],
        summary: {
            total: 0,
            connected: 0,
            active: 0
        }
    };

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
        if (!token) throw new Error(nyxT("Your session is not available. Sign in again."));
        options = options || {};
        var headers = Object.assign({
            Accept: "application/json",
            Authorization: "Bearer " + token
        }, options.headers || {});
        if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
        var response = await fetch("/api/vpn-client" + path, Object.assign({}, options, {
            headers: headers
        }));
        var result = await response.json().catch(function() {
            return {};
        });
        if (!response.ok) throw new Error(window.NyxI18n.error(result.error || {status:response.status}));
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
 if (!value) return nyxT("No handshake yet");
 const seconds=Math.max(0,Math.round((Date.now()-new Date(value).getTime())/1000));
 const formatter=new Intl.RelativeTimeFormat(window.NyxI18n.locale,{numeric:"always"});
 return seconds<60?formatter.format(-seconds,"second"):seconds<3600?formatter.format(-Math.floor(seconds/60),"minute"):formatter.format(-Math.floor(seconds/3600),"hour");
}

    function stateLabel(state) {
        return {
            connected: nyxT("Connected"),
            "interface-up": nyxT("Waiting"),
            disconnected: nyxT("Disconnected"),
            unavailable: nyxT("Unavailable")
        } [state] || nyxT("Unknown");
    }

    function panelMarkup() {
        return [
            '<div class="nyx-vpn-intro" style="margin:0 0 16px!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;background-color:transparent!important;box-shadow:none!important;outline:0!important">',
            ("<span class=\"nyx-vpn-intro-copy\">" + escapeHtml(nyxT("Connect NyxGuard to multiple remote sites with isolated WireGuard client profiles. Each site receives its own interface, routes, status, and connectivity test.")) + "</span>"),
            ("<div class=\"nyx-vpn-safety\"><strong>" + escapeHtml(nyxT("Safe routing:")) + "</strong> " + escapeHtml(nyxT("remote networks must not overlap between sites. Full-tunnel profiles are supported without overrides; existing local routes and Manager replies keep their original path; DNS changes and executable")) + " <code>PreUp/PostUp</code> " + escapeHtml(nyxT("hooks never reach the host.")) + "</div>"),
            '</div>',
            '<div id="nyx-vpn-message" class="nyx-vpn-message" hidden></div>',
            ("<section class=\"nyx-vpn-fleet-head\"><div><h3>" + escapeHtml(nyxT("VPN sites")) + "</h3><p>" + escapeHtml(nyxT("Manage independent tunnels without exposing remote applications publicly.")) + "</p></div><div class=\"nyx-vpn-fleet-tools\"><div id=\"nyx-vpn-summary\" class=\"nyx-vpn-summary\"></div><button class=\"nyx-vpn-secondary\" type=\"button\" data-vpn-action=\"refresh\">" + escapeHtml(nyxT("Refresh")) + "</button><button class=\"nyx-vpn-primary nyx-vpn-add-launch\" type=\"button\" data-vpn-action=\"add\"><span aria-hidden=\"true\">+</span> " + escapeHtml(nyxT("Add VPN site")) + "</button></div></section>"),
            '<div class="nyx-vpn-workspace"><aside class="nyx-vpn-site-pane"><div id="nyx-vpn-site-list" class="nyx-vpn-site-list"></div></aside><main id="nyx-vpn-detail" class="nyx-vpn-detail"></main></div>',
            ("<details class=\"nyx-vpn-guide\"><summary>" + escapeHtml(nyxT("How multi-site VPN works")) + "</summary><ol>"),
            ("<li>" + escapeHtml(nyxT("Add one dedicated WireGuard client profile for each remote site and give it a clear name.")) + "</li>"),
            ("<li>" + escapeHtml(nyxT("Use only that site’s private networks. NyxGuard blocks overlapping routes so traffic cannot enter the wrong tunnel.")) + "</li>"),
            ("<li>" + escapeHtml(nyxT("Connect sites independently. A recent handshake confirms that the selected remote peer answered.")) + "</li>"),
            ("<li>" + escapeHtml(nyxT("Test an internal address from the selected tunnel, then use that private address as a Proxy Host upstream.")) + "</li>"),
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
        return (currentData.sites || []).find(function(site) {
            return site.id === selectedId;
        }) || null;
    }

    function summaryMarkup() {
        if (currentData.error) return ("<span><strong>" + escapeHtml(nyxT("Unavailable")) + "</strong> " + escapeHtml(nyxT("· VPN Agent")) + "</span>");
        var summary = currentData.summary || {};
        return '<span><strong>' + Number(summary.connected || 0) + '</strong> connected</span><span><strong>' + Number(summary.total || 0) + '</strong> configured</span>';
    }

    function siteListMarkup() {
        var sites = currentData.sites || [];
        if (currentData.error) return ("<div class=\"nyx-vpn-empty-list\"><span>" + escapeHtml(nyxT("VPN sites unavailable")) + "</span><small>" + escapeHtml(nyxT("Refresh to retry the Agent connection.")) + "</small></div>");
        if (!sites.length) return ("<div class=\"nyx-vpn-empty-list\"><span>" + escapeHtml(nyxT("No VPN sites yet")) + "</span><small>" + escapeHtml(nyxT("Add a client profile to begin.")) + "</small></div>");
        return sites.map(function(site) {
            var route = (Array.isArray(site.allowedIps) ? site.allowedIps.join(", ") : "") || nyxT("No routes");
            var quickConnect = site.interfaceUp ? "" : '<button type="button" class="nyx-vpn-quick-connect" data-vpn-quick-connect="' + escapeHtml(site.id) + '" aria-label="Connect ' + escapeHtml(site.name) + ("\"><span class=\"nyx-vpn-connect-dot\" aria-hidden=\"true\"></span>" + escapeHtml(nyxT("Connect")) + "</button>");
            return '<div class="nyx-vpn-site-item ' + (site.id === selectedId && !adding ? "is-selected" : "") + '">' +
                '<button type="button" class="nyx-vpn-site-select" data-site-id="' + escapeHtml(site.id) + '">' +
                '<span class="nyx-vpn-site-dot is-' + escapeHtml(site.state) + '"></span><span class="nyx-vpn-site-copy"><strong>' + escapeHtml(site.name) + '</strong><small>' + escapeHtml(route) + '</small></span>' +
                '<span class="nyx-vpn-mini-state is-' + escapeHtml(site.state) + '">' + escapeHtml(stateLabel(site.state)) + '</span></button>' + quickConnect + '</div>';
        }).join("");
    }

    function addFormMarkup() {
        return [
            ("<section class=\"nyx-vpn-detail-card nyx-vpn-add-card\"><div class=\"nyx-vpn-detail-head\"><div><span class=\"nyx-vpn-eyebrow\">" + escapeHtml(nyxT("New connection")) + "</span><h3>" + escapeHtml(nyxT("Add VPN site")) + "</h3><p>" + escapeHtml(nyxT("Upload a dedicated WireGuard client profile. NyxGuard validates routes and security settings before storing it.")) + "</p></div><span class=\"nyx-vpn-ready-badge\">" + escapeHtml(nyxT("Ready for profile")) + "</span></div>"),
            '<form id="nyx-vpn-add-form" class="nyx-vpn-add-form">',
            ("<div class=\"nyx-vpn-add-step\"><span>1</span><div><strong>" + escapeHtml(nyxT("Name the remote site")) + "</strong><small>" + escapeHtml(nyxT("Optional. If left empty, NyxGuard uses the configuration filename.")) + "</small></div></div>"),
            ("<label class=\"nyx-vpn-label\" for=\"nyx-vpn-site-name\">" + escapeHtml(nyxT("Site name")) + " <span>" + escapeHtml(nyxT("(optional)")) + "</span></label><input id=\"nyx-vpn-site-name\" class=\"nyx-vpn-input\" type=\"text\" maxlength=\"60\" placeholder=\"" + escapeHtml(nyxT("Branch office")) + "\" autocomplete=\"off\">"),
            ("<div class=\"nyx-vpn-add-step\"><span>2</span><div><strong>" + escapeHtml(nyxT("Select the client profile")) + "</strong><small>" + escapeHtml(nyxT("Use one standard WireGuard")) + " <code>.conf</code> " + escapeHtml(nyxT("file dedicated to this NyxGuard site.")) + "</small></div></div>"),
            ("<label class=\"nyx-vpn-label\" for=\"nyx-vpn-file\">" + escapeHtml(nyxT("Client configuration")) + "</label><input id=\"nyx-vpn-file\" class=\"nyx-vpn-input nyx-vpn-file-input\" type=\"file\" accept=\".conf,text/plain\">"),
            ("<label class=\"nyx-vpn-label\" for=\"nyx-vpn-route-override\">" + escapeHtml(nyxT("Remote networks")) + " <span>" + escapeHtml(nyxT("(optional: restrict a full-tunnel profile)")) + "</span></label><input id=\"nyx-vpn-route-override\" class=\"nyx-vpn-input\" type=\"text\" placeholder=\"10.20.0.0/24\" autocomplete=\"off\">"),
            ("<small>" + escapeHtml(nyxT("Comma-separated CIDRs. Any private LAN range is supported when it does not overlap another VPN site or a network already used by NyxGuard.")) + "</small>"),
            ("<div id=\"nyx-vpn-add-readiness\" class=\"nyx-vpn-add-readiness\"><span class=\"nyx-vpn-site-dot\"></span><span>" + escapeHtml(nyxT("Choose a WireGuard .conf file to continue.")) + "</span></div>"),
            ("<div class=\"nyx-vpn-actions\"><button class=\"nyx-vpn-primary nyx-vpn-add-submit\" type=\"submit\">" + escapeHtml(nyxT("Validate and add VPN site")) + "</button>") + ((currentData.sites || []).length ? ("<button class=\"nyx-vpn-secondary\" type=\"button\" data-vpn-action=\"cancel-add\">" + escapeHtml(nyxT("Cancel")) + "</button>") : '') + '</div>',
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
        readiness.innerHTML = file ?
            '<span class="nyx-vpn-site-dot is-connected"></span><span><strong>' + escapeHtml(file.name) + ("</strong> " + escapeHtml(nyxT("selected. Ready to validate and add.")) + "</span>") :
            ("<span class=\"nyx-vpn-site-dot\"></span><span>" + escapeHtml(nyxT("Choose a WireGuard .conf file to continue.")) + "</span>");
    }

    function fact(label, value) {
        return '<div><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value || "—") + '</dd></div>';
    }

    function detailMarkup(site, preservedTarget) {
        if (!site) return '<section class="nyx-vpn-detail-card"><p>' + escapeHtml(currentData.error || (currentData.loaded ? nyxT("Select a VPN site.") : nyxT("Loading VPN sites…"))) + '</p></section>';
        site = Object.assign({
            warnings: [],
            addresses: [],
            allowedIps: [],
            endpoints: []
        }, site);
        ["warnings", "addresses", "allowedIps", "endpoints"].forEach(function(key) {
            if (!Array.isArray(site[key])) site[key] = [];
        });
        var warnings = site.warnings && site.warnings.length ? ("<div class=\"nyx-vpn-warnings\"><strong>" + escapeHtml(nyxT("Profile notes")) + "</strong>") + site.warnings.map(function(warning) {
            return '<span>' + escapeHtml(warning) + '</span>';
        }).join("") + '</div>' : '';
        var title = renaming ?
            '<form id="nyx-vpn-rename-form" class="nyx-vpn-rename-form"><input id="nyx-vpn-rename-input" class="nyx-vpn-input" type="text" maxlength="60" value="' + escapeHtml(site.name) + ("\" required><button class=\"nyx-vpn-primary\" type=\"submit\">" + escapeHtml(nyxT("Save")) + "</button><button class=\"nyx-vpn-secondary\" type=\"button\" data-vpn-action=\"cancel-rename\">" + escapeHtml(nyxT("Cancel")) + "</button></form>") :
            '<h3>' + escapeHtml(site.name) + '</h3>';
        return [
            ("<section class=\"nyx-vpn-detail-card\"><div class=\"nyx-vpn-detail-head\"><div class=\"nyx-vpn-detail-title\"><span class=\"nyx-vpn-eyebrow\">" + escapeHtml(nyxT("Remote site")) + "</span>") + title + '<p>' + escapeHtml(site.filename) + '</p></div><div class="nyx-vpn-detail-head-tools"><span class="nyx-vpn-badge nyx-vpn-badge-' + escapeHtml(site.state) + '">' + escapeHtml(stateLabel(site.state)) + '</span>' + (renaming ? '' : ("<button class=\"nyx-vpn-secondary nyx-vpn-rename-button\" type=\"button\" data-vpn-action=\"rename\">" + escapeHtml(nyxT("Rename")) + "</button>")) + '</div></div>',
            '<dl class="nyx-vpn-detail-grid">',
            fact(nyxT("Interface"), site.interface + (site.interfaceUp ? nyxT(" (up)") : nyxT(" (down)"))),
            fact(nyxT("Tunnel address"), (site.addresses || []).join(", ")),
            fact(nyxT("Remote networks"), (site.allowedIps || []).join(", ")),
            fact(nyxT("Endpoint"), (site.endpoints || []).join(", ")),
            fact(nyxT("Latest handshake"), formatHandshake(site.latestHandshake)),
            fact(nyxT("Transfer"), formatBytes(site.transferRx) + nyxT(" received / ") + formatBytes(site.transferTx) + nyxT(" sent")),
            fact(nyxT("Reconnect after restart"), site.autoConnect ? nyxT("Enabled") : nyxT("Disabled until first successful connection")),
            '</dl>', warnings,
            '<div class="nyx-vpn-actions"><button class="nyx-vpn-primary nyx-vpn-connect" type="button" data-vpn-action="connect" ' + (site.interfaceUp ? "disabled" : "") + ("><span class=\"nyx-vpn-connect-dot\" aria-hidden=\"true\"></span>" + escapeHtml(nyxT("Connect VPN")) + "</button><button class=\"nyx-vpn-secondary\" type=\"button\" data-vpn-action=\"disconnect\" ") + (!site.interfaceUp ? "disabled" : "") + (">" + escapeHtml(nyxT("Disconnect")) + "</button><button class=\"nyx-vpn-danger\" type=\"button\" data-vpn-action=\"delete\" ") + (site.interfaceUp ? "disabled" : "") + (">" + escapeHtml(nyxT("Delete site")) + "</button></div>"),
            ("<div class=\"nyx-vpn-site-test\"><div><h4>" + escapeHtml(nyxT("Test this site")) + "</h4><p>" + escapeHtml(nyxT("Ping an address through")) + " <code>") + escapeHtml(site.interface) + '</code>.</p></div><div class="nyx-vpn-test-row"><input id="nyx-vpn-target" class="nyx-vpn-input" type="text" value="' + escapeHtml(preservedTarget || "") + '" placeholder="10.20.0.10" autocomplete="off"><button class="nyx-vpn-primary" type="button" data-vpn-action="test" ' + (!site.interfaceUp ? "disabled" : "") + (">" + escapeHtml(nyxT("Run ping test")) + "</button></div><pre id=\"nyx-vpn-test-output\" class=\"nyx-vpn-output\" hidden></pre></div>"),
            '</section>'
        ].join("");
    }

    function render(panel) {
        var sites = currentData.sites || [];
        if (selectedId && !sites.some(function(site) {
                return site.id === selectedId;
            })) selectedId = null;
        if (!selectedId && sites.length) selectedId = sites[0].id;
        if (currentData.error) adding = false;
        else if (currentData.loaded && !sites.length) adding = true;
        var targetField = panel.querySelector("#nyx-vpn-target");
        var preservedTarget = targetField ? targetField.value : "";
        panel.querySelector("#nyx-vpn-summary").innerHTML = summaryMarkup();
        panel.querySelector("#nyx-vpn-site-list").innerHTML = siteListMarkup();
        var detail = panel.querySelector("#nyx-vpn-detail");
        if (!adding || !detail.querySelector("#nyx-vpn-add-form")) detail.innerHTML = adding ? addFormMarkup() : detailMarkup(selectedSite(), preservedTarget);
        panel.classList.toggle("is-busy", busy);
        if (busy) panel.querySelectorAll("button,input").forEach(function(element) {
            element.disabled = true;
        });
        else if (adding) panel.querySelectorAll("button,input").forEach(function(element) {
            element.disabled = false;
        });
    }

    async function refresh(panel, quiet) {
        if (quiet && (adding || renaming)) return currentData;
        try {
            var firstLoad = !currentData.loaded;
            var nextData = await api("/sites");
            if (!nextData || nextData.agentAvailable === false) throw new Error(nyxT("VPN Agent unavailable. Refresh to retry."));
            if (!Array.isArray(nextData.sites)) throw new Error(nyxT("VPN site response is unavailable."));
            currentData = Object.assign({}, nextData, {
                sites: nextData.sites.filter(function(site) {
                    return site && typeof site === "object";
                }),
                loaded: true,
                error: null
            });
            if (firstLoad && currentData.sites && currentData.sites.length) adding = false;
            render(panel);
            if (currentData.error && !quiet) message(panel, currentData.error, "error");
            return currentData;
        } catch (error) {
            if (adding) {
                render(panel);
                if (!quiet) message(panel, error.message, "error");
                return null;
            }
            currentData = {
                loaded: true,
                agentAvailable: false,
                sites: [],
                summary: {},
                error: error.message
            };
            selectedId = null;
            adding = false;
            render(panel);
            if (!quiet) message(panel, error.message, "error");
            return null;
        }
    }

    async function runAction(panel, action) {
        var site = selectedSite();
        if (!site || busy) return;
        if (action === "delete") {
            const {
                requestDecision
            } = await import("./confirmation-dialog-5013-7f8c7487369c.js");
            if (!await requestDecision({
                    title: nyxT("Delete VPN site?"),
                    action: nyxT("Delete site"),
                    reducesProtection: true,
                    message: nyxT("Delete VPN site “") + site.name + '”?'
                })) return;
        }
        busy = true;
        render(panel);
        message(panel, nyxT("Working…"), "info");
        try {
            if (action === "delete") {
                await api("/sites/" + encodeURIComponent(site.id), {
                    method: "DELETE"
                });
                selectedId = null;
                message(panel, nyxT("VPN site deleted."), "success");
            } else {
                await api("/sites/" + encodeURIComponent(site.id) + "/" + action, {
                    method: "POST"
                });
                message(panel, action === "connect" ? nyxT("WireGuard interface started. Waiting for a handshake from the remote peer.") : nyxT("VPN site disconnected and its routes were removed."), "success");
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
        if (!file) return message(panel, nyxT("Select a WireGuard .conf file first."), "error");
        var data = new FormData();
        data.append("config", file);
        data.append("name", form.querySelector("#nyx-vpn-site-name").value.trim());
        data.append("routeOverride", form.querySelector("#nyx-vpn-route-override").value.trim());
        busy = true;
        render(panel);
        message(panel, nyxT("Validating and adding VPN site…"), "info");
        try {
            var site = await api("/sites", {
                method: "POST",
                body: data
            });
            selectedId = site.id;
            adding = false;
            message(panel, nyxT("VPN site added. Review its routes, then connect it."), "success");
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
        if (!site || !name || busy) return message(panel, nyxT("Enter a site name."), "error");
        busy = true;
        render(panel);
        message(panel, nyxT("Renaming VPN site…"), "info");
        try {
            await api("/sites/" + encodeURIComponent(site.id), {
                method: "PATCH",
                body: JSON.stringify({
                    name: name
                })
            });
            renaming = false;
            message(panel, nyxT("VPN site renamed."), "success");
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
        if (!site || !target || busy) return message(panel, nyxT("Enter an internal IP address or hostname for this site."), "error");
        busy = true;
        panel.classList.add("is-busy");
        output.hidden = false;
        output.textContent = nyxT("Testing ") + target + nyxT(" through ") + site.interface + "…";
        try {
            var result = await api("/sites/" + encodeURIComponent(site.id) + "/test", {
                method: "POST",
                body: JSON.stringify({
                    target: target
                })
            });
            output.textContent = result.output || (result.ok ? nyxT("Ping succeeded.") : nyxT("Ping failed."));
            message(panel, result.ok ? nyxT("The remote host answered through the selected VPN site.") : nyxT("Ping did not receive a reply. Check the remote firewall and target host."), result.ok ? "success" : "error");
        } catch (error) {
            output.textContent = window.NyxI18n.error(error);
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
        panel.addEventListener("click", function(event) {
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
                if (renameInput) {
                    renameInput.focus();
                    renameInput.select();
                }
            } else if (action === "cancel-rename") {
                renaming = false;
                render(panel);
            } else if (action === "refresh") refresh(panel, false);
            else if (action === "test") testSite(panel);
            else runAction(panel, action);
        });
        panel.addEventListener("submit", function(event) {
            if (event.target.id === "nyx-vpn-add-form") {
                event.preventDefault();
                addSite(panel, event.target);
            } else if (event.target.id === "nyx-vpn-rename-form") {
                event.preventDefault();
                renameSite(panel, event.target);
            }
        });
        panel.addEventListener("change", function(event) {
            if (event.target.id === "nyx-vpn-file") updateAddReadiness(panel);
        });
        render(panel);
    }

    function findLanTab() {
 return document.querySelector('button[data-nyx-settings-tab="lan-access"]');
}

    function deactivate(card, panel, button) {
        vpnActive = false;
        card.classList.remove("nyx-vpn-mode");
        button.classList.remove("nyx-vpn-tab-active");
        panel.hidden = true;
        Array.from(card.children).forEach(function(child) {
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
        Array.from(card.children).forEach(function(child) {
            if (child === tabBar) {
                afterTabBar = true;
                return;
            }
            if (afterTabBar && child !== panel) {
                child.dataset.nyxVpnHidden = "1";
                child.style.setProperty("display", "none", "important");
            }
        });
        if (alreadyActive) return;
        refresh(panel, false);
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(function() {
            if (vpnActive && !busy) refresh(panel, true);
        }, 5000);
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
            button.textContent = nyxT("VPN Client");
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
            button.addEventListener("click", function() {
                activate(card, tabBar, panel, button);
            });
        }
        Array.from(tabBar.querySelectorAll("button:not(.nyx-vpn-tab)")).forEach(function(nativeButton) {
            if (nativeButton.dataset.nyxVpnNativeBound === "1") return;
            nativeButton.dataset.nyxVpnNativeBound = "1";
            nativeButton.addEventListener("click", function() {
                deactivate(card, panel, button);
            }, true);
        });
        if (vpnActive) activate(card, tabBar, panel, button);
    }

    var scheduled = false;

    function scheduleEnhance() {
        if (scheduled) return;
        scheduled = true;
        setTimeout(function() {
            scheduled = false;
            enhanceSettings();
        }, 80);
    }

    scheduleEnhance();
    new MutationObserver(scheduleEnhance).observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
    });
    window.addEventListener("popstate", scheduleEnhance);
    window.addEventListener("hashchange", scheduleEnhance);
})();