# Final integration corrections

Task 3 preserves the accepted Event Center, audit, lifecycle, migration and performance implementation. Sidebar density is documented in the Task 2 overlay. The shared WAF PARTIAL class now uses intrinsic width and 8px horizontal padding; font, semantic colors and ON/OFF badges are unchanged.

Authenticated failure injection exposed two inherited integration defects. GlobalGate rendered its loading branch indefinitely after a settings failure. Web Controls rendered default policy controls and an empty event history before a policy loaded, and treated analytics/event failures as zero counts. The asserted asset patch adds initial loading/error/retry branches and separate analytics/event failures. Successful page composition and backend protection state are unchanged. All React hooks still execute before conditional returns.

The patch validates both inherited assets before writing either. `tests/patch-contract.test.mjs` runs in the accepted pre-patch application image; `tests/browser_states.py` runs against the deployed candidate with controlled browser-only responses. Keep authentication, screenshots and output outside tracked source. These fixtures never alter server protection settings or application history.
