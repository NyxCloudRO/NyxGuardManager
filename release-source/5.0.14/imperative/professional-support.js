import {
    mountAppPage
} from './AppPage-CHaZeb42-5013-7f8c7487369c.js';
(function() {
    "use strict";
 const nyxT=(source,values)=>window.NyxI18n.t(source,values);

    function managerProcessDuration(seconds) {
 if (!Number.isSafeInteger(seconds)||seconds<0) return nyxT("Unavailable");
 const minutes=Math.floor(seconds/60);if(minutes<1)return nyxT("Less than a minute");
 const hours=Math.floor(minutes/60),days=Math.floor(hours/24),values=[];
 if(days)values.push(new Intl.NumberFormat(window.NyxI18n.locale,{style:"unit",unit:"day",unitDisplay:"long"}).format(days));
 if(hours%24)values.push(new Intl.NumberFormat(window.NyxI18n.locale,{style:"unit",unit:"hour",unitDisplay:"long"}).format(hours%24));
 if(minutes%60)values.push(new Intl.NumberFormat(window.NyxI18n.locale,{style:"unit",unit:"minute",unitDisplay:"long"}).format(minutes%60));
 return new Intl.ListFormat(window.NyxI18n.locale,{style:"long",type:"conjunction"}).format(values);
}


    var LICENSE_HASH = "#nyxguard-license";
    var SUPPORT_HASH = "#nyxguard-diagnostics-support";
    var LEGACY_HASH = "#nyxguard-professional-support";
    var tabs = [nyxT("Overview"), nyxT("Diagnostics"), nyxT("Troubleshooting"), nyxT("Support Bundle")];
    var tabSlugs = ["overview", "diagnostics", "troubleshooting", "support-bundle"];
    var systemChecks = new Set(["certbot_runtime", "dns_challenge_plugin", "certbot_executable", "certificate_storage", "certificate_storage_write", "application_version", "backend_health", "database_reachability", "migrations_current", "openresty_health", "configuration_valid", "disk_capacity", "memory_pressure", "cpu_usage", "uptime", "restart_indicator", "error_indicator"]);
    var tlsChecks = new Set(["certificate_presence", "certificate_expiry", "san_match", "chain_valid", "renewal_ready", "acme_ready", "dns_challenge_ready"]);
    var guidance = {
        database_reachability: nyxT("Check the MariaDB service and its connection settings."),
        migrations_current: nyxT("Confirm that the 5.0.0 migration completed."),
        openresty_health: nyxT("Validate the OpenResty configuration and service health."),
        disk_capacity: nyxT("Free disk space before writes fail."),
        memory_pressure: nyxT("Review memory pressure on the NyxGuard host."),
        dns_resolution: nyxT("Check the configured upstream name and DNS resolver."),
        listener_match: nyxT("Confirm the proxy host is enabled and listens on the expected port."),
        route_match: nyxT("Review the configured hostname and route rules."),
        upstream_tcp: nyxT("Check the configured upstream service and port."),
        upstream_tls: nyxT("Check the upstream certificate, name, and trust chain."),
        upstream_http: nyxT("Inspect the upstream service response."),
        certificate_presence: nyxT("Assign a certificate to this configured proxy host."),
        certificate_expiry: nyxT("Renew or replace the certificate."),
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
        } catch (_) {
            return "";
        }
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
        var panel = card(parent, nyxT("Support status unavailable"), nyxT("NyxGuard could not load the entitlement state for this installation."));
        notice(panel, window.NyxI18n.error(error), true);
        panel.append(button(nyxT("Try again"), function() {
            unmount();
            renderRoute();
        }, "nyx-support-button-secondary"));
    }

    function statusLabel(state) {
        return ({
            NOT_CONFIGURED: nyxT("Not configured"),
            ACTIVE: nyxT("Active"),
            EXPIRED: nyxT("Expired"),
            REVOKED: nyxT("Revoked"),
            REFRESH_REQUIRED: nyxT("Refresh required"),
            AUTHORITY_UNAVAILABLE: nyxT("Authority unavailable"),
            OFFLINE_GRACE: nyxT("Offline grace"),
            INVALID: nyxT("Invalid")
        })[state] || nyxT("Unavailable");
    }

    function productLabel(product) {
        if (product === "nyxguard-manager-professional-support") return nyxT("NyxGuard Manager Professional Support");
        if (product === "nyxcloud-premium-support") return nyxT("NyxCloud Premium Support");
        return nyxT("Not available");
    }

    function dateLabel(raw) {
        if (!raw) return nyxT("Not available");
        var date = new Date(raw);
        return Number.isNaN(date.getTime()) ? nyxT("Not available") : new Intl.DateTimeFormat(window.NyxI18n.locale, {
            dateStyle: "medium",
            timeStyle: "short"
        }).format(date);
    }

    function canDiagnose() {
        return !!(latestStatus && latestStatus.enabled);
    }

    function canUpload() {
        return !!(latestStatus && latestStatus.state === "ACTIVE");
    }

    async function requestResponse(path, options) {
        var auth = token();
        if (!auth) throw new Error(nyxT("Sign in to use Professional Support."));
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
        if (!response.ok) {
            var failure = await response.json().catch(function() {
                return null;
            });
            var reported = failure && failure.error;
            var safeMessage = reported && /^[a-f0-9-]{36}$/i.test(reported.diagnostic_id || "") && typeof reported.message === "string" && reported.message.length <= 600 && !/(?:password|secret|token|authorization|cookie|credential)\s*[:=]|-----BEGIN|\bat\s+.+:\d+/i.test(reported.message) ? window.NyxI18n.error(reported) : nyxT("Request failed (HTTP ") + response.status + ").";
            throw new Error(safeMessage);
        }
        return response;
    }

    async function request(path, options) {
        return (await requestResponse(path, options)).json();
    }

    function field(parent, title, value) {
        var cell = element("div", "nyx-support-field");
        cell.append(element("span", "nyx-support-field-label", title), element("strong", "", value == null ? nyxT("Not available") : value));
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
        note.append(element("strong", "", nyxT("Support is locked. ")), document.createTextNode(nyxT("An active Professional Support entitlement is required for these tools. Core NyxGuard functionality remains available.")));
        parent.append(note);
    }

    async function loadStatus(onReady, target) {
        try {
            latestStatus = await request("/api/professional-support/status");
            lastSupportId = latestStatus.latest_support_id || null;
            if (target && !target.isConnected) return;
            onReady(null, latestStatus);
        } catch (error) {
            if (target && !target.isConnected) return;
            onReady(error);
        }
    }

    function statusFields(parent, status) {
        var grid = element("div", "nyx-support-metrics");
        field(grid, nyxT("Status"), statusLabel(status.state));
        field(grid, nyxT("Entitlement expiry"), dateLabel(status.expires_at));
        field(grid, nyxT("Installation"), status.installation_id ? nyxT("Bound to this installation") : nyxT("Not configured"));
        var authority = status.authority;
        field(grid, nyxT("Authority"), authority ? !authority.configured ? nyxT("Not configured") : authority.state === "UNAVAILABLE" ? nyxT("Unavailable") : authority.state === "REACHABLE" ? nyxT("Reachable") : nyxT("Configured · not checked") : nyxT("Status unavailable"));
        parent.append(grid);
    }

    async function performAction(target, path, body) {
        notice(target, nyxT("Working…"));
        try {
            await request("/api/professional-support" + path, {
                method: "POST",
                body: body
            });
            latestStatus = null;
            unmount();
            renderRoute();
        } catch (error) {
            notice(target, window.NyxI18n.error(error), true);
        }
    }

    function licenseContent(parent) {
        var header = element("header", "nyx-support-page-header");
        header.append(element("h1", "", nyxT("Professional Support License")),
            element("p", "", nyxT("Manage NyxGuard Manager Professional Support or NyxCloud Premium Support for diagnostics and support. Core NyxGuard remains available without a license.")));
        parent.append(header);
        var details = card(parent, nyxT("License status and new activation"), nyxT("Enter a new purchase or approved owner claim code here. Entitlement details are verified by the NyxGuard backend."));
        var recovery = card(parent, nyxT("License recovery and replacement"), nyxT("Use this when a previous NyxGuard installation was lost or replaced. A reinstall that keeps its database and vault key normally needs no recovery. Recovery is not a purchase; you do not need to buy support again solely because the old installation was lost."));
        var recoveryProduct = element("select", "nyx-support-input");
        recoveryProduct.setAttribute("aria-label", nyxT("Product to recover"));
        var recoveryNative = element("option", "", nyxT("NyxGuard Manager Professional Support"));
        recoveryNative.value = "nyxguard-manager-professional-support";
        var recoveryPremium = element("option", "", nyxT("NyxCloud Premium Support"));
        recoveryPremium.value = "nyxcloud-premium-support";
        recoveryProduct.append(recoveryNative, recoveryPremium);
        var recoveryEmail = element("input", "nyx-support-input");
        recoveryEmail.type = "email";
        recoveryEmail.autocomplete = "email";
        recoveryEmail.placeholder = nyxT("Purchase email");
        recoveryEmail.setAttribute("aria-label", nyxT("Purchase email for recovery"));
        var recoveryCode = element("input", "nyx-support-input");
        recoveryCode.type = "text";
        recoveryCode.autocomplete = "off";
        recoveryCode.placeholder = nyxT("Recovery code");
        recoveryCode.setAttribute("aria-label", nyxT("Recovery code received by email"));
        var recoveryActions = element("div", "nyx-support-actions");
        recoveryActions.append(recoveryProduct, recoveryEmail, button(nyxT("Request recovery"), async function() {
            var email = recoveryEmail.value.trim();
            if (!recoveryEmail.checkValidity() || !email) {
                notice(recovery, nyxT("Enter the purchase email address to request recovery."), true);
                return;
            }
            notice(recovery, nyxT("Requesting recovery…"));
            try {
                await request("/api/professional-support/recovery/request", {
                    method: "POST",
                    body: {
                        email: email,
                        product: recoveryProduct.value
                    }
                });
                recoveryEmail.value = "";
                notice(recovery, nyxT("If an eligible license exists, a recovery code will be sent to the verified purchase email. Enter it below on this installation."));
            } catch (error) {
                notice(recovery, nyxT("Could not request recovery. ") + window.NyxI18n.error(error) + nyxT(" Try again or contact support."), true);
            }
        }), recoveryCode, button(nyxT("Confirm recovery"), async function() {
            var code = recoveryCode.value.trim();
            if (!code) {
                notice(recovery, nyxT("Enter the recovery code sent to the purchase email."), true);
                return;
            }
            notice(recovery, nyxT("Confirming recovery…"));
            try {
                await request("/api/professional-support/recovery/confirm", {
                    method: "POST",
                    body: {
                        recovery_code: code
                    }
                });
                recoveryCode.value = "";
                latestStatus = null;
                unmount();
                renderRoute();
            } catch (error) {
                notice(recovery, nyxT("Could not confirm recovery. Check the code and try again, or contact support. ") + window.NyxI18n.error(error), true);
            }
        }));
        recovery.append(recoveryActions, element("p", "nyx-support-muted", nyxT("If you cannot access the purchase email, contact support for a reviewed replacement. Premium with two active installations also requires manual review. A successful recovery supersedes the selected old installation.")));
        notice(details, nyxT("Loading license status…"));
        loadStatus(function(error, status) {
            if (error) {
                notice(details, window.NyxI18n.error(error), true);
                details.append(button(nyxT("Try again"), function() {
                    unmount();
                    renderRoute();
                }, "nyx-support-button-secondary"));
                return;
            }
            notice(details, "");
            statusFields(details, status);
            var identity = element("div", "nyx-support-metrics nyx-support-identity");
            field(identity, nyxT("License product"), productLabel(status.product));
            field(identity, nyxT("Capability"), nyxT("Diagnostics & Support"));
            details.append(identity);
            inactiveNote(details);
            var actions = element("div", "nyx-support-actions");
            var product = element("select", "nyx-support-input");
            product.setAttribute("aria-label", nyxT("Support product"));
            var nativeOption = element("option", "", nyxT("NyxGuard Manager Professional Support"));
            nativeOption.value = "nyxguard-manager-professional-support";
            var premiumOption = element("option", "", nyxT("NyxCloud Premium Support"));
            premiumOption.value = "nyxcloud-premium-support";
            product.append(nativeOption, premiumOption);
            var claim = element("input", "nyx-support-input");
            claim.type = "text";
            claim.autocomplete = "off";
            claim.placeholder = nyxT("Claim code");
            claim.setAttribute("aria-label", nyxT("Claim code"));
            var claimButton = button(nyxT("Claim"), function() {
                var code = claim.value.trim();
                claim.value = "";
                performAction(details, "/claim", {
                    claim_code: code,
                    product: product.value
                });
            });
            actions.append(product, claim, claimButton);
            if (status.activation_pending) actions.append(button(nyxT("Activate"), function() {
                performAction(details, "/activate", {});
            }));
            actions.append(button(nyxT("Refresh status"), function() {
                performAction(details, "/refresh", {});
            }, "nyx-support-button-secondary"));
            details.append(actions);
        }, details);
    }

    function overviewContent(parent) {
        var grid = element("div", "nyx-support-overview-grid");
        parent.append(grid);
        var health = card(grid, nyxT("Installation health"), nyxT("Current Manager, database, VPN, and update state."));
        var healthGrid = element("div", "nyx-support-metrics");
        health.append(healthGrid);
        notice(health, nyxT("Loading service status…"));
        request("/api/professional-support/operations").then(function(data) {
            if (!health.isConnected) return;
            notice(health, "");
            healthGrid.replaceChildren();
            var manager = data.manager || {},
                database = data.database || {},
                vpn = data.vpn || {},
                update = data.update || {};
            field(healthGrid, nyxT("Manager"), manager.health === "healthy" ? nyxT("Healthy") : manager.health === "unhealthy" ? nyxT("Error") : nyxT("Unavailable"));
            field(healthGrid, nyxT("Version and build"), (manager.version || nyxT("Unknown")) + (manager.revision ? " · " + manager.revision.slice(0, 12) : ""));
            field(healthGrid, nyxT("Manager process uptime"), managerProcessDuration(manager.uptimeSeconds));
            field(healthGrid, nyxT("Database"), database.reachable === true ? nyxT("Healthy") : nyxT("Unavailable"));
            field(healthGrid, nyxT("Migrations"), Number.isSafeInteger(database.appliedMigrations) && Number.isSafeInteger(database.expectedMigrations) ?
                database.appliedMigrations + " / " + database.expectedMigrations + (database.migrationsCurrent ? nyxT(" current") : nyxT(" · Warning")) : nyxT("Unavailable"));
            field(healthGrid, nyxT("VPN Agent"), vpn.installed === false ? nyxT("Not installed") : vpn.health === "healthy" ? nyxT("Healthy") : vpn.health === "unhealthy" || vpn.health === "stopped" ? nyxT("Error") : nyxT("Unavailable"));
            field(healthGrid, nyxT("VPN topology"), vpn.topology === "manager_namespace" ? nyxT("Manager network") : vpn.topology === "not_installed" ? nyxT("Not installed") : vpn.topology === "agent_unreachable" ? nyxT("Agent unreachable") : vpn.topology === "unexpected" ? nyxT("Warning") : nyxT("Unknown"));
            field(healthGrid, nyxT("Update"), update.stage === "unavailable" || !update.stage ? nyxT("Unavailable") : update.stage === "success" ? nyxT("Ready · ") + (update.currentVersion || nyxT("Unknown")) : friendlyCheck(update.stage));
            field(healthGrid, nyxT("Update follow-up"), update.interventionRequired ? nyxT("Recovery required") : update.cleanupPending ? nyxT("Cleanup pending") : update.downloadedVersion ? nyxT("Update downloaded") : update.stage === "unavailable" ? nyxT("Unavailable") : nyxT("None"));
        }).catch(function(error) {
            if (health.isConnected) notice(health, window.NyxI18n.error(error), true);
        });

        var license = card(grid, nyxT("Professional Support"), nyxT("Entitlement and authority state for support tools."));
        notice(license, nyxT("Loading support status…"));
        var workflow = card(grid, nyxT("Support bundle"), nyxT("Generate a redacted JSON bundle, then download or upload it when entitled."));
        field(workflow, nyxT("Bundle"), lastBundle ? nyxT("Generated ") + dateLabel(lastBundle.generated_at) : nyxT("Not generated this session"));
        var supportIdField = field(workflow, nyxT("Last support ID"), lastSupportId || nyxT("No upload recorded"));
        var uploadField = field(workflow, nyxT("Upload"), nyxT("Checking entitlement…"));
        var bundleAction = button(nyxT("Generate Support Bundle"), function() {
            pendingBundleGeneration = true;
            navigate(SUPPORT_HASH + "/support-bundle");
        });
        bundleAction.disabled = true;
        var workflowActions = element("div", "nyx-support-actions");
        workflowActions.append(bundleAction);
        workflow.append(workflowActions);
        loadStatus(function(error, status) {
            if (error) {
                notice(license, window.NyxI18n.error(error), true);
                license.append(button(nyxT("Try again"), function() {
                    unmount();
                    renderRoute();
                }, "nyx-support-button-secondary"));
                uploadField.querySelector("strong").textContent = nyxT("Status unavailable");
                return;
            }
            notice(license, "");
            statusFields(license, status);
            supportIdField.querySelector("strong").textContent = lastSupportId || nyxT("No upload recorded for this installation");
            inactiveNote(license);
            uploadField.querySelector("strong").textContent = canUpload() ? nyxT("Available") : nyxT("Requires an active online entitlement");
            bundleAction.disabled = !canDiagnose();
            diagnosticsAction.disabled = !canDiagnose();
            troubleshootAction.disabled = !canDiagnose();
            problemsPanel(problems, true);
        }, license);
        var diagnostics = card(grid, nyxT("Diagnostic checks"), nyxT("Run service and configured-host checks when you need detail."));
        field(diagnostics, nyxT("Last run"), lastDiagnostics ? dateLabel(lastDiagnostics.at) : nyxT("Not run this session"));
        field(diagnostics, nyxT("System"), lastDiagnostics ? lastDiagnostics.system : nyxT("Not run"));
        field(diagnostics, nyxT("Proxy & Routing"), lastDiagnostics ? lastDiagnostics.routing : nyxT("Not run"));
        field(diagnostics, "TLS", lastDiagnostics ? lastDiagnostics.tls : nyxT("Not run"));
        var diagnosticActions = element("div", "nyx-support-actions");
        var diagnosticsAction = button(nyxT("Run Diagnostics"), function() {
            pendingDiagnosticsRun = true;
            navigate(SUPPORT_HASH + "/diagnostics");
        });
        var troubleshootAction = button(nyxT("Troubleshoot"), function() {
            navigate(SUPPORT_HASH + "/troubleshooting");
        }, "nyx-support-button-secondary");
        diagnosticsAction.disabled = true;
        troubleshootAction.disabled = true;
        diagnosticActions.append(diagnosticsAction, troubleshootAction);
        diagnostics.append(diagnosticActions);
        var problems = card(grid, nyxT("Recent problems"), nyxT("Current service and proxy issues from this installation."));
    }

    function friendlyCheck(name) {
        if (name === "uptime") return nyxT("Manager Process Uptime");
        return nyxT(String(name || "Check").replaceAll("_", " ").replace(/\b\w/g, function(letter) {return letter.toUpperCase();}));
    }

    function resultCard(parent, record) {
        var state = ["PASS", "WARNING", "FAIL", "SKIPPED"].includes(record.state) ? record.state : "SKIPPED";
        var row = element("details", "nyx-support-result");
        var primary = element("summary", "nyx-support-result-main");
        var heading = element("div", "nyx-support-result-heading");
        heading.append(element("strong", "", friendlyCheck(record.check)), element("span", "nyx-support-state state-" + state.toLowerCase(), nyxT(state)));
        primary.append(heading);
        if (typeof record.summary === "string" && record.summary) primary.append(element("span", "nyx-support-result-message", nyxT(record.summary.slice(0, 240))));
        var evidence = record.evidence || {};
        var primaryEvidence = [];
        if (Number.isSafeInteger(evidence.status_code)) primaryEvidence.push("HTTP " + evidence.status_code);
        if (Number.isFinite(evidence.free_percent)) primaryEvidence.push(Math.round(evidence.free_percent) + nyxT("% free"));
        if (Number.isFinite(evidence.days_remaining)) primaryEvidence.push(evidence.days_remaining + nyxT(" days remaining"));
        if (Number.isFinite(evidence.seconds)) primaryEvidence.push(evidence.seconds + nyxT(" seconds process uptime"));
        if (Number.isSafeInteger(evidence.count)) primaryEvidence.push(evidence.count + nyxT(" occurrences"));
        if (typeof evidence.failure === "string" && /^[a-z_]{1,32}$/.test(evidence.failure)) primaryEvidence.push(friendlyCheck(evidence.failure));
        if (primaryEvidence.length) primary.append(element("span", "nyx-support-evidence", primaryEvidence.join(" · ")));
        row.append(primary);
        var extra = element("div", "nyx-support-result-extra");
        if (Number.isSafeInteger(evidence.host_id)) extra.append(element("p", "nyx-support-evidence", nyxT("Proxy host #") + evidence.host_id));
        var recommendation = record.recommendation || record.remediation;
        if (typeof recommendation === "string" && recommendation.length <= 240) extra.append(element("p", "nyx-support-guidance", nyxT(recommendation)));
        else if (state !== "PASS") extra.append(element("p", "nyx-support-guidance", guidance[record.check] || (state === "SKIPPED" ? nyxT("This check needs more configured data or a reachable service.") : nyxT("Review this check and its configured resource."))));
        if (extra.childNodes.length) row.append(extra);
        parent.append(row);
    }

    function checkGroup(parent, title, records) {
        var group = card(parent, title);
        group.classList.add("nyx-support-result-group");
        if (!records.length) group.append(element("p", "nyx-support-muted", nyxT("No configured resources produced checks in this group.")));
        records.forEach(function(record) {
            resultCard(group, record);
        });
    }

    function summarize(records) {
        if (!records.length) return nyxT("No configured checks");
        if (records.some(function(r) {
                return r.state === "FAIL";
            })) return nyxT("Needs attention");
        if (records.some(function(r) {
                return r.state === "WARNING";
            })) return nyxT("Warnings");
        if (records.every(function(r) {
                return r.state === "SKIPPED";
            })) return nyxT("Not assessed");
        return nyxT("Passing");
    }

    function troubleshootHost(id) {
        if (!Number.isSafeInteger(id) || id < 1) return;
        pendingHostId = id;
        navigate(SUPPORT_HASH + "/troubleshooting");
    }

    function problemsPanel(parent, compact) {
        if (!compact) parent.classList.add("nyx-support-recent-problems");
        var offset = 0;
        var controls = element("div", "nyx-support-actions");
        var windowSelect = element("select", "nyx-support-input");
        windowSelect.setAttribute("aria-label", nyxT("Recent problems time window"));
        [
            ["15", nyxT("Last 15 minutes")],
            ["60", nyxT("Last hour")],
            ["1440", nyxT("Last 24 hours")]
        ].forEach(function(entry) {
            var option = element("option", "", entry[1]);
            option.value = entry[0];
            windowSelect.append(option);
        });
        if (compact) windowSelect.value = "60";
        var refresh = button(nyxT("Refresh problems"), function() {
            offset = 0;
            load();
        }, "nyx-support-button-secondary");
        refresh.disabled = !canDiagnose();
        controls.append(windowSelect, refresh);
        var output = element("div", "nyx-support-problems" + (compact ? "" : " nyx-support-problems-compact"));
        parent.append(controls, output);
        windowSelect.addEventListener("change", function() {
            offset = 0;
            load();
        });
        async function load() {
            if (!canDiagnose()) {
                output.replaceChildren(element("p", "nyx-support-muted", nyxT("An active entitlement is required.")));
                return;
            }
            output.replaceChildren(element("p", "nyx-support-muted", nyxT("Loading recent problems…")));
            try {
                var data = await request("/api/professional-support/problems?window=" + windowSelect.value + "&offset=" + offset);
                if (!parent.isConnected) return;
                output.replaceChildren();
                var items = Array.isArray(data.problems) ? data.problems.slice(0, 20) : [];
                if (data.source_available === false) output.append(element("p", "nyx-support-callout", nyxT("Recent log sources are unavailable. Problem counts may be incomplete; check logging and try again.")));
                if (!items.length && data.source_available !== false) output.append(element("p", "nyx-support-muted", nyxT("No recent problems were detected in this window.")));
                items.forEach(function(item) {
                    var row = element("article", "nyx-support-problem");
                    var title = item.component || (/^[a-z][a-z0-9_]{0,63}$/.test(item.category || "") ? friendlyCheck(item.category) : nyxT("Service problem"));
                    var state = ["FAIL", "WARNING", "PASS"].includes(item.state) ? item.state : "WARNING";
                    var heading = element("div", "nyx-support-result-heading");
                    heading.append(element("strong", "", title), element("span", "nyx-support-state state-" + state.toLowerCase(), nyxT(state)));
                    row.append(heading);
                    if (item.summary) row.append(element("p", "nyx-support-evidence", nyxT(item.summary)));
                    var details = [];
                    if (Number.isSafeInteger(item.host_id) && item.host_id > 0) details.push(nyxT("Proxy host #") + item.host_id);
                    if (Number.isSafeInteger(item.count) && item.count >= 0) details.push(item.count + nyxT(" occurrences"));
                    if (item.last_seen) details.push(nyxT("Last seen ") + dateLabel(item.last_seen));
                    if (item.status) details.push(nyxT("Status: ") + item.status);
                    if (details.length) row.append(element("p", "nyx-support-evidence", details.join(" · ")));
                    if (Number.isSafeInteger(item.host_id) && item.host_id > 0) row.append(button(nyxT("Troubleshoot host #") + item.host_id, function() {
                        troubleshootHost(item.host_id);
                    }, "nyx-support-button-secondary"));
                    if (item.event_id) {
                        var more = element("details", "nyx-support-operational-details");
                        more.append(element("summary", "", nyxT("Details and recommended action")));
                        [
                            [nyxT("Diagnostic reference"), item.event_id],
                            [nyxT("Operation"), item.operation],
                            [nyxT("Resource"), item.resource_identity],
                            [nyxT("Cause classification"), item.cause_kind],
                            [nyxT("Cause"), nyxT(item.cause)],
                            [nyxT("Technical evidence"), item.details ? Object.entries(item.details).map(function(entry) {
                                return entry.join(": ");
                            }).join(" · ") : ""],
                            [nyxT("Outcome"), item.outcome],
                            [nyxT("Application state"), item.application_state],
                            [nyxT("Recommended action"), nyxT(item.recommendation)],
                            [nyxT("Correlation"), item.correlation_id],
                            [nyxT("First seen"), dateLabel(item.first_seen)],
                            [nyxT("Last seen"), dateLabel(item.last_seen)]
                        ].forEach(function(pair) {
                            if (pair[1]) more.append(element("p", "nyx-support-evidence", pair[0] + ": " + pair[1]));
                        });
                        row.append(more);
                    }
                    output.append(row);
                });
                if (data.total > 20) {
                    var pages = element("div", "nyx-support-actions");
                    var previous = button(nyxT("Previous problems"), function() {
                        offset = Math.max(0, offset - 20);
                        load();
                    }, "nyx-support-button-secondary");
                    previous.disabled = offset === 0;
                    var next = button(nyxT("Next problems"), function() {
                        offset += 20;
                        load();
                    }, "nyx-support-button-secondary");
                    next.disabled = offset + 20 >= data.total;
                    pages.append(previous, element("span", "nyx-support-muted", (offset + 1) + "–" + Math.min(offset + 20, data.total) + nyxT(" of ") + data.total + nyxT(" grouped problems")), next);
                    output.append(pages);
                }
            } catch (error) {
                output.replaceChildren(element("p", "nyx-support-error", window.NyxI18n.error(error)));
            }
        }
        load();
    }

    function renderDiagnostics(parent, data) {
        var records = Array.isArray(data.checks) ? data.checks : [];
        var hosts = Array.isArray(data.hosts) ? data.hosts : [];
        var system = records.filter(function(r) {
            return systemChecks.has(r.check);
        });
        var tls = records.filter(function(r) {
            return tlsChecks.has(r.check);
        });
        var routing = records.filter(function(r) {
            return !systemChecks.has(r.check) && !tlsChecks.has(r.check);
        });
        var output = parent.querySelector(".nyx-support-check-groups");
        output.replaceChildren();
        var operations = data.operations || {};
        var manager = operations.manager || {};
        var database = operations.database || {};
        var update = operations.update || {};
        var vpn = operations.vpn || {};
        var runtime = card(output, nyxT("Runtime & services"), nyxT("Current observations from this Manager and its installed services."));
        var runtimeGrid = element("div", "nyx-support-metrics nyx-support-runtime-grid");
        runtime.append(runtimeGrid);
        field(runtimeGrid, nyxT("Manager version"), manager.version || nyxT("Unavailable"));
        field(runtimeGrid, nyxT("Build"), manager.revision ? manager.revision.slice(0, 12) : nyxT("Unavailable"));
        field(runtimeGrid, nyxT("Manager health"), manager.health || "unknown");
        field(runtimeGrid, nyxT("Manager process uptime"), managerProcessDuration(manager.uptimeSeconds));
        field(runtimeGrid, nyxT("Database"), database.reachable === true ? nyxT("Reachable") : nyxT("Unavailable"));
        field(runtimeGrid, nyxT("Migrations"), Number.isSafeInteger(database.appliedMigrations) && Number.isSafeInteger(database.expectedMigrations) ?
            database.appliedMigrations + " / " + database.expectedMigrations + (database.migrationsCurrent ? nyxT(" current") : nyxT(" needs attention")) : nyxT("Unavailable"));
        field(runtimeGrid, nyxT("Update"), update.stage && update.stage !== "unavailable" ? (update.currentVersion || nyxT("Unknown")) + " · " + update.stage : nyxT("Unavailable"));
        field(runtimeGrid, nyxT("Update follow-up"), update.interventionRequired ? nyxT("Operator action required") : update.cleanupPending ? nyxT("Cleanup pending") :
            update.stage && update.stage !== "unavailable" ? nyxT("None") : nyxT("Unavailable"));
        field(runtimeGrid, nyxT("VPN Agent"), vpn.installed === false ? nyxT("Not installed") : vpn.installed === true ? vpn.health || "unknown" : nyxT("Unavailable"));
        field(runtimeGrid, nyxT("VPN topology"), vpn.topology === "manager_namespace" ? nyxT("Shares Manager network namespace") :
            vpn.topology === "not_installed" ? nyxT("Not installed") : vpn.topology === "agent_unreachable" ? nyxT("Agent unreachable") : vpn.topology === "unexpected" ? nyxT("Unexpected") : nyxT("Unavailable"));
        checkGroup(output, nyxT("System"), system);
        if (hosts.length) {
            var hostList = card(output, nyxT("Proxy hosts"), hosts.length + nyxT(" configured hosts · select a host to see every check and its troubleshooting action."));
            hostList.classList.add("nyx-support-host-list");
            var hostControls = element("div", "nyx-support-host-controls");
            var allButton = button(nyxT("All hosts"), function() {
                setHostFilter(false);
            }, "nyx-support-button-secondary");
            var attentionButton = button(nyxT("Needs attention"), function() {
                setHostFilter(true);
            }, "nyx-support-button-secondary");
            var hostRows = element("div", "nyx-support-host-rows");
            hostControls.append(allButton, attentionButton);
            hostList.append(hostControls, hostRows);

            function setHostFilter(attentionOnly) {
                allButton.setAttribute("aria-pressed", String(!attentionOnly));
                attentionButton.setAttribute("aria-pressed", String(attentionOnly));
                hostRows.querySelectorAll(".nyx-support-host-row").forEach(function(row) {
                    row.hidden = attentionOnly && row.dataset.attention !== "true";
                    if (row.hidden) row.open = false;
                });
                var empty = hostRows.querySelector(".nyx-support-host-empty");
                if (empty) empty.remove();
                if (!hostRows.querySelector(".nyx-support-host-row:not([hidden])")) hostRows.append(element("p", "nyx-support-muted nyx-support-host-empty", nyxT("No hosts need attention in this run.")));
            }
            hosts.forEach(function(host) {
                if (!Number.isSafeInteger(host.id) || host.id < 1) return;
                var names = Array.isArray(host.domains) ? host.domains.filter(function(name) {
                    return typeof name === "string" && name.length <= 253;
                }) : [];
                var hostChecks = Array.isArray(host.checks) ? host.checks : [];
                var counts = {
                    PASS: 0,
                    WARNING: 0,
                    FAIL: 0,
                    SKIPPED: 0
                };
                hostChecks.forEach(function(record) {
                    if (Object.hasOwn(counts, record.state)) counts[record.state]++;
                    else counts.SKIPPED++;
                });
                var state = !host.enabled ? nyxT("Disabled") : counts.FAIL ? nyxT("Error") : counts.WARNING ? nyxT("Warning") : nyxT("Healthy");
                var name = names.slice(0, 2).join(", ") || nyxT("Proxy host #") + host.id;
                var row = element("details", "nyx-support-host-row");
                row.dataset.attention = String(host.enabled && (counts.FAIL > 0 || counts.WARNING > 0));
                var header = element("summary", "nyx-support-host-summary");
                header.append(element("strong", "nyx-support-host-name", name));
                header.append(element("span", "nyx-support-state state-" + (!host.enabled ? "skipped" : counts.FAIL ? "fail" : counts.WARNING ? "warning" : "pass"), state));
                header.append(element("span", "nyx-support-host-counts", "PASS " + counts.PASS + nyxT(" · WARNING ") + counts.WARNING + nyxT(" · FAIL ") + counts.FAIL + nyxT(" · SKIPPED ") + counts.SKIPPED));
                var checks = element("div", "nyx-support-host-checks");
                if (!hostChecks.length) checks.append(element("p", "nyx-support-muted", nyxT("No checks available for this host.")));
                hostChecks.forEach(function(record) {
                    resultCard(checks, record);
                });
                checks.append(button(nyxT("Troubleshoot this host"), function() {
                    troubleshootHost(host.id);
                }, "nyx-support-button-secondary"));
                row.append(header, checks);
                row.addEventListener("toggle", function() {
                    if (row.open) hostRows.querySelectorAll(".nyx-support-host-row[open]").forEach(function(other) {
                        if (other !== row) other.open = false;
                    });
                });
                hostRows.append(row);
            });
            setHostFilter(false);
        } else {
            checkGroup(output, nyxT("Proxy & Routing"), routing);
            checkGroup(output, "TLS", tls);
        }
        var allHostChecks = hosts.flatMap(function(h) {
            return Array.isArray(h.checks) ? h.checks : [];
        });
        var hostTls = allHostChecks.filter(function(r) {
            return tlsChecks.has(r.check);
        });
        var hostRouting = allHostChecks.filter(function(r) {
            return !tlsChecks.has(r.check);
        });
        lastDiagnostics = {
            at: data.generated_at || new Date().toISOString(),
            system: summarize(system),
            routing: summarize(hosts.length ? hostRouting : routing),
            tls: summarize(hosts.length ? hostTls : tls)
        };
        var summary = parent.querySelector(".nyx-support-summary");
        summary.replaceChildren();
        if (data.summary)["pass", "warning", "fail", "skipped"].forEach(function(key) {
            if (Number.isSafeInteger(data.summary[key])) field(summary, friendlyCheck(key), data.summary[key]);
        });
    }

    function diagnosticsContent(parent) {
        sectionHeading(parent, nyxT("Diagnostics"), nyxT("Run bounded checks against this installation and configured resources."));
        notice(parent, "");
        var controls = element("div", "nyx-support-actions");
        var run = button(nyxT("Run diagnostics"), async function() {
            notice(parent, nyxT("Running diagnostics…"));
            try {
                var data = await request("/api/professional-support/diagnostics");
                if (!parent.isConnected) return;
                renderDiagnostics(parent, data);
                notice(parent, nyxT("Diagnostics completed."));
            } catch (error) {
                notice(parent, window.NyxI18n.error(error), true);
            }
        });
        run.disabled = !canDiagnose();
        controls.append(run);
        parent.append(controls);
        inactiveNote(parent);
        parent.append(element("div", "nyx-support-metrics nyx-support-summary"));
        var problems = card(parent, nyxT("Recent problems"), nyxT("Issues detected from bounded logs and service events."));
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
            select.append(element("option", "", nyxT("Select a configured proxy host")));
            select.firstChild.value = "";
            (Array.isArray(rows) ? rows : []).filter(function(row) {
                return Number.isSafeInteger(row.id) && !row.is_deleted;
            }).forEach(function(row) {
                var names = Array.isArray(row.domain_names) ? row.domain_names : [];
                var label = names.length ? String(names[0]) : nyxT("Proxy host ") + row.id;
                var option = element("option", "", label + " · #" + row.id);
                option.value = String(row.id);
                select.append(option);
            });
            if (select.options.length === 1) {
                select.disabled = true;
                hostNotice.textContent = nyxT("No configured proxy hosts are available for this workflow.");
            } else {
                hostNotice.textContent = nyxT("Only hosts already configured in NyxGuard can be selected.");
                if (pendingHostId && Array.from(select.options).some(function(option) {
                        return option.value === String(pendingHostId);
                    })) select.value = String(pendingHostId);
                pendingHostId = null;
            }
        } catch (error) {
            hostNotice.textContent = window.NyxI18n.error(error);
            select.disabled = true;
        }
    }

    function troubleshootingContent(parent) {
        sectionHeading(parent, nyxT("Troubleshooting"), nyxT("Guided routing and upstream checks for an existing proxy host."));
        var cardNode = card(parent, nyxT("Configured host workflow"), nyxT("Choose an authorized proxy host and focus. The same bounded connectivity probe checks the configured upstream; arbitrary URLs and addresses are not accepted."));
        cardNode.classList.add("nyx-support-workflow-card");
        notice(cardNode, "");
        var form = element("div", "nyx-support-actions");
        var hostSelect = element("select", "nyx-support-input");
        hostSelect.setAttribute("aria-label", nyxT("Configured proxy host"));
        hostSelect.append(element("option", "", nyxT("Loading configured hosts…")));
        var focusSelect = element("select", "nyx-support-input");
        focusSelect.setAttribute("aria-label", nyxT("Troubleshooting focus"));
        [
            ["all", nyxT("502 / Full route")],
            ["dns", nyxT("DNS resolution")],
            ["tcp", nyxT("Upstream connection")],
            ["tls", nyxT("Upstream TLS")],
            ["http", nyxT("Upstream HTTP")]
        ].forEach(function(entry) {
            var option = element("option", "", entry[1]);
            option.value = entry[0];
            focusSelect.append(option);
        });
        var hostNotice = element("p", "nyx-support-muted", "");
        var run = button(nyxT("Run workflow"), async function() {
            var id = Number(hostSelect.value);
            if (!Number.isSafeInteger(id) || id < 1) {
                notice(cardNode, nyxT("Select a configured proxy host."), true);
                return;
            }
            notice(cardNode, nyxT("Running troubleshooting…"));
            try {
                var data = await request("/api/professional-support/troubleshoot", {
                    method: "POST",
                    body: {
                        workflow: "upstream_502",
                        proxy_host_id: id
                    }
                });
                if (!cardNode.isConnected) return;
                var output = cardNode.querySelector(".nyx-support-results");
                output.replaceChildren();
                var steps = Array.isArray(data.steps) ? data.steps : [];
                var focus = focusSelect.value;
                var focusedChecks = {
                    dns: ["dns_resolution"],
                    tcp: ["dns_resolution", "upstream_tcp"],
                    tls: ["dns_resolution", "upstream_tcp", "upstream_tls"],
                    http: ["dns_resolution", "upstream_tcp", "upstream_tls", "upstream_http"]
                };
                if (focus !== "all") steps = steps.filter(function(record) {
                    return focusedChecks[focus] && focusedChecks[focus].includes(record.check);
                });
                steps.forEach(function(record) {
                    resultCard(output, record);
                });
                if (!steps.length) output.append(element("p", "nyx-support-muted", nyxT("No steps were returned for this focus.")));
                notice(cardNode, nyxT("Workflow completed."));
            } catch (error) {
                notice(cardNode, window.NyxI18n.error(error), true);
            }
        });
        run.disabled = !canDiagnose();
        form.append(hostSelect, focusSelect, run);
        cardNode.append(form, hostNotice, element("div", "nyx-support-results"));
        inactiveNote(cardNode);
        if (canDiagnose()) loadHosts(hostSelect, hostNotice);
        else {
            hostSelect.disabled = true;
            hostNotice.textContent = nyxT("An active entitlement is required to run this workflow.");
        }
    }

    async function downloadBundle(cardNode) {
        if (!lastBundleSha) return;
        notice(cardNode, nyxT("Downloading verified bundle…"));
        try {
            var response = await requestResponse("/api/professional-support/bundle/" + lastBundleSha + "/download");
            var raw = await response.text();
            var bytes = new TextEncoder().encode(raw);
            var hash = await crypto.subtle.digest(nyxT("SHA-256"), bytes);
            var actual = Array.from(new Uint8Array(hash), function(byte) {
                return byte.toString(16).padStart(2, "0");
            }).join("");
            if (actual !== lastBundleSha) throw new Error(nyxT("Downloaded bundle digest verification failed."));
            var url = URL.createObjectURL(new Blob([bytes], {
                type: "application/json"
            }));
            var link = element("a");
            link.href = url;
            link.download = "nyxguard-support-bundle.json";
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(function() {
                URL.revokeObjectURL(url);
            }, 1000);
            notice(cardNode, nyxT("Bundle downloaded and verified."));
        } catch (error) {
            notice(cardNode, window.NyxI18n.error(error), true);
        }
    }

    async function fetchBundle() {
        var response = await requestResponse("/api/professional-support/bundle");
        var raw = await response.text();
        var bytes = new TextEncoder().encode(raw);
        var expected = response.headers.get("X-NyxGuard-Bundle-SHA256");
        if (!expected || !/^[0-9a-f]{64}$/i.test(expected)) throw new Error(nyxT("Bundle digest is missing or invalid."));
        if (!window.crypto || !crypto.subtle) throw new Error(nyxT("Secure bundle verification is unavailable in this browser."));
        var hash = await crypto.subtle.digest(nyxT("SHA-256"), bytes);
        var actual = Array.from(new Uint8Array(hash), function(byte) {
            return byte.toString(16).padStart(2, "0");
        }).join("");
        if (actual !== expected.toLowerCase()) throw new Error(nyxT("Bundle digest verification failed."));
        return {
            data: JSON.parse(raw),
            bytes: bytes,
            sha256: actual
        };
    }

    function bundleContent(parent) {
        sectionHeading(parent, nyxT("Support Bundle"), nyxT("Generate and review safe metadata before downloading or uploading a structured support bundle."));
        var cardNode = card(parent, nyxT("Bundle workflow"), nyxT("The bundle is redacted JSON, never a filesystem archive."));
        cardNode.classList.add("nyx-support-bundle-card");
        notice(cardNode, "");
        var info = element("div", "nyx-support-metrics");
        var actions = element("div", "nyx-support-actions");
        var download = button(nyxT("Download bundle"), function() {
            downloadBundle(cardNode);
        }, "nyx-support-button-secondary");
        download.disabled = !lastBundleBytes;
        var generate = button(nyxT("Generate Support Bundle"), async function() {
            notice(cardNode, nyxT("Generating bundle…"));
            try {
                var fetched = await fetchBundle();
                if (!cardNode.isConnected) return;
                lastBundle = fetched.data;
                lastBundleBytes = fetched.bytes;
                lastBundleSha = fetched.sha256;
                info.replaceChildren();
                field(info, nyxT("Format"), lastBundle.format || nyxT("Unknown"));
                field(info, nyxT("Size"), lastBundleBytes.length.toLocaleString() + " bytes");
                field(info, nyxT("SHA-256"), lastBundleSha);
                field(info, nyxT("Generated"), dateLabel(lastBundle.generated_at));
                download.disabled = false;
                notice(cardNode, nyxT("Bundle ready to download or upload."));
            } catch (error) {
                notice(cardNode, window.NyxI18n.error(error), true);
            }
        });
        generate.disabled = !canDiagnose();
        var upload = button(nyxT("Upload Support Bundle"), async function() {
            notice(cardNode, nyxT("Preparing verified bundle for upload…"));
            try {
                if (!lastBundleSha) {
                    var fetched = await fetchBundle();
                    lastBundle = fetched.data;
                    lastBundleBytes = fetched.bytes;
                    lastBundleSha = fetched.sha256;
                    download.disabled = false;
                    info.replaceChildren();
                    field(info, nyxT("Format"), lastBundle.format || nyxT("Unknown"));
                    field(info, nyxT("Size"), lastBundleBytes.length.toLocaleString() + " bytes");
                    field(info, nyxT("SHA-256"), lastBundleSha);
                    field(info, nyxT("Generated"), dateLabel(lastBundle.generated_at));
                }
                notice(cardNode, nyxT("Uploading verified bundle…"));
                var receipt = await request("/api/professional-support/upload", {
                    method: "POST",
                    body: {
                        sha256: lastBundleSha
                    }
                });
                if (!cardNode.isConnected) return;
                lastSupportId = receipt.support_id || null;
                notice(cardNode, lastSupportId ? nyxT("Upload accepted. Support ID: ") + lastSupportId : nyxT("Upload completed."));
                if (receipt.expires_at) field(info, nyxT("Available until"), dateLabel(receipt.expires_at));
            } catch (error) {
                notice(cardNode, window.NyxI18n.error(error), true);
            }
        });
        upload.disabled = !canUpload();
        actions.append(generate, download, upload);
        cardNode.append(info, actions);
        inactiveNote(cardNode);
        if (lastBundle) {
            field(info, nyxT("Format"), lastBundle.format || nyxT("Unknown"));
            field(info, nyxT("Size"), lastBundleBytes.length.toLocaleString() + " bytes");
            if (lastBundleSha) field(info, nyxT("SHA-256"), lastBundleSha);
            field(info, nyxT("Generated"), dateLabel(lastBundle.generated_at));
        }
        if (lastSupportId) field(info, nyxT("Support ID"), lastSupportId);
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
        header.append(element("h1", "", nyxT("Diagnostics & Support")),
            element("p", "", nyxT("Health checks, guided troubleshooting, and secure support workflows for this installation.")));
        parent.append(header);
        var nav = element("nav", "nyx-support-tabs");
        nav.setAttribute("aria-label", nyxT("Diagnostics and support sections"));
        tabs.forEach(function(name, index) {
            var tab = button(name, function() {
                navigate(SUPPORT_HASH + "/" + tabSlugs[index]);
            });
            tab.classList.toggle("nyx-support-tab-active", slug === tabSlugs[index]);
            if (slug === tabSlugs[index]) tab.setAttribute("aria-current", "page");
            nav.append(tab);
        });
        parent.append(nav);
        var content = element("div", "nyx-support-page-content");
        parent.append(content);
        if (slug === "overview") overviewContent(content);
        if (slug === "diagnostics") {
            notice(content, nyxT("Loading support status…"));
            loadStatus(function(error) {
                content.replaceChildren();
                if (error) statusError(content, error);
                else diagnosticsContent(content);
            }, content);
        }
        if (slug === "troubleshooting") {
            notice(content, nyxT("Loading support status…"));
            loadStatus(function(error) {
                content.replaceChildren();
                if (error) statusError(content, error);
                else troubleshootingContent(content);
            }, content);
        }
        if (slug === "support-bundle") {
            notice(content, nyxT("Loading support status…"));
            loadStatus(function(error) {
                content.replaceChildren();
                if (error) statusError(content, error);
                else bundleContent(content);
            }, content);
        }
    }

    function updateLowerNavigation(next) {
        document.querySelectorAll(".prefs-action-links .nyx-support-license-nav,.prefs-action-links .nyx-support-diagnostics-nav").forEach(function(link) {
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
        if (!next) {
            unmount();
            return;
        }
        var main = document.querySelectorAll("#root ._main_f6sqx_21");
        if (main.length !== 1) {
            unmount();
            return;
        }
        var wrappers = main[0].querySelectorAll(":scope > .w-100.py-0.min-w-0.h-100.d-flex.flex-column");
        if (wrappers.length !== 1) {
            unmount();
            return;
        }
        if (page && page.isConnected && mainNode === main[0] && routeWrapper === wrappers[0] && currentRoute === next) return;
        unmount();
        mainNode = main[0];
        routeWrapper = wrappers[0];
        routeWrapper.classList.add("nyx-support-route-hidden");
        mainNode.classList.add("nyx-support-main-active");
        var canonical = mountAppPage(mainNode, {
            framed: true,
            bounded: true
        });
        page = canonical.shell;
        page.classList.add("nyx-support-page");
        page.setAttribute("data-nyx-support-view", next);

        currentRoute = next;
        var surface = element("section", "_card_1gz5u_1");
        canonical.content.append(surface);
        if (next === "license") licenseContent(surface);
        else supportContent(surface, next.split(":")[1]);
    }

    function scheduleRender() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(function() {
            scheduled = false;
            renderRoute();
        });
    }

    document.addEventListener("click", function(event) {
        var link = event.target.closest && event.target.closest("a.nyx-support-license-nav,a.nyx-support-diagnostics-nav");
        if (!link || !link.closest(".prefs-action-links")) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(link.classList.contains("nyx-support-license-nav") ? LICENSE_HASH : SUPPORT_HASH);
    }, true);
    document.addEventListener("click", function(event) {
        if (!currentRoute || !event.target.closest || !event.target.closest("#navbar-menu")) return;
        history.replaceState(null, "", location.pathname + location.search);
        unmount();
    }, true);
    window.addEventListener("hashchange", scheduleRender);
    window.addEventListener("popstate", scheduleRender);
    new MutationObserver(scheduleRender).observe(document.documentElement, {
        childList: true,
        subtree: true
    });
    scheduleRender();
})();