/**
 * flint Extension for Pi
 * 
 * Exposes flint local SQLite operations as native Pi tools.
 * Calls the flint CLI binary and handles text output directly.
 */

import type { ExtensionAPI, AgentToolResult } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { spawn } from "node:child_process";
import { Text } from "@earendil-works/pi-tui";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

function resolveFlintBin(): string {
  const env = process.env.FLINT_BIN;
  if (env && existsSync(env)) return env;
  const local = join(homedir(), ".local", "bin", "flint");
  if (existsSync(local)) return local;
  const system = "/opt/flint/flint";
  if (existsSync(system)) return system;
  return "flint";
}

const FLINT_BIN = resolveFlintBin();

interface FlintResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runFlint(
  args: string[],
  cwd: string,
): Promise<FlintResult> {
  return new Promise((resolve) => {
    const proc = spawn(FLINT_BIN, args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      resolve({
        ok: (code ?? 1) === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 1,
      });
    });
    proc.on("error", () => {
      resolve({ ok: false, stdout: "", stderr: `${FLINT_BIN} not found or failed`, exitCode: 1 });
    });
  });
}

function makeErrorResult(message: string): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text: `flint error: ${message}` }],
    details: { ok: false, error: message },
    isError: true,
  };
}

export default function (pi: ExtensionAPI) {
  // ── local_save ──────────────────────────────────────────────
  pi.registerTool({
    name: "local_save",
    label: "flint Save",
    description: [
      "Save a note to flint local SQLite store.",
      "Use this to persist discoveries, decisions, bugs, session state, or preferences.",
      "content is required. title, topic_key, scope, type are optional but recommended.",
      "topic_key should be hierarchical: area/sub-area/asunto",
      "type values: decision, discovery, bug, session-state, research, architecture",
    ].join(" "),
    parameters: Type.Object({
      content: Type.String({ description: "The note content (required)" }),
      title: Type.Optional(Type.String({ description: "Short descriptive title" })),
      topic_key: Type.Optional(Type.String({ description: "Hierarchical key, e.g. sdd/my-change/spec" })),
      scope: Type.Optional(Type.String({ description: "Project or user scope identifier" })),
      type: Type.Optional(Type.String({ description: "Note type: decision, discovery, bug, session-state, research, architecture" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!params.content || params.content.trim().length === 0) {
        return makeErrorResult("content is required and cannot be empty");
      }
      const args = ["save", params.content];
      if (params.title) args.push("--title", params.title);
      if (params.topic_key) args.push("--topic-key", params.topic_key);
      if (params.scope) args.push("--scope", params.scope);
      if (params.type) args.push("--type", params.type);
      const result = await runFlint(args, ctx.cwd);
      if (!result.ok) {
        return makeErrorResult(result.stderr || result.stdout);
      }
      return {
        content: [{ type: "text", text: result.stdout }],
        details: { ok: true, raw: result.stdout },
      };
    },
    renderCall(args, theme) {
      const title = args.title || "(untitled)";
      const preview = args.content.length > 60 ? args.content.slice(0, 60) + "..." : args.content;
      return new Text(
         theme.fg("toolTitle", "local_save ") +
        theme.fg("accent", title) +
        "\n  " + theme.fg("dim", preview),
        0, 0,
      );
    },
  });

  // ── local_recall ────────────────────────────────────────────
  pi.registerTool({
    name: "local_recall",
    label: "flint Recall",
    description: [
      "Search notes in flint local SQLite by text query.",
      "Returns matching notes sorted by relevance.",
      "Use this to recover prior context before acting.",
      "NOTE: all_projects=true by default to search across all projects.",
    ].join(" "),
    parameters: Type.Object({
      query: Type.String({ description: "Search query text" }),
      limit: Type.Optional(Type.Number({ description: "Max results (default 5)" })),
      type: Type.Optional(Type.String({ description: "Filter by note type" })),
      since: Type.Optional(Type.String({ description: "Filter notes since date (YYYY-MM-DD)" })),
      until: Type.Optional(Type.String({ description: "Filter notes until date (YYYY-MM-DD)" })),
      all_projects: Type.Optional(Type.Boolean({ description: "Search across all projects (default: true)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const args = ["recall", params.query];
      if (params.limit) args.push(String(params.limit));
      if (params.type) args.push("--type", params.type);
      if (params.since) args.push("--since", params.since);
      if (params.until) args.push("--until", params.until);
      // Default to all_projects=true unless explicitly set to false
      if (params.all_projects !== false) args.push("--all-projects");
      const result = await runFlint(args, ctx.cwd);
      if (!result.ok) {
        return makeErrorResult(result.stderr || result.stdout);
      }
      if (!result.stdout || result.stdout === "no results") {
        return {
          content: [{ type: "text", text: "No notes found matching query." }],
          details: { ok: true, count: 0 },
        };
      }
      return {
        content: [{ type: "text", text: result.stdout }],
        details: { ok: true, raw: result.stdout },
      };
    },
    renderCall(args, theme) {
      return new Text(
         theme.fg("toolTitle", "local_recall ") +
        theme.fg("accent", `"${args.query}"`),
        0, 0,
      );
    },
  });

  // ── local_get ───────────────────────────────────────────────
  pi.registerTool({
    name: "local_get",
    label: "flint Get",
    description: [
      "Get a single note by its numeric ID.",
      "Use after recall to read the full content of a specific note.",
    ].join(" "),
    parameters: Type.Object({
      id: Type.Number({ description: "Note ID (numeric)" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await runFlint(["get", String(Math.floor(params.id))], ctx.cwd);
      if (!result.ok) {
        return makeErrorResult(result.stderr || result.stdout);
      }
      if (!result.stdout || result.stdout.startsWith("note ")) {
        return {
          content: [{ type: "text", text: `Note ${params.id} not found.` }],
          details: { ok: true, found: false },
        };
      }
      return {
        content: [{ type: "text", text: result.stdout }],
        details: { ok: true, found: true },
      };
    },
    renderCall(args, theme) {
      return new Text(
         theme.fg("toolTitle", "local_get ") +
        theme.fg("accent", `#${args.id}`),
        0, 0,
      );
    },
  });

  // ── local_list ──────────────────────────────────────────────
  pi.registerTool({
    name: "local_list",
    label: "flint List",
    description: [
      "List recent notes from flint local SQLite.",
      "Use to browse recent context without a specific query.",
      "NOTE: all_projects=true by default to show notes from all projects.",
    ].join(" "),
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Max results (default 10)" })),
      all_projects: Type.Optional(Type.Boolean({ description: "Include notes from all projects (default: true)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const args = ["list"];
      if (params.limit) args.push(String(params.limit));
      // Default to all_projects=true unless explicitly set to false
      if (params.all_projects !== false) args.push("--all-projects");
      const result = await runFlint(args, ctx.cwd);
      if (!result.ok) {
        return makeErrorResult(result.stderr || result.stdout);
      }
      if (!result.stdout || result.stdout === "no results") {
        return {
          content: [{ type: "text", text: "No recent notes found." }],
          details: { ok: true, count: 0 },
        };
      }
      return {
        content: [{ type: "text", text: result.stdout }],
        details: { ok: true, raw: result.stdout },
      };
    },
    renderCall(args, theme) {
      const limit = args.limit ?? 10;
      return new Text(
         theme.fg("toolTitle", "local_list ") +
        theme.fg("dim", `(limit: ${limit})`),
        0, 0,
      );
    },
  });
}
