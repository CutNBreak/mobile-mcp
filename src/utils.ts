import path from "node:path";
import fs from "node:fs";
import { ActionableError } from "./robot";

export function validatePackageName(packageName: string): void {
	if (!/^[a-zA-Z0-9._]+$/.test(packageName)) {
		throw new ActionableError(`Invalid package name: "${packageName}"`);
	}
}

export function validateLocale(locale: string): void {
	if (!/^[a-zA-Z0-9,\- ]+$/.test(locale)) {
		throw new ActionableError(`Invalid locale: "${locale}"`);
	}
}

/**
 * Resolve the optional, operator-configured directory allowlist.
 *
 * Policy (inverted from the upstream default): by default there is NO directory
 * allowlist — coagent runs as a trusted full-admin operator and may write to any
 * path the host process can write to. A restriction is OPT-IN via the
 * MOBILE_MCP_ALLOWED_ROOTS environment variable, a platform-delimited list of
 * directories (";"-separated on Windows, ":"-separated on POSIX, per path.delimiter).
 *
 * Returns the resolved root list when a restriction is configured, or null when
 * no restriction is in force (the permissive default).
 */
function resolveConfiguredRoots(): string[] | null {
	const configured = process.env.MOBILE_MCP_ALLOWED_ROOTS;
	if (configured === undefined) {
		return null;
	}

	const roots = configured
		.split(path.delimiter)
		.map(r => r.trim())
		.filter(r => r.length > 0)
		.map(r => path.resolve(r));

	return roots.length > 0 ? roots : null;
}

function isPathUnderRoot(filePath: string, root: string): boolean {
	const relative = path.relative(root, filePath);
	if (relative === "") {
		return false;
	}

	if (path.isAbsolute(relative)) {
		return false;
	}

	if (relative.startsWith("..")) {
		return false;
	}

	return true;
}

export function validateFileExtension(filePath: string, allowedExtensions: string[], toolName: string): void {
	const ext = path.extname(filePath).toLowerCase();
	if (!allowedExtensions.includes(ext)) {
		throw new ActionableError(`${toolName} requires a ${allowedExtensions.join(", ")} file extension, got: "${ext || "(none)"}"`);
	}
}

function resolveWithSymlinks(filePath: string): string {
	const resolved = path.resolve(filePath);
	const dir = path.dirname(resolved);
	const filename = path.basename(resolved);

	try {
		return path.join(fs.realpathSync(dir), filename);
	} catch {
		return resolved;
	}
}

export function validateOutputPath(filePath: string): void {
	// Resolve symlinks first. This is a genuine safety property — it prevents a
	// symlinked directory from escaping an explicitly-configured allow-root — and
	// is preserved regardless of whether a root restriction is currently in force.
	const resolved = resolveWithSymlinks(filePath);

	// Default policy: NO directory allowlist. A trusted operator may write to any
	// path the host process itself can write to. A directory restriction is opt-in
	// via MOBILE_MCP_ALLOWED_ROOTS. This inverts the legacy default from
	// "deny-unless-listed" to "allow-unless-explicitly-restricted".
	const configuredRoots = resolveConfiguredRoots();
	if (configuredRoots === null) {
		return;
	}

	const isWindows = process.platform === "win32";

	const isAllowed = configuredRoots.some(root => {
		if (isWindows) {
			return isPathUnderRoot(resolved.toLowerCase(), root.toLowerCase());
		}

		return isPathUnderRoot(resolved, root);
	});

	if (!isAllowed) {
		const dir = path.dirname(resolved);
		throw new ActionableError(
			`"${dir}" is not in the list of allowed directories configured via MOBILE_MCP_ALLOWED_ROOTS.`
		);
	}
}
