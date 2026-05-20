/**
 * flint Extension for Pi
 * 
 * Exposes flint local SQLite operations as native Pi tools.
 */

import type { ExtensionAPI, AgentToolResult } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { spawn } from "node:child_process";
import { Text } from "@earendil-works/pi-tui";

function resolveFlintBin(): string {
  const env = process.env.FLINT_BIN;
  if (env) return env;
  try {
    const which = require("child_process").execSync("which flint 2>/dev/null").toString().trim();
    if (which) return which;
  } catch {}
  return "/opt/flint/flint"; // fallback
}

const FLINT_BIN = resolveFlintBin();

interface FlintResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  parsed?: unknown;
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
      let parsed: unknown;
      try {
        parsed = JSON.parse(stdout.trim());
      } catch {
        // not JSON
      }
      resolve({
        ok: (code ?? 1) === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 1,
        parsed,
      });
    });

    proc.on("error", () => {
      resolve({ ok: false, stdout: "", stderr: FLINT_BIN + " not found or failed", exitCode: 1 });
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
  // ── flint_save ──────────────────────────────────────────────
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
      const id = typeof result.parsed === "object" && result.parsed !== null && "id" in result.parsed
        ? (result.parsed as Record<string, unknown>).id
        : "unknown";
      return {
        content: [{ type: "text", text: `Note saved (id: ${id}).\n${result.stdout}` }],
        details: { ok: true, id, raw: result.parsed },
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

  // ── flint_recall ────────────────────────────────────────────
  pi.registerTool({
    name: "local_recall",
    label: "flint Recall",
    description: [
      "Search notes in flint local SQLite by text query.",
      "Returns matching notes sorted by relevance.",
      "Use this to recover prior context before acting.",
      "Set all_projects=true to search across all projects (ignores current directory context).",
    ].join(" "),
    parameters: Type.Object({
      query: Type.String({ description: "Search query text" }),
      limit: Type.Optional(Type.Number({ description: "Max results (default 5)" })),
      type: Type.Optional(Type.String({ description: "Filter by note type" })),
      since: Type.Optional(Type.String({ description: "Filter notes since date (YYYY-MM-DD)" })),
      until: Type.Optional(Type.String({ description: "Filter notes until date (YYYY-MM-DD)" })),
      all_projects: Type.Optional(Type.Boolean({ description: "Search across all projects (default: false)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const args = ["recall", params.query];
      if (params.limit) args.push(String(params.limit));
      if (params.type) args.push("--type", params.type);
      if (params.since) args.push("--since", params.since);
      if (params.until) args.push("--until", params.until);
      if (params.all_projects) args.push("--all-projects");

      const result = await runFlint(args, ctx.cwd);
      if (!result.ok) {
        return makeErrorResult(result.stderr || result.stdout);
      }
      const notes = Array.isArray(result.parsed) ? result.parsed : [];
      if (notes.length === 0) {
        return {
          content: [{ type: "text", text: "No notes found matching query." }],
          details: { ok: true, count: 0 },
        };
      }
      const formatted = (notes as Array<Record<string, unknown>>).map((n) => {
        const id = n.id ?? "?";
        const title = n.title ?? "(no title)";
        const topicKey = n.topic_key ?? "";
        const content = (n.content ?? "").toString().slice(0, 300);
        return `## [${id}] ${title}\n**topic_key:** ${topicKey}\n${content}`;
      }).join("\n\n---\n\n");
      return {
        content: [{ type: "text", text: `Found ${notes.length} note(s):\n\n${formatted}` }],
        details: { ok: true, count: notes.length, ids: notes.map((n) => n.id) },
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

  // ── flint_get ───────────────────────────────────────────────
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
      const note = result.parsed as Record<string, unknown> | null;
      if (!note || Object.keys(note).length === 0) {
        return {
          content: [{ type: "text", text: `Note ${params.id} not found.` }],
          details: { ok: true, found: false },
        };
      }
      const title = note.title ?? "(no title)";
      const topicKey = note.topic_key ?? "";
      const content = (note.content ?? "").toString();
      const text = `# [${params.id}] ${title}\n**topic_key:** ${topicKey}\n**created:** ${note.created_at ?? ""}\n**updated:** ${note.updated_at ?? ""}\n\n${content}`;
      return {
        content: [{ type: "text", text }],
        details: { ok: true, found: true, note },
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

  // ── flint_list ──────────────────────────────────────────────
  pi.registerTool({
    name: "local_list",
    label: "flint List",
    description: [
      "List recent notes from flint local SQLite.",
      "Use to browse recent context without a specific query.",
      "Set all_projects=true to list notes from all projects.",
    ].join(" "),
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Max results (default 10)" })),
      all_projects: Type.Optional(Type.Boolean({ description: "Include notes from all projects (default: active project only)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const args = ["list"];
      if (params.limit) args.push(String(params.limit));
      if (params.all_projects) args.push("--all-projects");

      const result = await runFlint(args, ctx.cwd);
      if (!result.ok) {
        return makeErrorResult(result.stderr || result.stdout);
      }
      const notes = Array.isArray(result.parsed) ? result.parsed : [];
      if (notes.length === 0) {
        return {
          content: [{ type: "text", text: "No recent notes found." }],
          details: { ok: true, count: 0 },
        };
      }
      const formatted = (notes as Array<Record<string, unknown>>).map((n) => {
        const id = n.id ?? "?";
        const title = n.title ?? "(no title)";
        const topicKey = n.topic_key ?? "";
        const type = n.type ?? "";
        return `[${id}] ${title}  |  type: ${type}  |  key: ${topicKey}`;
      }).join("\n");
      return {
        content: [{ type: "text", text: `Recent notes (${notes.length}):\n\n${formatted}` }],
        details: { ok: true, count: notes.length },
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
