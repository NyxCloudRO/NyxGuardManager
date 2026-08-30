import assert from "node:assert/strict";
import fs from "node:fs";
import apiValidator from "/app/lib/validator/api.js";
import { getCompiledSchema, getValidationSchema } from "/app/schema/index.js";
import {
	patchCustomLocationPortHandler,
	resolveActiveBundle,
} from "./patch-custom-location-port.mjs";

const sampleHandler = 'onChange:T=>m(A,"forwardPort",T.target.value)';
const patchedHandler = patchCustomLocationPortHandler(sampleHandler);
assert.equal(patchedHandler, 'onChange:T=>m(A,"forwardPort",T.target.valueAsNumber)');

const simulateChange = (existingLocations, index, valueAsNumber) =>
	existingLocations.map((location, currentIndex) =>
		currentIndex === index ? { ...location, forwardPort: valueAsNumber } : location,
	);

const existingLocation = {
	path: "/existing",
	advancedConfig: "",
	forwardScheme: "http",
	forwardHost: "192.0.2.10",
	forwardPort: 8080,
};
const newLocation = {
	path: "/",
	advancedConfig: "",
	forwardScheme: "https",
	forwardHost: "192.0.2.20/status",
	forwardPort: 80,
};
const editedLocations = simulateChange([existingLocation, newLocation], 1, 443);
assert.equal(editedLocations[0].forwardPort, 8080, "existing location must remain numeric and unchanged");
assert.equal(editedLocations[1].forwardPort, 443, "edited port must become a number");
assert.equal(typeof editedLocations[1].forwardPort, "number");
assert.match(JSON.stringify({ locations: editedLocations }), /"forwardPort":443/);

await getCompiledSchema();
const createSchema = getValidationSchema("/nginx/proxy-hosts", "post");
const updateSchema = getValidationSchema("/nginx/proxy-hosts/{hostID}", "put");
assert.ok(createSchema, "create schema must be available");
assert.ok(updateSchema, "update schema must be available");

const basePayload = {
	domain_names: ["custom-location-port.dev.invalid"],
	forward_scheme: "http",
	forward_host: "192.0.2.1",
	forward_port: 8080,
};
const locationForPort = (forwardPort, index = 0) => ({
	path: index === 0 ? "/" : `/location-${index}`,
	advanced_config: "",
	forward_scheme: "https",
	forward_host: "192.0.2.20/status",
	forward_port: forwardPort,
});

for (const port of [1, 80, 443, 8080, 8443, 65535]) {
	await apiValidator(createSchema, { ...basePayload, locations: [locationForPort(port)] });
	await apiValidator(updateSchema, { locations: [locationForPort(port)] });
}

for (const invalidPort of ["", "443", "abc", -1, 0, 1.5, 65536, null]) {
	await assert.rejects(
		apiValidator(updateSchema, { locations: [locationForPort(invalidPort)] }),
		undefined,
		`backend must reject invalid port ${JSON.stringify(invalidPort)}`,
	);
}

const multipleLocations = [locationForPort(80), locationForPort(443, 1), locationForPort(8443, 2)];
await apiValidator(createSchema, { ...basePayload, locations: multipleLocations });
await apiValidator(updateSchema, { locations: multipleLocations });

// The main Proxy Host port contract and payload are deliberately untouched.
const validatedBase = await apiValidator(createSchema, { ...basePayload, locations: [] });
assert.equal(validatedBase.forward_port, 8080);
assert.equal(typeof validatedBase.forward_port, "number");

if (process.argv[2]) {
	const activeBundle = resolveActiveBundle(process.argv[2]);
	const activeSource = fs.readFileSync(activeBundle, "utf8");
	assert.ok(activeSource.includes('.target.valueAsNumber)'), "active bundle must contain numeric normalization");
	assert.ok(
		!activeSource.includes('"forwardPort",T.target.value)'),
		"active bundle must not retain the known string-valued handler",
	);
	const proxyHostTemplate = fs.readFileSync("/app/templates/proxy_host.conf", "utf8");
	assert.ok(!/^\s+absolute_redirect off;$/m.test(proxyHostTemplate), "template duplicate must be removed");
}

console.log("Custom Location Forward Port regression tests passed");
