declare module "*.md";

// CSS modules (Vite + TypeScript)
declare module "*.module.css" {
	const classes: Record<string, string>;
	export default classes;
}

declare module "*.module.scss" {
	const classes: Record<string, string>;
	export default classes;
}

// Some deps don't ship types in all environments (e.g. when dev deps are pruned).
declare module "humps";
