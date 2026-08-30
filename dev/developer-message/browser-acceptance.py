#!/usr/bin/env python3
"""Focused real-browser acceptance for the DEV-only Developer Message."""

import json
import subprocess
import time

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as expected
from selenium.webdriver.support.ui import WebDriverWait

APP_URL = "https://127.0.0.1:8443/"
CONTAINER = "nyxguard-manager"


def container_node(*arguments):
	return subprocess.run(
		["docker", "exec", CONTAINER, "node", "/app/dev-tests/developer-message-acceptance-fixture.mjs", *arguments],
		check=True,
		capture_output=True,
		text=True,
	).stdout


def make_driver():
	options = Options()
	options.binary_location = "/usr/bin/chromium-browser"
	for argument in (
		"--headless=new",
		"--no-sandbox",
		"--disable-dev-shm-usage",
		"--ignore-certificate-errors",
		"--window-size=1366,768",
	):
		options.add_argument(argument)
	options.set_capability("goog:loggingPrefs", {"browser": "ALL", "performance": "ALL"})
	return webdriver.Chrome(service=Service("/usr/bin/chromedriver"), options=options)


def run():
	fixture_output = container_node("--create")
	fixture = json.loads(fixture_output.strip().splitlines()[-1])
	driver = make_driver()
	wait = WebDriverWait(driver, 20)
	results = {}

	def modal_visible():
		return any(element.is_displayed() for element in driver.find_elements(By.CSS_SELECTOR, ".nyx-developer-message"))

	def login(user, expect_message=True):
		if not driver.find_elements(By.CSS_SELECTOR, 'input[type="email"]'):
			driver.get(APP_URL)
		email = wait.until(expected.visibility_of_element_located((By.CSS_SELECTOR, 'input[type="email"]')))
		email.clear()
		email.send_keys(user["email"])
		driver.find_element(By.CSS_SELECTOR, 'input[type="password"]').send_keys(user["password"])
		driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]').click()
		wait.until(expected.presence_of_element_located((By.CSS_SELECTOR, '[aria-label="Open user menu"]')))
		if expect_message:
			wait.until(expected.visibility_of_element_located((By.CSS_SELECTOR, ".nyx-developer-message")))
		else:
			time.sleep(2)
			assert not modal_visible(), "acknowledged user received the automatic message"

	def logout():
		assert not modal_visible(), "dismiss the message before logout"
		wait.until(expected.element_to_be_clickable((By.CSS_SELECTOR, '[aria-label="Open user menu"]'))).click()
		wait.until(expected.element_to_be_clickable((By.XPATH, "//a[normalize-space()='Logout']"))).click()
		wait.until(expected.visibility_of_element_located((By.CSS_SELECTOR, 'input[type="email"]')))
		time.sleep(0.35)

	def dismiss(selector):
		wait.until(expected.element_to_be_clickable((By.CSS_SELECTOR, selector))).click()
		wait.until(expected.invisibility_of_element_located((By.CSS_SELECTOR, ".nyx-developer-message-overlay")))
		assert not driver.find_elements(By.CSS_SELECTOR, ".nyx-developer-message-overlay")

	def check_layout(label, width, height):
		driver.set_window_size(width, height)
		time.sleep(0.25)
		metrics = driver.execute_script(
			"""
			const dialog = document.querySelector('.nyx-developer-message');
			const footer = document.querySelector('.nyx-developer-message-footer');
			const rect = dialog.getBoundingClientRect();
			const footerRect = footer.getBoundingClientRect();
			return { innerWidth, innerHeight,
				documentWidth: document.documentElement.scrollWidth,
				bodyWidth: document.body.scrollWidth,
				left: rect.left, right: rect.right, bottom: rect.bottom,
				footerBottom: footerRect.bottom,
				modalScrollWidth: dialog.scrollWidth,
				modalClientWidth: dialog.clientWidth,
				bodyOverflow: getComputedStyle(document.body).overflow };
			"""
		)
		assert metrics["documentWidth"] <= metrics["innerWidth"]
		assert metrics["bodyWidth"] <= metrics["innerWidth"]
		assert metrics["left"] >= 0 and metrics["right"] <= metrics["innerWidth"] + 0.5
		assert metrics["bottom"] <= metrics["innerHeight"] + 0.5
		assert metrics["footerBottom"] <= metrics["innerHeight"] + 0.5
		assert metrics["modalScrollWidth"] <= metrics["modalClientWidth"] + 1
		assert metrics["bodyOverflow"] == "hidden"
		driver.save_screenshot(f"/tmp/nyx-developer-message-{label}.png")
		return metrics

	try:
		driver.get(APP_URL)
		login(fixture["first"])
		dialog = driver.find_element(By.CSS_SELECTOR, ".nyx-developer-message")
		brand_logo = dialog.find_element(By.CSS_SELECTOR, ".nyx-developer-message-brand img")
		canonical_logo = driver.find_element(By.CSS_SELECTOR, 'link[rel="icon"][type="image/svg+xml"]')
		assert brand_logo.get_attribute("src").split("?", 1)[0] == canonical_logo.get_attribute("href").split("?", 1)[0]
		logo_metrics = driver.execute_script(
			"return {complete: arguments[0].complete, naturalWidth: arguments[0].naturalWidth, "
			"naturalHeight: arguments[0].naturalHeight, width: arguments[0].getBoundingClientRect().width, "
			"height: arguments[0].getBoundingClientRect().height};",
			brand_logo,
		)
		assert logo_metrics["complete"] is True
		assert logo_metrics["naturalWidth"] > 0
		assert logo_metrics["naturalWidth"] == logo_metrics["naturalHeight"]
		assert logo_metrics["width"] == 34 and logo_metrics["height"] == 34
		assert not dialog.find_elements(By.CSS_SELECTOR, 'img[src*="logo-no-text.svg"]')
		results["canonical_branding"] = logo_metrics
		for approved_text in (
			"A note from the developer",
			"Built independently. Security that stays in your hands.",
			"Support is completely optional.",
			"— Nyxmael",
			"NyxGuard Manager remains fully usable whether you support the project or not.",
		):
			assert approved_text in dialog.text
		assert dialog.get_attribute("role") == "dialog"
		assert dialog.get_attribute("aria-modal") == "true"
		assert driver.switch_to.active_element.get_attribute("aria-label") == "Close developer message"

		ActionChains(driver).key_down(Keys.SHIFT).send_keys(Keys.TAB).key_up(Keys.SHIFT).perform()
		assert "nyx-developer-message-support" in driver.switch_to.active_element.get_attribute("class")
		ActionChains(driver).send_keys(Keys.TAB).perform()
		assert driver.switch_to.active_element.get_attribute("aria-label") == "Close developer message"

		results["desktop"] = check_layout("1920x1080", 1920, 1080)
		results["constrained"] = check_layout("1366x768", 1366, 768)
		results["mobile"] = check_layout("390x844", 390, 844)
		driver.set_window_size(1366, 768)

		dismiss(".nyx-developer-message-continue")
		driver.refresh()
		wait.until(expected.presence_of_element_located((By.CSS_SELECTOR, '[aria-label="Open user menu"]')))
		time.sleep(1.2)
		assert not modal_visible(), "refresh repeated a session-dismissed message"
		results["continue_and_refresh"] = "passed"

		logout()
		login(fixture["first"])
		dismiss('[aria-label="Close developer message"]')
		logout()
		login(fixture["first"])
		ActionChains(driver).send_keys(Keys.ESCAPE).perform()
		wait.until(expected.invisibility_of_element_located((By.CSS_SELECTOR, ".nyx-developer-message-overlay")))
		assert not driver.find_elements(By.CSS_SELECTOR, ".nyx-developer-message-overlay")
		results["close_and_escape"] = "passed"

		logout()
		login(fixture["first"])
		original_window = driver.current_window_handle
		windows_before = set(driver.window_handles)
		support = wait.until(expected.element_to_be_clickable((By.CSS_SELECTOR, ".nyx-developer-message-support")))
		assert support.get_attribute("href").rstrip("/") == "https://buymeacoffee.com/nyxmael"
		assert support.get_attribute("target") == "_blank"
		assert {"noopener", "noreferrer"}.issubset(set(support.get_attribute("rel").split()))
		support.click()
		wait.until(lambda _: not modal_visible())
		wait.until(lambda _: len(set(driver.window_handles) - windows_before) == 1)
		new_window = (set(driver.window_handles) - windows_before).pop()
		driver.switch_to.window(new_window)
		time.sleep(0.5)
		assert driver.current_url.startswith("https://buymeacoffee.com/nyxmael")
		driver.close()
		driver.switch_to.window(original_window)

		logout()
		login(fixture["first"], expect_message=False)
		sidebar_support = wait.until(expected.presence_of_element_located((By.CSS_SELECTOR, "a.prefs-action-support")))
		assert sidebar_support.text.strip() == "Support NyxGuard"
		assert sidebar_support.get_attribute("href").rstrip("/") == "https://buymeacoffee.com/nyxmael"
		results["permanent_acknowledgement_and_sidebar"] = "passed"

		logout()
		login(fixture["second"])
		dismiss(".nyx-developer-message-continue")
		results["second_user_isolation"] = "passed"

		severe = [entry for entry in driver.get_log("browser") if entry.get("level") == "SEVERE"]
		assert not severe, severe
		results["severe_console_errors"] = 0
		print(json.dumps(results, indent=2, sort_keys=True))
	finally:
		driver.quit()
		container_node("--cleanup")


if __name__ == "__main__":
	run()
