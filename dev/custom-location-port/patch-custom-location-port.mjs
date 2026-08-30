import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const moduleScriptPattern = /<script\s+type="module"\s+crossorigin\s+src="([^"]+\.js)"/;
const customLocationPortHandlerPattern =
	/onChange:([$A-Z_a-z][$\w]*)=>([$A-Z_a-z][$\w]*)\(([$A-Z_a-z][$\w]*),"forwardPort",\1\.target\.value\)/g;

export function patchCustomLocationPortHandler(source) {
	let replacements = 0;
	const output = source.replace(
		customLocationPortHandlerPattern,
		(_, eventName, changeHandler, locationIndex) => {
			replacements += 1;
			return `onChange:${eventName}=>${changeHandler}(${locationIndex},"forwardPort",${eventName}.target.valueAsNumber)`;
		},
	);

	if (replacements !== 1) {
		throw new Error(`Expected exactly one Custom Location Forward Port handler, found ${replacements}`);
	}

	return output;
}

export function resolveActiveBundle(frontendRoot) {
	const indexPath = path.join(frontendRoot, "index.html");
	const index = fs.readFileSync(indexPath, "utf8");
	const match = index.match(moduleScriptPattern);
	if (!match) {
		throw new Error(`Unable to identify the active frontend module in ${indexPath}`);
	}

	const relativeBundlePath = match[1].replace(/^\//, "");
	const bundlePath = path.join(frontendRoot, relativeBundlePath.replace(/^assets\//, "assets/"));
	if (!fs.existsSync(bundlePath)) {
		throw new Error(`Active frontend bundle does not exist: ${bundlePath}`);
	}
	return bundlePath;
}

export function patchFrontend(frontendRoot) {
	const bundlePath = resolveActiveBundle(frontendRoot);
	const source = fs.readFileSync(bundlePath, "utf8");

	if (!source.includes('placeholder:"eg: 10.0.0.1/path/"')) {
		throw new Error("The pinned Custom Location component marker is missing");
	}

	const output = patchCustomLocationPortHandler(source);
	fs.writeFileSync(bundlePath, output, "utf8");
	return bundlePath;
}

export function patchDuplicateAbsoluteRedirect(appRoot) {
	const templatePath = path.join(appRoot, "templates/proxy_host.conf");
	const template = fs.readFileSync(templatePath, "utf8");
	const directive = "  absolute_redirect off;\n";

	if (template.split(directive).length - 1 !== 1) {
		throw new Error("Expected exactly one absolute_redirect directive in the Proxy Host template");
	}

	fs.writeFileSync(templatePath, template.replace(directive, ""), "utf8");
	return templatePath;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const frontendRoot = process.argv[2] || "/app/frontend";
	console.log(`Patched ${patchFrontend(frontendRoot)}`);
	console.log(`Patched ${patchDuplicateAbsoluteRedirect("/app")}`);
}
