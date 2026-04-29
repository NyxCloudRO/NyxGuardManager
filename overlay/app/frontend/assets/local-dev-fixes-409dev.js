(function () {
	"use strict";

	function icon(path, color) {
		return (
			'<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' +
			color +
			'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' +
			path +
			'"></path></svg>'
		);
	}

	function addPreferenceLinks() {
		try {
			document.querySelectorAll(".prefs-action-links").forEach(function (links) {
				if (!links.closest('[class*="_prefsDropdown_"]')) {
					links.remove();
				}
			});

			var panels = document.querySelectorAll('[class*="_prefsDropdown_"]');
			panels.forEach(function (panel) {
				var existing = panel.querySelectorAll(":scope > .prefs-action-links");
				if (existing.length > 0) {
					existing.forEach(function (links, index) {
						if (index > 0) {
							links.remove();
						}
					});
					return;
				}

				var wrap = document.createElement("div");
				wrap.className = "prefs-action-links";
				wrap.innerHTML =
					'<a class="prefs-action-link prefs-action-support" href="https://buymeacoffee.com/nyxmael" target="_blank" rel="noopener noreferrer">' +
					icon(
						"M20.8 4.6c-1.6-1.5-4.1-1.5-5.7.1L12 7.8 8.9 4.7C7.3 3.1 4.8 3.1 3.2 4.6c-1.7 1.6-1.7 4.2 0 5.8L12 19l8.8-8.6c1.7-1.6 1.7-4.2 0-5.8z",
						"#ff8fb3",
					) +
					"<span>Support NyxGuard</span></a>" +
					'<a class="prefs-action-link prefs-action-community" href="https://community.nyxcloud.ro/" target="_blank" rel="noopener noreferrer">' +
					icon(
						"M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z",
						"#53ffae",
					) +
					"<span>Community</span></a>";
				var toggle = panel.querySelector('[class*="_prefsToggle_"]');
				if (toggle && toggle.parentNode === panel) {
					toggle.insertAdjacentElement("afterend", wrap);
				} else {
					panel.appendChild(wrap);
				}
			});
		} catch (err) {
			console.warn("NyxGuard local preferences link injection skipped", err);
		}
	}

	function addLocalLayoutStyles() {
		if (document.getElementById("nyx-local-layout-fixes")) {
			return;
		}

		var style = document.createElement("style");
		style.id = "nyx-local-layout-fixes";
		style.textContent = [
			".nyx-users-header-actions{gap:1.5rem!important;align-items:center!important;justify-content:flex-end!important;min-width:330px}",
			".nyx-users-header-actions .input-group{flex:0 0 210px!important;width:210px!important}",
			".nyx-users-header-actions .form-control{min-width:160px!important}",
			".nyx-users-header-actions .btn{flex:0 0 auto!important;margin-left:0!important;white-space:nowrap!important}",
			".nyx-table-search-field{display:inline-flex!important;align-items:center!important;flex:0 0 210px!important;width:210px!important;height:34px!important;min-height:34px!important;overflow:hidden!important;border:1px solid color-mix(in srgb,var(--app-border) 72%,transparent)!important;border-radius:9px!important;background:linear-gradient(180deg,color-mix(in srgb,var(--app-surface-2) 68%,transparent),color-mix(in srgb,var(--app-surface) 82%,transparent))!important;box-shadow:inset 0 1px color-mix(in srgb,var(--app-text-primary) 7%,transparent)!important}",
			".nyx-table-search-field:focus-within{border-color:color-mix(in srgb,var(--app-primary) 72%,var(--app-border) 28%)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--app-primary) 14%,transparent),inset 0 1px color-mix(in srgb,var(--app-text-primary) 10%,transparent)!important}",
			".nyx-table-search-field .input-group-text{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 34px!important;width:34px!important;height:32px!important;min-height:32px!important;padding:0!important;margin:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:color-mix(in srgb,var(--app-text-secondary) 82%,var(--app-primary) 18%)!important;box-shadow:none!important}",
			".nyx-table-search-field .form-control{flex:1 1 auto!important;min-width:0!important;width:auto!important;height:32px!important;min-height:32px!important;padding:0 10px 0 0!important;margin:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:var(--app-text-primary)!important;box-shadow:none!important;outline:none!important}",
			".nyx-table-search-field .form-control:focus{border:0!important;box-shadow:none!important;background:transparent!important}",
			"*{scrollbar-width:thin!important;scrollbar-gutter:auto!important;scrollbar-color:color-mix(in srgb,var(--app-primary) 62%,var(--app-text-secondary) 38%) color-mix(in srgb,var(--app-surface) 76%,transparent)!important}",
			"*::-webkit-scrollbar{width:6px!important;height:6px!important}",
			"*::-webkit-scrollbar-thumb{border-radius:999px!important;min-height:30px!important;background:linear-gradient(180deg,color-mix(in srgb,var(--app-primary) 68%,#ffffff 10%),color-mix(in srgb,var(--app-secondary) 62%,var(--app-primary) 38%))!important;border:1px solid color-mix(in srgb,var(--app-text-primary) 18%,transparent)!important;box-shadow:0 0 0 1px color-mix(in srgb,var(--app-primary) 24%,transparent) inset,0 0 10px color-mix(in srgb,var(--app-primary) 18%,transparent)!important}",
			"*::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,color-mix(in srgb,var(--app-primary) 76%,#ffffff 18%),color-mix(in srgb,var(--app-secondary) 50%,var(--app-primary) 50%))!important;border-color:color-mix(in srgb,var(--app-text-primary) 28%,transparent)!important}",
			"*::-webkit-scrollbar-track{border-radius:999px!important;background:color-mix(in srgb,var(--app-surface) 76%,transparent)!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--app-border) 22%,transparent)!important}",
			"*::-webkit-scrollbar-corner{background:transparent!important}",
			"pre,textarea,[class*=\"_monoBox_\"],[class*=\"_terminal_\"],[class*=\"_decisionStream_\"],[class*=\"_tableViewport_\"],[class*=\"_trafficTableViewport_\"],[class*=\"_hostsTableViewport_\"],[class*=\"_hostTableViewport_\"]{scrollbar-color:color-mix(in srgb,var(--app-primary) 72%,var(--app-text-primary) 12%) color-mix(in srgb,var(--app-surface) 90%,transparent)!important}",
			"pre::-webkit-scrollbar,textarea::-webkit-scrollbar,[class*=\"_monoBox_\"]::-webkit-scrollbar,[class*=\"_terminal_\"]::-webkit-scrollbar,[class*=\"_decisionStream_\"]::-webkit-scrollbar,[class*=\"_tableViewport_\"]::-webkit-scrollbar,[class*=\"_trafficTableViewport_\"]::-webkit-scrollbar,[class*=\"_hostsTableViewport_\"]::-webkit-scrollbar,[class*=\"_hostTableViewport_\"]::-webkit-scrollbar{width:5px!important;height:5px!important}",
			"pre::-webkit-scrollbar-track,textarea::-webkit-scrollbar-track,[class*=\"_monoBox_\"]::-webkit-scrollbar-track,[class*=\"_terminal_\"]::-webkit-scrollbar-track,[class*=\"_decisionStream_\"]::-webkit-scrollbar-track,[class*=\"_tableViewport_\"]::-webkit-scrollbar-track,[class*=\"_trafficTableViewport_\"]::-webkit-scrollbar-track,[class*=\"_hostsTableViewport_\"]::-webkit-scrollbar-track,[class*=\"_hostTableViewport_\"]::-webkit-scrollbar-track{background:color-mix(in srgb,var(--app-surface) 90%,transparent)!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--app-border) 26%,transparent)!important}",
			":root{--nyx-local-header-height:52px;--nyx-local-footer-height:56px;--nyx-local-shell-height:calc(100vh - var(--nyx-local-header-height) - var(--nyx-local-footer-height))}",
			"[class*=\"_shell_\"]{height:var(--nyx-local-shell-height)!important;min-height:0!important;overflow:hidden!important}",
			"[class*=\"_sidebarWrap_\"]{position:sticky!important;top:0!important;align-self:flex-start!important;height:var(--nyx-local-shell-height)!important;max-height:var(--nyx-local-shell-height)!important;overflow:hidden!important}",
			"[class*=\"_main_\"]{height:var(--nyx-local-shell-height)!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-gutter:auto!important}",
			".app-page-shell,[class*=\"_page_\"]{height:auto!important;min-height:100%!important;overflow:visible!important}",
			".app-page-shell>.container-xl,.app-page-shell .container-xl,[class*=\"_page_\"]>.container-xl,[class*=\"_page_\"] .container-xl{height:auto!important;min-height:0!important;overflow:visible!important;overscroll-behavior:auto!important;padding-right:16px!important}",
			"[class*=\"_main_\"]::-webkit-scrollbar{width:6px!important;height:6px!important}",
			".nyx-app-action-pill:not(.nyx-traffic-rule-action){position:relative!important;overflow:hidden!important;min-height:32px!important;padding:0 15px!important;border-radius:10px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;border:1px solid color-mix(in srgb,var(--app-primary) 68%,#ffffff 10%)!important;background:linear-gradient(180deg,color-mix(in srgb,var(--app-surface-2) 72%,var(--app-primary) 28%),color-mix(in srgb,var(--app-surface-1) 80%,var(--app-primary) 20%))!important;color:color-mix(in srgb,var(--app-text-primary) 94%,#ffffff 6%)!important;box-shadow:0 8px 18px rgba(0,0,0,.28),0 0 0 1px color-mix(in srgb,var(--app-primary) 26%,transparent) inset,0 0 14px color-mix(in srgb,var(--app-primary) 14%,transparent)!important;font-size:11px!important;font-weight:780!important;line-height:1!important;letter-spacing:.018em!important;text-transform:uppercase!important;text-shadow:0 1px 2px rgba(0,0,0,.28)!important;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease,background .16s ease,color .16s ease!important}",
			".nyx-app-action-pill:not(.nyx-traffic-rule-action):before{content:\"\";position:absolute;inset:1px;border-radius:inherit;background:linear-gradient(180deg,rgba(255,255,255,.07),transparent 55%);pointer-events:none!important}",
			".nyx-app-action-pill:not(.nyx-traffic-rule-action):hover,.nyx-app-action-pill:not(.nyx-traffic-rule-action):focus-visible{transform:translateY(-1px)!important;border-color:color-mix(in srgb,var(--app-primary) 74%,#ffffff 26%)!important;color:#ffffff!important;box-shadow:0 11px 22px rgba(0,0,0,.32),0 0 0 1px color-mix(in srgb,var(--app-primary) 34%,transparent) inset,0 0 22px color-mix(in srgb,var(--app-primary) 28%,transparent)!important;outline:none!important}",
			".nyx-app-action-pill:not(.nyx-traffic-rule-action):active{transform:translateY(0)!important;box-shadow:0 4px 10px rgba(0,0,0,.24),0 0 0 1px color-mix(in srgb,var(--app-primary) 16%,transparent) inset!important}",
			".nyx-app-action-pill:not(.nyx-traffic-rule-action):disabled,.nyx-app-action-pill:not(.nyx-traffic-rule-action)[disabled],.nyx-app-action-pill:not(.nyx-traffic-rule-action).disabled{opacity:.82!important;cursor:not-allowed!important;transform:none!important;border-color:color-mix(in srgb,var(--app-primary) 46%,var(--app-border) 54%)!important;background:linear-gradient(180deg,color-mix(in srgb,var(--app-surface-2) 82%,var(--app-primary) 18%),color-mix(in srgb,var(--app-surface-1) 88%,var(--app-primary) 12%))!important;color:color-mix(in srgb,var(--app-text-primary) 72%,var(--app-primary) 28%)!important;box-shadow:0 4px 12px rgba(0,0,0,.18),0 0 0 1px color-mix(in srgb,var(--app-primary) 16%,transparent) inset!important}",
			".modal .nyx-app-action-pill:not(.nyx-traffic-rule-action),.modal .btn{font-weight:700!important;letter-spacing:0!important;text-shadow:none!important;-webkit-font-smoothing:antialiased!important;text-rendering:geometricPrecision!important}",
			".modal .nyx-app-action-pill:not(.nyx-traffic-rule-action):before{opacity:.45!important}",
			".modal .nyx-app-action-pill:not(.nyx-traffic-rule-action):hover,.modal .nyx-app-action-pill:not(.nyx-traffic-rule-action):focus-visible{transform:none!important;text-shadow:none!important}",
			".modal input[type=\"file\"],.modal input[type=\"file\"]::file-selector-button{font-weight:650!important;letter-spacing:0!important;text-shadow:none!important;-webkit-font-smoothing:antialiased!important;text-rendering:geometricPrecision!important}",
			".nyx-live-clear-logs{margin-left:8px!important;margin-bottom:0!important;min-width:96px!important;height:34px!important;min-height:34px!important;padding:0 14px!important;white-space:nowrap!important;flex:0 0 auto!important;line-height:1!important}",
			"._windowButtons_1dn50_57 .nyx-live-clear-logs{margin-left:8px!important;min-width:92px!important;height:30px!important;min-height:30px!important;padding:0 11px!important;border-radius:8px!important;font-size:10.5px!important;letter-spacing:.035em!important}",
			"._windowGroup_1snf1_69 .nyx-live-clear-logs{margin-left:8px!important;min-width:92px!important;height:30px!important;min-height:30px!important;padding:0 11px!important;border-radius:8px!important;font-size:10.5px!important;letter-spacing:.035em!important}",
			"._windowButtons_1dn50_57 ._exportButton_1dn50_81{margin-left:8px!important;min-width:92px!important;height:30px!important;min-height:30px!important;padding:0 11px!important;border-radius:8px!important;font-size:10.5px!important;letter-spacing:.035em!important}",
			"._windowButtons_1dn50_57 ._exportButton_1dn50_81+._window_1dn50_57.nyx-live-clear-logs{margin-left:8px!important}",
			"._windowButtons_1kmqk_76 .nyx-live-clear-logs{margin-left:8px!important;min-width:92px!important;height:30px!important;min-height:30px!important;padding:0 11px!important;border-radius:8px!important;font-size:10.5px!important;letter-spacing:.035em!important}",
			".nyx-live-row-controls{display:inline-flex!important;align-items:center!important;gap:10px!important;margin-top:7px!important}",
			".nyx-live-row-pill{min-width:42px!important;height:31px!important;min-height:31px!important;padding:0 12px!important;border-radius:10px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;margin:0!important}",
			".nyx-rule-form-actions{display:flex!important;justify-content:flex-end!important;align-items:center!important;gap:14px!important}",
			".nyx-rule-form-actions .nyx-app-action-pill{margin-left:0!important}",
			".nyx-rule-form-actions .nyx-app-action-pill+.nyx-app-action-pill{margin-left:14px!important}",
			".nyx-rule-form-actions .nyx-traffic-save-rule-action{transform:none!important}",
			"html[data-app-theme=premium-nyx] body:after{background:radial-gradient(900px 520px at 18% 18%,rgba(41,116,158,.13),transparent 64%),radial-gradient(780px 500px at 82% 8%,rgba(0,212,255,.07),transparent 62%),linear-gradient(180deg,rgba(209,235,255,.018),rgba(209,235,255,.01))!important;mix-blend-mode:screen!important;opacity:.72!important;animation:none!important}",
			"html[data-app-theme=premium-nyx] .nyx-app-action-pill:not(.nyx-traffic-rule-action){background:linear-gradient(180deg,rgba(8,32,45,.98),rgba(4,19,30,.98))!important;border-color:rgba(89,219,244,.68)!important;color:#dffaff!important;box-shadow:0 8px 18px rgba(0,0,0,.34),0 0 0 1px rgba(89,219,244,.16) inset,0 0 14px rgba(0,212,255,.08)!important;text-shadow:0 1px 2px rgba(0,0,0,.36)!important}",
			"html[data-app-theme=premium-nyx] .nyx-app-action-pill:not(.nyx-traffic-rule-action):hover,html[data-app-theme=premium-nyx] .nyx-app-action-pill:not(.nyx-traffic-rule-action):focus-visible{background:linear-gradient(180deg,rgba(11,43,58,.99),rgba(5,27,39,.99))!important;border-color:rgba(130,239,255,.86)!important;color:#ffffff!important;box-shadow:0 10px 22px rgba(0,0,0,.42),0 0 0 1px rgba(130,239,255,.24) inset,0 0 22px rgba(0,212,255,.16)!important}",
			"html[data-app-theme=premium-nyx] .nyx-app-action-pill:not(.nyx-traffic-rule-action):disabled,html[data-app-theme=premium-nyx] .nyx-app-action-pill:not(.nyx-traffic-rule-action)[disabled],html[data-app-theme=premium-nyx] .nyx-app-action-pill:not(.nyx-traffic-rule-action).disabled{opacity:.76!important;background:linear-gradient(180deg,rgba(8,30,42,.9),rgba(5,20,31,.92))!important;border-color:rgba(76,162,198,.48)!important;color:#8ec7d9!important;box-shadow:0 0 0 1px rgba(88,199,236,.1) inset!important}",
			"html[data-app-theme=premium-nyx] .btn-primary,html[data-app-theme=premium-nyx] .btn.btn-primary,html[data-app-theme=premium-nyx] [class*=\"_primaryBtn_\"]{background:linear-gradient(180deg,rgba(10,35,48,.98),rgba(6,24,36,.98))!important;border-color:rgba(79,212,255,.58)!important;color:#bff3ff!important;box-shadow:0 7px 16px rgba(0,0,0,.34),0 0 0 1px rgba(79,212,255,.14) inset,0 0 18px rgba(0,212,255,.08)!important;text-shadow:none!important;font-weight:750!important}",
			"html[data-app-theme=premium-nyx] .btn-primary:hover,html[data-app-theme=premium-nyx] .btn.btn-primary:hover,html[data-app-theme=premium-nyx] [class*=\"_primaryBtn_\"]:hover,html[data-app-theme=premium-nyx] .btn-primary:focus-visible,html[data-app-theme=premium-nyx] .btn.btn-primary:focus-visible,html[data-app-theme=premium-nyx] [class*=\"_primaryBtn_\"]:focus-visible{background:linear-gradient(180deg,rgba(12,46,62,.99),rgba(7,31,46,.99))!important;border-color:rgba(111,229,255,.78)!important;color:#e8fbff!important;box-shadow:0 9px 20px rgba(0,0,0,.4),0 0 0 1px rgba(111,229,255,.22) inset,0 0 22px rgba(0,212,255,.14)!important}",
			"html[data-app-theme=premium-nyx] .nyx-control-matrix-action{background:linear-gradient(180deg,rgba(8,32,45,.98),rgba(5,21,32,.98))!important;border:1px solid rgba(88,225,255,.64)!important;color:#d8f9ff!important;box-shadow:0 8px 18px rgba(0,0,0,.38),0 0 0 1px rgba(88,225,255,.16) inset,0 0 18px rgba(0,212,255,.1)!important;text-shadow:none!important;font-weight:750!important}",
			"html[data-app-theme=premium-nyx] .nyx-control-matrix-action:hover,html[data-app-theme=premium-nyx] .nyx-control-matrix-action:focus-visible{background:linear-gradient(180deg,rgba(11,43,59,.99),rgba(7,29,43,.99))!important;border-color:rgba(125,235,255,.84)!important;color:#ffffff!important;box-shadow:0 10px 22px rgba(0,0,0,.42),0 0 0 1px rgba(125,235,255,.24) inset,0 0 24px rgba(0,212,255,.16)!important;outline:none!important}",
			"html[data-app-theme=premium-nyx] .nyx-control-matrix-action *{color:inherit!important}",
			".nyx-traffic-rule-action{width:86px!important;min-width:86px!important;height:29px!important;min-height:29px!important;padding:0 12px!important;border-radius:999px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;font-size:10.5px!important;line-height:1!important;letter-spacing:.015em!important;text-transform:uppercase!important;white-space:nowrap!important}",
			"html[data-app-theme=premium-nyx] .nyx-traffic-save-rule-action{background:linear-gradient(180deg,rgba(7,33,44,.98),rgba(4,20,31,.98))!important;border:1px solid rgba(91,220,244,.72)!important;color:#dffaff!important;box-shadow:0 0 0 1px rgba(91,220,244,.14) inset,0 0 14px rgba(0,212,255,.08)!important}",
			"html[data-app-theme=premium-nyx] .nyx-traffic-save-rule-action:hover,html[data-app-theme=premium-nyx] .nyx-traffic-save-rule-action:focus-visible{background:linear-gradient(180deg,rgba(10,43,56,.99),rgba(5,27,39,.99))!important;border-color:rgba(132,239,255,.86)!important;color:#ffffff!important;box-shadow:0 0 0 1px rgba(132,239,255,.22) inset,0 0 18px rgba(0,212,255,.14)!important;outline:none!important}",
			"html[data-app-theme=premium-nyx] .nyx-traffic-delete-rule-action{background:linear-gradient(180deg,rgba(9,24,37,.98),rgba(5,16,27,.98))!important;border:1px solid rgba(91,145,184,.52)!important;color:#d7eaf7!important;box-shadow:0 0 0 1px rgba(117,189,232,.08) inset!important}",
			"html[data-app-theme=premium-nyx] .nyx-traffic-delete-rule-action:hover,html[data-app-theme=premium-nyx] .nyx-traffic-delete-rule-action:focus-visible{background:linear-gradient(180deg,rgba(13,31,47,.99),rgba(7,21,34,.99))!important;border-color:rgba(122,194,236,.72)!important;color:#ffffff!important;box-shadow:0 0 0 1px rgba(122,194,236,.16) inset,0 0 12px rgba(76,170,225,.1)!important;outline:none!important}",
			".nyx-traffic-rule-action-slot{display:flex!important;justify-content:flex-end!important;align-items:center!important;gap:8px!important;padding-right:2px!important}",
			".nyx-traffic-rule-action-slot .nyx-traffic-rule-action{margin-left:auto!important}",
			".nyx-traffic-save-rule-action{transform:translateX(14px)!important}",
			".nyx-traffic-save-rule-action-slot{grid-column:1 / -1!important;width:100%!important;justify-self:stretch!important}",
			".nyx-traffic-delete-rule-action-slot{width:100%!important;justify-self:stretch!important}",
			"html[data-app-theme=premium-nyx] input[type=\"checkbox\"]{background-color:rgba(5,20,31,.96)!important;border-color:rgba(91,166,206,.5)!important;box-shadow:0 0 0 1px rgba(84,205,255,.08) inset!important}",
			"html[data-app-theme=premium-nyx] input[type=\"checkbox\"]:checked{background-color:#0d3f52!important;border-color:rgba(113,236,255,.88)!important;box-shadow:0 0 0 1px rgba(113,236,255,.28) inset,0 0 14px rgba(0,212,255,.22)!important;filter:saturate(.86) brightness(.96)!important}",
			"html[data-app-theme=premium-nyx] input[type=\"checkbox\"]:checked:focus,html[data-app-theme=premium-nyx] input[type=\"checkbox\"]:checked:focus-visible{border-color:rgba(159,246,255,.95)!important;box-shadow:0 0 0 1px rgba(159,246,255,.34) inset,0 0 0 3px rgba(0,212,255,.14),0 0 18px rgba(0,212,255,.26)!important}",
			".nyx-toggle-on-active{position:relative!important;overflow:hidden!important;background:linear-gradient(180deg,rgba(20,96,118,.96),rgba(8,50,68,.98))!important;border-color:rgba(113,236,255,.9)!important;color:#f0fdff!important;box-shadow:0 0 0 1px rgba(111,235,255,.34) inset,0 0 20px rgba(0,212,255,.3),0 6px 16px rgba(0,0,0,.22)!important;text-shadow:0 0 8px rgba(177,248,255,.46)!important;animation:nyxToggleOnPulse 1.65s ease-in-out infinite!important;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease,background .16s ease!important}",
			".nyx-toggle-on-active:before{content:\"\";position:absolute;inset:-45% -95%;background:linear-gradient(115deg,transparent 30%,rgba(225,252,255,.46) 48%,transparent 66%);transform:translateX(-70%);animation:nyxToggleOnSweep 2.6s ease-in-out infinite;pointer-events:none!important}",
			".nyx-toggle-on-active:after{content:\"\";position:absolute;inset:-3px;border-radius:inherit;border:1px solid rgba(119,236,255,.42);opacity:.75;animation:nyxToggleOnRing 1.65s ease-in-out infinite;pointer-events:none!important}",
			".nyx-toggle-on-active:hover,.nyx-toggle-on-active:focus-visible{transform:translateY(-1px) scale(1.04)!important;border-color:rgba(174,248,255,1)!important;box-shadow:0 0 0 1px rgba(166,247,255,.46) inset,0 0 30px rgba(0,212,255,.44),0 10px 20px rgba(0,0,0,.32)!important;outline:none!important}",
			".nyx-toggle-on-active *{position:relative!important;color:inherit!important}",
			"@keyframes nyxToggleOnPulse{0%,100%{filter:brightness(1);box-shadow:0 0 0 1px rgba(111,235,255,.3) inset,0 0 16px rgba(0,212,255,.22),0 6px 16px rgba(0,0,0,.22)}50%{filter:brightness(1.18);box-shadow:0 0 0 1px rgba(180,250,255,.58) inset,0 0 34px rgba(0,212,255,.52),0 6px 16px rgba(0,0,0,.24)}}",
			"@keyframes nyxToggleOnSweep{0%,42%{transform:translateX(-70%);opacity:0}52%{opacity:1}78%,100%{transform:translateX(70%);opacity:0}}",
			"@keyframes nyxToggleOnRing{0%,100%{transform:scale(.96);opacity:.34}50%{transform:scale(1.12);opacity:.82}}",
			"html[data-app-theme=premium-nyx] .btn:not(.btn-primary):not([class*=\"_primaryBtn_\"]),html[data-app-theme=premium-nyx] [class*=\"_secondaryBtn_\"],html[data-app-theme=premium-nyx] [class*=\"_ghostBtn_\"]{color:#d9efff!important;background:linear-gradient(180deg,rgba(13,31,48,.96),rgba(8,22,36,.96))!important;border-color:rgba(99,170,218,.48)!important;box-shadow:0 5px 12px rgba(0,0,0,.28),0 0 0 1px rgba(125,205,255,.08) inset!important;font-weight:700!important}",
			"html[data-app-theme=premium-nyx] .btn:not(.btn-primary):not([class*=\"_primaryBtn_\"]):hover,html[data-app-theme=premium-nyx] [class*=\"_secondaryBtn_\"]:hover,html[data-app-theme=premium-nyx] [class*=\"_ghostBtn_\"]:hover{color:#ffffff!important;background:linear-gradient(180deg,rgba(17,41,64,.98),rgba(10,28,46,.98))!important;border-color:rgba(125,202,248,.66)!important}",
			"aside[aria-label=\"Main navigation\"] [class*=\"_sideMenuNav_\"]{position:relative!important;z-index:1!important}",
			"aside[aria-label=\"Main navigation\"] [class*=\"_sidebarFooter_\"]{position:relative!important;z-index:100000!important;overflow:visible!important}",
			"aside[aria-label=\"Main navigation\"] [class*=\"_userCard_\"]{position:relative!important;z-index:100001!important;isolation:isolate!important}",
			"aside[aria-label=\"Main navigation\"] [class*=\"_userCard_\"] .dropdown-menu{z-index:100002!important}",
			"aside[aria-label=\"Main navigation\"] [class*=\"_userCard_\"] .dropdown-menu.show{display:block!important;opacity:1!important;transform:translateY(-8px)!important}",
			"html[data-app-theme=nyx-aurora] [class*=\"_sidebarWrap_\"]{flex:0 0 232px!important;width:232px!important;max-width:232px!important;min-width:232px!important;background:linear-gradient(90deg,rgba(10,32,86,.99) 0%,rgba(14,48,132,.96) 78%,rgba(24,70,154,.72) 100%)!important;box-shadow:inset -1px 0 rgba(149,190,255,.22),18px 0 42px rgba(7,22,68,.34)!important}",
			"html[data-app-theme=nyx-aurora] aside[aria-label=\"Main navigation\"]{background:linear-gradient(180deg,rgba(9,36,105,.98),rgba(7,28,84,.97))!important;border-right:1px solid rgba(145,190,255,.32)!important;box-shadow:inset -1px 0 rgba(115,170,255,.22),inset 0 0 38px rgba(3,12,38,.28)!important}",
			"html[data-app-theme=nyx-aurora] aside[aria-label=\"Main navigation\"] [class*=\"_userCard_\"] .dropdown-menu{opacity:1!important;background:#10286d!important;border:1px solid rgba(181,219,255,.56)!important;box-shadow:0 24px 52px rgba(5,16,52,.72),0 0 0 1px rgba(117,181,255,.24) inset!important;border-radius:10px!important;padding:8px!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}",
			"html[data-app-theme=nyx-aurora] aside[aria-label=\"Main navigation\"] [class*=\"_userCard_\"] .dropdown-menu:before{content:\"\";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(180deg,#10286d,#143481)!important;z-index:-1!important}",
			"html[data-app-theme=nyx-aurora] aside[aria-label=\"Main navigation\"] [class*=\"_userCard_\"] .dropdown-item{color:#f0f7ff!important;background:transparent!important;border-radius:7px!important;min-height:36px!important;display:flex!important;align-items:center!important;gap:10px!important;text-shadow:0 1px 2px rgba(0,0,0,.35)!important}",
			"html[data-app-theme=nyx-aurora] aside[aria-label=\"Main navigation\"] [class*=\"_userCard_\"] .dropdown-item:hover,html[data-app-theme=nyx-aurora] aside[aria-label=\"Main navigation\"] [class*=\"_userCard_\"] .dropdown-item:focus-visible{color:#ffffff!important;background:linear-gradient(90deg,rgba(88,143,255,.42),rgba(93,180,255,.2))!important;outline:none!important}",
			"html[data-app-theme=nyx-aurora] aside[aria-label=\"Main navigation\"] [class*=\"_userCard_\"] .dropdown-divider{border-color:rgba(177,218,255,.22)!important;margin:6px 0!important}",
			"html[data-app-theme=nyx-aurora] [class*=\"_sidebarFooter_\"]{background:linear-gradient(180deg,rgba(16,50,130,.42),rgba(12,43,115,.74))!important;border-color:rgba(150,196,255,.22)!important}",
			"@media(max-width:767.98px){html[data-app-theme=nyx-aurora] [class*=\"_sidebarWrap_\"]{width:100%!important;max-width:none!important;min-width:0!important;flex:0 0 auto!important}}",
			"html[data-app-theme=cobalt-eclipse] [class*=\"_sidebarWrap_\"]{flex:0 0 232px!important;width:232px!important;max-width:232px!important;min-width:232px!important;background:linear-gradient(90deg,rgba(7,24,74,.99) 0%,rgba(10,42,118,.96) 78%,rgba(18,62,150,.72) 100%)!important;box-shadow:inset -1px 0 rgba(142,184,255,.24),18px 0 42px rgba(5,16,54,.36)!important}",
			"html[data-app-theme=cobalt-eclipse] aside[aria-label=\"Main navigation\"]{background:linear-gradient(180deg,rgba(6,30,96,.98),rgba(5,22,72,.97))!important;border-right:1px solid rgba(145,190,255,.34)!important;box-shadow:inset -1px 0 rgba(115,170,255,.24),inset 0 0 38px rgba(2,8,30,.32)!important}",
			"html[data-app-theme=cobalt-eclipse] aside[aria-label=\"Main navigation\"] [class*=\"_userCard_\"] .dropdown-menu{opacity:1!important;background:#071848!important;border:1px solid rgba(177,218,255,.56)!important;box-shadow:0 24px 52px rgba(2,10,34,.78),0 0 0 1px rgba(117,181,255,.24) inset!important;border-radius:10px!important;padding:8px!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}",
			"html[data-app-theme=cobalt-eclipse] aside[aria-label=\"Main navigation\"] [class*=\"_userCard_\"] .dropdown-menu:before{content:\"\";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(180deg,#071848,#09215d)!important;z-index:-1!important}",
			"html[data-app-theme=cobalt-eclipse] aside[aria-label=\"Main navigation\"] [class*=\"_userCard_\"] .dropdown-item{color:#edf6ff!important;background:transparent!important;border-radius:7px!important;min-height:36px!important;display:flex!important;align-items:center!important;gap:10px!important;text-shadow:0 1px 2px rgba(0,0,0,.35)!important}",
			"html[data-app-theme=cobalt-eclipse] aside[aria-label=\"Main navigation\"] [class*=\"_userCard_\"] .dropdown-item:hover,html[data-app-theme=cobalt-eclipse] aside[aria-label=\"Main navigation\"] [class*=\"_userCard_\"] .dropdown-item:focus-visible{color:#ffffff!important;background:linear-gradient(90deg,rgba(74,142,255,.38),rgba(72,196,255,.18))!important;outline:none!important}",
			"html[data-app-theme=cobalt-eclipse] aside[aria-label=\"Main navigation\"] [class*=\"_userCard_\"] .dropdown-divider{border-color:rgba(161,207,255,.2)!important;margin:6px 0!important}",
			"html[data-app-theme=cobalt-eclipse] [class*=\"_sidebarFooter_\"]{background:linear-gradient(180deg,rgba(12,42,112,.42),rgba(10,36,101,.74))!important;border-color:rgba(150,196,255,.22)!important}",
			"@media(max-width:767.98px){html[data-app-theme=cobalt-eclipse] [class*=\"_sidebarWrap_\"]{width:100%!important;max-width:none!important;min-width:0!important;flex:0 0 auto!important}}",
			"[class*=\"_sideMenuNav_\"] .navbar-nav{gap:0!important}",
			"[class*=\"_sideMenuNav_\"] .nav-item{margin:0!important}",
			"[class*=\"_sideMenuNav_\"] .nav-link{min-height:38px!important;padding:3px 8px!important;gap:9px!important;align-items:center!important}",
			"[class*=\"_sideMenuNav_\"] .nav-link-title{font-size:.82rem!important;line-height:1.08!important}",
			".nyx-guard-icon{width:21px!important;height:21px!important;display:block!important;overflow:visible!important;filter:drop-shadow(0 4px 8px rgba(76,211,255,.16))}",
			".nav-item[data-menu]>.nav-link .nav-link-icon{width:27px!important;height:27px!important;min-width:27px!important;margin:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;border-radius:8px!important;position:relative!important;color:#d8f6ff!important;transition:transform .16s ease,filter .16s ease,background-color .16s ease!important}",
			".nav-item[data-menu]>.nav-link .nav-link-icon:before{content:\"\";position:absolute;inset:2px;border-radius:7px;background:linear-gradient(145deg,rgba(71,214,255,.12),rgba(46,255,168,.06));border:1px solid rgba(104,219,255,.18);box-shadow:inset 0 0 10px rgba(83,219,255,.07);opacity:.72;transition:opacity .16s ease,border-color .16s ease,box-shadow .16s ease!important}",
			".nav-item[data-menu]>.nav-link:hover .nav-link-icon,.nav-item[data-menu]>.nav-link.active .nav-link-icon{transform:translateX(1px);filter:drop-shadow(0 0 12px rgba(68,218,255,.34))}",
			".nav-item[data-menu]>.nav-link:hover .nav-link-icon:before,.nav-item[data-menu]>.nav-link.active .nav-link-icon:before{opacity:1;border-color:rgba(98,232,255,.42);box-shadow:inset 0 0 18px rgba(92,229,255,.13),0 0 14px rgba(60,205,255,.13)}",
			".nav-item[data-menu]>.nav-link .nav-link-icon>svg:not(.nyx-guard-icon){display:none!important}",
			".prefs-action-links{display:flex!important;flex-direction:column!important;gap:6px!important;padding-top:6px!important;width:100%!important;box-sizing:border-box!important}",
			".prefs-action-link{width:100%!important;min-height:31px!important;max-width:100%!important;box-sizing:border-box!important}",
			".modal .btn-group[role=\"group\"]{isolation:isolate!important;border-radius:7px!important;overflow:hidden!important;box-shadow:0 0 0 1px rgba(95,169,220,.18)!important;min-height:30px!important}",
			".modal .btn-group[role=\"group\"] .btn{position:relative!important;min-height:30px!important;height:30px!important;padding:0 10px!important;border-color:rgba(78,140,184,.42)!important;background:linear-gradient(180deg,rgba(8,24,38,.96),rgba(5,17,29,.96))!important;color:#b9cedd!important;box-shadow:inset 0 1px rgba(255,255,255,.035)!important;opacity:.78!important;filter:saturate(.78)!important;font-size:12px!important;line-height:1!important}",
			".modal .btn-group[role=\"group\"] .btn:hover{opacity:.94!important;color:#e6f8ff!important;border-color:rgba(105,191,242,.62)!important;background:linear-gradient(180deg,rgba(10,33,51,.98),rgba(6,22,35,.98))!important}",
			".modal .btn-group[role=\"group\"] .btn-check:checked+label.btn,.modal .btn-group[role=\"group\"] label.btn.active{z-index:2!important;opacity:1!important;filter:none!important;color:#ffffff!important;font-weight:780!important;border-color:rgba(143,238,255,.86)!important;box-shadow:0 0 0 1px rgba(225,252,255,.24) inset,0 0 0 1px rgba(67,214,255,.2),0 0 14px rgba(67,214,255,.18)!important;text-shadow:none!important}",
			".modal .btn-group[role=\"group\"] .btn-check:checked+label.btn:before,.modal .btn-group[role=\"group\"] label.btn.active:before{content:\"\"!important;position:absolute!important;left:9px!important;top:50%!important;width:5px!important;height:5px!important;border-radius:999px!important;background:#dffbff!important;box-shadow:0 0 7px rgba(126,232,255,.78)!important;transform:translateY(-50%)!important}",
			".modal .btn-group[role=\"group\"] .btn-check[value=\"manage\"]:checked+label.btn{background:linear-gradient(180deg,rgba(12,83,72,.98),rgba(7,48,47,.98))!important;border-color:rgba(94,255,205,.94)!important;box-shadow:0 0 0 1px rgba(216,255,244,.28) inset,0 0 0 2px rgba(70,255,200,.2),0 0 22px rgba(48,255,190,.24)!important}",
			".modal .btn-group[role=\"group\"] .btn-check[value=\"view\"]:checked+label.btn,.modal .btn-group[role=\"group\"] .btn-check[value=\"all\"]:checked+label.btn{background:linear-gradient(180deg,rgba(15,76,116,.98),rgba(8,42,72,.98))!important;border-color:rgba(112,212,255,.94)!important;box-shadow:0 0 0 1px rgba(219,247,255,.28) inset,0 0 0 2px rgba(72,196,255,.2),0 0 22px rgba(72,196,255,.26)!important}",
			".modal .btn-group[role=\"group\"] .btn-check[value=\"hidden\"]:checked+label.btn,.modal .btn-group[role=\"group\"] .btn-check[value=\"user\"]:checked+label.btn{background:linear-gradient(180deg,rgba(73,47,78,.98),rgba(43,31,52,.98))!important;border-color:rgba(225,154,255,.88)!important;box-shadow:0 0 0 1px rgba(248,226,255,.24) inset,0 0 0 2px rgba(212,114,255,.18),0 0 20px rgba(212,114,255,.2)!important}",
			".modal .btn-group[role=\"group\"] .btn-check:disabled+label.btn{opacity:.34!important;filter:grayscale(.65)!important;color:#708594!important;background:linear-gradient(180deg,rgba(8,18,28,.82),rgba(5,13,22,.82))!important;border-color:rgba(72,106,132,.3)!important;box-shadow:none!important;cursor:not-allowed!important}",
			"html[data-app-theme=premium-nyx] .modal .btn-group[role=\"group\"] .btn{background:linear-gradient(180deg,rgba(8,24,38,.96),rgba(5,17,29,.96))!important;color:#b9cedd!important;border-color:rgba(78,140,184,.42)!important;box-shadow:inset 0 1px rgba(255,255,255,.035)!important}",
			"html[data-app-theme=premium-nyx] .modal .btn-group[role=\"group\"] .btn-check:checked+label.btn,html[data-app-theme=premium-nyx] .modal .btn-group[role=\"group\"] label.btn.active{color:#ffffff!important;border-color:rgba(143,238,255,.86)!important;box-shadow:0 0 0 1px rgba(225,252,255,.24) inset,0 0 0 1px rgba(67,214,255,.2),0 0 14px rgba(67,214,255,.18)!important}",
			"[data-nyx-view-only-hidden=\"1\"]{display:none!important}",
			"body.nyx-view-only-page [data-nyx-readonly-soft=\"1\"]{opacity:.45!important;pointer-events:none!important}",
			"@media(max-width:575.98px){.nyx-users-header-actions{gap:.85rem!important;justify-content:flex-start!important;margin-top:.75rem;min-width:0}.nyx-users-header-actions .input-group{width:100%!important;flex:1 1 100%!important}.nyx-users-header-actions .btn{width:auto}}",
		].join("");
		document.head.appendChild(style);
	}

	function sidebarSvg(body, accent) {
		return (
			'<svg class="nyx-guard-icon" aria-hidden="true" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">' +
			'<defs><linearGradient id="g-' + accent + '" x1="6" y1="5" x2="27" y2="27" gradientUnits="userSpaceOnUse">' +
			'<stop stop-color="#dff9ff"/><stop offset=".48" stop-color="#52d7ff"/><stop offset="1" stop-color="#32ffc2"/></linearGradient></defs>' +
			'<circle cx="16" cy="16" r="12.5" fill="rgba(7,25,39,.52)" stroke="rgba(101,220,255,.2)"/>' +
			body.replaceAll("__G__", "url(#g-" + accent + ")") +
			"</svg>"
		);
	}

	var sidebarIcons = {
		dashboard: sidebarSvg('<path d="M8.5 16.4 16 9.2l7.5 7.2v7.1h-5.1v-5h-4.8v5H8.5v-7.1Z" stroke="__G__" stroke-width="1.8" stroke-linejoin="round"/><path d="M11.1 14.4 16 9.8l4.9 4.6" stroke="#fff" stroke-opacity=".48" stroke-width="1.1" stroke-linecap="round"/>', "dash"),
		"nyxguard-traffic": sidebarSvg('<path d="M8 21.5h16" stroke="__G__" stroke-width="1.7" stroke-linecap="round"/><path d="M9 18.2 13.2 14l3.2 2.9 5.9-6.2" stroke="__G__" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21.4 10.7h-4.1m4.1 0v4.1" stroke="#fff" stroke-opacity=".55" stroke-width="1.3" stroke-linecap="round"/>', "traffic"),
		"nyxguard-ips": sidebarSvg('<circle cx="16" cy="16" r="8.4" stroke="__G__" stroke-width="1.8"/><path d="M7.8 16h16.4M16 7.6c2.3 2.3 3.2 5.1 3.2 8.4s-.9 6.1-3.2 8.4c-2.3-2.3-3.2-5.1-3.2-8.4s.9-6.1 3.2-8.4Z" stroke="__G__" stroke-width="1.35"/><circle cx="20.8" cy="11.7" r="1.4" fill="#fff" fill-opacity=".72"/>', "ips"),
		"nyxguard-rules": sidebarSvg('<path d="M9.5 9.5h5.8M9.5 16h13M9.5 22.5h5.8" stroke="__G__" stroke-width="1.8" stroke-linecap="round"/><path d="m18.4 8.6 4.1 3.8-4.1 3.8M18.4 18.4l4.1 3.8-4.1 3.8" stroke="__G__" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>', "rules"),
		"nyxguard-apps": sidebarSvg('<path d="M10 9.5h5v5h-5v-5ZM17 9.5h5v5h-5v-5ZM10 16.8h5v5h-5v-5ZM17 16.8h5v5h-5v-5Z" stroke="__G__" stroke-width="1.65" stroke-linejoin="round"/><path d="M12.5 12h7" stroke="#fff" stroke-opacity=".36" stroke-width="1.1" stroke-linecap="round"/>', "apps"),
		"nyxguard-attacks": sidebarSvg('<path d="M17.2 7.8 9.5 17h5.7l-1.8 7.2 8.1-10h-5.8l1.5-6.4Z" fill="rgba(82,215,255,.18)" stroke="__G__" stroke-width="1.8" stroke-linejoin="round"/><path d="M18.6 9.7 16.8 14h3.3" stroke="#fff" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/>', "attacks"),
		"web-controls": sidebarSvg('<path d="M16 7.8 23.2 10v5.7c0 4.4-2.9 7.5-7.2 9-4.3-1.5-7.2-4.6-7.2-9V10L16 7.8Z" stroke="__G__" stroke-width="1.8" stroke-linejoin="round"/><path d="m12.4 16.3 2.3 2.2 4.9-5.3" stroke="#fff" stroke-opacity=".72" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>', "web"),
		"nyxguard-globalgate": sidebarSvg('<path d="M16 7.4 23.5 11v5.7c0 4.1-3 6.8-7.5 8.1-4.5-1.3-7.5-4-7.5-8.1V11L16 7.4Z" stroke="__G__" stroke-width="1.75" stroke-linejoin="round"/><path d="M11.5 17.1h9M16 12.6v9" stroke="__G__" stroke-width="1.45" stroke-linecap="round"/><circle cx="16" cy="17.1" r="2.1" fill="#fff" fill-opacity=".2" stroke="#fff" stroke-opacity=".52"/>', "gate"),
		"proxy-hosts": sidebarSvg('<rect x="8.8" y="9.2" width="14.4" height="10.2" rx="1.8" stroke="__G__" stroke-width="1.75"/><path d="M12.2 23h7.6M16 19.8V23" stroke="__G__" stroke-width="1.6" stroke-linecap="round"/><path d="M11.6 12.4h8.8" stroke="#fff" stroke-opacity=".5" stroke-width="1.2" stroke-linecap="round"/>', "proxy"),
		"access-lists": sidebarSvg('<rect x="9.3" y="14.1" width="13.4" height="9" rx="2" stroke="__G__" stroke-width="1.75"/><path d="M12 14.1v-2.2a4 4 0 0 1 8 0v2.2" stroke="__G__" stroke-width="1.75" stroke-linecap="round"/><circle cx="16" cy="18.7" r="1.4" fill="#fff" fill-opacity=".65"/>', "access"),
		certificates: sidebarSvg('<path d="M16 7.8 23 10v5.4c0 4.1-2.7 7-7 8.7-4.3-1.7-7-4.6-7-8.7V10l7-2.2Z" stroke="__G__" stroke-width="1.75" stroke-linejoin="round"/><path d="M12.3 15.9h7.4M14 19h4" stroke="__G__" stroke-width="1.45" stroke-linecap="round"/>', "cert"),
		users: sidebarSvg('<circle cx="16" cy="12.6" r="3.2" stroke="__G__" stroke-width="1.75"/><path d="M9.4 23.2c.9-3.3 3.2-5 6.6-5s5.7 1.7 6.6 5" stroke="__G__" stroke-width="1.75" stroke-linecap="round"/><path d="M22.3 15.4c1.3.5 2.2 1.5 2.8 3" stroke="#fff" stroke-opacity=".42" stroke-width="1.2" stroke-linecap="round"/>', "users"),
		auditlogs: sidebarSvg('<path d="M10.2 7.8h8.5l3.1 3.2v13.2H10.2V7.8Z" stroke="__G__" stroke-width="1.7" stroke-linejoin="round"/><path d="M18.5 8.1v3.4h3.2M13.1 15h5.8M13.1 18.7h5.8" stroke="__G__" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/><circle cx="13" cy="22" r="1" fill="#fff" fill-opacity=".62"/>', "audit"),
		settings: sidebarSvg('<path d="M16 10.2v-2M16 24v-2M21.1 12.3l1.5-1.4M9.4 21.1l1.5-1.4M23.8 16h-2M10.2 16h-2M21.1 19.7l1.5 1.4M9.4 10.9l1.5 1.4" stroke="__G__" stroke-width="1.45" stroke-linecap="round"/><circle cx="16" cy="16" r="4.2" stroke="__G__" stroke-width="1.8"/><circle cx="16" cy="16" r="1.3" fill="#fff" fill-opacity=".68"/>', "settings"),
	};

	function enhanceSidebarIcons() {
		try {
			Object.keys(sidebarIcons).forEach(function (menu) {
				document.querySelectorAll('.nav-item[data-menu="' + menu + '"] .nav-link-icon').forEach(function (slot) {
					if (slot.dataset.nyxIconEnhanced === "1") {
						return;
					}
					slot.innerHTML = sidebarIcons[menu];
					slot.dataset.nyxIconEnhanced = "1";
				});
			});
		} catch (err) {
			console.warn("NyxGuard local sidebar icon enhancement skipped", err);
		}
	}

	function alignPermissionModalWithSidebar() {
		try {
			document.querySelectorAll(".modal.show, .modal").forEach(function (modal) {
				var title = modal.querySelector(".modal-title");
				if (!title || !/Set Permissions|Permisiuni|Berechtigungen|Permisos|Autorisations/i.test(title.textContent || "")) {
					return;
				}
				if (modal.dataset.nyxPermissionsAligned === "1") {
					return;
				}

				var labelText = function (row) {
					var label = row.querySelector(".form-label");
					return label ? (label.textContent || "").replace(/\s+/g, " ").trim() : "";
				};
				var legacyLabels = {
					"Item Visibility": true,
					"Redirection Hosts": true,
					"404 Hosts": true,
					Streams: true,
					Acces: true,
					"Hosturi de redirectionare": true,
					"Hosturi 404": true,
					"Fluxuri": true,
				};

				modal.querySelectorAll(".modal-body .mb-3").forEach(function (row) {
					var text = labelText(row);
					if (!text) {
						return;
					}
					if (legacyLabels[text]) {
						row.remove();
						return;
					}
					if (text === "NyxGuard Proxy Hosts" || text === "Proxy Hosts" || text === "Hosturi Proxy NyxGuard") {
						var label = row.querySelector(".form-label");
						if (label) {
							label.textContent = "NyxGuard Security";
						}
					}
				});
				modal.dataset.nyxPermissionsAligned = "1";
			});
		} catch (err) {
			console.warn("NyxGuard local permissions modal alignment skipped", err);
		}
	}

	var permissionsCache = {
		loaded: false,
		loading: false,
		user: null,
	};

	function getStoredAuthToken() {
		try {
			var raw = localStorage.getItem("authentications");
			if (raw) {
				var tokens = JSON.parse(raw);
				if (Array.isArray(tokens) && tokens.length && tokens[tokens.length - 1] && tokens[tokens.length - 1].token) {
					return tokens[tokens.length - 1].token;
				}
			}
		} catch (err) {
			console.warn("NyxGuard local auth token lookup skipped", err);
		}
		return null;
	}

	function normalizePermissionValue(value) {
		return String(value || "").toLowerCase();
	}

	function permissionForPath(pathname) {
		if (/^\/nyxguard(\/|$)/.test(pathname)) return ["nyxguard", "nyxguard"];
		if (/^\/web-controls(\/|$)/.test(pathname)) return ["webControls", "web_controls"];
		if (/^\/users(\/|$)/.test(pathname)) return ["users", "users"];
		if (/^\/event-center(\/|$)/.test(pathname)) return ["auditlog", "auditlog"];
		if (/^\/settings(\/|$)/.test(pathname)) return ["settings", "settings"];
		if (/^\/access-lists(\/|$)/.test(pathname)) return ["accessLists", "access_lists"];
		if (/^\/certificates(\/|$)/.test(pathname)) return ["certificates", "certificates"];
		return null;
	}

	function getCurrentPermission() {
		var mapping = permissionForPath(window.location.pathname);
		var user = permissionsCache.user;
		if (!mapping || !user) return "";
		var roles = Array.isArray(user.roles) ? user.roles : [];
		if (roles.indexOf("admin") !== -1) return "manage";
		var permissions = user.permissions || {};
		return normalizePermissionValue(permissions[mapping[0]] || permissions[mapping[1]]);
	}

	function loadCurrentUserPermissions() {
		if (permissionsCache.loaded || permissionsCache.loading) return;
		var token = getStoredAuthToken();
		if (!token) return;
		permissionsCache.loading = true;
		fetch("/api/users/me?expand=permissions", {
			headers: {
				Authorization: "Bearer " + token,
				Accept: "application/json",
			},
		})
			.then(function (res) {
				if (!res.ok) throw new Error("HTTP " + res.status);
				return res.json();
			})
			.then(function (user) {
				permissionsCache.user = user;
				permissionsCache.loaded = true;
				applyViewOnlyMode();
			})
			.catch(function (err) {
				console.warn("NyxGuard local read-only permission lookup skipped", err);
			})
			.finally(function () {
				permissionsCache.loading = false;
			});
	}

	function isPermissionModal(element) {
		var modal = element.closest ? element.closest(".modal") : null;
		if (!modal) return false;
		var title = modal.querySelector(".modal-title");
		return !!(title && /Set Permissions|Permisiuni|Berechtigungen|Permisos|Autorisations/i.test(title.textContent || ""));
	}

	function isInsideMainWorkArea(element) {
		if (!element || isPermissionModal(element)) return false;
		if (element.closest(".Toastify,.modal-backdrop")) return false;
		if (element.closest("aside,nav,.sidebar,[class*=\"_sidebar\"],[class*=\"_navigation\"],[class*=\"_prefsDropdown\"]")) return false;
		return true;
	}

	function isMutatingControl(element) {
		var label = ((element.textContent || "") + " " + (element.getAttribute("aria-label") || "") + " " + (element.getAttribute("title") || ""))
			.replace(/\s+/g, " ")
			.trim()
			.toUpperCase();
		if (element.matches('[data-bs-toggle="dropdown"],[aria-haspopup="menu"],[aria-haspopup="true"]') && isInsideMainWorkArea(element)) {
			return true;
		}
		if (!label) return false;
		return /(^|\s)(ADD|CREATE|SAVE|APPLY|UPLOAD|DELETE|REMOVE|RESET|CLEAR|ENABLE|DISABLE|ACTIVATE|ROLLBACK|RENEW|REVOKE|EDIT|MANAGE|BAN|UNBAN|BLOCK|UNBLOCK)(\s|$)/.test(label) ||
			/CLEAR LOGS|ADD USER|ADD APP|ADD RULE|DELETE ALL|SAVE RULE|SAVE SETTINGS|SAVE GLOBALGATE|AUTH BYPASS|BOT DEFENCE|DDoS/i.test(label);
	}

	function applyViewOnlyMode() {
		loadCurrentUserPermissions();
		var permission = getCurrentPermission();
		var viewOnly = permission === "view";
		document.body.classList.toggle("nyx-view-only-page", viewOnly);
		if (!viewOnly) {
			document.querySelectorAll("[data-nyx-view-only-hidden=\"1\"],[data-nyx-readonly-soft=\"1\"]").forEach(function (element) {
				if (element.getAttribute("data-nyx-disabled-before") !== "1" && "disabled" in element) element.disabled = false;
				element.removeAttribute("data-nyx-view-only-hidden");
				element.removeAttribute("data-nyx-readonly-soft");
				element.removeAttribute("data-nyx-disabled-before");
				element.removeAttribute("aria-disabled");
				element.removeAttribute("tabindex");
			});
			return;
		}
		document.querySelectorAll("button,a,[role=\"button\"]").forEach(function (button) {
			if (!isInsideMainWorkArea(button) || !isMutatingControl(button)) return;
			if (button.getAttribute("data-nyx-view-only-hidden") === "1") return;
			button.setAttribute("data-nyx-disabled-before", button.disabled ? "1" : "0");
			button.setAttribute("data-nyx-view-only-hidden", "1");
			if ("disabled" in button) button.disabled = true;
			button.setAttribute("aria-disabled", "true");
			button.setAttribute("tabindex", "-1");
		});
		document.querySelectorAll("input:not([type=\"search\"]):not([type=\"hidden\"]),select,textarea").forEach(function (field) {
			if (!isInsideMainWorkArea(field) || field.closest(".modal")) return;
			if (field.getAttribute("data-nyx-readonly-soft") === "1") return;
			field.setAttribute("data-nyx-readonly-soft", "1");
			if ("readOnly" in field) field.readOnly = true;
		});
	}

	function markControlMatrixActions() {
		try {
			var actionLabels = {
				"APPLY": true,
				"UPLOAD": true,
				"SAVE": true,
				"RESET": true,
				"REFRESH": true,
				"INSPECT IPS": true,
				"ADD APP": true,
				"VIEW ALL APPS": true,
				"ADD IP RULE": true,
				"VIEW ALL RULES": true,
				"ADD COUNTRY RULE": true,
				"MANAGE RULES": true,
				"OPEN GLOBALGATE": true,
				"VIEW LIVE STREAM": true,
				"EXPORT EVENTS": true,
				"EXPORT JSON": true,
				"CLEAR LOGS": true,
				"CREATE": true,
				"CREATE RULE": true,
				"ADD": true,
				"ADD RULE": true,
				"DELETE": true,
				"DELETE ALL": true,
				"DISMISS": true,
				"CANCEL": true,
			};
			document.querySelectorAll("#advanced-table-search").forEach(function (input) {
				if (input.parentElement) {
					input.parentElement.classList.add("nyx-table-search-field");
				}
				var actionWrap = input.closest(".btn-list");
				if (actionWrap) {
					actionWrap.classList.add("nyx-users-header-actions");
				}
			});
			document.querySelectorAll("button,a,[role=\"button\"]").forEach(function (button) {
				var label = (button.textContent || "").replace(/\s+/g, " ").trim();
				var normalizedLabel = label.replace(/^\+\s*/, "").toUpperCase();
				if (actionLabels[normalizedLabel]) {
					button.classList.add("nyx-app-action-pill");
				}
				if (label === "CLEAR LOGS" || label === "Clear Logs") {
					button.classList.add("nyx-live-clear-logs");
				}
				if (label === "50" || label === "100") {
					button.classList.add("nyx-live-row-pill");
					if (button.parentElement) {
						button.parentElement.classList.add("nyx-live-row-controls");
					}
				}
				if (label === "Save GlobalGate Settings" || label === "+ Add Rule" || label === "Add Rule" || label === "SAVE RULE" || label === "Save Rule") {
					button.classList.add("nyx-control-matrix-action");
				}
				if (label === "SAVE RULE" || label === "Save Rule") {
					var parentText = button.parentElement ? (button.parentElement.textContent || "").toUpperCase() : "";
					if (parentText.includes("CANCEL")) {
						button.classList.remove("nyx-traffic-rule-action", "nyx-traffic-save-rule-action");
						button.classList.add("nyx-app-action-pill");
						if (button.parentElement) {
							button.parentElement.classList.add("nyx-rule-form-actions");
						}
					} else {
						button.classList.add("nyx-traffic-rule-action", "nyx-traffic-save-rule-action");
						if (button.parentElement) {
							button.parentElement.classList.add("nyx-traffic-rule-action-slot", "nyx-traffic-save-rule-action-slot");
						}
					}
				}
				if (label === "CANCEL" || label === "Cancel") {
					if (button.parentElement && (button.parentElement.textContent || "").toUpperCase().includes("SAVE RULE")) {
						button.parentElement.classList.add("nyx-rule-form-actions");
					}
				}
				if (label === "DELETE ALL" || label === "Delete All") {
					button.classList.add("nyx-traffic-rule-action", "nyx-traffic-delete-rule-action");
					if (button.parentElement) {
						button.parentElement.classList.add("nyx-traffic-rule-action-slot", "nyx-traffic-delete-rule-action-slot");
					}
				}
				if (label === "ON" || button.getAttribute("aria-pressed") === "true" || button.getAttribute("aria-checked") === "true") {
					button.classList.add("nyx-toggle-on-active");
				} else {
					button.classList.remove("nyx-toggle-on-active");
				}
			});
		} catch (err) {
			console.warn("NyxGuard local Control Matrix action styling skipped", err);
		}
	}

	addLocalLayoutStyles();
	addPreferenceLinks();
	enhanceSidebarIcons();
	alignPermissionModalWithSidebar();
	markControlMatrixActions();
	applyViewOnlyMode();
	new MutationObserver(addPreferenceLinks).observe(document.documentElement, {
		childList: true,
		subtree: true,
	});
	new MutationObserver(enhanceSidebarIcons).observe(document.documentElement, {
		childList: true,
		subtree: true,
	});
	new MutationObserver(alignPermissionModalWithSidebar).observe(document.documentElement, {
		childList: true,
		characterData: true,
		subtree: true,
	});
	new MutationObserver(markControlMatrixActions).observe(document.documentElement, {
		childList: true,
		characterData: true,
		subtree: true,
	});
	new MutationObserver(applyViewOnlyMode).observe(document.documentElement, {
		childList: true,
		characterData: true,
		subtree: true,
	});
	window.addEventListener("popstate", applyViewOnlyMode);
	window.addEventListener("hashchange", applyViewOnlyMode);
	setInterval(applyViewOnlyMode, 1200);
})();
