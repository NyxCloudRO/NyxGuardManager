(function () {
	"use strict";

	var AUTH_KEY = "authentications";
	var DISMISS_PREFIX = "nyxguard:developer-message:dismissed:";
	var CHECK_INTERVAL_MS = 250;
	var currentToken = "";
	var currentUserId = 0;
	var checkInFlight = false;
	var checkedToken = "";
	var modal = null;
	var previouslyFocused = null;
	var supportUrl = "";

	var paragraphs = [
		"NyxGuard Manager started from a simple idea: self-hosted infrastructure deserves security tooling that feels like a serious operator platform — without giving up control of your infrastructure, your configuration, or your data.",
		"I’m building NyxGuard independently around that idea. What began as a better way to manage and protect reverse-proxied applications has grown into a broader security and operations platform, bringing reverse proxy management, certificate automation, application protection, threat visibility, traffic intelligence and secure connectivity together in one place.",
		"From WAF, SQL Shield, Bot Defence and DDoS protection to IP & Geo intelligence, access controls, real-time traffic visibility, event tracking and multi-site connectivity, each capability is designed with the same philosophy: give operators useful security controls and clear visibility without making their infrastructure unnecessarily complicated.",
		"NyxGuard is also built local-first. Your configuration, certificates and operational history remain on infrastructure you control. I want the platform to stay predictable to operate, transparent about what is happening, and practical when something actually needs your attention.",
		"Developing and maintaining all of this independently takes a significant amount of time — researching security problems, building new capabilities, testing releases, fixing issues and continuously improving the experience.",
		"NyxGuard Manager is free to use for both personal and enterprise deployments, and I intend to keep it that way.",
		"If NyxGuard helps you protect infrastructure you care about and you would like to support its continued development, you can do so below. Your support helps me dedicate more time to improving the platform and building what comes next.",
		"Support is completely optional.",
	];

	function readAuthentication() {
		try {
			var raw = localStorage.getItem(AUTH_KEY);
			if (!raw) return null;
			var tokens = JSON.parse(raw);
			if (!Array.isArray(tokens) || !tokens.length || !tokens[tokens.length - 1].token) return null;
			return String(tokens[tokens.length - 1].token);
		} catch (_) {
			return null;
		}
	}

	function decodeToken(token) {
		try {
			var payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
			payload += "=".repeat((4 - (payload.length % 4)) % 4);
			var parsed = JSON.parse(atob(payload));
			return { id: Number(parsed && parsed.attrs && parsed.attrs.id) || 0 };
		} catch (_) {
			return { id: 0 };
		}
	}

	function dismissKey(userId) {
		return DISMISS_PREFIX + String(userId);
	}

	function clearSessionDismissals() {
		try {
			for (var index = sessionStorage.length - 1; index >= 0; index -= 1) {
				var key = sessionStorage.key(index);
				if (key && key.indexOf(DISMISS_PREFIX) === 0) sessionStorage.removeItem(key);
			}
		} catch (_) {}
	}

	function wasDismissed(userId) {
		try {
			return sessionStorage.getItem(dismissKey(userId)) === "1";
		} catch (_) {
			return false;
		}
	}

	function markDismissed(userId) {
		try {
			sessionStorage.setItem(dismissKey(userId), "1");
		} catch (_) {}
	}

	function findSupportUrl() {
		var link = document.querySelector('a.support-nyxguard[href][target="_blank"]');
		if (!link) return "";
		try {
			var url = new URL(link.href, window.location.href);
			return url.protocol === "https:" ? url.href : "";
		} catch (_) {
			return "";
		}
	}

	function button(className, text) {
		var element = document.createElement("button");
		element.type = "button";
		element.className = className;
		element.textContent = text;
		return element;
	}

	function icon() {
		var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("aria-hidden", "true");
		var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path.setAttribute("d", "M12 21s-7.2-4.6-9.4-9C.7 8.1 2.7 4 6.8 4c2.1 0 3.8 1.2 5.2 3 1.4-1.8 3.1-3 5.2-3 4.1 0 6.1 4.1 4.2 8-2.2 4.4-9.4 9-9.4 9Z");
		svg.appendChild(path);
		return svg;
	}

	function closeModal(sessionOnly) {
		if (!modal) return;
		if (sessionOnly && currentUserId) markDismissed(currentUserId);
		document.removeEventListener("keydown", onKeyDown, true);
		document.removeEventListener("focusin", enforceFocus, true);
		var root = document.getElementById("root");
		if (root) {
			root.removeAttribute("aria-hidden");
			root.inert = false;
		}
		document.body.classList.remove("nyx-developer-message-open");
		var overlay = modal.closest(".nyx-developer-message-overlay");
		if (overlay) overlay.remove();
		else modal.remove();
		modal = null;
		if (previouslyFocused && previouslyFocused.isConnected && previouslyFocused.focus) previouslyFocused.focus();
		previouslyFocused = null;
	}

	function focusable() {
		return modal ? Array.from(modal.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')) : [];
	}

	function onKeyDown(event) {
		if (!modal) return;
		if (event.key === "Escape") {
			event.preventDefault();
			closeModal(true);
			return;
		}
		if (event.key !== "Tab") return;
		var items = focusable();
		if (!items.length) return;
		var first = items[0];
		var last = items[items.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function enforceFocus(event) {
		if (modal && !modal.contains(event.target)) {
			var items = focusable();
			(items[0] || modal).focus();
		}
	}

	function acknowledge(error, support) {
		error.hidden = true;
		support.setAttribute("aria-busy", "true");
		support.classList.add("nyx-developer-message-busy");
		fetch("/api/developer-message", {
			method: "POST",
			headers: { Authorization: "Bearer " + currentToken, Accept: "application/json" },
			credentials: "same-origin",
		})
			.then(function (response) {
				if (!response.ok) throw new Error("HTTP " + response.status);
				return response.json();
			})
			.then(function (result) {
				if (!result || result.acknowledged !== true) throw new Error("Invalid acknowledgement response");
				closeModal(false);
			})
			.catch(function () {
				error.textContent = "The support page opened, but acknowledgement could not be saved. Please try again.";
				error.hidden = false;
			})
			.finally(function () {
				support.removeAttribute("aria-busy");
				support.classList.remove("nyx-developer-message-busy");
			});
	}

	function showModal() {
		if (modal || !currentUserId || wasDismissed(currentUserId)) return;
		supportUrl = findSupportUrl();
		if (!supportUrl) return;

		previouslyFocused = document.activeElement;
		var overlay = document.createElement("div");
		overlay.className = "nyx-developer-message-overlay";
		overlay.addEventListener("mousedown", function (event) {
			if (event.target === overlay) closeModal(true);
		});

		var dialog = document.createElement("section");
		dialog.className = "nyx-developer-message";
		dialog.setAttribute("role", "dialog");
		dialog.setAttribute("aria-modal", "true");
		dialog.setAttribute("aria-labelledby", "nyx-developer-message-title");
		dialog.setAttribute("aria-describedby", "nyx-developer-message-lead nyx-developer-message-body");
		dialog.tabIndex = -1;

		var header = document.createElement("header");
		header.className = "nyx-developer-message-header";
		var brand = document.createElement("div");
		brand.className = "nyx-developer-message-brand";
		var mark = document.createElement("img");
		mark.src = "/images/logo-no-text.svg";
		mark.alt = "";
		mark.width = 34;
		mark.height = 34;
		var eyebrow = document.createElement("span");
		eyebrow.textContent = "NYXGUARD MANAGER";
		brand.append(mark, eyebrow);
		var close = button("nyx-developer-message-close", "×");
		close.setAttribute("aria-label", "Close developer message");
		close.addEventListener("click", function () { closeModal(true); });
		header.append(brand, close);

		var body = document.createElement("div");
		body.id = "nyx-developer-message-body";
		body.className = "nyx-developer-message-body";
		var title = document.createElement("h1");
		title.id = "nyx-developer-message-title";
		title.textContent = "A note from the developer";
		var lead = document.createElement("p");
		lead.id = "nyx-developer-message-lead";
		lead.className = "nyx-developer-message-lead";
		lead.textContent = "Built independently. Security that stays in your hands.";
		var copy = document.createElement("div");
		copy.className = "nyx-developer-message-copy";
		paragraphs.forEach(function (text) {
			var paragraph = document.createElement("p");
			paragraph.textContent = text;
			copy.appendChild(paragraph);
		});
		var signature = document.createElement("p");
		signature.className = "nyx-developer-message-signature";
		signature.textContent = "— Nyxmael";
		copy.appendChild(signature);
		body.append(title, lead, copy);

		var footer = document.createElement("footer");
		footer.className = "nyx-developer-message-footer";
		var reassurance = document.createElement("p");
		reassurance.textContent = "NyxGuard Manager remains fully usable whether you support the project or not.";
		var error = document.createElement("p");
		error.className = "nyx-developer-message-error";
		error.setAttribute("role", "alert");
		error.hidden = true;
		var actions = document.createElement("div");
		actions.className = "nyx-developer-message-actions";
		var continueButton = button("nyx-developer-message-continue", "Continue");
		continueButton.addEventListener("click", function () { closeModal(true); });
		var support = document.createElement("a");
		support.className = "nyx-developer-message-support";
		support.href = supportUrl;
		support.target = "_blank";
		support.rel = "noopener noreferrer";
		support.append(icon(), document.createTextNode("Support NyxGuard"));
		support.addEventListener("click", function () { acknowledge(error, support); });
		actions.append(continueButton, support);
		footer.append(reassurance, error, actions);

		dialog.append(header, body, footer);
		overlay.appendChild(dialog);
		document.body.appendChild(overlay);
		modal = dialog;
		var root = document.getElementById("root");
		if (root) {
			root.setAttribute("aria-hidden", "true");
			root.inert = true;
		}
		document.body.classList.add("nyx-developer-message-open");
		document.addEventListener("keydown", onKeyDown, true);
		document.addEventListener("focusin", enforceFocus, true);
		window.requestAnimationFrame(function () { close.focus(); });
	}

	function checkAcknowledgement(token, userId) {
		if (checkInFlight || checkedToken === token || wasDismissed(userId)) return;
		checkInFlight = true;
		checkedToken = token;
		fetch("/api/developer-message", {
			headers: { Authorization: "Bearer " + token, Accept: "application/json" },
			credentials: "same-origin",
		})
			.then(function (response) {
				if (!response.ok) throw new Error("HTTP " + response.status);
				return response.json();
			})
			.then(function (result) {
				if (token !== currentToken || !result || result.acknowledged !== false) return;
				showModal();
			})
			.catch(function () {
				if (checkedToken === token) checkedToken = "";
			})
			.finally(function () { checkInFlight = false; });
	}

	function tick() {
		var token = readAuthentication();
		if (!token) {
			if (currentToken) clearSessionDismissals();
			currentToken = "";
			currentUserId = 0;
			checkedToken = "";
			if (modal) closeModal(false);
			return;
		}
		var decoded = decodeToken(token);
		if (!decoded.id) return;
		currentToken = token;
		currentUserId = decoded.id;
		if (wasDismissed(decoded.id)) return;
		if (!document.documentElement.hasAttribute("data-nyx-user-ready") || !findSupportUrl()) return;
		checkAcknowledgement(token, decoded.id);
	}

	window.setInterval(tick, CHECK_INTERVAL_MS);
	window.addEventListener("storage", tick);
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tick, { once: true });
	else tick();
})();
