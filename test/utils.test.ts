import assert from "node:assert";
import os from "node:os";
import path from "node:path";

import { validateOutputPath, validateFileExtension } from "../src/utils";

// Mirror of the extension contracts enforced in src/server.ts. These are passed
// explicitly into validateFileExtension(), which is orthogonal to the directory
// policy under test here.
const ALLOWED_SCREENSHOT_EXTENSIONS = [".png", ".jpg", ".jpeg"];
const ALLOWED_RECORDING_EXTENSIONS = [".mp4"];

const ENV_KEY = "MOBILE_MCP_ALLOWED_ROOTS";

// The fleet user-temp convention — deliberately OUTSIDE the legacy allowlist
// (os.tmpdir() + process.cwd()). Under the relaxed default policy a trusted
// operator must be able to write here.
const FLEET_TEMP_SHOT = "C:\\INFRAGENS\\infragens\\003_PHYSICAL\\001_user\\009_temp\\coagent\\shot.png";

describe("utils", () => {

	describe("validateOutputPath (relaxed directory policy)", () => {

		let savedEnv: string | undefined;

		beforeEach(() => {
			savedEnv = process.env[ENV_KEY];
			delete process.env[ENV_KEY];
		});

		afterEach(() => {
			if (savedEnv === undefined) {
				delete process.env[ENV_KEY];
			} else {
				process.env[ENV_KEY] = savedEnv;
			}
		});

		it("does NOT throw for a path outside the previously-allowed roots (permissive default)", () => {
			// No MOBILE_MCP_ALLOWED_ROOTS configured => no directory allowlist.
			assert.doesNotThrow(() => validateOutputPath(FLEET_TEMP_SHOT));
		});

		it("does NOT throw for an arbitrary absolute path far from tmpdir/cwd", () => {
			const target = path.join(os.homedir(), "some", "unlisted", "place", "shot.png");
			assert.doesNotThrow(() => validateOutputPath(target));
		});

		it("treats an empty / whitespace-only MOBILE_MCP_ALLOWED_ROOTS as no restriction", () => {
			process.env[ENV_KEY] = "   ";
			assert.doesNotThrow(() => validateOutputPath(FLEET_TEMP_SHOT));
		});

		it("re-imposes the restriction when MOBILE_MCP_ALLOWED_ROOTS is set: path OUTSIDE configured roots throws", () => {
			const allowedRoot = path.join(os.tmpdir(), "mobile-mcp-allowed");
			process.env[ENV_KEY] = allowedRoot;

			// FLEET_TEMP_SHOT is not under allowedRoot => must throw.
			assert.throws(
				() => validateOutputPath(FLEET_TEMP_SHOT),
				/not in the list of allowed directories/i
			);
		});

		it("re-imposes the restriction when MOBILE_MCP_ALLOWED_ROOTS is set: path INSIDE configured roots passes", () => {
			const allowedRoot = path.join(os.tmpdir(), "mobile-mcp-allowed");
			process.env[ENV_KEY] = allowedRoot;

			const inside = path.join(allowedRoot, "shot.png");
			assert.doesNotThrow(() => validateOutputPath(inside));
		});

		it("honors a multi-root MOBILE_MCP_ALLOWED_ROOTS list (platform-delimited)", () => {
			const rootA = path.join(os.tmpdir(), "roots-a");
			const rootB = path.join(os.tmpdir(), "roots-b");
			process.env[ENV_KEY] = [rootA, rootB].join(path.delimiter);

			assert.doesNotThrow(() => validateOutputPath(path.join(rootB, "shot.png")));
			assert.throws(
				() => validateOutputPath(FLEET_TEMP_SHOT),
				/not in the list of allowed directories/i
			);
		});
	});

	describe("validateFileExtension (type-safety preserved)", () => {

		it("throws for a disallowed screenshot extension (.txt)", () => {
			assert.throws(
				() => validateFileExtension("shot.txt", ALLOWED_SCREENSHOT_EXTENSIONS, "save_screenshot"),
				/requires a .* file extension/i
			);
		});

		it("accepts allowed screenshot extensions (.png/.jpg/.jpeg)", () => {
			assert.doesNotThrow(() => validateFileExtension("shot.png", ALLOWED_SCREENSHOT_EXTENSIONS, "save_screenshot"));
			assert.doesNotThrow(() => validateFileExtension("shot.JPG", ALLOWED_SCREENSHOT_EXTENSIONS, "save_screenshot"));
			assert.doesNotThrow(() => validateFileExtension("shot.jpeg", ALLOWED_SCREENSHOT_EXTENSIONS, "save_screenshot"));
		});

		it("throws for a disallowed recording extension (.txt) and accepts .mp4", () => {
			assert.throws(
				() => validateFileExtension("rec.txt", ALLOWED_RECORDING_EXTENSIONS, "start_screen_recording"),
				/requires a .* file extension/i
			);
			assert.doesNotThrow(() => validateFileExtension("rec.mp4", ALLOWED_RECORDING_EXTENSIONS, "start_screen_recording"));
		});
	});
});
