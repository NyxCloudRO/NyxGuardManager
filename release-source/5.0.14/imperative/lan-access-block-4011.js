(function() {
    "use strict";
 const nyxT=(source,values)=>window.NyxI18n.t(source,values);

    var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
    if (!nativeFetch) return;

    function escapeHtml(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function(ch) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "\"": "&quot;",
                "'": "&#39;",
            } [ch];
        });
    }

    function isLanAccessBlockResponse(response, bodyText) {
        if (!response || response.status !== 403) return false;
        var header = response.headers && response.headers.get("X-NyxGuard-Lan-Access");
        if (String(header || "").toLowerCase() === "blocked") return true;
        return /LAN Access blocked/i.test(String(bodyText || ""));
    }

    function parseBlock(bodyText) {
        try {
            var body = JSON.parse(bodyText);
            var error = body && body.error ? body.error : {};
            return {
                ip: error.ip || "",
                reason: error.reason || "",
                message: error.message || nyxT("LAN Access blocked: this IP or device is not allowed to access NyxGuard Manager."),
            };
        } catch {
            return {
                ip: "",
                reason: "",
                message: nyxT("LAN Access blocked: this IP or device is not allowed to access NyxGuard Manager."),
            };
        }
    }

    function showBlockPage(details) {
        if (window.__nyxLanAccessBlocked) return;
        window.__nyxLanAccessBlocked = true;
        var ip = details.ip ? escapeHtml(details.ip) : nyxT("Current device");
        var reason = details.reason ? escapeHtml(details.reason) : "not_allowed";
        var message = escapeHtml(window.NyxI18n.error({message:details.message,code:"LAN_ACCESS_BLOCKED"}));
        document.title = nyxT("LAN Access Blocked | NyxGuard Manager");
        document.documentElement.setAttribute("data-nyx-lan-access-blocked", "1");
        document.body.innerHTML = [
            "<main class=\"nyx-lan-block-wrap\">",
            "<section class=\"nyx-lan-block-card\">",
            ("<div class=\"nyx-lan-block-badge\">" + escapeHtml(nyxT("NyxGuard LAN Access")) + "</div>"),
            ("<h1>" + escapeHtml(nyxT("Access blocked by LAN Access Control")) + "</h1>"),
            "<p>", message, "</p>",
            ("<p>" + escapeHtml(nyxT("This NyxGuard Manager admin panel is restricted to approved LAN IP/CIDR or MAC address rules.")) + "</p>"),
            "<div class=\"nyx-lan-block-meta\">",
            ("<div><span>" + escapeHtml(nyxT("Client IP")) + "</span><strong>"), ip, "</strong></div>",
            ("<div><span>" + escapeHtml(nyxT("Reason")) + "</span><strong>"), reason, "</strong></div>",
            "</div>",
            ("<footer>" + escapeHtml(nyxT("Ask an administrator to add this IP or device MAC address.")) + "</footer>"),
            "</section>",
            "</main>",
        ].join("");
        var style = document.createElement("style");
        style.textContent = [
            "html,body{height:100%;margin:0}",
            "body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#e9edf6;background:linear-gradient(135deg,#07141b 0%,#0f1e2c 52%,#101722 100%)}",
            ".nyx-lan-block-wrap{min-height:100%;display:flex;align-items:center;justify-content:center;padding:28px}",
            ".nyx-lan-block-card{width:min(620px,100%);border:1px solid rgba(87,190,220,.32);background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.025));box-shadow:0 28px 80px rgba(0,0,0,.45);border-radius:16px;padding:28px}",
            ".nyx-lan-block-badge{display:inline-flex;border:1px solid rgba(87,190,220,.38);background:rgba(87,190,220,.10);color:#9ee8ff;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}",
            ".nyx-lan-block-card h1{margin:18px 0 8px;font-size:26px;line-height:1.18}",
            ".nyx-lan-block-card p{margin:0 0 14px;color:#b7c4d2;line-height:1.55}",
            ".nyx-lan-block-meta{margin-top:18px;display:grid;gap:8px}",
            ".nyx-lan-block-meta div{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.24);border:1px solid rgba(255,255,255,.08)}",
            ".nyx-lan-block-meta span{color:#9aa8b8}",
            ".nyx-lan-block-meta strong{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#eef6ff;word-break:break-all}",
            ".nyx-lan-block-card footer{margin-top:20px;padding-top:14px;border-top:1px solid rgba(255,255,255,.1);font-size:13px;color:#93a4b6}",
        ].join("");
        document.head.appendChild(style);
    }

    window.fetch = function(input, init) {
        return nativeFetch(input, init).then(function(response) {
            if (response && response.status === 403) {
                response.clone().text().then(function(bodyText) {
                    if (isLanAccessBlockResponse(response, bodyText)) {
                        showBlockPage(parseBlock(bodyText));
                    }
                }).catch(function() {});
            }
            return response;
        });
    };
})();