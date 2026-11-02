import { createRequire } from "node:module";
var __defProp = Object.defineProperty;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// dist/abortable.js
function abortable(promise, signal) {
  if (!signal)
    return promise;
  if (signal.aborted)
    return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled)
        return;
      settled = true;
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then((value) => {
      if (settled)
        return;
      settled = true;
      cleanup();
      resolve(value);
    }, (error) => {
      if (settled)
        return;
      settled = true;
      cleanup();
      reject(error);
    });
  });
}

// dist/default-agents.js
var READ_ONLY_TOOLS, DEFAULT_AGENTS;
var init_default_agents = __esm(() => {
  READ_ONLY_TOOLS = ["read", "grep", "find", "ls"];
  DEFAULT_AGENTS = new Map([
    [
      "general-purpose",
      {
        name: "general-purpose",
        displayName: "Agent",
        description: "General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you.",
        extensions: true,
        skills: true,
        systemPrompt: "",
        promptMode: "append",
        isDefault: true
      }
    ],
    [
      "Explore",
      {
        name: "Explore",
        displayName: "Explore",
        description: 'Fast read-only search agent for locating code. Use it to find files by pattern (eg. "src/components/**/*.tsx"), grep for symbols or keywords (eg. "API endpoints"), or answer "where is X defined / which files reference Y." Do NOT use it for code review, design-doc auditing, cross-file consistency checks, or open-ended analysis — it reads excerpts rather than whole files and will miss content past its read window. When calling, specify search breadth: "quick" for a single targeted lookup, "medium" for moderate exploration, or "very thorough" to search across multiple locations and naming conventions.',
        builtinToolNames: READ_ONLY_TOOLS,
        extensions: false,
        skills: true,
        systemPrompt: `# CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS
You are a file search specialist. You excel at thoroughly navigating and exploring codebases.
Your role is EXCLUSIVELY to search and analyze existing code. You have no file editing tools and no shell.

You are STRICTLY PROHIBITED from:
- Creating new files
- Modifying existing files
- Deleting files
- Moving or copying files
- Creating temporary files anywhere, including /tmp
- Using redirect operators (>, >>, |) or heredocs to write to files
- Running ANY commands that change system state

# Tool Usage
- Use the find tool for file pattern matching
- Use the grep tool for content search
- Use the read tool for reading files
- Use the ls tool to list directories
- If the task needs a command run (git history, a build, a test), say so in your answer instead
- Make independent tool calls in parallel for efficiency
- Adapt search approach based on thoroughness level specified

# Output
- Use absolute file paths in all references
- Report findings as regular messages
- Do not use emojis
- Be thorough and precise`,
        promptMode: "replace",
        isDefault: true
      }
    ],
    [
      "Plan",
      {
        name: "Plan",
        displayName: "Plan",
        description: "Software architect agent for designing implementation plans. Use this when you need to plan the implementation strategy for a task. Returns step-by-step plans, identifies critical files, and considers architectural trade-offs.",
        builtinToolNames: READ_ONLY_TOOLS,
        extensions: false,
        skills: true,
        systemPrompt: `# CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS
You are a software architect and planning specialist.
Your role is EXCLUSIVELY to explore the codebase and design implementation plans.
You have no file editing tools and no shell.

You are STRICTLY PROHIBITED from:
- Creating new files
- Modifying existing files
- Deleting files
- Moving or copying files
- Creating temporary files anywhere, including /tmp
- Using redirect operators (>, >>, |) or heredocs to write to files
- Running ANY commands that change system state

# Planning Process
1. Understand requirements
2. Explore thoroughly (read files, find patterns, understand architecture)
3. Design solution based on your assigned perspective
4. Detail the plan with step-by-step implementation strategy

# Requirements
- Consider trade-offs and architectural decisions
- Identify dependencies and sequencing
- Anticipate potential challenges
- Follow existing patterns where appropriate

# Tool Usage
- Use the find tool for file pattern matching
- Use the grep tool for content search
- Use the read tool for reading files
- Use the ls tool to list directories
- If the plan depends on running a command (git history, a build, a test), say which one in the plan

# Output Format
- Use absolute file paths
- Do not use emojis
- End your response with:

### Critical Files for Implementation
List 3-5 files most critical for implementing this plan:
- /absolute/path/to/file.ts - [Brief reason]`,
        promptMode: "replace",
        isDefault: true
      }
    ]
  ]);
});

// dist/agent-types.js
import { createCodingTools, createReadOnlyTools } from "@earendil-works/pi-coding-agent";
function isDefaultsDisabled() {
  return disableDefaults;
}
function setDefaultsDisabled(b) {
  disableDefaults = b;
}
function getFallbackSubagent() {
  return fallbackSubagent;
}
function setFallbackSubagent(v) {
  fallbackSubagent = v;
}
function buildAgentRegistry(userAgents) {
  const registry = new Map;
  if (!disableDefaults) {
    for (const [name, config] of DEFAULT_AGENTS)
      registry.set(name, config);
  }
  for (const [name, config] of userAgents)
    registry.set(name, config);
  return registry;
}
function registerAgents(userAgents) {
  agents.clear();
  for (const [name, config] of buildAgentRegistry(userAgents)) {
    agents.set(name, config);
  }
}
function resolveKeyIn(registry, name) {
  if (registry.has(name))
    return name;
  const lower = name.toLowerCase();
  for (const key of registry.keys()) {
    if (key.toLowerCase() === lower)
      return key;
  }
  return;
}
function resolveKey(name) {
  return resolveKeyIn(agents, name);
}
function resolveTypeIn(registry, name) {
  return resolveKeyIn(registry, name);
}
function getAgentConfigIn(registry, name) {
  const key = resolveKeyIn(registry, name);
  return key ? registry.get(key) : undefined;
}
function getAvailableTypesIn(registry) {
  return [...registry.entries()].filter(([_, config]) => config.enabled !== false).map(([name]) => name);
}
function resolveUnambiguousKeyIn(registry, name) {
  if (registry.has(name))
    return name;
  const lower = name.toLowerCase();
  const matches = [...registry.keys()].filter((key) => key.toLowerCase() === lower);
  return matches.length === 1 ? matches[0] : undefined;
}
function resolveEnabledTypeIn(registry, requested) {
  const raw = typeof requested === "string" ? requested.trim() : "";
  if (!raw)
    return;
  const key = resolveUnambiguousKeyIn(registry, raw);
  return key !== undefined && registry.get(key)?.enabled !== false ? key : undefined;
}
function resolveSpawnTypeIn(registry, requested) {
  const raw = typeof requested === "string" ? requested.trim() : "";
  const available = () => getAvailableTypesIn(registry).join(", ") || "(none)";
  const key = resolveEnabledTypeIn(registry, raw);
  if (key !== undefined)
    return { ok: true, type: key };
  const reason = raw ? `Unknown or disabled agent type: "${raw}".` : "No agent type given.";
  const configured = typeof fallbackSubagent === "string" ? fallbackSubagent.trim() : undefined;
  if (configured !== undefined && configured.toLowerCase() === NO_FALLBACK) {
    return { ok: false, message: `${reason} Available: ${available()}.` };
  }
  if (configured !== undefined) {
    const fallbackKey = resolveUnambiguousKeyIn(registry, configured);
    if (fallbackKey === undefined || registry.get(fallbackKey)?.enabled === false) {
      return {
        ok: false,
        message: `${reason} The configured fallbackSubagent "${configured}" is itself ` + `unknown or disabled. Available: ${available()}.`
      };
    }
    return { ok: true, type: fallbackKey, fellBackFrom: raw };
  }
  return { ok: true, type: "general-purpose", fellBackFrom: raw };
}
function resolveSpawnType(requested) {
  return resolveSpawnTypeIn(agents, requested);
}
function resolveType(name) {
  return resolveKey(name);
}
function getAgentConfig(name) {
  return getAgentConfigIn(agents, name);
}
function getAvailableTypes() {
  return getAvailableTypesIn(agents);
}
function getAllTypes() {
  return [...agents.keys()];
}
function getMemoryToolNames(existingToolNames) {
  return MEMORY_TOOL_NAMES.filter((n) => !existingToolNames.has(n));
}
function getReadOnlyMemoryToolNames(existingToolNames) {
  return READONLY_MEMORY_TOOL_NAMES.filter((n) => !existingToolNames.has(n));
}
function getToolNamesForType(type) {
  const key = resolveKey(type);
  const raw = key ? agents.get(key) : undefined;
  const config = raw?.enabled !== false ? raw : undefined;
  return config?.builtinToolNames ?? [...BUILTIN_TOOL_NAMES];
}
function getConfig(type) {
  const key = resolveKey(type);
  const config = key ? agents.get(key) : undefined;
  if (config && config.enabled !== false) {
    return {
      displayName: config.displayName ?? config.name,
      color: config.color,
      description: config.description,
      builtinToolNames: config.builtinToolNames ?? BUILTIN_TOOL_NAMES,
      extensions: config.extensions,
      excludeExtensions: config.excludeExtensions,
      skills: config.skills,
      promptMode: config.promptMode
    };
  }
  const gp = agents.get("general-purpose");
  if (gp && gp.enabled !== false) {
    return {
      displayName: gp.displayName ?? gp.name,
      color: gp.color,
      description: gp.description,
      builtinToolNames: gp.builtinToolNames ?? BUILTIN_TOOL_NAMES,
      extensions: gp.extensions,
      excludeExtensions: gp.excludeExtensions,
      skills: gp.skills,
      promptMode: gp.promptMode
    };
  }
  return {
    displayName: "Agent",
    description: "General-purpose agent for complex, multi-step tasks",
    builtinToolNames: BUILTIN_TOOL_NAMES,
    extensions: true,
    skills: true,
    promptMode: "append"
  };
}
var BUILTIN_TOOL_NAMES, agents, disableDefaults = false, NO_FALLBACK = "none", fallbackSubagent, MEMORY_TOOL_NAMES, READONLY_MEMORY_TOOL_NAMES;
var init_agent_types = __esm(() => {
  init_default_agents();
  BUILTIN_TOOL_NAMES = [
    ...new Set([...createCodingTools("."), ...createReadOnlyTools(".")].map((t) => t.name))
  ];
  agents = new Map;
  MEMORY_TOOL_NAMES = ["read", "write", "edit"];
  READONLY_MEMORY_TOOL_NAMES = ["read"];
});

// dist/agent-color.js
function resolveAgentColor(value) {
  if (!value)
    return;
  const normalized = value.trim().toLowerCase();
  const resolved = NAMED_AGENT_COLORS[normalized] ?? normalized;
  return /^#[0-9a-f]{6}$/i.test(resolved) ? resolved.toUpperCase() : undefined;
}
function parseHex(hex) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16)
  };
}
function nearest(values, value) {
  return values.reduce((best, v, i) => Math.abs(value - v) < Math.abs(value - values[best]) ? i : best, 0);
}
function rgbTo256({ r, g, b }) {
  const [rIndex, gIndex, bIndex] = [r, g, b].map((channel) => nearest(CUBE_VALUES, channel));
  const distance = ({ r: cr, g: cg, b: cb }) => 0.299 * (r - cr) ** 2 + 0.587 * (g - cg) ** 2 + 0.114 * (b - cb) ** 2;
  const grayIndex = nearest(GRAY_VALUES, Math.round(0.299 * r + 0.587 * g + 0.114 * b));
  const gray = { r: GRAY_VALUES[grayIndex], g: GRAY_VALUES[grayIndex], b: GRAY_VALUES[grayIndex] };
  const cube = { r: CUBE_VALUES[rIndex], g: CUBE_VALUES[gIndex], b: CUBE_VALUES[bIndex] };
  if (Math.max(r, g, b) - Math.min(r, g, b) < 10 && distance(gray) < distance(cube)) {
    return { index: 232 + grayIndex, rgb: gray };
  }
  return { index: 16 + 36 * rIndex + 6 * gIndex + bIndex, rgb: cube };
}
function ansiColor(layer, color) {
  const code = layer === "foreground" ? 38 : 48;
  return typeof color === "number" ? `\x1B[${code};5;${color}m` : `\x1B[${code};2;${color.r};${color.g};${color.b}m`;
}
function relativeLuminance({ r, g, b }) {
  const linear = (value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}
function renderAgentNameLabel(name, color, theme, style = {}) {
  const resolved = resolveAgentColor(color);
  if (!resolved) {
    const text = style.bold ? theme.bold(name) : name;
    return style.fallbackColor ? theme.fg(style.fallbackColor, text) : text;
  }
  const rgb = parseHex(resolved);
  const quantized = (theme.getColorMode?.() ?? "truecolor") === "256color" ? rgbTo256(rgb) : undefined;
  const shown = quantized?.rgb ?? rgb;
  const contrasting = relativeLuminance(shown) > 0.179 ? BLACK : WHITE;
  const label = style.bold ? theme.bold(` ${name} `) : ` ${name} `;
  return ansiColor("background", quantized?.index ?? rgb) + ansiColor("foreground", quantized ? rgbTo256(contrasting).index : contrasting) + label + "\x1B[39m" + (style.restoreBackground ?? "\x1B[49m");
}
function hasAgentBadge(type) {
  return type !== undefined && resolveAgentColor(getConfig(type).color) !== undefined;
}
function renderAgentName(type, theme, style = {}) {
  if (!type)
    return renderAgentNameLabel("Agent", undefined, theme, style);
  const config = getConfig(type);
  return renderAgentNameLabel(config.displayName, config.color, theme, style);
}
var NAMED_AGENT_COLORS, CUBE_VALUES, GRAY_VALUES, BLACK, WHITE;
var init_agent_color = __esm(() => {
  init_agent_types();
  NAMED_AGENT_COLORS = {
    red: "#DC2626",
    blue: "#6A9BCC",
    green: "#16A34A",
    yellow: "#CA8A04",
    purple: "#827DBD",
    orange: "#D97757",
    pink: "#C46686",
    cyan: "#0891B2",
    amber: "#F59E0B",
    teal: "#008080",
    indigo: "#6366F1",
    gold: "#EAB308",
    "neon-green": "#10B981",
    "neon-cyan": "#06B6D4",
    "metallic-blue": "#3B82F6",
    violet: "#8B5CF6",
    rose: "#F43F5E",
    lime: "#84CC16",
    gray: "#6B7280",
    grey: "#6B7280",
    fuchsia: "#D946EF",
    slate: "#64748B",
    navy: "#1E3A8A"
  };
  CUBE_VALUES = [0, 95, 135, 175, 215, 255];
  GRAY_VALUES = Array.from({ length: 24 }, (_, i) => 8 + i * 10);
  BLACK = { r: 0, g: 0, b: 0 };
  WHITE = { r: 255, g: 255, b: 255 };
});

// dist/discovery-cache.js
import { statSync } from "node:fs";
import { resolve } from "node:path";
function fingerprint(path) {
  const s = statSync(path, { bigint: true });
  return `${s.dev}:${s.ino}:${s.mode}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
}
function createDiscoveryCache(read, capacity = 256) {
  const entries = new Map;
  return (path) => {
    const key = resolve(path);
    try {
      const before = fingerprint(key);
      const cached = entries.get(key);
      entries.delete(key);
      if (cached?.fingerprint === before) {
        entries.set(key, cached);
        return cached.value;
      }
      const value = read(key);
      if (before === fingerprint(key)) {
        entries.set(key, { fingerprint: before, value });
        if (entries.size > capacity) {
          const oldest = entries.keys().next().value;
          if (oldest !== undefined)
            entries.delete(oldest);
        }
      }
      return value;
    } catch (error) {
      entries.delete(key);
      throw error;
    }
  };
}
var init_discovery_cache = () => {};

// dist/custom-agents.js
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
function loadCustomAgents(cwd, strict = false, options = {}) {
  const globalDir = join(getAgentDir(), "agents");
  const workspaceProjectDir = join(cwd, ".agents", "agents");
  const projectDir = join(cwd, ".pi", "agents");
  const agents2 = new Map;
  loadFromDir(globalDir, agents2, "global", strict);
  if (options.project !== false) {
    loadFromDir(workspaceProjectDir, agents2, "project", strict);
    loadFromDir(projectDir, agents2, "project", strict);
  }
  if (!isDefaultsDisabled()) {
    for (const [name, config] of agents2) {
      if (config.source === "project" && DEFAULT_AGENTS.has(name)) {
        warnIfNew(`Project agent file ${config.sourcePath} replaces the built-in "${name}" agent`);
      }
    }
  }
  warnedLastLoad = warnedThisLoad;
  warnedThisLoad = new Set;
  return agents2;
}
function projectAgentNames(cwd) {
  const names = new Set;
  for (const dir of [join(cwd, ".agents", "agents"), join(cwd, ".pi", "agents")]) {
    if (!existsSync(dir))
      continue;
    let files;
    try {
      files = readAgentDirectory(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      let declared;
      try {
        declared = str(readParsedAgent(join(dir, file)).frontmatter.name)?.trim();
      } catch {}
      names.add(declared || basename(file, ".md"));
    }
  }
  return [...names];
}
function loadFromDir(dir, agents2, source, strict) {
  if (!existsSync(dir))
    return;
  let files;
  try {
    files = readAgentDirectory(dir);
  } catch {
    return;
  }
  for (const file of files) {
    const filenameType = basename(file, ".md");
    const path = join(dir, file);
    const parsed = readAgentFile(path, strict);
    if (!parsed) {
      warnSkippedOverride(filenameType, agents2);
      continue;
    }
    const { frontmatter: fm, body } = parsed;
    const declared = str(fm.name)?.trim();
    if (declared?.includes(RESERVED_IN_TYPE)) {
      warnIfNew(`Agent file ${path} declares name "${declared}", which contains "${RESERVED_IN_TYPE}" — reserved for ` + "plugin-scoped identifiers. Rename it, or move the label to `display_name:`. Skipping.");
      continue;
    }
    const name = declared || filenameType;
    const { builtinToolNames, extSelectors } = parseToolsField(fm.tools);
    agents2.set(name, {
      name,
      displayName: str(fm.display_name),
      color: str(fm.color),
      description: str(fm.description) ?? name,
      builtinToolNames,
      extSelectors,
      disallowedTools: csvListOptional(fm.disallowed_tools),
      extensions: inheritField(fm.extensions ?? fm.inherit_extensions),
      excludeExtensions: csvListOptional(fm.exclude_extensions),
      skills: inheritField(fm.skills ?? fm.inherit_skills),
      model: str(fm.model),
      thinking: str(fm.thinking),
      maxTurns: nonNegativeInt(fm.max_turns),
      persistSession: fm.persist_session != null ? fm.persist_session === true : undefined,
      outputTranscript: fm.output_transcript != null ? fm.output_transcript !== false : undefined,
      sessionDir: str(fm.session_dir),
      allowedSubagents: parseAllowedSubagents(fm.allowed_subagents),
      systemPrompt: body.trim(),
      promptMode: fm.prompt_mode === "append" ? "append" : "replace",
      inheritContext: fm.inherit_context != null ? fm.inherit_context === true : undefined,
      runInBackground: fm.run_in_background != null ? fm.run_in_background === true : undefined,
      isolated: fm.isolated != null ? fm.isolated === true : undefined,
      memory: parseMemory(fm.memory),
      isolation: parseIsolation(fm.isolation),
      enabled: fm.enabled !== false,
      source,
      sourcePath: path
    });
  }
}
function parseAgentFrontmatter(content) {
  return parseFrontmatter(content.startsWith("\uFEFF") ? content.slice(1) : content);
}
function readAgentFile(path, strict) {
  try {
    return readParsedAgent(path);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (strict)
      throw new Error(`${path}: ${reason}`);
    warnIfNew(`Skipping agent file ${path}: ${reason}`);
    return;
  }
}
function warnSkippedOverride(name, agents2) {
  const surviving = agents2.get(name);
  if (!surviving?.sourcePath || surviving.enabled === false)
    return;
  warnIfNew(`Agent "${name}" now loads from ${surviving.sourcePath} instead`);
}
function warnIfNew(message) {
  warnedThisLoad.add(message);
  if (warnedLastLoad.has(message))
    return;
  console.warn(`[pi-subagents] ${message}`);
}
function str(val) {
  return typeof val === "string" ? val : undefined;
}
function nonNegativeInt(val) {
  return typeof val === "number" && val >= 0 ? val : undefined;
}
function parseCsvField(val) {
  if (val === undefined || val === null)
    return;
  const s = String(val).trim();
  if (!s || s === "none")
    return;
  const items = s.split(",").map((t) => t.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}
function parseAllowedSubagents(val) {
  if (typeof val === "boolean")
    return val ? "all" : undefined;
  const items = parseCsvField(val);
  if (!items)
    return;
  return items.some((i) => i === "*" || i.toLowerCase() === "all") ? "all" : items;
}
function csvList(val, defaults) {
  if (val === undefined || val === null)
    return defaults;
  return parseCsvField(val) ?? [];
}
function parseToolsField(val) {
  const entries = csvList(val, BUILTIN_TOOL_NAMES);
  const isWildcard = (e) => e === "*" || e.toLowerCase() === "all";
  const hasWildcard = entries.some(isWildcard);
  const plain = entries.filter((e) => !isWildcard(e) && !e.startsWith("ext:"));
  const extEntries = entries.filter((e) => e.startsWith("ext:"));
  return {
    builtinToolNames: hasWildcard ? [...new Set([...BUILTIN_TOOL_NAMES, ...plain])] : plain,
    extSelectors: extEntries.length > 0 ? extEntries : undefined
  };
}
function csvListOptional(val) {
  return parseCsvField(val);
}
function parseMemory(val) {
  if (val === "user" || val === "project" || val === "local")
    return val;
  return;
}
function parseIsolation(val) {
  if (val === "worktree")
    return "worktree";
  if (val === "off" || val === "none" || val === "no" || val === false)
    return "off";
  return;
}
function inheritField(val) {
  if (val === undefined || val === null || val === true)
    return true;
  if (val === false || val === "none")
    return false;
  const items = csvList(val, []);
  return items.length > 0 ? items : false;
}
var RESERVED_IN_TYPE = ":", readAgentDirectory, readParsedAgent, warnedLastLoad, warnedThisLoad;
var init_custom_agents = __esm(() => {
  init_agent_types();
  init_default_agents();
  init_discovery_cache();
  readAgentDirectory = createDiscoveryCache((path) => readdirSync(path).filter((f) => f.endsWith(".md")), 64);
  readParsedAgent = createDiscoveryCache((path) => parseAgentFrontmatter(readFileSync(path, "utf-8")));
  warnedLastLoad = new Set;
  warnedThisLoad = new Set;
});

// dist/child-context.js
import { AsyncLocalStorage } from "node:async_hooks";
function inChildSessionContext() {
  return childSessionContext.getStore() === true;
}
function runInChildSessionContext(fn) {
  return childSessionContext.run(true, fn);
}
var childSessionContext;
var init_child_context = __esm(() => {
  childSessionContext = new AsyncLocalStorage;
});

// dist/codemode-guard.js
import { appendFileSync, mkdirSync } from "node:fs";
import { join as join3, resolve as resolve2 } from "node:path";
import { getAgentDir as getAgentDir3 } from "@earendil-works/pi-coding-agent";
function getCodemodeTimeoutSeconds() {
  return codemodeTimeoutSeconds;
}
function setCodemodeTimeoutSeconds(n) {
  codemodeTimeoutSeconds = Math.min(CODEMODE_TIMEOUT_CEILING, Math.max(0, Math.floor(n)));
}
function codemodeDeadlineSeconds(input) {
  const code = input && typeof input === "object" ? input.code : undefined;
  if (typeof code === "string") {
    const newline = code.indexOf(`
`);
    const firstLine = (newline === -1 ? code : code.slice(0, newline)).trim();
    if (firstLine.startsWith(OPTIONS_PREFIX)) {
      try {
        const timeoutMs = JSON.parse(firstLine.slice(OPTIONS_PREFIX.length).trim())?.timeout_ms;
        if (typeof timeoutMs === "number" && timeoutMs > 0)
          return timeoutMs / 1000;
      } catch {}
    }
  }
  return codemodeTimeoutSeconds > 0 ? codemodeTimeoutSeconds : undefined;
}
function boundCodemodeTimeout(input, seconds) {
  if (seconds <= 0 || !input || typeof input !== "object")
    return;
  const call = input;
  if (typeof call.code !== "string" || call.code.trim() === "")
    return;
  const timeoutMs = Math.min(MAX_TIMEOUT_MS, seconds * 1000);
  const code = call.code;
  const newline = code.indexOf(`
`);
  const firstLine = (newline === -1 ? code : code.slice(0, newline)).replace(/\r$/, "");
  const trimmed = firstLine.trimStart();
  if (!trimmed.startsWith(OPTIONS_PREFIX)) {
    call.code = `${OPTIONS_PREFIX} ${JSON.stringify({ timeout_ms: timeoutMs })}
${code}`;
    return;
  }
  let options;
  try {
    options = JSON.parse(trimmed.slice(OPTIONS_PREFIX.length).trim());
  } catch {
    return;
  }
  if (!options || typeof options !== "object" || Array.isArray(options))
    return;
  if (options.timeout_ms !== undefined)
    return;
  const rest = newline === -1 ? "" : code.slice(newline);
  call.code = `${OPTIONS_PREFIX} ${JSON.stringify({ ...options, timeout_ms: timeoutMs })}${rest}`;
}
function auditMaxBytes() {
  const n = Number(process.env.PI_CODEMODE_AUDIT_MAX_BYTES);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_AUDIT_MAX_BYTES;
}
function codemodeAuditRoot() {
  const configured = process.env.PI_CODEMODE_AUDIT_DIR?.trim();
  return configured ? resolve2(configured) : join3(getAgentDir3(), "opensec", "codemode");
}
function rawOutput(event) {
  const meta = [];
  const structured = event.structuredContent;
  let body;
  if (structured && typeof structured === "object" && !Array.isArray(structured)) {
    const record = structured;
    if (typeof record.output === "string") {
      body = record.output;
      if (record.exit_code !== undefined)
        meta.push(`exit_code: ${String(record.exit_code)}`);
      if (record.truncated === true)
        meta.push("truncated: true (the script got the first and last 512 KiB)");
      if (typeof record.full_output_path === "string")
        meta.push(`full output: ${record.full_output_path}`);
    } else {
      meta.push(`structured: ${JSON.stringify(structured)}`);
    }
  } else if (structured !== undefined) {
    meta.push(`structured: ${JSON.stringify(structured)}`);
  }
  const details = event.details;
  if (details && typeof details === "object") {
    const fullOutputPath = details.fullOutputPath;
    if (typeof fullOutputPath === "string" && !meta.some((m) => m.endsWith(fullOutputPath))) {
      meta.push(`full output: ${fullOutputPath}`);
    }
  }
  if (body === undefined) {
    body = (event.content ?? []).map((c) => c.type === "text" ? c.text : `[${c.type}]`).join(`
`);
  }
  return { body, meta };
}
function createCodemodeAudit() {
  const scripts = new Map;
  const recordCall = (event, ctx) => {
    if (event.toolName !== CODEMODE_TOOL_NAME)
      return;
    const session = safe(ctx?.sessionManager?.getSessionId?.() ?? "session");
    scripts.set(event.toolCallId, {
      file: join3(codemodeAuditRoot(), session, `${safe(event.toolCallId)}.log`),
      calls: 0,
      bytes: 0,
      capped: false
    });
  };
  const onToolResult = (event) => {
    if (event.parentToolCallId) {
      const script2 = scripts.get(event.parentToolCallId);
      if (!script2)
        return;
      script2.calls += 1;
      const { body, meta } = rawOutput(event);
      const head = [
        `===== call ${script2.calls}: ${event.toolName} (${event.toolCallId})${event.isError ? " ERROR" : ""}`,
        `input: ${JSON.stringify(event.input ?? {})}`,
        ...meta
      ].join(`
`);
      const max = auditMaxBytes();
      let entry;
      if (script2.capped) {
        entry = `${head}
[output not saved: log cap of ${max} bytes reached]

`;
      } else {
        entry = `${head}
${body}

`;
        const size = Buffer.byteLength(entry);
        if (script2.bytes + size > max) {
          const room = Math.max(0, max - script2.bytes - Buffer.byteLength(head) - 200);
          const kept = Buffer.from(body).subarray(0, room).toString();
          entry = `${head}
${kept}
[log cap of ${max} bytes reached: the rest of this output and later outputs are not saved]

`;
          script2.capped = true;
        }
      }
      script2.bytes += Buffer.byteLength(entry);
      try {
        mkdirSync(join3(script2.file, ".."), { recursive: true, mode: 448 });
        appendFileSync(script2.file, entry, { mode: 384 });
      } catch (error) {
        script2.failed ??= String(error?.code ?? error);
      }
      return;
    }
    if (event.toolName !== CODEMODE_TOOL_NAME)
      return;
    const script = scripts.get(event.toolCallId);
    scripts.delete(event.toolCallId);
    if (!script || script.calls === 0)
      return;
    const where = script.failed ? `could not be saved (${script.failed})` : `are in ${script.file}${script.capped ? " (cut off at the log size cap)" : ""}`;
    const note = `[Raw outputs of this script's ${script.calls} tool call${script.calls === 1 ? "" : "s"} ${where}. ` + "The script's printed output is filtered: it is not proof that something is absent. " + "Before concluding absence, check the raw outputs or print the pattern, scope and count.]";
    return {
      content: [...event.content ?? [], { type: "text", text: note }],
      ...event.structuredContent === undefined ? {} : { structuredContent: event.structuredContent }
    };
  };
  return { recordCall, onToolResult };
}
var CODEMODE_TOOL_NAME = "codemode", OPTIONS_PREFIX = "// @options:", MAX_TIMEOUT_MS = 2147483647, CODEMODE_TIMEOUT_CEILING = 86400, codemodeTimeoutSeconds = 1800, DEFAULT_AUDIT_MAX_BYTES, safe = (s) => s.replace(/[^A-Za-z0-9._-]/g, "-");
var init_codemode_guard = __esm(() => {
  DEFAULT_AUDIT_MAX_BYTES = 16 * 1024 * 1024;
});

// dist/context.js
function extractText(content) {
  return content.filter((c) => c.type === "text").map((c) => c.text ?? "").join(`
`);
}
function buildParentContext(ctx) {
  const entries = ctx.sessionManager.getBranch();
  if (!entries || entries.length === 0)
    return "";
  const parts = [];
  for (const entry of entries) {
    if (entry.type === "message") {
      const msg = entry.message;
      if (msg.role === "user") {
        const text = typeof msg.content === "string" ? msg.content : extractText(msg.content);
        if (text.trim())
          parts.push(`[User]: ${text.trim()}`);
      } else if (msg.role === "assistant") {
        const text = extractText(msg.content);
        if (text.trim())
          parts.push(`[Assistant]: ${text.trim()}`);
      }
    } else if (entry.type === "compaction") {
      if (entry.summary) {
        parts.push(`[Summary]: ${entry.summary}`);
      }
    }
  }
  if (parts.length === 0)
    return "";
  return `# Parent Conversation Context
The following is the conversation history from the parent session that spawned you.
Use this context to understand what has been discussed and decided so far.

${parts.join(`

`)}

---
# Your Task (below)
`;
}

// dist/exec-tree.js
import { spawn } from "node:child_process";
import { join as join4 } from "node:path";
function signalTree(pid, signal, leaderAlive) {
  if (IS_WINDOWS) {
    try {
      const killer = spawn(join4(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"), ["/F", "/T", "/PID", String(pid)], {
        stdio: "ignore",
        windowsHide: true
      });
      killer.once("error", () => {});
    } catch {}
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    if (!leaderAlive)
      return;
    try {
      process.kill(pid, signal);
    } catch {}
  }
}
function execTree(command, args, options = {}) {
  return new Promise((resolve3) => {
    let proc;
    try {
      proc = spawn(command, args, {
        cwd: options.cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        detached: !IS_WINDOWS,
        windowsHide: true
      });
    } catch (err) {
      resolve3({ stdout: "", stderr: err instanceof Error ? err.message : String(err), code: 1, killed: false });
      return;
    }
    const pid = proc.pid;
    let stdout = "";
    let stderr = "";
    let killed = false;
    let settled = false;
    let timeoutId;
    let drainId;
    let exited = false;
    let exitCode = null;
    let exitSignal = null;
    const endTree = () => {
      if (pid === undefined)
        return;
      signalTree(pid, "SIGTERM", !exited);
      const escalate = setTimeout(() => signalTree(pid, "SIGKILL", !exited), options.killGraceMs ?? KILL_GRACE_MS);
      escalate.unref?.();
    };
    const kill = () => {
      if (killed || settled)
        return;
      killed = true;
      endTree();
    };
    const onAbort = () => kill();
    const finish = (code, extraStderr) => {
      if (settled)
        return;
      settled = true;
      if (timeoutId)
        clearTimeout(timeoutId);
      if (drainId)
        clearTimeout(drainId);
      options.signal?.removeEventListener("abort", onAbort);
      proc.stdout?.destroy();
      proc.stderr?.destroy();
      resolve3({ stdout, stderr: extraStderr ? `${stderr}${extraStderr}` : stderr, code, killed });
    };
    const exitStatus = () => exitCode ?? (exitSignal ? 1 : 0);
    proc.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.once("error", (err) => finish(1, err.message));
    proc.once("exit", (code, signal) => {
      exited = true;
      exitCode = code;
      exitSignal = signal;
      if (options.killTreeOnExit && !killed)
        endTree();
      drainId = setTimeout(() => finish(exitStatus()), EXIT_DRAIN_MS);
    });
    proc.once("close", () => finish(exitStatus()));
    if (options.signal) {
      if (options.signal.aborted)
        kill();
      else
        options.signal.addEventListener("abort", onAbort, { once: true });
    }
    if (options.timeout && options.timeout > 0)
      timeoutId = setTimeout(kill, options.timeout);
  });
}
function useTreeKillingExec(pi) {
  treeKillingApis.add(pi);
}
function commandExec(pi) {
  return treeKillingApis.has(pi) ? execTree : (command, args, options) => pi.exec(command, args, options);
}
var KILL_GRACE_MS = 5000, EXIT_DRAIN_MS = 250, IS_WINDOWS, TREE_KILLING_KEY, treeKillingGlobal, treeKillingApis;
var init_exec_tree = __esm(() => {
  IS_WINDOWS = process.platform === "win32";
  TREE_KILLING_KEY = Symbol.for("pi-subagents:tree-killing-apis");
  treeKillingGlobal = globalThis;
  treeKillingGlobal[TREE_KILLING_KEY] ??= new WeakSet;
  treeKillingApis = treeKillingGlobal[TREE_KILLING_KEY];
});

// dist/env.js
function detectEnv(pi, cwd) {
  const byCwd = envCache.get(pi) ?? new Map;
  envCache.set(pi, byCwd);
  const now = Date.now();
  for (const [key, entry] of byCwd)
    if (now - entry.at >= ENV_CACHE_MS)
      byCwd.delete(key);
  const cached = byCwd.get(cwd);
  if (cached)
    return cached.env;
  const env = detectEnvUncached(pi, cwd);
  byCwd.set(cwd, { at: now, env });
  return env;
}
async function detectEnvUncached(pi, cwd) {
  let isGitRepo = false;
  let branch = "";
  try {
    const result = await commandExec(pi)("git", ["rev-parse", "--is-inside-work-tree"], { cwd, timeout: 5000 });
    isGitRepo = result.code === 0 && result.stdout.trim() === "true";
  } catch {}
  if (isGitRepo) {
    try {
      const result = await commandExec(pi)("git", ["branch", "--show-current"], { cwd, timeout: 5000 });
      branch = result.code === 0 ? result.stdout.trim() : "unknown";
    } catch {
      branch = "unknown";
    }
  }
  return {
    isGitRepo,
    branch,
    platform: process.platform
  };
}
var ENV_CACHE_MS = 1e4, envCache;
var init_env = __esm(() => {
  init_exec_tree();
  envCache = new WeakMap;
});

// dist/memory.js
import { existsSync as existsSync3, lstatSync, mkdirSync as mkdirSync2, readFileSync as readFileSync2 } from "node:fs";
import { homedir } from "node:os";
import { join as join5 } from "node:path";
import { getAgentDir as getAgentDir4 } from "@earendil-works/pi-coding-agent";
function isUnsafeName(name) {
  if (!name || name.length > 128)
    return true;
  return !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
}
function isSymlink(filePath) {
  try {
    return lstatSync(filePath).isSymbolicLink();
  } catch {
    return false;
  }
}
function safeReadFile(filePath) {
  if (!existsSync3(filePath))
    return;
  if (isSymlink(filePath))
    return;
  try {
    return readFileSync2(filePath, "utf-8");
  } catch {
    return;
  }
}
function resolveMemoryDir(agentName, scope, cwd) {
  if (isUnsafeName(agentName)) {
    throw new Error(`Unsafe agent name for memory directory: "${agentName}"`);
  }
  switch (scope) {
    case "user": {
      const current = join5(getAgentDir4(), "agent-memory", agentName);
      const legacy = join5(homedir(), ".pi", "agent-memory", agentName);
      if (!existsSync3(current) && existsSync3(legacy) && !isSymlink(legacy)) {
        return legacy;
      }
      return current;
    }
    case "project":
      return join5(cwd, ".pi", "agent-memory", agentName);
    case "local":
      return join5(cwd, ".pi", "agent-memory-local", agentName);
  }
}
function ensureMemoryDir(memoryDir) {
  if (existsSync3(memoryDir)) {
    if (isSymlink(memoryDir)) {
      throw new Error(`Refusing to use symlinked memory directory: ${memoryDir}`);
    }
    return;
  }
  mkdirSync2(memoryDir, { recursive: true });
}
function readMemoryIndex(memoryDir) {
  if (isSymlink(memoryDir))
    return;
  const memoryFile = join5(memoryDir, "MEMORY.md");
  const content = safeReadFile(memoryFile);
  if (content === undefined)
    return;
  const lines = content.split(`
`);
  if (lines.length > MAX_MEMORY_LINES) {
    return lines.slice(0, MAX_MEMORY_LINES).join(`
`) + `
... (truncated at 200 lines)`;
  }
  return content;
}
function buildMemoryBlock(agentName, scope, cwd) {
  const memoryDir = resolveMemoryDir(agentName, scope, cwd);
  ensureMemoryDir(memoryDir);
  const existingMemory = readMemoryIndex(memoryDir);
  const header = `# Agent Memory

You have a persistent memory directory at: ${memoryDir}/
Memory scope: ${scope}

This memory persists across sessions. Use it to build up knowledge over time.`;
  const memoryContent = existingMemory ? `

## Current MEMORY.md
${existingMemory}` : `

No MEMORY.md exists yet. Create one at ${join5(memoryDir, "MEMORY.md")} to start building persistent memory.`;
  const instructions = `

## Memory Instructions
- MEMORY.md is an index file — keep it concise (under 200 lines). Lines after 200 are truncated.
- Store detailed memories in separate files within ${memoryDir}/ and link to them from MEMORY.md.
- Each memory file should use this frontmatter format:
  \`\`\`markdown
  ---
  name: <memory name>
  description: <one-line description>
  type: <user|feedback|project|reference>
  ---
  <memory content>
  \`\`\`
- Update or remove memories that become outdated. Check for existing memories before creating duplicates.
- You have Read, Write, and Edit tools available for managing memory files.`;
  return header + memoryContent + instructions;
}
function buildReadOnlyMemoryBlock(agentName, scope, cwd) {
  const memoryDir = resolveMemoryDir(agentName, scope, cwd);
  const existingMemory = readMemoryIndex(memoryDir);
  const header = `# Agent Memory (read-only)

Memory scope: ${scope}
You have read-only access to memory. You can reference existing memories but cannot create or modify them.`;
  const memoryContent = existingMemory ? `

## Current MEMORY.md
${existingMemory}` : `

No memory is available yet. Other agents or sessions with write access can create memories for you to consume.`;
  return header + memoryContent;
}
var MAX_MEMORY_LINES = 200;
var init_memory = () => {};

// dist/model-resolver.js
function describeModel(model) {
  return {
    modelName: (model.name ?? model.id).replace(/^Claude\s+/i, "").toLowerCase(),
    modelId: `${model.provider}/${model.id}`
  };
}
function resolveModelDetailed(input, registry, preferProvider) {
  const all = registry.getAvailable?.() ?? registry.getAll();
  const slashIdx = input.indexOf("/");
  if (slashIdx !== -1) {
    const exact = all.find((m) => `${m.provider}/${m.id}`.toLowerCase() === input.toLowerCase());
    if (exact) {
      const found = registry.find(exact.provider, exact.id);
      if (found)
        return { ok: true, model: found };
    }
  }
  const normalize = (s) => s.toLowerCase().replace(/\./g, "-");
  const query = normalize(input);
  const matches = [];
  for (const m of all) {
    const id = normalize(m.id);
    const name = normalize(m.name);
    const full = normalize(`${m.provider}/${m.id}`);
    if (id === query || full === query) {
      matches.push({ model: m, tier: 3, score: 100 });
    } else if (id.includes(query) || full.includes(query)) {
      matches.push({ model: m, tier: 2, score: 60 + query.length / id.length * 30 });
    } else if (name.includes(query)) {
      matches.push({ model: m, tier: 1, score: 40 + query.length / name.length * 20 });
    } else if (query.split(/[\s\-/]+/).every((part) => /^\d{8}$/.test(part) || id.includes(part) || name.includes(part) || m.provider.toLowerCase().includes(part))) {
      matches.push({ model: m, tier: 0, score: 20 });
    }
  }
  if (matches.length > 0) {
    const bestTier = Math.max(...matches.map((match) => match.tier));
    let best = matches.filter((match) => match.tier === bestTier).sort((a, b) => b.score - a.score || a.model.id.localeCompare(b.model.id));
    const preferred = preferProvider?.toLowerCase();
    const fromParent = best.filter((match) => match.model.provider.toLowerCase() === preferred);
    if (fromParent.length > 0)
      best = fromParent;
    if (new Set(best.map((match) => match.model.provider.toLowerCase())).size === 1) {
      const found = registry.find(best[0].model.provider, best[0].model.id);
      if (found)
        return { ok: true, model: found };
    } else {
      const candidates = best.slice(0, MAX_CANDIDATES).map((match) => `${match.model.provider}/${match.model.id}`);
      const more = best.length > candidates.length ? ` (and ${best.length - candidates.length} more)` : "";
      return {
        ok: false,
        reason: "ambiguous",
        candidates,
        message: `Model "${input}" is ambiguous: it matches ${best.length} available models, closest first: ` + `${candidates.join(", ")}${more}. Name one of them as provider/id.`
      };
    }
  }
  if (slashIdx !== -1 && matches.length === 0) {
    const bare = resolveModelDetailed(input.slice(slashIdx + 1), registry, preferProvider);
    if (bare.ok || bare.reason === "ambiguous")
      return bare;
  }
  const modelList = all.map((m) => `  ${m.provider}/${m.id}`).sort().join(`
`);
  return {
    ok: false,
    reason: "not-found",
    candidates: [],
    message: `Model not found: "${input}".

Available models:
${modelList}`
  };
}
function resolveModel(input, registry, preferProvider) {
  const resolution = resolveModelDetailed(input, registry, preferProvider);
  return resolution.ok ? resolution.model : resolution.message;
}
function unresolvedReason(failure) {
  return failure.reason === "ambiguous" ? `is ambiguous (candidates: ${failure.candidates.join(", ")})` : "was not found among the available models";
}
function unresolvedModelNote(input, why, ranOn, source = "the agent file") {
  const used = typeof ranOn === "string" ? ranOn : ranOn ? `${ranOn.provider}/${ranOn.id}` : "the default model";
  return `Note: model "${input}" from ${source} ${why}; ran on ${used} instead.`;
}
var MAX_CANDIDATES = 5;

// dist/invocation-config.js
import { Type } from "typebox";
function isolationParam(enabled) {
  return enabled ? isolationParamShape : {};
}
function isModelOverrideAllowed() {
  return allowModelOverride;
}
function setModelOverrideAllowed(b) {
  allowModelOverride = b;
}
function resolveAgentInvocationConfig(agentConfig, rawParams, opts) {
  const overridesAllowed = opts?.allowModelOverride ?? allowModelOverride;
  const params = {
    ...rawParams,
    model: overridesAllowed && typeof rawParams.model === "string" ? rawParams.model : undefined,
    thinking: overridesAllowed && typeof rawParams.thinking === "string" ? rawParams.thinking : undefined
  };
  const requested = agentConfig?.isolation ?? params.isolation;
  const isolation = requested === "worktree" && opts?.worktreeAllowed !== false ? "worktree" : undefined;
  const overriddenThinking = agentConfig?.thinking != null && params.thinking != null && agentConfig.thinking !== params.thinking ? params.thinking : undefined;
  const overriddenModel = agentConfig?.model != null && params.model != null && agentConfig.model !== params.model ? params.model : undefined;
  return {
    modelInput: agentConfig?.model ?? params.model,
    modelFromParams: agentConfig?.model == null && params.model != null,
    thinking: agentConfig?.thinking ?? params.thinking,
    maxTurns: agentConfig?.maxTurns ?? params.max_turns,
    inheritContext: agentConfig?.inheritContext ?? params.inherit_context ?? false,
    runInBackground: agentConfig?.runInBackground ?? params.run_in_background ?? opts?.defaultRunInBackground ?? false,
    isolated: agentConfig?.isolated ?? params.isolated ?? false,
    isolation,
    overridden: overriddenThinking || overriddenModel ? { thinking: overriddenThinking, model: overriddenModel } : undefined
  };
}
function resolveJoinMode(defaultJoinMode, runInBackground) {
  return runInBackground ? defaultJoinMode : undefined;
}
var isolationParamShape, allowModelOverride = false;
var init_invocation_config = __esm(() => {
  isolationParamShape = {
    isolation: Type.Optional(Type.Union([Type.Literal("off"), Type.Literal("worktree")], {
      description: 'Isolation mode. Default "off". "off" runs the agent in the current checkout, the same as omitting the field. "worktree" creates a temporary git worktree so the agent works on an isolated copy of the repo (a copy cannot see uncommitted or staged changes in the main checkout).'
    }))
  };
});

// dist/enabled-models.js
import { existsSync as existsSync4, readFileSync as readFileSync3, statSync as statSync2 } from "node:fs";
import { join as join6 } from "node:path";
import { getAgentDir as getAgentDir5 } from "@earendil-works/pi-coding-agent";
function settingsPaths(cwd) {
  return [
    join6(cwd, ".pi", "settings.json"),
    join6(getAgentDir5(), "settings.json")
  ];
}
function readField(path) {
  if (!existsSync4(path))
    return;
  try {
    const raw = JSON.parse(readFileSync3(path, "utf-8"));
    if (Array.isArray(raw?.enabledModels))
      return raw.enabledModels;
  } catch {}
  return;
}
function readEnabledModels(cwd) {
  const [project, global] = settingsPaths(cwd);
  return readField(project) ?? readField(global);
}
function hashOf(path) {
  try {
    const s = statSync2(path);
    return `${s.mtimeMs}-${s.size}`;
  } catch {
    return "missing";
  }
}
function resolveEnabledModels(patterns, registry, cwd = process.cwd()) {
  const patternsKey = JSON.stringify(patterns);
  const [project, global] = settingsPaths(cwd);
  const fileHash = `${hashOf(project)};${hashOf(global)}`;
  if (fileHash === cachedHash && patternsKey === cachedPatternsKey) {
    return cachedAllowed;
  }
  if (!patterns || patterns.length === 0) {
    cachedHash = fileHash;
    cachedPatternsKey = patternsKey;
    cachedAllowed = undefined;
    return;
  }
  const available = registry.getAvailable?.() ?? registry.getAll();
  const allowed = new Set;
  for (const pattern of patterns) {
    const trimmed = pattern.trim();
    if (!trimmed)
      continue;
    resolveExact(trimmed, available, allowed);
  }
  const result = allowed.size > 0 ? allowed : undefined;
  cachedHash = fileHash;
  cachedPatternsKey = patternsKey;
  cachedAllowed = result;
  return result;
}
function isModelInScope(model, allowed) {
  return allowed.has(modelKey(model));
}
function modelKey(model) {
  return `${model.provider}/${model.id}`.toLowerCase();
}
function resolveExact(pattern, available, allowed) {
  const slashIdx = pattern.indexOf("/");
  if (slashIdx === -1)
    return;
  const provider = pattern.slice(0, slashIdx).toLowerCase();
  const modelId = pattern.slice(slashIdx + 1).toLowerCase();
  const exact = available.find((m) => m.provider.toLowerCase() === provider && m.id.toLowerCase() === modelId);
  if (exact) {
    allowed.add(modelKey(exact));
  }
}
var cachedAllowed, cachedHash = "", cachedPatternsKey = "";
var init_enabled_models = () => {};

// dist/model-scope.js
function isScopeModelsEnabled() {
  return scopeModelsEnabled;
}
function setScopeModelsEnabled(enabled) {
  scopeModelsEnabled = enabled;
}
function checkModelScope(args) {
  const { model, cwd, modelRegistry, callerSupplied, agentLabel, modelInput } = args;
  if (!scopeModelsEnabled || !model)
    return { kind: "ok" };
  const allowed = resolveEnabledModels(readEnabledModels(cwd), modelRegistry, cwd);
  if (!allowed || isModelInScope(model, allowed))
    return { kind: "ok" };
  if (callerSupplied) {
    const list = [...allowed].sort().map((m) => `  ${m}`).join(`
`);
    return {
      kind: "error",
      message: `Model not in scope: "${modelInput}".

Allowed models (from enabledModels):
${list}`
    };
  }
  const modelLabel = modelInput ?? `${model.provider}/${model.id}`;
  return {
    kind: "warn",
    message: `Agent "${agentLabel}" using out-of-scope model "${modelLabel}"`
  };
}
var scopeModelsEnabled = false;
var init_model_scope = __esm(() => {
  init_enabled_models();
});

// dist/output-file.js
import { appendFileSync as appendFileSync2, chmodSync, mkdirSync as mkdirSync3, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as join7 } from "node:path";
function getOutputTranscriptDefault() {
  return outputTranscriptDefault;
}
function setOutputTranscriptDefault(b) {
  outputTranscriptDefault = b;
}
function encodeCwd(cwd) {
  return cwd.replace(/[/\\]/g, "-").replace(/^[A-Za-z]:-/, "").replace(/^-+/, "");
}
function sessionTaskDir(cwd, sessionId) {
  const encoded = encodeCwd(cwd);
  const root = join7(tmpdir(), `pi-subagents-${process.getuid?.() ?? 0}`);
  mkdirSync3(root, { recursive: true, mode: 448 });
  try {
    chmodSync(root, 448);
  } catch (err) {
    if (process.platform !== "win32")
      throw err;
  }
  const dir = join7(root, encoded, sessionId, "tasks");
  mkdirSync3(dir, { recursive: true });
  return dir;
}
function createOutputFilePath(cwd, agentId, sessionId) {
  return join7(sessionTaskDir(cwd, sessionId), `${agentId}.output`);
}
function ensureOutputFile(path) {
  try {
    appendFileSync2(path, "", "utf-8");
  } catch {}
}
function writeInitialEntry(path, agentId, prompt, cwd) {
  const entry = {
    isSidechain: true,
    agentId,
    type: "user",
    message: { role: "user", content: prompt },
    timestamp: new Date().toISOString(),
    cwd
  };
  writeFileSync(path, JSON.stringify(entry) + `
`, "utf-8");
}
function streamToOutputFile(session, path, agentId, cwd, startIndex) {
  let writtenCount = startIndex;
  const flush = () => {
    const messages = session.messages;
    if (writtenCount === undefined) {
      const firstUser = messages.findIndex((m) => m.role === "user");
      if (firstUser < 0)
        return;
      writtenCount = firstUser + 1;
    }
    let chunk = "";
    while (writtenCount < messages.length) {
      const msg = messages[writtenCount];
      writtenCount++;
      if (msg.role === "system")
        continue;
      const entry = {
        isSidechain: true,
        agentId,
        type: msg.role === "assistant" ? "assistant" : msg.role === "user" ? "user" : "toolResult",
        message: msg,
        timestamp: new Date().toISOString(),
        cwd
      };
      chunk += JSON.stringify(entry) + `
`;
    }
    if (!chunk)
      return;
    try {
      appendFileSync2(path, chunk, "utf-8");
    } catch {}
  };
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "turn_end")
      flush();
    if (event.type === "compaction_start")
      flush();
    if (event.type === "compaction_end" && !event.aborted && event.result) {
      queueMicrotask(() => {
        writtenCount = session.messages.length;
      });
    }
  });
  return () => {
    flush();
    unsubscribe();
  };
}
var outputTranscriptDefault = true;
var init_output_file = () => {};

// dist/status-note.js
function getStatusNote(status, stopCause) {
  switch (status) {
    case "stopped":
      return stopCause === "session-end" ? " (INTERRUPTED when the parent session ended, not stopped by anyone — output is partial and the task was NOT finished; the agent keeps its context and can be resumed)" : " (STOPPED BY THE USER before completion — the user ended this run; output is partial and the task was NOT finished)";
    case "aborted":
      return " (aborted — hit the turn limit before completion; output may be incomplete)";
    case "steered":
      return " (wrapped up at the turn limit — output may be partial)";
    default:
      return "";
  }
}
function getForegroundOutcomeNote(status, stopCause) {
  switch (status) {
    case "stopped":
      return stopCause === "session-end" ? " (interrupted when the session ended — everything the agent produced is above; the task is unfinished)" : " (STOPPED BY THE USER — everything the agent produced is above; the task is unfinished)";
    case "aborted":
      return " (aborted at the turn limit — everything the agent produced is above; the task is unfinished)";
    case "steered":
      return " (wrapped up at the turn limit — everything the agent produced is above; the task may be unfinished)";
    default:
      return "";
  }
}
function agentIdLine(id) {
  return `

Agent ID: ${id} (pass it as \`resume\` to continue this agent)`;
}
function resumeHintXml(record) {
  if (!record.sessionFile || !isFailedStatus(record.status))
    return null;
  return `<resume>It keeps its context: pass ${record.id} as \`resume\` to continue this agent instead of starting a fresh one.</resume>`;
}
function partialOutputSuffix(record) {
  const partial = record.result?.trim();
  return partial ? `

Partial output before the failure:
${partial}` : "";
}
function isFailedStatus(status) {
  return status === "error" || status === "aborted" || status === "stopped";
}
function sessionFileLine(record) {
  return record.sessionFile ? `

Session file (every turn of this agent): ${record.sessionFile}` : "";
}
function runModelText(record) {
  const modelId = record.invocation?.modelId;
  if (!modelId)
    return;
  const thinking = record.invocation?.thinking;
  return thinking ? `${modelId}, thinking: ${thinking}` : modelId;
}

// dist/tool-args.js
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseJsonObject(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}"))
    return;
  try {
    const parsed = JSON.parse(trimmed);
    return isPlainObject(parsed) ? parsed : undefined;
  } catch {
    return;
  }
}
function knownKeys(shape) {
  return new Set([...shape.strings, ...shape.booleans ?? [], ...shape.numbers ?? []]);
}
function repairToolArgs(raw, shape) {
  let args = raw;
  if (typeof args === "string")
    args = parseJsonObject(args) ?? args;
  if (!isPlainObject(args))
    return raw;
  const known = knownKeys(shape);
  const out = { ...args };
  let changed = args !== raw;
  for (const field of shape.strings) {
    const value = out[field];
    if (typeof value !== "string")
      continue;
    const inner = parseJsonObject(value);
    if (!inner || !(field in inner) || !Object.keys(inner).every((key) => known.has(key)))
      continue;
    for (const [key, innerValue] of Object.entries(inner)) {
      if (key === field || out[key] === undefined || out[key] === null)
        out[key] = innerValue;
    }
    changed = true;
  }
  const required = new Set(shape.required ?? []);
  const multiline = new Set(shape.multiline ?? []);
  for (const field of shape.strings) {
    const value = out[field];
    if (value === null && !required.has(field)) {
      delete out[field];
      changed = true;
    } else if (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" || typeof item === "number")) {
      out[field] = value.join(multiline.has(field) ? `
` : " ");
      changed = true;
    } else if (typeof value === "number" || typeof value === "boolean") {
      out[field] = String(value);
      changed = true;
    }
  }
  for (const field of shape.defaultBlank ?? []) {
    if (out[field] === undefined || out[field] === null) {
      out[field] = "";
      changed = true;
    }
  }
  for (const field of shape.booleans ?? []) {
    const value = out[field];
    if (value === null) {
      delete out[field];
      changed = true;
    } else if (typeof value === "string" && /^(true|false)$/i.test(value.trim())) {
      out[field] = value.trim().toLowerCase() === "true";
      changed = true;
    }
  }
  for (const field of shape.numbers ?? []) {
    const value = out[field];
    if (value === null) {
      delete out[field];
      changed = true;
    } else if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
      out[field] = Number(value);
      changed = true;
    }
  }
  return changed ? out : raw;
}
function argumentRepair(shape) {
  return (args) => repairToolArgs(args, shape);
}
var AGENT_ARG_SHAPE, NESTED_AGENT_ARG_SHAPE, RESULT_ARG_SHAPE, STEER_ARG_SHAPE;
var init_tool_args = __esm(() => {
  AGENT_ARG_SHAPE = {
    strings: ["prompt", "description", "name", "subagent_type", "model", "thinking", "resume", "isolation", "schedule"],
    multiline: ["prompt"],
    booleans: ["run_in_background", "isolated", "inherit_context"],
    numbers: ["max_turns"],
    required: ["prompt", "description"],
    defaultBlank: ["subagent_type"]
  };
  NESTED_AGENT_ARG_SHAPE = {
    strings: ["prompt", "description", "subagent_type", "model", "thinking", "resume", "isolation"],
    multiline: ["prompt"],
    booleans: ["run_in_background", "isolated", "inherit_context"],
    numbers: ["max_turns"],
    required: ["prompt", "description", "subagent_type"]
  };
  RESULT_ARG_SHAPE = {
    strings: ["agent_id"],
    booleans: ["wait", "verbose"],
    required: ["agent_id"]
  };
  STEER_ARG_SHAPE = {
    strings: ["agent_id", "message"],
    multiline: ["message"],
    required: ["agent_id", "message"]
  };
});

// dist/usage.js
function getLifetimeTotal(u) {
  return u ? u.input + u.output + u.cacheWrite : 0;
}
function getLifetimeCost(u) {
  return u?.cost ?? 0;
}
function addUsage(into, delta) {
  into.input += delta.input;
  into.output += delta.output;
  into.cacheWrite += delta.cacheWrite;
  if (delta.cacheRead)
    into.cacheRead = (into.cacheRead ?? 0) + delta.cacheRead;
  if (delta.cost)
    into.cost = (into.cost ?? 0) + delta.cost;
}
function toReportedUsage(u) {
  const { input, output, cacheWrite, cacheRead = 0, cost = 0 } = u;
  if (input === 0 && output === 0 && cacheWrite === 0 && cacheRead === 0 && cost === 0)
    return;
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: input + output + cacheRead + cacheWrite,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: cost }
  };
}

class PendingUsagePool {
  pending = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0 };
  dirty = false;
  add(delta) {
    addUsage(this.pending, delta);
    this.dirty = true;
  }
  drain() {
    if (!this.dirty)
      return;
    const drained = toReportedUsage(this.pending);
    this.pending = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0 };
    this.dirty = false;
    return drained;
  }
}
function getSessionContextPercent(session) {
  if (!session)
    return null;
  try {
    return session.getSessionStats().contextUsage?.percent ?? null;
  } catch {
    return null;
  }
}
function getCachedSessionContextPercent(session) {
  if (!session)
    return null;
  let entry = percentCache.get(session);
  if (!entry) {
    const created = { percent: null, at: 0, dirty: true, evented: false };
    if (typeof session.subscribe === "function") {
      try {
        session.subscribe((event) => {
          if (!STREAMING_EVENTS.has(event?.type))
            created.dirty = true;
        });
        created.evented = true;
      } catch {}
    }
    percentCache.set(session, created);
    entry = created;
  }
  const now = Date.now();
  const maxAge = entry.evented ? CONTEXT_PERCENT_BACKSTOP_MS : CONTEXT_PERCENT_POLL_MS;
  if (entry.dirty || now - entry.at >= maxAge) {
    entry.percent = getSessionContextPercent(session);
    entry.at = now;
    entry.dirty = false;
  }
  return entry.percent;
}
var STREAMING_EVENTS, CONTEXT_PERCENT_POLL_MS = 1000, CONTEXT_PERCENT_BACKSTOP_MS = 5000, percentCache;
var init_usage = __esm(() => {
  STREAMING_EVENTS = new Set(["message_update", "tool_execution_update"]);
  percentCache = new WeakMap;
});

// dist/worktree.js
import { existsSync as existsSync5, mkdirSync as mkdirSync4, mkdtempSync, realpathSync, rmdirSync, statSync as statSync3 } from "node:fs";
import { tmpdir as tmpdir2 } from "node:os";
import { basename as basename2, dirname, join as join8, relative } from "node:path";
function setWorktreeIsolationEnabled(enabled) {
  worktreeIsolationEnabled = enabled;
}
function isWorktreeIsolationEnabled() {
  return worktreeIsolationEnabled;
}
function isRegenerable(path) {
  const parts = path.replace(/\/+$/, "").split("/");
  return parts.some((part) => REGENERABLE_IGNORED.has(part)) || /\.py[co]$/.test(path);
}
function listPaths(paths) {
  const shown = paths.slice(0, NOTE_PATHS).map((p) => `\`${p}\``).join(", ");
  return paths.length > NOTE_PATHS ? `${shown} and ${paths.length - NOTE_PATHS} more` : shown;
}
async function stashTop(pi, cwd) {
  try {
    return await git(pi, cwd, ["rev-parse", "-q", "--verify", "refs/stash"], 5000) || undefined;
  } catch {
    return;
  }
}
async function stashNote(pi, worktree) {
  const now = await stashTop(pi, worktree.path);
  if (now === undefined || now === worktree.stashTop)
    return;
  let added = 1;
  try {
    const entries = (await git(pi, worktree.path, ["stash", "list", "--format=%H"], 5000)).split(`
`);
    const at = worktree.stashTop === undefined ? -1 : entries.indexOf(worktree.stashTop);
    added = at === -1 ? entries.length : at;
  } catch {}
  return `${added} new stash entr${added === 1 ? "y" : "ies"} appeared in the repository while this agent ran ` + "(`git stash list`). If the agent stashed its work, it is there, not on a branch.";
}
async function git(pi, cwd, args, timeout) {
  const result = await commandExec(pi)("git", args, { cwd, timeout });
  if (result.killed || result.code !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed (exit ${result.code})`);
  }
  return result.stdout.trim();
}
async function createWorktree(pi, cwd, agentId) {
  let baseSha;
  let subdir;
  try {
    await git(pi, cwd, ["rev-parse", "--is-inside-work-tree"], 5000);
    baseSha = await git(pi, cwd, ["rev-parse", "HEAD"], 5000);
    const topLevel = await git(pi, cwd, ["rev-parse", "--show-toplevel"], 5000);
    subdir = relative(realpathSync(topLevel), realpathSync(cwd));
  } catch {
    return;
  }
  const branch = `pi-agent-${agentId}`;
  let parent;
  try {
    parent = mkdtempSync(join8(tmpdir2(), `pi-agent-${agentId}-`));
  } catch {
    return;
  }
  const worktreePath = join8(parent, branch);
  try {
    await git(pi, cwd, ["worktree", "add", "--detach", worktreePath, "HEAD"], 30000);
    await lockWorktree(pi, worktreePath);
    const stash = await stashTop(pi, cwd);
    return {
      path: worktreePath,
      branch,
      baseSha,
      workPath: subdir ? join8(worktreePath, subdir) : worktreePath,
      ...stash !== undefined ? { stashTop: stash } : {}
    };
  } catch {
    removeParentDir(worktreePath);
    return;
  }
}
async function cleanupWorktree(pi, cwd, worktree, agentDescription, beforeRemove) {
  const result = await commitAndRemove(pi, cwd, worktree, agentDescription, beforeRemove);
  if (existsSync5(worktree.path))
    await unlockWorktree(pi, worktree.path);
  return result;
}
async function commitAndRemove(pi, cwd, worktree, agentDescription, beforeRemove) {
  if (!existsSync5(worktree.path)) {
    removeParentDir(worktree.path);
    return { hasChanges: false };
  }
  const kept = { hasChanges: true, path: worktree.path };
  const notes = [];
  let head;
  let keepReasons;
  try {
    const status = await git(pi, worktree.path, ["status", "--porcelain"], 1e4);
    if (status) {
      await git(pi, worktree.path, ["add", "-A"], 1e4);
      const safeDesc = agentDescription.slice(0, 200);
      const commitArgs = ["-c", "commit.gpgsign=false", "commit", "--no-verify", "-m", `pi-agent: ${safeDesc}`];
      try {
        await git(pi, worktree.path, commitArgs, 1e4);
      } catch {
        await git(pi, worktree.path, [...FALLBACK_IDENTITY, ...commitArgs], 1e4);
      }
    }
    head = await git(pi, worktree.path, ["rev-parse", "HEAD"], 5000);
    keepReasons = await unsavableContent(pi, worktree, head);
  } catch {
    return kept;
  }
  if (beforeRemove) {
    try {
      await beforeRemove(worktree.path);
    } catch {}
    try {
      await git(pi, worktree.path, ["reset", "-q", "--hard", head], 1e4);
      await git(pi, worktree.path, ["clean", "-fdq"], 1e4);
    } catch {}
  }
  const stash = await stashNote(pi, worktree);
  if (stash)
    notes.push(stash);
  if (head === worktree.baseSha) {
    if (keepReasons.length > 0) {
      return { hasChanges: true, path: worktree.path, kept: true, notes: [...keepReasons, ...notes] };
    }
    await removeWorktree(pi, cwd, worktree.path);
    return { hasChanges: false, ...notes.length > 0 ? { notes } : {} };
  }
  try {
    if (await currentBranch(pi, worktree.path) !== worktree.branch) {
      let branchName = worktree.branch;
      try {
        await git(pi, worktree.path, ["branch", branchName, head], 5000);
      } catch {
        branchName = `${worktree.branch}-${Date.now()}`;
        await git(pi, worktree.path, ["branch", branchName, head], 5000);
      }
      worktree.branch = branchName;
    }
    const saved = await git(pi, worktree.path, ["rev-parse", "--verify", "-q", `refs/heads/${worktree.branch}`], 5000);
    if (saved !== head)
      return { ...kept, notes };
  } catch {
    return { ...kept, notes };
  }
  if (keepReasons.length > 0) {
    return { hasChanges: true, branch: worktree.branch, path: worktree.path, kept: true, notes: [...keepReasons, ...notes] };
  }
  await removeWorktree(pi, cwd, worktree.path);
  return {
    hasChanges: true,
    branch: worktree.branch,
    path: worktree.path,
    ...notes.length > 0 ? { notes } : {}
  };
}
async function unsavableContent(pi, worktree, head) {
  const reasons = [];
  if (head !== worktree.baseSha) {
    const diff = await git(pi, worktree.path, ["diff", "--raw", "--no-renames", "--no-abbrev", worktree.baseSha, head], 1e4);
    const repos = diff.split(`
`).map((line) => /^:\d+ (\d+) \S+ \S+ \S+\t(.+)$/.exec(line)).filter((m) => m !== null && m[1] === "160000").map((m) => m[2]);
    if (repos.length > 0) {
      reasons.push(`it contains git repositories whose contents the branch cannot hold (${listPaths(repos)})`);
    }
  }
  const ignored = (await git(pi, worktree.path, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory"], 1e4)).split(`
`).filter((path) => path && !isRegenerable(path));
  if (ignored.length > 0) {
    reasons.push(`it holds files git ignores, which are not on any branch (${listPaths(ignored)})`);
  }
  return reasons;
}
async function currentBranch(pi, cwd) {
  try {
    return await git(pi, cwd, ["symbolic-ref", "-q", "--short", "HEAD"], 5000) || undefined;
  } catch {
    return;
  }
}
async function restoreWorktree(pi, repo, worktree, prior) {
  if (existsSync5(worktree.path)) {
    try {
      await git(pi, worktree.path, ["rev-parse", "--is-inside-work-tree"], 5000);
      await lockWorktree(pi, worktree.path);
      return;
    } catch {
      return `its worktree path \`${worktree.path}\` exists but is not a git work tree`;
    }
  }
  try {
    await git(pi, repo, ["worktree", "prune"], 5000);
  } catch {}
  const branch = prior?.hasChanges ? prior.branch : undefined;
  if (prior?.hasChanges && !branch) {
    return `its worktree \`${worktree.path}\` was kept with uncommitted changes and no longer exists`;
  }
  try {
    if (branch)
      await git(pi, repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], 5000);
    else
      await git(pi, repo, ["cat-file", "-e", `${worktree.baseSha}^{commit}`], 5000);
  } catch {
    return branch ? `its branch \`${branch}\` no longer exists` : `its base commit ${worktree.baseSha.slice(0, 12)} no longer exists in \`${repo}\``;
  }
  const parent = dirname(worktree.path);
  let createdParent = false;
  if (existsSync5(parent)) {
    const st = statSync3(parent);
    const ownedByUs = process.getuid === undefined || st.uid === process.getuid();
    if (!st.isDirectory() || !ownedByUs || (st.mode & 63) !== 0) {
      return `\`${parent}\` exists and is not a private directory of this user`;
    }
  } else {
    try {
      mkdirSync4(parent, { mode: 448 });
      createdParent = true;
    } catch (err) {
      return `cannot recreate \`${parent}\`: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  try {
    if (branch) {
      try {
        await git(pi, repo, ["worktree", "add", worktree.path, branch], 30000);
      } catch {
        await git(pi, repo, ["worktree", "add", "--detach", worktree.path, branch], 30000);
      }
      worktree.branch = branch;
    } else {
      await git(pi, repo, ["worktree", "add", "--detach", worktree.path, worktree.baseSha], 30000);
    }
    worktree.baseSha = await git(pi, worktree.path, ["rev-parse", "HEAD"], 5000);
    worktree.stashTop = await stashTop(pi, repo);
    await lockWorktree(pi, worktree.path);
  } catch (err) {
    if (existsSync5(worktree.path))
      await removeWorktree(pi, repo, worktree.path);
    else if (createdParent)
      removeParentDir(worktree.path);
    return `\`git worktree add\` failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  return;
}
function removeParentDir(worktreePath) {
  try {
    rmdirSync(dirname(worktreePath));
  } catch {}
}
async function removeWorktree(pi, cwd, worktreePath) {
  try {
    await git(pi, cwd, ["worktree", "remove", "--force", "--force", worktreePath], 1e4);
  } catch {
    try {
      await git(pi, cwd, ["worktree", "prune"], 5000);
    } catch {}
  }
  removeParentDir(worktreePath);
}
async function pruneWorktrees(pi, cwd) {
  try {
    await git(pi, cwd, ["worktree", "prune"], 5000);
  } catch {}
}
async function lockWorktree(pi, path) {
  try {
    await git(pi, path, ["worktree", "lock", "--reason", `${LOCK_REASON_PREFIX}${process.pid}`, path], 5000);
  } catch {}
}
async function unlockWorktree(pi, path) {
  try {
    await git(pi, path, ["worktree", "unlock", path], 5000);
  } catch {}
}
function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
async function listWorktrees(pi, repo) {
  const out = await git(pi, repo, ["worktree", "list", "--porcelain"], 1e4);
  const records = [];
  for (const block of out.split(/\n\s*\n/)) {
    const record = {};
    for (const line of block.split(`
`)) {
      if (line.startsWith("worktree "))
        record.path = line.slice("worktree ".length);
      else if (line.startsWith("HEAD "))
        record.head = line.slice("HEAD ".length);
      else if (line === "locked")
        record.locked = "";
      else if (line.startsWith("locked "))
        record.locked = line.slice("locked ".length);
    }
    if (record.path)
      records.push(record);
  }
  return records;
}
function agentWorktreeId(path) {
  const id = /^pi-agent-(.+)$/.exec(basename2(path))?.[1];
  return id !== undefined && basename2(dirname(path)).startsWith(`pi-agent-${id}-`) ? id : undefined;
}
async function recoverLeftoverWorktrees(pi, repo) {
  let registered;
  try {
    registered = await listWorktrees(pi, repo);
  } catch {
    return [];
  }
  const lines = [];
  let pruneNeeded = false;
  for (const wt of registered) {
    const id = agentWorktreeId(wt.path);
    if (id === undefined)
      continue;
    const owner = wt.locked?.startsWith(LOCK_REASON_PREFIX) ? Number(wt.locked.slice(LOCK_REASON_PREFIX.length)) : undefined;
    if (owner !== undefined && processAlive(owner))
      continue;
    if (!existsSync5(wt.path)) {
      if (owner !== undefined) {
        try {
          await git(pi, repo, ["worktree", "unlock", wt.path], 5000);
        } catch {}
        pruneNeeded = true;
      }
      continue;
    }
    try {
      if (owner === undefined) {
        const line = await describeKeptWorktree(pi, wt.path);
        if (line)
          lines.push(line);
        continue;
      }
      const head = wt.head ?? await git(pi, wt.path, ["rev-parse", "HEAD"], 5000);
      const onBranch = await git(pi, repo, ["for-each-ref", "--count=1", "--contains", head, "refs/heads"], 5000) !== "";
      const baseSha = onBranch ? head : await git(pi, repo, ["merge-base", head, "HEAD"], 5000);
      const info = { path: wt.path, branch: `pi-agent-${id}-recovered`, baseSha, workPath: wt.path };
      const result = await cleanupWorktree(pi, repo, info, `work of agent ${id}, recovered after pi stopped`);
      if (!result.hasChanges)
        continue;
      const where = [
        result.branch ? `saved to branch \`${result.branch}\`` : undefined,
        result.path && (result.kept || !result.branch) ? `worktree kept at \`${result.path}\`` : undefined
      ].filter(Boolean).join("; ");
      lines.push(`Agent ${id} was interrupted with unsaved work: ${where}.${result.notes?.length ? ` ${result.notes.join(" ")}` : ""}`);
    } catch {}
  }
  if (pruneNeeded)
    await pruneWorktrees(pi, repo);
  return lines;
}
async function describeKeptWorktree(pi, path) {
  const status = await git(pi, path, ["status", "--porcelain"], 1e4);
  if (status)
    return `Agent worktree \`${path}\` has uncommitted changes.`;
  const ignored = (await git(pi, path, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory"], 1e4)).split(`
`).filter((p) => p && !isRegenerable(p));
  if (ignored.length > 0) {
    return `Agent worktree \`${path}\` is kept for files git ignores (${listPaths(ignored)}); ` + `remove it with \`git worktree remove --force ${path}\` when done.`;
  }
  return;
}
async function pruneMergedAgentBranches(pi, repo, now = Date.now()) {
  let listing;
  try {
    listing = await git(pi, repo, ["for-each-ref", "--merged=HEAD", "--format=%(refname:short)%09%(committerdate:unix)", "refs/heads/pi-agent-*"], 1e4);
  } catch {
    return [];
  }
  const cutoff = now / 1000 - MERGED_BRANCH_MAX_AGE_DAYS * 86400;
  const deleted = [];
  for (const line of listing.split(`
`)) {
    const [name, time] = line.split("\t");
    if (!name || !(Number(time) < cutoff))
      continue;
    try {
      await git(pi, repo, ["branch", "-d", name], 5000);
      deleted.push(name);
    } catch {}
  }
  return deleted;
}
var worktreeIsolationEnabled = true, REGENERABLE_IGNORED, NOTE_PATHS = 5, FALLBACK_IDENTITY, LOCK_REASON_PREFIX = "pi-agent pid ", MERGED_BRANCH_MAX_AGE_DAYS = 7;
var init_worktree = __esm(() => {
  init_exec_tree();
  REGENERABLE_IGNORED = new Set([
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".tox",
    ".gradle",
    "target",
    "coverage",
    ".nyc_output",
    ".next",
    ".nuxt",
    ".turbo",
    ".cache",
    ".parcel-cache",
    "dist",
    "build",
    ".DS_Store"
  ]);
  FALLBACK_IDENTITY = ["-c", "user.name=pi-agent", "-c", "user.email=pi-agent@localhost"];
});

// dist/nested-tools.js
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type as Type2 } from "typebox";
function getMaxSubagentDepth() {
  return maxSubagentDepth;
}
function setMaxSubagentDepth(n) {
  maxSubagentDepth = Math.max(0, Math.floor(n));
}
function textResult(text, isError = false) {
  return { content: [{ type: "text", text }], isError, details: {} };
}
function ownsRecord(record, parentAgentId) {
  return record?.parentAgentId === parentAgentId;
}
function formatRecord(record, position) {
  const idLine = position === "inline" ? agentIdLine(record.id) : "";
  if (record.status === "error") {
    return `Agent failed: ${record.error ?? "unknown error"}${partialOutputSuffix(record)}${sessionFileLine(record)}${idLine}`;
  }
  if (record.status === "queued" || record.status === "running") {
    return `Agent ${record.id} is ${record.status}.`;
  }
  const text = record.result?.trim() || record.error?.trim() || "No output.";
  const note = position === "inline" ? getForegroundOutcomeNote(record.status, record.stopCause) : getStatusNote(record.status, record.stopCause);
  const sessionLine = isFailedStatus(record.status) ? sessionFileLine(record) : "";
  return (note ? `Nested agent${note}.

${text}` : text) + sessionLine + idLine;
}
function createNestedSubagentTools(context) {
  const bookIntoAncestors = (usage) => {
    for (let id = context.parentAgentId;id !== undefined; ) {
      const ancestor = context.manager.getRecord(id);
      if (!ancestor)
        break;
      addUsage(ancestor.lifetimeUsage, usage);
      id = ancestor.parentAgentId;
    }
  };
  const loadRegistry = () => buildAgentRegistry(loadCustomAgents(context.configCwd, false, { project: context.projectTrusted !== false }));
  const allowedTypesIn = (registry) => context.allowedSubagents === "all" ? undefined : new Set(context.allowedSubagents.map((name) => resolveTypeIn(registry, name) ?? name));
  const availableIn = (registry) => {
    const allowed = allowedTypesIn(registry);
    return getAvailableTypesIn(registry).filter((name) => allowed === undefined || allowed.has(name));
  };
  const agentTool = defineTool({
    name: NESTED_TOOL_NAMES[0],
    label: "Agent",
    description: "Launch a child-safe nested subagent for bounded delegated work. " + "Only use agent types allowed by this parent agent; nesting is depth-limited.",
    parameters: Type2.Object({
      prompt: Type2.String({ description: "Self-contained task for the nested agent." }),
      description: Type2.String({ description: "Short 3-5 word task description." }),
      subagent_type: Type2.String({ description: `Allowed nested agent type. Available: ${availableIn(loadRegistry()).join(", ") || "none"}.` }),
      ...isModelOverrideAllowed() ? {
        model: Type2.Optional(Type2.String({ description: "Optional provider/model override." })),
        thinking: Type2.Optional(Type2.String({ description: "Optional thinking level." }))
      } : {},
      max_turns: Type2.Optional(Type2.Number({ minimum: 1 })),
      run_in_background: Type2.Optional(Type2.Boolean({
        description: "Defaults to false for nested spawns — the call blocks and returns the child's result inline. Set true only for work you will collect later with get_subagent_result; a detached child is stopped when you finish."
      })),
      resume: Type2.Optional(Type2.String({ description: "Resume a nested agent owned by this parent." })),
      isolated: Type2.Optional(Type2.Boolean()),
      inherit_context: Type2.Optional(Type2.Boolean()),
      ...isolationParam(isWorktreeIsolationEnabled())
    }),
    prepareArguments: argumentRepair(NESTED_AGENT_ARG_SHAPE),
    execute: async (_toolCallId, params, signal, _onUpdate, ctx) => {
      if (params.resume) {
        const existing = context.manager.getRecord(params.resume);
        const evicted = existing ? undefined : context.manager.findTombstone?.(params.resume);
        const owned = existing ? ownsRecord(existing, context.parentAgentId) : evicted?.parentAgentId === context.parentAgentId;
        if (!owned) {
          return textResult(`Nested agent not found or not owned by this parent: "${params.resume}".`, true);
        }
        let resumed;
        try {
          resumed = await context.manager.resume(params.resume, params.prompt, signal, {
            pi: context.pi,
            ctx,
            onAssistantUsage: bookIntoAncestors
          });
        } catch (err) {
          return textResult(err instanceof Error ? err.message : String(err), true);
        }
        return resumed ? textResult(formatRecord(resumed, "inline"), isFailedStatus(resumed.status)) : textResult(`Nested agent "${params.resume}" is still running — it can only be resumed once its current run finishes.`, true);
      }
      if (context.depth >= context.maxSubagentDepth) {
        return textResult(`Nested subagent call blocked (depth=${context.depth}, max=${context.maxSubagentDepth}). Complete the task directly.`, true);
      }
      const registry = loadRegistry();
      const rawType = params.subagent_type;
      const resolvedType = resolveEnabledTypeIn(registry, rawType);
      if (resolvedType === undefined) {
        return textResult(`Unknown or disabled nested agent type: "${rawType}". Allowed: ${availableIn(registry).join(", ") || "none"}.`, true);
      }
      const allowed = allowedTypesIn(registry);
      if (allowed !== undefined && !allowed.has(resolvedType)) {
        return textResult(`Nested agent type "${resolvedType}" is not allowed for this parent. Allowed: ${[...allowed].join(", ")}.`, true);
      }
      const config = getAgentConfigIn(registry, resolvedType);
      const invocation = resolveAgentInvocationConfig(config, params, {
        worktreeAllowed: isWorktreeIsolationEnabled(),
        defaultRunInBackground: false
      });
      let model = ctx.model;
      let modelNote;
      if (invocation.modelInput) {
        const resolution = resolveModelDetailed(invocation.modelInput, ctx.modelRegistry, ctx.model?.provider);
        if (resolution.ok) {
          model = resolution.model;
        } else if (invocation.modelFromParams) {
          return textResult(resolution.message, true);
        } else {
          modelNote = unresolvedModelNote(invocation.modelInput, unresolvedReason(resolution), model ?? "the parent agent's model");
        }
      }
      const notePrefix = modelNote ? `${modelNote}

` : "";
      const scopeVerdict = checkModelScope({
        model,
        cwd: context.configCwd,
        modelRegistry: ctx.modelRegistry,
        callerSupplied: invocation.modelFromParams,
        agentLabel: config?.displayName ?? resolvedType,
        modelInput: invocation.modelInput
      });
      if (scopeVerdict.kind === "error")
        return textResult(scopeVerdict.message, true);
      const rootSessionId = context.manager.getRecord(context.parentAgentId)?.rootSessionId;
      const childDepth = context.depth + 1;
      const options = {
        description: params.description,
        model,
        maxTurns: invocation.maxTurns,
        isolated: invocation.isolated,
        inheritContext: invocation.inheritContext,
        thinkingLevel: invocation.thinking,
        isolation: invocation.isolation,
        invocation: {
          thinking: invocation.thinking,
          maxTurns: invocation.maxTurns,
          isolated: invocation.isolated,
          inheritContext: invocation.inheritContext,
          runInBackground: invocation.runInBackground,
          isolation: invocation.isolation
        },
        modelNote,
        onAssistantUsage: bookIntoAncestors,
        depth: childDepth,
        parentAgentId: context.parentAgentId,
        maxSubagentDepth: context.maxSubagentDepth,
        configCwd: context.configCwd,
        rootSessionId
      };
      const transcriptSessionId = rootSessionId !== undefined && (config?.outputTranscript ?? getOutputTranscriptDefault()) ? rootSessionId : undefined;
      let childId;
      const attachTranscript = (id) => {
        childId = id;
        if (transcriptSessionId === undefined)
          return;
        const rec = context.manager.getRecord(id);
        if (!rec)
          return;
        rec.outputFile = createOutputFilePath(context.configCwd, id, transcriptSessionId);
        writeInitialEntry(rec.outputFile, id, params.prompt, ctx.cwd);
      };
      options.onSessionCreated = (session) => {
        const rec = childId === undefined ? undefined : context.manager.getRecord(childId);
        if (rec?.outputFile && childId !== undefined) {
          rec.outputCleanup = streamToOutputFile(session, rec.outputFile, childId, ctx.cwd);
        }
      };
      try {
        if (invocation.runInBackground) {
          const id = context.manager.spawn(context.pi, ctx, resolvedType, params.prompt, {
            ...options,
            isBackground: true
          });
          attachTranscript(id);
          await context.manager.awaitStartup(id);
          return textResult(`${notePrefix}Nested agent started in background. Agent ID: ${id}`);
        }
        const { record } = await context.manager.spawnAndWait(context.pi, ctx, resolvedType, params.prompt, { ...options, signal }, attachTranscript);
        return textResult(notePrefix + formatRecord(record, "inline"), isFailedStatus(record.status));
      } catch (err) {
        return textResult(err instanceof Error ? err.message : String(err), true);
      }
    }
  });
  const resultTool = defineTool({
    name: NESTED_TOOL_NAMES[1],
    label: "Get Nested Agent Result",
    description: "Check or wait for a background nested agent owned by this parent.",
    parameters: Type2.Object({
      agent_id: Type2.String(),
      wait: Type2.Optional(Type2.Boolean())
    }),
    prepareArguments: argumentRepair(RESULT_ARG_SHAPE),
    execute: async (_toolCallId, params, signal) => {
      const record = context.manager.getRecord(params.agent_id);
      if (!ownsRecord(record, context.parentAgentId)) {
        return textResult(`Nested agent not found or not owned by this parent: "${params.agent_id}".`, true);
      }
      if (params.wait && (record.status === "queued" || record.status === "running" || context.manager.isRunActive?.(record.id))) {
        while (record.status === "queued") {
          await abortable(record.startGate ?? new Promise((resolve3) => setTimeout(resolve3, 250)), signal);
        }
        if (record.promise)
          await abortable(record.promise, signal);
      }
      return textResult(formatRecord(record, "fetched"), isFailedStatus(record.status));
    }
  });
  const steerTool = defineTool({
    name: NESTED_TOOL_NAMES[2],
    label: "Steer Nested Agent",
    description: "Send guidance to a running nested agent owned by this parent.",
    parameters: Type2.Object({
      agent_id: Type2.String(),
      message: Type2.String()
    }),
    prepareArguments: argumentRepair(STEER_ARG_SHAPE),
    execute: async (_toolCallId, params) => {
      const record = context.manager.getRecord(params.agent_id);
      if (!ownsRecord(record, context.parentAgentId) || record.status !== "running") {
        return textResult(`Running nested agent not found or not owned by this parent: "${params.agent_id}".`, true);
      }
      if (!record.session) {
        if (!record.pendingSteers)
          record.pendingSteers = [];
        record.pendingSteers.push(params.message);
        return textResult(`Steering message queued for nested agent ${params.agent_id}.`);
      }
      try {
        await record.session.steer(params.message);
      } catch (err) {
        return textResult(`Failed to steer nested agent: ${err instanceof Error ? err.message : String(err)}`, true);
      }
      return textResult(`Steering message sent to nested agent ${params.agent_id}.`);
    }
  });
  return [agentTool, resultTool, steerTool];
}
var maxSubagentDepth = 2, NESTED_TOOL_NAMES;
var init_nested_tools = __esm(() => {
  init_agent_types();
  init_custom_agents();
  init_invocation_config();
  init_model_scope();
  init_output_file();
  init_tool_args();
  init_usage();
  init_worktree();
  NESTED_TOOL_NAMES = ["Agent", "get_subagent_result", "steer_subagent"];
});

// dist/orchestration.js
function getWatchdogExemptTools() {
  return watchdogExemptTools;
}
function setWatchdogExemptTools(names) {
  watchdogSetting = [...names];
  watchdogExemptTools = new Set(names);
}
function orchestrationSettingsAsWritten() {
  return { watchdogExemptTools: watchdogSetting };
}
function stripToolLines(prompt, tools) {
  if (tools.length === 0)
    return prompt;
  const prefixes = tools.map((t) => `- ${t.name}: `);
  const guidelines = new Set(tools.flatMap((t) => (t.promptGuidelines ?? []).map((g) => `- ${g.trim()}`)));
  return prompt.split(`
`).filter((line) => !prefixes.some((p) => line.startsWith(p)) && !guidelines.has(line.trim())).join(`
`);
}
var DEFAULT_WATCHDOG_EXEMPT_TOOLS, watchdogExemptTools, watchdogSetting;
var init_orchestration = __esm(() => {
  DEFAULT_WATCHDOG_EXEMPT_TOOLS = ["second_opinion_agent"];
  watchdogExemptTools = new Set(DEFAULT_WATCHDOG_EXEMPT_TOOLS);
});

// dist/settings.js
import { existsSync as existsSync6, mkdirSync as mkdirSync5, readFileSync as readFileSync4, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname as dirname2, join as join9 } from "node:path";
import { getAgentDir as getAgentDir6 } from "@earendil-works/pi-coding-agent";
function sanitize(raw) {
  if (!raw || typeof raw !== "object")
    return {};
  const r = raw;
  const out = {};
  if (Number.isInteger(r.maxConcurrent) && r.maxConcurrent >= 1 && r.maxConcurrent <= MAX_CONCURRENT_CEILING) {
    out.maxConcurrent = r.maxConcurrent;
  }
  if (Number.isInteger(r.maxConcurrentForeground) && r.maxConcurrentForeground >= 0 && r.maxConcurrentForeground <= MAX_CONCURRENT_CEILING) {
    out.maxConcurrentForeground = r.maxConcurrentForeground;
  }
  if (Number.isInteger(r.defaultMaxTurns) && r.defaultMaxTurns >= 0 && r.defaultMaxTurns <= MAX_TURNS_CEILING) {
    out.defaultMaxTurns = r.defaultMaxTurns;
  }
  if (Number.isInteger(r.graceTurns) && r.graceTurns >= 1 && r.graceTurns <= GRACE_TURNS_CEILING) {
    out.graceTurns = r.graceTurns;
  }
  if (Number.isInteger(r.toolTimeoutSeconds) && r.toolTimeoutSeconds >= 0 && r.toolTimeoutSeconds <= TOOL_TIMEOUT_CEILING) {
    out.toolTimeoutSeconds = r.toolTimeoutSeconds;
  }
  if (Number.isInteger(r.codemodeTimeoutSeconds) && r.codemodeTimeoutSeconds >= 0 && r.codemodeTimeoutSeconds <= CODEMODE_TIMEOUT_CEILING2) {
    out.codemodeTimeoutSeconds = r.codemodeTimeoutSeconds;
  }
  if (Number.isInteger(r.maxSubagentDepth) && r.maxSubagentDepth >= 0 && r.maxSubagentDepth <= SUBAGENT_DEPTH_CEILING) {
    out.maxSubagentDepth = r.maxSubagentDepth;
  }
  if (typeof r.defaultJoinMode === "string" && VALID_JOIN_MODES.has(r.defaultJoinMode)) {
    out.defaultJoinMode = r.defaultJoinMode;
  }
  if (typeof r.backgroundByDefault === "boolean") {
    out.backgroundByDefault = r.backgroundByDefault;
  }
  if (typeof r.schedulingEnabled === "boolean") {
    out.schedulingEnabled = r.schedulingEnabled;
  }
  if (typeof r.scopeModels === "boolean") {
    out.scopeModels = r.scopeModels;
  }
  if (typeof r.allowModelOverride === "boolean") {
    out.allowModelOverride = r.allowModelOverride;
  }
  if (typeof r.strictAgentFiles === "boolean") {
    out.strictAgentFiles = r.strictAgentFiles;
  }
  if (r.projectTrust === "full" || r.projectTrust === "pi") {
    out.projectTrust = r.projectTrust;
  }
  if (typeof r.disableDefaultAgents === "boolean") {
    out.disableDefaultAgents = r.disableDefaultAgents;
  }
  if (typeof r.toolDescriptionMode === "string" && VALID_TOOL_DESCRIPTION_MODES.has(r.toolDescriptionMode)) {
    out.toolDescriptionMode = r.toolDescriptionMode;
  }
  if (typeof r.fleetView === "boolean") {
    out.fleetView = r.fleetView;
  }
  if (typeof r.agentMentions === "boolean") {
    out.agentMentions = r.agentMentions ? "model" : "off";
  } else if (typeof r.agentMentions === "string" && VALID_AGENT_MENTION_MODES.has(r.agentMentions)) {
    out.agentMentions = r.agentMentions;
  }
  if (typeof r.rememberAgents === "boolean") {
    out.rememberAgents = r.rememberAgents;
  }
  if (typeof r.widgetMode === "string" && VALID_WIDGET_MODES.has(r.widgetMode)) {
    out.widgetMode = r.widgetMode;
  }
  if (typeof r.outputTranscript === "boolean") {
    out.outputTranscript = r.outputTranscript;
  }
  if (typeof r.worktreeIsolation === "boolean") {
    out.worktreeIsolation = r.worktreeIsolation;
  }
  if (typeof r.reportUsage === "boolean") {
    out.reportUsage = r.reportUsage;
  }
  if (typeof r.showCost === "boolean") {
    out.showCost = r.showCost;
  }
  if (typeof r.showModel === "boolean") {
    out.showModel = r.showModel;
  }
  if (typeof r.backgroundKey === "string" && r.backgroundKey.trim()) {
    out.backgroundKey = r.backgroundKey.trim().toLowerCase();
  }
  if (typeof r.workflowsEnabled === "boolean") {
    out.workflowsEnabled = r.workflowsEnabled;
  }
  if (Array.isArray(r.watchdogExemptTools)) {
    out.watchdogExemptTools = r.watchdogExemptTools.filter((x) => typeof x === "string" && !!x.trim());
  }
  if (r.fallbackSubagent === false) {
    out.fallbackSubagent = NO_FALLBACK;
  } else if (typeof r.fallbackSubagent === "string" && r.fallbackSubagent.trim()) {
    out.fallbackSubagent = r.fallbackSubagent.trim();
  }
  return out;
}
function globalPath() {
  return join9(getAgentDir6(), "subagents.json");
}
function projectPath(cwd) {
  return join9(cwd, ".pi", "subagents.json");
}
function readSettingsFile(path) {
  if (!existsSync6(path))
    return {};
  try {
    return readParsedSettings(path);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[pi-subagents] Ignoring malformed settings at ${path}: ${reason}`);
    return {};
  }
}
function globalProjectTrustMode() {
  return readSettingsFile(globalPath()).projectTrust ?? "pi";
}
function loadSettings(cwd = process.cwd(), project = true) {
  return { ...readSettingsFile(globalPath()), ...project ? readSettingsFile(projectPath(cwd)) : {} };
}
function saveSettings(s, cwd = process.cwd()) {
  const path = projectPath(cwd);
  try {
    mkdirSync5(dirname2(path), { recursive: true });
    writeFileSync2(path, JSON.stringify(s, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}
function applySettings(s, appliers) {
  if (typeof s.maxConcurrent === "number")
    appliers.setMaxConcurrent(s.maxConcurrent);
  if (typeof s.maxConcurrentForeground === "number") {
    appliers.setMaxConcurrentForeground(s.maxConcurrentForeground);
  }
  if (typeof s.defaultMaxTurns === "number")
    appliers.setDefaultMaxTurns(s.defaultMaxTurns);
  if (typeof s.graceTurns === "number")
    appliers.setGraceTurns(s.graceTurns);
  if (typeof s.toolTimeoutSeconds === "number")
    appliers.setToolTimeoutSeconds(s.toolTimeoutSeconds);
  if (typeof s.codemodeTimeoutSeconds === "number")
    appliers.setCodemodeTimeoutSeconds(s.codemodeTimeoutSeconds);
  if (typeof s.maxSubagentDepth === "number")
    appliers.setMaxSubagentDepth(s.maxSubagentDepth);
  if (typeof s.fallbackSubagent === "string")
    appliers.setFallbackSubagent(s.fallbackSubagent);
  if (s.defaultJoinMode)
    appliers.setDefaultJoinMode(s.defaultJoinMode);
  if (typeof s.backgroundByDefault === "boolean")
    appliers.setBackgroundByDefault(s.backgroundByDefault);
  if (typeof s.schedulingEnabled === "boolean")
    appliers.setSchedulingEnabled(s.schedulingEnabled);
  if (typeof s.scopeModels === "boolean")
    appliers.setScopeModels(s.scopeModels);
  if (typeof s.allowModelOverride === "boolean")
    appliers.setAllowModelOverride(s.allowModelOverride);
  if (typeof s.strictAgentFiles === "boolean")
    appliers.setStrictAgentFiles(s.strictAgentFiles);
  if (typeof s.disableDefaultAgents === "boolean")
    appliers.setDisableDefaultAgents(s.disableDefaultAgents);
  if (s.toolDescriptionMode)
    appliers.setToolDescriptionMode(s.toolDescriptionMode);
  if (typeof s.fleetView === "boolean")
    appliers.setFleetView(s.fleetView);
  if (s.agentMentions)
    appliers.setAgentMentions(s.agentMentions);
  if (typeof s.rememberAgents === "boolean")
    appliers.setRememberAgents(s.rememberAgents);
  if (s.widgetMode)
    appliers.setWidgetMode(s.widgetMode);
  if (typeof s.outputTranscript === "boolean")
    appliers.setOutputTranscript(s.outputTranscript);
  if (typeof s.worktreeIsolation === "boolean")
    appliers.setWorktreeIsolation(s.worktreeIsolation);
  if (typeof s.reportUsage === "boolean")
    appliers.setReportUsage(s.reportUsage);
  if (typeof s.showCost === "boolean")
    appliers.setShowCost(s.showCost);
  if (typeof s.showModel === "boolean")
    appliers.setShowModel(s.showModel);
  if (s.backgroundKey)
    appliers.setBackgroundKey(s.backgroundKey);
  if (typeof s.workflowsEnabled === "boolean")
    appliers.setWorkflowsEnabled(s.workflowsEnabled);
  if (s.watchdogExemptTools)
    appliers.setWatchdogExemptTools?.(s.watchdogExemptTools);
}
function persistToastFor(successMsg, persisted) {
  return persisted ? { message: successMsg, level: "info" } : { message: `${successMsg} (session only; failed to persist)`, level: "warning" };
}
function applyAndEmitLoaded(appliers, emit, cwd = process.cwd(), project = true) {
  const settings = loadSettings(cwd, project);
  applySettings(settings, appliers);
  emit("subagents:settings_loaded", { settings });
  return settings;
}
function saveAndEmitChanged(snapshot, successMsg, emit, cwd = process.cwd()) {
  const persisted = saveSettings(snapshot, cwd);
  emit("subagents:settings_changed", { settings: snapshot, persisted });
  return persistToastFor(successMsg, persisted);
}
var VALID_JOIN_MODES, VALID_TOOL_DESCRIPTION_MODES, VALID_WIDGET_MODES, VALID_AGENT_MENTION_MODES, MAX_CONCURRENT_CEILING = 1024, MAX_TURNS_CEILING = 1e4, GRACE_TURNS_CEILING = 1000, TOOL_TIMEOUT_CEILING = 86400, CODEMODE_TIMEOUT_CEILING2 = 86400, SUBAGENT_DEPTH_CEILING = 16, readParsedSettings;
var init_settings = __esm(() => {
  init_agent_types();
  init_discovery_cache();
  VALID_JOIN_MODES = new Set(["async", "group", "smart"]);
  VALID_TOOL_DESCRIPTION_MODES = new Set(["full", "compact", "custom"]);
  VALID_WIDGET_MODES = new Set(["all", "background", "off"]);
  VALID_AGENT_MENTION_MODES = new Set(["model", "direct", "off"]);
  readParsedSettings = createDiscoveryCache((path) => sanitize(JSON.parse(readFileSync4(path, "utf-8"))), 64);
});

// dist/project-trust.js
import { getAgentDir as getAgentDir7, hasTrustRequiringProjectResources, ProjectTrustStore, SettingsManager } from "@earendil-works/pi-coding-agent";
function followsPiTrust() {
  try {
    return globalProjectTrustMode() !== "full";
  } catch {
    return true;
  }
}
function isProjectTrustedBy(ctx) {
  if (!followsPiTrust())
    return true;
  if (typeof ctx?.isProjectTrusted !== "function")
    return true;
  try {
    return ctx.isProjectTrusted() === true;
  } catch {
    return false;
  }
}
function savedDecision(cwd) {
  return new ProjectTrustStore(getAgentDir7()).get(cwd);
}
function defaultTrustIsAlways(cwd) {
  return SettingsManager.create(cwd, getAgentDir7(), { projectTrusted: false }).getDefaultProjectTrust() === "always";
}
function predictProjectTrust(cwd) {
  if (!followsPiTrust())
    return true;
  try {
    if (!hasTrustRequiringProjectResources(cwd))
      return true;
    const saved = savedDecision(cwd);
    if (saved !== null)
      return saved;
    return defaultTrustIsAlways(cwd);
  } catch {
    return false;
  }
}
function isProjectCodeTrusted(trusted, cwd) {
  if (!followsPiTrust())
    return true;
  if (!trusted)
    return false;
  try {
    return hasTrustRequiringProjectResources(cwd) || savedDecision(cwd) === true || defaultTrustIsAlways(cwd) || approvedOnCommandLine();
  } catch {
    return false;
  }
}
function approvedOnCommandLine() {
  return process.argv.includes("--approve") || process.argv.includes("-a");
}
var TRUST_PROJECT_HINT;
var init_project_trust = __esm(() => {
  init_settings();
  TRUST_PROJECT_HINT = "Run /trust in Pi and restart it (or start Pi with --approve) to trust this project. " + 'To use project files in every project, set "projectTrust": "full" in ~/.pi/agent/subagents.json.';
});

// dist/prompts.js
function buildAgentPrompt(config, cwd, env, parentSystemPrompt, extras) {
  const activeAgentTag = `<active_agent name="${config.name}"/>

`;
  const envBlock = `# Environment
Working directory: ${cwd}
${env.isGitRepo ? `Git repository: yes
Branch: ${env.branch}` : "Not a git repository"}
Platform: ${env.platform}`;
  const worktreeBlock = extras?.worktreeBase ? `

<worktree_isolation>
Your working directory is an isolated git worktree copy of ${extras.worktreeBase}.
Work only inside it — never in ${extras.worktreeBase}, even if other instructions name that path as your working directory.${extras.memoryBlock ? `
The one exception is your agent memory directory named below, which lives in the real project so it outlasts this copy.` : ""}
</worktree_isolation>` : "";
  const workflowBlock = extras?.workflowChild ? `

<workflow_child>
Your final message IS the return value of this task. A workflow script captures it and passes it to the next stage; no person reads it.
Return only the answer, in exactly the shape the prompt asks for — no preamble, no summary of what you did, no offer to continue.
</workflow_child>` : "";
  const extraSections = [];
  if (extras?.memoryBlock) {
    extraSections.push(extras.memoryBlock);
  }
  if (extras?.skillBlocks?.length) {
    for (const skill of extras.skillBlocks) {
      extraSections.push(`
# Preloaded Skill: ${skill.name}
${skill.content}`);
    }
  }
  const extrasSuffix = extraSections.length > 0 ? `

` + extraSections.join(`
`) : "";
  if (config.promptMode === "append") {
    const identity = parentSystemPrompt || genericBase;
    const bridge = `<sub_agent_context>
You are operating as a sub-agent invoked to handle a specific task.
- Use the read tool instead of cat/head/tail
- Use the edit tool instead of sed/awk
- Use the write tool instead of echo/heredoc
- Use the find tool instead of bash find/ls for file search
- Use the grep tool instead of bash grep/rg for content search
- Make independent tool calls in parallel
- Use absolute file paths
- Do not use emojis
- Be concise but complete
</sub_agent_context>`;
    const customSection = config.systemPrompt?.trim() ? `

<agent_instructions>
${config.systemPrompt}
</agent_instructions>` : "";
    return identity + `

` + bridge + `

` + activeAgentTag + envBlock + worktreeBlock + workflowBlock + customSection + extrasSuffix;
  }
  const replaceHeader = `You are a pi coding agent sub-agent.
You have been invoked to handle a specific task autonomously.

${envBlock}`;
  return activeAgentTag + replaceHeader + worktreeBlock + workflowBlock + `

` + config.systemPrompt + extrasSuffix;
}
var genericBase = `# Role
You are a general-purpose coding agent for complex, multi-step tasks.
You have full access to read, write, edit files, and execute commands.
Do what has been asked; nothing more, nothing less.`;

// dist/skill-loader.js
import { existsSync as existsSync7, readdirSync as readdirSync2 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join10 } from "node:path";
import { getAgentDir as getAgentDir8 } from "@earendil-works/pi-coding-agent";
function preloadSkills(skillNames, cwd, options = {}) {
  const project = options.project !== false;
  return skillNames.map((name) => ({ name, content: loadSkillContent(name, cwd, project) }));
}
function loadSkillContent(name, cwd, project) {
  if (isUnsafeName(name)) {
    return `(Skill "${name}" skipped: name contains path traversal characters)`;
  }
  const roots = [
    ...project ? [
      join10(cwd, ".pi", "skills"),
      join10(cwd, ".agents", "skills")
    ] : [],
    join10(getAgentDir8(), "skills"),
    join10(homedir2(), ".agents", "skills"),
    join10(homedir2(), ".pi", "skills")
  ];
  for (const root of roots) {
    const content = findInRoot(root, name);
    if (content !== undefined)
      return content;
  }
  return project ? `(Skill "${name}" not found in .pi/skills/, .agents/skills/, or global skill locations)` : `(Skill "${name}" not found in global skill locations; project skills are not loaded because this project is not trusted)`;
}
function findInRoot(root, name) {
  if (isSymlink(root))
    return;
  const flat = safeReadFile(join10(root, `${name}.md`))?.trim();
  if (flat !== undefined)
    return flat;
  return findSkillDirectory(root, name);
}
function findSkillDirectory(root, name) {
  if (!existsSync7(root))
    return;
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined)
      continue;
    let entries;
    try {
      entries = readdirSync2(current, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      if (!entry.isDirectory())
        continue;
      if (entry.name.startsWith(".") || entry.name === "node_modules")
        continue;
      const path = join10(current, entry.name);
      const skillMd = join10(path, "SKILL.md");
      const isSkillDir = existsSync7(skillMd);
      if (isSkillDir) {
        if (entry.name === name) {
          const content = safeReadFile(skillMd)?.trim();
          if (content !== undefined)
            return content;
        }
        continue;
      }
      queue.push(path);
    }
  }
  return;
}
var init_skill_loader = __esm(() => {
  init_memory();
});

// dist/structured-output.js
import { defineTool as defineTool2 } from "@earendil-works/pi-coding-agent";
function createStructuredCapture() {
  return { called: false };
}
function createStructuredOutputTool(compiled, capture) {
  return defineTool2({
    name: STRUCTURED_OUTPUT_TOOL_NAME,
    label: "Structured Output",
    description: "Report your final answer. Call this exactly once, with the complete result, and put everything the " + "caller needs inside the arguments — text written outside this call is discarded. If a call is " + "rejected for not matching the schema, fix the reported fields and call it again.",
    promptSnippet: "Report your final answer as structured data",
    promptGuidelines: [
      "Your final answer MUST be reported by calling StructuredOutput. Prose outside that call is discarded."
    ],
    parameters: compiled.schema,
    constrainedSampling: { type: "json_schema", strict: "prefer" },
    prepareArguments: (args) => {
      if (typeof args !== "string")
        return args;
      try {
        return JSON.parse(args);
      } catch {
        return args;
      }
    },
    execute: async (_toolCallId, params) => {
      capture.called = true;
      const verdict = compiled.check(params);
      if (verdict !== true) {
        capture.lastError = verdict;
        return {
          content: [{
            type: "text",
            text: `StructuredOutput did not match the required schema:
${verdict}
Call it again with a corrected value.`
          }],
          isError: true,
          details: {}
        };
      }
      capture.json = JSON.stringify(params);
      capture.lastError = undefined;
      return { content: [{ type: "text", text: "Recorded." }], details: {} };
    }
  });
}
function structuredRetryPrompt(capture) {
  const reason = capture.called && capture.lastError !== undefined ? `Your last ${STRUCTURED_OUTPUT_TOOL_NAME} call did not match the required schema: ${capture.lastError}` : `You did not call ${STRUCTURED_OUTPUT_TOOL_NAME}, so your answer was not recorded.`;
  return `${reason}

Call ${STRUCTURED_OUTPUT_TOOL_NAME} now with your complete final answer. Do not reply with prose.`;
}
var STRUCTURED_OUTPUT_TOOL_NAME = "StructuredOutput";
var init_structured_output = () => {};

// dist/agent-runner.js
import { readFileSync as readFileSync5 } from "node:fs";
import { homedir as homedir3 } from "node:os";
import { basename as basename3, dirname as dirname3, isAbsolute, join as join11, resolve as resolve3 } from "node:path";
import { createAgentSession, createCodemodeExtension, createMcpExtension, createToolSearchExtension, DefaultResourceLoader, getAgentDir as getAgentDir9, SessionManager, SettingsManager as SettingsManager2 } from "@earendil-works/pi-coding-agent";
function extensionCanonicalName(extPath) {
  const base = basename3(extPath);
  const name = base === "index.ts" || base === "index.js" ? basename3(dirname3(extPath)) : base.replace(/\.(ts|js)$/, "");
  return name.toLowerCase();
}
function extensionPackageName(extPath) {
  if (extPath.startsWith("builtin:"))
    return;
  const entry = resolve3(extPath);
  let dir = dirname3(extPath);
  for (;; ) {
    if (basename3(dir) === "node_modules")
      return;
    let pkg;
    try {
      pkg = JSON.parse(readFileSync5(join11(dir, "package.json"), "utf-8"));
    } catch {
      const parent = dirname3(dir);
      if (parent === dir)
        return;
      dir = parent;
      continue;
    }
    const entries = pkg.pi?.extensions;
    if (typeof pkg.name === "string" && Array.isArray(entries) && entries.some((e) => typeof e === "string" && resolve3(dir, e) === entry)) {
      const short = pkg.name.startsWith("@") ? pkg.name.slice(pkg.name.indexOf("/") + 1) : pkg.name;
      return short.toLowerCase();
    }
    return;
  }
}
function extensionCanonicalNames(extPath) {
  const canonical = extensionCanonicalName(extPath);
  if (extPath.startsWith("<inline:"))
    return [canonical];
  const pkg = extensionPackageName(extPath);
  return pkg && pkg !== canonical ? [canonical, pkg] : [canonical];
}
function isExtensionPathEntry(entry) {
  return entry.includes("/") || entry.includes("\\") || entry.startsWith("~");
}
function builtinExtensionFactories() {
  return [
    { name: "codemode", factory: createCodemodeExtension(), builtin: true, replaceable: true },
    { name: "tool-search", factory: createToolSearchExtension(), builtin: true, replaceable: true },
    { name: "mcp", factory: createMcpExtension(), builtin: true, replaceable: true }
  ];
}
function disabledBuiltinExtensions(mcpRequested, argv = process.argv) {
  if (argv.some((a) => a === "--no-extensions" || a === "-ne"))
    return ["codemode", "tool-search", "mcp"];
  return mcpRequested && !argv.includes("--no-mcp") ? undefined : ["mcp"];
}
function parseExtensionsSpec(entries, cwd) {
  const names = new Set;
  const paths = [];
  let wildcard = false;
  for (const entry of entries) {
    if (!entry)
      continue;
    if (entry === "*") {
      wildcard = true;
      continue;
    }
    if (!isExtensionPathEntry(entry)) {
      names.add(entry.toLowerCase());
      continue;
    }
    let p = entry;
    if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) {
      p = homedir3() + p.slice(1);
    }
    const abs = isAbsolute(p) ? p : resolve3(cwd, p);
    paths.push(abs);
    names.add(extensionCanonicalName(abs));
  }
  return { names, paths, wildcard };
}
function parseExtSelectors(entries) {
  const extNames = new Set;
  const narrowing = new Map;
  for (const raw of entries) {
    if (!raw)
      continue;
    const body = raw.slice("ext:".length);
    const slash = body.indexOf("/");
    const name = (slash === -1 ? body : body.slice(0, slash)).trim().toLowerCase();
    if (!name)
      continue;
    extNames.add(name);
    if (slash === -1)
      continue;
    const tool = body.slice(slash + 1).trim();
    if (!tool)
      continue;
    let set = narrowing.get(name);
    if (!set) {
      set = new Set;
      narrowing.set(name, set);
    }
    set.add(tool);
  }
  return { extNames, narrowing };
}
function createToolScopeGuard() {
  let inScope;
  return {
    extension: {
      name: TOOL_SCOPE_GUARD_NAME,
      hidden: true,
      factory: (pi) => {
        const audit = createCodemodeAudit();
        pi.on("tool_call", (event, ctx) => {
          if (inScope && !inScope().has(event.toolName)) {
            return { block: true, reason: `Tool "${event.toolName}" is not available to this subagent.` };
          }
          if (event.toolName === "bash")
            boundBashTimeout(event.input, toolTimeoutSeconds, true);
          if (event.toolName === CODEMODE_TOOL_NAME)
            boundCodemodeTimeout(event.input, getCodemodeTimeoutSeconds());
          audit.recordCall(event, ctx);
          return;
        });
        pi.on("tool_result", (event) => audit.onToolResult(event));
      }
    },
    setScope(fn) {
      inScope = fn;
    }
  };
}
function installExtensionToolScope(session, ctx) {
  const { loader, toolNames, disallowedSet, extNames, narrowing, readmitToolNames, guard } = ctx;
  const canonsByPath = new Map;
  const inScope = () => {
    const keep = new Set(toolNames.filter((t) => !disallowedSet?.has(t)));
    const optInActive = extNames.size > 0;
    for (const extension of loader.getExtensions().extensions) {
      if (extension.path === TOOL_SCOPE_GUARD_PATH)
        continue;
      const canons = canonsByPath.get(extension.path) ?? extensionCanonicalNames(extension.path);
      canonsByPath.set(extension.path, canons);
      if (optInActive && !canons.some((c) => extNames.has(c)))
        continue;
      const narrowed = canons.map((c) => narrowing.get(c)).find(Boolean);
      for (const name of extension.tools.keys()) {
        if (narrowed && !narrowed.has(name))
          continue;
        if (disallowedSet?.has(name))
          continue;
        keep.add(name);
      }
    }
    for (const name of EXCLUDED_TOOL_NAMES)
      keep.delete(name);
    for (const name of readmitToolNames)
      keep.add(name);
    return keep;
  };
  const named = new Set([...toolNames, ...readmitToolNames, ...[...narrowing.values()].flatMap((s) => [...s])]);
  const renarrow = () => {
    const allowed = inScope();
    const current = session.getActiveToolNames();
    const active = new Set(current);
    const next = session.getAllTools().filter(({ name, exposure = "direct" }) => {
      if (!allowed.has(name))
        return false;
      if (active.has(name))
        return true;
      if (exposure !== "direct" && exposure !== "model-only")
        return false;
      return named.has(name) || session.getToolDefinition(name)?.defaultActive !== false;
    }).map((t) => t.name);
    if (next.length !== current.length || next.some((n, i) => n !== current[i])) {
      session.setActiveToolsByName(next);
    }
  };
  renarrow();
  session.subscribe((event) => {
    if (event.type === "turn_end")
      renarrow();
  });
  guard?.setScope(inScope);
  const priorBeforeToolCall = session.agent.beforeToolCall;
  session.agent.beforeToolCall = async (context, signal) => {
    if (!inScope().has(context.toolCall.name)) {
      return {
        block: true,
        reason: `Tool "${context.toolCall.name}" is not available to this subagent.`
      };
    }
    return priorBeforeToolCall?.(context, signal);
  };
}
function normalizeMaxTurns(n) {
  if (n == null || n === 0)
    return;
  return Math.max(1, n);
}
function getDefaultMaxTurns() {
  return defaultMaxTurns;
}
function setDefaultMaxTurns(n) {
  defaultMaxTurns = normalizeMaxTurns(n);
}
function resolveEffectiveMaxTurns(type, explicit) {
  return normalizeMaxTurns(explicit ?? getAgentConfig(type)?.maxTurns ?? defaultMaxTurns);
}
function getRememberAgents() {
  return rememberAgents;
}
function setRememberAgents(b) {
  rememberAgents = b;
}
function getGraceTurns() {
  return graceTurns;
}
function setGraceTurns(n) {
  graceTurns = Math.max(1, n);
}
function getToolTimeoutSeconds() {
  return toolTimeoutSeconds;
}
function setToolTimeoutSeconds(n) {
  toolTimeoutSeconds = Math.min(TOOL_TIMEOUT_CEILING2, Math.max(0, Math.floor(n)));
}
function formatDuration(seconds) {
  if (seconds < 120)
    return `${seconds} seconds`;
  return `${Math.round(seconds / 60)} minutes`;
}
function hungToolPrompt(hung) {
  return `Your ${hung.toolName} call ran for ${formatDuration(hung.seconds)} without finishing, so it was stopped and its ` + "output is lost. Continue the task without repeating that call: split the work into smaller, bounded steps " + "(search specific folders rather than the whole filesystem, limit depth and output, add timeouts).";
}
function boundBashTimeout(args, limitSeconds, fixInvalid) {
  if (limitSeconds <= 0 || !args || typeof args !== "object")
    return;
  const call = args;
  if (call.timeout == null)
    call.timeout = limitSeconds;
  else if (fixInvalid && (typeof call.timeout !== "number" || !(call.timeout > 0)))
    call.timeout = limitSeconds;
}
function callLimitSeconds(toolName, args, limitSeconds) {
  if (toolName === "bash") {
    const timeout = args && typeof args === "object" ? args.timeout : undefined;
    if (typeof timeout === "number" && timeout > 0)
      return timeout;
  }
  if (toolName === CODEMODE_TOOL_NAME)
    return codemodeDeadlineSeconds(args) ?? limitSeconds;
  return limitSeconds;
}
function installToolTimeouts(session, limitSeconds = toolTimeoutSeconds) {
  if (limitSeconds <= 0)
    return { takeHung: () => {
      return;
    }, stuck: new Promise(() => {}), dispose: () => {} };
  let resolveStuck;
  const stuck = new Promise((resolve4) => {
    resolveStuck = resolve4;
  });
  const patchBeforeToolCall = !toolCallBoundSessions.has(session);
  const priorBeforeToolCall = session.agent.beforeToolCall;
  if (patchBeforeToolCall) {
    session.agent.beforeToolCall = async (context, signal) => {
      if (context.toolCall.name === "bash")
        boundBashTimeout(context.args, limitSeconds, true);
      return priorBeforeToolCall?.(context, signal);
    };
  }
  const running = new Map;
  let hung;
  let hungAt = 0;
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "tool_execution_start" && !isWatchdogExempt(event.toolName)) {
      const limitMs = callLimitSeconds(event.toolName, event.args, limitSeconds) * 1000;
      running.set(event.toolCallId, { toolName: event.toolName, started: Date.now(), limitMs });
    }
    if (event.type === "tool_execution_end")
      running.delete(event.toolCallId);
    if (event.type === "agent_end")
      running.clear();
  });
  const timer = setInterval(() => {
    const now = Date.now();
    if (hung) {
      if (now - hungAt >= watchdogTiming.escalateMs) {
        clearInterval(timer);
        resolveStuck();
      }
      return;
    }
    for (const call of running.values()) {
      if (now - call.started < call.limitMs + watchdogTiming.slackMs)
        continue;
      hung = { toolName: call.toolName, seconds: Math.round((now - call.started) / 1000) };
      hungAt = now;
      running.clear();
      session.abort().catch(() => {});
      return;
    }
  }, watchdogTiming.intervalMs);
  timer.unref?.();
  return {
    takeHung() {
      const out = hung;
      hung = undefined;
      return out;
    },
    stuck,
    dispose() {
      clearInterval(timer);
      unsubscribe();
      if (patchBeforeToolCall)
        session.agent.beforeToolCall = priorBeforeToolCall;
    }
  };
}
function resolveDefaultModel(parentModel, registry, configModel) {
  if (configModel) {
    const slashIdx = configModel.indexOf("/");
    if (slashIdx !== -1) {
      const provider = configModel.slice(0, slashIdx);
      const modelId = configModel.slice(slashIdx + 1);
      const available = registry.getAvailable?.();
      const availableKeys = available ? new Set(available.map((m) => `${m.provider}/${m.id}`)) : undefined;
      const isAvailable = (p, id) => !availableKeys || availableKeys.has(`${p}/${id}`);
      const found = registry.find(provider, modelId);
      if (found && isAvailable(provider, modelId))
        return found;
    }
  }
  return parentModel;
}
function collectResponseText(session) {
  let text = "";
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_start" && event.message.role === "assistant") {
      text = "";
    }
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      text += event.assistantMessageEvent.delta;
    }
  });
  return { getText: () => text, unsubscribe };
}
function getLastAssistantText(session, startIndex = 0) {
  for (let i = session.messages.length - 1;i >= startIndex; i--) {
    const msg = session.messages[i];
    if (msg.role !== "assistant")
      continue;
    const text = extractText(msg.content).trim();
    if (text)
      return text;
  }
  return "";
}
function finalTurnError(session, startIndex = 0) {
  for (let i = session.messages.length - 1;i >= startIndex; i--) {
    const msg = session.messages[i];
    if (msg.role !== "assistant")
      continue;
    if (msg.stopReason === "error") {
      return msg.errorMessage?.trim() || "provider error with no output";
    }
    if (msg.stopReason === "length" && !extractText(msg.content).trim()) {
      return "run hit the output token limit before producing any text";
    }
    return;
  }
  return;
}
function forwardAbortSignal(session, signal) {
  if (!signal)
    return () => {};
  if (signal.aborted) {
    session.abort();
    return () => {};
  }
  const onAbort = () => session.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}
function resolveConfiguredSessionDir(sessionDir, cwd) {
  if (!sessionDir)
    return;
  if (sessionDir === "~" || sessionDir.startsWith("~/"))
    return resolve3(homedir3(), sessionDir.slice(2));
  if (isAbsolute(sessionDir))
    return sessionDir;
  return resolve3(cwd, sessionDir);
}
function toolsChildLacks(pi, child) {
  let all;
  try {
    all = pi?.getAllTools?.() ?? [];
  } catch {
    return [];
  }
  const builtins = new Set(BUILTIN_TOOL_NAMES);
  const own = new Set(child.toolNames);
  const denied = new Set(child.disallowed ?? []);
  const excluded = new Set((child.excludeExtensions ?? []).map((n) => n.toLowerCase()));
  const listed = Array.isArray(child.extensions) ? new Set(child.extensions.map((n) => n.toLowerCase())) : undefined;
  const lacks = (tool) => {
    if (EXCLUDED_TOOL_NAMES.includes(tool.name) || denied.has(tool.name))
      return true;
    const path = tool.sourceInfo?.path ?? "";
    if (builtins.has(tool.name) && (path === "" || path.startsWith("builtin:")))
      return !own.has(tool.name);
    if (child.extensions === false)
      return true;
    if (path === "" || path.startsWith("<inline:"))
      return false;
    const canons = extensionCanonicalNames(path);
    if (canons.some((n) => excluded.has(n)))
      return true;
    return listed !== undefined && !listed.has("*") && !canons.some((n) => listed.has(n));
  };
  return all.filter(lacks).map((tool) => ({ name: tool.name, promptGuidelines: tool.promptGuidelines }));
}
async function runAgent(ctx, type, prompt, options) {
  const config = getConfig(type);
  const agentConfig = getAgentConfig(type);
  const parent = {
    cwd: ctx.cwd,
    projectTrusted: isProjectTrustedBy(ctx),
    systemPrompt: ctx.getSystemPrompt(),
    model: ctx.model,
    modelRegistry: ctx.modelRegistry,
    thinkingLevel: ctx.thinkingLevel,
    sessionFile: ctx.sessionManager?.getSessionFile?.(),
    conversation: options.inheritContext ? buildParentContext(ctx) : ""
  };
  const effectiveCwd = options.cwd ?? parent.cwd;
  const configCwd = options.configCwd ?? effectiveCwd;
  const env = await detectEnv(options.pi, effectiveCwd);
  const projectTrusted = parent.projectTrusted;
  const parentSystemPrompt = parent.systemPrompt;
  const extras = {};
  if (options.worktreeBase)
    extras.worktreeBase = options.worktreeBase;
  if (options.workflow && !options.structuredOutput)
    extras.workflowChild = true;
  const isolated = agentConfig?.isolated ?? options.isolated;
  const extensions = isolated ? false : config.extensions;
  const excludeExtensions = isolated ? undefined : config.excludeExtensions;
  const skills = isolated ? false : config.skills;
  if (Array.isArray(skills)) {
    const loaded = preloadSkills(skills, configCwd, { project: projectTrusted });
    if (loaded.length > 0) {
      extras.skillBlocks = loaded;
    }
  }
  let toolNames = getToolNamesForType(type);
  const memoryCwd = options.configCwd ?? options.worktreeBase ?? configCwd;
  if (agentConfig?.memory) {
    const existingNames = new Set(toolNames);
    const denied = agentConfig.disallowedTools ? new Set(agentConfig.disallowedTools) : undefined;
    const effectivelyHas = (name) => existingNames.has(name) && !denied?.has(name);
    const hasWriteTools = effectivelyHas("write") || effectivelyHas("edit");
    if (hasWriteTools) {
      const extraNames = getMemoryToolNames(existingNames);
      if (extraNames.length > 0)
        toolNames = [...toolNames, ...extraNames];
      extras.memoryBlock = buildMemoryBlock(agentConfig.name, agentConfig.memory, memoryCwd);
    } else {
      const extraNames = getReadOnlyMemoryToolNames(existingNames);
      if (extraNames.length > 0)
        toolNames = [...toolNames, ...extraNames];
      extras.memoryBlock = buildReadOnlyMemoryBlock(agentConfig.name, agentConfig.memory, memoryCwd);
    }
  }
  const inheritedPrompt = parentSystemPrompt ? stripToolLines(parentSystemPrompt, toolsChildLacks(options.pi, {
    toolNames,
    disallowed: agentConfig?.disallowedTools,
    extensions,
    excludeExtensions
  })) || undefined : parentSystemPrompt;
  let systemPrompt;
  if (agentConfig) {
    systemPrompt = buildAgentPrompt(agentConfig, effectiveCwd, env, inheritedPrompt, extras);
  } else {
    const fallback = DEFAULT_AGENTS.get("general-purpose");
    if (!fallback)
      throw new Error(`No fallback config available for unknown type "${type}"`);
    systemPrompt = buildAgentPrompt({ ...fallback, name: type }, effectiveCwd, env, inheritedPrompt, extras);
  }
  const noSkills = skills === false || Array.isArray(skills);
  const agentDir = getAgentDir9();
  const { extNames, narrowing } = parseExtSelectors(isolated ? [] : agentConfig?.extSelectors ?? []);
  const noExtensions = extensions === false;
  let extensionEntries = Array.isArray(extensions) ? extensions : undefined;
  if (extensionEntries && agentConfig?.source === "project" && extensionEntries.some(isExtensionPathEntry)) {
    const projectRoot = agentConfig.sourcePath ? dirname3(dirname3(dirname3(agentConfig.sourcePath))) : configCwd;
    if (!isProjectCodeTrusted(projectTrusted, projectRoot)) {
      for (const entry of extensionEntries.filter(isExtensionPathEntry)) {
        options.onToolActivity?.({
          type: "end",
          toolName: `extension-error:extension path "${entry}" in project agent "${type}" was not loaded — the project is not trusted to run its own code (trust it with /trust)`
        });
      }
      extensionEntries = extensionEntries.filter((entry) => !isExtensionPathEntry(entry));
    }
  }
  const extensionsSpec = extensionEntries ? parseExtensionsSpec(extensionEntries, configCwd) : undefined;
  const keepNames = extensionsSpec?.names ?? new Set;
  const excludeNames = new Set((excludeExtensions ?? []).map((n) => n.toLowerCase()));
  const hasExcludes = excludeNames.size > 0;
  const loadAll = extensions === true || extensionsSpec?.wildcard === true;
  const additionalExtensionPaths = extensionsSpec?.paths.length ? extensionsSpec.paths : undefined;
  let discoveredNames;
  const extensionsOverride = noExtensions || loadAll && !hasExcludes ? undefined : (base) => {
    discoveredNames = new Set(base.extensions.filter((e) => e.path !== TOOL_SCOPE_GUARD_PATH).flatMap((e) => extensionCanonicalNames(e.path)));
    return {
      ...base,
      extensions: base.extensions.filter((e) => {
        if (e.path === TOOL_SCOPE_GUARD_PATH)
          return true;
        const canons = extensionCanonicalNames(e.path);
        if (canons.some((n) => excludeNames.has(n)))
          return false;
        return loadAll || canons.some((n) => keepNames.has(n));
      })
    };
  };
  const toolScopeGuard = noExtensions ? undefined : createToolScopeGuard();
  const settingsManager = SettingsManager2.create(configCwd, agentDir, { projectTrusted });
  const loader = new DefaultResourceLoader({
    cwd: configCwd,
    agentDir,
    settingsManager,
    noExtensions,
    additionalExtensionPaths,
    extensionFactories: [
      ...builtinExtensionFactories(),
      ...toolScopeGuard ? [toolScopeGuard.extension] : []
    ],
    disabledBuiltinExtensions: disabledBuiltinExtensions(keepNames.has("builtin:mcp")),
    extensionsOverride,
    noSkills,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPromptOverride: () => systemPrompt,
    appendSystemPromptOverride: () => []
  });
  await runInChildSessionContext(() => loader.reload());
  if (agentConfig?.builtinToolNames?.length) {
    const knownBuiltins = new Set(BUILTIN_TOOL_NAMES);
    for (const name of agentConfig.builtinToolNames) {
      if (!knownBuiltins.has(name)) {
        options.onToolActivity?.({
          type: "end",
          toolName: `tools-error:tool "${name}" requested by agent "${type}" is not a known built-in`
        });
      }
    }
  }
  if (hasExcludes && noExtensions) {
    options.onToolActivity?.({
      type: "end",
      toolName: `extension-error:exclude_extensions has no effect for agent "${type}" — extensions: false loads nothing`
    });
  }
  if (hasExcludes && discoveredNames) {
    for (const name of excludeNames) {
      if (!discoveredNames.has(name) && !BUILTIN_EXTENSION_PATHS.has(name)) {
        options.onToolActivity?.({
          type: "end",
          toolName: `extension-error:exclude_extensions: "${name}" for agent "${type}" did not match any discovered extension`
        });
      }
    }
  }
  if (keepNames.size > 0 || extNames.size > 0) {
    const survivingNames = new Set(loader.getExtensions().extensions.flatMap((e) => extensionCanonicalNames(e.path)));
    for (const name of keepNames) {
      if (!survivingNames.has(name)) {
        options.onToolActivity?.({
          type: "end",
          toolName: excludeNames.has(name) ? `extension-error:extension "${name}" is in both extensions: and exclude_extensions: for agent "${type}" — exclude wins` : `extension-error:extension "${name}" requested by agent "${type}" was not loaded`
        });
      }
    }
    for (const name of extNames) {
      if (!survivingNames.has(name)) {
        options.onToolActivity?.({
          type: "end",
          toolName: `extension-error:ext:${name} referenced by agent "${type}" but extension "${name}" is not loaded (check extensions:/exclude_extensions:)`
        });
      }
    }
  }
  const model = options.model ?? resolveDefaultModel(parent.model, parent.modelRegistry, agentConfig?.model);
  const configModel = agentConfig?.model;
  const configModelUnused = options.model === undefined && configModel !== undefined && model === parent.model && !(model && `${model.provider}/${model.id}`.toLowerCase() === configModel.toLowerCase());
  const modelNote = configModelUnused ? unresolvedModelNote(configModel, "did not match an available model's exact provider/id", model ?? "the session's default model") : undefined;
  const thinkingLevel = options.thinkingLevel ?? (options.resumeSessionFile ? undefined : agentConfig?.thinking ?? parent.thinkingLevel);
  const disallowedSet = agentConfig?.disallowedTools ? new Set(agentConfig.disallowedTools) : undefined;
  const effectiveMaxDepth = options.nestedRuntime?.maxSubagentDepth ?? getMaxSubagentDepth();
  const nestedRuntime = options.nestedRuntime && options.nestedRuntime.depth < effectiveMaxDepth ? options.nestedRuntime : undefined;
  const nestedTools = agentConfig?.allowedSubagents && nestedRuntime && !isolated ? createNestedSubagentTools({
    manager: nestedRuntime.manager,
    pi: options.pi,
    parentAgentId: nestedRuntime.parentAgentId,
    depth: nestedRuntime.depth,
    maxSubagentDepth: effectiveMaxDepth,
    allowedSubagents: agentConfig.allowedSubagents,
    configCwd,
    projectTrusted: isProjectCodeTrusted(projectTrusted, parent.cwd)
  }) : [];
  const nestedToolNames = new Set(nestedTools.map((tool) => tool.name));
  const structuredCapture = options.structuredOutput ? createStructuredCapture() : undefined;
  const structuredTools = options.structuredOutput && structuredCapture ? [createStructuredOutputTool(options.structuredOutput, structuredCapture)] : [];
  const structuredToolNames = new Set(structuredTools.map((tool) => tool.name));
  const readmitToolNames = new Set([
    ...[...nestedToolNames].filter((name) => !disallowedSet?.has(name)),
    ...structuredToolNames
  ]);
  const builtinToolNameSet = new Set(toolNames);
  let sessionTools;
  let sessionExcludeTools;
  if (noExtensions) {
    sessionTools = [
      ...toolNames.filter((t) => !EXCLUDED_TOOL_NAMES.includes(t) && !disallowedSet?.has(t)),
      ...[...nestedToolNames].filter((t) => !disallowedSet?.has(t)),
      ...structuredToolNames
    ];
  } else {
    const denyTools = new Set(EXCLUDED_TOOL_NAMES.filter((t) => !nestedToolNames.has(t)));
    for (const name of BUILTIN_TOOL_NAMES) {
      if (!builtinToolNameSet.has(name))
        denyTools.add(name);
    }
    if (disallowedSet) {
      for (const name of disallowedSet) {
        if (!structuredToolNames.has(name))
          denyTools.add(name);
      }
    }
    sessionExcludeTools = [...denyTools];
  }
  const configuredSessionDir = resolveConfiguredSessionDir(agentConfig?.sessionDir, effectiveCwd);
  const defaultSessionDir = process.env.PI_CODING_AGENT_SESSION_DIR ?? settingsManager.getSessionDir?.();
  const persistSession = agentConfig?.persistSession ?? rememberAgents;
  const sessionManager = options.resumeSessionFile ? SessionManager.open(options.resumeSessionFile, configuredSessionDir ?? defaultSessionDir) : persistSession ? SessionManager.create(effectiveCwd, configuredSessionDir ?? defaultSessionDir, {
    parentSession: parent.sessionFile
  }) : SessionManager.inMemory(effectiveCwd);
  const parentModelRuntime = parent.modelRegistry.runtime;
  const sessionOpts = {
    cwd: effectiveCwd,
    agentDir,
    sessionManager,
    settingsManager,
    modelRegistry: parent.modelRegistry,
    ...parentModelRuntime !== undefined && { modelRuntime: parentModelRuntime },
    model,
    tools: sessionTools,
    customTools: [...nestedTools, ...structuredTools],
    resourceLoader: loader
  };
  if (sessionExcludeTools) {
    sessionOpts.excludeTools = sessionExcludeTools;
  }
  if (thinkingLevel) {
    sessionOpts.thinkingLevel = thinkingLevel;
  }
  const { session } = await runInChildSessionContext(() => createAgentSession(sessionOpts));
  if (toolScopeGuard)
    toolCallBoundSessions.add(session);
  const baseSessionName = agentConfig?.name ?? type;
  session.setSessionName(options.agentId ? `${baseSessionName}#${options.agentId.slice(0, 8)}` : baseSessionName);
  await session.bindExtensions({
    onError: (err) => {
      options.onToolActivity?.({
        type: "end",
        toolName: `extension-error:${err.extensionPath}`
      });
    }
  });
  if (!noExtensions) {
    installExtensionToolScope(session, {
      loader,
      toolNames,
      disallowedSet,
      extNames,
      narrowing,
      readmitToolNames,
      guard: toolScopeGuard
    });
  }
  options.onSessionCreated?.(session);
  let effectivePrompt = prompt;
  if (options.inheritContext && parent.conversation) {
    effectivePrompt = parent.conversation + prompt;
  }
  let structuredRetried = false;
  const maxTurns = resolveEffectiveMaxTurns(type, options.maxTurns);
  const run = await driveSession(session, effectivePrompt, {
    maxTurns,
    signal: options.signal,
    onTurnEnd: options.onTurnEnd,
    onTextDelta: options.onTextDelta,
    onToolActivity: options.onToolActivity,
    onAssistantUsage: options.onAssistantUsage,
    onCompaction: options.onCompaction,
    followUp: () => {
      if (structuredCapture === undefined || structuredCapture.json !== undefined)
        return;
      structuredRetried = true;
      return structuredRetryPrompt(structuredCapture);
    }
  });
  const structuredFailure = structuredCapture !== undefined && structuredCapture.json === undefined ? structuredCapture.lastError !== undefined ? `The agent's StructuredOutput call did not match the required schema: ${structuredCapture.lastError}` : "The agent did not report its answer through StructuredOutput." : undefined;
  return {
    responseText: run.responseText,
    session,
    aborted: run.aborted,
    steered: run.steered,
    failure: run.failure ?? structuredFailure,
    maxTurns,
    ...modelNote !== undefined ? { modelNote } : {},
    ...structuredCapture?.json !== undefined ? { structuredJson: structuredCapture.json } : {},
    ...structuredRetried ? { structuredRetried } : {}
  };
}
async function driveSession(session, prompt, options) {
  const toolTimeouts = installToolTimeouts(session);
  let turnCount = 0;
  const maxTurns = options.maxTurns;
  let softLimitReached = false;
  let aborted = false;
  let currentMessageText = "";
  const unsubTurns = session.subscribe((event) => {
    if (event.type === "turn_end") {
      turnCount++;
      options.onTurnEnd?.(turnCount);
      if (maxTurns != null) {
        if (!softLimitReached && turnCount >= maxTurns) {
          softLimitReached = true;
          session.steer("You have reached your turn limit. Wrap up immediately — provide your final answer now.");
        } else if (softLimitReached && turnCount >= maxTurns + graceTurns) {
          aborted = true;
          session.abort();
        }
      }
    }
    if (event.type === "message_start") {
      currentMessageText = "";
    }
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      currentMessageText += event.assistantMessageEvent.delta;
      options.onTextDelta?.(event.assistantMessageEvent.delta, currentMessageText);
    }
    if (event.type === "tool_execution_start") {
      options.onToolActivity?.({ type: "start", toolName: event.toolName });
    }
    if (event.type === "tool_execution_end") {
      options.onToolActivity?.({ type: "end", toolName: event.toolName });
    }
    if (event.type === "message_end" && event.message.role === "assistant") {
      const u = event.message.usage;
      if (u)
        options.onAssistantUsage?.({
          input: u.input ?? 0,
          output: u.output ?? 0,
          cacheWrite: u.cacheWrite ?? 0,
          cacheRead: u.cacheRead ?? 0,
          cost: u.cost?.total ?? 0
        });
    }
    if (event.type === "compaction_end" && !event.aborted && event.result) {
      options.onCompaction?.({ reason: event.reason, tokensBefore: event.result.tokensBefore });
    }
  });
  const collector = collectResponseText(session);
  const cleanupAbort = forwardAbortSignal(session, options.signal);
  const startLen = session.messages.length;
  const send = async (text) => {
    const sent = session.prompt(text);
    const outcome = await Promise.race([sent.then(() => "done"), toolTimeouts.stuck.then(() => "stuck")]);
    if (outcome === "done")
      return true;
    sent.catch(() => {});
    aborted = true;
    return false;
  };
  try {
    if (options.signal?.aborted) {
      return { responseText: "", aborted: true, steered: false };
    }
    let live = await send(prompt);
    for (let recoveries = 0;live; recoveries++) {
      const hung = toolTimeouts.takeHung();
      if (!hung)
        break;
      if (aborted || options.signal?.aborted || recoveries >= MAX_TOOL_RECOVERIES) {
        aborted = true;
        break;
      }
      live = await send(hungToolPrompt(hung));
    }
    if (live && !aborted && options.signal?.aborted !== true) {
      const followUp = options.followUp?.();
      if (followUp !== undefined)
        await send(followUp);
    }
  } finally {
    toolTimeouts.dispose();
    unsubTurns();
    collector.unsubscribe();
    cleanupAbort();
  }
  return {
    responseText: collector.getText().trim() || getLastAssistantText(session, startLen),
    aborted,
    steered: softLimitReached,
    failure: finalTurnError(session, startLen)
  };
}
async function resumeAgent(session, prompt, options = {}) {
  const run = await driveSession(session, prompt, options);
  return { text: run.responseText, failure: run.failure, aborted: run.aborted, steered: run.steered };
}
async function steerAgent(session, message) {
  await session.steer(message);
}
function getAgentConversation(session) {
  const parts = [];
  for (const msg of session.messages) {
    if (msg.role === "user") {
      const text = typeof msg.content === "string" ? msg.content : extractText(msg.content);
      if (text.trim())
        parts.push(`[User]: ${text.trim()}`);
    } else if (msg.role === "assistant") {
      const textParts = [];
      const toolCalls = [];
      for (const c of msg.content) {
        if (c.type === "text" && c.text)
          textParts.push(c.text);
        else if (c.type === "toolCall")
          toolCalls.push(`  Tool: ${c.name ?? c.toolName ?? "unknown"}`);
      }
      if (textParts.length > 0)
        parts.push(`[Assistant]: ${textParts.join(`
`)}`);
      if (toolCalls.length > 0)
        parts.push(`[Tool Calls]:
${toolCalls.join(`
`)}`);
    } else if (msg.role === "toolResult") {
      const text = extractText(msg.content);
      const truncated = text.length > 200 ? text.slice(0, 200) + "..." : text;
      parts.push(`[Tool Result (${msg.toolName})]: ${truncated}`);
    }
  }
  return parts.join(`

`);
}
var SUBAGENT_TOOL_NAMES, EXCLUDED_TOOL_NAMES, BUILTIN_EXTENSION_PATHS, TOOL_SCOPE_GUARD_NAME = "subagent-tool-scope", TOOL_SCOPE_GUARD_PATH, defaultMaxTurns, rememberAgents = true, graceTurns = 5, toolTimeoutSeconds = 1200, TOOL_TIMEOUT_CEILING2 = 86400, watchdogTiming, MAX_TOOL_RECOVERIES = 3, WATCHDOG_EXEMPT_TOOLS, isWatchdogExempt = (name) => WATCHDOG_EXEMPT_TOOLS.has(name) || getWatchdogExemptTools().has(name), toolCallBoundSessions;
var init_agent_runner = __esm(() => {
  init_agent_types();
  init_child_context();
  init_codemode_guard();
  init_default_agents();
  init_env();
  init_memory();
  init_nested_tools();
  init_orchestration();
  init_project_trust();
  init_skill_loader();
  init_structured_output();
  SUBAGENT_TOOL_NAMES = {
    AGENT: "Agent",
    WORKFLOW: "SubagentWorkflow",
    GET_RESULT: "get_subagent_result",
    STEER: "steer_subagent"
  };
  EXCLUDED_TOOL_NAMES = Object.values(SUBAGENT_TOOL_NAMES);
  BUILTIN_EXTENSION_PATHS = new Set(["builtin:codemode", "builtin:tool-search", "builtin:mcp"]);
  TOOL_SCOPE_GUARD_PATH = `<inline:${TOOL_SCOPE_GUARD_NAME}>`;
  watchdogTiming = { slackMs: 60000, intervalMs: 5000, escalateMs: 30000 };
  WATCHDOG_EXEMPT_TOOLS = new Set(EXCLUDED_TOOL_NAMES);
  toolCallBoundSessions = new WeakSet;
});

// dist/mention.js
function isReservedHandle(handle) {
  return RESERVED_HANDLES.has(handle.toLowerCase());
}
function handleBase(type) {
  const slug = type.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, MAX_HANDLE_LENGTH).replace(/-+$/, "");
  return slug || "agent";
}
function assignHandle(base, taken) {
  let candidate = base;
  let n = 1;
  while (taken.has(candidate) || RESERVED_HANDLES.has(candidate)) {
    n++;
    candidate = `${base}-${n}`;
  }
  return candidate;
}
function resolveHandleToType(handle, types) {
  const wanted = handle.toLowerCase();
  if (RESERVED_HANDLES.has(wanted))
    return;
  return types.find((type) => handleBase(type) === wanted);
}
function stripAgentPrefix(handle) {
  const rest = /^agent-(.+)$/i.exec(handle)?.[1];
  return rest || undefined;
}
function describeMention(message) {
  const oneLine = message.split(`
`, 1)[0].replace(/\s+/g, " ").trim();
  return oneLine.length > 40 ? `${oneLine.slice(0, 39).trimEnd()}…` : oneLine;
}
function agentMentionReminder(type) {
  return `<system-reminder>
The user has expressed a desire to invoke the agent "${type}". Please invoke the agent appropriately, passing in the required context to it. 
</system-reminder>`;
}
function parseMention(text) {
  const match = MENTION_SEND.exec(text);
  if (!match)
    return null;
  const message = match[2].trim();
  return message ? { handle: match[1], message } : null;
}
var MENTION_TRIGGER, MENTION_SEND, MAX_HANDLE_LENGTH = 64, RESERVED_HANDLES;
var init_mention = __esm(() => {
  MENTION_TRIGGER = /(^|[\s。、？！])@([\w-]*)$/;
  MENTION_SEND = /^@([\w-]+)\s+([\s\S]+)$/;
  RESERVED_HANDLES = new Set(["main"]);
});

// dist/session-file.js
import { existsSync as existsSync8, readFileSync as readFileSync6, statSync as statSync4 } from "node:fs";
import { buildSessionContext, migrateSessionEntries, parseSessionEntries, SessionManager as SessionManager2 } from "@earendil-works/pi-coding-agent";
function sessionFileProblem(path) {
  if (!existsSync8(path))
    return `its session file is gone (${path})`;
  try {
    if (statSync4(path).size === 0)
      return `its session file is empty (${path})`;
    SessionManager2.open(path);
  } catch (err) {
    return `its session file cannot be read: ${err instanceof Error ? err.message : String(err)}`;
  }
  return;
}
function readSavedResult(path) {
  if (!existsSync8(path))
    return `its session file is gone (${path})`;
  try {
    const fileEntries = parseSessionEntries(readFileSync6(path, "utf-8"));
    if (fileEntries[0]?.type !== "session")
      return `its session file is not a pi session (${path})`;
    migrateSessionEntries(fileEntries);
    const entries = fileEntries.filter((entry) => entry.type !== "session");
    const context = buildSessionContext(entries);
    const result = { text: "" };
    if (context.model)
      result.model = `${context.model.provider}/${context.model.modelId}`;
    if (context.thinkingLevel)
      result.thinking = context.thinkingLevel;
    let final = true;
    for (let i = context.messages.length - 1;i >= 0; i--) {
      const message = context.messages[i];
      if (message.role !== "assistant")
        continue;
      if (final && message.stopReason === "error")
        result.error = message.errorMessage?.trim() || "provider error with no output";
      final = false;
      const text = extractText(message.content).trim();
      if (text) {
        result.text = text;
        break;
      }
    }
    return result;
  } catch (err) {
    return `its session file cannot be read: ${err instanceof Error ? err.message : String(err)}`;
  }
}
var init_session_file = () => {};

// dist/session-handoff.js
import { existsSync as existsSync9 } from "node:fs";
import { SessionManager as SessionManager3 } from "@earendil-works/pi-coding-agent";
function isSessionSwitch(reason) {
  return reason === "new" || reason === "resume" || reason === "fork" || reason === "reload";
}
function slot() {
  return globalThis;
}
function parkSubagents(entry, onExit) {
  const stale = slot()[HANDOFF_KEY];
  if (stale && stale !== entry) {
    stale.release?.();
    stale.stop().catch(() => {});
  }
  const exit = () => {
    if (slot()[HANDOFF_KEY] !== entry)
      return;
    try {
      onExit();
    } catch {}
  };
  process.once("exit", exit);
  entry.release = () => {
    process.off("exit", exit);
  };
  slot()[HANDOFF_KEY] = entry;
}
function takeParkedSubagents(sessionFile) {
  const entry = slot()[HANDOFF_KEY];
  if (!entry || sessionFile === undefined)
    return;
  const target = entry.reason === "reload" ? entry.sessionFile : entry.targetSessionFile;
  if (target !== sessionFile)
    return;
  delete slot()[HANDOFF_KEY];
  entry.release?.();
  return entry;
}
function isCompatible(entry) {
  return entry.version === PACKAGE_VERSION && entry.protocol === HANDOFF_PROTOCOL;
}
function sessionFileOf(ctx) {
  try {
    const file = ctx?.sessionManager?.getSessionFile?.();
    return typeof file === "string" ? file : undefined;
  } catch {
    return;
  }
}
function isSessionOnDisk(file) {
  try {
    return file !== undefined && existsSync9(file);
  } catch {
    return false;
  }
}
function appendToSessionFile(file, customType, data) {
  if (!isSessionOnDisk(file))
    return false;
  try {
    SessionManager3.open(file).appendCustomEntry(customType, data);
    return true;
  } catch {
    return false;
  }
}
function snapshotContext(ctx) {
  const read = (get) => {
    try {
      return get();
    } catch {
      return;
    }
  };
  const systemPrompt = read(() => ctx.getSystemPrompt()) ?? "";
  const trusted = read(() => ctx.isProjectTrusted?.());
  const snapshot = {
    cwd: read(() => ctx.cwd),
    model: read(() => ctx.model),
    modelRegistry: read(() => ctx.modelRegistry),
    thinkingLevel: read(() => ctx.thinkingLevel),
    sessionManager: read(() => ctx.sessionManager),
    mode: read(() => ctx.mode),
    hasUI: false,
    getSystemPrompt: () => systemPrompt,
    ...trusted !== undefined ? { isProjectTrusted: () => trusted } : {}
  };
  return snapshot;
}
var PACKAGE_VERSION = "0.20.9", HANDOFF_PROTOCOL = 1, HANDOFF_KEY;
var init_session_handoff = __esm(() => {
  HANDOFF_KEY = Symbol.for("pi-subagents:handoff:@kushalkhemka/opensec-pi-subagents");
});

// dist/agent-manager.js
import { randomUUID } from "node:crypto";
import { existsSync as existsSync10, statSync as statSync5 } from "node:fs";
import { isAbsolute as isAbsolute2 } from "node:path";
function managerServices() {
  return {
    get runAgent() {
      return runAgent;
    },
    get resumeAgent() {
      return resumeAgent;
    },
    get createWorktree() {
      return createWorktree;
    },
    get cleanupWorktree() {
      return cleanupWorktree;
    },
    get restoreWorktree() {
      return restoreWorktree;
    },
    get isWorktreeIsolationEnabled() {
      return isWorktreeIsolationEnabled;
    },
    get pruneWorktrees() {
      return pruneWorktrees;
    },
    get sessionFileProblem() {
      return sessionFileProblem;
    },
    get getAgentConfig() {
      return getAgentConfig;
    }
  };
}
function assertValidSpawnCwd(cwd) {
  if (cwd == null)
    return;
  if (typeof cwd !== "string" || !isAbsolute2(cwd)) {
    throw new Error(`SpawnOptions.cwd must be an absolute path: "${String(cwd)}"`);
  }
  let isDirectory = false;
  try {
    isDirectory = statSync5(cwd).isDirectory();
  } catch {
    throw new Error(`SpawnOptions.cwd does not exist: "${cwd}"`);
  }
  if (!isDirectory) {
    throw new Error(`SpawnOptions.cwd is not a directory: "${cwd}"`);
  }
}
function occupiesPoolSlot(record) {
  return !!record.isBackground && isTopLevelAgent(record);
}
function isTopLevelAgent(record) {
  return record.parentAgentId === undefined && record.workflowId === undefined;
}
function occupiesForegroundSlot(record) {
  return !!record.blocking && isTopLevelAgent(record);
}
async function shutdownChildSession(session) {
  try {
    const runner = session?.extensionRunner;
    if (runner?.hasHandlers?.("session_shutdown")) {
      await Promise.race([
        runner.emit({ type: "session_shutdown", reason: "quit" }),
        new Promise((resolve4) => setTimeout(resolve4, CHILD_SHUTDOWN_TIMEOUT_MS).unref())
      ]);
    }
  } catch {}
  try {
    session?.dispose?.();
  } catch {}
}
function worktreeNote(wtResult, baseCwd, customCwd) {
  const lines = [];
  if (wtResult.hasChanges && wtResult.branch) {
    const repoNote = customCwd ? ` in \`${baseCwd}\`` : "";
    lines.push(`Changes saved to branch \`${wtResult.branch}\`${repoNote}. Merge with: \`git merge ${wtResult.branch}\`${customCwd ? ` (run in \`${baseCwd}\`)` : ""}`);
  }
  if (wtResult.hasChanges && wtResult.path && (wtResult.kept || !wtResult.branch)) {
    lines.push(wtResult.kept ? `The worktree was kept at \`${wtResult.path}\` because removing it would delete work:` : `Changes could not be saved to a branch; the worktree was kept at \`${wtResult.path}\`.`);
  }
  for (const note of wtResult.notes ?? [])
    lines.push(`- ${note}`);
  return lines.length > 0 ? `

---
${lines.join(`
`)}` : "";
}
function messageCount(session) {
  try {
    return session?.messages?.length ?? 0;
  } catch {
    return 0;
  }
}
function salvageText(session, start) {
  try {
    const messages = session?.messages ?? [];
    for (let i = messages.length - 1;i >= start; i--) {
      const msg = messages[i];
      if (msg.role !== "assistant")
        continue;
      const text = extractText(msg.content).trim();
      if (text)
        return text;
    }
  } catch {}
  return "";
}
function salvagePartial(record, start) {
  if (record.result?.trim())
    return;
  const text = salvageText(record.session, start);
  if (text)
    record.result = text;
}
function recordRunModel(record, session) {
  if (!session.model)
    return;
  record.invocation ??= {};
  const requested = record.invocation.requestedThinking ?? record.invocation.thinking;
  Object.assign(record.invocation, describeModel(session.model));
  if (session.thinkingLevel) {
    record.invocation.thinking = session.thinkingLevel;
    if (requested && requested !== session.thinkingLevel) {
      record.invocation.requestedThinking = requested;
    }
  }
}
function isBusy(record) {
  return record.status === "running" || record.status === "queued";
}
function settleResumeStatus(record, run) {
  if (record.status === "stopped")
    return;
  if (run.aborted)
    record.status = "aborted";
  else if (run.failure) {
    record.status = "error";
    record.error = run.failure;
  } else
    record.status = run.steered ? "steered" : "completed";
}
function isTopLevelTombstone(entry) {
  return entry.handle !== undefined && isTopLevelAgent(entry);
}
function resumeStateOf(record) {
  if (!record.sessionFile)
    return;
  return {
    id: record.id,
    type: record.type,
    description: record.description,
    sessionFile: record.sessionFile,
    completedAt: record.completedAt ?? Date.now(),
    status: record.status,
    stopCause: record.status === "stopped" ? record.stopCause : undefined,
    handle: record.handle,
    alias: record.alias,
    parentAgentId: record.parentAgentId,
    workflowId: record.workflowId,
    depth: record.depth,
    maxSubagentDepth: record.maxSubagentDepth,
    rootSessionId: record.rootSessionId,
    model: record.invocation?.modelId,
    thinking: record.invocation?.thinking,
    cwd: record.cwd,
    baseCwd: record.baseCwd,
    isolated: record.isolated,
    maxTurns: "maxTurns" in record ? record.maxTurns ?? 0 : undefined,
    worktree: record.worktree ? { ...record.worktree } : undefined,
    worktreeResult: record.worktreeResult ? { ...record.worktreeResult } : undefined
  };
}
function resumeStatesFromEntries(entries) {
  const out = [];
  for (const entry of entries) {
    const e = entry;
    if (e?.type !== "custom" || e.customType !== RECORD_ENTRY_TYPE && e.customType !== RESUME_ENTRY_TYPE)
      continue;
    const state = e.data?.resume;
    if (typeof state?.id !== "string" || typeof state.type !== "string" || typeof state.sessionFile !== "string" || typeof state.description !== "string")
      continue;
    out.push({ ...state, completedAt: typeof state.completedAt === "number" ? state.completedAt : 0 });
  }
  return out;
}

class AgentManager {
  agents = new Map;
  cleanupInterval;
  onComplete;
  onStart;
  onCompact;
  onUsage;
  maxConcurrent;
  maxConcurrentForeground = DEFAULT_MAX_CONCURRENT_FOREGROUND;
  worktreeRepos = new Set;
  pi;
  startups = new Map;
  tombstones = new Map;
  queue = [];
  runningBackground = 0;
  runningForeground = 0;
  runs = new Map;
  stopGraceMs = DEFAULT_STOP_GRACE_MS;
  released = new WeakSet;
  releaseTimers = new Map;
  sessionReleaseMs = DEFAULT_SESSION_RELEASE_MS;
  services;
  visibleOwner = null;
  pendingArgs = new Map;
  constructor(onComplete, maxConcurrent = DEFAULT_MAX_CONCURRENT, onStart, onCompact, onUsage) {
    this.onComplete = onComplete;
    this.onStart = onStart;
    this.onCompact = onCompact;
    this.onUsage = onUsage;
    this.maxConcurrent = maxConcurrent;
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    this.cleanupInterval.unref();
  }
  setObservers(observers) {
    this.onComplete = observers.onComplete;
    this.onStart = observers.onStart;
    this.onCompact = observers.onCompact;
    this.onUsage = observers.onUsage;
  }
  useServices(services) {
    this.services = services;
  }
  svc() {
    return this.services ?? DEFAULT_SERVICES;
  }
  setVisibleOwner(owner) {
    this.visibleOwner = owner;
  }
  isVisible(record) {
    return this.visibleOwner === null || record.ownerSession === this.visibleOwner;
  }
  detachPendingContexts() {
    for (const args of this.pendingArgs.values())
      args.ctx = snapshotContext(args.ctx);
  }
  setMaxConcurrent(n) {
    this.maxConcurrent = Math.max(1, n);
    this.drainQueue();
  }
  getMaxConcurrent() {
    return this.maxConcurrent;
  }
  setMaxConcurrentForeground(n) {
    this.maxConcurrentForeground = Math.max(0, n);
    this.drainQueue();
  }
  getMaxConcurrentForeground() {
    return this.maxConcurrentForeground;
  }
  setStopGraceMs(ms) {
    this.stopGraceMs = Math.max(0, ms);
  }
  setSessionReleaseMs(ms) {
    this.sessionReleaseMs = Math.max(0, ms);
  }
  scheduleRelease(record) {
    this.cancelRelease(record);
    if (!record.session || !record.sessionFile)
      return;
    const timer = setTimeout(() => {
      this.releaseTimers.delete(record);
      this.releaseSession(record);
    }, this.sessionReleaseMs);
    timer.unref?.();
    this.releaseTimers.set(record, timer);
  }
  cancelRelease(record) {
    const timer = this.releaseTimers.get(record);
    if (timer === undefined)
      return;
    clearTimeout(timer);
    this.releaseTimers.delete(record);
  }
  releaseSession(record) {
    const session = record.session;
    if (!session || this.released.has(record))
      return;
    if (this.agents.get(record.id) !== record || this.isRunActive(record.id) || session.isStreaming === true)
      return;
    this.released.add(record);
    shutdownChildSession(session);
  }
  needsReopen(record) {
    return this.released.has(record) || record.session?.isStreaming === true;
  }
  beginRun(id, record, pool) {
    let resolveDone;
    let resolveAbandoned;
    const run = {
      id,
      record,
      pool,
      slotReleased: false,
      settled: false,
      abandoned: false,
      done: new Promise((resolve4) => {
        resolveDone = resolve4;
      }),
      resolveDone: () => resolveDone(),
      whenAbandoned: new Promise((resolve4) => {
        resolveAbandoned = resolve4;
      }),
      resolveAbandoned: () => resolveAbandoned(),
      onAbandon: async () => {}
    };
    if (pool === "background")
      this.runningBackground++;
    else if (pool === "foreground")
      this.runningForeground++;
    this.runs.set(id, run);
    return run;
  }
  releaseRunSlot(run) {
    if (run.slotReleased)
      return;
    run.slotReleased = true;
    if (run.pool === "background")
      this.runningBackground--;
    else if (run.pool === "foreground")
      this.runningForeground--;
  }
  discardRun(run) {
    this.releaseRunSlot(run);
    run.settled = true;
    if (run.graceTimer)
      clearTimeout(run.graceTimer);
    if (this.runs.get(run.id) === run)
      this.runs.delete(run.id);
    run.resolveDone();
  }
  endRun(run) {
    if (run.settled)
      return;
    run.settled = true;
    run.record.blocking = false;
    if (run.graceTimer)
      clearTimeout(run.graceTimer);
    if (this.runs.get(run.id) === run)
      this.runs.delete(run.id);
    this.releaseRunSlot(run);
    this.notifyComplete(run.record);
    this.drainQueue();
    run.resolveDone();
    if (!run.abandoned)
      this.scheduleRelease(run.record);
  }
  notifyComplete(record) {
    try {
      this.onComplete?.(record);
    } catch {}
  }
  armStopGrace(id) {
    const run = this.runs.get(id);
    if (!run || run.settled || run.graceTimer)
      return;
    run.graceTimer = setTimeout(() => {
      this.abandonRun(run);
    }, this.stopGraceMs);
    run.graceTimer.unref?.();
  }
  async abandonRun(run) {
    if (run.settled || run.abandoned)
      return;
    run.abandoned = true;
    const record = run.record;
    record.error ??= `The run did not end within ${Math.round(this.stopGraceMs / 1000)}s of the stop request ` + "(a tool ignored it), so it was abandoned.";
    record.completedAt ??= Date.now();
    run.resolveAbandoned();
    try {
      await run.onAbandon();
    } catch {}
    this.endRun(run);
  }
  async waitInline(record, promise) {
    const signal = record.abortController?.signal;
    const settled = promise.then(() => {}, () => {});
    if (!signal)
      return settled;
    let timer;
    let onAbort;
    const stopped = new Promise((resolve4) => {
      onAbort = () => {
        timer = setTimeout(resolve4, INLINE_STOP_WAIT_MS);
      };
      if (signal.aborted)
        onAbort();
      else
        signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      await Promise.race([settled, stopped]);
    } finally {
      if (timer)
        clearTimeout(timer);
      if (onAbort)
        signal.removeEventListener("abort", onAbort);
    }
  }
  isRunActive(id) {
    const record = this.agents.get(id);
    if (!record)
      return false;
    return isBusy(record) || this.runs.has(id);
  }
  poolFor(record) {
    if (occupiesPoolSlot(record))
      return "background";
    if (this.maxConcurrentForeground > 0 && occupiesForegroundSlot(record))
      return "foreground";
    return;
  }
  poolHasRoom(pool) {
    return pool === "background" ? this.runningBackground < this.maxConcurrent : this.maxConcurrentForeground === 0 || this.runningForeground < this.maxConcurrentForeground;
  }
  spawn(pi, ctx, type, prompt, options) {
    assertValidSpawnCwd(options.cwd);
    if (options.reuseId !== undefined && this.agents.has(options.reuseId)) {
      throw new Error(`Agent ${options.reuseId} is already loaded.`);
    }
    const id = options.reuseId ?? randomUUID().slice(0, 17);
    const abortController = new AbortController;
    const record = {
      id,
      type,
      handle: !isTopLevelAgent(options) ? undefined : options.reclaim?.handle ?? assignHandle(handleBase(type), this.takenHandles()),
      description: options.description,
      alias: isTopLevelAgent(options) ? options.reclaim?.alias : undefined,
      status: options.isBackground ? "queued" : "running",
      toolUses: options.carry?.toolUses ?? 0,
      startedAt: Date.now(),
      abortController,
      lifetimeUsage: options.carry ? { ...options.carry.lifetimeUsage } : { input: 0, output: 0, cacheWrite: 0, cost: 0 },
      compactionCount: options.carry?.compactionCount ?? 0,
      isBackground: options.isBackground,
      blocking: options.blocking,
      invocation: options.invocation,
      modelNote: options.modelNote,
      depth: options.depth ?? 1,
      parentAgentId: options.parentAgentId,
      workflowId: options.workflowId,
      maxSubagentDepth: options.maxSubagentDepth,
      rootSessionId: options.rootSessionId,
      isolated: options.isolated,
      ownerSession: options.parentAgentId !== undefined ? this.agents.get(options.parentAgentId)?.ownerSession : sessionFileOf(ctx)
    };
    this.agents.set(id, record);
    if (record.handle !== undefined && record.alias === undefined && options.name !== undefined) {
      record.alias = assignHandle(handleBase(options.name), this.takenHandles());
    }
    const args = { pi, ctx, type, prompt, options };
    this.pendingArgs.set(id, args);
    const pool = this.poolFor(record);
    if (pool !== undefined && !options.bypassQueue && !this.poolHasRoom(pool)) {
      record.status = "queued";
      if (!this.armQueuedAbort(id, options.signal))
        return id;
      let release;
      record.startGate = new Promise((resolve4) => {
        release = resolve4;
      });
      this.queue.push({
        id,
        pool,
        start: () => this.launch(id, record, args, pool),
        release: () => release()
      });
      options.onQueued?.(id, this.queue.filter((e) => e.pool === pool).length - 1);
      return id;
    }
    this.launch(id, record, args, undefined);
    return id;
  }
  armQueuedAbort(id, signal) {
    if (signal === undefined)
      return true;
    const record = this.agents.get(id);
    if (signal.aborted) {
      if (record)
        this.stopQueued(record);
      return false;
    }
    if (record)
      this.armParentAbort(record, signal);
    return true;
  }
  armParentAbort(record, signal) {
    this.detachParentAbort(record);
    if (signal === undefined)
      return;
    const onParentAbort = () => this.abort(record.id);
    signal.addEventListener("abort", onParentAbort, { once: true });
    record.detachParentAbort = () => signal.removeEventListener("abort", onParentAbort);
  }
  detachParentAbort(record) {
    record.detachParentAbort?.();
    record.detachParentAbort = undefined;
  }
  launch(id, record, args, queuedPool) {
    const startup = this.startAgent(id, record, args).then(() => {
      this.startups.delete(id);
      this.dropPendingArgs(id, args);
    }, (err) => {
      this.startups.delete(id);
      this.dropPendingArgs(id, args);
      if (queuedPool !== undefined) {
        if (queuedPool === "foreground")
          record.resultConsumed = true;
        record.status = "error";
        record.error = err instanceof Error ? err.message : String(err);
        record.completedAt = Date.now();
        this.notifyComplete(record);
      } else {
        this.agents.delete(id);
      }
      this.drainQueue();
      throw err;
    });
    this.startups.set(id, startup);
    return startup.catch(() => {});
  }
  dropPendingArgs(id, args) {
    if (this.pendingArgs.get(id) === args)
      this.pendingArgs.delete(id);
  }
  awaitStartup(id) {
    return this.startups.get(id) ?? Promise.resolve();
  }
  async startAgent(id, record, args) {
    const { pi, type, prompt, options } = args;
    const ctx = args.ctx;
    const svc = this.svc();
    assertValidSpawnCwd(options.cwd);
    const customCwd = options.cwd ?? undefined;
    const sessionCwd = ctx.cwd;
    const baseCwd = customCwd ?? sessionCwd;
    const pool = this.poolFor(record);
    record.status = "running";
    record.startedAt = Date.now();
    record.startGate = undefined;
    record.cwd = customCwd;
    record.baseCwd = baseCwd;
    this.pi = pi;
    const run = this.beginRun(id, record, pool);
    const stopDuringStartup = async (wt) => {
      if (record.status === "running") {
        record.status = "stopped";
        record.completedAt = Date.now();
      }
      this.releaseRunSlot(run);
      this.drainQueue();
      try {
        record.worktreeResult = await svc.cleanupWorktree(pi, baseCwd, wt, options.description);
      } catch {}
      this.endRun(run);
    };
    const isolation = options.workflowId !== undefined || options.resumeSessionFile !== undefined ? options.isolation : svc.getAgentConfig(type)?.isolation ?? options.isolation;
    let worktreeCwd;
    const priorWorktreeResult = options.restoreWorktree?.prior;
    if (options.restoreWorktree) {
      if (!svc.isWorktreeIsolationEnabled()) {
        this.discardRun(run);
        throw new Error(`Cannot resume agent ${id}: it ran in a git worktree, and worktree isolation is turned off in this project.`);
      }
      const wt = { ...options.restoreWorktree.worktree };
      const error = await svc.restoreWorktree(pi, baseCwd, wt, priorWorktreeResult);
      if (error) {
        this.discardRun(run);
        throw new Error(`Cannot resume agent ${id} in its git worktree: ${error}. Nothing was run.`);
      }
      record.worktree = wt;
      record.worktreeResult = priorWorktreeResult;
      worktreeCwd = customCwd !== undefined ? wt.workPath : wt.path;
      this.worktreeRepos.add(baseCwd);
      if (record.status !== "running" || options.signal?.aborted) {
        await stopDuringStartup(wt);
        return;
      }
    } else if (isolation === "worktree" && svc.isWorktreeIsolationEnabled()) {
      const wt = await svc.createWorktree(pi, baseCwd, id);
      if (!wt) {
        this.discardRun(run);
        throw new Error('Cannot run with isolation: "worktree" — not a git repo, no commits yet, or `git worktree add` failed. ' + "Initialize git and commit at least once, or omit `isolation`.");
      }
      record.worktree = wt;
      worktreeCwd = customCwd !== undefined ? wt.workPath : wt.path;
      this.worktreeRepos.add(baseCwd);
      record.invocation ??= {};
      record.invocation.isolation = "worktree";
      if (record.status !== "running" || options.signal?.aborted) {
        await stopDuringStartup(wt);
        return;
      }
    }
    try {
      this.onStart?.(record);
    } catch {}
    let runStart = 0;
    if (options.signal?.aborted)
      this.abort(id);
    else
      this.armParentAbort(record, options.signal);
    const detach = () => this.detachParentAbort(record);
    const promise = svc.runAgent(args.ctx, type, prompt, {
      pi,
      agentId: id,
      model: options.model,
      maxTurns: options.maxTurns,
      isolated: options.isolated,
      inheritContext: options.inheritContext,
      thinkingLevel: options.thinkingLevel,
      structuredOutput: options.structuredOutput,
      resumeSessionFile: options.resumeSessionFile,
      nested: options.parentAgentId !== undefined,
      workflow: options.workflowId !== undefined,
      cwd: worktreeCwd ?? customCwd,
      worktreeBase: worktreeCwd ? baseCwd : undefined,
      configCwd: options.configCwd ?? (customCwd !== undefined ? sessionCwd : undefined),
      signal: record.abortController.signal,
      onToolActivity: (activity) => {
        if (activity.type === "end")
          record.toolUses++;
        options.onToolActivity?.(activity);
      },
      onTurnEnd: options.onTurnEnd,
      onTextDelta: options.onTextDelta,
      onAssistantUsage: (usage) => {
        addUsage(record.lifetimeUsage, usage);
        this.onUsage?.(record, usage);
        options.onAssistantUsage?.(usage);
      },
      onCompaction: (info) => {
        record.compactionCount++;
        this.onCompact?.(record, info);
        options.onCompaction?.(info);
      },
      nestedRuntime: {
        manager: this,
        parentAgentId: id,
        depth: record.depth ?? 1,
        maxSubagentDepth: record.maxSubagentDepth
      },
      onSessionCreated: (session) => {
        if (run.abandoned) {
          shutdownChildSession(session);
          return;
        }
        record.session = session;
        runStart = messageCount(session);
        record.sessionFile = session.sessionManager?.getSessionFile?.();
        recordRunModel(record, session);
        if (record.pendingSteers?.length) {
          for (const msg of record.pendingSteers) {
            session.steer(msg).catch(() => {});
          }
          record.pendingSteers = undefined;
        }
        try {
          options.onSessionCreated?.(session);
        } catch {}
      }
    }).then(async ({ responseText, session, aborted, steered, failure, structuredJson, structuredRetried, maxTurns, modelNote }) => {
      if (run.abandoned)
        return responseText;
      record.maxTurns = maxTurns;
      record.modelNote ??= modelNote;
      if (record.status !== "stopped") {
        if (aborted) {
          record.status = "aborted";
        } else if (failure) {
          record.status = "error";
          record.error = failure;
        } else {
          record.status = steered ? "steered" : "completed";
        }
      }
      record.result = responseText;
      record.structuredJson = structuredJson;
      record.structuredRetried = structuredRetried;
      record.session = session;
      record.completedAt ??= Date.now();
      detach();
      if (record.outputCleanup) {
        try {
          record.outputCleanup();
        } catch {}
        record.outputCleanup = undefined;
      }
      if (record.worktree) {
        const wtResult = await svc.cleanupWorktree(pi, baseCwd, record.worktree, options.description, options.onBeforeWorktreeCleanup);
        record.worktreeResult = wtResult.hasChanges || !priorWorktreeResult ? wtResult : priorWorktreeResult;
        const note = worktreeNote(record.worktreeResult, baseCwd, customCwd !== undefined);
        if (note)
          record.result = (record.result ?? "") + note;
      }
      this.abortOwnedChildren(id);
      if (record.isBackground === false)
        record.resultConsumed = true;
      this.endRun(run);
      return responseText;
    }).catch(async (err) => {
      if (run.abandoned)
        return "";
      if (record.status !== "stopped") {
        record.status = "error";
      }
      record.error = err instanceof Error ? err.message : String(err);
      record.completedAt ??= Date.now();
      salvagePartial(record, runStart);
      detach();
      if (record.outputCleanup) {
        try {
          record.outputCleanup();
        } catch {}
        record.outputCleanup = undefined;
      }
      if (record.worktree) {
        try {
          const wtResult = await svc.cleanupWorktree(pi, baseCwd, record.worktree, options.description);
          record.worktreeResult = wtResult.hasChanges || !priorWorktreeResult ? wtResult : priorWorktreeResult;
          const note = worktreeNote(record.worktreeResult, baseCwd, customCwd !== undefined);
          if (note)
            record.error = (record.error ?? "") + note;
        } catch {}
      }
      this.abortOwnedChildren(id);
      if (record.isBackground === false)
        record.resultConsumed = true;
      this.endRun(run);
      return "";
    });
    run.onAbandon = async () => {
      detach();
      salvagePartial(record, runStart);
      if (record.outputCleanup) {
        try {
          record.outputCleanup();
        } catch {}
        record.outputCleanup = undefined;
      }
      if (record.worktree) {
        try {
          const wtResult = await svc.cleanupWorktree(pi, baseCwd, record.worktree, options.description);
          record.worktreeResult = wtResult.hasChanges || !priorWorktreeResult ? wtResult : priorWorktreeResult;
          const note = worktreeNote(record.worktreeResult, baseCwd, customCwd !== undefined);
          if (note)
            record.result = (record.result ?? "") + note;
        } catch {}
      }
      this.abortOwnedChildren(id);
      if (record.isBackground === false)
        record.resultConsumed = true;
    };
    record.promise = Promise.race([promise, run.whenAbandoned.then(() => record.result ?? "")]);
    options.onSpawned?.(id);
  }
  abortOwnedChildren(parentId) {
    const parent = this.agents.get(parentId);
    const cause = parent?.status === "stopped" ? parent.stopCause : undefined;
    for (const [id, record] of this.agents) {
      if (record.parentAgentId === parentId)
        this.abort(id, cause);
    }
  }
  drainQueue() {
    for (;; ) {
      const i = this.queue.findIndex((e) => this.poolHasRoom(e.pool));
      if (i === -1)
        return;
      const [next] = this.queue.splice(i, 1);
      const record = this.agents.get(next.id);
      if (!record || record.status !== "queued") {
        next.release();
        continue;
      }
      next.start().then(() => next.release(), () => next.release());
    }
  }
  dequeue(pred) {
    const kept = [];
    for (const entry of this.queue) {
      if (pred(entry))
        entry.release();
      else
        kept.push(entry);
    }
    this.queue = kept;
  }
  async spawnAndWait(pi, ctx, type, prompt, options, onSpawned) {
    const id = this.spawn(pi, ctx, type, prompt, {
      ...options,
      isBackground: false,
      blocking: true,
      onSpawned
    });
    const record = this.agents.get(id);
    if (record.status === "queued")
      await record.startGate;
    await this.awaitStartup(id);
    if (record.promise)
      await this.waitInline(record, record.promise);
    if (record.promise === undefined && record.status === "error") {
      throw new Error(record.error ?? "Agent failed to start");
    }
    return { id, record };
  }
  sendToBackground(id) {
    const record = this.agents.get(id);
    const run = this.runs.get(id);
    if (!record?.blocking || !isTopLevelAgent(record) || record.status !== "running" || !record.promise)
      return false;
    if (!run || run.settled || run.record !== record)
      return false;
    this.detachParentAbort(record);
    if (!run.slotReleased) {
      if (run.pool === "foreground")
        this.runningForeground--;
      else if (run.pool === "background")
        this.runningBackground--;
      this.runningBackground++;
    }
    run.pool = "background";
    record.blocking = false;
    record.isBackground = true;
    record.resultConsumed = false;
    this.drainQueue();
    return true;
  }
  async resume(id, prompt, signal, options) {
    const record = this.agents.get(id);
    if (!record) {
      const entry = this.tombstones.get(id);
      return entry ? this.reopen(entry, prompt, signal, options) : undefined;
    }
    if (!record.session)
      return;
    if (isBusy(record))
      return;
    await this.waitForSettle(record);
    if (isBusy(record))
      return;
    if (this.needsReopen(record)) {
      const state = resumeStateOf(record);
      if (!state) {
        throw new Error(`Cannot resume agent ${id}: its last run is stuck in a tool call that ignored the stop request, ` + "and it has no saved session to reopen.");
      }
      this.removeRecord(id, record);
      return this.reopen(state, prompt, signal, options, {
        lifetimeUsage: { ...record.lifetimeUsage },
        toolUses: record.toolUses,
        compactionCount: record.compactionCount
      });
    }
    this.cancelRelease(record);
    const before = { status: record.status, completedAt: record.completedAt };
    record.status = "queued";
    const preparation = this.prepareResume(record, options);
    record.promise = preparation.then(() => record.result ?? "", () => record.result ?? "");
    try {
      await preparation;
    } catch (err) {
      if (record.status === "queued") {
        record.status = before.status;
        record.completedAt = before.completedAt;
      }
      throw err;
    }
    if (record.status !== "queued")
      return record;
    options?.onRecord?.(record);
    if (options?.isBackground) {
      record.isBackground = true;
      record.resultConsumed = false;
      record.result = undefined;
      record.error = undefined;
      record.stopCause = undefined;
      record.completedAt = undefined;
      record.status = "queued";
      const start = () => this.startResume(id, record, prompt, signal, options);
      if (occupiesPoolSlot(record) && !this.poolHasRoom("background")) {
        this.queue.push({
          id,
          pool: "background",
          start: async () => {
            try {
              start();
            } catch (err) {
              record.status = "error";
              record.error = err instanceof Error ? err.message : String(err);
              record.completedAt = Date.now();
              this.notifyComplete(record);
            }
          },
          release: () => {}
        });
      } else {
        start();
      }
      return record;
    }
    record.isBackground = false;
    record.resultConsumed = true;
    record.status = "running";
    record.startedAt = Date.now();
    record.completedAt = undefined;
    record.result = undefined;
    record.error = undefined;
    record.stopCause = undefined;
    const session = record.session;
    recordRunModel(record, session);
    const runStart = messageCount(session);
    const abortController = new AbortController;
    record.abortController = abortController;
    const onParentAbort = () => this.abort(id);
    const run = this.beginRun(id, record, undefined);
    const promise = (async () => {
      try {
        try {
          this.onStart?.(record);
        } catch {}
        if (signal?.aborted)
          this.abort(id);
        else
          signal?.addEventListener("abort", onParentAbort, { once: true });
        const { text, failure, aborted, steered } = abortController.signal.aborted ? { text: "" } : await this.svc().resumeAgent(session, prompt, {
          maxTurns: options?.maxTurns ?? record.maxTurns,
          onTurnEnd: options?.onTurnEnd,
          onToolActivity: (activity) => {
            if (activity.type === "end")
              record.toolUses++;
            options?.onToolActivity?.(activity);
          },
          onAssistantUsage: (usage) => {
            addUsage(record.lifetimeUsage, usage);
            this.onUsage?.(record, usage);
            options?.onAssistantUsage?.(usage);
          },
          onCompaction: (info) => {
            record.compactionCount++;
            this.onCompact?.(record, info);
            options?.onCompaction?.(info);
          },
          signal: abortController.signal
        });
        if (run.abandoned)
          return record.result ?? "";
        settleResumeStatus(record, { failure, aborted, steered });
        record.result = text;
        record.completedAt ??= Date.now();
      } catch (err) {
        if (run.abandoned)
          return record.result ?? "";
        if (record.status !== "stopped") {
          record.status = "error";
          record.error = err instanceof Error ? err.message : String(err);
        }
        record.completedAt ??= Date.now();
        salvagePartial(record, runStart);
      }
      signal?.removeEventListener("abort", onParentAbort);
      this.abortOwnedChildren(id);
      await this.finishResumedWorktree(record);
      this.endRun(run);
      return record.result ?? "";
    })();
    run.onAbandon = async () => {
      salvagePartial(record, runStart);
      signal?.removeEventListener("abort", onParentAbort);
      this.abortOwnedChildren(id);
      await this.finishResumedWorktree(record);
    };
    record.promise = Promise.race([promise, run.whenAbandoned.then(() => record.result ?? "")]);
    await this.waitInline(record, record.promise);
    return record;
  }
  async reopen(entry, prompt, signal, options, carry) {
    const pi = options?.pi ?? this.pi;
    const ctx = options?.ctx;
    if (!pi || !ctx) {
      throw new Error(`Agent ${entry.id} has finished and is no longer in memory, and it cannot be reopened from here.`);
    }
    const problem = this.svc().sessionFileProblem(entry.sessionFile);
    if (problem) {
      if (!existsSync10(entry.sessionFile))
        this.tombstones.delete(entry.id);
      throw new Error(`Cannot resume agent ${entry.id}: ${problem}.`);
    }
    const typeProblem = options?.checkType?.(entry.type);
    if (typeProblem)
      throw new Error(`Cannot resume agent ${entry.id}: ${typeProblem}`);
    const slash = entry.model?.indexOf("/") ?? -1;
    const model = entry.model && slash > 0 ? ctx.modelRegistry.find(entry.model.slice(0, slash), entry.model.slice(slash + 1)) : undefined;
    const cwd = entry.cwd ?? (entry.baseCwd !== undefined && entry.baseCwd !== ctx.cwd ? entry.baseCwd : undefined);
    const spawnOptions = {
      description: entry.description,
      reuseId: entry.id,
      carry,
      reclaim: entry.handle !== undefined ? { handle: entry.handle, alias: entry.alias } : undefined,
      resumeSessionFile: entry.sessionFile,
      model,
      maxTurns: options?.maxTurns ?? entry.maxTurns,
      isolated: entry.isolated,
      cwd,
      restoreWorktree: entry.worktree ? { worktree: entry.worktree, prior: entry.worktreeResult } : undefined,
      parentAgentId: entry.parentAgentId,
      workflowId: entry.workflowId,
      depth: entry.depth,
      maxSubagentDepth: entry.maxSubagentDepth,
      rootSessionId: entry.rootSessionId,
      invocation: {
        ...entry.thinking ? { thinking: entry.thinking } : {},
        ...entry.isolated ? { isolated: true } : {},
        ...entry.worktree ? { isolation: "worktree" } : {}
      },
      onToolActivity: options?.onToolActivity,
      onAssistantUsage: options?.onAssistantUsage,
      onTurnEnd: options?.onTurnEnd,
      onCompaction: options?.onCompaction,
      onSessionCreated: () => {
        try {
          options?.onStarted?.();
        } catch {}
      },
      onSpawned: (spawnedId) => {
        const rec = this.agents.get(spawnedId);
        if (rec)
          options?.onRecord?.(rec);
      }
    };
    if (options?.isBackground) {
      const newId = this.spawn(pi, ctx, entry.type, prompt, { ...spawnOptions, isBackground: true, signal });
      await this.awaitStartup(newId);
      const rec = this.agents.get(newId);
      if (!rec)
        throw new Error(`Agent ${entry.id} could not be reopened.`);
      return rec;
    }
    const { record } = await this.spawnAndWait(pi, ctx, entry.type, prompt, { ...spawnOptions, signal });
    return record;
  }
  async prepareResume(record, options) {
    const worktree = record.worktree;
    if (worktree?.path && !existsSync10(worktree.path)) {
      if (!this.svc().isWorktreeIsolationEnabled()) {
        throw new Error(`Cannot resume agent ${record.id}: it ran in a git worktree, and worktree isolation is turned off in this project.`);
      }
      const pi = options?.pi ?? this.pi;
      const repo = record.baseCwd;
      const error = pi && repo ? await this.svc().restoreWorktree(pi, repo, worktree, record.worktreeResult) : "the repository it ran in is unknown";
      if (error) {
        throw new Error(`Cannot resume agent ${record.id} in its git worktree: ${error}. Nothing was run.`);
      }
      if (repo)
        this.worktreeRepos.add(repo);
    }
  }
  async finishResumedWorktree(record) {
    const pi = this.pi;
    const repo = record.baseCwd;
    if (!record.worktree?.path || !pi || !repo || !existsSync10(record.worktree.path))
      return;
    const prior = record.worktreeResult;
    try {
      const wtResult = await this.svc().cleanupWorktree(pi, repo, record.worktree, record.description);
      record.worktreeResult = wtResult.hasChanges || !prior ? wtResult : prior;
      const note = worktreeNote(record.worktreeResult, repo, record.cwd !== undefined);
      if (!note)
        return;
      if (record.status === "error")
        record.error = (record.error ?? "") + note;
      else
        record.result = (record.result ?? "") + note;
    } catch {}
  }
  async waitForSettle(record) {
    await this.startups.get(record.id)?.catch(() => {});
    await record.promise?.catch(() => {});
  }
  startResume(id, record, prompt, parentSignal, options) {
    if (!record.session)
      return;
    record.status = "running";
    record.startedAt = Date.now();
    const runStart = messageCount(record.session);
    recordRunModel(record, record.session);
    const run = this.beginRun(id, record, occupiesPoolSlot(record) ? "background" : undefined);
    try {
      this.onStart?.(record);
    } catch {}
    const abortController = new AbortController;
    record.abortController = abortController;
    let detachParentSignal;
    if (parentSignal) {
      const onParentAbort = () => this.abort(id);
      parentSignal.addEventListener("abort", onParentAbort, { once: true });
      detachParentSignal = () => parentSignal.removeEventListener("abort", onParentAbort);
    }
    try {
      options.onStarted?.();
    } catch {}
    const windDown = async () => {
      detachParentSignal?.();
      detachParentSignal = undefined;
      if (record.status === "error" || record.status === "stopped")
        salvagePartial(record, runStart);
      if (record.outputCleanup) {
        try {
          record.outputCleanup();
        } catch {}
        record.outputCleanup = undefined;
      }
      this.abortOwnedChildren(id);
      await this.finishResumedWorktree(record);
    };
    run.onAbandon = windDown;
    const settle = async () => {
      await windDown();
      this.endRun(run);
    };
    const promise = this.svc().resumeAgent(record.session, prompt, {
      maxTurns: options.maxTurns ?? record.maxTurns,
      onTurnEnd: options.onTurnEnd,
      onToolActivity: (activity) => {
        if (activity.type === "end")
          record.toolUses++;
        options.onToolActivity?.(activity);
      },
      onAssistantUsage: (usage) => {
        addUsage(record.lifetimeUsage, usage);
        this.onUsage?.(record, usage);
        options.onAssistantUsage?.(usage);
      },
      onCompaction: (info) => {
        record.compactionCount++;
        this.onCompact?.(record, info);
        options.onCompaction?.(info);
      },
      signal: abortController.signal
    }).then(async ({ text, failure, aborted, steered }) => {
      if (run.abandoned)
        return text;
      settleResumeStatus(record, { failure, aborted, steered });
      record.result = text;
      record.completedAt ??= Date.now();
      await settle();
      return text;
    }).catch(async (err) => {
      if (run.abandoned)
        return "";
      if (record.status !== "stopped") {
        record.status = "error";
        record.error = err instanceof Error ? err.message : String(err);
      }
      record.completedAt ??= Date.now();
      await settle();
      return "";
    });
    record.promise = Promise.race([promise, run.whenAbandoned.then(() => record.result ?? "")]);
  }
  steer(id, message) {
    const record = this.agents.get(id);
    if (!record)
      return false;
    if (record.status !== "running" && record.status !== "queued")
      return false;
    if (record.session) {
      record.session.steer(message).catch(() => {});
    } else {
      if (!record.pendingSteers)
        record.pendingSteers = [];
      record.pendingSteers.push(message);
    }
    return true;
  }
  getRecord(id) {
    return this.agents.get(id);
  }
  takenHandles() {
    const taken = new Set;
    for (const record of this.agents.values()) {
      if (record.handle)
        taken.add(record.handle);
      if (record.alias)
        taken.add(record.alias);
    }
    for (const entry of this.tombstones.values()) {
      if (entry.handle)
        taken.add(entry.handle);
      if (entry.alias)
        taken.add(entry.alias);
    }
    return taken;
  }
  resolveMention(name) {
    const wanted = name.toLowerCase();
    let fallback;
    for (const record of this.agents.values()) {
      if (record.parentAgentId !== undefined || !this.isVisible(record))
        continue;
      if (record.handle?.toLowerCase() !== wanted && record.alias?.toLowerCase() !== wanted)
        continue;
      if (record.status === "running" || record.status === "queued")
        return { kind: "live", record };
      if (!fallback || record.startedAt > fallback.startedAt)
        fallback = record;
    }
    if (fallback)
      return { kind: "live", record: fallback };
    const byId = this.agents.get(name);
    if (byId?.parentAgentId === undefined && byId !== undefined && this.isVisible(byId))
      return { kind: "live", record: byId };
    for (const entry of this.tombstones.values()) {
      if (!isTopLevelTombstone(entry))
        continue;
      if (entry.handle.toLowerCase() === wanted || entry.alias?.toLowerCase() === wanted || entry.id === name) {
        return { kind: "tombstone", entry };
      }
    }
    return;
  }
  findTombstone(id) {
    return this.tombstones.get(id);
  }
  dropTombstone(idOrHandle) {
    if (this.tombstones.delete(idOrHandle))
      return;
    for (const [id, entry] of this.tombstones) {
      if (entry.handle === idOrHandle)
        this.tombstones.delete(id);
    }
  }
  listTombstones() {
    return [...this.tombstones.values()].filter(isTopLevelTombstone).sort((a, b) => b.completedAt - a.completedAt);
  }
  listAgents() {
    return this.listAllAgents().filter((record) => this.isVisible(record));
  }
  listAllAgents() {
    return [...this.agents.values()].sort((a, b) => b.startedAt - a.startedAt);
  }
  abort(id, cause) {
    const record = this.agents.get(id);
    if (!record)
      return false;
    if (record.status === "queued") {
      this.dequeue((q) => q.id === id);
      this.stopQueued(record, cause);
      return true;
    }
    if (record.status !== "running")
      return false;
    record.abortController?.abort();
    record.status = "stopped";
    record.stopCause = cause;
    record.completedAt = Date.now();
    this.armStopGrace(id);
    return true;
  }
  stopQueued(record, cause) {
    this.pendingArgs.delete(record.id);
    record.status = "stopped";
    record.stopCause = cause;
    record.completedAt = Date.now();
    if (record.isBackground === false)
      record.resultConsumed = true;
    this.notifyComplete(record);
  }
  removeRecord(id, record) {
    this.tombstone(record);
    this.cancelRelease(record);
    const session = this.released.has(record) ? undefined : record.session;
    record.session = undefined;
    this.agents.delete(id);
    this.startups.delete(id);
    shutdownChildSession(session);
  }
  tombstone(record) {
    const state = resumeStateOf(record);
    if (state)
      this.keepTombstone(state);
  }
  keepTombstone(state) {
    this.tombstones.set(state.id, state);
    this.trimTombstones();
  }
  trimTombstones() {
    let topLevel = 0;
    for (const entry of this.tombstones.values())
      if (isTopLevelAgent(entry))
        topLevel++;
    const owned = this.tombstones.size - topLevel;
    for (const [kindIsTopLevel, excessCount] of [[true, topLevel - MAX_TOMBSTONES], [false, owned - MAX_OWNED_TOMBSTONES]]) {
      if (excessCount <= 0)
        continue;
      const sameKind = [...this.tombstones.values()].filter((entry) => isTopLevelAgent(entry) === kindIsTopLevel);
      sameKind.sort((a, b) => a.completedAt - b.completedAt);
      for (const entry of sameKind.slice(0, excessCount))
        this.tombstones.delete(entry.id);
    }
  }
  restoreTombstones(states) {
    for (const state of states) {
      if (this.agents.has(state.id))
        continue;
      const current = this.tombstones.get(state.id);
      if (current && current.completedAt > state.completedAt)
        continue;
      this.tombstones.set(state.id, state);
    }
    this.trimTombstones();
  }
  cleanup() {
    const cutoff = Date.now() - 10 * 60000;
    for (const [id, record] of this.agents) {
      if (this.isRunActive(id))
        continue;
      if ((record.completedAt ?? 0) >= cutoff)
        continue;
      this.removeRecord(id, record);
    }
  }
  clearCompleted(skipUnconsumed = false) {
    for (const [id, record] of this.agents) {
      if (this.isRunActive(id))
        continue;
      if (skipUnconsumed && !record.resultConsumed)
        continue;
      this.removeRecord(id, record);
    }
    this.tombstones.clear();
  }
  hasRunning() {
    for (const run of this.runs.values())
      if (this.isVisible(run.record))
        return true;
    return [...this.agents.values()].some((record) => isBusy(record) && this.isVisible(record));
  }
  abortAll(cause) {
    let count = 0;
    const queued = this.queue.map((entry) => this.agents.get(entry.id)).filter((record) => record?.status === "queued");
    this.dequeue(() => true);
    for (const record of queued) {
      this.stopQueued(record, cause);
      count++;
    }
    for (const [id, record] of this.agents) {
      if (record.status === "running") {
        record.abortController?.abort();
        record.status = "stopped";
        record.stopCause = cause;
        record.completedAt = Date.now();
        this.armStopGrace(id);
        count++;
      }
    }
    return count;
  }
  async awaitWorktreeCleanup(timeoutMs, ids) {
    const pending = [];
    for (const record of this.agents.values()) {
      if (ids !== undefined && !ids.has(record.id))
        continue;
      const startup = this.startups.get(record.id);
      if (!record.worktree && !startup)
        continue;
      pending.push((startup ?? Promise.resolve()).catch(() => {}).then(() => record.worktree ? record.promise : undefined));
    }
    if (pending.length === 0)
      return;
    let timer;
    await Promise.race([
      Promise.allSettled(pending),
      new Promise((resolve4) => {
        timer = setTimeout(resolve4, timeoutMs);
      })
    ]);
    clearTimeout(timer);
  }
  async waitForAll() {
    while (true) {
      this.drainQueue();
      const pending = [];
      for (const record of this.agents.values()) {
        if (record.status !== "running" && record.status !== "queued")
          continue;
        if (!this.isVisible(record))
          continue;
        const startup = this.startups.get(record.id);
        if (startup)
          pending.push(startup);
        if (record.promise)
          pending.push(record.promise);
      }
      for (const run of this.runs.values())
        if (this.isVisible(run.record))
          pending.push(run.done);
      if (pending.length === 0)
        break;
      await Promise.allSettled(pending);
    }
  }
  async dispose(pi) {
    clearInterval(this.cleanupInterval);
    this.dequeue(() => true);
    for (const run of this.runs.values()) {
      if (run.graceTimer)
        clearTimeout(run.graceTimer);
      run.settled = true;
      run.resolveDone();
    }
    this.runs.clear();
    for (const timer of this.releaseTimers.values())
      clearTimeout(timer);
    this.releaseTimers.clear();
    const sessions = [...this.agents.values()].filter((record) => !this.released.has(record)).map((record) => record.session);
    this.agents.clear();
    this.startups.clear();
    this.pendingArgs.clear();
    if (pi) {
      const prune = (repo) => {
        this.svc().pruneWorktrees(pi, repo).catch(() => {});
      };
      prune(process.cwd());
      for (const repo of this.worktreeRepos)
        prune(repo);
    }
    await Promise.all(sessions.map((session) => shutdownChildSession(session)));
  }
}
var DEFAULT_MAX_CONCURRENT = 10, DEFAULT_MAX_CONCURRENT_FOREGROUND = 0, MAX_TOMBSTONES = 2000, MAX_OWNED_TOMBSTONES = 4000, CHILD_SHUTDOWN_TIMEOUT_MS = 3000, DEFAULT_STOP_GRACE_MS = 20000, INLINE_STOP_WAIT_MS = 3000, DEFAULT_SESSION_RELEASE_MS = 60000, RECORD_ENTRY_TYPE = "subagents:record", RESUME_ENTRY_TYPE = "subagents:resume", DEFAULT_SERVICES;
var init_agent_manager = __esm(() => {
  init_agent_runner();
  init_agent_types();
  init_mention();
  init_session_file();
  init_session_handoff();
  init_usage();
  init_worktree();
  DEFAULT_SERVICES = managerServices();
});

// dist/token-rate.js
function pushSample(samples, now, total) {
  const last = samples[samples.length - 1];
  if (last && last.ts === now && last.total === total)
    return;
  samples.push({ ts: now, total });
  while (samples.length > 2 && now - samples[0].ts > RATE_WINDOW_MS)
    samples.shift();
}
function rateOver(samples) {
  if (!samples || samples.length < 2)
    return 0;
  const oldest = samples[0];
  const newest = samples[samples.length - 1];
  const elapsedMs = newest.ts - oldest.ts;
  if (elapsedMs <= 0)
    return 0;
  const delta = newest.total - oldest.total;
  if (delta <= 0)
    return 0;
  return delta / elapsedMs * 1000;
}
function sampleTokenRate(key, total, now) {
  const samples = tokenSamples.get(key) ?? [];
  pushSample(samples, now, total);
  tokenSamples.set(key, samples);
}
function tokenRate(key) {
  return rateOver(tokenSamples.get(key));
}
function clearTokenRate(key) {
  tokenSamples.delete(key);
}
function clearTokenRates(prefix) {
  for (const key of tokenSamples.keys()) {
    if (key.startsWith(prefix))
      tokenSamples.delete(key);
  }
}
var RATE_WINDOW_MS = 1e4, tokenSamples;
var init_token_rate = __esm(() => {
  tokenSamples = new Map;
});

// dist/ui/refresh-ticker.js
class RefreshTicker {
  subs = new Map;
  timer;
  timerPeriod = 0;
  set(owner, periodMs, fn) {
    const existing = this.subs.get(owner);
    if (existing) {
      existing.fn = fn;
      if (existing.period === periodMs)
        return;
      existing.period = periodMs;
    } else {
      this.subs.set(owner, { period: periodMs, last: Date.now(), fn });
    }
    this.reschedule();
  }
  delete(owner) {
    if (this.subs.delete(owner))
      this.reschedule();
  }
  has(owner) {
    return this.subs.has(owner);
  }
  clear() {
    this.subs.clear();
    this.reschedule();
  }
  reschedule() {
    let period = 0;
    for (const sub of this.subs.values())
      period = period === 0 ? sub.period : Math.min(period, sub.period);
    if (period === this.timerPeriod)
      return;
    if (this.timer)
      clearInterval(this.timer);
    this.timer = undefined;
    this.timerPeriod = period;
    if (period > 0)
      this.timer = setInterval(() => this.tick(), period);
  }
  tick() {
    const now = Date.now();
    for (const [owner, sub] of [...this.subs]) {
      if (this.subs.get(owner) !== sub)
        continue;
      if (now - sub.last + this.timerPeriod / 2 < sub.period)
        continue;
      sub.last = now;
      sub.fn();
    }
  }
}

// dist/ui/agent-widget.js
import { truncateToWidth } from "@earendil-works/pi-tui";
function fgPreservingNestedStyles(theme, color, text) {
  const styledEmpty = theme.fg(color, "");
  const styleStart = styledEmpty.replace(/\u001b\[(?:0|39)m/g, "");
  return theme.fg(color, text.replace(/\u001b\[(?:0|39)m/g, (reset) => `${reset}${styleStart}`));
}
function formatTokens(count) {
  if (count >= 1e6)
    return `${(count / 1e6).toFixed(1)}M token`;
  if (count >= 1000)
    return `${(count / 1000).toFixed(1)}k token`;
  return `${count} token`;
}
function formatCost(cost) {
  if (!(cost > 0))
    return "";
  if (cost < 0.0001)
    return "<$0.0001";
  if (cost >= 1)
    return `~$${cost.toFixed(2)}`;
  const rounded = Number(cost.toFixed(4));
  const decimals = (String(rounded).split(".")[1] ?? "").length;
  return `~$${rounded.toFixed(Math.max(2, decimals))}`;
}
function formatSessionTokens(tokens, percent, theme, compactions = 0) {
  const tokenStr = formatTokens(tokens);
  const annot = [];
  if (percent !== null) {
    const color = percent >= 85 ? "error" : percent >= 70 ? "warning" : "dim";
    annot.push(theme.fg(color, `${Math.round(percent)}%`));
  }
  if (compactions > 0) {
    annot.push(theme.fg("dim", `⇊${compactions}`));
  }
  if (annot.length === 0)
    return tokenStr;
  return `${tokenStr} (${annot.join(" · ")})`;
}
function formatTurns(turnCount, maxTurns) {
  return maxTurns != null ? `↻${turnCount}≤${maxTurns}` : `↻${turnCount}`;
}
function formatMs(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}
function formatDuration2(startedAt, completedAt) {
  if (completedAt)
    return formatMs(completedAt - startedAt);
  return `${formatMs(Date.now() - startedAt)} (running)`;
}
function getDisplayName(type) {
  return getConfig(type).displayName;
}
function getPromptModeLabel(type) {
  const config = getConfig(type);
  return config.promptMode === "append" ? "twin" : undefined;
}
function buildInvocationTags(invocation) {
  const tags = [];
  if (!invocation)
    return { tags };
  const asked = (value, requested) => value && requested && requested !== value ? `${value} (asked ${requested})` : value;
  const thinking = asked(invocation.thinking, invocation.requestedThinking);
  if (thinking)
    tags.push(`thinking: ${thinking}`);
  if (invocation.isolated)
    tags.push("isolated");
  if (invocation.isolation === "worktree")
    tags.push("worktree");
  if (invocation.inheritContext)
    tags.push("inherit context");
  if (invocation.runInBackground)
    tags.push("background");
  if (invocation.maxTurns != null)
    tags.push(`max turns: ${invocation.maxTurns}`);
  return {
    modelName: asked(invocation.modelName, invocation.requestedModel),
    modelId: asked(invocation.modelId, invocation.requestedModel),
    tags
  };
}
function truncateLineSlow(text, len) {
  const line = text.split(`
`).find((l) => l.trim())?.trim() ?? "";
  if (line.length <= len)
    return line;
  return line.slice(0, len) + "…";
}
function truncateLine(text, len = 60) {
  FIRST_NON_SPACE.lastIndex = 0;
  const first = FIRST_NON_SPACE.exec(text);
  if (!first)
    return "";
  const window = text.slice(first.index, first.index + len + 1);
  const newline = window.indexOf(`
`);
  if (newline >= 0)
    return window.slice(0, newline).trim();
  if (window.length <= len)
    return window.trim();
  if (/\S/.test(window[len]))
    return window.slice(0, len) + "…";
  return truncateLineSlow(text, len);
}
function describeActivity(activeTools, responseText) {
  if (activeTools.size > 0) {
    const groups = new Map;
    for (const toolName of activeTools.values()) {
      const action = TOOL_DISPLAY[toolName] ?? toolName;
      groups.set(action, (groups.get(action) ?? 0) + 1);
    }
    const parts = [];
    for (const [action, count] of groups) {
      if (count > 1) {
        parts.push(`${action} ${count} ${action === "searching" ? "patterns" : "files"}`);
      } else {
        parts.push(action);
      }
    }
    return parts.join(", ") + "…";
  }
  if (responseText && responseText.trim().length > 0) {
    return truncateLine(responseText);
  }
  return "thinking…";
}

class AgentWidget {
  manager;
  agentActivity;
  mode;
  showCost;
  showModel;
  ticker;
  uiCtx;
  widgetFrame = 0;
  finishedTurnAge = new Map;
  static ERROR_LINGER_TURNS = 2;
  static FINISHED_LINGER_MS = 30000;
  static ERROR_LINGER_MS = 60000;
  expiryTimer;
  widgetRegistered = false;
  tui;
  lastStatusText;
  frameCache;
  theme;
  lastSent;
  clockAt = 0;
  ownFramePending = false;
  foreignRenders = 0;
  constructor(manager, agentActivity, mode = () => "all", showCost = () => false, showModel = () => false, ticker = new RefreshTicker) {
    this.manager = manager;
    this.agentActivity = agentActivity;
    this.mode = mode;
    this.showCost = showCost;
    this.showModel = showModel;
    this.ticker = ticker;
  }
  widgetAgents() {
    const all = this.manager.listAgents().filter(isTopLevelAgent);
    switch (this.mode()) {
      case "off":
        return [];
      case "background":
        return all.filter((a) => a.isBackground !== false);
      default:
        return all;
    }
  }
  setManager(manager) {
    this.manager = manager;
    this.update();
  }
  setUICtx(ctx) {
    if (ctx !== this.uiCtx) {
      this.uiCtx = ctx;
      this.frameCache = undefined;
      this.widgetRegistered = false;
      this.tui = undefined;
      this.theme = undefined;
      this.lastSent = undefined;
      this.lastStatusText = undefined;
    }
  }
  onTurnStart() {
    for (const [id, age] of this.finishedTurnAge) {
      this.finishedTurnAge.set(id, age + 1);
    }
    this.update();
  }
  ensureTimer() {
    if (!this.ticker.has(this))
      this.ticker.set(this, TICK_MS, () => this.tick());
  }
  tick() {
    const drawing = this.foreignRenders > 0;
    this.foreignRenders = 0;
    this.update(drawing || Date.now() - this.clockAt + TICK_MS / 2 >= IDLE_CLOCK_MS, !drawing);
  }
  advanceClock() {
    this.widgetFrame++;
    this.clockAt = Date.now();
  }
  static finishedExpiry(status, completedAt) {
    return completedAt + (ERROR_STATUSES.has(status) ? AgentWidget.ERROR_LINGER_MS : AgentWidget.FINISHED_LINGER_MS);
  }
  shouldShowFinished(agentId, status, completedAt) {
    const age = this.finishedTurnAge.get(agentId) ?? 0;
    const maxAge = ERROR_STATUSES.has(status) ? AgentWidget.ERROR_LINGER_TURNS : 1;
    return age < maxAge && Date.now() < AgentWidget.finishedExpiry(status, completedAt);
  }
  clearExpiryTimer() {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = undefined;
    }
  }
  markFinished(agentId) {
    this.frameCache = undefined;
    if (!this.finishedTurnAge.has(agentId)) {
      this.finishedTurnAge.set(agentId, 0);
    }
  }
  markRunning(agentId) {
    this.frameCache = undefined;
    this.finishedTurnAge.delete(agentId);
  }
  renderFinishedLine(a, theme) {
    const modeLabel = getPromptModeLabel(a.type);
    const duration = formatMs((a.completedAt ?? Date.now()) - a.startedAt);
    let icon;
    let statusText;
    if (a.status === "completed") {
      icon = theme.fg("success", "✓");
      statusText = "";
    } else if (a.status === "steered") {
      icon = theme.fg("warning", "✓");
      statusText = theme.fg("warning", " (turn limit)");
    } else if (a.status === "stopped") {
      icon = theme.fg("dim", "■");
      statusText = theme.fg("dim", " stopped");
    } else if (a.status === "error") {
      icon = theme.fg("error", "✗");
      const errMsg = a.error ? `: ${a.error.slice(0, 60)}` : "";
      statusText = theme.fg("error", ` error${errMsg}`);
    } else {
      icon = theme.fg("error", "✗");
      statusText = theme.fg("warning", " aborted");
    }
    const parts = [];
    const activity = this.agentActivity.get(a.id);
    if (activity)
      parts.push(formatTurns(activity.turnCount, activity.maxTurns));
    if (a.toolUses > 0)
      parts.push(`${a.toolUses} tool use${a.toolUses === 1 ? "" : "s"}`);
    const costText = this.showCost() ? formatCost(getLifetimeCost(a.lifetimeUsage)) : "";
    if (costText)
      parts.push(costText);
    parts.push(duration);
    const modeTag = modeLabel ? ` ${theme.fg("dim", `(${modeLabel})`)}` : "";
    return `${icon} ${renderAgentName(a.type, theme, { fallbackColor: "dim" })}${modeTag}  ${theme.fg("dim", a.description)} ${theme.fg("dim", "·")} ${theme.fg("dim", parts.join(" · "))}${statusText}`;
  }
  renderRunningLines(a, theme, frame, truncate) {
    const modeLabel = getPromptModeLabel(a.type);
    const modeTag = modeLabel ? ` ${theme.fg("dim", `(${modeLabel})`)}` : "";
    const elapsed = formatMs(Math.max(0, this.clockAt - a.startedAt));
    const bg = this.agentActivity.get(a.id);
    const toolUses = bg?.toolUses ?? a.toolUses;
    const tokens = getLifetimeTotal(a.lifetimeUsage);
    const contextPercent = getCachedSessionContextPercent(bg?.session);
    const tokenText = tokens > 0 ? formatSessionTokens(tokens, contextPercent, theme, a.compactionCount) : "";
    const costText = this.showCost() ? formatCost(getLifetimeCost(a.lifetimeUsage)) : "";
    const parts = [];
    if (this.showModel()) {
      const { modelName, tags } = buildInvocationTags(a.invocation);
      if (modelName)
        parts.push(modelName);
      const thinkingTag = tags.find((tag) => tag.startsWith("thinking: "));
      if (thinkingTag)
        parts.push(thinkingTag);
    }
    if (bg)
      parts.push(formatTurns(bg.turnCount, bg.maxTurns));
    if (toolUses > 0)
      parts.push(`${toolUses} tool use${toolUses === 1 ? "" : "s"}`);
    if (tokenText)
      parts.push(tokenText);
    const rate = tokenRate(agentRateKey(a.id));
    if (tokenText && rate > 0)
      parts.push(`${Math.round(rate)} tok/s`);
    if (costText)
      parts.push(costText);
    parts.push(elapsed);
    const statsText = parts.join(" · ");
    const activity = bg ? describeActivity(bg.activeTools, bg.responseText) : "thinking…";
    return [
      truncate(theme.fg("dim", "├─") + ` ${theme.fg("accent", frame)} ${renderAgentName(a.type, theme, { bold: true })}${modeTag}  ${theme.fg("muted", a.description)} ${theme.fg("dim", "·")} ${fgPreservingNestedStyles(theme, "dim", statsText)}`),
      truncate(theme.fg("dim", "│  ") + theme.fg("dim", `  ⎿  ${activity}`))
    ];
  }
  renderWidget(tui, theme) {
    if (this.ownFramePending)
      this.ownFramePending = false;
    else
      this.foreignRenders++;
    const lines = this.cachedLines(tui.terminal.columns, theme);
    this.lastSent = lines;
    return lines.slice();
  }
  cachedLines(w2, theme) {
    const cached = this.frameCache;
    if (cached && cached.width === w2 && cached.theme === theme)
      return cached.lines;
    const lines = this.buildWidgetLines(w2, theme);
    this.frameCache = { width: w2, theme, lines };
    return lines;
  }
  refresh(advance, request) {
    const tui = this.tui;
    const theme = this.theme;
    if (!tui || !theme)
      return;
    if (advance)
      this.advanceClock();
    const lines = this.cachedLines(tui.terminal.columns, theme);
    if (!request || sameLines(lines, this.lastSent))
      return;
    this.lastSent = lines;
    this.ownFramePending = true;
    tui.requestRender();
  }
  buildWidgetLines(w2, theme) {
    const allAgents = this.widgetAgents();
    const running = allAgents.filter((a) => a.status === "running");
    const now = this.clockAt || Date.now();
    if (running.length > 0) {
      let totalOutput = 0;
      for (const a of running) {
        const output = a.lifetimeUsage?.output ?? 0;
        totalOutput += output;
        sampleTokenRate(agentRateKey(a.id), output, now);
      }
      sampleTokenRate(RATE_KEY, totalOutput, now);
    } else {
      clearTokenRate(RATE_KEY);
      clearTokenRates(AGENT_RATE_PREFIX);
    }
    const queuedCount = allAgents.reduce((n, a) => a.status === "queued" ? n + 1 : n, 0);
    const finished = allAgents.filter((a) => a.status !== "running" && a.status !== "queued" && a.completedAt && this.shouldShowFinished(a.id, a.status, a.completedAt));
    const hasActive = running.length > 0 || queuedCount > 0;
    const hasFinished = finished.length > 0;
    if (!hasActive && !hasFinished)
      return [];
    const truncate = (line) => truncateToWidth(line, w2);
    const headingColor = hasActive ? "accent" : "dim";
    const headingIcon = hasActive ? "●" : "○";
    const frame = SPINNER[this.widgetFrame % SPINNER.length];
    const finishedLine = (a) => truncate(theme.fg("dim", "├─") + " " + this.renderFinishedLine(a, theme));
    const queuedLine = () => truncate(theme.fg("dim", "├─") + ` ${theme.fg("muted", "◦")} ${theme.fg("dim", `${queuedCount} queued`)}`);
    const maxBody = MAX_WIDGET_LINES - 1;
    const hasQueued = queuedCount > 0;
    const totalBody = finished.length + running.length * 2 + (hasQueued ? 1 : 0);
    const aggregateRate = tokenRate(RATE_KEY);
    const lines = [
      truncate(theme.fg(headingColor, headingIcon) + " " + theme.fg(headingColor, "Agents") + (aggregateRate > 0 ? theme.fg(headingColor, ` · ${Math.round(aggregateRate)} tok/s`) : ""))
    ];
    if (totalBody <= maxBody) {
      for (const a of finished)
        lines.push(finishedLine(a));
      for (const a of running)
        lines.push(...this.renderRunningLines(a, theme, frame, truncate));
      if (hasQueued)
        lines.push(queuedLine());
      if (lines.length > 1) {
        const last = lines.length - 1;
        lines[last] = lines[last].replace("├─", "└─");
        if (running.length > 0 && !hasQueued) {
          if (last >= 2) {
            lines[last - 1] = lines[last - 1].replace("├─", "└─");
            lines[last] = lines[last].replace("│  ", "   ");
          }
        }
      }
    } else {
      let budget = maxBody - 1;
      if (hasQueued)
        budget--;
      const shownRunning = Math.min(running.length, Math.floor(budget / 2));
      for (let i = 0;i < shownRunning; i++)
        lines.push(...this.renderRunningLines(running[i], theme, frame, truncate));
      budget -= shownRunning * 2;
      const hiddenRunning = running.length - shownRunning;
      if (hasQueued)
        lines.push(queuedLine());
      const shownFinished = Math.min(finished.length, budget);
      for (let i = 0;i < shownFinished; i++)
        lines.push(finishedLine(finished[i]));
      const hiddenFinished = finished.length - shownFinished;
      const overflowParts = [];
      if (hiddenRunning > 0)
        overflowParts.push(`${hiddenRunning} running`);
      if (hiddenFinished > 0)
        overflowParts.push(`${hiddenFinished} finished`);
      const overflowText = overflowParts.join(", ");
      lines.push(truncate(theme.fg("dim", "└─") + ` ${theme.fg("dim", `+${hiddenRunning + hiddenFinished} more (${overflowText})`)}`));
    }
    return lines;
  }
  update(advance = true, request = true) {
    this.frameCache = undefined;
    if (!this.uiCtx)
      return;
    const allAgents = this.widgetAgents();
    let runningCount = 0;
    let queuedCount = 0;
    let hasFinished = false;
    let nextExpiry = Infinity;
    for (const a of allAgents) {
      if (a.status === "running") {
        runningCount++;
      } else if (a.status === "queued") {
        queuedCount++;
      } else if (a.completedAt && this.shouldShowFinished(a.id, a.status, a.completedAt)) {
        hasFinished = true;
        nextExpiry = Math.min(nextExpiry, AgentWidget.finishedExpiry(a.status, a.completedAt));
      }
    }
    const hasActive = runningCount > 0 || queuedCount > 0;
    this.clearExpiryTimer();
    if (hasActive) {
      this.ensureTimer();
    } else {
      this.ticker.delete(this);
      if (hasFinished) {
        this.expiryTimer = setTimeout(() => {
          this.expiryTimer = undefined;
          this.update();
        }, Math.max(0, nextExpiry - Date.now()));
        this.expiryTimer.unref?.();
      }
    }
    if (!hasActive && !hasFinished) {
      if (this.widgetRegistered) {
        this.uiCtx.setWidget("agents", undefined);
        this.widgetRegistered = false;
        this.tui = undefined;
      }
      if (this.lastStatusText !== undefined) {
        this.uiCtx.setStatus("subagents", undefined);
        this.lastStatusText = undefined;
      }
      for (const [id] of this.finishedTurnAge) {
        if (!allAgents.some((a) => a.id === id))
          this.finishedTurnAge.delete(id);
      }
      return;
    }
    let newStatusText;
    if (hasActive) {
      const statusParts = [];
      if (runningCount > 0)
        statusParts.push(`${runningCount} running`);
      if (queuedCount > 0)
        statusParts.push(`${queuedCount} queued`);
      const total = runningCount + queuedCount;
      newStatusText = `${statusParts.join(", ")} agent${total === 1 ? "" : "s"}`;
    }
    if (newStatusText !== this.lastStatusText) {
      this.uiCtx.setStatus("subagents", newStatusText);
      this.lastStatusText = newStatusText;
    }
    if (!this.widgetRegistered) {
      this.advanceClock();
      this.lastSent = undefined;
      this.ownFramePending = true;
      this.uiCtx.setWidget("agents", (tui, theme) => {
        this.tui = tui;
        this.theme = theme;
        return {
          render: () => this.renderWidget(tui, theme),
          invalidate: () => {
            this.widgetRegistered = false;
            this.tui = undefined;
            this.theme = undefined;
          }
        };
      }, { placement: "aboveEditor" });
      this.widgetRegistered = true;
    } else {
      this.refresh(advance, request);
    }
  }
  dispose() {
    this.ticker.delete(this);
    this.clearExpiryTimer();
    if (this.uiCtx) {
      this.uiCtx.setWidget("agents", undefined);
      this.uiCtx.setStatus("subagents", undefined);
    }
    this.widgetRegistered = false;
    this.tui = undefined;
    this.theme = undefined;
    this.lastSent = undefined;
    this.lastStatusText = undefined;
  }
}
function sameLines(a, b2) {
  if (!b2 || a.length !== b2.length)
    return false;
  for (let i = 0;i < a.length; i++)
    if (a[i] !== b2[i])
      return false;
  return true;
}
var MAX_WIDGET_LINES = 12, TICK_MS = 80, IDLE_CLOCK_MS, SPINNER, ERROR_STATUSES, RATE_KEY = "agents", AGENT_RATE_PREFIX = "agent:", agentRateKey = (id) => `${AGENT_RATE_PREFIX}${id}`, TOOL_DISPLAY, FIRST_NON_SPACE;
var init_agent_widget = __esm(() => {
  init_agent_color();
  init_agent_manager();
  init_agent_types();
  init_token_rate();
  init_usage();
  IDLE_CLOCK_MS = 3 * TICK_MS;
  SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  ERROR_STATUSES = new Set(["error", "aborted", "steered", "stopped"]);
  TOOL_DISPLAY = {
    read: "reading",
    bash: "running command",
    edit: "editing",
    write: "writing",
    grep: "searching",
    find: "finding files",
    ls: "listing"
  };
  FIRST_NON_SPACE = /\S/g;
});

// dist/ui/terminal-text.js
function sanitizeTerminalText(text) {
  if (!HAS_CONTROL.test(text))
    return text;
  return text.replace(ANSI_SEQUENCE, "").replace(CONTROL, "");
}
var ANSI_SEQUENCE, CONTROL, HAS_CONTROL;
var init_terminal_text = __esm(() => {
  ANSI_SEQUENCE = /\u001B\][^\u0007\u001B\u009C]*(?:\u0007|\u001B\\|\u009C)|[\u001B\u009B][[\]()#;?]*(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]/g;
  CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\uFFF9-\uFFFB]/g;
  HAS_CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\uFFF9-\uFFFB]/;
});

// dist/ui/viewer-keys.js
import { matchesKey } from "@earendil-works/pi-tui";
function createViewerKeys(keybindings) {
  const matches = (data, id, fallback) => keybindings ? keybindings.matches(data, id) : matchesKey(data, fallback);
  return {
    scrollUp: (data) => matches(data, "tui.select.up", "up") || matchesKey(data, "k"),
    scrollDown: (data) => matches(data, "tui.select.down", "down") || matchesKey(data, "j"),
    pageUp: (data) => matches(data, "tui.select.pageUp", "pageUp") || matchesKey(data, "shift+up"),
    pageDown: (data) => matches(data, "tui.select.pageDown", "pageDown") || matchesKey(data, "shift+down"),
    toggleExpand: (data) => matches(data, "app.tools.expand", "ctrl+o"),
    expandLabel: keybindings?.getKeys ? keybindings.getKeys("app.tools.expand")[0] ?? "" : "ctrl+o"
  };
}
var init_viewer_keys = () => {};

// dist/ui/viewer-transcript.js
import { AssistantMessageComponent, BashExecutionComponent, BranchSummaryMessageComponent, CompactionSummaryMessageComponent, CustomMessageComponent, createBashToolDefinition, createEditToolDefinition, createFindToolDefinition, createGrepToolDefinition, createLsToolDefinition, createPowerShellToolDefinition, createReadToolDefinition, createWriteToolDefinition, getMarkdownTheme, parseSkillBlock, SkillInvocationMessageComponent, ToolExecutionComponent, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import { truncateToWidth as truncateToWidth2, visibleWidth } from "@earendil-works/pi-tui";
function cleanForTerminal(value, depth = 0) {
  if (typeof value === "string")
    return sanitizeTerminalText(value);
  if (value === null || typeof value !== "object" || depth > CLEAN_MAX_DEPTH)
    return value;
  if (Array.isArray(value)) {
    let out2;
    for (let i = 0;i < value.length; i++) {
      const item = value[i];
      const cleaned = cleanForTerminal(item, depth + 1);
      if (cleaned !== item) {
        out2 ??= value.slice();
        out2[i] = cleaned;
      }
    }
    return out2 ?? value;
  }
  const record = value;
  const image = record.type === "image";
  let out;
  for (const key of Object.keys(record)) {
    if (image && key === "data")
      continue;
    const item = record[key];
    const cleaned = cleanForTerminal(item, depth + 1);
    if (cleaned !== item) {
      out ??= { ...record };
      out[key] = cleaned;
    }
  }
  return out ?? value;
}
function withBuiltInRenderers(name, definition) {
  if (!builtInRenderers.has(name)) {
    const cwd = process.cwd();
    const create = {
      read: () => createReadToolDefinition(cwd),
      bash: () => createBashToolDefinition(cwd),
      powershell: () => createPowerShellToolDefinition(cwd),
      edit: () => createEditToolDefinition(cwd),
      write: () => createWriteToolDefinition(cwd),
      grep: () => createGrepToolDefinition(cwd),
      find: () => createFindToolDefinition(cwd),
      ls: () => createLsToolDefinition(cwd)
    };
    let renderers;
    try {
      const def = create[name]?.();
      if (def)
        renderers = { renderCall: def.renderCall, renderResult: def.renderResult };
    } catch {
      renderers = undefined;
    }
    builtInRenderers.set(name, renderers);
  }
  const builtIn = builtInRenderers.get(name);
  if (!definition)
    return builtIn;
  if (!builtIn)
    return definition;
  return {
    ...definition,
    renderCall: definition.renderCall ?? builtIn.renderCall,
    renderResult: definition.renderResult ?? builtIn.renderResult
  };
}
function signature(msg) {
  const m2 = msg;
  if (!Array.isArray(m2.content))
    return [m2.role, m2.content, m2.output, m2.command, m2.summary, m2.exitCode];
  const sig = [m2.role, m2.content, m2.content.length, m2.stopReason];
  for (const c of m2.content)
    sig.push(c, c.text ?? c.thinking, c.arguments);
  return sig;
}
function sameSignature(a, b2) {
  if (a.length !== b2.length)
    return false;
  for (let i = 0;i < a.length; i++)
    if (a[i] !== b2[i])
      return false;
  return true;
}
function isAssistant(msg) {
  return msg?.role === "assistant" && Array.isArray(msg.content);
}
function userText(msg) {
  if (typeof msg.content === "string")
    return msg.content;
  let text = "";
  for (const c of msg.content)
    if (c.type === "text")
      text += c.text;
  return text;
}

class PiTranscript {
  session;
  requestRender;
  options;
  lines = [];
  widths = [];
  renders = 0;
  entries = [];
  flat = [];
  blockStart = [];
  stream;
  tools = new Map;
  cacheMessages;
  width = -1;
  expanded = false;
  dirtyFrom = 0;
  layoutFrom = 0;
  streamMsg;
  streamChanged = false;
  started = new Set;
  partials = new Map;
  pendingToolUpdates = new Set;
  syncing = false;
  disposed = false;
  markdownTheme;
  transformers;
  runner;
  cwd;
  hasState;
  constructor(session, requestRender, options = {}) {
    this.session = session;
    this.requestRender = requestRender;
    this.options = options;
    this.markdownTheme = { ...getMarkdownTheme(), codeBlockIndent: options.codeBlockIndent ?? "  " };
    const loose = session;
    let runner;
    let cwd = process.cwd();
    try {
      runner = loose.extensionRunner;
      cwd = loose.sessionManager?.getCwd?.() ?? cwd;
    } catch {}
    this.runner = runner;
    this.cwd = cwd;
    this.transformers = runner?.getMarkdownTransformers?.() ?? [];
    const state = this.sessionState();
    this.hasState = state !== undefined;
    this.streamMsg = this.liveStream();
    this.streamChanged = this.streamMsg !== undefined;
    for (const id of state?.pendingToolCalls ?? [])
      this.started.add(id);
  }
  get hasContent() {
    return this.session.messages.length > 0 || this.streamMsg !== undefined;
  }
  get isExpanded() {
    return this.expanded;
  }
  handleEvent(event) {
    if (this.disposed)
      return;
    switch (event.type) {
      case "message_start":
      case "message_update":
        if (!isAssistant(event.message))
          break;
        this.streamChanged = true;
        if (!this.hasState)
          this.streamMsg = event.message;
        break;
      case "message_end":
      case "agent_end":
        if (event.type === "message_end" && event.message?.role !== "assistant")
          break;
        this.streamChanged = true;
        if (!this.hasState)
          this.streamMsg = undefined;
        break;
      case "tool_execution_start":
        if (event.parentToolCallId || !event.toolCallId)
          break;
        this.started.add(event.toolCallId);
        this.pendingToolUpdates.add(event.toolCallId);
        break;
      case "tool_execution_update":
        if (event.parentToolCallId || !event.toolCallId || !event.partialResult)
          break;
        this.partials.set(event.toolCallId, event.partialResult);
        this.pendingToolUpdates.add(event.toolCallId);
        break;
      case "tool_execution_end":
        if (event.toolCallId)
          this.started.delete(event.toolCallId);
        break;
    }
  }
  setExpanded(expanded) {
    if (expanded === this.expanded)
      return;
    this.expanded = expanded;
    for (const block of this.flat) {
      if (!block.expandable)
        continue;
      block.expandable.setExpanded(expanded);
      this.markDirty(block);
    }
  }
  invalidate() {
    for (const block of this.flat) {
      block.component.invalidate();
      block.dirty = true;
    }
    this.dirtyFrom = 0;
  }
  sync(width) {
    if (width !== this.width) {
      this.width = width;
      for (const block of this.flat)
        block.dirty = true;
      this.dirtyFrom = 0;
    }
    this.syncing = true;
    try {
      this.syncMessages();
      this.applyToolUpdates();
      this.syncStream();
      this.layout();
      this.assemble();
    } finally {
      this.syncing = false;
    }
  }
  dispose() {
    this.disposed = true;
    for (const tool of this.tools.values()) {
      if (tool.done || !tool.partial)
        continue;
      try {
        tool.component.updateResult({ ...tool.partial, isError: false }, false);
      } catch {}
    }
  }
  liveStream() {
    if (!this.hasState)
      return this.streamMsg;
    const msg = this.sessionState()?.streamingMessage;
    return isAssistant(msg) ? msg : undefined;
  }
  sessionState() {
    try {
      return this.session.state;
    } catch {
      return;
    }
  }
  syncMessages() {
    const messages = this.session.messages;
    let stale = Math.min(this.entries.length, messages.length);
    const sameArray = messages === this.cacheMessages && this.entries.length <= messages.length;
    const from = sameArray ? Math.max(0, this.entries.length - 1) : 0;
    this.cacheMessages = messages;
    for (let i = from;i < stale; i++) {
      const entry = this.entries[i];
      if (entry.msg !== messages[i] || i === this.entries.length - 1 && !sameSignature(entry.sig, signature(messages[i]))) {
        stale = i;
        break;
      }
    }
    if (stale === this.entries.length && stale === messages.length)
      return;
    for (let i = stale;i < this.entries.length; i++) {
      const owner = this.entries[i].owner;
      if (owner !== undefined && owner < stale)
        stale = owner;
    }
    for (let i = stale;i < this.entries.length; i++) {
      for (const block of this.entries[i].blocks)
        this.forgetTool(block);
    }
    this.entries.length = stale;
    this.layoutFrom = Math.min(this.layoutFrom, stale);
    const touched = [];
    for (let i = stale;i < messages.length; i++)
      this.entries.push(this.buildEntry(messages[i], touched));
    for (const tool of touched)
      if (!tool.done)
        tool.component.setArgsComplete();
  }
  flatEnd(count) {
    for (let i = Math.min(count, this.entries.length) - 1;i >= 0; i--) {
      const blocks = this.entries[i].blocks;
      if (blocks.length > 0)
        return blocks[blocks.length - 1].index + 1;
    }
    return 0;
  }
  hasBlocksBefore() {
    for (let i = this.entries.length - 1;i >= 0; i--)
      if (this.entries[i].blocks.length > 0)
        return true;
    return false;
  }
  buildEntry(msg, touched) {
    const entry = { msg, sig: signature(msg), blocks: [] };
    const index = this.entries.length;
    switch (msg.role) {
      case "user": {
        const text = sanitizeTerminalText(userText(msg));
        if (!text)
          break;
        const spaceBefore = this.hasBlocksBefore();
        const skill = parseSkillBlock(text);
        if (skill) {
          const component = new SkillInvocationMessageComponent(skill, this.markdownTheme, this.pad());
          component.setExpanded(this.expanded);
          entry.blocks.push(this.block(component, spaceBefore, component));
          if (skill.userMessage) {
            entry.blocks.push(this.block(new UserMessageComponent(skill.userMessage, this.markdownTheme, this.pad(), this.transformers), true));
          }
        } else {
          entry.blocks.push(this.block(new UserMessageComponent(text, this.markdownTheme, this.pad(), this.transformers), spaceBefore));
        }
        break;
      }
      case "assistant": {
        this.endStream();
        const clean = cleanForTerminal(msg);
        entry.blocks.push(this.block(this.assistantComponent(clean, false), false));
        const failed = clean.stopReason === "aborted" || clean.stopReason === "error";
        for (const content of clean.content) {
          if (content.type !== "toolCall")
            continue;
          const tool = this.toolFor(content.name, content.id, content.arguments);
          tool.entry = index;
          entry.blocks.push(tool.block);
          if (failed && !tool.done) {
            tool.component.updateResult({ content: [{ type: "text", text: this.failureText(clean) }], isError: true });
            tool.done = true;
            this.markDirty(tool.block);
          }
          touched.push(tool);
        }
        break;
      }
      case "toolResult": {
        const tool = this.tools.get(msg.toolCallId);
        if (!tool || tool.done)
          break;
        tool.component.updateResult(cleanForTerminal(msg));
        tool.done = true;
        this.partials.delete(msg.toolCallId);
        this.markDirty(tool.block);
        entry.owner = tool.entry;
        break;
      }
      case "bashExecution": {
        const component = new BashExecutionComponent(sanitizeTerminalText(msg.command), this.blockUi(), msg.excludeFromContext, this.pad());
        if (msg.output)
          component.appendOutput(sanitizeTerminalText(msg.output.replace(/\r\n?/g, `
`)));
        const truncation = msg.truncated ? { truncated: true } : undefined;
        component.setComplete(msg.exitCode, msg.cancelled, truncation, msg.fullOutputPath && sanitizeTerminalText(msg.fullOutputPath));
        entry.blocks.push(this.block(component, false, component));
        break;
      }
      case "custom": {
        if (!msg.display)
          break;
        const renderer = this.runner?.getMessageRenderer?.(msg.customType);
        const component = new CustomMessageComponent(cleanForTerminal(msg), renderer, this.markdownTheme, this.pad());
        component.setExpanded(this.expanded);
        entry.blocks.push(this.block(component, false, component));
        break;
      }
      case "compactionSummary": {
        const component = new CompactionSummaryMessageComponent(cleanForTerminal(msg), this.markdownTheme, this.pad());
        component.setExpanded(this.expanded);
        entry.blocks.push(this.block(component, true, component));
        break;
      }
      case "branchSummary": {
        const component = new BranchSummaryMessageComponent(cleanForTerminal(msg), this.markdownTheme, this.pad());
        component.setExpanded(this.expanded);
        entry.blocks.push(this.block(component, true, component));
        break;
      }
      default:
        break;
    }
    return entry;
  }
  failureText(msg) {
    if (msg.stopReason !== "aborted")
      return msg.errorMessage || "Error";
    const retries = this.session.retryAttempt ?? 0;
    return retries > 0 ? `Aborted after ${retries} retry attempt${retries > 1 ? "s" : ""}` : "Operation aborted";
  }
  pad() {
    return this.options.outputPad ?? 1;
  }
  assistantComponent(msg, streaming) {
    const component = new AssistantMessageComponent(undefined, this.options.hideThinkingBlock ?? false, this.markdownTheme, HIDDEN_THINKING_LABEL, this.pad(), this.transformers);
    component.updateContent(msg, streaming);
    return component;
  }
  toolFor(name, id, args) {
    const existing = this.tools.get(id);
    if (existing) {
      existing.component.updateArgs(args);
      this.markDirty(existing.block);
      return existing;
    }
    const ui = { requestRender: () => {} };
    const component = new ToolExecutionComponent(name, id, args, { showImages: false, outputPad: this.pad() }, this.toolDefinition(name), ui, this.cwd);
    component.setExpanded(this.expanded);
    const tool = { id, component, block: this.block(component, false, component), done: false };
    tool.block.tool = tool;
    ui.requestRender = () => this.markDirty(tool.block);
    if (this.started.has(id))
      component.markExecutionStarted();
    const partial = this.partials.get(id);
    if (partial) {
      component.updateResult({ ...partial, isError: false }, true);
      tool.partial = partial;
    }
    this.tools.set(id, tool);
    return tool;
  }
  toolDefinition(name) {
    const base = () => {
      let definition;
      try {
        definition = this.session.getToolDefinition?.(name);
      } catch {
        definition = undefined;
      }
      return withBuiltInRenderers(name, definition);
    };
    try {
      return this.runner?.resolveToolRenderers ? this.runner.resolveToolRenderers(name, base) : base();
    } catch {
      return base();
    }
  }
  forgetTool(block) {
    if (block.tool && this.tools.get(block.tool.id) === block.tool)
      this.tools.delete(block.tool.id);
  }
  applyToolUpdates() {
    if (this.pendingToolUpdates.size === 0)
      return;
    for (const id of this.pendingToolUpdates) {
      const tool = this.tools.get(id);
      if (!tool || tool.done)
        continue;
      if (this.started.has(id))
        tool.component.markExecutionStarted();
      const partial = this.partials.get(id);
      if (partial && partial !== tool.partial) {
        tool.component.updateResult({ ...partial, isError: false }, true);
        tool.partial = partial;
      }
      this.markDirty(tool.block);
    }
    this.pendingToolUpdates.clear();
  }
  endStream() {
    if (!this.stream)
      return;
    this.stream = undefined;
    this.streamChanged = true;
    this.layoutFrom = Math.min(this.layoutFrom, this.entries.length);
  }
  syncStream() {
    const msg = this.liveStream();
    if (!this.streamChanged && msg === this.streamMsg)
      return;
    this.streamChanged = false;
    this.streamMsg = msg;
    if (!msg) {
      this.endStream();
      this.streamChanged = false;
      return;
    }
    const clean = cleanForTerminal(msg);
    let stream = this.stream;
    if (!stream) {
      stream = { assistant: this.assistantComponent(clean, true), blocks: [] };
      stream.blocks.push(this.block(stream.assistant, false));
      this.stream = stream;
      this.layoutFrom = Math.min(this.layoutFrom, this.entries.length);
    } else {
      stream.assistant.updateContent(clean, true);
      this.markDirty(stream.blocks[0]);
    }
    for (const content of clean.content) {
      if (content.type !== "toolCall")
        continue;
      const tool = this.toolFor(content.name, content.id, content.arguments);
      if (tool.entry === undefined && !stream.blocks.includes(tool.block)) {
        stream.blocks.push(tool.block);
        this.layoutFrom = Math.min(this.layoutFrom, this.entries.length);
      }
    }
  }
  block(component, spaceBefore, expandable) {
    return { component, spaceBefore, lines: [], widths: [], dirty: true, index: Number.MAX_SAFE_INTEGER, expandable };
  }
  blockUi() {
    return { requestRender: () => {
      if (!this.syncing && !this.disposed)
        this.requestRender();
    } };
  }
  markDirty(block) {
    block.dirty = true;
    if (block.index < this.dirtyFrom)
      this.dirtyFrom = block.index;
    if (!this.syncing && !this.disposed)
      this.requestRender();
  }
  layout() {
    if (this.layoutFrom === Number.POSITIVE_INFINITY)
      return;
    const first = Math.min(this.layoutFrom, this.entries.length);
    const from = Math.min(this.flatEnd(first), this.flat.length);
    this.flat.length = from;
    const push = (block) => {
      block.index = this.flat.length;
      this.flat.push(block);
    };
    for (let i = first;i < this.entries.length; i++)
      for (const block of this.entries[i].blocks)
        push(block);
    if (this.stream)
      for (const block of this.stream.blocks)
        push(block);
    this.dirtyFrom = Math.min(this.dirtyFrom, from);
    this.layoutFrom = Number.POSITIVE_INFINITY;
  }
  assemble() {
    const from = this.dirtyFrom;
    this.dirtyFrom = Number.POSITIVE_INFINITY;
    if (from === Number.POSITIVE_INFINITY)
      return;
    this.truncateLines(Math.min(from, this.flat.length));
    for (let i = from;i < this.flat.length; i++) {
      const block = this.flat[i];
      if (block.dirty)
        this.renderBlock(block);
      this.blockStart.push(this.lines.length);
      for (let j = 0;j < block.lines.length; j++) {
        this.lines.push(block.lines[j]);
        this.widths.push(block.widths[j]);
      }
    }
  }
  truncateLines(flatIndex) {
    const at = flatIndex < this.blockStart.length ? this.blockStart[flatIndex] : this.lines.length;
    this.lines.length = at;
    this.widths.length = at;
    if (flatIndex < this.blockStart.length)
      this.blockStart.length = flatIndex;
  }
  renderBlock(block) {
    this.renders++;
    const width = this.width;
    let rendered;
    try {
      rendered = block.component.render(width);
    } catch {
      rendered = [];
    }
    const lines = block.spaceBefore ? [""] : [];
    const widths = block.spaceBefore ? [0] : [];
    const last = rendered.length - 1;
    for (let i = 0;i <= last; i++) {
      let line = rendered[i];
      if ((i === 0 || i === last) && line.includes("\x1B]133;"))
        line = line.replace(OSC133, "");
      let w2 = visibleWidth(line);
      if (w2 > width) {
        line = truncateToWidth2(line, width);
        w2 = visibleWidth(line);
      }
      lines.push(line);
      widths.push(w2);
    }
    block.lines = lines;
    block.widths = widths;
    block.dirty = false;
  }
}
var HIDDEN_THINKING_LABEL = "Thinking...", OSC133, CLEAN_MAX_DEPTH = 64, builtInRenderers;
var init_viewer_transcript = __esm(() => {
  init_terminal_text();
  OSC133 = /\x1b\]133;[A-Z]\x07/g;
  builtInRenderers = new Map;
});

// dist/ui/conversation-viewer.js
var exports_conversation_viewer = {};
__export(exports_conversation_viewer, {
  getConversationOverlayOptions: () => getConversationOverlayOptions,
  VIEWPORT_HEIGHT_PCT: () => VIEWPORT_HEIGHT_PCT,
  ConversationViewer: () => ConversationViewer
});
import { getMarkdownTheme as getMarkdownTheme2 } from "@earendil-works/pi-coding-agent";
import { Input, matchesKey as matchesKey2, ScrollView, stripTerminalSequences, truncateToWidth as truncateToWidth3, visibleWidth as visibleWidth2, wrapTextWithAnsi } from "@earendil-works/pi-tui";
function getConversationOverlayOptions(tui) {
  return tui.mode === "fullscreen" ? { anchor: "top-left", width: "100%", maxHeight: "100%", margin: 0 } : { anchor: "center", width: "90%", maxHeight: `${VIEWPORT_HEIGHT_PCT}%` };
}
function piThemeReady() {
  try {
    getMarkdownTheme2().heading("probe");
    return true;
  } catch {
    return false;
  }
}
function fitFooterLeft(count, actions, expand, sep2, room) {
  const tail = expand ? [...actions, expand] : actions;
  for (const parts of [[count, ...tail], tail]) {
    const text = parts.join(sep2);
    if (visibleWidth2(text) <= room)
      return text;
  }
  return actions.join(sep2);
}

class ConversationViewer {
  tui;
  session;
  record;
  activity;
  theme;
  done;
  onStop;
  onSteer;
  showCost;
  onBackground;
  scrollOffset = 0;
  autoScroll = true;
  focused = false;
  fullscreen;
  scrollView;
  viewport;
  scrollbarGrabOffset;
  footerTargets = [];
  latestTarget;
  newMessages = 0;
  requestRender = () => {
    if (!this.closed)
      this.tui.requestRender();
  };
  chromeCache = new Map;
  unsubscribe;
  lastInnerW = 0;
  closed = false;
  stopArmed = false;
  keys;
  composer;
  transcript;
  plain;
  streamRenderTimer;
  constructor(tui, session, record, activity, theme, done, onStop, keybindings, onSteer, showCost = false, onBackground, scrollbarMode = "auto", renderOptions) {
    this.tui = tui;
    this.session = session;
    this.record = record;
    this.activity = activity;
    this.theme = theme;
    this.done = done;
    this.onStop = onStop;
    this.onSteer = onSteer;
    this.showCost = showCost;
    this.onBackground = onBackground;
    this.fullscreen = tui.mode === "fullscreen";
    this.keys = createViewerKeys(keybindings);
    this.transcript = piThemeReady() ? new PiTranscript(session, this.requestRender, renderOptions) : undefined;
    this.scrollView = new ScrollView({ render: () => [], invalidate: () => {} }, { follow: "end", scrollbar: this.fullscreen ? scrollbarMode : "hidden" });
    this.unsubscribe = session.subscribe((event) => {
      if (this.closed)
        return;
      const e = event;
      if (e)
        this.transcript?.handleEvent(e);
      if (this.fullscreen && e?.type === "message_start" && !this.scrollView.isFollowingEnd && COUNTED_ROLES.has(e.message?.role ?? "")) {
        this.newMessages++;
      }
      if (STREAMING_EVENTS2.has(e?.type ?? "")) {
        this.streamRenderTimer ??= setTimeout(() => {
          this.streamRenderTimer = undefined;
          if (!this.closed)
            this.tui.requestRender();
        }, STREAM_FRAME_MS);
        return;
      }
      this.tui.requestRender();
    });
  }
  handleInput(data) {
    if (this.closed)
      return;
    if (this.fullscreen && (matchesKey2(data, "ctrl+end") || !this.composer && matchesKey2(data, "end"))) {
      this.jumpToLatest();
      return;
    }
    if (this.composer) {
      this.composer.handleInput(data);
      this.tui.requestRender();
      return;
    }
    if (matchesKey2(data, "escape") || matchesKey2(data, "ctrl+c") || matchesKey2(data, "q")) {
      this.closed = true;
      this.done(undefined);
      return;
    }
    if (matchesKey2(data, "enter") && this.canSteer()) {
      this.stopArmed = false;
      this.openComposer();
      return;
    }
    if (matchesKey2(data, "b") && this.canSendToBackground()) {
      this.stopArmed = false;
      this.onBackground?.send();
      this.tui.requestRender();
      return;
    }
    if (matchesKey2(data, "x")) {
      if (this.isStoppable()) {
        if (this.stopArmed) {
          this.stopArmed = false;
          this.onStop?.();
        } else {
          this.stopArmed = true;
        }
        this.tui.requestRender();
      }
      return;
    }
    if (this.keys.toggleExpand(data)) {
      this.toggleExpand();
      return;
    }
    if (this.stopArmed)
      this.stopArmed = false;
    const totalLines = this.contentLength(this.contentView(this.lastInnerW));
    const viewportHeight = this.viewportHeight();
    if (this.fullscreen) {
      this.scrollView.updateLayout(totalLines, viewportHeight, this.requestRender);
      if (this.keys.scrollUp(data))
        this.scrollView.scrollBy(-1);
      else if (this.keys.scrollDown(data))
        this.scrollView.scrollBy(1);
      else if (this.keys.pageUp(data))
        this.scrollView.scrollBy(-viewportHeight);
      else if (this.keys.pageDown(data))
        this.scrollView.scrollBy(viewportHeight);
      else if (matchesKey2(data, "home"))
        this.scrollView.scrollToStart();
      return;
    }
    const maxScroll = Math.max(0, totalLines - viewportHeight);
    if (this.keys.scrollUp(data)) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      this.autoScroll = this.scrollOffset >= maxScroll;
    } else if (this.keys.scrollDown(data)) {
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + 1);
      this.autoScroll = this.scrollOffset >= maxScroll;
    } else if (this.keys.pageUp(data)) {
      this.scrollOffset = Math.max(0, this.scrollOffset - viewportHeight);
      this.autoScroll = false;
    } else if (this.keys.pageDown(data)) {
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + viewportHeight);
      this.autoScroll = this.scrollOffset >= maxScroll;
    } else if (matchesKey2(data, "home")) {
      this.scrollOffset = 0;
      this.autoScroll = false;
    } else if (matchesKey2(data, "end")) {
      this.scrollOffset = maxScroll;
      this.autoScroll = true;
    }
  }
  jumpToLatest() {
    this.scrollView.scrollToEnd();
    this.newMessages = 0;
    this.stopArmed = false;
    this.requestRender();
  }
  handleMouse(event) {
    if (!this.fullscreen)
      return { handled: false };
    if (this.closed || !this.viewport)
      return { handled: true, render: false };
    const view = this.viewport;
    const onScrollbar = this.scrollView.scrollbar !== "hidden" && event.x >= view.width - SCROLLBAR_WIDTH && event.x < view.width && event.y >= view.top && event.y < view.top + view.height;
    if (event.type === "move") {
      this.scrollView.setScrollbarActive(onScrollbar);
      return { handled: true, render: false };
    }
    if (event.type === "wheel") {
      this.stopArmed = false;
      this.scrollView.scrollBy(event.wheelDelta ?? 0);
      return { handled: true, render: true };
    }
    if (event.type === "release") {
      const wasDragging = this.scrollbarGrabOffset !== undefined;
      this.scrollbarGrabOffset = undefined;
      this.scrollView.setScrollbarActive(onScrollbar);
      return { handled: true, render: wasDragging };
    }
    if (event.type === "drag" && this.scrollbarGrabOffset !== undefined) {
      const travel = view.height - view.thumbHeight;
      const position = Math.max(0, Math.min(travel, event.y - view.top - this.scrollbarGrabOffset));
      this.scrollView.scrollTo(travel > 0 ? Math.round(position / travel * view.maxScroll) : 0);
      return { handled: true, render: true };
    }
    if (event.type === "press" && event.button === "left") {
      this.scrollbarGrabOffset = undefined;
      this.scrollView.setScrollbarActive(onScrollbar);
      const latest = this.latestTarget;
      if (latest && event.y === latest.row && event.x >= latest.start && event.x < latest.end) {
        this.jumpToLatest();
        return { handled: true, render: true };
      }
      if (event.y === this.tui.terminal.rows - 1) {
        const target = this.footerTargets.find((t) => event.x >= t.start && event.x < t.end);
        if (target) {
          if (target.key === EXPAND_TARGET)
            this.toggleExpand();
          else
            this.handleInput(target.key);
          return { handled: true, render: true };
        }
      }
      this.stopArmed = false;
      if (this.composer && event.y === this.tui.terminal.rows - 2) {
        this.composer.handleMouse({ ...event, x: event.x - 1, y: 0, width: this.lastInnerW, height: 1 });
        return { handled: true, render: true };
      }
      if (onScrollbar && view.maxScroll > 0) {
        const y = event.y - view.top;
        if (y >= view.thumbTop && y < view.thumbTop + view.thumbHeight) {
          this.scrollbarGrabOffset = y - view.thumbTop;
          return { handled: true, capture: true, render: true };
        }
        this.scrollView.scrollBy(y < view.thumbTop ? -view.height : view.height);
        this.scrollbarGrabOffset = Math.floor(view.thumbHeight / 2);
        return { handled: true, capture: true, render: true };
      }
      return { handled: true, render: true };
    }
    return { handled: true, render: false };
  }
  render(width) {
    return this.fullscreen ? this.renderFullscreen(width) : this.renderRegular(width);
  }
  chrome(slot2, key, build) {
    const hit = this.chromeCache.get(slot2);
    if (hit && hit.key === key)
      return hit.value;
    const value = build();
    this.chromeCache.set(slot2, { key, value });
    return value;
  }
  headerKey() {
    const r = this.record;
    const percent = getLifetimeTotal(r.lifetimeUsage) > 0 ? getCachedSessionContextPercent(this.activity?.session) : undefined;
    return `${r.status}|${this.activity?.toolUses ?? r.toolUses}|${formatDuration2(r.startedAt, r.completedAt)}|${getLifetimeTotal(r.lifetimeUsage)}|${percent}|${r.compactionCount}|${this.showCost ? getLifetimeCost(r.lifetimeUsage) : ""}`;
  }
  headerText() {
    const th = this.theme;
    const modeLabel = getPromptModeLabel(this.record.type);
    const modeTag = modeLabel ? ` ${th.fg("dim", `(${modeLabel})`)}` : "";
    const statusIcon = this.record.status === "running" ? th.fg("accent", "●") : this.record.status === "completed" ? th.fg("success", "✓") : this.record.status === "error" ? th.fg("error", "✗") : th.fg("dim", "○");
    const duration = formatDuration2(this.record.startedAt, this.record.completedAt);
    const headerParts = [duration];
    const toolUses = this.activity?.toolUses ?? this.record.toolUses;
    if (toolUses > 0)
      headerParts.unshift(`${toolUses} tool${toolUses === 1 ? "" : "s"}`);
    const tokens = getLifetimeTotal(this.record.lifetimeUsage);
    if (tokens > 0) {
      const percent = getCachedSessionContextPercent(this.activity?.session);
      headerParts.push(formatSessionTokens(tokens, percent, th, this.record.compactionCount));
    }
    const cost = this.showCost ? formatCost(getLifetimeCost(this.record.lifetimeUsage)) : "";
    if (cost)
      headerParts.push(cost);
    return `${statusIcon} ${renderAgentName(this.record.type, th, { bold: true })}${modeTag}  ${th.fg("muted", sanitizeTerminalText(this.record.description))} ${th.fg("dim", "·")} ${fgPreservingNestedStyles(th, "dim", headerParts.join(" · "))}`;
  }
  contentLine(content, at) {
    if (at < content.base.length) {
      const text2 = content.base[at];
      return { text: text2, width: content.widths ? content.widths[at] : visibleWidth2(text2) };
    }
    const text = content.tail[at - content.base.length] ?? "";
    return { text, width: text ? visibleWidth2(text) : 0 };
  }
  renderRegular(width) {
    if (width < 6)
      return [];
    const th = this.theme;
    const innerW = width - 4;
    this.lastInnerW = innerW;
    const lines = [];
    const pad = (s2, len) => {
      const vis = visibleWidth2(s2);
      return s2 + " ".repeat(Math.max(0, len - vis));
    };
    const border = th.fg("border", "│");
    const row = (content2) => border + " " + truncateToWidth3(pad(content2, innerW), innerW, "...", true) + " " + border;
    const hrTop = this.chrome("r:top", `${width}`, () => th.fg("border", `╭${"─".repeat(width - 2)}╮`));
    const hrBot = this.chrome("r:bottom", `${width}`, () => th.fg("border", `╰${"─".repeat(width - 2)}╯`));
    const hrMid = this.chrome("r:divider", `${width}`, () => row(th.fg("dim", "─".repeat(innerW))));
    lines.push(hrTop);
    lines.push(this.chrome("r:header", `${width}|${this.headerKey()}`, () => row(this.headerText())));
    const invocationLine = this.invocationLine();
    if (invocationLine)
      lines.push(this.chrome("r:invocation", `${width}|${invocationLine}`, () => row(invocationLine)));
    lines.push(hrMid);
    const content = this.contentView(innerW);
    const totalLines = this.contentLength(content);
    const viewportHeight = this.viewportHeight();
    const maxScroll = Math.max(0, totalLines - viewportHeight);
    if (this.autoScroll) {
      this.scrollOffset = maxScroll;
    }
    const visibleStart = Math.min(this.scrollOffset, maxScroll);
    for (let i = 0;i < viewportHeight; i++) {
      const { text, width: w2 } = this.contentLine(content, visibleStart + i);
      lines.push(border + " " + text + " ".repeat(Math.max(0, innerW - w2)) + " " + border);
    }
    lines.push(hrMid);
    if (this.composer) {
      lines.push(row(this.composer.render(innerW)[0] ?? ""));
      const composeHint = th.fg("dim", "Enter send · Esc cancel");
      const composeLeft = th.fg("accent", "✎ steer");
      const composeGap = Math.max(1, innerW - visibleWidth2(composeLeft) - visibleWidth2(composeHint));
      lines.push(row(composeLeft + " ".repeat(composeGap) + composeHint));
    } else {
      const scrollPct = totalLines <= viewportHeight ? "100%" : `${Math.round((visibleStart + viewportHeight) / totalLines * 100)}%`;
      const footerKey = `${width}|${this.canSteer()}|${this.canSendToBackground()}|${this.isStoppable()}|${this.stopArmed}|${this.transcript?.isExpanded}|${totalLines}|${scrollPct}`;
      lines.push(this.chrome("r:footer", footerKey, () => {
        const sep2 = th.fg("dim", " · ");
        const actions = [];
        if (this.canSteer())
          actions.push(th.fg("dim", "Enter steer"));
        if (this.canSendToBackground())
          actions.push(th.fg("dim", "b bg"));
        if (this.isStoppable()) {
          actions.push(this.stopArmed ? th.fg("error", "x again to STOP") : th.fg("dim", "x stop"));
        }
        const expand = this.expandHint();
        const footerRight = th.fg("dim", "↑↓ scroll · PgUp/PgDn or Shift+↑↓ · Esc close");
        const count = th.fg("dim", `${totalLines} lines · ${scrollPct}`);
        const footerLeft = fitFooterLeft(count, actions, expand && th.fg("dim", expand.label), sep2, innerW - visibleWidth2(footerRight) - 1);
        const footerGap = Math.max(1, innerW - visibleWidth2(footerLeft) - visibleWidth2(footerRight));
        return row(footerLeft + " ".repeat(footerGap) + footerRight);
      }));
    }
    lines.push(hrBot);
    return lines;
  }
  renderFullscreen(width) {
    this.footerTargets = [];
    this.latestTarget = undefined;
    this.viewport = undefined;
    const rows = Math.max(0, this.tui.terminal.rows);
    if (width <= SCROLLBAR_WIDTH + 1)
      return Array.from({ length: rows }, () => " ".repeat(Math.max(0, width)));
    const th = this.theme;
    const reserveBar = this.scrollView.scrollbar !== "hidden";
    const innerW = width - 1 - (reserveBar ? SCROLLBAR_WIDTH : 0);
    this.lastInnerW = innerW;
    const lines = [];
    const row = (content2) => " " + truncateToWidth3(content2, width - 1, "...", true);
    const divider = this.chrome("f:divider", `${width}|${innerW}`, () => row(th.fg("dim", "─".repeat(innerW))));
    lines.push(this.chrome("f:header", `${width}|${this.headerKey()}`, () => row(this.headerText())));
    const invocationLine = this.invocationLine();
    if (invocationLine)
      lines.push(this.chrome("f:invocation", `${width}|${invocationLine}`, () => row(invocationLine)));
    lines.push(divider);
    const content = this.contentView(innerW);
    const totalLines = this.contentLength(content);
    const viewportHeight = this.viewportHeight();
    this.scrollView.updateLayout(totalLines, viewportHeight, this.requestRender);
    if (this.scrollView.isFollowingEnd)
      this.newMessages = 0;
    const maxScroll = Math.max(0, totalLines - viewportHeight);
    const visibleStart = this.scrollView.scrollTop;
    const thumbHeight = Math.min(viewportHeight, Math.max(2, Math.round(viewportHeight * viewportHeight / Math.max(1, totalLines))));
    const thumbTop = maxScroll > 0 ? Math.round(visibleStart / maxScroll * (viewportHeight - thumbHeight)) : 0;
    this.viewport = { width, top: lines.length, height: viewportHeight, maxScroll, thumbTop, thumbHeight };
    const showBar = this.scrollView.isScrollbarVisible;
    const track = showBar ? th.fg("scrollbarTrack", "│") : "";
    const thumb = showBar ? th.fg("scrollbarThumb", this.scrollView.isScrollbarActive ? "█" : "┃") : "";
    for (let i = 0;i < viewportHeight; i++) {
      const { text, width: w2 } = this.contentLine(content, visibleStart + i);
      if (!showBar) {
        lines.push(" " + text);
        continue;
      }
      const bar = i >= thumbTop && i < thumbTop + thumbHeight ? thumb : track;
      lines.push(" " + text + " ".repeat(Math.max(0, innerW - w2)) + bar);
    }
    if (!this.scrollView.isFollowingEnd && maxScroll > 0) {
      const marker = this.chrome("f:marker", `${width}|${innerW}|${this.newMessages}`, () => {
        const text = this.newMessages > 0 ? `${this.newMessages} new message${this.newMessages === 1 ? "" : "s"}` : "Jump to latest message";
        const label = truncateToWidth3(`[ ↓ ${text} · Ctrl+End ]`, innerW, "…");
        const labelWidth = visibleWidth2(label);
        const padding = Math.floor((innerW - labelWidth) / 2);
        return {
          start: padding + 1,
          end: padding + 1 + labelWidth,
          line: row(th.fg("dim", "─".repeat(padding)) + th.fg("accent", label) + th.fg("dim", "─".repeat(Math.max(0, innerW - padding - labelWidth))))
        };
      });
      this.latestTarget = { row: lines.length, start: marker.start, end: marker.end };
      lines.push(marker.line);
    } else {
      lines.push(divider);
    }
    if (this.composer) {
      this.composer.focused = this.focused;
      lines.push(row(this.composer.render(innerW)[0] ?? ""));
    }
    const scrollPct = totalLines <= viewportHeight ? "100%" : `${Math.round((visibleStart + viewportHeight) / totalLines * 100)}%`;
    const footerKey = this.composer ? `${width}|composer` : `${width}|${this.canSteer()}|${this.canSendToBackground()}|${this.isStoppable()}|${this.stopArmed}|${this.transcript?.isExpanded}|${totalLines}|${scrollPct}`;
    const { footer, targets } = this.chrome("f:footer", footerKey, () => this.fullscreenFooter(innerW, totalLines, scrollPct, row));
    this.footerTargets = targets;
    return rows > 0 ? [...lines.slice(0, rows - 1), footer] : [];
  }
  fullscreenFooter(innerW, totalLines, scrollPct, row) {
    const th = this.theme;
    const footerActions = [];
    let footer;
    if (this.composer) {
      footerActions.push({ label: "Enter send", key: "\r" }, { label: "Esc cancel", key: "\x1B" });
      const composeHint = th.fg("dim", "Enter send · Esc cancel");
      const composeLeft = th.fg("accent", "✎ steer");
      footer = row(composeLeft + " ".repeat(Math.max(1, innerW - visibleWidth2(composeLeft) - visibleWidth2(composeHint))) + composeHint);
    } else {
      const sep2 = th.fg("dim", " · ");
      if (this.canSteer())
        footerActions.push({ label: "Enter steer", key: "\r" });
      if (this.canSendToBackground())
        footerActions.push({ label: "b bg", key: "b" });
      if (this.isStoppable())
        footerActions.push({ label: this.stopArmed ? "x again to STOP" : "x stop", key: "x" });
      const actions = footerActions.map((a) => th.fg(a.key === "x" && this.stopArmed ? "error" : "dim", a.label));
      const expand = this.expandHint();
      if (expand)
        footerActions.push(expand);
      footerActions.push({ label: "Esc close", key: "\x1B" });
      const footerRight = th.fg("dim", "wheel/↑↓ scroll · PgUp/PgDn · Esc close");
      const count = th.fg("dim", `${totalLines} lines · ${scrollPct}`);
      const footerLeft = fitFooterLeft(count, actions, expand && th.fg("dim", expand.label), sep2, innerW - visibleWidth2(footerRight) - 1);
      footer = row(footerLeft + " ".repeat(Math.max(1, innerW - visibleWidth2(footerLeft) - visibleWidth2(footerRight))) + footerRight);
    }
    const targets = [];
    const footerText = stripTerminalSequences(footer);
    for (const action of footerActions) {
      const index = footerText.indexOf(action.label);
      if (index < 0)
        continue;
      const start = visibleWidth2(footerText.slice(0, index));
      targets.push({ start, end: start + visibleWidth2(action.label), key: action.key });
    }
    return { footer, targets };
  }
  isStoppable() {
    return !!this.onStop && (this.record.status === "running" || this.record.status === "queued");
  }
  canSendToBackground() {
    return this.onBackground?.available() === true;
  }
  toggleExpand() {
    this.stopArmed = false;
    this.transcript?.setExpanded(!this.transcript.isExpanded);
    this.tui.requestRender();
  }
  expandHint() {
    if (!this.transcript || !this.keys.expandLabel)
      return;
    return { label: `${this.keys.expandLabel} ${this.transcript.isExpanded ? "collapse" : "expand"}`, key: EXPAND_TARGET };
  }
  canSteer() {
    return !!this.onSteer && (this.record.status === "running" || this.record.status === "queued");
  }
  openComposer() {
    const input = new Input;
    input.focused = true;
    input.onSubmit = (value) => {
      const message = value.trim();
      this.composer = undefined;
      if (message)
        this.onSteer?.(message);
      this.tui.requestRender();
    };
    input.onEscape = () => {
      this.composer = undefined;
      this.tui.requestRender();
    };
    this.composer = input;
    this.tui.requestRender();
  }
  invalidate() {
    this.transcript?.invalidate();
    this.plain = undefined;
    this.chromeCache.clear();
  }
  dispose() {
    this.closed = true;
    this.scrollView.setScrollbar("hidden");
    if (this.streamRenderTimer) {
      clearTimeout(this.streamRenderTimer);
      this.streamRenderTimer = undefined;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    this.transcript?.dispose();
  }
  viewportHeight() {
    if (this.fullscreen)
      return Math.max(0, this.tui.terminal.rows - this.chromeLines());
    const maxRows = Math.floor(this.tui.terminal.rows * VIEWPORT_HEIGHT_PCT / 100);
    return Math.max(MIN_VIEWPORT, maxRows - this.chromeLines());
  }
  chromeLines() {
    return (this.fullscreen ? FULLSCREEN_CHROME_LINES : CHROME_LINES_BASE) + (this.invocationLine() ? 1 : 0) + (this.composer ? 1 : 0);
  }
  invocationLine() {
    const { modelName, modelId, tags } = buildInvocationTags(this.record.invocation);
    const model = modelId ?? modelName;
    const parts = model ? [model, ...tags] : tags;
    if (parts.length === 0)
      return;
    return this.theme.fg("dim", `  ↳ ${parts.join(" · ")}`);
  }
  buildContentLines(width) {
    const { base, tail } = this.contentView(width);
    return [...base, ...tail];
  }
  contentLength(view) {
    return view.base.length + view.tail.length;
  }
  contentView(width) {
    if (width <= 0)
      return { base: [], widths: undefined, tail: [] };
    const th = this.theme;
    const transcript = this.transcript;
    if (transcript ? !transcript.hasContent : this.session.messages.length === 0) {
      return { base: [truncateToWidth3(th.fg("dim", "(waiting for first message...)"), width)], widths: undefined, tail: [] };
    }
    let base;
    let widths;
    if (transcript) {
      transcript.sync(width);
      base = transcript.lines;
      widths = transcript.widths;
    } else {
      ({ lines: base, widths } = this.plainLines(width));
    }
    const tail = [];
    if (this.record.status === "running" && this.activity) {
      const act = describeActivity(this.activity.activeTools, this.activity.responseText);
      tail.push("", truncateToWidth3(th.fg("accent", "▍ ") + th.fg("dim", sanitizeTerminalText(act)), width));
    }
    return { base, widths, tail };
  }
  plainLines(width) {
    const messages = this.session.messages;
    const cached = this.plain;
    if (cached && cached.messages === messages && cached.count === messages.length && cached.width === width)
      return cached;
    const lines = [];
    for (const raw of messages) {
      const msg = raw;
      let text = "";
      if (msg.role === "user" || msg.role === "toolResult" || msg.role === "custom") {
        text = typeof msg.content === "string" ? msg.content : extractText(msg.content);
      } else if (msg.role === "assistant" && Array.isArray(msg.content)) {
        text = msg.content.map((c) => c.type === "text" ? c.text ?? "" : c.type === "toolCall" ? `[${c.name ?? "tool"}]` : "").filter(Boolean).join(`
`);
      } else if (msg.role === "bashExecution") {
        text = `$ ${String(msg.command)}
${String(msg.output ?? "")}`;
      } else if (msg.role === "compactionSummary" || msg.role === "branchSummary") {
        text = String(msg.summary ?? "");
      }
      text = sanitizeTerminalText(text).trim();
      if (!text)
        continue;
      if (lines.length > 0)
        lines.push("");
      for (const line of wrapTextWithAnsi(text, width))
        lines.push(truncateToWidth3(line, width));
    }
    const plain = { messages, count: messages.length, width, lines, widths: lines.map((l) => visibleWidth2(l)) };
    this.plain = plain;
    return plain;
  }
}
var CHROME_LINES_BASE = 6, MIN_VIEWPORT = 3, VIEWPORT_HEIGHT_PCT = 70, FULLSCREEN_CHROME_LINES = 4, SCROLLBAR_WIDTH = 1, EXPAND_TARGET = "expand", COUNTED_ROLES, STREAMING_EVENTS2, STREAM_FRAME_MS = 80;
var init_conversation_viewer = __esm(() => {
  init_agent_color();
  init_usage();
  init_agent_widget();
  init_terminal_text();
  init_viewer_keys();
  init_viewer_transcript();
  COUNTED_ROLES = new Set(["user", "assistant", "toolResult", "bashExecution"]);
  STREAMING_EVENTS2 = new Set(["message_update", "tool_execution_update"]);
});

// dist/index.js
init_agent_color();
import { existsSync as existsSync14, mkdirSync as mkdirSync7, readFileSync as readFileSync10, unlinkSync as unlinkSync2, writeFileSync as writeFileSync4 } from "node:fs";
import { isAbsolute as isAbsolute4, join as join14 } from "node:path";
import { defineTool as defineTool3, getAgentDir as getAgentDir11, getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Container, isKeyRelease as isKeyRelease2, Key as Key2, matchesKey as matchesKey5, SettingsList, Spacer, Text as Text2 } from "@earendil-works/pi-tui";
import { Type as Type3 } from "typebox";

// dist/agent-file-toggle.js
init_custom_agents();
import { existsSync as existsSync2 } from "node:fs";
import { join as join2, sep } from "node:path";
import { getAgentDir as getAgentDir2 } from "@earendil-works/pi-coding-agent";
var projectAgentsDir = (cwd = process.cwd()) => join2(cwd, ".pi", "agents");
var workspaceAgentsDir = (cwd = process.cwd()) => join2(cwd, ".agents", "agents");
var personalAgentsDir = () => join2(getAgentDir2(), "agents");
function findAgentFile(name, cwd = process.cwd()) {
  const projectPath = join2(projectAgentsDir(cwd), `${name}.md`);
  if (existsSync2(projectPath))
    return { path: projectPath, location: "project" };
  const workspacePath = join2(workspaceAgentsDir(cwd), `${name}.md`);
  if (existsSync2(workspacePath))
    return { path: workspacePath, location: "workspace" };
  const personalPath = join2(personalAgentsDir(), `${name}.md`);
  if (existsSync2(personalPath))
    return { path: personalPath, location: "personal" };
  return;
}
function locateAgentFile(name, sourcePath, cwd = process.cwd()) {
  if (sourcePath && existsSync2(sourcePath)) {
    return { path: sourcePath, location: classifyAgentDir(sourcePath, cwd) };
  }
  return findAgentFile(name, cwd);
}
function classifyAgentDir(path, cwd) {
  if (path.startsWith(projectAgentsDir(cwd) + sep))
    return "project";
  if (path.startsWith(workspaceAgentsDir(cwd) + sep))
    return "workspace";
  return "personal";
}
var ENABLED_FALSE = /^enabled:[ \t]*false[ \t]*$/;
var FENCE = /^---[ \t]*$/;
function splitFrontmatter(content) {
  const lines = content.split(/(?<=\n)/);
  if (lines.length === 0)
    return;
  const bom = content.startsWith("\uFEFF");
  const first = (bom ? lines[0].slice(1) : lines[0]).replace(/\r?\n$/, "");
  if (!FENCE.test(first))
    return;
  const closeIdx = lines.findIndex((l, i) => i > 0 && FENCE.test(l.replace(/\r?\n$/, "")));
  if (closeIdx === -1)
    return;
  return { lines, openIdx: 0, closeIdx, eol: lines[0].endsWith(`\r
`) ? `\r
` : `
` };
}
function isDisabledContent(content) {
  try {
    return parseAgentFrontmatter(content).frontmatter.enabled === false;
  } catch {
    return false;
  }
}
function disableInContent(content) {
  const block = splitFrontmatter(content);
  if (!block)
    return { content, outcome: "no-frontmatter" };
  if (isDisabledContent(content))
    return { content, outcome: "already-disabled" };
  const lines = [...block.lines];
  lines.splice(1, 0, `enabled: false${block.eol}`);
  return { content: lines.join(""), outcome: "disabled" };
}
function enableInContent(content) {
  const block = splitFrontmatter(content);
  if (!block)
    return { content, changed: false };
  const kept = block.lines.filter((l, i) => !(i > 0 && i < block.closeIdx && ENABLED_FALSE.test(l.replace(/\r?\n$/, ""))));
  if (kept.length === block.lines.length)
    return { content, changed: false };
  return { content: kept.join(""), changed: true };
}
function isEmptyStub(content) {
  return content.replace(/\r\n/g, `
`).trim() === `---
---`;
}
function buildNewAgentFile(input) {
  const modelLine = input.model ? `
model: ${JSON.stringify(input.model)}` : "";
  const thinkingLine = input.thinking ? `
thinking: ${input.thinking}` : "";
  return `---
description: ${JSON.stringify(input.description)}
tools: ${input.tools}${modelLine}${thinkingLine}
prompt_mode: replace
---

${input.systemPrompt}
`;
}
function formatToolsField(tools) {
  if (tools === undefined)
    return "all";
  if (tools.length === 0)
    return "none";
  return tools.join(", ");
}
function serializeAgentFile(cfg) {
  const fmFields = [];
  fmFields.push(`description: ${JSON.stringify(cfg.description)}`);
  if (cfg.displayName)
    fmFields.push(`display_name: ${cfg.displayName}`);
  if (cfg.color)
    fmFields.push(`color: ${JSON.stringify(cfg.color)}`);
  fmFields.push(`tools: ${formatToolsField(cfg.builtinToolNames)}`);
  if (cfg.model)
    fmFields.push(`model: ${cfg.model}`);
  if (cfg.thinking)
    fmFields.push(`thinking: ${cfg.thinking}`);
  if (cfg.maxTurns)
    fmFields.push(`max_turns: ${cfg.maxTurns}`);
  if (cfg.allowedSubagents !== undefined) {
    fmFields.push(`allowed_subagents: ${cfg.allowedSubagents === "all" ? "all" : cfg.allowedSubagents.join(", ")}`);
  }
  fmFields.push(`prompt_mode: ${cfg.promptMode}`);
  if (cfg.extensions === false)
    fmFields.push("extensions: false");
  else if (Array.isArray(cfg.extensions))
    fmFields.push(`extensions: ${cfg.extensions.join(", ")}`);
  if (cfg.excludeExtensions?.length)
    fmFields.push(`exclude_extensions: ${cfg.excludeExtensions.join(", ")}`);
  if (cfg.skills === false)
    fmFields.push("skills: false");
  else if (Array.isArray(cfg.skills))
    fmFields.push(`skills: ${cfg.skills.join(", ")}`);
  if (cfg.disallowedTools?.length)
    fmFields.push(`disallowed_tools: ${cfg.disallowedTools.join(", ")}`);
  if (cfg.inheritContext)
    fmFields.push("inherit_context: true");
  if (cfg.runInBackground !== undefined)
    fmFields.push(`run_in_background: ${cfg.runInBackground}`);
  if (cfg.outputTranscript === false)
    fmFields.push("output_transcript: false");
  if (cfg.isolated)
    fmFields.push("isolated: true");
  if (cfg.memory)
    fmFields.push(`memory: ${cfg.memory}`);
  if (cfg.isolation)
    fmFields.push(`isolation: ${cfg.isolation}`);
  return `---
${fmFields.join(`
`)}
---

${cfg.systemPrompt}
`;
}

// dist/index.js
init_agent_manager();
init_agent_runner();
init_agent_types();
init_child_context();
init_codemode_guard();

// dist/completion-outbox.js
var NOTIFICATION_HOLD_MS = 200;

class CompletionOutbox {
  send;
  parentRunning;
  items = [];
  timer;
  constructor(send, parentRunning) {
    this.send = send;
    this.parentRunning = parentRunning;
  }
  add(item) {
    for (const id of item.ids)
      this.cancel(id);
    this.items.push(item);
    if (!this.parentRunning())
      this.arm();
  }
  onTurnEnd(stopReason) {
    if (stopReason !== "aborted" && stopReason !== "error")
      this.flush();
  }
  cancel(id) {
    for (const item of this.items)
      item.ids = item.ids.filter((i) => i !== id);
    this.items = this.items.filter((item) => item.ids.length > 0);
  }
  onAgentEnd() {
    if (this.items.length > 0)
      this.arm();
  }
  pendingIds() {
    return this.items.flatMap((item) => item.ids);
  }
  dispose() {
    if (this.timer)
      clearTimeout(this.timer);
    this.timer = undefined;
    this.items = [];
  }
  arm() {
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, NOTIFICATION_HOLD_MS);
  }
  flush() {
    if (this.timer)
      clearTimeout(this.timer);
    this.timer = undefined;
    const items = this.items;
    this.items = [];
    const messages = items.map((item) => item.build(item.ids));
    if (messages.length === 0)
      return;
    try {
      this.send(combine(messages));
    } catch {}
  }
}
function combine(messages) {
  if (messages.length === 1)
    return messages[0];
  const [first, ...rest] = messages.flatMap(({ details: { others, ...own } }) => [own, ...others ?? []]);
  return {
    content: `${messages.length} background tasks finished.

${messages.map((m) => m.content).join(`

`)}`,
    details: { ...first, others: rest }
  };
}

// dist/cross-extension-rpc.js
init_agent_manager();
init_invocation_config();
init_model_scope();
var PROTOCOL_VERSION = 2;
function handleRpc(events, channel, fn) {
  return events.on(channel, async (raw) => {
    const params = raw;
    try {
      const data = await fn(params);
      const reply = { success: true };
      if (data !== undefined)
        reply.data = data;
      events.emit(`${channel}:reply:${params.requestId}`, reply);
    } catch (err) {
      events.emit(`${channel}:reply:${params.requestId}`, {
        success: false,
        error: err?.message ?? String(err)
      });
    }
  });
}
function registerRpcHandlers(deps) {
  const { events, pi, getCtx, manager } = deps;
  const unsubPing = handleRpc(events, "subagents:rpc:ping", () => {
    return { version: PROTOCOL_VERSION };
  });
  const unsubSpawn = handleRpc(events, "subagents:rpc:spawn", async ({ type, prompt, options }) => {
    const ctx = getCtx();
    if (!ctx)
      throw new Error("No active session");
    let normalizedOptions = options ?? {};
    if (!isModelOverrideAllowed()) {
      const { model: _model, thinkingLevel: _thinking, ...rest } = normalizedOptions;
      normalizedOptions = rest;
    }
    const override = normalizedOptions.model;
    if (override != null) {
      const { modelRegistry, cwd, model: parentModel } = ctx;
      const label = typeof override === "string" ? override : `${override.provider}/${override.id}`;
      if (!modelRegistry) {
        throw new Error(`Model override "${label}" provided but ctx.modelRegistry is unavailable`);
      }
      let model = override;
      if (typeof override === "string") {
        const resolved = resolveModel(override, modelRegistry, parentModel?.provider);
        if (typeof resolved === "string") {
          throw new Error(resolved);
        }
        model = resolved;
        normalizedOptions = { ...normalizedOptions, model: resolved };
      }
      const verdict = checkModelScope({
        model,
        cwd: cwd ?? process.cwd(),
        modelRegistry,
        callerSupplied: true,
        agentLabel: type,
        modelInput: label
      });
      if (verdict.kind === "error")
        throw new Error(verdict.message);
    }
    const id = manager.spawn(pi, ctx, type, prompt, normalizedOptions);
    await manager.awaitStartup(id);
    return { id };
  });
  const unsubStop = handleRpc(events, "subagents:rpc:stop", ({ agentId }) => {
    const record = manager.getRecord(agentId);
    if (!record)
      throw new Error("Agent not found");
    if (!isTopLevelAgent(record))
      throw new Error("Agent is owned by another agent or workflow");
    if (!manager.abort(agentId))
      throw new Error("Agent is not running");
  });
  const unsubConsume = handleRpc(events, "subagents:rpc:consume", ({ agentId }) => {
    if (!manager.consumeResult(agentId))
      throw new Error("Agent not found or still running");
  });
  return { unsubPing, unsubSpawn, unsubStop, unsubConsume };
}

// dist/index.js
init_custom_agents();
init_default_agents();
init_exec_tree();

// dist/group-join.js
var DEFAULT_TIMEOUT = 30000;
var STRAGGLER_TIMEOUT = 15000;

class GroupJoinManager {
  deliverCb;
  groupTimeout;
  groups = new Map;
  agentToGroup = new Map;
  constructor(deliverCb, groupTimeout = DEFAULT_TIMEOUT) {
    this.deliverCb = deliverCb;
    this.groupTimeout = groupTimeout;
  }
  registerGroup(groupId, agentIds) {
    const group = {
      groupId,
      agentIds: new Set(agentIds),
      completedRecords: new Map,
      delivered: false,
      isStraggler: false
    };
    this.groups.set(groupId, group);
    for (const id of agentIds) {
      this.agentToGroup.set(id, groupId);
    }
  }
  onAgentComplete(record) {
    const groupId = this.agentToGroup.get(record.id);
    if (!groupId)
      return "pass";
    const group = this.groups.get(groupId);
    if (!group || group.delivered)
      return "pass";
    group.completedRecords.set(record.id, record);
    if (group.completedRecords.size >= group.agentIds.size) {
      this.deliver(group, false);
      return "delivered";
    }
    if (!group.timeoutHandle) {
      const timeout = group.isStraggler ? STRAGGLER_TIMEOUT : this.groupTimeout;
      group.timeoutHandle = setTimeout(() => {
        this.onTimeout(group);
      }, timeout);
    }
    return "held";
  }
  onTimeout(group) {
    if (group.delivered)
      return;
    group.timeoutHandle = undefined;
    const remaining = new Set;
    for (const id of group.agentIds) {
      if (!group.completedRecords.has(id))
        remaining.add(id);
    }
    for (const id of group.completedRecords.keys()) {
      this.agentToGroup.delete(id);
    }
    this.deliverCb([...group.completedRecords.values()], true);
    group.completedRecords.clear();
    group.agentIds = remaining;
    group.isStraggler = true;
  }
  deliver(group, partial) {
    if (group.timeoutHandle) {
      clearTimeout(group.timeoutHandle);
      group.timeoutHandle = undefined;
    }
    group.delivered = true;
    this.deliverCb([...group.completedRecords.values()], partial);
    this.cleanupGroup(group.groupId);
  }
  cleanupGroup(groupId) {
    const group = this.groups.get(groupId);
    if (!group)
      return;
    for (const id of group.agentIds) {
      this.agentToGroup.delete(id);
    }
    this.groups.delete(groupId);
  }
  isGrouped(agentId) {
    return this.agentToGroup.has(agentId);
  }
  dispose() {
    for (const group of this.groups.values()) {
      if (group.timeoutHandle)
        clearTimeout(group.timeoutHandle);
    }
    this.groups.clear();
    this.agentToGroup.clear();
  }
}

// dist/index.js
init_invocation_config();
init_mention();

// dist/mention-clone.js
init_child_context();
init_mention();
import { buildSessionContext as buildSessionContext2, createAgentSession as createAgentSession2, SessionManager as SessionManager4 } from "@earendil-works/pi-coding-agent";
async function runMentionClone(opts) {
  const { ctx, type, message, agentTool, signal: stop, onUsage } = opts;
  if (stop?.aborted)
    return { spawned: false, error: "the session ended before the clone started" };
  let spawned = false;
  const cloneAgentTool = {
    ...agentTool,
    execute: (_cloneToolCallId, params, signal, onUpdate, _cloneCtx) => {
      if (spawned) {
        return Promise.resolve({
          content: [{ type: "text", text: "Already started an agent for this mention. Stop here." }],
          details: undefined,
          isError: true
        });
      }
      spawned = true;
      return agentTool.execute(undefined, { ...params, run_in_background: true }, signal, onUpdate, ctx);
    }
  };
  let session;
  const onStop = () => {
    session?.abort().catch(() => {});
  };
  stop?.addEventListener("abort", onStop, { once: true });
  try {
    const parentModelRuntime = ctx.modelRegistry.runtime;
    const conversation = buildSessionContext2(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId());
    const thinkingLevel = ctx.thinkingLevel;
    const created = await runInChildSessionContext(() => createAgentSession2({
      cwd: ctx.cwd,
      sessionManager: SessionManager4.inMemory(ctx.cwd, undefined, ctx.sessionManager.getBranch?.() ?? []),
      model: ctx.model,
      ...thinkingLevel && { thinkingLevel },
      modelRegistry: ctx.modelRegistry,
      ...parentModelRuntime !== undefined && { modelRuntime: parentModelRuntime },
      tools: [cloneAgentTool.name],
      customTools: [cloneAgentTool]
    }));
    session = created.session;
    const systemPrompt = ctx.getSystemPrompt?.();
    if (systemPrompt)
      useSystemPrompt(session, systemPrompt);
    const restored = session.agent.state.messages.some((m) => m.role !== "system");
    if (!restored)
      session.agent.state.messages.push(...conversation.messages);
    if (onUsage) {
      session.subscribe((event) => {
        if (event.type !== "message_end" || event.message.role !== "assistant")
          return;
        const u = event.message.usage;
        if (!u)
          return;
        try {
          onUsage({
            input: u.input ?? 0,
            output: u.output ?? 0,
            cacheWrite: u.cacheWrite ?? 0,
            cacheRead: u.cacheRead ?? 0,
            cost: u.cost?.total ?? 0
          });
        } catch {}
      });
    }
    if (stop?.aborted)
      return { spawned, error: "the session ended before the clone ran" };
    await session.prompt(`${message}

${agentMentionReminder(type)}`);
  } catch (err) {
    return { spawned, error: err instanceof Error ? err.message : String(err) };
  } finally {
    stop?.removeEventListener("abort", onStop);
    session?.dispose?.();
  }
  return spawned ? { spawned: true } : { spawned: false, error: "the conversation clone did not start it" };
}
function findDescriptor(target, key) {
  for (let o = target;o; o = Object.getPrototypeOf(o)) {
    const d = Object.getOwnPropertyDescriptor(o, key);
    if (d)
      return d;
  }
  return;
}
function useSystemPrompt(session, systemPrompt) {
  const state = session.agent.state;
  const descriptor = findDescriptor(state, "systemPrompt");
  if (!descriptor || descriptor.writable || descriptor.set) {
    state.systemPrompt = systemPrompt;
    return;
  }
  const agent = session.agent;
  const previous = agent.transformContext;
  agent.transformContext = async (messages, signal) => {
    const transformed = previous ? await previous(messages, signal) : messages;
    const tools = new Map;
    let timestamp;
    for (const message of transformed) {
      if (message?.role !== "system")
        continue;
      timestamp ??= message.timestamp;
      for (const tool of message.toolsAdded ?? [])
        tools.set(tool.name, tool);
      for (const tool of message.toolsRemoved ?? [])
        tools.delete(tool.name);
    }
    const head = {
      role: "system",
      content: systemPrompt,
      ...tools.size > 0 ? { toolsAdded: [...tools.values()] } : {},
      timestamp: timestamp ?? Date.now()
    };
    return [head, ...transformed.filter((message) => message?.role !== "system")];
  };
}

// dist/index.js
init_model_scope();
init_nested_tools();
init_orchestration();
init_output_file();
init_project_trust();

// node_modules/croner/dist/croner.js
function T(s) {
  return Date.UTC(s.y, s.m - 1, s.d, s.h, s.i, s.s);
}
function D(s, e) {
  return s.y === e.y && s.m === e.m && s.d === e.d && s.h === e.h && s.i === e.i && s.s === e.s;
}
function A(s, e) {
  let t = new Date(Date.parse(s));
  if (isNaN(t))
    throw new Error("Invalid ISO8601 passed to timezone parser.");
  let r = s.substring(9);
  return r.includes("Z") || r.includes("+") || r.includes("-") ? b(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds(), "Etc/UTC") : b(t.getFullYear(), t.getMonth() + 1, t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds(), e);
}
function v(s, e, t) {
  return k(A(s, e), t);
}
function k(s, e) {
  let t = new Date(T(s)), r = g(t, s.tz), n = T(s), i = T(r), a = n - i, o = new Date(t.getTime() + a), h = g(o, s.tz);
  if (D(h, s)) {
    let u = new Date(o.getTime() - 3600000), d = g(u, s.tz);
    return D(d, s) ? u : o;
  }
  let l = new Date(o.getTime() + T(s) - T(h)), y = g(l, s.tz);
  if (D(y, s))
    return l;
  if (e)
    throw new Error("Invalid date passed to fromTZ()");
  return o.getTime() > l.getTime() ? o : l;
}
function g(s, e) {
  let t, r;
  try {
    t = new Intl.DateTimeFormat("en-US", { timeZone: e, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hour12: false }), r = t.formatToParts(s);
  } catch (i) {
    let a = i instanceof Error ? i.message : String(i);
    throw new RangeError(`toTZ: Invalid timezone '${e}' or date. Please provide a valid IANA timezone (e.g., 'America/New_York', 'Europe/Stockholm'). Original error: ${a}`);
  }
  let n = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (let i of r)
    (i.type === "year" || i.type === "month" || i.type === "day" || i.type === "hour" || i.type === "minute" || i.type === "second") && (n[i.type] = parseInt(i.value, 10));
  if (isNaN(n.year) || isNaN(n.month) || isNaN(n.day) || isNaN(n.hour) || isNaN(n.minute) || isNaN(n.second))
    throw new Error(`toTZ: Failed to parse all date components from timezone '${e}'. This may indicate an invalid date or timezone configuration. Parsed components: ${JSON.stringify(n)}`);
  return n.hour === 24 && (n.hour = 0), { y: n.year, m: n.month, d: n.day, h: n.hour, i: n.minute, s: n.second, tz: e };
}
function b(s, e, t, r, n, i, a) {
  return { y: s, m: e, d: t, h: r, i: n, s: i, tz: a };
}
var O = [1, 2, 4, 8, 16];
var C = class {
  pattern;
  timezone;
  mode;
  alternativeWeekdays;
  sloppyRanges;
  second;
  minute;
  hour;
  day;
  month;
  dayOfWeek;
  year;
  lastDayOfMonth;
  lastWeekday;
  nearestWeekdays;
  starDOM;
  starDOW;
  starYear;
  useAndLogic;
  constructor(e, t, r) {
    this.pattern = e, this.timezone = t, this.mode = r?.mode ?? "auto", this.alternativeWeekdays = r?.alternativeWeekdays ?? false, this.sloppyRanges = r?.sloppyRanges ?? false, this.second = Array(60).fill(0), this.minute = Array(60).fill(0), this.hour = Array(24).fill(0), this.day = Array(31).fill(0), this.month = Array(12).fill(0), this.dayOfWeek = Array(7).fill(0), this.year = Array(1e4).fill(0), this.lastDayOfMonth = false, this.lastWeekday = false, this.nearestWeekdays = Array(31).fill(0), this.starDOM = false, this.starDOW = false, this.starYear = false, this.useAndLogic = false, this.parse();
  }
  parse() {
    if (!(typeof this.pattern == "string" || this.pattern instanceof String))
      throw new TypeError("CronPattern: Pattern has to be of type string.");
    this.pattern.indexOf("@") >= 0 && (this.pattern = this.handleNicknames(this.pattern).trim());
    let e = this.pattern.match(/\S+/g) || [""], t = e.length;
    if (e.length < 5 || e.length > 7)
      throw new TypeError("CronPattern: invalid configuration format ('" + this.pattern + "'), exactly five, six, or seven space separated parts are required.");
    if (this.mode !== "auto") {
      let n;
      switch (this.mode) {
        case "5-part":
          n = 5;
          break;
        case "6-part":
          n = 6;
          break;
        case "7-part":
          n = 7;
          break;
        case "5-or-6-parts":
          n = [5, 6];
          break;
        case "6-or-7-parts":
          n = [6, 7];
          break;
        default:
          n = 0;
      }
      if (!(Array.isArray(n) ? n.includes(t) : t === n)) {
        let a = Array.isArray(n) ? n.join(" or ") : n.toString();
        throw new TypeError(`CronPattern: mode '${this.mode}' requires exactly ${a} parts, but pattern '${this.pattern}' has ${t} parts.`);
      }
    }
    if (e.length === 5 && e.unshift("0"), e.length === 6 && e.push("*"), e[3].toUpperCase() === "LW" ? (this.lastWeekday = true, e[3] = "") : e[3].toUpperCase().indexOf("L") >= 0 && (e[3] = e[3].replace(/L/gi, ""), this.lastDayOfMonth = true), e[3] == "*" && (this.starDOM = true), e[6] == "*" && (this.starYear = true), e[4].length >= 3 && (e[4] = this.replaceAlphaMonths(e[4])), e[5].length >= 3 && (e[5] = this.alternativeWeekdays ? this.replaceAlphaDaysQuartz(e[5]) : this.replaceAlphaDays(e[5])), e[5].startsWith("+") && (this.useAndLogic = true, e[5] = e[5].substring(1), e[5] === ""))
      throw new TypeError("CronPattern: Day-of-week field cannot be empty after '+' modifier.");
    switch (e[5] == "*" && (this.starDOW = true), this.pattern.indexOf("?") >= 0 && (e[0] = e[0].replace(/\?/g, "*"), e[1] = e[1].replace(/\?/g, "*"), e[2] = e[2].replace(/\?/g, "*"), e[3] = e[3].replace(/\?/g, "*"), e[4] = e[4].replace(/\?/g, "*"), e[5] = e[5].replace(/\?/g, "*"), e[6] && (e[6] = e[6].replace(/\?/g, "*"))), this.mode) {
      case "5-part":
        e[0] = "0", e[6] = "*";
        break;
      case "6-part":
        e[6] = "*";
        break;
      case "5-or-6-parts":
        e[6] = "*";
        break;
      case "6-or-7-parts":
        break;
      case "7-part":
      case "auto":
        break;
    }
    this.throwAtIllegalCharacters(e), this.partToArray("second", e[0], 0, 1), this.partToArray("minute", e[1], 0, 1), this.partToArray("hour", e[2], 0, 1), this.partToArray("day", e[3], -1, 1), this.partToArray("month", e[4], -1, 1);
    let r = this.alternativeWeekdays ? -1 : 0;
    this.partToArray("dayOfWeek", e[5], r, 63), this.partToArray("year", e[6], 0, 1), !this.alternativeWeekdays && this.dayOfWeek[7] && (this.dayOfWeek[0] = this.dayOfWeek[7]);
  }
  partToArray(e, t, r, n) {
    let i = this[e], a = e === "day" && this.lastDayOfMonth, o = e === "day" && this.lastWeekday;
    if (t === "" && !a && !o)
      throw new TypeError("CronPattern: configuration entry " + e + " (" + t + ") is empty, check for trailing spaces.");
    if (t === "*")
      return i.fill(n);
    let h = t.split(",");
    if (h.length > 1)
      for (let l = 0;l < h.length; l++)
        this.partToArray(e, h[l], r, n);
    else
      t.indexOf("-") !== -1 && t.indexOf("/") !== -1 ? this.handleRangeWithStepping(t, e, r, n) : t.indexOf("-") !== -1 ? this.handleRange(t, e, r, n) : t.indexOf("/") !== -1 ? this.handleStepping(t, e, r, n) : t !== "" && this.handleNumber(t, e, r, n);
  }
  throwAtIllegalCharacters(e) {
    for (let t = 0;t < e.length; t++)
      if ((t === 3 ? /[^/*0-9,\-WwLl]+/ : t === 5 ? /[^/*0-9,\-#Ll]+/ : /[^/*0-9,\-]+/).test(e[t]))
        throw new TypeError("CronPattern: configuration entry " + t + " (" + e[t] + ") contains illegal characters.");
  }
  handleNumber(e, t, r, n) {
    let i = this.extractNth(e, t), a = e.toUpperCase().includes("W");
    if (t !== "day" && a)
      throw new TypeError("CronPattern: Nearest weekday modifier (W) only allowed in day-of-month.");
    a && (t = "nearestWeekdays");
    let o = parseInt(i[0], 10) + r;
    if (isNaN(o))
      throw new TypeError("CronPattern: " + t + " is not a number: '" + e + "'");
    this.setPart(t, o, i[1] || n);
  }
  setPart(e, t, r) {
    if (!Object.prototype.hasOwnProperty.call(this, e))
      throw new TypeError("CronPattern: Invalid part specified: " + e);
    if (e === "dayOfWeek") {
      if (t === 7 && (t = 0), t < 0 || t > 6)
        throw new RangeError("CronPattern: Invalid value for dayOfWeek: " + t);
      this.setNthWeekdayOfMonth(t, r);
      return;
    }
    if (e === "second" || e === "minute") {
      if (t < 0 || t >= 60)
        throw new RangeError("CronPattern: Invalid value for " + e + ": " + t);
    } else if (e === "hour") {
      if (t < 0 || t >= 24)
        throw new RangeError("CronPattern: Invalid value for " + e + ": " + t);
    } else if (e === "day" || e === "nearestWeekdays") {
      if (t < 0 || t >= 31)
        throw new RangeError("CronPattern: Invalid value for " + e + ": " + t);
    } else if (e === "month") {
      if (t < 0 || t >= 12)
        throw new RangeError("CronPattern: Invalid value for " + e + ": " + t);
    } else if (e === "year" && (t < 1 || t >= 1e4))
      throw new RangeError("CronPattern: Invalid value for " + e + ": " + t + " (supported range: 1-9999)");
    this[e][t] = r;
  }
  validateNotNaN(e, t) {
    if (isNaN(e))
      throw new TypeError(t);
  }
  validateRange(e, t, r, n, i) {
    if (e > t)
      throw new TypeError("CronPattern: From value is larger than to value: '" + i + "'");
    if (r !== undefined) {
      if (r === 0)
        throw new TypeError("CronPattern: Syntax error, illegal stepping: 0");
      if (r > this[n].length)
        throw new TypeError("CronPattern: Syntax error, steps cannot be greater than maximum value of part (" + this[n].length + ")");
    }
  }
  handleRangeWithStepping(e, t, r, n) {
    if (e.toUpperCase().includes("W"))
      throw new TypeError("CronPattern: Syntax error, W is not allowed in ranges with stepping.");
    let i = this.extractNth(e, t), a = i[0].match(/^(\d+)-(\d+)\/(\d+)$/);
    if (a === null)
      throw new TypeError("CronPattern: Syntax error, illegal range with stepping: '" + e + "'");
    let [, o, h, l] = a, y = parseInt(o, 10) + r, u = parseInt(h, 10) + r, d = parseInt(l, 10);
    this.validateNotNaN(y, "CronPattern: Syntax error, illegal lower range (NaN)"), this.validateNotNaN(u, "CronPattern: Syntax error, illegal upper range (NaN)"), this.validateNotNaN(d, "CronPattern: Syntax error, illegal stepping: (NaN)"), this.validateRange(y, u, d, t, e);
    for (let c = y;c <= u; c += d)
      this.setPart(t, c, i[1] || n);
  }
  extractNth(e, t) {
    let r = e, n;
    if (r.includes("#")) {
      if (t !== "dayOfWeek")
        throw new Error("CronPattern: nth (#) only allowed in day-of-week field");
      n = r.split("#")[1], r = r.split("#")[0];
    } else if (r.toUpperCase().endsWith("L")) {
      if (t !== "dayOfWeek")
        throw new Error("CronPattern: L modifier only allowed in day-of-week field (use L alone for day-of-month)");
      n = "L", r = r.slice(0, -1);
    }
    return [r, n];
  }
  handleRange(e, t, r, n) {
    if (e.toUpperCase().includes("W"))
      throw new TypeError("CronPattern: Syntax error, W is not allowed in a range.");
    let i = this.extractNth(e, t), a = i[0].split("-");
    if (a.length !== 2)
      throw new TypeError("CronPattern: Syntax error, illegal range: '" + e + "'");
    let o = parseInt(a[0], 10) + r, h = parseInt(a[1], 10) + r;
    this.validateNotNaN(o, "CronPattern: Syntax error, illegal lower range (NaN)"), this.validateNotNaN(h, "CronPattern: Syntax error, illegal upper range (NaN)"), this.validateRange(o, h, undefined, t, e);
    for (let l = o;l <= h; l++)
      this.setPart(t, l, i[1] || n);
  }
  handleStepping(e, t, r, n) {
    if (e.toUpperCase().includes("W"))
      throw new TypeError("CronPattern: Syntax error, W is not allowed in parts with stepping.");
    let i = this.extractNth(e, t), a = i[0].split("/");
    if (a.length !== 2)
      throw new TypeError("CronPattern: Syntax error, illegal stepping: '" + e + "'");
    if (this.sloppyRanges)
      a[0] === "" && (a[0] = "*");
    else {
      if (a[0] === "")
        throw new TypeError("CronPattern: Syntax error, stepping with missing prefix ('" + e + "') is not allowed. Use wildcard (*/step) or range (min-max/step) instead.");
      if (a[0] !== "*")
        throw new TypeError("CronPattern: Syntax error, stepping with numeric prefix ('" + e + "') is not allowed. Use wildcard (*/step) or range (min-max/step) instead.");
    }
    let o = 0;
    a[0] !== "*" && (o = parseInt(a[0], 10) + r);
    let h = parseInt(a[1], 10);
    this.validateNotNaN(h, "CronPattern: Syntax error, illegal stepping: (NaN)"), this.validateRange(0, this[t].length - 1, h, t, e);
    for (let l = o;l < this[t].length; l += h)
      this.setPart(t, l, i[1] || n);
  }
  replaceAlphaDays(e) {
    return e.replace(/-sun/gi, "-7").replace(/sun/gi, "0").replace(/mon/gi, "1").replace(/tue/gi, "2").replace(/wed/gi, "3").replace(/thu/gi, "4").replace(/fri/gi, "5").replace(/sat/gi, "6");
  }
  replaceAlphaDaysQuartz(e) {
    return e.replace(/sun/gi, "1").replace(/mon/gi, "2").replace(/tue/gi, "3").replace(/wed/gi, "4").replace(/thu/gi, "5").replace(/fri/gi, "6").replace(/sat/gi, "7");
  }
  replaceAlphaMonths(e) {
    return e.replace(/jan/gi, "1").replace(/feb/gi, "2").replace(/mar/gi, "3").replace(/apr/gi, "4").replace(/may/gi, "5").replace(/jun/gi, "6").replace(/jul/gi, "7").replace(/aug/gi, "8").replace(/sep/gi, "9").replace(/oct/gi, "10").replace(/nov/gi, "11").replace(/dec/gi, "12");
  }
  handleNicknames(e) {
    let t = e.trim().toLowerCase();
    if (t === "@yearly" || t === "@annually")
      return "0 0 1 1 *";
    if (t === "@monthly")
      return "0 0 1 * *";
    if (t === "@weekly")
      return "0 0 * * 0";
    if (t === "@daily" || t === "@midnight")
      return "0 0 * * *";
    if (t === "@hourly")
      return "0 * * * *";
    if (t === "@reboot")
      throw new TypeError("CronPattern: @reboot is not supported in this environment. This is an event-based trigger that requires system startup detection.");
    return e;
  }
  setNthWeekdayOfMonth(e, t) {
    if (typeof t != "number" && t.toUpperCase() === "L")
      this.dayOfWeek[e] = this.dayOfWeek[e] | 32;
    else if (t === 63)
      this.dayOfWeek[e] = 63;
    else if (t < 6 && t > 0)
      this.dayOfWeek[e] = this.dayOfWeek[e] | O[t - 1];
    else
      throw new TypeError(`CronPattern: nth weekday out of range, should be 1-5 or L. Value: ${t}, Type: ${typeof t}`);
  }
};
var P = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var f = [["month", "year", 0], ["day", "month", -1], ["hour", "day", 0], ["minute", "hour", 0], ["second", "minute", 0]];
var m = class s {
  tz;
  ms;
  second;
  minute;
  hour;
  day;
  month;
  year;
  constructor(e, t) {
    if (this.tz = t, e && e instanceof Date)
      if (!isNaN(e))
        this.fromDate(e);
      else
        throw new TypeError("CronDate: Invalid date passed to CronDate constructor");
    else if (e == null)
      this.fromDate(new Date);
    else if (e && typeof e == "string")
      this.fromString(e);
    else if (e instanceof s)
      this.fromCronDate(e);
    else
      throw new TypeError("CronDate: Invalid type (" + typeof e + ") passed to CronDate constructor");
  }
  getLastDayOfMonth(e, t) {
    return t !== 1 ? P[t] : new Date(Date.UTC(e, t + 1, 0)).getUTCDate();
  }
  getLastWeekday(e, t) {
    let r = this.getLastDayOfMonth(e, t), i = new Date(Date.UTC(e, t, r)).getUTCDay();
    return i === 0 ? r - 2 : i === 6 ? r - 1 : r;
  }
  getNearestWeekday(e, t, r) {
    let n = this.getLastDayOfMonth(e, t);
    if (r > n)
      return -1;
    let a = new Date(Date.UTC(e, t, r)).getUTCDay();
    return a === 0 ? r === n ? r - 2 : r + 1 : a === 6 ? r === 1 ? r + 2 : r - 1 : r;
  }
  isNthWeekdayOfMonth(e, t, r, n) {
    let a = new Date(Date.UTC(e, t, r)).getUTCDay(), o = 0;
    for (let h = 1;h <= r; h++)
      new Date(Date.UTC(e, t, h)).getUTCDay() === a && o++;
    if (n & 63 && O[o - 1] & n)
      return true;
    if (n & 32) {
      let h = this.getLastDayOfMonth(e, t);
      for (let l = r + 1;l <= h; l++)
        if (new Date(Date.UTC(e, t, l)).getUTCDay() === a)
          return false;
      return true;
    }
    return false;
  }
  fromDate(e) {
    if (this.tz !== undefined)
      if (typeof this.tz == "number")
        this.ms = e.getUTCMilliseconds(), this.second = e.getUTCSeconds(), this.minute = e.getUTCMinutes() + this.tz, this.hour = e.getUTCHours(), this.day = e.getUTCDate(), this.month = e.getUTCMonth(), this.year = e.getUTCFullYear(), this.apply();
      else
        try {
          let t = g(e, this.tz);
          this.ms = e.getMilliseconds(), this.second = t.s, this.minute = t.i, this.hour = t.h, this.day = t.d, this.month = t.m - 1, this.year = t.y;
        } catch (t) {
          let r = t instanceof Error ? t.message : String(t);
          throw new TypeError(`CronDate: Failed to convert date to timezone '${this.tz}'. This may happen with invalid timezone names or dates. Original error: ${r}`);
        }
    else
      this.ms = e.getMilliseconds(), this.second = e.getSeconds(), this.minute = e.getMinutes(), this.hour = e.getHours(), this.day = e.getDate(), this.month = e.getMonth(), this.year = e.getFullYear();
  }
  fromCronDate(e) {
    this.tz = e.tz, this.year = e.year, this.month = e.month, this.day = e.day, this.hour = e.hour, this.minute = e.minute, this.second = e.second, this.ms = e.ms;
  }
  apply() {
    if (this.month > 11 || this.month < 0 || this.day > P[this.month] || this.day < 1 || this.hour > 59 || this.minute > 59 || this.second > 59 || this.hour < 0 || this.minute < 0 || this.second < 0) {
      let e = new Date(Date.UTC(this.year, this.month, this.day, this.hour, this.minute, this.second, this.ms));
      return this.ms = e.getUTCMilliseconds(), this.second = e.getUTCSeconds(), this.minute = e.getUTCMinutes(), this.hour = e.getUTCHours(), this.day = e.getUTCDate(), this.month = e.getUTCMonth(), this.year = e.getUTCFullYear(), true;
    } else
      return false;
  }
  fromString(e) {
    if (typeof this.tz == "number") {
      let t = v(e);
      this.ms = t.getUTCMilliseconds(), this.second = t.getUTCSeconds(), this.minute = t.getUTCMinutes(), this.hour = t.getUTCHours(), this.day = t.getUTCDate(), this.month = t.getUTCMonth(), this.year = t.getUTCFullYear(), this.apply();
    } else
      return this.fromDate(v(e, this.tz));
  }
  findNext(e, t, r, n) {
    return this._findMatch(e, t, r, n, 1);
  }
  _findMatch(e, t, r, n, i) {
    let a = this[t], o;
    r.lastDayOfMonth && (o = this.getLastDayOfMonth(this.year, this.month));
    let h = !r.starDOW && t == "day" ? new Date(Date.UTC(this.year, this.month, 1, 0, 0, 0, 0)).getUTCDay() : undefined, l = this[t] + n, y = i === 1 ? (u) => u < r[t].length : (u) => u >= 0;
    for (let u = l;y(u); u += i) {
      let d = r[t][u];
      if (t === "day" && !d) {
        for (let c = 0;c < r.nearestWeekdays.length; c++)
          if (r.nearestWeekdays[c]) {
            let M = this.getNearestWeekday(this.year, this.month, c - n);
            if (M === -1)
              continue;
            if (M === u - n) {
              d = 1;
              break;
            }
          }
      }
      if (t === "day" && r.lastWeekday) {
        let c = this.getLastWeekday(this.year, this.month);
        u - n === c && (d = 1);
      }
      if (t === "day" && r.lastDayOfMonth && u - n == o && (d = 1), t === "day" && !r.starDOW) {
        let c = r.dayOfWeek[(h + (u - n - 1)) % 7];
        if (c && c & 63)
          c = this.isNthWeekdayOfMonth(this.year, this.month, u - n, c) ? 1 : 0;
        else if (c)
          throw new Error(`CronDate: Invalid value for dayOfWeek encountered. ${c}`);
        r.useAndLogic ? d = d && c : !e.domAndDow && !r.starDOM ? d = d || c : d = d && c;
      }
      if (d)
        return this[t] = u - n, a !== this[t] ? 2 : 1;
    }
    return 3;
  }
  recurse(e, t, r) {
    if (r === 0 && !e.starYear) {
      if (this.year >= 0 && this.year < e.year.length && e.year[this.year] === 0) {
        let i = -1;
        for (let a = this.year + 1;a < e.year.length && a < 1e4; a++)
          if (e.year[a] === 1) {
            i = a;
            break;
          }
        if (i === -1)
          return null;
        this.year = i, this.month = 0, this.day = 1, this.hour = 0, this.minute = 0, this.second = 0, this.ms = 0;
      }
      if (this.year >= 1e4)
        return null;
    }
    let n = this.findNext(t, f[r][0], e, f[r][2]);
    if (n > 1) {
      let i = r + 1;
      for (;i < f.length; )
        this[f[i][0]] = -f[i][2], i++;
      if (n === 3) {
        if (this[f[r][1]]++, this[f[r][0]] = -f[r][2], this.apply(), r === 0 && !e.starYear) {
          for (;this.year >= 0 && this.year < e.year.length && e.year[this.year] === 0 && this.year < 1e4; )
            this.year++;
          if (this.year >= 1e4 || this.year >= e.year.length)
            return null;
        }
        return this.recurse(e, t, 0);
      } else if (this.apply())
        return this.recurse(e, t, r - 1);
    }
    return r += 1, r >= f.length ? this : (e.starYear ? this.year >= 3000 : this.year >= 1e4) ? null : this.recurse(e, t, r);
  }
  increment(e, t, r) {
    return this.second += t.interval !== undefined && t.interval > 1 && r ? t.interval : 1, this.ms = 0, this.apply(), this.recurse(e, t, 0);
  }
  decrement(e, t) {
    return this.second -= t.interval !== undefined && t.interval > 1 ? t.interval : 1, this.ms = 0, this.apply(), this.recurseBackward(e, t, 0, 0);
  }
  recurseBackward(e, t, r, n = 0) {
    if (n > 1e4)
      return null;
    if (r === 0 && !e.starYear) {
      if (this.year >= 0 && this.year < e.year.length && e.year[this.year] === 0) {
        let a = -1;
        for (let o = this.year - 1;o >= 0; o--)
          if (e.year[o] === 1) {
            a = o;
            break;
          }
        if (a === -1)
          return null;
        this.year = a, this.month = 11, this.day = 31, this.hour = 23, this.minute = 59, this.second = 59, this.ms = 0;
      }
      if (this.year < 0)
        return null;
    }
    let i = this.findPrevious(t, f[r][0], e, f[r][2]);
    if (i > 1) {
      let a = r + 1;
      for (;a < f.length; ) {
        let o = f[a][0], h = f[a][2], l = this.getMaxPatternValue(o, e, h);
        this[o] = l, a++;
      }
      if (i === 3) {
        if (this[f[r][1]]--, r === 0) {
          let y = this.getLastDayOfMonth(this.year, this.month);
          this.day > y && (this.day = y);
        }
        if (r === 1)
          if (this.day <= 0)
            this.day = 1;
          else {
            let y = this.year, u = this.month;
            for (;u < 0; )
              u += 12, y--;
            for (;u > 11; )
              u -= 12, y++;
            let d = u !== 1 ? P[u] : new Date(Date.UTC(y, u + 1, 0)).getUTCDate();
            this.day > d && (this.day = d);
          }
        this.apply();
        let o = f[r][0], h = f[r][2], l = this.getMaxPatternValue(o, e, h);
        if (o === "day") {
          let y = this.getLastDayOfMonth(this.year, this.month);
          this[o] = Math.min(l, y);
        } else
          this[o] = l;
        if (this.apply(), r === 0) {
          let y = f[1][2], u = this.getMaxPatternValue("day", e, y), d = this.getLastDayOfMonth(this.year, this.month), c = Math.min(u, d);
          c !== this.day && (this.day = c, this.hour = this.getMaxPatternValue("hour", e, f[2][2]), this.minute = this.getMaxPatternValue("minute", e, f[3][2]), this.second = this.getMaxPatternValue("second", e, f[4][2]));
        }
        if (r === 0 && !e.starYear) {
          for (;this.year >= 0 && this.year < e.year.length && e.year[this.year] === 0; )
            this.year--;
          if (this.year < 0)
            return null;
        }
        return this.recurseBackward(e, t, 0, n + 1);
      } else if (this.apply())
        return this.recurseBackward(e, t, r - 1, n + 1);
    }
    return r += 1, r >= f.length ? this : this.year < 0 ? null : this.recurseBackward(e, t, r, n + 1);
  }
  getMaxPatternValue(e, t, r) {
    if (e === "day" && t.lastDayOfMonth)
      return this.getLastDayOfMonth(this.year, this.month);
    if (e === "day" && !t.starDOW)
      return this.getLastDayOfMonth(this.year, this.month);
    for (let n = t[e].length - 1;n >= 0; n--)
      if (t[e][n])
        return n - r;
    return t[e].length - 1 - r;
  }
  findPrevious(e, t, r, n) {
    return this._findMatch(e, t, r, n, -1);
  }
  getDate(e) {
    return e || this.tz === undefined ? new Date(this.year, this.month, this.day, this.hour, this.minute, this.second, this.ms) : typeof this.tz == "number" ? new Date(Date.UTC(this.year, this.month, this.day, this.hour, this.minute - this.tz, this.second, this.ms)) : k(b(this.year, this.month + 1, this.day, this.hour, this.minute, this.second, this.tz), false);
  }
  getTime() {
    return this.getDate(false).getTime();
  }
  match(e, t) {
    if (!e.starYear && (this.year < 0 || this.year >= e.year.length || e.year[this.year] === 0))
      return false;
    for (let r = 0;r < f.length; r++) {
      let n = f[r][0], i = f[r][2], a = this[n];
      if (a + i < 0 || a + i >= e[n].length)
        return false;
      let o = e[n][a + i];
      if (n === "day") {
        if (!o) {
          for (let h = 0;h < e.nearestWeekdays.length; h++)
            if (e.nearestWeekdays[h]) {
              let l = this.getNearestWeekday(this.year, this.month, h - i);
              if (l !== -1 && l === a) {
                o = 1;
                break;
              }
            }
        }
        if (e.lastWeekday) {
          let h = this.getLastWeekday(this.year, this.month);
          a === h && (o = 1);
        }
        if (e.lastDayOfMonth) {
          let h = this.getLastDayOfMonth(this.year, this.month);
          a === h && (o = 1);
        }
        if (!e.starDOW) {
          let h = new Date(Date.UTC(this.year, this.month, 1, 0, 0, 0, 0)).getUTCDay(), l = e.dayOfWeek[(h + (a - 1)) % 7];
          l && l & 63 && (l = this.isNthWeekdayOfMonth(this.year, this.month, a, l) ? 1 : 0), e.useAndLogic ? o = o && l : !t.domAndDow && !e.starDOM ? o = o || l : o = o && l;
        }
      }
      if (!o)
        return false;
    }
    return true;
  }
};
function R(s2) {
  if (s2 === undefined && (s2 = {}), delete s2.name, s2.legacyMode !== undefined && s2.domAndDow === undefined ? s2.domAndDow = !s2.legacyMode : s2.domAndDow === undefined && (s2.domAndDow = false), s2.legacyMode = !s2.domAndDow, s2.paused = s2.paused === undefined ? false : s2.paused, s2.maxRuns = s2.maxRuns === undefined ? 1 / 0 : s2.maxRuns, s2.catch = s2.catch === undefined ? false : s2.catch, s2.interval = s2.interval === undefined ? 0 : parseInt(s2.interval.toString(), 10), s2.utcOffset = s2.utcOffset === undefined ? undefined : parseInt(s2.utcOffset.toString(), 10), s2.dayOffset = s2.dayOffset === undefined ? 0 : parseInt(s2.dayOffset.toString(), 10), s2.unref = s2.unref === undefined ? false : s2.unref, s2.mode = s2.mode === undefined ? "auto" : s2.mode, s2.alternativeWeekdays = s2.alternativeWeekdays === undefined ? false : s2.alternativeWeekdays, s2.sloppyRanges = s2.sloppyRanges === undefined ? false : s2.sloppyRanges, !["auto", "5-part", "6-part", "7-part", "5-or-6-parts", "6-or-7-parts"].includes(s2.mode))
    throw new Error("CronOptions: mode must be one of 'auto', '5-part', '6-part', '7-part', '5-or-6-parts', or '6-or-7-parts'.");
  if (s2.startAt && (s2.startAt = new m(s2.startAt, s2.timezone)), s2.stopAt && (s2.stopAt = new m(s2.stopAt, s2.timezone)), s2.interval !== null) {
    if (isNaN(s2.interval))
      throw new Error("CronOptions: Supplied value for interval is not a number");
    if (s2.interval < 0)
      throw new Error("CronOptions: Supplied value for interval can not be negative");
  }
  if (s2.utcOffset !== undefined) {
    if (isNaN(s2.utcOffset))
      throw new Error("CronOptions: Invalid value passed for utcOffset, should be number representing minutes offset from UTC.");
    if (s2.utcOffset < -870 || s2.utcOffset > 870)
      throw new Error("CronOptions: utcOffset out of bounds.");
    if (s2.utcOffset !== undefined && s2.timezone)
      throw new Error("CronOptions: Combining 'utcOffset' with 'timezone' is not allowed.");
  }
  if (s2.unref !== true && s2.unref !== false)
    throw new Error("CronOptions: Unref should be either true, false or undefined(false).");
  if (s2.dayOffset !== undefined && s2.dayOffset !== 0 && isNaN(s2.dayOffset))
    throw new Error("CronOptions: Invalid value passed for dayOffset, should be a number representing days to offset.");
  return s2;
}
function p(s2) {
  return Object.prototype.toString.call(s2) === "[object Function]" || typeof s2 == "function" || s2 instanceof Function;
}
function _(s2) {
  return p(s2);
}
function x(s2) {
  typeof Deno < "u" && typeof Deno.unrefTimer < "u" ? Deno.unrefTimer(s2) : s2 && typeof s2.unref < "u" && s2.unref();
}
var W = 30 * 1000;
var w = [];
var E = class {
  name;
  options;
  _states;
  fn;
  getTz() {
    return this.options.timezone || this.options.utcOffset;
  }
  applyDayOffset(e) {
    if (this.options.dayOffset !== undefined && this.options.dayOffset !== 0) {
      let t = this.options.dayOffset * 24 * 60 * 60 * 1000;
      return new Date(e.getTime() + t);
    }
    return e;
  }
  constructor(e, t, r) {
    let n, i;
    if (p(t))
      i = t;
    else if (typeof t == "object")
      n = t;
    else if (t !== undefined)
      throw new Error("Cron: Invalid argument passed for optionsIn. Should be one of function, or object (options).");
    if (p(r))
      i = r;
    else if (typeof r == "object")
      n = r;
    else if (r !== undefined)
      throw new Error("Cron: Invalid argument passed for funcIn. Should be one of function, or object (options).");
    if (this.name = n?.name, this.options = R(n), this._states = { kill: false, blocking: false, previousRun: undefined, currentRun: undefined, once: undefined, currentTimeout: undefined, maxRuns: n ? n.maxRuns : undefined, paused: n ? n.paused : false, pattern: new C("* * * * *", undefined, { mode: "auto" }) }, e && (e instanceof Date || typeof e == "string" && e.indexOf(":") > 0) ? this._states.once = new m(e, this.getTz()) : this._states.pattern = new C(e, this.options.timezone, { mode: this.options.mode, alternativeWeekdays: this.options.alternativeWeekdays, sloppyRanges: this.options.sloppyRanges }), this.name) {
      if (w.find((o) => o.name === this.name))
        throw new Error("Cron: Tried to initialize new named job '" + this.name + "', but name already taken.");
      w.push(this);
    }
    return i !== undefined && _(i) && (this.fn = i, this.schedule()), this;
  }
  nextRun(e) {
    let t = this._next(e);
    return t ? this.applyDayOffset(t.getDate(false)) : null;
  }
  nextRuns(e, t) {
    this._states.maxRuns !== undefined && e > this._states.maxRuns && (e = this._states.maxRuns);
    let r = t || this._states.currentRun || undefined;
    return this._enumerateRuns(e, r, "next");
  }
  previousRuns(e, t) {
    return this._enumerateRuns(e, t || undefined, "previous");
  }
  _enumerateRuns(e, t, r) {
    let n = [], i = t ? new m(t, this.getTz()) : null, a = r === "next" ? this._next : this._previous;
    for (;e--; ) {
      let o = a.call(this, i);
      if (!o)
        break;
      let h = o.getDate(false);
      n.push(this.applyDayOffset(h)), i = o;
    }
    return n;
  }
  match(e) {
    if (this._states.once) {
      let r = new m(e, this.getTz());
      r.ms = 0;
      let n = new m(this._states.once, this.getTz());
      return n.ms = 0, r.getTime() === n.getTime();
    }
    let t = new m(e, this.getTz());
    return t.ms = 0, t.match(this._states.pattern, this.options);
  }
  getPattern() {
    if (!this._states.once)
      return this._states.pattern ? this._states.pattern.pattern : undefined;
  }
  getOnce() {
    return this._states.once ? this._states.once.getDate() : null;
  }
  isRunning() {
    let e = this.nextRun(this._states.currentRun), t = !this._states.paused, r = this.fn !== undefined, n = !this._states.kill;
    return t && r && n && e !== null;
  }
  isStopped() {
    return this._states.kill;
  }
  isBusy() {
    return this._states.blocking;
  }
  currentRun() {
    return this._states.currentRun ? this._states.currentRun.getDate() : null;
  }
  previousRun() {
    return this._states.previousRun ? this._states.previousRun.getDate() : null;
  }
  msToNext(e) {
    let t = this._next(e);
    return t ? e instanceof m || e instanceof Date ? t.getTime() - e.getTime() : t.getTime() - new m(e).getTime() : null;
  }
  stop() {
    this._states.kill = true, this._states.currentTimeout && clearTimeout(this._states.currentTimeout);
    let e = w.indexOf(this);
    e >= 0 && w.splice(e, 1);
  }
  pause() {
    return this._states.paused = true, !this._states.kill;
  }
  resume() {
    return this._states.paused = false, !this._states.kill;
  }
  schedule(e) {
    if (e && this.fn)
      throw new Error("Cron: It is not allowed to schedule two functions using the same Croner instance.");
    e && (this.fn = e);
    let t = this.msToNext(), r = this.nextRun(this._states.currentRun);
    return t == null || isNaN(t) || r === null ? this : (t > W && (t = W), this._states.currentTimeout = setTimeout(() => this._checkTrigger(r), t), this._states.currentTimeout && this.options.unref && x(this._states.currentTimeout), this);
  }
  async _trigger(e) {
    this._states.blocking = true, this._states.currentRun = new m(undefined, this.getTz());
    try {
      if (this.options.catch)
        try {
          this.fn !== undefined && await this.fn(this, this.options.context);
        } catch (t) {
          if (p(this.options.catch))
            try {
              this.options.catch(t, this);
            } catch {}
        }
      else
        this.fn !== undefined && await this.fn(this, this.options.context);
    } finally {
      this._states.previousRun = new m(e, this.getTz()), this._states.blocking = false;
    }
  }
  async trigger() {
    await this._trigger();
  }
  runsLeft() {
    return this._states.maxRuns;
  }
  _checkTrigger(e) {
    let t = new Date, r = !this._states.paused && t.getTime() >= e.getTime(), n = this._states.blocking && this.options.protect;
    r && !n ? (this._states.maxRuns !== undefined && this._states.maxRuns--, this._trigger()) : r && n && p(this.options.protect) && setTimeout(() => this.options.protect(this), 0), this.schedule();
  }
  _next(e) {
    let t = !!(e || this._states.currentRun), r = false;
    !e && this.options.startAt && this.options.interval && ([e, t] = this._calculatePreviousRun(e, t), r = !e), e = new m(e, this.getTz()), this.options.startAt && e && e.getTime() < this.options.startAt.getTime() && (e = this.options.startAt);
    let n = this._states.once || new m(e, this.getTz());
    return !r && n !== this._states.once && (n = n.increment(this._states.pattern, this.options, t)), this._states.once && this._states.once.getTime() <= e.getTime() || n === null || this._states.maxRuns !== undefined && this._states.maxRuns <= 0 || this._states.kill || this.options.stopAt && n.getTime() >= this.options.stopAt.getTime() ? null : n;
  }
  _previous(e) {
    let t = new m(e, this.getTz());
    this.options.stopAt && t.getTime() > this.options.stopAt.getTime() && (t = this.options.stopAt);
    let r = new m(t, this.getTz());
    return this._states.once ? this._states.once.getTime() < t.getTime() ? this._states.once : null : (r = r.decrement(this._states.pattern, this.options), r === null || this.options.startAt && r.getTime() < this.options.startAt.getTime() ? null : r);
  }
  _calculatePreviousRun(e, t) {
    let r = new m(undefined, this.getTz()), n = e;
    if (this.options.startAt.getTime() <= r.getTime()) {
      n = this.options.startAt;
      let i = n.getTime() + this.options.interval * 1000;
      for (;i <= r.getTime(); )
        n = new m(n, this.getTz()).increment(this._states.pattern, this.options, true), i = n.getTime() + this.options.interval * 1000;
      t = true;
    }
    return n === null && (n = undefined), [n, t];
  }
};

// node_modules/nanoid/index.js
import { webcrypto as crypto } from "node:crypto";

// node_modules/nanoid/url-alphabet/index.js
var urlAlphabet = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

// node_modules/nanoid/index.js
var POOL_SIZE_MULTIPLIER = 128;
var pool;
var poolOffset;
function fillPool(bytes) {
  if (bytes < 0)
    throw new RangeError("Wrong ID size");
  try {
    if (!pool || pool.length < bytes) {
      pool = Buffer.allocUnsafe(bytes * POOL_SIZE_MULTIPLIER);
      crypto.getRandomValues(pool);
      poolOffset = 0;
    } else if (poolOffset + bytes > pool.length) {
      crypto.getRandomValues(pool);
      poolOffset = 0;
    }
  } catch (e) {
    pool = undefined;
    throw e;
  }
  poolOffset += bytes;
}
function nanoid(size = 21) {
  fillPool(size |= 0);
  let id = "";
  for (let i = poolOffset - size;i < poolOffset; i++) {
    id += urlAlphabet[pool[i] & 63];
  }
  return id;
}

// dist/schedule.js
init_agent_runner();
init_agent_types();
init_invocation_config();

// dist/long-timer.js
var MAX_TIMER_CHUNK_MS = 24 * 86400000;
function setLongTimeout(fn, delayMs) {
  if (!Number.isFinite(delayMs))
    throw new RangeError(`Invalid timer delay: ${delayMs}`);
  const target = Date.now() + Math.max(0, delayMs);
  let handle;
  let cancelled = false;
  const arm = () => {
    if (cancelled)
      return;
    const remaining = target - Date.now();
    if (remaining > MAX_TIMER_CHUNK_MS) {
      handle = setTimeout(arm, MAX_TIMER_CHUNK_MS);
      return;
    }
    handle = setTimeout(() => {
      handle = undefined;
      if (!cancelled)
        fn();
    }, Math.max(0, remaining));
  };
  arm();
  return {
    cancel() {
      cancelled = true;
      if (handle !== undefined)
        clearTimeout(handle);
      handle = undefined;
    }
  };
}

// dist/schedule.js
var MIN_INTERVAL_MS = 60000;
var MAX_SCHEDULE_MS = 3650 * 86400000;
var UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

class SubagentScheduler {
  minIntervalMs;
  jobs = new Map;
  intervals = new Map;
  lastAgent = new Map;
  nextFire = new Map;
  constructor(minIntervalMs = MIN_INTERVAL_MS) {
    this.minIntervalMs = minIntervalMs;
  }
  store;
  pi;
  ctx;
  manager;
  start(pi, ctx, manager, store) {
    this.pi = pi;
    this.ctx = ctx;
    this.manager = manager;
    this.store = store;
    for (const job of store.list()) {
      if (job.enabled)
        this.scheduleJob(job);
    }
  }
  stop() {
    for (const cron of this.jobs.values())
      cron.stop();
    this.jobs.clear();
    for (const t of this.intervals.values())
      t.cancel();
    this.intervals.clear();
    this.nextFire.clear();
    this.store = undefined;
    this.pi = undefined;
    this.ctx = undefined;
    this.manager = undefined;
  }
  isActive() {
    return this.store !== undefined;
  }
  list() {
    return this.store?.list() ?? [];
  }
  buildJob(input) {
    const detected = SubagentScheduler.detectSchedule(input.schedule);
    return {
      id: nanoid(10),
      name: input.name,
      description: input.description,
      schedule: detected.normalized,
      scheduleType: detected.type,
      intervalMs: detected.intervalMs,
      subagent_type: input.subagent_type,
      prompt: input.prompt,
      model: input.model,
      thinking: input.thinking,
      max_turns: input.max_turns,
      isolated: input.isolated,
      isolation: input.isolation,
      enabled: true,
      createdAt: new Date().toISOString(),
      runCount: 0
    };
  }
  addJob(input) {
    const store = this.requireStore();
    if (store.hasName(input.name)) {
      throw new Error(`A scheduled job named "${input.name}" already exists.`);
    }
    const job = this.buildJob(input);
    store.add(job);
    if (job.enabled)
      this.scheduleJob(job);
    this.emit({ type: "added", job });
    return job;
  }
  removeJob(id) {
    const store = this.requireStore();
    if (!store.get(id))
      return false;
    this.unscheduleJob(id);
    this.lastAgent.delete(id);
    const ok = store.remove(id);
    if (ok)
      this.emit({ type: "removed", jobId: id });
    return ok;
  }
  updateJob(id, patch) {
    const store = this.requireStore();
    const updated = store.update(id, patch);
    if (!updated)
      return;
    this.unscheduleJob(id);
    if (updated.enabled)
      this.scheduleJob(updated);
    this.emit({ type: "updated", job: updated });
    return updated;
  }
  getNextRun(jobId) {
    const cron = this.jobs.get(jobId);
    if (cron)
      return cron.nextRun()?.toISOString();
    const job = this.store?.get(jobId);
    if (!job?.enabled)
      return;
    if (job.scheduleType === "once")
      return job.schedule;
    if (job.scheduleType === "interval" && job.intervalMs) {
      const armed = this.nextFire.get(jobId);
      if (armed !== undefined)
        return new Date(armed).toISOString();
      const base = job.lastRun ? new Date(job.lastRun).getTime() : Date.now();
      return new Date(base + job.intervalMs).toISOString();
    }
    return;
  }
  scheduleJob(job) {
    const store = this.store;
    if (!store)
      return;
    try {
      if (job.scheduleType === "interval" && job.intervalMs) {
        const every = Math.min(Math.max(job.intervalMs, this.minIntervalMs), MAX_SCHEDULE_MS);
        const arm = () => {
          this.nextFire.set(job.id, Date.now() + every);
          this.intervals.set(job.id, setLongTimeout(() => {
            arm();
            this.executeJob(job.id);
          }, every));
        };
        arm();
      } else if (job.scheduleType === "once") {
        const target = new Date(job.schedule).getTime();
        const delay = target - Date.now();
        if (delay > 0) {
          this.nextFire.set(job.id, target);
          const t = setLongTimeout(() => {
            this.intervals.delete(job.id);
            this.nextFire.delete(job.id);
            this.fireOnce(job.id, store);
          }, delay);
          this.intervals.set(job.id, t);
        } else {
          store.update(job.id, { enabled: false, lastStatus: "error" });
          this.emit({ type: "error", jobId: job.id, error: `Scheduled time ${job.schedule} is in the past` });
        }
      } else {
        const cron = new E(job.schedule, { catch: true }, () => {
          this.executeJob(job.id);
        });
        this.jobs.set(job.id, cron);
      }
    } catch (err) {
      this.emit({ type: "error", jobId: job.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  unscheduleJob(id) {
    const cron = this.jobs.get(id);
    if (cron) {
      cron.stop();
      this.jobs.delete(id);
    }
    const t = this.intervals.get(id);
    if (t) {
      t.cancel();
      this.intervals.delete(id);
    }
    this.nextFire.delete(id);
  }
  fireOnce(id, store) {
    this.executeJob(id);
    store.updateAsync(id, { enabled: false }).then(() => {
      const updated = store.get(id);
      if (updated)
        this.emit({ type: "updated", job: updated });
    }, (err) => this.emit({ type: "error", jobId: id, error: err instanceof Error ? err.message : String(err) }));
  }
  async executeJob(id) {
    try {
      await this.fireJob(id);
    } catch (err) {
      this.emit({ type: "error", jobId: id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  fireJob(id) {
    const store = this.store;
    const pi = this.pi;
    const ctx = this.ctx;
    const manager = this.manager;
    if (!store || !pi || !ctx || !manager)
      return Promise.resolve();
    const job = store.get(id);
    if (!job?.enabled)
      return Promise.resolve();
    const previous = this.lastAgent.get(id);
    if (previous && manager.isRunActive(previous)) {
      this.emit({ type: "skipped", jobId: id, agentId: previous, reason: "the previous run is still active" });
      return Promise.resolve();
    }
    const marked = store.updateAsync(id, { lastStatus: "running" });
    let resolvedModel;
    let modelNote;
    const overridesAllowed = isModelOverrideAllowed();
    const thinking = overridesAllowed ? job.thinking : undefined;
    if (job.model && overridesAllowed) {
      const resolution = resolveModelDetailed(job.model, ctx.modelRegistry, ctx.model?.provider);
      if (resolution.ok)
        resolvedModel = resolution.model;
      else
        modelNote = unresolvedModelNote(job.model, unresolvedReason(resolution), "the agent's default model", "the scheduled job");
    }
    let agentId;
    try {
      const dispatch = resolveSpawnType(job.subagent_type);
      if (!dispatch.ok)
        throw new Error(dispatch.message);
      agentId = manager.spawn(pi, ctx, dispatch.type, job.prompt, {
        description: job.description,
        isBackground: true,
        bypassQueue: true,
        model: resolvedModel,
        ...modelNote !== undefined ? { modelNote } : {},
        maxTurns: job.max_turns,
        isolated: job.isolated,
        thinkingLevel: thinking,
        isolation: job.isolation,
        invocation: {
          thinking,
          maxTurns: normalizeMaxTurns(job.max_turns),
          isolated: job.isolated,
          runInBackground: true,
          isolation: job.isolation
        }
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const recorded = store.updateAsync(id, { lastRun: new Date().toISOString(), lastStatus: "error" });
      this.emit({ type: "error", jobId: id, error });
      return Promise.all([marked, recorded]).then(() => {});
    }
    this.lastAgent.set(id, agentId);
    this.emit({ type: "fired", jobId: id, agentId, name: job.name });
    const finalize = async (status) => {
      const next = this.getNextRun(id);
      const current = store.get(id);
      await store.updateAsync(id, {
        lastRun: new Date().toISOString(),
        lastStatus: status,
        runCount: (current?.runCount ?? 0) + 1,
        nextRun: next
      });
    };
    (async () => {
      let failed = true;
      try {
        await marked.catch(() => {});
        await manager.awaitStartup(agentId);
        await manager.getRecord(agentId)?.promise;
        const r = manager.getRecord(agentId);
        failed = r?.status === "error" || r?.status === "aborted" || r?.status === "stopped";
      } catch {}
      try {
        await finalize(failed ? "error" : "success");
      } catch (err) {
        this.emit({ type: "error", jobId: id, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return marked.then(() => {});
  }
  emit(event) {
    try {
      this.pi?.events.emit("subagents:scheduled", event);
    } catch {}
  }
  requireStore() {
    if (!this.store)
      throw new Error("Scheduler not started — no active session.");
    return this.store;
  }
  static detectSchedule(s2) {
    const trimmed = s2.trim();
    const rel = SubagentScheduler.parseRelativeTime(trimmed);
    if (rel !== null)
      return { type: "once", normalized: rel };
    const ivl = SubagentScheduler.parseInterval(trimmed);
    if (ivl !== null) {
      if (ivl < MIN_INTERVAL_MS) {
        throw new Error(`Interval "${trimmed}" is too short: jobs can repeat at most once a minute ("1m").`);
      }
      return { type: "interval", intervalMs: ivl, normalized: trimmed };
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      const d = new Date(trimmed);
      if (!Number.isNaN(d.getTime())) {
        if (d.getTime() <= Date.now()) {
          throw new Error(`Scheduled time ${d.toISOString()} is in the past.`);
        }
        return { type: "once", normalized: d.toISOString() };
      }
    }
    const cronCheck = SubagentScheduler.validateCronExpression(trimmed);
    if (cronCheck.valid)
      return { type: "cron", normalized: trimmed };
    throw new Error(`Invalid schedule "${s2}". Use 6-field cron (e.g. "0 0 9 * * 1" — 9am every Monday), interval ("5m"/"1h"), or one-shot ("+10m" / ISO).`);
  }
  static validateCronExpression(expr) {
    const fields = expr.trim().split(/\s+/);
    if (fields.length !== 6) {
      return {
        valid: false,
        error: `Cron must have 6 fields (second minute hour dom month dow), got ${fields.length}. Example: "0 0 9 * * 1" for 9am every Monday.`
      };
    }
    try {
      new E(expr);
      return { valid: true };
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : "Invalid cron expression" };
    }
  }
  static parseRelativeTime(s2) {
    const m2 = s2.match(/^\+(\d+)(s|m|h|d)$/);
    if (!m2)
      return null;
    const ms = SubagentScheduler.boundedMs(s2, Number(m2[1]) * UNIT_MS[m2[2]]);
    return new Date(Date.now() + ms).toISOString();
  }
  static parseInterval(s2) {
    const m2 = s2.match(/^(\d+)(s|m|h|d)$/);
    if (!m2)
      return null;
    return SubagentScheduler.boundedMs(s2, Number(m2[1]) * UNIT_MS[m2[2]]);
  }
  static boundedMs(input, ms) {
    if (!Number.isSafeInteger(ms) || ms > MAX_SCHEDULE_MS) {
      throw new Error(`Schedule "${input}" is too far out: the limit is 3650d.`);
    }
    return ms;
  }
}

// dist/schedule-store.js
import { existsSync as existsSync11, mkdirSync as mkdirSync6, readFileSync as readFileSync7, renameSync, statSync as statSync6, unlinkSync, writeFileSync as writeFileSync3 } from "node:fs";
import { dirname as dirname4, join as join12 } from "node:path";
var LOCK_RETRY_MS = 50;
var DEFAULT_LOCK_WAIT_MS = 5000;
var LOCK_STALE_MS = 30000;
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
function tryAcquireLock(lockPath) {
  for (let i = 0;i < 3; i++) {
    try {
      writeFileSync3(lockPath, `${process.pid}`, { flag: "wx" });
      return true;
    } catch (e) {
      if (e.code !== "EEXIST")
        throw e;
      try {
        const pid = parseInt(readFileSync7(lockPath, "utf-8"), 10);
        const age = Date.now() - statSync6(lockPath).mtimeMs;
        if (!pid || !isProcessRunning(pid) || age > LOCK_STALE_MS) {
          unlinkSync(lockPath);
          continue;
        }
      } catch {
        continue;
      }
      return false;
    }
  }
  return false;
}
function releaseLock(lockPath) {
  try {
    unlinkSync(lockPath);
  } catch {}
}
function resolveStorePath(cwd, sessionId) {
  return join12(cwd, ".pi", "subagent-schedules", `${sessionId}.json`);
}

class ScheduleStore {
  filePath;
  lockPath;
  lockWaitMs;
  jobs = new Map;
  queuedWrites = 0;
  writeTail = Promise.resolve();
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.lockPath = filePath + ".lock";
    this.lockWaitMs = options.lockWaitMs ?? DEFAULT_LOCK_WAIT_MS;
    this.load();
  }
  ensureDir() {
    mkdirSync6(dirname4(this.filePath), { recursive: true });
  }
  load() {
    if (!existsSync11(this.filePath))
      return;
    let data;
    try {
      data = JSON.parse(readFileSync7(this.filePath, "utf-8"));
    } catch (err) {
      const backup = `${this.filePath}.corrupt`;
      try {
        renameSync(this.filePath, backup);
        console.warn(`[pi-subagents] Schedule file ${this.filePath} is not valid JSON (${err instanceof Error ? err.message : String(err)}); moved it to ${backup}.`);
      } catch (moveErr) {
        console.warn(`[pi-subagents] Schedule file ${this.filePath} is not valid JSON and could not be moved aside:`, moveErr);
      }
      return;
    }
    this.jobs.clear();
    for (const j of Array.isArray(data?.jobs) ? data.jobs : [])
      this.jobs.set(j.id, j);
  }
  save() {
    const data = { version: 1, jobs: [...this.jobs.values()] };
    const tmp = this.filePath + ".tmp";
    writeFileSync3(tmp, JSON.stringify(data, null, 2));
    renameSync(tmp, this.filePath);
  }
  underLock(fn) {
    try {
      this.load();
      const result = fn();
      this.save();
      return result;
    } finally {
      releaseLock(this.lockPath);
    }
  }
  withLock(fn) {
    this.ensureDir();
    if (!tryAcquireLock(this.lockPath)) {
      throw new Error(`The schedule store is busy (locked by another pi process): ${this.lockPath}`);
    }
    return this.underLock(fn);
  }
  withLockAsync(fn) {
    try {
      this.ensureDir();
      if (this.queuedWrites === 0 && tryAcquireLock(this.lockPath))
        return Promise.resolve(this.underLock(fn));
    } catch (err) {
      return Promise.reject(err);
    }
    this.queuedWrites++;
    const write = this.writeTail.then(async () => {
      const deadline = Date.now() + this.lockWaitMs;
      while (!tryAcquireLock(this.lockPath)) {
        if (Date.now() >= deadline)
          throw new Error(`Failed to acquire schedule lock: ${this.lockPath}`);
        await new Promise((resolve4) => setTimeout(resolve4, LOCK_RETRY_MS));
      }
      return this.underLock(fn);
    }).finally(() => {
      this.queuedWrites--;
    });
    this.writeTail = write.catch(() => {});
    return write;
  }
  list() {
    return [...this.jobs.values()];
  }
  hasName(name, exceptId) {
    for (const j of this.jobs.values()) {
      if (j.id !== exceptId && j.name === name)
        return true;
    }
    return false;
  }
  get(id) {
    return this.jobs.get(id);
  }
  add(job) {
    this.withLock(() => {
      this.jobs.set(job.id, job);
    });
  }
  update(id, patch) {
    if (!this.jobs.has(id))
      return;
    return this.withLock(() => this.applyPatch(id, patch));
  }
  async updateAsync(id, patch) {
    if (!this.jobs.has(id))
      return;
    return this.withLockAsync(() => this.applyPatch(id, patch));
  }
  applyPatch(id, patch) {
    const existing = this.jobs.get(id);
    if (!existing)
      return;
    const updated = { ...existing, ...patch };
    this.jobs.set(id, updated);
    return updated;
  }
  remove(id) {
    if (!this.jobs.has(id))
      return false;
    return this.withLock(() => this.jobs.delete(id));
  }
  deleteFileIfEmpty() {
    if (this.jobs.size === 0 && existsSync11(this.filePath)) {
      try {
        unlinkSync(this.filePath);
      } catch {}
    }
  }
}

// dist/index.js
init_session_file();
init_session_handoff();
init_settings();
init_tool_args();

// dist/ui/agent-mention.js
init_mention();
function mentionRoster(manager, types, displayNameOf = (type) => type) {
  const live = (r) => r.status === "running" || r.status === "queued";
  const records = manager.listAgents().filter((r) => r.handle !== undefined && r.parentAgentId === undefined).sort((a, b2) => Number(live(b2)) - Number(live(a)) || a.startedAt - b2.startedAt);
  const taken = new Set;
  const targets = [];
  for (const record of records) {
    const handle = record.alias ?? record.handle;
    taken.add(handle.toLowerCase());
    if (record.handle)
      taken.add(record.handle.toLowerCase());
    targets.push({ kind: "record", handle, record, typeLabel: displayNameOf(record.type) });
  }
  for (const entry of manager.listTombstones()) {
    const handle = entry.alias ?? entry.handle;
    if (taken.has(handle.toLowerCase()))
      continue;
    taken.add(handle.toLowerCase());
    taken.add(entry.handle.toLowerCase());
    targets.push({ kind: "tombstone", handle, entry, typeLabel: displayNameOf(entry.type) });
  }
  for (const type of types) {
    const handle = handleBase(type.name);
    if (taken.has(handle))
      continue;
    taken.add(handle);
    targets.push({ kind: "type", handle, type: type.name, description: type.description });
  }
  return targets;
}
function createMentionProvider(current, roster, isEnabled) {
  let warnedInnerFailure = false;
  return {
    triggerCharacters: ["@"],
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const mine = isEnabled() ? mentionItems(roster(), lines[cursorLine] ?? "", cursorCol) : null;
      let theirs = null;
      try {
        theirs = await current.getSuggestions(lines, cursorLine, cursorCol, options);
      } catch (err) {
        if (!warnedInnerFailure) {
          warnedInnerFailure = true;
          console.warn("[pi-subagents] the autocomplete provider below us failed; showing agent rows only:", err);
        }
        theirs = null;
      }
      if (!mine)
        return theirs;
      if (!theirs)
        return mine;
      return { items: [...mine.items, ...theirs.items], prefix: mine.prefix };
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },
    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    }
  };
}
function mentionItems(roster, line, cursorCol) {
  const match = MENTION_TRIGGER.exec(line.slice(0, cursorCol));
  if (!match)
    return null;
  const typed = match[2].toLowerCase();
  const items = [];
  for (const target of roster) {
    if (!target.handle.toLowerCase().startsWith(typed))
      continue;
    items.push({ value: `@${target.handle}`, label: `@${target.handle}`, description: describeTarget(target) });
  }
  return items.length > 0 ? { items, prefix: `@${match[2]}` } : null;
}
function describeTarget(target) {
  if (target.kind === "type")
    return `start agent · ${summarize(target.description)}`;
  if (target.kind === "tombstone") {
    return `resume · ${target.typeLabel} · ${target.entry.description}`;
  }
  const { status, description, alias } = target.record;
  const action = status === "running" || status === "queued" ? "send message" : "resume";
  const identity = alias ? `${target.typeLabel} · ` : "";
  return `${action} · ${identity}${status} · ${description}`;
}
function summarize(description) {
  const first = (description.match(/^.*?[.!?](?=\s|$)/s)?.[0] ?? description).replace(/\s+/g, " ").trim();
  return first.length > 60 ? `${first.slice(0, 59).trimEnd()}…` : first;
}

// dist/index.js
init_agent_widget();
init_conversation_viewer();

// dist/ui/fleet-list.js
init_agent_color();
init_agent_manager();
init_usage();
init_agent_widget();
init_conversation_viewer();
import { isKeyRelease, Key, matchesKey as matchesKey3, truncateToWidth as truncateToWidth4, visibleWidth as visibleWidth3 } from "@earendil-works/pi-tui";
var FLEET_KEY = "fleet";
var MAX_AGENT_ROWS = 5;
var FLEET_TICK_MS = 1000;
var FINISHED_LINGER_MS = 4000;
function formatFleetElapsed(ms) {
  return `${Math.max(0, Math.round(ms / 1000))}s`;
}
function formatFleetTokens(count) {
  let compact;
  if (count >= 1e6)
    compact = `${(count / 1e6).toFixed(1)}M`;
  else if (count >= 1000)
    compact = `${(count / 1000).toFixed(1)}k`;
  else
    compact = `${count}`;
  return `↓ ${compact} tokens`;
}
function rightAlign(left, right, width) {
  const rightW = visibleWidth3(right);
  const maxLeft = Math.max(0, width - rightW - 1);
  const leftClamped = truncateToWidth4(left, maxLeft);
  const gap = Math.max(1, width - visibleWidth3(leftClamped) - rightW);
  return truncateToWidth4(leftClamped + " ".repeat(gap) + right, width);
}

class FleetList {
  manager;
  agentActivity;
  showCost;
  viewerRenderOptions;
  ticker;
  backgroundAction;
  scrollbarMode;
  ui;
  tui;
  inputUnsub;
  widgetRegistered = false;
  enabled = true;
  active = false;
  selectedIndex = 0;
  viewerClose;
  viewingAgentId;
  workflowSource;
  openWorkflow;
  viewingWorkflowId;
  constructor(manager, agentActivity, showCost = () => false, viewerRenderOptions = () => {
    return;
  }, ticker = new RefreshTicker, backgroundAction, scrollbarMode = () => "auto") {
    this.manager = manager;
    this.agentActivity = agentActivity;
    this.showCost = showCost;
    this.viewerRenderOptions = viewerRenderOptions;
    this.ticker = ticker;
    this.backgroundAction = backgroundAction;
    this.scrollbarMode = scrollbarMode;
  }
  setEnabled(enabled) {
    if (enabled === this.enabled)
      return;
    this.enabled = enabled;
    if (!enabled)
      this.active = false;
    this.update();
  }
  setManager(manager) {
    this.manager = manager;
    this.update();
  }
  setUICtx(ui) {
    if (ui === this.ui)
      return;
    this.inputUnsub?.();
    this.ui = ui;
    this.widgetRegistered = false;
    this.tui = undefined;
    this.inputUnsub = ui.onTerminalInput((data) => this.handleKey(data));
  }
  ensureTimer() {
    if (!this.ticker.has(this))
      this.ticker.set(this, FLEET_TICK_MS, () => this.update());
  }
  onAgentFinished(_id) {
    this.update();
  }
  dispose() {
    this.ticker.delete(this);
    this.inputUnsub?.();
    this.inputUnsub = undefined;
    if (this.viewerClose) {
      this.viewerClose();
      this.viewerClose = undefined;
    }
    this.viewingAgentId = undefined;
    this.viewingWorkflowId = undefined;
    if (this.ui && this.widgetRegistered)
      this.ui.setWidget(FLEET_KEY, undefined);
    this.widgetRegistered = false;
    this.tui = undefined;
    this.active = false;
    this.ui = undefined;
  }
  update() {
    if (!this.ui)
      return;
    const roster = this.roster();
    const hasRows = this.enabled && roster.length > 1;
    if (!hasRows) {
      if (this.widgetRegistered) {
        this.ui.setWidget(FLEET_KEY, undefined);
        this.widgetRegistered = false;
        this.tui = undefined;
      }
      this.ticker.delete(this);
      this.active = false;
      this.selectedIndex = 0;
      return;
    }
    this.clampSelection();
    if (roster.some((entry) => this.isLive(entry)))
      this.ensureTimer();
    else
      this.ticker.delete(this);
    if (!this.widgetRegistered) {
      this.ui.setWidget(FLEET_KEY, (tui, theme) => {
        this.tui = tui;
        return {
          render: (w2) => this.renderBar(w2, theme),
          invalidate: () => {
            this.widgetRegistered = false;
            this.tui = undefined;
          }
        };
      }, { placement: "belowEditor" });
      this.widgetRegistered = true;
    } else {
      this.tui?.requestRender();
    }
  }
  agentRecords() {
    const now = Date.now();
    return this.manager.listAgents().filter((a) => isTopLevelAgent(a) && a.session && (a.status === "running" || a.status === "queued" || a.id === this.viewingAgentId || a.completedAt != null && now - a.completedAt < FINISHED_LINGER_MS)).sort((a, b2) => a.startedAt - b2.startedAt);
  }
  setWorkflowSource(source, open) {
    this.workflowSource = source;
    this.openWorkflow = open;
  }
  workflows() {
    if (!this.workflowSource)
      return [];
    const now = Date.now();
    return [...this.workflowSource()].filter((run) => run.status === "running" || run.status === "paused" || run.completedAt != null && now - run.completedAt < FINISHED_LINGER_MS).sort((a, b2) => a.startedAt - b2.startedAt);
  }
  roster() {
    return [
      { kind: "main" },
      ...this.workflows().map((workflow) => ({ kind: "workflow", workflow })),
      ...this.agentRecords().map((record) => ({ kind: "agent", record }))
    ];
  }
  isLive(entry) {
    const now = Date.now();
    if (entry.kind === "agent") {
      const r = entry.record;
      return r.status === "running" || r.status === "queued" || r.completedAt != null && now - r.completedAt < FINISHED_LINGER_MS;
    }
    if (entry.kind === "workflow") {
      const w2 = entry.workflow;
      return w2.status === "running" || w2.status === "paused" || w2.completedAt != null && now - w2.completedAt < FINISHED_LINGER_MS;
    }
    return false;
  }
  clampSelection() {
    const max = this.roster().length - 1;
    if (this.selectedIndex > max)
      this.selectedIndex = Math.max(0, max);
    if (this.selectedIndex < 0)
      this.selectedIndex = 0;
  }
  handleKey(data) {
    if (!this.enabled || !this.ui)
      return;
    if (isKeyRelease(data))
      return;
    if (this.viewerClose || this.viewingWorkflowId)
      return;
    if (!this.editorHasFocus()) {
      if (this.active)
        this.deactivate();
      return;
    }
    if (!this.active) {
      const isActivator = matchesKey3(data, "down") || matchesKey3(data, "left");
      if (isActivator && this.roster().length > 1 && this.ui.getEditorText() === "") {
        this.active = true;
        this.selectedIndex = 0;
        this.update();
        return { consume: true };
      }
      return;
    }
    if (matchesKey3(data, "down")) {
      const max = this.roster().length - 1;
      this.selectedIndex = Math.min(max, this.selectedIndex + 1);
      this.update();
      return { consume: true };
    }
    if (matchesKey3(data, "up")) {
      if (this.selectedIndex === 0) {
        this.deactivate();
        return { consume: true };
      }
      this.selectedIndex -= 1;
      this.update();
      return { consume: true };
    }
    if (matchesKey3(data, "escape")) {
      this.deactivate();
      return { consume: true };
    }
    if (matchesKey3(data, Key.enter)) {
      this.openSelected();
      return { consume: true };
    }
    this.deactivate();
    return;
  }
  editorHasFocus() {
    const focused = this.tui?.focusedComponent;
    if (focused == null)
      return true;
    const c = focused;
    return typeof c.getText === "function" && typeof c.setText === "function";
  }
  deactivate() {
    this.active = false;
    this.selectedIndex = 0;
    this.update();
  }
  openSelected() {
    const entry = this.roster()[this.selectedIndex];
    if (!entry || entry.kind === "main") {
      this.deactivate();
      return;
    }
    if (entry.kind === "workflow") {
      this.viewingWorkflowId = entry.workflow.id;
      Promise.resolve(this.openWorkflow?.(entry.workflow.id)).then(() => this.clearViewer(), () => this.clearViewer());
      return;
    }
    const record = entry.record;
    if (!this.ui)
      return;
    if (!record.session) {
      this.ui.notify(`Agent is ${record.status} — no session available.`, "info");
      return;
    }
    const session = record.session;
    const activity = this.agentActivity.get(record.id);
    this.viewingAgentId = record.id;
    let overlayOptions = getConversationOverlayOptions({ mode: "regular" });
    this.ui.custom((tui, theme, keybindings, done) => {
      overlayOptions = getConversationOverlayOptions(tui);
      this.viewerClose = () => done(undefined);
      return new ConversationViewer(tui, session, record, activity, theme, done, () => {
        if (this.manager.abort(record.id))
          this.ui?.notify(`Stopped "${record.description}".`, "info");
      }, keybindings, (message) => this.manager.steer(record.id, message), this.showCost(), this.backgroundAction?.(record, (message) => this.ui?.notify(message, "info")), this.scrollbarMode(), this.viewerRenderOptions());
    }, {
      overlay: true,
      overlayOptions: () => overlayOptions
    }).then(() => this.clearViewer(), () => this.clearViewer());
  }
  clearViewer() {
    const viewed = this.viewingAgentId ?? this.viewingWorkflowId;
    if (viewed !== undefined) {
      const idx = this.roster().findIndex((e) => e.kind === "agent" ? e.record.id === viewed : e.kind === "workflow" ? e.workflow.id === viewed : false);
      if (idx >= 0)
        this.selectedIndex = idx;
    }
    this.viewerClose = undefined;
    this.viewingAgentId = undefined;
    this.viewingWorkflowId = undefined;
    this.update();
  }
  renderBar(width, theme) {
    const rows = this.roster().slice(1);
    if (rows.length === 0)
      return [];
    const sel = Math.min(this.selectedIndex, rows.length);
    const hint = this.active ? "↑↓ select · enter view · esc back" : "esc to interrupt · ← for agents · ↓ to manage";
    const lines = [];
    lines.push(truncateToWidth4("  " + theme.fg("dim", hint), width));
    lines.push("");
    lines.push(truncateToWidth4(`  ${this.bullet(0, sel, theme)} main`, width));
    const visible = Math.min(MAX_AGENT_ROWS, rows.length);
    const selRow = Math.max(0, sel - 1);
    const start = selRow < visible ? 0 : selRow - visible + 1;
    const hiddenBelow = rows.length - (start + visible);
    if (start > 0)
      lines.push(rightAlign("", theme.fg("dim", `↑ ${start} more`), width));
    for (let a = start;a < start + visible; a++) {
      const row = rows[a];
      lines.push(row.kind === "workflow" ? this.renderWorkflowRow(a + 1, sel, row.workflow, width, theme) : this.renderAgentRow(a + 1, sel, row.record, width, theme));
    }
    if (hiddenBelow > 0)
      lines.push(rightAlign("", theme.fg("dim", `↓ ${hiddenBelow} more`), width));
    lines.push("");
    return lines;
  }
  bullet(rosterIndex, sel, theme) {
    return rosterIndex === sel ? theme.fg("accent", "●") : theme.fg("dim", "○");
  }
  renderWorkflowRow(rosterIndex, sel, workflow, width, theme) {
    const selected = rosterIndex === sel;
    const kind = theme.fg(selected ? "text" : "muted", "workflow");
    const name = selected ? theme.fg("text", workflow.name) : workflow.name;
    const left = `  ${this.bullet(rosterIndex, sel, theme)} ${kind}  ${name}`;
    const elapsed = (workflow.completedAt ?? Date.now()) - workflow.startedAt;
    const agents2 = `${workflow.doneCount}/${workflow.totalCount} agent${workflow.totalCount === 1 ? "" : "s"}`;
    const stats = `${agents2} · ${formatFleetElapsed(elapsed)} · ${formatFleetTokens(workflow.tokens)}`;
    return rightAlign(left, selected ? theme.fg("text", stats) : theme.fg("dim", stats), width);
  }
  renderAgentRow(rosterIndex, sel, record, width, theme) {
    const selected = rosterIndex === sel;
    const name = renderAgentName(record.type, theme, selected ? { fallbackColor: "text", bold: hasAgentBadge(record.type) } : { fallbackColor: "muted" });
    const description = selected ? theme.fg("text", record.description) : record.description;
    const left = `  ${this.bullet(rosterIndex, sel, theme)} ${name}  ${description}`;
    const tokens = getLifetimeTotal(record.lifetimeUsage);
    const elapsedMs = (record.completedAt ?? Date.now()) - record.startedAt;
    const cost = this.showCost() ? formatCost(getLifetimeCost(record.lifetimeUsage)) : "";
    const stats = `${formatFleetElapsed(elapsedMs)} · ${formatFleetTokens(tokens)}${cost ? ` · ${cost}` : ""}`;
    const right = selected ? theme.fg("text", stats) : theme.fg("dim", stats);
    return rightAlign(left, right, width);
  }
}
// dist/ui/select-item.js
async function selectItem(ui, title, items, format) {
  const width = String(items.length).length;
  const rows = items.map((item, i) => ({
    item,
    label: `${String(i + 1).padStart(width)}. ${format(item, i)}`
  }));
  const choice = await ui.select(title, rows.map((r) => r.label));
  if (!choice)
    return;
  return rows.find((r) => r.label === choice)?.item;
}

// dist/ui/schedule-menu.js
function relTime(iso, now = Date.now()) {
  if (!iso)
    return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t))
    return "—";
  const diff = t - now;
  const abs = Math.abs(diff);
  const future = diff > 0;
  if (abs < 60000)
    return future ? "in <1m" : "<1m ago";
  const m2 = Math.round(abs / 60000);
  if (m2 < 60)
    return future ? `in ${m2}m` : `${m2}m ago`;
  const h = Math.round(abs / 3600000);
  if (h < 24)
    return future ? `in ${h}h` : `${h}h ago`;
  const d = Math.round(abs / 86400000);
  return future ? `in ${d}d` : `${d}d ago`;
}
function statusIcon(j) {
  if (!j.enabled)
    return "✗";
  if (j.lastStatus === "error")
    return "!";
  if (j.lastStatus === "running")
    return "⋯";
  return "✓";
}
function formatJob(j, scheduler) {
  const next = scheduler.getNextRun(j.id);
  return [
    statusIcon(j),
    j.name.padEnd(18).slice(0, 18),
    j.schedule.padEnd(14).slice(0, 14),
    `[${j.subagent_type}]`,
    `next ${relTime(next)}`,
    `last ${relTime(j.lastRun)}`,
    `runs ${j.runCount}`
  ].join("  ");
}
function formatDetails(j, scheduler) {
  const next = scheduler.getNextRun(j.id) ?? "—";
  return [
    `name:      ${j.name}`,
    `schedule:  ${j.schedule} (${j.scheduleType})`,
    `agent:     ${j.subagent_type}`,
    `prompt:    ${j.prompt.slice(0, 200)}${j.prompt.length > 200 ? "…" : ""}`,
    `created:   ${j.createdAt}`,
    `last run:  ${j.lastRun ?? "—"} (${j.lastStatus ?? "—"})`,
    `next run:  ${next}`,
    `runs:      ${j.runCount}`
  ].join(`
`);
}
async function showSchedulesMenu(ctx, scheduler) {
  if (!scheduler.isActive()) {
    ctx.ui.notify("Scheduler is not active in this session.", "warning");
    return;
  }
  const jobs = scheduler.list();
  if (jobs.length === 0) {
    ctx.ui.notify("No scheduled jobs.", "info");
    return;
  }
  const job = await selectItem(ctx.ui, `Scheduled jobs (${jobs.length}) — select to cancel`, jobs, (j) => formatJob(j, scheduler));
  if (!job)
    return;
  const ok = await ctx.ui.confirm(`Cancel "${job.name}"?`, formatDetails(job, scheduler));
  if (!ok)
    return;
  try {
    scheduler.removeJob(job.id);
  } catch (err) {
    ctx.ui.notify(`Could not cancel "${job.name}": ${err instanceof Error ? err.message : String(err)}`, "warning");
    return;
  }
  ctx.ui.notify(`Cancelled "${job.name}".`, "info");
}

// dist/ui/workflow-card.js
import { stripTerminalSequences as stripTerminalSequences2, Text, truncateToWidth as truncateToWidth5, visibleWidth as visibleWidth4 } from "@earendil-works/pi-tui";

// dist/workflow/progress.js
var MAX_WORKFLOW_LOG_LINES = 2000;
var MAX_WORKFLOW_ERROR_TEXT = 16 * 1024;
var COMPACT_MIN_ENTRIES = 2 * MAX_WORKFLOW_LOG_LINES;
function tailText(text, max = MAX_WORKFLOW_ERROR_TEXT) {
  if (text.length <= max)
    return text;
  return `… (${text.length - max} earlier characters dropped)
${text.slice(text.length - max)}`;
}
function droppedMarker(count) {
  return { type: "workflow_log", message: `… ${count} earlier log line${count === 1 ? "" : "s"} dropped`, dropped: count };
}
function compactProgress(progress) {
  const seenAgents = new Set;
  const seenPhases = new Set;
  const kept = [];
  let logs = 0;
  let dropped = 0;
  for (let i = progress.length - 1;i >= 0; i--) {
    const entry = progress[i];
    if (entry.type === "workflow_agent") {
      if (seenAgents.has(entry.index))
        continue;
      seenAgents.add(entry.index);
    } else if (entry.type === "workflow_phase") {
      if (seenPhases.has(entry.index))
        continue;
      seenPhases.add(entry.index);
    } else if (entry.dropped !== undefined) {
      dropped += entry.dropped;
      continue;
    } else if (logs >= MAX_WORKFLOW_LOG_LINES) {
      dropped++;
      continue;
    } else {
      logs++;
    }
    kept.push(entry);
  }
  if (dropped > 0)
    kept.push(droppedMarker(dropped));
  kept.reverse();
  progress.length = 0;
  for (const entry of kept)
    progress.push(entry);
}
var compactedSize = new WeakMap;
function appendProgress(progress, entries) {
  for (const entry of entries)
    progress.push(entry);
  const floor = Math.max(COMPACT_MIN_ENTRIES, 2 * (compactedSize.get(progress) ?? 0));
  if (progress.length <= floor)
    return;
  compactProgress(progress);
  compactedSize.set(progress, progress.length);
}
function collapse(progress) {
  const agents2 = new Map;
  const logs = [];
  const phaseTitles = new Map;
  for (const entry of progress) {
    if (entry.type === "workflow_agent")
      agents2.set(entry.index, entry);
    else if (entry.type === "workflow_log")
      logs.push(entry.message);
    else
      phaseTitles.set(entry.index, entry.title);
  }
  return {
    agents: [...agents2.values()].sort((a, b2) => a.index - b2.index),
    logs,
    phaseTitles
  };
}
function displayState(entry, workflowActive) {
  if (entry.state === "done")
    return "done";
  if (entry.state === "error") {
    if (entry.skipped)
      return "skipped";
    if (entry.blocked)
      return "blocked";
    return "failed";
  }
  if (!workflowActive)
    return "interrupted";
  return entry.queuedAt != null && entry.startedAt == null ? "queued" : "running";
}
function isLive(entry) {
  return entry.state === "start" || entry.state === "progress";
}
function groupByPhase(agents2, phaseTitles) {
  if (!agents2.some((a) => a.phaseIndex != null))
    return null;
  const byPhase = new Map;
  for (const agent of agents2) {
    const phaseIndex = agent.phaseIndex ?? 0;
    let group = byPhase.get(phaseIndex);
    if (!group) {
      group = { phaseIndex, title: phaseTitles.get(phaseIndex) ?? `Phase ${phaseIndex}`, agents: [] };
      byPhase.set(phaseIndex, group);
    }
    group.agents.push(agent);
  }
  return [...byPhase.values()].sort((a, b2) => a.phaseIndex - b2.phaseIndex);
}
function summarize2(group) {
  let done = 0;
  let failed = 0;
  let tokens = 0;
  let minStart = Number.POSITIVE_INFINITY;
  let maxProgress = 0;
  for (const agent of group.agents) {
    if (agent.state === "done")
      done++;
    else if (agent.state === "error")
      failed++;
    if (agent.tokens)
      tokens += agent.tokens;
    if (agent.startedAt != null) {
      if (agent.startedAt < minStart)
        minStart = agent.startedAt;
      const last = agent.lastProgressAt ?? agent.startedAt;
      if (last > maxProgress)
        maxProgress = last;
    }
  }
  const total = group.agents.length;
  const finished = done + failed === total && total > 0;
  return {
    title: group.title,
    status: finished ? failed > 0 ? "failed" : "done" : "running",
    agents: group.agents,
    doneCount: done,
    totalCount: total,
    tokens,
    durationMs: minStart < Number.POSITIVE_INFINITY ? maxProgress - minStart : 0
  };
}
function placeholder(title) {
  return { title, status: "not-started", agents: [], doneCount: 0, totalCount: 0, tokens: 0, durationMs: 0 };
}
var normalizeTitle = (title) => title.toLowerCase().trim();
function mergePhases(declared, observed) {
  const consumed = new Set;
  const merged = [];
  for (const phase of declared ?? []) {
    const wanted = normalizeTitle(phase.title);
    const match = observed.find((group) => {
      if (consumed.has(group))
        return false;
      const actual = normalizeTitle(group.title);
      return actual === wanted || actual.startsWith(wanted) || wanted.startsWith(actual);
    });
    if (match) {
      consumed.add(match);
      merged.push(summarize2(match));
    } else {
      merged.push(placeholder(phase.title));
    }
  }
  for (const group of observed) {
    if (!consumed.has(group))
      merged.push(summarize2(group));
  }
  return merged;
}
function buildPhaseGroups(progress, declared) {
  const { agents: agents2, phaseTitles } = collapse(progress);
  const observed = groupByPhase(agents2, phaseTitles) ?? [];
  const merged = mergePhases(declared, observed);
  if (merged.length === 0 && agents2.length > 0) {
    return [summarize2({ title: "Agents", agents: agents2 })];
  }
  if (agents2.length > 0 && !merged.some((group) => group.totalCount > 0)) {
    return [...merged, summarize2({ title: "Agents", agents: agents2 })];
  }
  return merged;
}
function stats(progress, agentCount = 0) {
  let seen = 0;
  let done = 0;
  let failed = 0;
  let started = 0;
  let anyLive = false;
  for (const entry of progress) {
    if (entry.type !== "workflow_agent")
      continue;
    seen++;
    if (entry.state === "done") {
      done++;
      started++;
    } else if (entry.state === "error") {
      failed++;
      started++;
    } else {
      anyLive = true;
      if (entry.startedAt !== undefined || entry.queuedAt === undefined)
        started++;
    }
  }
  const total = Math.max(agentCount, seen);
  return {
    done,
    failedCount: failed,
    running: anyLive,
    total,
    started,
    complete: !anyLive && seen > 0 && done + failed >= total
  };
}
function elapsedMs(task, now) {
  return Math.max(0, (task.endTime ?? now) - task.startTime - (task.totalPausedMs ?? 0));
}
var plural = (n, word) => n === 1 ? word : `${word}s`;
function formatDuration3(ms) {
  if (ms < 1000)
    return `${Math.max(0, Math.round(ms))}ms`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0)
    return `${seconds}s`;
  return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}
function header(task, meta, groups, agentCount, now) {
  const suffix = task.status === "completed" ? " · done" : task.status === "killed" ? " · stopped" : task.status === "paused" ? " · paused" : task.status === "failed" ? " · failed" : "";
  let doneAgents = 0;
  let totalAgents = 0;
  for (const group of groups) {
    doneAgents += group.doneCount;
    totalAgents += group.totalCount;
  }
  totalAgents = Math.max(agentCount, totalAgents, doneAgents);
  return {
    name: task.workflowName ?? meta?.name ?? task.summary ?? task.description ?? "workflow",
    subtext: meta?.description ?? task.description ?? task.summary ?? "",
    stats: `${doneAgents}/${totalAgents} ${plural(totalAgents, "agent")} · ${formatDuration3(elapsedMs(task, now))}${suffix}`
  };
}
var DEFAULT_AGENT_CAP = 25;
var DEFAULT_TOKEN_CAP = 1500000;
var ASSUMED_TOKENS_PER_AGENT = 70000;
function sizeWarning(input) {
  const agentCap = input.agentCap ?? DEFAULT_AGENT_CAP;
  const tokenCap = input.tokenCap ?? DEFAULT_TOKEN_CAP;
  const perAgent = input.startedAgents > 0 ? input.totalTokens / input.startedAgents : ASSUMED_TOKENS_PER_AGENT;
  const projectedTokens = Math.max(input.totalTokens, Math.round(perAgent * input.scheduledAgents));
  const overAgents = input.scheduledAgents > agentCap;
  const overTokens = input.totalTokens > tokenCap || projectedTokens > tokenCap;
  if (!overAgents && !overTokens)
    return;
  return {
    axis: overAgents && overTokens ? "both" : overAgents ? "agents" : "tokens",
    scheduledAgents: input.scheduledAgents,
    totalTokens: input.totalTokens,
    projectedTokens,
    agentCap,
    tokenCap
  };
}
var GERUND_OVERRIDES = new Map([
  ["commit", "committing"],
  ["submit", "submitting"],
  ["format", "formatting"],
  ["setup", null],
  ["cleanup", null]
]);

// dist/ui/workflow-card.js
init_terminal_text();
var LABEL_COLUMN_MAX = 28;
var DEFAULT_WIDTH = 80;
var UNICODE_GLYPHS = {
  pointer: "▸",
  tick: "✔",
  cross: "✘",
  running: "⟳",
  groupTop: "╭─",
  groupMid: "├─",
  groupBottom: "╰─",
  vertical: "│",
  branch: "├─",
  lastBranch: "└─",
  log: "⎿",
  warning: "⚠"
};
var ASCII_GLYPHS = {
  pointer: ">",
  tick: "√",
  cross: "×",
  running: "*",
  groupTop: ",-",
  groupMid: "|-",
  groupBottom: "`-",
  vertical: "|",
  branch: "|-",
  lastBranch: "`-",
  log: "\\",
  warning: "!"
};
function formatCompactTokens(count) {
  if (count >= 1e6)
    return `${(count / 1e6).toFixed(1)}M`;
  if (count >= 1000)
    return `${(count / 1000).toFixed(1)}k`;
  return `${count}`;
}
function formatModel(entry, opts) {
  const { fallbackModel, requestedModel } = entry;
  const model = opts?.canonical ? entry.modelId ?? entry.model : entry.model;
  const primary = model && fallbackModel && model !== fallbackModel ? `${model}→${fallbackModel}` : model ?? fallbackModel;
  if (primary === undefined)
    return;
  return requestedModel !== undefined && requestedModel !== primary ? `${primary} (asked ${requestedModel})` : primary;
}
function formatThinking(entry) {
  const { thinking, requestedThinking } = entry;
  if (!thinking)
    return;
  return requestedThinking !== undefined && requestedThinking !== thinking ? `thinking: ${thinking} (asked ${requestedThinking})` : `thinking: ${thinking}`;
}
var REPLAYED_ANNOTATION = "from resume journal";
function agentStatSegments(entry) {
  const parts = [];
  if (entry.agentType)
    parts.push(entry.agentType);
  const model = formatModel(entry);
  if (model)
    parts.push(model);
  if (entry.tokens)
    parts.push(formatCompactTokens(entry.tokens));
  if (entry.toolCalls)
    parts.push(`${entry.toolCalls} tool call${entry.toolCalls === 1 ? "" : "s"}`);
  if (entry.durationMs)
    parts.push(formatDuration3(entry.durationMs));
  return parts;
}
function rowGlyph(entry, glyphs) {
  if (entry.state === "done")
    return { text: glyphs.tick, color: "success" };
  if (entry.state === "error")
    return { text: glyphs.cross, color: "error" };
  return { text: glyphs.running };
}
function clampLine(line, width) {
  const clamped = [];
  let used = 0;
  for (const raw of line) {
    const text = sanitizeTerminalText(raw.text);
    const segment = text === raw.text ? raw : { ...raw, text };
    const segmentWidth = visibleWidth4(segment.text);
    if (used + segmentWidth <= width) {
      clamped.push(segment);
      used += segmentWidth;
      continue;
    }
    const room = width - used;
    if (room > 0) {
      clamped.push({ ...segment, text: stripTerminalSequences2(truncateToWidth5(segment.text, room, "…")) });
    }
    return clamped;
  }
  return clamped;
}
var lineWidth = (line) => line.reduce((sum, s2) => sum + visibleWidth4(s2.text), 0);
var CARD_LOG_LINES = 20;
function layoutWorkflowCard(input) {
  const glyphs = input.ascii ? ASCII_GLYPHS : UNICODE_GLYPHS;
  const width = Math.max(1, input.width ?? DEFAULT_WIDTH);
  const now = input.now ?? Date.now();
  const groups = buildPhaseGroups(input.progress, input.meta?.phases);
  const { agents: agents2, logs } = collapse(input.progress);
  const totals = stats(input.progress, input.agentCount ?? 0);
  const head = header(input.task, input.meta, groups, input.agentCount ?? 0, now);
  const lines = [];
  const left = input.showToolTitle ? [
    { text: `${glyphs.pointer} `, color: "toolTitle" },
    { text: "SubagentWorkflow", color: "toolTitle", bold: true },
    { text: "  " },
    { text: head.name, color: "muted" }
  ] : [{ text: "  " }, { text: head.name, color: "toolTitle", bold: true }];
  const statsWidth = visibleWidth4(head.stats);
  const clampedLeft = clampLine(left, Math.max(0, width - statsWidth - 1));
  const gap = Math.max(1, width - lineWidth(clampedLeft) - statsWidth);
  lines.push([...clampedLeft, { text: " ".repeat(gap) }, { text: head.stats, color: "dim" }]);
  if (head.subtext)
    lines.push(clampLine([{ text: `  ${head.subtext}`, color: "dim" }], width));
  const labelColumn = Math.min(LABEL_COLUMN_MAX, Math.max(0, ...groups.flatMap((group) => group.agents.map((a) => visibleWidth4(a.label)))));
  groups.forEach((group, groupIndex) => {
    const lastGroup = groupIndex === groups.length - 1;
    lines.push(clampLine([
      { text: "  " },
      {
        text: `${lastGroup ? glyphs.groupBottom : groupIndex === 0 ? glyphs.groupTop : glyphs.groupMid} `,
        color: "dim"
      },
      { text: group.title }
    ], width));
    const rail = lastGroup ? "  " : `${glyphs.vertical} `;
    group.agents.forEach((entry, agentIndex) => {
      const lastAgent = agentIndex === group.agents.length - 1;
      const segments = [
        { text: "  " },
        { text: rail, color: "dim" },
        { text: `${lastAgent ? glyphs.lastBranch : glyphs.branch} `, color: "dim" },
        rowGlyph(entry, glyphs),
        { text: " " }
      ];
      const statParts = entry.cached ? [REPLAYED_ANNOTATION, ...agentStatSegments(entry)] : agentStatSegments(entry);
      const pad = Math.max(0, labelColumn - visibleWidth4(entry.label));
      segments.push({ text: statParts.length > 0 ? entry.label + " ".repeat(pad) : entry.label });
      for (const part of statParts) {
        segments.push({ text: " · ", color: "dim" }, { text: part, color: "dim" });
      }
      lines.push(clampLine(segments, width));
    });
  });
  const hiddenLogs = Math.max(0, logs.length - CARD_LOG_LINES);
  if (hiddenLogs > 0) {
    lines.push(clampLine([{ text: `  ${glyphs.log}  … ${hiddenLogs} earlier log line${hiddenLogs === 1 ? "" : "s"}`, color: "dim" }], width));
  }
  for (const message of hiddenLogs > 0 ? logs.slice(hiddenLogs) : logs) {
    const [first, ...rest] = message.split(`
`);
    lines.push(clampLine([{ text: `  ${glyphs.log}  ${first}`, color: "dim" }], width));
    for (const continuation of rest) {
      lines.push(clampLine([{ text: `     ${continuation}`, color: "dim" }], width));
    }
  }
  const totalTokens = input.totalTokens ?? agents2.reduce((sum, entry) => sum + (entry.tokens ?? 0), 0);
  const warning = sizeWarning({
    scheduledAgents: Math.max(input.agentCount ?? 0, totals.total),
    startedAgents: totals.started,
    totalTokens,
    agentCap: input.agentCap,
    tokenCap: input.tokenCap
  });
  if (warning) {
    lines.push(clampLine([{ text: `  ${glyphs.warning} Large workflow · /agents → Workflows to stop`, color: "warning" }], width));
  }
  return lines;
}
function styleWorkflowCardLines(lines, theme) {
  return lines.map((line) => line.map((segment) => {
    const text = segment.bold ? theme.bold(segment.text) : segment.text;
    return segment.color ? theme.fg(segment.color, text) : text;
  }).join(""));
}
function renderWorkflowCard(input, theme) {
  return new Text(styleWorkflowCardLines(layoutWorkflowCard(input), theme).join(`
`), 0, 0);
}
function renderWorkflowEntryCard(data, theme) {
  if (!data)
    return;
  return renderWorkflowCard({
    progress: data.progress,
    task: {
      status: data.status,
      workflowName: data.name,
      startTime: data.startTime,
      endTime: data.endTime
    },
    meta: data.meta,
    agentCount: data.agentCount,
    totalTokens: data.totalTokens,
    showToolTitle: true
  }, theme);
}

// dist/workflow/task.js
import { randomUUID as randomUUID2 } from "node:crypto";

// dist/xml.js
function escapeXml(s2) {
  return s2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// dist/workflow/task.js
var MAX_SETTLED_WORKFLOW_TASKS = 50;
function pruneSettledWorkflowTasks(tasks, max = MAX_SETTLED_WORKFLOW_TASKS) {
  let settled = 0;
  for (const task of tasks.values())
    if (task.status !== "running" && task.status !== "paused")
      settled++;
  for (const [id, task] of tasks) {
    if (settled <= max)
      return;
    if (task.status === "running" || task.status === "paused")
      continue;
    tasks.delete(id);
    settled--;
  }
}
function workflowRunId() {
  return `wf_${randomUUID2().replace(/-/g, "").slice(0, 12)}`;
}
var WORKFLOW_RUN_ID = /^wf_[0-9a-f]{12}$/;
function createWorkflowTask(init) {
  return {
    type: "local_workflow",
    id: init.id,
    status: "running",
    script: init.script,
    scriptPath: init.scriptPath,
    args: init.args,
    meta: init.meta,
    workflowName: init.meta?.name,
    toolCallId: init.toolCallId,
    journalPath: init.journalPath,
    replay: init.replay,
    resumedFrom: init.resumedFrom,
    replayedCount: 0,
    workflowProgress: [],
    progressVersion: 0,
    agentCount: 0,
    doneCount: 0,
    totalTokens: 0,
    totalToolCalls: 0,
    logs: [],
    abortController: new AbortController,
    startTime: init.startTime ?? Date.now(),
    totalPausedMs: 0
  };
}
function updateWorkflowProgressBatch(task, entries) {
  if (entries.length === 0)
    return;
  appendProgress(task.workflowProgress, entries);
  task.progressVersion++;
  const { agents: agents2, logs } = collapse(task.workflowProgress);
  task.logs = logs;
  task.agentCount = Math.max(task.agentCount, agents2.length);
  let totalTokens = 0;
  let totalToolCalls = 0;
  let done = 0;
  for (const agent of agents2) {
    totalTokens += agent.tokens ?? 0;
    totalToolCalls += agent.toolCalls ?? 0;
    if (agent.state === "done")
      done++;
  }
  task.totalTokens = totalTokens;
  task.totalToolCalls = totalToolCalls;
  task.doneCount = done;
}
function pauseWorkflowTask(task, now = Date.now()) {
  if (task.status !== "running" || task.control === undefined)
    return false;
  task.control.pause();
  task.status = "paused";
  task.pausedAt = now;
  return true;
}
function resumeWorkflowTask(task, now = Date.now()) {
  if (task.status !== "paused" || task.control === undefined)
    return false;
  task.control.resume();
  task.status = "running";
  task.totalPausedMs = (task.totalPausedMs ?? 0) + Math.max(0, now - (task.pausedAt ?? now));
  task.pausedAt = undefined;
  return true;
}
function completeWorkflowTask(task, result) {
  if (task.pausedAt !== undefined) {
    task.totalPausedMs = (task.totalPausedMs ?? 0) + Math.max(0, Date.now() - task.pausedAt);
    task.pausedAt = undefined;
  }
  task.control = undefined;
  task.status = result.status;
  task.meta ??= result.meta;
  task.workflowName ??= result.meta.name;
  task.agentCount = Math.max(task.agentCount, result.agentCount);
  task.replayedCount = result.replayedCount;
  task.value = result.value;
  task.error = result.error;
  task.endTime = Date.now();
}
function failWorkflowTask(task, error) {
  task.control = undefined;
  task.pausedAt = undefined;
  task.status = "failed";
  task.error = error;
  task.endTime = Date.now();
}
function workflowResultText(task) {
  if (task.error !== undefined)
    return task.error;
  if (task.value === undefined)
    return "No output.";
  if (typeof task.value === "string")
    return task.value;
  return JSON.stringify(task.value, null, 2);
}
function resolveResumeTarget(runId, tasks, persisted) {
  const id = runId?.trim();
  if (id === undefined || id === "")
    return;
  const prior = tasks.get(id);
  const onDisk = prior === undefined && WORKFLOW_RUN_ID.test(id) ? persisted?.(id) : undefined;
  if (onDisk !== undefined) {
    return { ok: true, runId: id, journalPath: onDisk.journalPath, scriptPath: onDisk.scriptPath ?? "" };
  }
  if (prior === undefined) {
    const known = [...tasks.keys()];
    return {
      ok: false,
      message: `No workflow run "${id}" in this session. ` + (known.length > 0 ? `Runs this session: ${known.join(", ")}.` : "Nothing has run yet — call this without `resumeFromRunId`.")
    };
  }
  if (prior.status === "running" || prior.status === "paused") {
    return {
      ok: false,
      message: `Workflow "${id}" is still ${prior.status}. Stop it from /agents → Workflows before resuming it.`
    };
  }
  if (prior.journalPath === undefined) {
    return { ok: false, message: `Workflow "${id}" has no journal to resume from.` };
  }
  return {
    ok: true,
    runId: id,
    journalPath: prior.journalPath,
    scriptPath: prior.scriptPath ?? ""
  };
}
function formatWorkflowNotification(task, now = Date.now()) {
  const totals = stats(task.workflowProgress, task.agentCount);
  const status = task.status === "completed" ? "Done" : task.status === "killed" ? "Stopped" : `Error: ${task.error ?? "unknown"}`;
  const result = workflowResultText(task);
  const worktrees = collapse(task.workflowProgress).agents.filter((agent) => agent.branch !== undefined || agent.worktreePath !== undefined).map((agent) => [
    `${agent.label}:`,
    agent.branch !== undefined ? `branch ${agent.branch}` : undefined,
    agent.worktreePath !== undefined ? `worktree kept at ${agent.worktreePath}` : undefined
  ].filter(Boolean).join(" "));
  return [
    `<task-notification>`,
    `<task-id>${task.id}</task-id>`,
    task.toolCallId ? `<tool-use-id>${escapeXml(task.toolCallId)}</tool-use-id>` : null,
    task.scriptPath ? `<script>${escapeXml(task.scriptPath)}</script>` : null,
    `<status>${escapeXml(status)}</status>`,
    `<summary>Workflow "${escapeXml(task.workflowName ?? task.id)}" ${task.status} — ${totals.done}/${totals.total} agents${task.replayedCount > 0 ? `, ${task.replayedCount} replayed from ${escapeXml(task.resumedFrom ?? "an earlier run")}` : ""}</summary>`,
    `<result>${escapeXml(result.length > 4000 ? `${result.slice(0, 4000)}
...(truncated)` : result)}</result>`,
    worktrees.length > 0 ? `<worktrees>
${escapeXml(worktrees.join(`
`))}
</worktrees>` : null,
    `<usage><total_tokens>${task.totalTokens}</total_tokens><tool_uses>${task.totalToolCalls}</tool_uses><duration_ms>${elapsedMs(task, now)}</duration_ms></usage>`,
    `</task-notification>`
  ].filter(Boolean).join(`
`);
}

// dist/ui/workflow-dialog.js
import { matchesKey as matchesKey4, stripTerminalSequences as stripTerminalSequences3, truncateToWidth as truncateToWidth6, visibleWidth as visibleWidth5, wrapTextWithAnsi as wrapTextWithAnsi2 } from "@earendil-works/pi-tui";
init_agent_widget();
init_terminal_text();
var DEFAULT_WIDTH2 = 80;
var LEFT_PANE_WIDTH = 18;
var DEFAULT_PANE_BODY_ROWS = 22;
var MIN_PANE_BODY_ROWS = 6;
var PROMPT_COLLAPSED_LINES = 4;
var WORKFLOW_DIALOG_SPINNER_MS = 80;
var UNICODE_DIALOG_GLYPHS = {
  tick: UNICODE_GLYPHS.tick,
  cross: UNICODE_GLYPHS.cross,
  queued: "◌",
  pointer: "❯",
  focus: UNICODE_GLYPHS.pointer,
  spinner: SPINNER,
  box: {
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    horizontal: "─",
    vertical: "│",
    topTee: "┬",
    bottomTee: "┴"
  },
  ellipsis: "…",
  upDown: "↑↓",
  enter: "⏎"
};
var ASCII_DIALOG_GLYPHS = {
  tick: ASCII_GLYPHS.tick,
  cross: ASCII_GLYPHS.cross,
  queued: "o",
  pointer: ">",
  focus: ASCII_GLYPHS.pointer,
  spinner: ["-", "\\", "|", "/"],
  box: {
    topLeft: "+",
    topRight: "+",
    bottomLeft: "+",
    bottomRight: "+",
    horizontal: "-",
    vertical: "|",
    topTee: "+",
    bottomTee: "+"
  },
  ellipsis: "~",
  upDown: "up/down",
  enter: "enter"
};
function dialogRowGlyph(state, glyphs, spinnerFrame = 0) {
  switch (state) {
    case "done":
      return { text: glyphs.tick, color: "success" };
    case "failed":
      return { text: glyphs.cross, color: "error" };
    case "skipped":
      return { text: glyphs.cross, color: "dim" };
    case "blocked":
      return { text: glyphs.cross, color: "warning" };
    case "queued":
    case "interrupted":
      return { text: glyphs.queued, color: "dim" };
    case "running":
      return { text: glyphs.spinner[spinnerFrame % glyphs.spinner.length], color: "dim" };
  }
}
var WORKFLOW_DIALOG_COPY = {
  waitingForSlot: "Waiting for an agent slot.",
  availableOnceStarted: "Available once the agent starts.",
  notAvailableYet: "Not available yet (agent still running).",
  noTranscript: "Transcript not available.",
  stoppedEarly: "The workflow stopped before this agent finished.",
  skippedByUser: "Skipped by user.",
  noToolCallsYet: "No tool calls yet.",
  noToolCalls: "No tool calls.",
  noAgents: "No agents"
};
var WORKFLOW_DIALOG_FILTERS = [
  "all",
  "running",
  "queued",
  "done",
  "failed",
  "blocked",
  "skipped",
  "interrupted"
];
function initialWorkflowDialogState(initialPhaseIndex = 0) {
  return {
    selectedPhase: initialPhaseIndex,
    selectedAgent: 0,
    level: "phases",
    filter: "all",
    promptExpanded: false
  };
}
function workflowDialogContentWidth(terminalWidth) {
  return Math.max(12, terminalWidth - 6);
}
var clampIndex = (index, length) => length === 0 ? 0 : Math.min(Math.max(0, Math.trunc(index)), length - 1);
function resolveWorkflowDialog(input) {
  const groups = buildPhaseGroups(input.progress, input.meta?.phases);
  const workflowActive = input.task.status === "running" || input.task.status === "paused";
  const clampedPhase = clampIndex(input.state.selectedPhase, groups.length);
  const all = groups[clampedPhase]?.agents ?? [];
  const visibleAgents = input.state.filter === "all" ? [...all] : all.filter((entry) => displayState(entry, workflowActive) === input.state.filter);
  const clampedAgent = clampIndex(input.state.selectedAgent, visibleAgents.length);
  return {
    groups,
    clampedPhase,
    clampedAgent,
    visibleAgents,
    selectedEntry: visibleAgents[clampedAgent],
    workflowActive,
    paused: input.task.status === "paused"
  };
}
function subStatusAnnotations(entry, state, now) {
  const parts = [];
  if (entry.isolation)
    parts.push(entry.isolation);
  if (entry.cached)
    parts.push(REPLAYED_ANNOTATION);
  if (entry.lastAttemptReason) {
    parts.push(entry.lastAttemptReason === "user-retry" ? "user retry" : entry.lastAttemptReason);
  }
  if (entry.attempt != null && entry.attempt > 1)
    parts.push(`attempt ${entry.attempt}`);
  if (state === "queued" && entry.queuedAt != null) {
    parts.push(`waiting ${formatDuration3(Math.max(0, now - entry.queuedAt))}`);
  }
  return parts;
}
var lineWidth2 = (line) => line.reduce((sum, s2) => sum + visibleWidth5(s2.text), 0);
function rightAlign2(left, right, width) {
  const rightWidth = lineWidth2(right);
  const clampedLeft = clampLine(left, Math.max(0, width - rightWidth - 1));
  const gap = Math.max(1, width - lineWidth2(clampedLeft) - rightWidth);
  return clampLine([...clampedLeft, { text: " ".repeat(gap) }, ...right], width);
}
function windowRange(selected, total, max) {
  const visible = Math.min(max, total);
  const start = selected < visible ? 0 : selected - visible + 1;
  return { start, end: start + visible };
}
function leftPaneWidth(width) {
  const available = Math.max(2, width - 3);
  return Math.max(1, Math.min(LEFT_PANE_WIDTH, Math.floor(available / 3), available - 1));
}
function padTitle(line, width, horizontal) {
  const gap = Math.max(0, width - lineWidth2(line));
  return gap > 0 ? [...line, { text: horizontal.repeat(gap), color: "dim" }] : line;
}
function padCell(line, width) {
  const clamped = clampLine(line, width);
  const gap = Math.max(0, width - lineWidth2(clamped));
  return gap > 0 ? [...clamped, { text: " ".repeat(gap) }] : clamped;
}
function frameTitle(title, width, glyphs) {
  const room = Math.max(0, width - 2);
  const shown = stripTerminalSequences3(truncateToWidth6(title, room, glyphs.ellipsis));
  const rule = Math.max(0, width - visibleWidth5(shown) - 2);
  return clampLine([
    { text: " ", color: "dim" },
    { text: shown, color: "muted", bold: true },
    { text: ` ${glyphs.box.horizontal.repeat(rule)}`, color: "dim" }
  ], width);
}
function paneFrame(options) {
  const { glyphs, width } = options;
  const box = glyphs.box;
  const left = leftPaneWidth(width);
  const right = Math.max(1, width - left - 3);
  const lines = [];
  lines.push([
    { text: box.topLeft, color: "dim" },
    ...padTitle(frameTitle(options.leftTitle, left, glyphs), left, box.horizontal),
    { text: box.topTee, color: "dim" },
    ...padTitle(frameTitle(options.rightTitle, right, glyphs), right, box.horizontal),
    { text: box.topRight, color: "dim" }
  ]);
  for (let row = 0;row < options.bodyRows; row++) {
    lines.push([
      { text: box.vertical, color: "dim" },
      ...padCell(options.leftRows[row] ?? [], left),
      { text: box.vertical, color: "dim" },
      ...padCell(options.rightRows[row] ?? [], right),
      { text: box.vertical, color: "dim" }
    ]);
  }
  lines.push([
    { text: box.bottomLeft, color: "dim" },
    { text: box.horizontal.repeat(left), color: "dim" },
    { text: box.bottomTee, color: "dim" },
    { text: box.horizontal.repeat(right), color: "dim" },
    { text: box.bottomRight, color: "dim" }
  ]);
  return lines;
}
var previewLines = (preview) => preview ? preview.split(`
`) : [];
function activityBody(entry, state) {
  if (state === "queued")
    return WORKFLOW_DIALOG_COPY.availableOnceStarted;
  if ((entry.toolCalls ?? 0) > 0)
    return WORKFLOW_DIALOG_COPY.noTranscript;
  return isLive(entry) ? WORKFLOW_DIALOG_COPY.noToolCallsYet : WORKFLOW_DIALOG_COPY.noToolCalls;
}
function outcomeBody(entry, state) {
  switch (state) {
    case "skipped":
      return WORKFLOW_DIALOG_COPY.skippedByUser;
    case "interrupted":
      return WORKFLOW_DIALOG_COPY.stoppedEarly;
    case "queued":
      return WORKFLOW_DIALOG_COPY.waitingForSlot;
    case "running":
      return WORKFLOW_DIALOG_COPY.notAvailableYet;
    case "failed":
    case "blocked":
      return entry.error ?? WORKFLOW_DIALOG_COPY.noTranscript;
    case "done":
      return entry.resultPreview ?? WORKFLOW_DIALOG_COPY.noTranscript;
  }
}
function agentActions(entry, workflowActive) {
  if (entry === undefined || !workflowActive)
    return { skip: false, retry: false };
  const state = displayState(entry, workflowActive);
  return { skip: state === "queued" || state === "running", retry: state === "running" };
}
function statusWord(state) {
  switch (state) {
    case "done":
      return "Completed";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    case "blocked":
      return "Blocked";
    case "queued":
      return "Queued";
    case "interrupted":
      return "Stopped";
    case "running":
      return "Running";
  }
}
function detailHeading(title, suffixes, width) {
  const line = [{ text: " " }, { text: title, color: "muted", bold: true }];
  for (const suffix of suffixes) {
    line.push({ text: " · ", color: "dim" }, { text: suffix, color: "dim" });
  }
  return clampLine(line, width);
}
var detailBody = (text, width) => clampLine([{ text: `   ${text}`, color: "dim" }], width);
function agentRow(options) {
  const { entry, selected, glyphs, width } = options;
  const display = displayState(entry, options.workflowActive);
  const head = [
    { text: " " },
    { text: selected ? glyphs.pointer : " ", color: "accent" },
    { text: " " },
    dialogRowGlyph(display, glyphs, options.spinnerFrame),
    { text: " " },
    { text: entry.label, color: selected ? "accent" : undefined }
  ];
  if (options.compact)
    return clampLine(head, width);
  const model = formatModel(entry);
  if (model)
    head.push({ text: ` ${model}`, color: "dim" });
  for (const part of [...subStatusAnnotations(entry, display, options.now), ...rowStatSegments(entry)]) {
    head.push({ text: " · ", color: "dim" }, { text: part, color: "dim" });
  }
  const duration = entry.durationMs ? [{ text: `${formatDuration3(entry.durationMs)} `, color: "dim" }] : [];
  return duration.length > 0 ? rightAlign2(head, duration, width) : clampLine(head, width);
}
function rowStatSegments(entry) {
  return entry.tokens ? [`${formatCompactTokens(entry.tokens)} tok`] : [];
}
function layoutWorkflowDialog(input) {
  const glyphs = input.ascii ? ASCII_DIALOG_GLYPHS : UNICODE_DIALOG_GLYPHS;
  const width = workflowDialogContentWidth(input.width ?? DEFAULT_WIDTH2);
  const now = input.now ?? Date.now();
  const view = resolveWorkflowDialog(input);
  const { state } = input;
  const capacity = Math.max(MIN_PANE_BODY_ROWS, input.bodyRows ?? DEFAULT_PANE_BODY_ROWS);
  const spinnerFrame = input.spinnerFrame ?? 0;
  const lines = [];
  const head = header(input.task, input.meta, view.groups, input.agentCount ?? 0, now);
  lines.push(clampLine([{ text: " " }, { text: head.name, color: "toolTitle", bold: true }], width));
  lines.push(rightAlign2(head.subtext ? [{ text: " " }, { text: head.subtext, color: "dim" }] : [], [{ text: head.stats, color: "dim" }], width));
  lines.push([]);
  const frameWidth = width - 1;
  const leftWidth = leftPaneWidth(frameWidth);
  const rightWidth = Math.max(1, frameWidth - leftWidth - 3);
  const inPhases = state.level === "phases";
  const entry = view.selectedEntry;
  const phaseRows = [];
  const digits = String(view.groups.length).length;
  const phases = windowRange(view.clampedPhase, view.groups.length, capacity);
  for (let i = phases.start;i < Math.min(phases.end, view.groups.length); i++) {
    const group = view.groups[i];
    const selected = i === view.clampedPhase;
    const color = selected ? "accent" : group.status === "done" ? "success" : group.status === "failed" ? "error" : "dim";
    const glyph = group.status === "done" ? glyphs.tick : group.status === "failed" ? glyphs.cross : String(i + 1);
    phaseRows.push(rightAlign2([
      { text: " " },
      { text: selected ? glyphs.pointer : " ", color: "accent" },
      { text: " " },
      { text: glyph.padStart(digits), color },
      { text: " " },
      { text: group.title, color }
    ], group.totalCount === 0 ? [] : [{ text: `${group.doneCount}/${group.totalCount} `, color }], leftWidth));
  }
  const agentPaneWidth = inPhases ? rightWidth : leftWidth;
  const agentRows = [];
  if (view.visibleAgents.length === 0) {
    agentRows.push(clampLine([{ text: `   ${WORKFLOW_DIALOG_COPY.noAgents}`, color: "dim" }], agentPaneWidth));
  } else {
    const agents2 = windowRange(view.clampedAgent, view.visibleAgents.length, capacity);
    for (let i = agents2.start;i < Math.min(agents2.end, view.visibleAgents.length); i++) {
      agentRows.push(agentRow({
        entry: view.visibleAgents[i],
        selected: i === view.clampedAgent,
        compact: !inPhases,
        width: agentPaneWidth,
        glyphs,
        workflowActive: view.workflowActive,
        spinnerFrame,
        now
      }));
    }
  }
  const detailRows = [];
  if (!inPhases && entry) {
    const display = displayState(entry, view.workflowActive);
    const model = formatModel(entry, { canonical: true });
    detailRows.push(clampLine([
      { text: " " },
      dialogRowGlyph(display, glyphs, spinnerFrame),
      { text: ` ${statusWord(display)}`, color: "muted" },
      ...model ? [{ text: " · ", color: "dim" }, { text: model, color: "dim" }] : []
    ], rightWidth));
    const stats2 = [];
    const thinking = formatThinking(entry);
    if (thinking)
      stats2.push(thinking);
    if (entry.tokens)
      stats2.push(`${formatCompactTokens(entry.tokens)} tok`);
    if (entry.toolCalls)
      stats2.push(`${entry.toolCalls} tool call${entry.toolCalls === 1 ? "" : "s"}`);
    if (entry.durationMs)
      stats2.push(formatDuration3(entry.durationMs));
    if (stats2.length > 0) {
      detailRows.push(clampLine([{ text: ` ${stats2.join(" · ")}`, color: "dim" }], rightWidth));
    }
    const prompt = previewLines(entry.promptPreview);
    const collapsed = !state.promptExpanded && prompt.length > PROMPT_COLLAPSED_LINES;
    const promptSuffix = [];
    if (prompt.length > 0)
      promptSuffix.push(`${prompt.length} ${prompt.length === 1 ? "line" : "lines"}`);
    if (prompt.length > PROMPT_COLLAPSED_LINES) {
      promptSuffix.push(`${glyphs.enter} ${state.promptExpanded ? "collapse" : "expand"}`);
    }
    detailRows.push([]);
    detailRows.push(detailHeading("Prompt", promptSuffix, rightWidth));
    if (prompt.length === 0) {
      detailRows.push(detailBody(WORKFLOW_DIALOG_COPY.availableOnceStarted, rightWidth));
    } else {
      const shown2 = collapsed ? prompt.slice(0, PROMPT_COLLAPSED_LINES) : prompt;
      for (const text of shown2)
        detailRows.push(detailBody(text, rightWidth));
      if (collapsed) {
        const hidden = prompt.length - PROMPT_COLLAPSED_LINES;
        detailRows.push(detailBody(`${glyphs.ellipsis} ${hidden} more line${hidden === 1 ? "" : "s"}`, rightWidth));
      }
    }
    const toolCalls = entry.toolCalls ?? 0;
    detailRows.push([]);
    detailRows.push(detailHeading("Activity", toolCalls > 0 ? [`${toolCalls} tool call${toolCalls === 1 ? "" : "s"}`] : [], rightWidth));
    detailRows.push(detailBody(activityBody(entry, display), rightWidth));
    detailRows.push([]);
    detailRows.push(detailHeading("Outcome", [], rightWidth));
    for (const text of wrapTextWithAnsi2(sanitizeTerminalText(outcomeBody(entry, display)), Math.max(1, rightWidth - 4))) {
      detailRows.push(detailBody(text, rightWidth));
    }
  }
  const phaseTitle = view.groups[view.clampedPhase]?.title ?? "Phases";
  const shown = view.visibleAgents.length;
  const agentPaneTitle = state.filter === "all" ? `${phaseTitle} · ${shown} agent${shown === 1 ? "" : "s"}` : `${phaseTitle} · ${shown} ${state.filter}`;
  const leftRows = inPhases ? phaseRows : agentRows;
  const rightRows = inPhases ? agentRows : detailRows;
  lines.push(...paneFrame({
    leftTitle: inPhases ? "Phases" : agentPaneTitle,
    rightTitle: inPhases ? agentPaneTitle : entry?.label ?? WORKFLOW_DIALOG_COPY.noAgents,
    leftRows,
    rightRows,
    width: width - 1,
    bodyRows: Math.min(capacity, Math.max(MIN_PANE_BODY_ROWS, leftRows.length, rightRows.length)),
    glyphs
  }).map((line) => [{ text: " " }, ...line]));
  const can = (action) => input.available?.[action] ?? true;
  const hints = [];
  if (inPhases) {
    hints.push(`${glyphs.upDown} select`);
    if (view.visibleAgents.length > 0)
      hints.push(`${glyphs.enter} open`);
    hints.push("f filter");
  } else {
    hints.push(`${glyphs.upDown} agent`);
    if (previewLines(entry?.promptPreview).length > PROMPT_COLLAPSED_LINES) {
      hints.push(`${glyphs.enter} prompt`);
    }
    const actions = agentActions(entry, view.workflowActive);
    if (actions.skip && can("onSkipAgent"))
      hints.push("s skip");
    if (actions.retry && can("onRetryAgent"))
      hints.push("r retry");
  }
  if (view.paused && can("onResume"))
    hints.push("p resume");
  else if (view.workflowActive && can("onPause"))
    hints.push("p pause");
  if (view.workflowActive && can("onKill"))
    hints.push("x stop");
  hints.push(inPhases ? "esc close" : "esc back");
  if (view.selectedEntry?.recordId !== undefined && can("onOpenAgent")) {
    hints.push("c convo");
  }
  lines.push(clampLine([{ text: ` ${hints.join(" · ")}`, color: "dim" }], width));
  return lines;
}
var nextFilter = (filter) => WORKFLOW_DIALOG_FILTERS[(WORKFLOW_DIALOG_FILTERS.indexOf(filter) + 1) % WORKFLOW_DIALOG_FILTERS.length];
function handleWorkflowDialogKey(data, state, view) {
  if (matchesKey4(data, "ctrl+c"))
    return { state, action: { kind: "cancel" } };
  if (matchesKey4(data, "escape") || matchesKey4(data, "q")) {
    if (state.level === "agent")
      return { state: { ...state, level: "phases", promptExpanded: false } };
    return { state, action: { kind: "cancel" } };
  }
  if (matchesKey4(data, "left") && state.level === "agent") {
    return { state: { ...state, level: "phases", promptExpanded: false } };
  }
  const down = matchesKey4(data, "j") || matchesKey4(data, "down");
  const up = matchesKey4(data, "k") || matchesKey4(data, "up");
  if (down || up) {
    const delta = down ? 1 : -1;
    if (state.level === "phases") {
      const next = clampIndex(view.clampedPhase + delta, view.groups.length);
      return { state: next === view.clampedPhase ? state : { ...state, selectedPhase: next, selectedAgent: 0 } };
    }
    return { state: { ...state, selectedAgent: clampIndex(view.clampedAgent + delta, view.visibleAgents.length) } };
  }
  if (matchesKey4(data, "enter") || matchesKey4(data, "right")) {
    if (state.level === "phases") {
      if (view.visibleAgents.length === 0)
        return { state };
      return { state: { ...state, level: "agent", promptExpanded: false } };
    }
    return { state: { ...state, promptExpanded: !state.promptExpanded } };
  }
  if (matchesKey4(data, "e")) {
    return { state: { ...state, promptExpanded: !state.promptExpanded } };
  }
  if (matchesKey4(data, "c")) {
    const recordId = view.selectedEntry?.recordId;
    return recordId === undefined ? undefined : { state, action: { kind: "open", recordId } };
  }
  if (matchesKey4(data, "f") && state.level === "phases") {
    return { state: { ...state, filter: nextFilter(state.filter), selectedAgent: 0 } };
  }
  if (matchesKey4(data, "x"))
    return view.workflowActive ? { state, action: { kind: "kill" } } : undefined;
  if (matchesKey4(data, "p")) {
    if (!view.workflowActive)
      return;
    return { state, action: { kind: view.paused ? "resume" : "pause" } };
  }
  const actions = agentActions(view.selectedEntry, view.workflowActive);
  if (matchesKey4(data, "s") && actions.skip && view.selectedEntry) {
    return { state, action: { kind: "skip", index: view.selectedEntry.index } };
  }
  if (matchesKey4(data, "r") && actions.retry && view.selectedEntry) {
    return { state, action: { kind: "retry", index: view.selectedEntry.index } };
  }
  return;
}
class WorkflowDialog {
  tui;
  source;
  theme;
  done;
  actions;
  state;
  spinnerFrame = 0;
  timer;
  closed = false;
  constructor(tui, source, theme, done, actions = {}, initialPhaseIndex = 0) {
    this.tui = tui;
    this.source = source;
    this.theme = theme;
    this.done = done;
    this.actions = actions;
    this.state = initialWorkflowDialogState(initialPhaseIndex);
    this.timer = setInterval(() => {
      this.spinnerFrame++;
      if (!this.closed)
        this.tui.requestRender();
    }, WORKFLOW_DIALOG_SPINNER_MS);
    this.timer.unref?.();
  }
  handleInput(data) {
    const input = { ...this.source(), state: this.state };
    const result = handleWorkflowDialogKey(data, this.state, resolveWorkflowDialog(input));
    if (!result)
      return;
    this.state = result.state;
    if (result.action)
      this.dispatch(result.action);
    this.tui.requestRender();
  }
  render(width) {
    const lines = layoutWorkflowDialog({
      ...this.source(),
      state: this.state,
      available: {
        onKill: this.actions.onKill !== undefined,
        onPause: this.actions.onPause !== undefined,
        onResume: this.actions.onResume !== undefined,
        onSkipAgent: this.actions.onSkipAgent !== undefined,
        onRetryAgent: this.actions.onRetryAgent !== undefined,
        onOpenAgent: this.actions.onOpenAgent !== undefined
      },
      width,
      spinnerFrame: this.spinnerFrame
    });
    return styleWorkflowCardLines(lines, this.theme);
  }
  invalidate() {}
  dispose() {
    this.closed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
  dispatch(action) {
    switch (action.kind) {
      case "cancel":
        this.closed = true;
        this.done(undefined);
        return;
      case "kill":
        this.actions.onKill?.();
        return;
      case "pause":
        this.actions.onPause?.();
        return;
      case "resume":
        this.actions.onResume?.();
        return;
      case "skip":
        this.actions.onSkipAgent?.(action.index);
        return;
      case "retry":
        this.actions.onRetryAgent?.(action.index);
        return;
      case "open":
        this.actions.onOpenAgent?.(action.recordId);
        return;
    }
  }
}

// dist/ui/workflow-menu.js
async function showWorkflowDialog(ctx, task, deps) {
  const { VIEWPORT_HEIGHT_PCT: VIEWPORT_HEIGHT_PCT2 } = await Promise.resolve().then(() => (init_conversation_viewer(), exports_conversation_viewer));
  let overlay;
  await ctx.ui.custom((tui, theme, _keybindings, done) => new WorkflowDialog(tui, () => ({
    progress: task.workflowProgress,
    task: {
      status: task.status,
      workflowName: task.workflowName,
      startTime: task.startTime,
      endTime: task.endTime,
      totalPausedMs: task.totalPausedMs
    },
    meta: task.meta,
    agentCount: task.agentCount
  }), theme, done, {
    onKill: () => {
      if (task.abortController.signal.aborted)
        return;
      task.abortController.abort();
      ctx.ui.notify(`Stopped workflow "${task.meta?.name ?? task.id}".`, "info");
    },
    onPause: () => {
      if (pauseWorkflowTask(task)) {
        ctx.ui.notify("Paused — running agents finish, no new ones start.", "info");
      }
    },
    onResume: () => {
      if (resumeWorkflowTask(task))
        ctx.ui.notify("Resumed.", "info");
    },
    onSkipAgent: (index) => {
      if (task.control?.skip(index) !== true) {
        ctx.ui.notify("Nothing to skip — that agent has already finished.", "info");
      }
    },
    onRetryAgent: (index) => {
      if (task.control?.retry(index) !== true) {
        ctx.ui.notify("Only a running agent can be retried.", "info");
      }
    },
    onOpenAgent: (recordId) => {
      const record = deps.getRecord(recordId);
      if (record === undefined) {
        ctx.ui.notify("No conversation left — agent records are dropped ten minutes after they finish.", "info");
        return;
      }
      overlay?.setHidden(true);
      deps.viewAgentConversation(ctx, record).catch((err) => ctx.ui.notify(`Could not open the conversation: ${err instanceof Error ? err.message : String(err)}`, "warning")).finally(() => overlay?.setHidden(false));
    }
  }), {
    overlay: true,
    overlayOptions: { anchor: "center", width: "90%", maxHeight: `${VIEWPORT_HEIGHT_PCT2}%` },
    onHandle: (handle) => {
      overlay = handle;
    }
  });
}
function openWorkflowFromFleet(id, deps) {
  const task = deps.tasks.get(id);
  const ctx = deps.getCtx();
  if (task === undefined || ctx === undefined)
    return;
  return showWorkflowDialog(ctx, task, deps);
}
async function showWorkflowsMenu(ctx, deps) {
  const tasks = [...deps.tasks.values()].sort((a, b2) => b2.startTime - a.startTime);
  if (tasks.length === 0) {
    ctx.ui.notify("No workflows in this session.", "info");
    return;
  }
  if (tasks.length === 1) {
    await showWorkflowDialog(ctx, tasks[0], deps);
    return;
  }
  const labels = tasks.map((task) => `${task.meta?.name ?? task.id} — ${task.status}, ${task.agentCount} agent${task.agentCount === 1 ? "" : "s"} · ${task.id}`);
  const picked = await ctx.ui.select("Workflows", labels);
  const index = picked !== undefined ? labels.indexOf(picked) : -1;
  if (index >= 0)
    await showWorkflowDialog(ctx, tasks[index], deps);
}

// dist/index.js
init_usage();

// dist/workflow/collisions.js
init_agent_runner();
var FOREIGN_WORKFLOW_TOOL_NAMES = new Set([
  SUBAGENT_TOOL_NAMES.WORKFLOW,
  "Workflow",
  "workflow"
]);
function decideWorkflowCollision(input) {
  const foreign = input.tools.find((tool) => FOREIGN_WORKFLOW_TOOL_NAMES.has(tool.name) && tool.description !== input.ownDescription);
  if (foreign === undefined)
    return { kind: "none" };
  const source = foreign.sourceInfo?.source ?? "unknown source";
  const tookOurName = foreign.name === SUBAGENT_TOOL_NAMES.WORKFLOW;
  if (input.pinned) {
    if (!tookOurName)
      return { kind: "none" };
    return {
      kind: "report",
      message: `Another extension (${source}) already registers a "${SUBAGENT_TOOL_NAMES.WORKFLOW}" tool. ` + "Pi keeps the first registration, so this extension's workflow tool is not offered to the " + "model. Disable one of the two."
    };
  }
  return {
    kind: "standDown",
    message: `Another extension (${source}) already provides a "${foreign.name}" tool, so this extension's ` + "workflows are disabled for this session to avoid offering the model two orchestrators. " + 'Set `"workflowsEnabled": true` in .pi/subagents.json to keep both.',
    withdraw: !tookOurName
  };
}

// dist/workflow/entry.js
var WORKFLOW_ENTRY_TYPE = "subagents:workflow";
function workflowEntryData(task) {
  return {
    name: task.workflowName ?? task.id,
    status: task.status,
    startTime: task.startTime,
    endTime: task.endTime,
    progress: task.workflowProgress,
    agentCount: task.agentCount,
    totalTokens: task.totalTokens,
    ...task.meta !== undefined ? { meta: task.meta } : {}
  };
}

// dist/workflow/host.js
init_agent_types();
init_exec_tree();
init_invocation_config();
init_model_scope();
init_project_trust();
init_usage();
import { existsSync as existsSync13 } from "node:fs";

// dist/workflow/saved.js
init_memory();
import { existsSync as existsSync12, readdirSync as readdirSync3, statSync as statSync8 } from "node:fs";
import { dirname as dirname5, isAbsolute as isAbsolute3, join as join13 } from "node:path";
import { getAgentDir as getAgentDir10 } from "@earendil-works/pi-coding-agent";

// dist/workflow/meta.js
import { createContext, Script } from "node:vm";

class WorkflowMetaError extends Error {
}
var META_EVAL_TIMEOUT_MS = 100;
var PURE_LITERAL_HINT = "The `meta` object must be a PURE LITERAL — no variables, function calls, spreads, or template interpolation.";
var META_DECLARATION = /(^|[\r\n])[ \t]*export[ \t\r\n]+const[ \t\r\n]+meta[ \t\r\n]*=/;
function hasMetaDeclaration(source) {
  return META_DECLARATION.test(source);
}
var IMPURE_WORDS = new Set(["function", "class", "async", "await", "new", "yield", "import", "get", "set"]);
function nextSignificant(source, i) {
  let j = i;
  while (j < source.length) {
    if (/\s/.test(source[j])) {
      j++;
      continue;
    }
    if (source[j] === "/" && source[j + 1] === "/") {
      const nl = source.indexOf(`
`, j);
      if (nl === -1)
        return -1;
      j = nl + 1;
      continue;
    }
    if (source[j] === "/" && source[j + 1] === "*") {
      const close = source.indexOf("*/", j + 2);
      if (close === -1)
        return -1;
      j = close + 2;
      continue;
    }
    return j;
  }
  return -1;
}
function scanObjectLiteral(source, open) {
  let depth = 0;
  let i = open;
  let sawInterpolation = false;
  let impure;
  let mode = "code";
  const templateStack = [];
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (mode === "line-comment") {
      if (c === `
`)
        mode = "code";
      i++;
      continue;
    }
    if (mode === "block-comment") {
      if (c === "*" && next === "/") {
        mode = "code";
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (mode === "single" || mode === "double" || mode === "regex") {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (mode === "single" && c === "'")
        mode = "code";
      else if (mode === "double" && c === '"')
        mode = "code";
      else if (mode === "regex" && c === "/")
        mode = "code";
      else if (c === `
` && mode !== "double")
        mode = "code";
      i++;
      continue;
    }
    if (mode === "template") {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "`") {
        mode = "code";
        i++;
        continue;
      }
      if (c === "$" && next === "{") {
        sawInterpolation = true;
        templateStack.push(depth);
        depth++;
        mode = "code";
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (c === "/" && next === "/") {
      mode = "line-comment";
      i += 2;
      continue;
    }
    if (c === "/" && next === "*") {
      mode = "block-comment";
      i += 2;
      continue;
    }
    if (c === "'") {
      mode = "single";
      i++;
      continue;
    }
    if (c === '"') {
      mode = "double";
      i++;
      continue;
    }
    if (c === "`") {
      if (impure === undefined && !isRegexPosition(source, i))
        impure = "a tagged template";
      mode = "template";
      i++;
      continue;
    }
    if (impure === undefined) {
      if (c === "(")
        impure = "`(`";
      else if (c === "=")
        impure = next === ">" ? "`=>`" : "`=`";
      else if (c === "\\")
        impure = "a `\\` escape outside a string";
      else if (/[A-Za-z_$]/.test(c) && (i === 0 || !/[\w$]/.test(source[i - 1]))) {
        let j = i + 1;
        while (j < source.length && /[\w$]/.test(source[j]))
          j++;
        const word = source.slice(i, j);
        if (IMPURE_WORDS.has(word)) {
          const after = nextSignificant(source, j);
          if (after === -1 || source[after] !== ":")
            impure = `\`${word}\``;
        }
        i = j;
        continue;
      }
    }
    if (c === "/" && isRegexPosition(source, i)) {
      mode = "regex";
      i++;
      continue;
    }
    if (c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === "}") {
      depth--;
      i++;
      if (templateStack.length > 0 && depth === templateStack[templateStack.length - 1]) {
        templateStack.pop();
        mode = "template";
        continue;
      }
      if (depth === 0)
        return { end: i, sawInterpolation, impure };
      continue;
    }
    i++;
  }
  return { end: -1, sawInterpolation, impure };
}
function isRegexPosition(source, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(source[j]))
    j--;
  if (j < 0)
    return true;
  const prev = source[j];
  return !/[\w$)\]`]/.test(prev);
}
function fail(message) {
  throw new WorkflowMetaError(message);
}
function assertPhases(value) {
  if (value === undefined)
    return;
  if (!Array.isArray(value))
    fail("`meta.phases` must be an array of { title, detail?, model? } objects.");
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      fail(`\`meta.phases[${index}]\` must be an object with a \`title\`.`);
    }
    const { title, detail, model } = entry;
    if (typeof title !== "string" || title.trim() === "") {
      fail(`\`meta.phases[${index}].title\` must be a non-empty string.`);
    }
    if (detail !== undefined && typeof detail !== "string") {
      fail(`\`meta.phases[${index}].detail\` must be a string.`);
    }
    if (model !== undefined && typeof model !== "string") {
      fail(`\`meta.phases[${index}].model\` must be a string.`);
    }
    return { title, ...detail !== undefined ? { detail } : {}, ...model !== undefined ? { model } : {} };
  });
}
function extractMeta(source) {
  const declaration = META_DECLARATION.exec(source);
  if (!declaration) {
    fail("A workflow script must begin with `export const meta = { name, description }`.\n" + PURE_LITERAL_HINT);
  }
  const open = source.indexOf("{", declaration.index + declaration[0].length);
  if (open === -1)
    fail("`export const meta` must be assigned an object literal.\n" + PURE_LITERAL_HINT);
  const { end: close, sawInterpolation, impure } = scanObjectLiteral(source, open);
  if (close === -1)
    fail("`meta` object literal is never closed — check for an unbalanced `{`.");
  if (sawInterpolation) {
    fail("`meta` must not use template interpolation (`${...}`).\n" + PURE_LITERAL_HINT);
  }
  if (impure !== undefined) {
    fail(`\`meta\` must not contain ${impure} — it must be data, not code.
${PURE_LITERAL_HINT}`);
  }
  const fragment = source.slice(open, close);
  let value;
  try {
    value = new Script(`(${fragment})`, { filename: "workflow-meta.js" }).runInContext(createContext({}, { microtaskMode: "afterEvaluate" }), { timeout: META_EVAL_TIMEOUT_MS });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/timed out|Script execution/i.test(detail)) {
      fail(`\`meta\` did not finish evaluating within ${META_EVAL_TIMEOUT_MS}ms — it must be a literal, not a computation.
` + PURE_LITERAL_HINT);
    }
    fail(`\`meta\` could not be evaluated: ${detail}
${PURE_LITERAL_HINT}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("`meta` must be an object literal.\n" + PURE_LITERAL_HINT);
  }
  const raw = value;
  if (typeof raw.name !== "string" || raw.name.trim() === "") {
    fail("`meta.name` is required and must be a non-empty string.");
  }
  if (typeof raw.description !== "string" || raw.description.trim() === "") {
    fail("`meta.description` is required and must be a non-empty string.");
  }
  if (raw.whenToUse !== undefined && typeof raw.whenToUse !== "string") {
    fail("`meta.whenToUse` must be a string.");
  }
  const phases = assertPhases(raw.phases);
  const meta = {
    name: raw.name,
    description: raw.description,
    ...raw.whenToUse !== undefined ? { whenToUse: raw.whenToUse } : {},
    ...phases !== undefined ? { phases } : {}
  };
  const exportAt = source.indexOf("export", declaration.index);
  const body = `${source.slice(0, exportAt)}${" ".repeat(6)}${source.slice(exportAt + 6)}`;
  return { meta, body };
}
var workflowNames = new Map;
var WORKFLOW_NAME_CACHE_SIZE = 16;
function workflowCallName(args, options = {}) {
  const source = args.script;
  if (source === undefined || source === "") {
    if (args.scriptPath !== undefined)
      return args.scriptPath.split(/[/\\]/).pop() ?? "workflow";
    return args.name !== undefined && args.name !== "" ? args.name : "workflow";
  }
  const cached = workflowNames.get(source);
  if (cached !== undefined) {
    workflowNames.delete(source);
    workflowNames.set(source, cached);
    return cached;
  }
  if (options.parse === false)
    return "workflow";
  let name = "workflow";
  try {
    name = extractMeta(source).meta.name;
  } catch {}
  workflowNames.set(source, name);
  while (workflowNames.size > WORKFLOW_NAME_CACHE_SIZE) {
    const oldest = workflowNames.keys().next().value;
    workflowNames.delete(oldest);
  }
  return name;
}

// dist/workflow/script-file.js
import { readFileSync as readFileSync8, statSync as statSync7 } from "node:fs";
var MAX_SCRIPT_LENGTH = 524288;
function readWorkflowScriptFile(path) {
  const stat = statSync7(path);
  if (!stat.isFile())
    throw new Error("not a regular file");
  if (stat.size > MAX_SCRIPT_LENGTH) {
    throw new Error(`${stat.size} bytes, over the workflow script limit of ${MAX_SCRIPT_LENGTH}`);
  }
  return readFileSync8(path, "utf-8");
}

// dist/workflow/saved.js
var WORKFLOW_EXTENSION = ".js";
function projectWorkflowRoots(cwd) {
  return [join13(cwd, ".pi", "workflows"), join13(cwd, ".agents", "workflows")];
}
function savedWorkflowRoots(cwd, project = true) {
  return [...project ? projectWorkflowRoots(cwd) : [], join13(getAgentDir10(), "workflows")];
}
function untrustedProjectWorkflow(name, cwd) {
  return projectWorkflowRoots(cwd).map((root) => join13(root, `${name}${WORKFLOW_EXTENSION}`)).find((path) => !isSymlink(dirname5(path)) && isReadableScript(path));
}
function readSavedWorkflow(name, cwd, project = true) {
  const trimmed = name.trim();
  if (isUnsafeName(trimmed)) {
    return {
      ok: false,
      message: `"${name}" is not a usable workflow name. Use letters, digits, dots, hyphens and underscores only ` + "— a path is what `scriptPath` is for."
    };
  }
  const roots = savedWorkflowRoots(cwd, project);
  for (const root of roots) {
    if (isSymlink(root))
      continue;
    const path = join13(root, `${trimmed}${WORKFLOW_EXTENSION}`);
    if (!isReadableScript(path))
      continue;
    const script = safeReadFile(path);
    if (script === undefined)
      continue;
    if (!hasMetaDeclaration(script)) {
      return {
        ok: false,
        message: `"${path}" is not a workflow script — it has no \`export const meta = { name, description }\` ` + "declaration. Nothing was run."
      };
    }
    return { ok: true, script, path };
  }
  const blocked = project ? undefined : untrustedProjectWorkflow(trimmed, cwd);
  if (blocked !== undefined) {
    return {
      ok: false,
      message: `"${blocked}" was not run: workflows saved in a project run only once the project is trusted to run its ` + "own code. The user can trust it with /trust in pi. Nothing was run."
    };
  }
  const known = listSavedWorkflows(cwd, project);
  return {
    ok: false,
    message: `No saved workflow named "${trimmed}". Looked in: ${roots.join(", ")}. ` + (known.length > 0 ? `Available: ${known.join(", ")}.` : "Save one as `<name>.js` in one of those directories, or pass `script`/`scriptPath` instead.")
  };
}
function resolveWorkflowSource(ref, cwd, project = true) {
  const path = ref.scriptPath?.trim();
  if (path !== undefined && path !== "") {
    const resolved = isAbsolute3(path) ? path : join13(cwd, path);
    try {
      return { ok: true, script: readWorkflowScriptFile(resolved), path: resolved };
    } catch (err) {
      return {
        ok: false,
        message: `Could not read workflow script "${resolved}": ${err instanceof Error ? err.message : String(err)}`
      };
    }
  }
  const name = ref.name?.trim();
  if (name !== undefined && name !== "")
    return readSavedWorkflow(name, cwd, project);
  return { ok: false, message: "A workflow reference needs a `name` or a `scriptPath`." };
}
function listSavedWorkflows(cwd, project = true) {
  const names = new Set;
  for (const root of savedWorkflowRoots(cwd, project)) {
    if (!existsSync12(root) || isSymlink(root))
      continue;
    let entries;
    try {
      entries = readdirSync3(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(WORKFLOW_EXTENSION))
        continue;
      const name = entry.slice(0, -WORKFLOW_EXTENSION.length);
      if (isUnsafeName(name))
        continue;
      if (isWorkflowFile(join13(root, entry)))
        names.add(name);
    }
  }
  return [...names].sort();
}
function isReadableScript(path) {
  try {
    const stat = statSync8(path);
    return stat.isFile() && stat.size <= MAX_SCRIPT_LENGTH;
  } catch {
    return false;
  }
}
function isWorkflowFile(path) {
  if (!isReadableScript(path))
    return false;
  const source = safeReadFile(path);
  return source !== undefined && hasMetaDeclaration(source);
}
function resolveWorkflowScript(params, cwd, project = true) {
  const path = params.scriptPath?.trim();
  if (path !== undefined && path !== "") {
    const resolved = resolveWorkflowSource({ scriptPath: path }, cwd);
    return resolved.ok ? { ok: true, script: resolved.script, scriptPath: resolved.path } : resolved;
  }
  const script = params.script;
  if (script !== undefined && script.trim() !== "")
    return { ok: true, script };
  const name = params.name?.trim();
  if (name !== undefined && name !== "") {
    const saved = resolveWorkflowSource({ name }, cwd, project);
    return saved.ok ? { ok: true, script: saved.script, scriptPath: saved.path } : saved;
  }
  const known = listSavedWorkflows(cwd, project);
  return {
    ok: false,
    message: "Provide `script` (inline source), `scriptPath` (a file to read), or `name` (a saved workflow). " + "`scriptPath` takes precedence, then `script`, then `name`." + (known.length > 0 ? ` Saved workflows: ${known.join(", ")}.` : "")
  };
}

// dist/workflow/host.js
var DEFAULT_GATE_TIMEOUT_MS = 10 * 60000;
function childCwd(record) {
  const path = record.worktree?.path;
  return path !== undefined && existsSync13(path) ? path : undefined;
}
function succeeded(record) {
  return record?.status === "completed" || record?.status === "steered";
}
function resolvedInfo(record) {
  const invocation = record?.invocation;
  if (invocation?.modelName === undefined)
    return;
  return {
    modelName: invocation.modelName,
    modelId: invocation.modelId,
    thinking: invocation.thinking,
    requestedThinking: invocation.requestedThinking,
    requestedModel: invocation.requestedModel
  };
}
function spendOf(record) {
  return {
    tokens: record ? getLifetimeTotal(record.lifetimeUsage) : 0,
    outputTokens: record?.lifetimeUsage?.output ?? 0,
    toolUses: record?.toolUses ?? 0
  };
}
function toSpawnResult(record, baseline) {
  const tokens = getLifetimeTotal(record.lifetimeUsage) - (baseline?.tokens ?? 0);
  const outputTokens = (record.lifetimeUsage?.output ?? 0) - (baseline?.outputTokens ?? 0);
  const toolCalls = record.toolUses - (baseline?.toolUses ?? 0);
  const cwd = childCwd(record);
  const wt = record.worktreeResult;
  const branch = wt?.hasChanges ? wt.branch : undefined;
  const worktreePath = wt?.hasChanges && wt.path && (wt.kept || !wt.branch) ? wt.path : undefined;
  const common = {
    ...tokens > 0 ? { tokens } : {},
    ...outputTokens > 0 ? { outputTokens } : {},
    ...toolCalls > 0 ? { toolCalls } : {},
    ...cwd !== undefined ? { cwd } : {},
    ...branch !== undefined ? { branch } : {},
    ...worktreePath !== undefined ? { worktreePath } : {}
  };
  const failure = (error) => {
    const where = [
      branch !== undefined && !error.includes(branch) ? `Changes saved to branch \`${branch}\`.` : undefined,
      worktreePath !== undefined && !error.includes(worktreePath) ? `Worktree kept at \`${worktreePath}\`.` : undefined
    ].filter(Boolean);
    return where.length > 0 ? `${error}

${where.join(" ")}` : error;
  };
  if (succeeded(record)) {
    return {
      ...common,
      ok: true,
      text: record.structuredJson ?? record.result ?? "",
      ...record.structuredRetried ? { structuredRetried: true } : {}
    };
  }
  if (record.status === "stopped") {
    return { ...common, ok: false, skipped: true, error: failure(record.error ?? "Stopped.") };
  }
  return { ...common, ok: false, error: failure(record.error ?? `Agent ${record.status}.`) };
}
function eitherSignal(a, b2) {
  if (a === undefined)
    return b2;
  if (b2 === undefined)
    return a;
  return AbortSignal.any([a, b2]);
}
var GATE_SHELL = process.platform === "win32" ? ["cmd", "/c"] : ["sh", "-c"];
function createWorkflowHost(deps) {
  const { pi, ctx, manager } = deps;
  const records = new Map;
  const startupStops = new Map;
  const warnedModelMessages = new Set;
  async function executeGate(command, cwd, runSignal) {
    const signal = eitherSignal(deps.signal, runSignal);
    const result = await commandExec(pi)(GATE_SHELL[0], [GATE_SHELL[1], command], {
      cwd,
      timeout: deps.gateTimeoutMs ?? DEFAULT_GATE_TIMEOUT_MS,
      killTreeOnExit: true,
      ...signal !== undefined ? { signal } : {}
    });
    const output = [result.stdout, result.stderr].map((stream) => stream.trim()).filter(Boolean).join(`
`);
    if (result.killed) {
      return { ok: false, output: output || `Gate command timed out: ${command}` };
    }
    return { ok: result.code === 0, output };
  }
  return {
    async spawnAgent(request) {
      const dispatch = resolveSpawnType(request.agentType);
      if (!dispatch.ok)
        return { ok: false, error: dispatch.message };
      let model = ctx.model;
      const config = getAgentConfig(dispatch.type);
      const overridesAllowed = isModelOverrideAllowed();
      const requestedModel = overridesAllowed ? request.model : undefined;
      const effort = overridesAllowed ? request.effort : undefined;
      const modelInput = requestedModel ?? config?.model;
      let modelNote;
      if (modelInput !== undefined) {
        const resolution = resolveModelDetailed(modelInput, ctx.modelRegistry, ctx.model?.provider);
        if (resolution.ok) {
          model = resolution.model;
        } else if (requestedModel !== undefined) {
          return { ok: false, error: resolution.message };
        } else {
          modelNote = unresolvedModelNote(modelInput, unresolvedReason(resolution), model ?? "the parent's model");
          if (!warnedModelMessages.has(modelNote)) {
            warnedModelMessages.add(modelNote);
            ctx.ui.notify(modelNote, "warning");
          }
        }
      }
      const scopeVerdict = checkModelScope({
        model,
        cwd: ctx.cwd,
        modelRegistry: ctx.modelRegistry,
        callerSupplied: requestedModel !== undefined,
        agentLabel: config?.displayName ?? dispatch.type,
        modelInput
      });
      if (scopeVerdict.kind === "error")
        return { ok: false, error: scopeVerdict.message };
      if (scopeVerdict.kind === "warn" && !warnedModelMessages.has(scopeVerdict.message)) {
        warnedModelMessages.add(scopeVerdict.message);
        ctx.ui.notify(scopeVerdict.message, "warning");
      }
      let gate;
      let spawnedId;
      const startupStop = new AbortController;
      startupStops.set(request.agentId, startupStop);
      const signal = eitherSignal(eitherSignal(deps.signal, request.signal), startupStop.signal);
      let sessionReady = false;
      const reportResolved = () => {
        if (!sessionReady || spawnedId === undefined)
          return;
        const info = resolvedInfo(manager.getRecord(spawnedId));
        if (info !== undefined)
          request.onResolved?.(info);
      };
      const command = request.gate;
      const onBeforeWorktreeCleanup = command === undefined ? undefined : async (worktreePath) => {
        if (spawnedId === undefined || !succeeded(manager.getRecord(spawnedId)))
          return;
        try {
          gate = await executeGate(command, worktreePath, request.signal);
        } catch (error) {
          gate = { ok: false, output: error instanceof Error ? error.message : String(error) };
        }
      };
      try {
        const { record } = await manager.spawnAndWait(pi, ctx, dispatch.type, request.prompt, {
          description: request.label,
          ...config?.isolated !== undefined ? { isolated: config.isolated } : {},
          ...deps.workflowId !== undefined ? { workflowId: deps.workflowId } : {},
          ...model !== undefined ? { model } : {},
          ...modelNote !== undefined ? { modelNote } : {},
          ...effort !== undefined ? { thinkingLevel: effort } : {},
          invocation: {
            ...effort !== undefined ? { thinking: effort } : {}
          },
          onSessionCreated: () => {
            sessionReady = true;
            reportResolved();
          },
          ...request.schema !== undefined ? { structuredOutput: request.schema } : {},
          ...request.isolation !== undefined ? { isolation: request.isolation } : {},
          ...signal !== undefined ? { signal } : {},
          ...deps.rootSessionId !== undefined ? { rootSessionId: deps.rootSessionId } : {},
          ...onBeforeWorktreeCleanup !== undefined ? { onBeforeWorktreeCleanup } : {}
        }, (id) => {
          spawnedId = id;
          records.set(request.agentId, id);
          request.onResolved?.({ recordId: id });
          reportResolved();
        });
        return { ...toSpawnResult(record), ...gate !== undefined ? { gate } : {} };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      } finally {
        if (startupStops.get(request.agentId) === startupStop)
          startupStops.delete(request.agentId);
      }
    },
    abortAgent(agentId) {
      const id = records.get(agentId);
      if (id !== undefined) {
        manager.abort(id);
        return;
      }
      startupStops.get(agentId)?.abort();
    },
    async resumeAgent(agentId, prompt, onResolved, recordId) {
      let id = records.get(agentId);
      if (id === undefined && recordId !== undefined) {
        const known = manager.getRecord(recordId) ?? manager.findTombstone(recordId);
        if (known?.workflowId !== undefined && known.parentAgentId === undefined) {
          id = recordId;
          records.set(agentId, id);
        }
      }
      if (id === undefined) {
        return { ok: false, error: `Cannot resume "${agentId}" — it never started.` };
      }
      let record;
      const before = manager.getRecord(id);
      const baseline = spendOf(before);
      try {
        record = await manager.resume(id, prompt, deps.signal, { pi, ctx });
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      if (record === undefined) {
        const live = manager.getRecord(id);
        return {
          ok: false,
          error: live?.status === "running" || live?.status === "queued" ? `Agent ${id} is still running — it can only be resumed once its current run finishes.` : `Agent ${id} has no session left to resume.`
        };
      }
      onResolved?.({ recordId: id });
      const info = resolvedInfo(record);
      if (info !== undefined)
        onResolved?.(info);
      return toSpawnResult(record, before !== undefined && record.id === before.id ? baseline : undefined);
    },
    loadWorkflow(ref) {
      return resolveWorkflowSource(ref, ctx.cwd, isProjectCodeTrusted(isProjectTrustedBy(ctx), ctx.cwd));
    },
    async runGate(command, gate) {
      return await executeGate(command, gate.cwd ?? ctx.cwd, gate.signal);
    }
  };
}

// dist/workflow/journal.js
import { createHash } from "node:crypto";
import { appendFileSync as appendFileSync3, readFileSync as readFileSync9 } from "node:fs";
function journalKey(input) {
  const canonical = JSON.stringify([
    input.prompt,
    input.label ?? null,
    input.model ?? null,
    input.agentType ?? null,
    input.effort ?? null,
    input.isolation ?? null,
    input.gate ?? null,
    input.resume ?? null,
    ...input.schema !== undefined ? [input.schema] : []
  ]);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}
function readJournal(path) {
  let raw;
  try {
    raw = readFileSync9(path, "utf-8");
  } catch {
    return [];
  }
  const entries = [];
  for (const line of raw.split(`
`)) {
    if (line.trim() === "")
      continue;
    try {
      const parsed = JSON.parse(line);
      if (!isEntry(parsed))
        continue;
      entries.push(parsed);
    } catch {}
  }
  entries.sort((a, b2) => a.index - b2.index);
  return entries;
}
function appendJournal(path, entry) {
  try {
    appendFileSync3(path, `${JSON.stringify(entry)}
`, "utf-8");
  } catch {}
}
function isEntry(value) {
  if (typeof value !== "object" || value === null)
    return false;
  const entry = value;
  return Number.isInteger(entry.index) && entry.index >= 0 && typeof entry.key === "string" && typeof entry.ok === "boolean" && (entry.text === undefined || typeof entry.text === "string") && (entry.resumed === undefined || entry.resumed === true) && (entry.ref === undefined || typeof entry.ref === "string");
}

// dist/workflow/runtime.js
import { cpus } from "node:os";
import { Worker } from "node:worker_threads";

// dist/workflow/json-schema.js
import { Check, Errors } from "typebox/value";
var MAX_SCHEMA_BYTES = 64 * 1024;
var MAX_REPORTED_ERRORS = 5;
function compileJsonSchema(schema) {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return { ok: false, message: "agent() opts.schema must be a JSON Schema object." };
  }
  const root = schema;
  if (root.type !== "object") {
    return {
      ok: false,
      message: 'agent() opts.schema must have `type: "object"` at its root — it becomes the tool\'s input schema, ' + "and a non-object root is not something a model can be asked to fill."
    };
  }
  let serialized;
  try {
    serialized = JSON.stringify(root);
  } catch {
    return { ok: false, message: "agent() opts.schema must be JSON-serializable." };
  }
  if (serialized.length > MAX_SCHEMA_BYTES) {
    return {
      ok: false,
      message: `agent() opts.schema is too large (${serialized.length} bytes; the limit is ${MAX_SCHEMA_BYTES}).`
    };
  }
  const unsafe = findUnsafePattern(root);
  if (unsafe !== undefined) {
    return {
      ok: false,
      message: `agent() opts.schema has a regular expression that could take exponential time: ${JSON.stringify(unsafe)}. ` + `Avoid quantified groups that contain quantifiers (like (a+)+), and keep patterns under ${MAX_PATTERN_LENGTH} characters.`
    };
  }
  try {
    Check(root, {});
  } catch (error) {
    return {
      ok: false,
      message: `agent() opts.schema is not a schema this runtime can validate: ${error instanceof Error ? error.message : String(error)}`
    };
  }
  return { ok: true, compiled: { schema: root, check: (value) => checkAgainst(root, value) } };
}
var MAX_PATTERN_LENGTH = 512;
function findUnsafePattern(node, depth = 0) {
  if (depth > 64 || node === null || typeof node !== "object")
    return;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findUnsafePattern(item, depth + 1);
      if (found !== undefined)
        return found;
    }
    return;
  }
  const record = node;
  if (typeof record.pattern === "string" && isUnsafePattern(record.pattern))
    return record.pattern;
  const patternProperties = record.patternProperties;
  if (patternProperties !== null && typeof patternProperties === "object" && !Array.isArray(patternProperties)) {
    for (const key of Object.keys(patternProperties)) {
      if (isUnsafePattern(key))
        return key;
    }
  }
  for (const value of Object.values(record)) {
    const found = findUnsafePattern(value, depth + 1);
    if (found !== undefined)
      return found;
  }
  return;
}
function isUnsafePattern(source) {
  if (source.length > MAX_PATTERN_LENGTH)
    return true;
  const groups = [];
  let quantified = false;
  for (let i = 0;i < source.length; i++) {
    const c = source[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "[") {
      for (i++;i < source.length && source[i] !== "]"; i++)
        if (source[i] === "\\")
          i++;
      continue;
    }
    if (c === "(") {
      groups.push(quantified);
      quantified = false;
      continue;
    }
    if (c === ")") {
      const inner = quantified;
      quantified = groups.pop() ?? false;
      const next = source[i + 1];
      const repeated = next === "+" || next === "*" || next === "{" || next === "?";
      if (repeated && inner && next !== "?")
        return true;
      if (inner || repeated)
        quantified = true;
      continue;
    }
    if (c === "+" || c === "*" || c === "{")
      quantified = true;
    else if (c === "?" && source[i - 1] !== "(" && !/[+*?}]/.test(source[i - 1] ?? ""))
      quantified = true;
  }
  return false;
}
function checkAgainst(schema, value) {
  let valid;
  try {
    valid = Check(schema, value);
  } catch (error) {
    return `the value could not be validated: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (valid)
    return true;
  const reported = [];
  try {
    for (const error of Errors(schema, value)) {
      const path = String(error.instancePath ?? "");
      const where = path === "" ? "$" : `$${path.replace(/\//g, ".")}`;
      reported.push(`${where}: ${error.message}`);
      if (reported.length >= MAX_REPORTED_ERRORS)
        break;
    }
  } catch {}
  return reported.length > 0 ? reported.join("; ") : "the value does not match the required schema";
}

// dist/workflow/worker-source.js
var DETERMINISM_PRELUDE = "const Date = (function () {" + " const RealDate = globalThis.Date;" + " const die = function (what) {" + ' throw new Error(what + " is unavailable in workflow scripts (breaks resume).' + ' Stamp results after the workflow returns, or pass timestamps via `args`.");' + " };" + ' RealDate.now = function () { return die("Date.now()"); };' + ' Math.random = function () { return die("Math.random()"); };' + " return class WorkflowDate extends RealDate {" + ' constructor() { if (arguments.length === 0) die("new Date()"); super(...arguments); }' + " };" + "})();";
var WORKER_SOURCE = `"use strict";

const { parentPort, workerData } = require("node:worker_threads");
const vm = require("node:vm");

const port = parentPort;
const ITEM_CAP = workerData.itemCap;
const PRELUDE = ${JSON.stringify(DETERMINISM_PRELUDE)};

/* ------------------------------------------------------------------ *
 * RPC to the host
 *
 * The script never touches the agent manager. Every effect leaves as a
 * "call" message and comes back as a "response", so the host owns the
 * semaphore, the caps, and the abort story.
 * ------------------------------------------------------------------ */

let nextCallId = 1;
const pendingCalls = new Map();

/**
 * Output tokens this run has spent, as last reported by the host.
 *
 * A mirror, not a tally: every response carries the host's current total, so
 * there is exactly one counter and it cannot drift. Between responses it cannot
 * be stale in any way the script could observe — tokens only accrue through
 * agents, and an agent's response is the only thing the script waits on.
 */
let spentOutput = 0;

function callHost(method, payload) {
  // Drain first, so the phase() that named this agent reaches the host ahead of
  // the agent entry rather than a tick behind it.
  flushProgress();
  return new Promise(function (resolve, reject) {
    const callId = nextCallId++;
    pendingCalls.set(callId, { resolve: resolve, reject: reject });
    port.postMessage({ type: "call", callId: callId, method: method, payload: payload });
  });
}

port.on("message", function (message) {
  if (!message || message.type !== "response") return;
  if (typeof message.spent === "number") spentOutput = message.spent;
  const waiter = pendingCalls.get(message.callId);
  if (!waiter) return;
  pendingCalls.delete(message.callId);
  if (message.ok) {
    waiter.resolve(message.value);
    return;
  }
  const error = new Error(message.error || "The workflow host rejected the call.");
  // Fatal errors are the run's, not the item's: parallel() and pipeline()
  // swallow ordinary failures into null, and a cap breach must not be
  // silently absorbed that way.
  if (message.fatal) error.workflowFatal = true;
  waiter.reject(error);
});

function isFatal(error) {
  return !!(error && typeof error === "object" && error.workflowFatal === true);
}

/* ------------------------------------------------------------------ *
 * Progress entries
 * ------------------------------------------------------------------ */

let progressQueue = [];
let flushTimer = null;
/**
 * Log lines queued for the next flush, and lines dropped since the last one.
 * A script that logs in a tight loop never yields to the flush timer, so the
 * queue itself has to stay bounded: only the newest lines survive, and one
 * marker line says how many did not. The host keeps its own bound on top.
 */
let queuedLogs = 0;
let droppedLogs = 0;
const MAX_QUEUED_LOGS = 2000;
const MAX_LOG_LINE = 4096;

function emit(entry) {
  if (entry.type === "workflow_log") {
    if (entry.message.length > MAX_LOG_LINE) {
      entry.message = entry.message.slice(0, MAX_LOG_LINE) +
        "… (" + (entry.message.length - MAX_LOG_LINE) + " more characters)";
    }
    // Compacted once the queue holds twice the cap, so a flood costs O(1) per
    // line rather than a shift per line.
    if (queuedLogs >= 2 * MAX_QUEUED_LOGS) trimQueuedLogs(MAX_QUEUED_LOGS - 1);
    queuedLogs++;
  }
  progressQueue.push(entry);
  // Batched on a macrotask: a fan-out emits a burst of phase/log entries in one
  // turn, and the host renders once per batch rather than once per entry.
  if (flushTimer === null) flushTimer = setTimeout(flushProgress, 0);
}

/** Drop all but the newest \`keep\` queued log lines, counting the rest. */
function trimQueuedLogs(keep) {
  const kept = [];
  let room = keep;
  for (let i = progressQueue.length - 1; i >= 0; i--) {
    const queued = progressQueue[i];
    if (queued.type === "workflow_log") {
      if (room <= 0) { droppedLogs++; continue; }
      room--;
    }
    kept.push(queued);
  }
  kept.reverse();
  progressQueue = kept;
  queuedLogs = keep - room;
}

function flushProgress() {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (progressQueue.length === 0) return;
  if (queuedLogs > MAX_QUEUED_LOGS) trimQueuedLogs(MAX_QUEUED_LOGS);
  const batch = progressQueue;
  progressQueue = [];
  queuedLogs = 0;
  if (droppedLogs > 0) {
    batch.unshift({
      type: "workflow_log",
      message: "… " + droppedLogs + " earlier log line" + (droppedLogs === 1 ? "" : "s") + " dropped",
      dropped: droppedLogs,
    });
    droppedLogs = 0;
  }
  port.postMessage({ type: "progress", entries: batch });
}

/* ------------------------------------------------------------------ *
 * The JSON boundary
 *
 * Checked here rather than relying on structured clone, which happily
 * carries cycles, BigInt and Maps that the progress log and the resume
 * journal cannot represent. Rejecting loudly beats writing a journal
 * that will not replay.
 * ------------------------------------------------------------------ */

let realmObjectPrototype = null;
/**
 * The realm's own \`JSON.parse\`.
 *
 * Module-scope, not local to main(), because \`agent({ schema })\` parses its
 * result here — outside main's closure — and the object has to carry the
 * *script's* Object.prototype, not the worker's, or \`instanceof Object\` fails
 * inside the script it was handed to.
 */
let realmParse = null;

/**
 * The top-level script's scope.
 *
 * Module-scope because a nested \`workflow()\` needs the realm-native function
 * compiler that \`main()\` builds, and because the compiled child function is
 * cached per body — see {@link workflowIn}.
 */
let rootScope = null;
/**
 * The vm context every script runs in.
 *
 * Held so a nested \`workflow()\` can compile its child there. Compiled from
 * *outside* the realm, with \`vm.Script\`, because the context itself has
 * \`codeGeneration.strings\` off — the script cannot build code, but the worker
 * that owns it still can.
 */
let realmContext = null;
/** Nested invocations made so far, against \`workerData.nestedCap\`. */
let nestedCount = 0;

function boundaryError(what, path) {
  return new Error(
    "Cannot pass " + what + " across the workflow VM boundary (at " + path + ")."
  );
}

function assertBoundary(value, path, seen) {
  if (value === null) return;
  const kind = typeof value;
  if (kind === "string" || kind === "boolean") return;
  if (kind === "number") {
    if (!Number.isFinite(value)) throw boundaryError("a non-finite number", path);
    return;
  }
  if (kind === "undefined") {
    if (path === "the workflow result") return;
    throw boundaryError("undefined", path);
  }
  if (kind === "bigint") throw boundaryError("a BigInt", path);
  if (kind === "symbol") throw boundaryError("a symbol", path);
  if (kind === "function") throw boundaryError("a function", path);
  if (kind !== "object") throw boundaryError("a " + kind, path);

  if (seen.has(value)) throw boundaryError("a circular structure", path);
  seen.add(value);

  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw boundaryError("an object with symbol keys", path);
  }

  if (Array.isArray(value)) {
    const length = value.length;
    for (let i = 0; i < length; i++) {
      // A sparse array round-trips through JSON as nulls, which silently
      // changes the data. Reject instead.
      if (!Object.prototype.hasOwnProperty.call(value, i)) {
        throw boundaryError("a sparse array", path + "[" + i + "]");
      }
      assertBoundary(value[i], path + "[" + i + "]", seen);
    }
    seen.delete(value);
    return;
  }

  const prototype = Object.getPrototypeOf(value);
  // Two prototypes are legitimate: the realm's own Object.prototype (anything
  // the script built) and the worker's (arrays we hand back from parallel).
  // Everything else — Map, Set, Date, a class instance — loses meaning here.
  if (prototype !== null && prototype !== realmObjectPrototype && prototype !== Object.prototype) {
    throw boundaryError("a non-plain object", path);
  }

  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i++) {
    assertBoundary(value[keys[i]], path + "." + keys[i], seen);
  }
  seen.delete(value);
}

function checkBoundary(value, path) {
  assertBoundary(value, path, new Set());
  return value;
}

/* ------------------------------------------------------------------ *
 * Realm helpers
 *
 * parallel() and pipeline() build their result arrays in worker code, but
 * the script should get an array its own realm recognises — otherwise
 * \`result instanceof Array\` is false and \`Array.isArray\` is the only thing
 * that works. Item values are moved across untouched.
 * ------------------------------------------------------------------ */

let realmNewArray = null;
let realmPush = null;

function toRealmArray(items) {
  const array = realmNewArray();
  for (let i = 0; i < items.length; i++) realmPush(array, items[i]);
  return array;
}

function toList(value, what) {
  if (!Array.isArray(value)) throw new Error(what + " expects an array.");
  const length = value.length >>> 0;
  if (length > ITEM_CAP) {
    throw new Error(
      what + " was given " + length + " items, over the limit of " + ITEM_CAP + "."
    );
  }
  const out = [];
  for (let i = 0; i < length; i++) out.push(value[i]);
  return out;
}

function requireText(value, what) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(what + " requires a non-empty string.");
  }
  return value;
}

function optionalText(value, what) {
  if (value === undefined || value === null) return undefined;
  return requireText(value, what);
}

/**
 * Reasoning effort a child may be spawned under — pi's \`ThinkingLevel\`.
 *
 * A superset of Claude Code's five, so a script written there runs here; the
 * extra \`minimal\` is pi's own. Validated in the worker rather than the host
 * because a typo should stop the script at the call that made it, not surface
 * later as an agent that quietly ran at the wrong depth.
 */
const EFFORT_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"];

/**
 * Every option \`agent()\` understands.
 *
 * Checked rather than ignored, because the alternative is the worst failure a
 * ported script can have. Claude Code's \`agent()\` also takes \`schema\`, and its
 * own canonical example uses it; quietly dropping it hands the script the
 * agent's raw text where it expected a validated object, and the run then dies
 * several lines later reading a field off a string. A typo behaves the same
 * way. Naming the option costs one error message and no model calls.
 */
const AGENT_OPTIONS = [
  "label",
  "phase",
  "model",
  "agentType",
  "isolation",
  "gate",
  "resume",
  "effort",
  "schema",
];

/** Claude Code options this runtime does not have, and why. */
const UNSUPPORTED_AGENT_OPTIONS = {};

/* ------------------------------------------------------------------ *
 * Script globals
 * ------------------------------------------------------------------ */

/**
 * Phase indices are allocated once for the whole run, so parent and child never
 * collide. What is per-scope is the *title to index* map: a child's
 * \`phase("Scan")\` must not resolve to the parent's "Scan".
 */
let nextPhaseIndex = 0;

/**
 * One script's view of the world.
 *
 * A nested \`workflow()\` runs in this same worker and this same vm context —
 * which is what makes it share the run's semaphore, agent counter, journal,
 * abort signal and budget without any of them being plumbed anywhere. What it
 * must NOT share is ambient phase state, so that lives here and the child's
 * globals are closures over its own scope.
 */
function makeScope(name, depth) {
  const scope = {
    name: name,
    depth: depth,
    // Prefixed into every phase title the child defines, which is the whole of
    // how a nested run reads as its own group in the progress tree — no new
    // entry type, no renderer change.
    prefix: name === undefined ? "" : "▸ " + name,
    ambientPhaseIndex: undefined,
    ambientPhaseTitle: undefined,
    phaseIndexByTitle: new Map(),
  };
  scope.agent = function (prompt, opts) {
    return agentIn(scope, prompt, opts);
  };
  scope.phase = function (title) {
    return phaseIn(scope, title);
  };
  scope.log = function (message) {
    return logIn(scope, message);
  };
  scope.workflow = function (ref, args) {
    return workflowIn(scope, ref, args);
  };
  scope.console = makeConsole(scope);
  return scope;
}

/** A scope's title for a phase: the child's own group, or the parent's bare title. */
function scopedTitle(scope, title) {
  if (scope.prefix === "") return title;
  return title === undefined ? scope.prefix : scope.prefix + " › " + title;
}

function definePhaseIn(scope, title) {
  let index = scope.phaseIndexByTitle.get(title);
  if (index !== undefined) return index;
  index = nextPhaseIndex++;
  scope.phaseIndexByTitle.set(title, index);
  emit({ type: "workflow_phase", index: index, title: scopedTitle(scope, title) });
  return index;
}

function phaseIn(scope, title) {
  const text = requireText(title, "phase(title)");
  scope.ambientPhaseIndex = definePhaseIn(scope, text);
  scope.ambientPhaseTitle = scopedTitle(scope, text);
}

function describe(value) {
  if (typeof value === "string") return value;
  // Duck-typed, not \`instanceof Error\`: an error thrown by the script belongs
  // to the vm realm, so it fails an instanceof check against the worker's.
  if (value && typeof value === "object" && typeof value.message === "string" && typeof value.stack === "string") {
    return value.message;
  }
  try {
    const json = JSON.stringify(value);
    if (json !== undefined) return json;
  } catch {
    /* cycles and BigInt fall through to String() */
  }
  return String(value);
}

/** Attribute a line to the child that wrote it; logs carry no phase of their own. */
function logPrefix(scope) {
  return scope.prefix === "" ? "" : scope.prefix + ": ";
}

function logIn(scope, message) {
  emit({ type: "workflow_log", message: logPrefix(scope) + describe(message) });
}

function makeConsole(scope) {
  const write = function () {
    const parts = [];
    for (let i = 0; i < arguments.length; i++) parts.push(describe(arguments[i]));
    emit({ type: "workflow_log", message: logPrefix(scope) + parts.join(" ") });
  };
  return { log: write, info: write, warn: write, error: write, debug: write };
}

async function agentIn(scope, prompt, opts) {
  const text = requireText(prompt, "agent(prompt)");
  const options = opts === undefined || opts === null ? {} : opts;
  if (typeof options !== "object" || Array.isArray(options)) {
    throw new Error("agent(prompt, opts) expects opts to be an object.");
  }

  for (const key of Object.keys(options)) {
    if (AGENT_OPTIONS.indexOf(key) !== -1) continue;
    const why = UNSUPPORTED_AGENT_OPTIONS[key];
    throw new Error(
      why !== undefined
        ? "agent() opts." + key + " is not supported here: " + why
        : "agent() opts." + key + " is not a recognised option. Supported: " + AGENT_OPTIONS.join(", ") + "."
    );
  }

  const label = optionalText(options.label, "agent() opts.label");
  const phaseName = optionalText(options.phase, "agent() opts.phase");
  const model = optionalText(options.model, "agent() opts.model");
  const agentType = optionalText(options.agentType, "agent() opts.agentType");
  const isolation = optionalText(options.isolation, "agent() opts.isolation");
  if (isolation !== undefined && isolation !== "worktree") {
    throw new Error("agent() opts.isolation must be \\"worktree\\".");
  }
  const gate = optionalText(options.gate, "agent() opts.gate");
  const resume = optionalText(options.resume, "agent() opts.resume");
  const effort = optionalText(options.effort, "agent() opts.effort");
  const schema = options.schema;
  if (schema !== undefined) {
    if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
      throw new Error("agent() opts.schema must be a JSON Schema object.");
    }
    // Structured clone would happily carry a Map or a cycle that neither the
    // journal key nor the tool's parameters can survive. Same check the return
    // value gets.
    checkBoundary(schema, "agent() opts.schema");
  }
  if (effort !== undefined && EFFORT_LEVELS.indexOf(effort) === -1) {
    throw new Error("agent() opts.effort must be one of: " + EFFORT_LEVELS.join(", ") + ".");
  }

  // resume revives a child that already exists, so anything describing how to
  // *start* one is not a thing this call gets to decide — the revived child
  // keeps the agent, model and tool contract it was started with. Rejecting is
  // the point: silently ignoring these opts would look like they applied.
  if (resume !== undefined) {
    if (agentType !== undefined) {
      throw new Error(
        "agent() opts.resume and opts.agentType are mutually exclusive: a resumed agent keeps the agent type it was started with."
      );
    }
    if (model !== undefined) {
      throw new Error(
        "agent() opts.resume and opts.model are mutually exclusive: a resumed agent keeps the model it was started with."
      );
    }
    if (isolation !== undefined) {
      throw new Error(
        "agent() opts.resume and opts.isolation are mutually exclusive: a resumed agent keeps the working tree it was started in."
      );
    }
    if (effort !== undefined) {
      throw new Error(
        "agent() opts.resume and opts.effort are mutually exclusive: a resumed agent keeps the reasoning effort it was started with."
      );
    }
    if (schema !== undefined) {
      throw new Error(
        "agent() opts.resume and opts.schema are mutually exclusive: a resumed child re-prompts the session it "
          + "already had, whose tool set was fixed when it started — it has no StructuredOutput tool to answer through."
      );
    }
    if (gate !== undefined) {
      throw new Error("agent() opts.gate cannot be combined with opts.resume.");
    }
  }

  // An explicit opts.phase files this agent under that phase without moving
  // the ambient one, so a stray verify step does not re-point the phases that
  // follow it.
  const phaseIndex = phaseName !== undefined ? definePhaseIn(scope, phaseName) : scope.ambientPhaseIndex;
  const phaseTitle = phaseName !== undefined ? scopedTitle(scope, phaseName) : scope.ambientPhaseTitle;

  const result = await callHost("agent", {
    prompt: text,
    label: label,
    model: model,
    agentType: agentType,
    isolation: isolation,
    phaseIndex: phaseIndex,
    phaseTitle: phaseTitle,
    gate: gate,
    resume: resume,
    effort: effort,
    schema: schema,
  });
  if (result === undefined || result === null) return null;
  if (schema === undefined) return result;
  // Parsed with the realm's own JSON.parse so the script gets an object whose
  // prototype is its own — \`x instanceof Object\` and \`x.list instanceof Array\`
  // both hold, and it survives assertBoundary if the script returns it.
  try {
    return realmParse(result);
  } catch (error) {
    logIn(scope, "agent(): the host returned a structured result that is not JSON");
    return null;
  }
}

/**
 * A barrier: every thunk starts now, and nothing past the await runs until all
 * of them have settled. A thunk that throws resolves to null rather than
 * failing its siblings — the script filters, it does not try/catch.
 */
async function parallel(thunks) {
  const list = toList(thunks, "parallel(thunks)");
  for (let i = 0; i < list.length; i++) {
    if (typeof list[i] !== "function") {
      throw new Error("parallel(thunks) expects an array of functions; item " + i + " is not one.");
    }
  }
  const settled = await Promise.all(
    list.map(async function (thunk) {
      try {
        return await thunk();
      } catch (error) {
        if (isFatal(error)) throw error;
        return null;
      }
    })
  );
  return toRealmArray(settled);
}

/**
 * No barrier between stages. Each item walks its own chain, so item A can be
 * in stage 3 while item B is still in stage 1 — which is the whole point:
 * a barrier makes every stage wait on its slowest sibling, and with agents in
 * the stages that latency is measured in minutes.
 *
 * A stage that throws drops that item to null and skips its remaining stages.
 * Every stage sees (previousResult, originalItem, index).
 */
async function pipeline(items, ...stages) {
  const list = toList(items, "pipeline(items, ...stages)");
  for (let i = 0; i < stages.length; i++) {
    if (typeof stages[i] !== "function") {
      throw new Error("pipeline(items, ...stages) expects stages to be functions; stage " + i + " is not one.");
    }
  }
  const settled = await Promise.all(
    list.map(async function (item, index) {
      let value = item;
      for (let s = 0; s < stages.length; s++) {
        try {
          value = await stages[s](value, item, index);
        } catch (error) {
          if (isFatal(error)) throw error;
          return null;
        }
      }
      return value;
    })
  );
  return toRealmArray(settled);
}

/**
 * The \`workflow(nameOrRef, args?)\` global.
 *
 * Runs another workflow inline. The child executes in *this* worker and *this*
 * vm context, as a function whose parameters shadow the globals — which is why
 * it shares the run's concurrency cap, agent counter, abort signal, journal and
 * budget without any of them being passed anywhere: there is only ever one of
 * each. What it does not share is ambient phase state, which lives on the scope.
 *
 * One level only, as in Claude Code. The child's \`workflow\` is present and
 * throws rather than absent, so the error names the limit instead of reading
 * \`workflow is not defined\`.
 */
async function workflowIn(scope, nameOrRef, args) {
  if (scope.depth > 0) {
    throw new Error(
      "workflow() cannot be nested more than one level deep — you are already inside the workflow '" +
        scope.name + "'. Call the agents inline instead."
    );
  }

  let ref;
  if (typeof nameOrRef === "string") {
    if (nameOrRef.trim() === "") throw new Error("workflow(nameOrRef) expects a non-empty name.");
    ref = { name: nameOrRef };
  } else if (nameOrRef && typeof nameOrRef === "object" && !Array.isArray(nameOrRef)) {
    const scriptPath = optionalText(nameOrRef.scriptPath, "workflow() scriptPath");
    const name = optionalText(nameOrRef.name, "workflow() name");
    if (scriptPath === undefined && name === undefined) {
      throw new Error("workflow({ ... }) expects a \`name\` or a \`scriptPath\`.");
    }
    ref = { name: name, scriptPath: scriptPath };
  } else {
    throw new Error("workflow(nameOrRef) expects a saved workflow name or { scriptPath }.");
  }

  const label = ref.name !== undefined ? ref.name : ref.scriptPath;
  if (args !== undefined) checkBoundary(args, 'workflow("' + label + '") args');

  if (nestedCount >= workerData.nestedCap) {
    // Fatal, like the agent cap: a limit that silently drops work would be
    // worse than no limit.
    const error = new Error(
      "Workflow exceeded its cap of " + workerData.nestedCap + " nested workflow() calls."
    );
    error.workflowFatal = true;
    throw error;
  }
  nestedCount++;

  let loaded;
  try {
    loaded = await callHost("workflow", ref);
  } catch (error) {
    // Resolution failures are the script's to handle — Claude Code documents
    // workflow() as throwing on an unknown name so a script can catch it.
    // Attributed, so a caught error says which reference failed.
    if (isFatal(error)) throw error;
    throw new Error('workflow("' + label + '"): ' + describe(error));
  }

  const child = makeScope(loaded.name, scope.depth + 1);
  // The child's own group, defined before its first agent so a child that never
  // calls phase() still reads as its own section rather than falling into the
  // parent's un-phased bucket.
  child.ambientPhaseIndex = definePhaseIn(child, undefined);
  child.ambientPhaseTitle = scopedTitle(child, undefined);

  let run;
  try {
    const compiled = new vm.Script(
      // \`meta\` is deliberately not a parameter: the body still opens with its
      // own \`const meta = { ... }\` (extractMeta strips only the \`export\`), so a
      // parameter of that name would collide with it.
      "(async (agent, phase, log, workflow, console, args) => {" + PRELUDE + loaded.body + "\\n})",
      { filename: "workflow:" + loaded.name + ".js" }
    );
    run = compiled.runInContext(realmContext);
  } catch (error) {
    throw new Error('workflow("' + label + '"): ' + describe(error));
  }

  const value = await run(child.agent, child.phase, child.log, child.workflow, child.console, args);
  checkBoundary(value, 'the result of workflow("' + label + '")');
  return value;
}

/**
 * The \`budget\` global.
 *
 * \`total\` is permanently null, and that is the honest answer rather than a
 * stub: Claude Code fills it from the user's "+500k" directive and pi has no
 * such directive, so "no target set" is the state this runtime is always in.
 * Every pattern Claude Code documents guards on exactly that — \`while
 * (budget.total && ...)\`, \`budget.total ? ... : 5\` — so those scripts run here
 * unchanged and take the branch they were written for. Leaving \`budget\`
 * undefined instead would turn a graceful guard into a ReferenceError.
 *
 * \`spent()\` is real. It differs from Claude Code's in scope: theirs pools the
 * main loop and every workflow in the turn, ours counts this run's agents.
 */
function makeBudget() {
  return {
    total: null,
    spent: function () {
      return spentOutput;
    },
    remaining: function () {
      // Infinity, not a number, because there is no target to subtract from.
      return Infinity;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

async function main() {
  rootScope = makeScope(undefined, 0);
  const sandbox = {
    agent: rootScope.agent,
    parallel: parallel,
    pipeline: pipeline,
    phase: rootScope.phase,
    log: rootScope.log,
    workflow: rootScope.workflow,
    budget: makeBudget(),
    console: rootScope.console,
  };
  const context = vm.createContext(sandbox, {
    name: "workflow",
    codeGeneration: { strings: false, wasm: false },
  });

  realmObjectPrototype = vm.runInContext("Object.prototype", context);
  realmNewArray = vm.runInContext("(function () { return []; })", context);
  realmPush = vm.runInContext("(function (array, value) { array.push(value); })", context);
  realmParse = vm.runInContext("JSON.parse", context);
  realmContext = context;

  // meta and args are materialised *inside* the realm rather than injected, so
  // the script sees objects whose prototype is its own Object.prototype and
  // whose .constructor is its own Function.
  sandbox.meta = realmParse(workerData.metaJson);
  sandbox.args = workerData.argsJson === undefined ? undefined : realmParse(workerData.argsJson);

  // The wrapper and prelude share the body's first line (see PRELUDE), so a
  // thrown error points at the line the author wrote with no lineOffset.
  const script = new vm.Script("(async () => {" + PRELUDE + workerData.body + "\\n})()", {
    filename: "workflow.js",
  });

  const value = await script.runInContext(context);
  checkBoundary(value, "the workflow result");
  flushProgress();
  port.postMessage({
    type: "complete",
    resultJson: value === undefined ? undefined : JSON.stringify(value),
  });
}

main().catch(function (error) {
  flushProgress();
  port.postMessage({
    type: "error",
    message: error && error.message ? String(error.message) : String(error),
    stack: error && error.stack ? String(error.stack) : undefined,
  });
});
`;

// dist/workflow/runtime.js
var WORKFLOW_AGENT_CAP = 1000;
var WORKFLOW_ITEM_CAP = 4096;
var WORKFLOW_NESTED_CAP = 256;
var PREVIEW_LENGTH = 200;

class WorkflowRuntimeError extends Error {
}
function workflowConcurrency(cpuCount = cpus().length) {
  return Math.max(1, Math.min(16, cpuCount - 2));
}
function boundaryError(what, path) {
  return new WorkflowRuntimeError(`Cannot pass ${what} across the workflow VM boundary (at ${path}).`);
}
function walk(value, path, seen) {
  if (value === null)
    return;
  const kind = typeof value;
  if (kind === "string" || kind === "boolean")
    return;
  if (kind === "number") {
    if (!Number.isFinite(value))
      throw boundaryError("a non-finite number", path);
    return;
  }
  if (kind === "undefined") {
    if (path === "args")
      return;
    throw boundaryError("undefined", path);
  }
  if (kind === "bigint")
    throw boundaryError("a BigInt", path);
  if (kind === "symbol")
    throw boundaryError("a symbol", path);
  if (kind === "function")
    throw boundaryError("a function", path);
  if (kind !== "object")
    throw boundaryError(`a ${kind}`, path);
  const object = value;
  if (seen.has(object))
    throw boundaryError("a circular structure", path);
  seen.add(object);
  if (Object.getOwnPropertySymbols(object).length > 0) {
    throw boundaryError("an object with symbol keys", path);
  }
  if (Array.isArray(object)) {
    for (let i = 0;i < object.length; i++) {
      if (!Object.hasOwn(object, i))
        throw boundaryError("a sparse array", `${path}[${i}]`);
      walk(object[i], `${path}[${i}]`, seen);
    }
    seen.delete(object);
    return;
  }
  const prototype = Object.getPrototypeOf(object);
  if (prototype !== null && prototype !== Object.prototype) {
    throw boundaryError("a non-plain object", path);
  }
  for (const [key, entry] of Object.entries(object)) {
    walk(entry, `${path}.${key}`, seen);
  }
  seen.delete(object);
}
function assertBoundarySafe(value, path) {
  walk(value, path, new Set);
}

class Semaphore {
  limit;
  active = 0;
  waiters = [];
  constructor(limit) {
    this.limit = limit;
  }
  acquire() {
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve4) => {
      this.waiters.push(resolve4);
    });
  }
  release() {
    const next = this.waiters.shift();
    if (next)
      next();
    else
      this.active--;
  }
  drain() {
    while (this.waiters.length > 0) {
      const next = this.waiters.shift();
      next?.();
    }
  }
}
var CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
var preview = (text) => text.length <= PREVIEW_LENGTH ? text : `${text.slice(0, PREVIEW_LENGTH - 1)}…`;
function derivedLabel(prompt) {
  const line = prompt.split(`
`, 1)[0].trim();
  return line.length <= 60 ? line || "agent" : `${line.slice(0, 59)}…`;
}
function applySchema(result, compiled) {
  let parsed;
  try {
    parsed = JSON.parse(result.text ?? "");
  } catch {
    return {
      ...result,
      ok: false,
      error: "The agent did not return structured output: its answer was not JSON."
    };
  }
  const verdict = compiled.check(parsed);
  if (verdict === true)
    return result;
  return {
    ...result,
    ok: false,
    error: `The agent's answer did not match the requested schema: ${verdict}`
  };
}
function withScriptLocation(message, stack) {
  if (stack === undefined)
    return message;
  const frame = /(workflow(?::[^\s():]+)?\.js):(\d+):(\d+)/.exec(stack);
  if (frame === null)
    return message;
  const location = `${frame[1]}:${frame[2]}:${frame[3]}`;
  return message.includes(location) ? message : `${message} (at ${location})`;
}
async function applyGate(result, command, agentId, runGate, signal) {
  const outcome = result.gate ?? await runGate(command, {
    agentId,
    signal,
    ...result.cwd !== undefined ? { cwd: result.cwd } : {}
  });
  const { gate: _ran, ...kept } = result;
  if (outcome.ok)
    return kept;
  const { text: _discarded, ...rest } = kept;
  const output = outcome.output.trim();
  return { ...rest, ok: false, error: output === "" ? `Gate command failed: ${command}` : tailText(output) };
}
function unawaitedLaunchMessage(labels) {
  const list = labels.map((label) => `'${label}'`).join(", ");
  return `workflow script completed with unawaited agent launch(es): ${list}. Await or return each launch.`;
}
function validateScript(script) {
  if (script.length > MAX_SCRIPT_LENGTH) {
    throw new WorkflowRuntimeError(`Workflow script is ${script.length} characters, over the limit of ${MAX_SCRIPT_LENGTH}.`);
  }
  if (CONTROL_CHARACTERS.test(script)) {
    throw new WorkflowRuntimeError("Workflow script contains control characters. Only tab, carriage return and newline are allowed.");
  }
  return extractMeta(script);
}
async function runWorkflow(options) {
  const { script, host } = options;
  assertBoundarySafe(options.args, "args");
  const { meta, body } = validateScript(script);
  const agentCap = options.agentCap ?? WORKFLOW_AGENT_CAP;
  const itemCap = options.itemCap ?? WORKFLOW_ITEM_CAP;
  const semaphore = new Semaphore(options.concurrency ?? workflowConcurrency());
  const progress = [];
  const inflight = new Set;
  const completedByLabel = new Map;
  const openLaunches = new Map;
  let agentCount = 0;
  let aborted = false;
  let settled = false;
  const runAbort = new AbortController;
  const journalEntries = options.journal?.entries ?? [];
  const recordJournal = options.journal?.append;
  const journalResumes = journalEntries.some((entry) => entry.resumed && entry.ref === undefined);
  let prefixIntact = journalEntries.length > 0 && !journalResumes;
  let replayedCount = 0;
  const liveAgents = new Map;
  let spentOutputTokens = 0;
  let paused = false;
  const isPaused = () => paused;
  const pauseWaiters = new Set;
  function releasePause() {
    for (const wake of [...pauseWaiters])
      wake();
    pauseWaiters.clear();
  }
  function pauseGate(live) {
    if (!paused || aborted || settled)
      return Promise.resolve();
    return new Promise((resolve4) => {
      const wake = () => {
        pauseWaiters.delete(wake);
        live.wake = undefined;
        resolve4();
      };
      live.wake = wake;
      pauseWaiters.add(wake);
    });
  }
  options.onControl?.({
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
      releasePause();
    },
    isPaused: () => paused,
    skip: (index) => {
      const live = liveAgents.get(index);
      if (live === undefined || live.intent !== undefined)
        return false;
      live.intent = "skip";
      if (live.started)
        host.abortAgent(live.agentId);
      else
        live.wake?.();
      return true;
    },
    retry: (index) => {
      const live = liveAgents.get(index);
      if (live === undefined || !live.started || live.intent !== undefined)
        return false;
      live.intent = "retry";
      host.abortAgent(live.agentId);
      return true;
    }
  });
  function replayAt(index, key) {
    if (!prefixIntact)
      return;
    const entry = journalEntries[index];
    if (entry === undefined || entry.index !== index || entry.key !== key || !entry.ok) {
      prefixIntact = false;
      return;
    }
    return entry;
  }
  const worker = new Worker(WORKER_SOURCE, {
    eval: true,
    workerData: {
      body,
      metaJson: JSON.stringify(meta),
      argsJson: options.args === undefined ? undefined : JSON.stringify(options.args),
      itemCap,
      nestedCap: options.nestedCap ?? WORKFLOW_NESTED_CAP
    }
  });
  return await new Promise((resolve4) => {
    const emit = (entries) => {
      if (entries.length === 0)
        return;
      appendProgress(progress, entries);
      options.onProgress?.(entries);
    };
    const respond = (callId, ok, value, error, fatal) => {
      openLaunches.delete(callId);
      if (settled)
        return;
      worker.postMessage({ type: "response", callId, ok, value, error, fatal, spent: spentOutputTokens });
    };
    const finish = (result) => {
      if (settled)
        return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      releasePause();
      for (const agentId of inflight)
        host.abortAgent(agentId);
      inflight.clear();
      runAbort.abort();
      semaphore.drain();
      const settle = () => resolve4({ ...result, meta, progress, agentCount, replayedCount });
      worker.terminate().then(settle, settle);
    };
    function onAbort() {
      aborted = true;
      finish({ status: "killed", error: "Workflow aborted." });
    }
    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
    }
    async function handleAgent(callId, payload) {
      const runGate = host.runGate?.bind(host);
      const resumeAgent2 = host.resumeAgent?.bind(host);
      if (payload.gate !== undefined && runGate === undefined) {
        respond(callId, false, undefined, "This workflow host cannot run gate commands.", true);
        return;
      }
      if (payload.resume !== undefined && resumeAgent2 === undefined) {
        respond(callId, false, undefined, "This workflow host cannot resume agents.", true);
        return;
      }
      let resumed;
      if (payload.resume !== undefined) {
        resumed = completedByLabel.get(payload.resume);
        if (resumed === undefined) {
          const known = [...completedByLabel.keys()];
          respond(callId, false, undefined, replayedCount > 0 ? `agent() opts.resume: "${payload.resume}" was replayed from the resume journal, not run, so there is ` + "no conversation in this run to continue. Re-run without resumeFromRunId." : `agent() opts.resume: no agent has completed under the label "${payload.resume}" in this run. ${known.length === 0 ? "No agent has completed yet." : `Known labels: ${known.map((label2) => `"${label2}"`).join(", ")}.`}`, true);
          return;
        }
      }
      let compiledSchema;
      if (payload.schema !== undefined) {
        const compilation = compileJsonSchema(payload.schema);
        if (!compilation.ok) {
          respond(callId, false, undefined, compilation.message, true);
          return;
        }
        compiledSchema = compilation.compiled;
      }
      if (agentCount >= agentCap) {
        respond(callId, false, undefined, `Workflow exceeded its cap of ${agentCap} agents.`, true);
        return;
      }
      const index = agentCount++;
      const agentId = resumed?.agentId ?? `wf-agent-${index}`;
      const label = payload.label ?? resumed?.label ?? derivedLabel(payload.prompt);
      const agentType = resumed?.agentType ?? payload.agentType ?? "general-purpose";
      const model = resumed !== undefined ? resumed.model : payload.model;
      const isolation = resumed !== undefined ? resumed.isolation : payload.isolation;
      openLaunches.set(callId, label);
      const base = {
        type: "workflow_agent",
        index,
        label,
        state: "start",
        agentId,
        agentType,
        promptPreview: preview(payload.prompt),
        ...model !== undefined ? { model } : {},
        ...isolation !== undefined ? { isolation } : {},
        ...payload.phaseIndex !== undefined ? { phaseIndex: payload.phaseIndex } : {},
        ...payload.phaseTitle !== undefined ? { phaseTitle: payload.phaseTitle } : {}
      };
      const queuedAt = Date.now();
      emit([{ ...base, queuedAt }]);
      const keyInput = {
        ...payload,
        schema: payload.schema !== undefined ? JSON.stringify(payload.schema) : undefined
      };
      let replayed = replayAt(index, journalKey(keyInput));
      if (replayed !== undefined && compiledSchema !== undefined) {
        const recheck = applySchema({ ok: true, text: replayed.text ?? "" }, compiledSchema);
        if (!recheck.ok) {
          prefixIntact = false;
          replayed = undefined;
        }
      }
      if (replayed !== undefined) {
        replayedCount++;
        const replayedText = replayed.text ?? "";
        const at = Date.now();
        emit([
          {
            ...base,
            queuedAt,
            startedAt: at,
            lastProgressAt: at,
            durationMs: 0,
            state: "done",
            cached: true,
            resultPreview: preview(replayedText)
          }
        ]);
        openLaunches.delete(callId);
        if (replayed.ref !== undefined) {
          completedByLabel.set(label, {
            agentId,
            label,
            agentType,
            ...model !== undefined ? { model } : {},
            ...isolation !== undefined ? { isolation } : {},
            recordId: replayed.ref
          });
        }
        recordJournal?.({
          index,
          key: replayed.key,
          ok: true,
          text: replayedText,
          ...replayed.resumed ? { resumed: true } : {},
          ...replayed.ref !== undefined ? { ref: replayed.ref } : {}
        });
        respond(callId, true, replayedText);
        return;
      }
      const key = journalKey(keyInput);
      const resumeMark = payload.resume !== undefined ? { resumed: true } : {};
      const settleSkipped = (extra) => {
        recordJournal?.({ index, key, ok: false, ...resumeMark });
        emit([{ ...base, queuedAt, ...extra, state: "error", skipped: true, error: "Skipped by user." }]);
        respond(callId, true, null);
      };
      const live = { agentId, started: false };
      liveAgents.set(index, live);
      const intent = () => live.intent;
      let attempt = 1;
      try {
        for (;; ) {
          await pauseGate(live);
          if (intent() === "skip")
            return settleSkipped({});
          await semaphore.acquire();
          if (aborted || settled) {
            semaphore.release();
            respond(callId, false, undefined, "Workflow aborted.", true);
            return;
          }
          if (isPaused() && !aborted && !settled) {
            semaphore.release();
            continue;
          }
          if (intent() === "skip") {
            semaphore.release();
            return settleSkipped({});
          }
          const attemptMark = attempt > 1 ? { attempt, lastAttemptReason: "user-retry" } : {};
          const startedAt = Date.now();
          emit([{ ...base, queuedAt, startedAt, ...attemptMark }]);
          const onResolved = (info) => {
            if (info.recordId !== undefined)
              base.recordId = info.recordId;
            if (info.modelName !== undefined)
              base.model = info.modelName;
            if (info.modelId !== undefined)
              base.modelId = info.modelId;
            if (info.thinking !== undefined)
              base.thinking = info.thinking;
            if (info.requestedThinking !== undefined)
              base.requestedThinking = info.requestedThinking;
            if (info.requestedModel !== undefined)
              base.requestedModel = info.requestedModel;
            if (!inflight.has(agentId))
              return;
            emit([{ ...base, queuedAt, startedAt, ...attemptMark, lastProgressAt: Date.now() }]);
          };
          live.started = true;
          inflight.add(agentId);
          let result;
          try {
            result = resumed !== undefined && resumeAgent2 !== undefined ? await resumeAgent2(resumed.agentId, payload.prompt, onResolved, resumed.recordId) : await host.spawnAgent({
              agentId,
              index,
              prompt: payload.prompt,
              label,
              agentType,
              ...model !== undefined ? { model } : {},
              ...payload.effort !== undefined ? { effort: payload.effort } : {},
              ...compiledSchema !== undefined ? { schema: compiledSchema } : {},
              ...isolation !== undefined ? { isolation } : {},
              ...payload.phaseIndex !== undefined ? { phaseIndex: payload.phaseIndex } : {},
              ...payload.phaseTitle !== undefined ? { phaseTitle: payload.phaseTitle } : {},
              ...payload.gate !== undefined ? { gate: payload.gate } : {},
              onResolved,
              signal: runAbort.signal
            });
            if (result.ok) {
              completedByLabel.set(label, {
                agentId,
                label,
                agentType,
                ...model !== undefined ? { model } : {},
                ...isolation !== undefined ? { isolation } : {},
                ...base.recordId !== undefined ? { recordId: base.recordId } : {}
              });
              if (compiledSchema !== undefined && result.ok) {
                result = applySchema(result, compiledSchema);
              }
              if (result.ok && payload.gate !== undefined && runGate !== undefined) {
                result = await applyGate(result, payload.gate, agentId, runGate, runAbort.signal);
              }
            }
          } catch (error) {
            result = { ok: false, error: error instanceof Error ? error.message : String(error) };
          } finally {
            inflight.delete(agentId);
            live.started = false;
            semaphore.release();
          }
          if (settled)
            return;
          if (intent() === "retry" && !aborted) {
            live.intent = undefined;
            attempt++;
            emit([{ ...base, queuedAt, attempt, lastAttemptReason: "user-retry" }]);
            continue;
          }
          spentOutputTokens += result.outputTokens ?? 0;
          const finishedAt = Date.now();
          const common = {
            ...base,
            queuedAt,
            startedAt,
            ...attemptMark,
            lastProgressAt: finishedAt,
            durationMs: finishedAt - startedAt,
            ...result.tokens !== undefined ? { tokens: result.tokens } : {},
            ...result.toolCalls !== undefined ? { toolCalls: result.toolCalls } : {},
            ...result.branch !== undefined ? { branch: result.branch } : {},
            ...result.worktreePath !== undefined ? { worktreePath: result.worktreePath } : {}
          };
          if (result.ok) {
            const text = result.text ?? "";
            emit([{ ...common, state: "done", resultPreview: preview(text) }]);
            recordJournal?.({
              index,
              key,
              ok: true,
              text,
              ...resumeMark,
              ...base.recordId !== undefined ? { ref: base.recordId } : {}
            });
            respond(callId, true, text);
            return;
          }
          recordJournal?.({ index, key, ok: false, ...resumeMark });
          emit([
            {
              ...common,
              state: "error",
              error: tailText(result.error ?? "Agent failed."),
              ...result.skipped ? { skipped: true } : {}
            }
          ]);
          respond(callId, true, null);
          return;
        }
      } finally {
        liveAgents.delete(index);
      }
    }
    async function handleLoadWorkflow(callId, ref) {
      const loadWorkflow = host.loadWorkflow?.bind(host);
      if (loadWorkflow === undefined) {
        respond(callId, false, undefined, "This workflow host cannot run nested workflows.", true);
        return;
      }
      let source;
      try {
        source = await loadWorkflow(ref);
      } catch (error) {
        respond(callId, false, undefined, error instanceof Error ? error.message : String(error));
        return;
      }
      if (!source.ok) {
        respond(callId, false, undefined, source.message);
        return;
      }
      try {
        const child = validateScript(source.script);
        respond(callId, true, {
          name: child.meta.name,
          metaJson: JSON.stringify(child.meta),
          body: child.body
        });
      } catch (error) {
        respond(callId, false, undefined, error instanceof Error ? error.message : String(error));
      }
    }
    worker.on("message", (message) => {
      if (settled)
        return;
      switch (message.type) {
        case "progress":
          emit(message.entries);
          break;
        case "call":
          if (message.method === "workflow") {
            handleLoadWorkflow(message.callId, message.payload);
            break;
          }
          if (message.method !== "agent") {
            respond(message.callId, false, undefined, `Unknown workflow host method "${message.method}".`, true);
            break;
          }
          handleAgent(message.callId, message.payload);
          break;
        case "complete": {
          const unawaited = [...openLaunches.values()];
          if (unawaited.length > 0) {
            finish({ status: "failed", error: unawaitedLaunchMessage(unawaited) });
            break;
          }
          finish({
            status: "completed",
            ...message.resultJson === undefined ? {} : { value: JSON.parse(message.resultJson) }
          });
          break;
        }
        case "error":
          finish({ status: "failed", error: withScriptLocation(message.message, message.stack) });
          break;
      }
    });
    worker.on("error", (error) => {
      finish({ status: "failed", error: error instanceof Error ? error.message : String(error) });
    });
    worker.on("exit", () => {
      finish({ status: "failed", error: "Workflow worker exited before completing." });
    });
  });
}

// dist/workflow/tool-description.js
var fullWorkflowToolDescription = `Execute a workflow script that orchestrates multiple subagents deterministically. Workflows run in the background — this tool returns immediately with a task ID, and you are notified when the workflow completes. Use /agents → Workflows to watch live progress.

A workflow structures work across many agents — to be comprehensive (decompose and cover in parallel), to be confident (independent perspectives and adversarial checks before committing), or to take on scale one context can't hold (migrations, audits, broad sweeps). The script is where you encode that structure: what fans out, what verifies, what synthesizes.

ONLY call this tool when the user has explicitly opted into multi-agent orchestration. Workflows can spawn dozens of agents and consume a large amount of tokens; the user must request that scale, not have it inferred. Explicit opt-in means one of:
- The user directly asked you to run a workflow or use multi-agent orchestration in their own words ("use a workflow", "run a workflow", "fan out agents", "orchestrate this with subagents"). The ask must be in the user's words — a task that would merely benefit from a workflow does not count.
- The user invoked a skill or slash command whose instructions tell you to call SubagentWorkflow.
- The user asked you to run a specific named or saved workflow.

For any other task — even one that would clearly benefit from parallelism — do NOT call this tool. Use the Agent tool for individual subagents, or briefly describe what a multi-agent workflow could do and how much it would roughly cost, and ask the user whether to run it. Mention they can ask for one with "use a workflow" in a future message to skip the ask.

When you do call it, the right move is often **hybrid**: scout inline first (list the files, find the channels, scope the diff) to discover the work-list, then call SubagentWorkflow to pipeline over it. You don't need to know the shape before the *task* — only before the *orchestration step*.

Common single-phase workflows you can chain across turns:
- **Understand** — parallel readers over relevant subsystems → structured map
- **Design** — judge panel of N independent approaches → scored synthesis
- **Review** — dimensions → find → adversarially verify (example below)
- **Research** — multi-modal sweep → deep-read → synthesize
- **Migrate** — discover sites → transform each (worktree isolation) → verify

For larger work, run several in sequence — read each result before deciding the next phase. You stay in the loop; each workflow is one well-scoped fan-out.

Pass the script inline via \`script\` — do not Write it to a file first. Every invocation automatically persists its script to a file under the session directory and returns the path in the tool result. To iterate on a workflow, edit that file with Write/Edit and re-invoke SubagentWorkflow with \`{scriptPath: "<path>"}\` instead of resending the full script. A script you will run more than once belongs in \`.pi/workflows/<name>.js\` (or \`.agents/workflows/\`, or \`<agent dir>/workflows/\` for one that follows the user everywhere); call it with \`name: "<name>"\` instead of re-sending the source.

Every script must begin with \`export const meta = {...}\`:
  export const meta = {
    name: 'find-flaky-tests',
    description: 'Find flaky tests and propose fixes',   // one-line, shown in permission dialog
    phases: [                                            // one entry per phase() call
      { title: 'Scan', detail: 'grep test logs for retries' },
      { title: 'Fix', detail: 'one agent per flaky test' },
    ],
  }
  // script body starts here — use agent()/parallel()/pipeline()/phase()/log()
  phase('Scan')
  const flaky = await agent('grep CI logs for retry markers', {schema: FLAKY_SCHEMA})
  ...

The \`meta\` object must be a PURE LITERAL — no variables, function calls, spreads, or template interpolation. Required fields: \`name\`, \`description\`. Optional: \`whenToUse\` (shown in the workflow list), \`phases\`. Use the SAME phase titles in meta.phases as in phase() calls — titles are matched exactly; a phase() call with no matching meta entry just gets its own progress group. Add \`model\` to a phase entry when that phase uses a specific model override.

Script body hooks:
- agent(prompt: string, opts?: {label?: string, phase?: string, schema?: object, model?: string, effort?: string, isolation?: 'worktree', agentType?: string, gate?: string, resume?: string}): Promise<any> — spawn a subagent. Without schema, returns its final text as a string. With schema (a JSON Schema), the subagent is given a StructuredOutput tool built from it and agent() returns the validated object — no parsing needed. A payload that does not match is rejected back to the child, which corrects it; a child that never answers through the tool gets one more prompt and then fails, so the call returns null — filter after every schema stage. Returns null if the user skips the agent mid-run or the subagent dies on a terminal API error after retries (filter with .filter(Boolean)). opts.label overrides the display label. opts.phase explicitly assigns this agent to a progress group (use this inside pipeline()/parallel() stages to avoid races on the global phase() state — same phase string → same group box). opts.model overrides the model for this agent call. Default to omitting it — the agent inherits the main-loop model (the resolved session model), which is almost always correct. Only set it when you're highly confident a different tier fits the task; when unsure, omit. opts.effort overrides the reasoning effort for this agent call ('minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max') — omit to inherit the agent definition's own level, then the parent's; use 'low' for cheap mechanical stages and higher tiers only for the hardest verify/judge stages. opts.isolation: 'worktree' runs the agent in a fresh git worktree — EXPENSIVE (setup time + disk per agent), use ONLY when agents mutate files in parallel and would otherwise conflict; the worktree is removed when the agent settles, its changes preserved on a branch. opts.gate: '<command>' runs a shell command after the agent finishes and requires it to pass — a non-zero exit marks the agent failed and the command's output becomes the error; prefer gate: 'npm test' over asking another agent whether the code looks right. opts.resume: '<label>' continues the child that ran under that label instead of starting fresh, so an iterative loop keeps its context — it cannot be combined with agentType, model, effort, isolation, gate or schema. opts.agentType uses a custom subagent type instead of the default workflow subagent — resolved from the same registry as the Agent tool; composes with schema. Available types:
{{typeList}}
- pipeline(items, stage1, stage2, ...): Promise<any[]> — run each item through all stages independently, NO barrier between stages. Item A can be in stage 3 while item B is still in stage 1. This is the DEFAULT for multi-stage work. Wall-clock = slowest single-item chain, not sum-of-slowest-per-stage. Every stage callback receives (prevResult, originalItem, index) — use originalItem/index in later stages to label work without threading context through stage 1's return value. A stage that throws drops that item to \`null\` and skips its remaining stages.
- parallel(thunks: Array<() => Promise<any>>): Promise<any[]> — run tasks concurrently. This is a BARRIER: awaits all thunks before returning. A thunk that throws (or whose agent errors) resolves to \`null\` in the result array, so \`.filter(Boolean)\` before using the results; only a fatal run error — a cap breach, or a nested workflow that could not load — propagates instead of being folded into a null. Use ONLY when you genuinely need all results together.
- log(message: string): void — emit a progress message to the user (shown as a narrator line above the progress tree)
- phase(title: string): void — start a new phase; subsequent agent() calls are grouped under this title in the progress display
- args: any — the value passed as SubagentWorkflow's \`args\` input, verbatim (undefined if not provided). Pass arrays/objects as actual JSON values in the tool call, NOT as a JSON-encoded string — \`args: ["a.ts", "b.ts"]\`, not \`args: "[\\"a.ts\\", ...]"\` (a stringified list reaches the script as one string, so \`args.filter\`/\`args.map\` throw). Use this to parameterize named workflows — e.g. pass a research question, target path, or config object directly instead of via a side-channel file.
- budget: {total: number|null, spent(): number, remaining(): number} — \`budget.total\` is always null here: it comes from a token-target directive pi does not have, so guards like \`while (budget.total && budget.remaining() > 50_000) { ... }\` correctly do not fire rather than throwing on a missing global. \`budget.spent()\` returns output tokens spent by this run's agents. \`budget.remaining()\` returns \`Infinity\` with no target.
- workflow(nameOrRef: string | {scriptPath: string}, args?: any): Promise<any> — run another workflow inline as a sub-step and return whatever it returns. Pass a name to invoke a saved workflow (same registry as {name: "..."}), or {scriptPath} to run a script file you Wrote earlier. The child shares this run's concurrency cap, agent counter, abort signal, and token budget — its agents appear under a "▸ name" group in /agents → Workflows and its tokens count toward budget.spent(). The args param becomes the child's \`args\` global. Nesting is one level only: workflow() inside a child throws. Throws on unknown name / unreadable scriptPath / child syntax error; catch to handle gracefully.

Any agent() option not listed above is rejected by name at the call.

Subagents are told their final text IS the return value (not a human-facing message), so they return raw data. For structured output, use the schema option — validation happens at the tool-call layer so the model retries on mismatch.

Scripts are plain JavaScript, NOT TypeScript — type annotations (\`: string[]\`), interfaces, and generics fail to parse. The script body runs in an async context — use await directly. Standard JS built-ins (JSON, Math, Array, etc.) are available — EXCEPT \`Date.now()\`/\`Math.random()\`/argless \`new Date()\`, which throw (they would break resume); pass timestamps in via \`args\`, stamp results after the workflow returns, and for randomness vary the agent prompt/label by index. \`eval\` and \`Function(...)\` throw. No filesystem or Node.js API access.

DEFAULT TO pipeline(). Only reach for a barrier (parallel between stages) when you genuinely need ALL prior-stage results together.

A barrier is correct ONLY when stage N needs cross-item context from all of stage N-1:
- Dedup/merge across the full result set before expensive downstream work
- Early-exit if the total count is zero ("0 bugs found → skip verification entirely")
- Stage N's prompt references "the other findings" for comparison

A barrier is NOT justified by:
- "I need to flatten/map/filter first" — do it inside a pipeline stage: pipeline(items, stageA, r => transform([r]).flat(), stageB)
- "The stages are conceptually separate" — that's what pipeline() models. Separate stages ≠ synchronized stages.
- "It's cleaner code" — barrier latency is real. If 5 finders run and the slowest takes 3× the fastest, a barrier wastes 2/3 of the fast finders' idle time.

Smell test: if you wrote
  const a = await parallel(...)
  const b = transform(a)        // flatten, map, filter — no cross-item dependency
  const c = await parallel(b.map(...))
that middle transform doesn't need the barrier. Rewrite as a pipeline with the transform inside a stage. When in doubt: pipeline.

Concurrent agent() calls are capped at min(16, available CPUs - 2) per workflow — excess calls queue and run as slots free up. You can still pass 100 items to parallel()/pipeline() and they all complete; only ~10 run at any moment. Total agent count across a workflow's lifetime is capped at 1000 — a runaway-loop backstop set far above any real workflow. A single parallel()/pipeline() call accepts at most 4096 items; passing more is an explicit error, not a silent truncation.

The script runs in a vm for determinism only: it is NOT a sandbox, and a script has the same host access as pi itself. Do the work through agent(); never use the script to reach the filesystem, network or process directly.

The canonical multi-stage pattern — pipeline by default, each dimension verifies as soon as its review completes:
  export const meta = {
    name: 'review-changes',
    description: 'Review changed files across dimensions, verify each finding',
    phases: [{ title: 'Review' }, { title: 'Verify' }],
  }
  const DIMENSIONS = [{key: 'bugs', prompt: '...'}, {key: 'perf', prompt: '...'}]
  const results = await pipeline(
    DIMENSIONS,
    d => agent(d.prompt, {label: \`review:\${d.key}\`, phase: 'Review', schema: FINDINGS_SCHEMA}),
    review => parallel(review.findings.map(f => () =>
      agent(\`Adversarially verify: \${f.title}\`, {label: \`verify:\${f.file}\`, phase: 'Verify', schema: VERDICT_SCHEMA})
        .then(v => ({...f, verdict: v}))
    ))
  )
  const confirmed = results.flat().filter(Boolean).filter(f => f.verdict?.isReal)
  return { confirmed }
  // Dimension 'bugs' findings verify while dimension 'perf' is still reviewing. No wasted wall-clock.

When a barrier IS correct — dedup across all findings before expensive verification:
  const all = await parallel(DIMENSIONS.map(d => () => agent(d.prompt, {schema: FINDINGS_SCHEMA})))
  const deduped = dedupeByFileAndLine(all.filter(Boolean).flatMap(r => r.findings))  // <-- genuinely needs ALL at once
  const verified = await parallel(deduped.map(f => () => agent(verifyPrompt(f), {schema: VERDICT_SCHEMA})))

Loop-until-count pattern — accumulate to a target:
  const bugs = []
  while (bugs.length < 10) {
    const result = await agent("Find bugs in this codebase.", {schema: BUGS_SCHEMA})
    bugs.push(...result.bugs)
    log(\`\${bugs.length}/10 found\`)
  }

Gate-and-retry pattern — verify by running, and keep the agent's context across attempts:
  let fixed = await agent('Find and fix the failing test.', {label: 'fix', gate: 'npm test'})
  if (fixed === null) {                        // a non-zero exit failed the agent
    // Resume keeps everything the child already learned. It cannot carry the
    // gate, so re-verification needs its own gated call, in the same tree.
    fixed = await agent('\`npm test\` is still failing. Fix the cause.', {label: 'fix', resume: 'fix'})
    const verified = await agent('Run \`npm test\` and report the result. Change nothing.',
      {label: 'verify', phase: 'Verify', gate: 'npm test', effort: 'low'})
    return { passed: verified !== null, summary: fixed }
  }
  return { passed: true, summary: fixed }
  // An LLM judging whether a fix works is a weaker signal than the test suite.

Composing patterns — exhaustive review (find → dedup vs seen → diverse-lens panel → loop-until-dry):
  const seen = new Set(), confirmed = []
  let dry = 0
  while (dry < 2) {                                              // loop-until-dry
    const found = (await parallel(FINDERS.map(f => () =>          // barrier: collect all finders this round
      agent(f.prompt, {phase: 'Find', schema: BUGS})))).filter(Boolean).flatMap(r => r.bugs)
    const fresh = found.filter(b => !seen.has(key(b)))           // dedup vs ALL seen — plain code, not an agent
    if (!fresh.length) { dry++; continue }
    dry = 0; fresh.forEach(b => seen.add(key(b)))
    const judged = await parallel(fresh.map(b => () =>           // every fresh bug judged concurrently...
      parallel(['correctness','security','repro'].map(lens => () =>   // ...each by 3 distinct lenses
        agent(\`Judge "\${b.desc}" via the \${lens} lens — real?\`, {phase: 'Verify', schema: VERDICT})))
        .then(vs => ({ b, real: vs.filter(Boolean).filter(v => v.real).length >= 2 }))))
    confirmed.push(...judged.filter(v => v.real).map(v => v.b))
  }
  return confirmed
  // dedup vs \`seen\`, NOT \`confirmed\` — else judge-rejected findings reappear every round and it never converges.

Quality patterns — common shapes; pick by task and compose freely:
- Adversarial verify: spawn N independent skeptics per finding, each prompted to REFUTE. Kill if ≥majority refute. Prevents plausible-but-wrong findings from surviving.
    const votes = await parallel(Array.from({length: 3}, () => () =>
      agent(\`Try to refute: \${claim}. Default to refuted=true if uncertain.\`, {schema: VERDICT})))
    const survives = votes.filter(Boolean).filter(v => !v.refuted).length >= 2
- Verify by running, not by asking: when a claim is testable, \`gate\` it rather than asking another model whether it holds.
- Perspective-diverse verify: when a finding can fail in more than one way, give each verifier a distinct lens (correctness, security, perf, does-it-reproduce) instead of N identical refuters — diversity catches failure modes redundancy can't.
- Judge panel: generate N independent attempts from different angles (e.g. MVP-first, risk-first, user-first), score with parallel judges, synthesize from the winner while grafting the best ideas from runners-up. Beats one-attempt-iterated when the solution space is wide.
- Loop-until-dry: for unknown-size discovery (bugs, issues, edge cases), keep spawning finders until K consecutive rounds return nothing new. Simple counters (while count < N) miss the tail.
- Multi-modal sweep: parallel agents each searching a different way (by-container, by-content, by-entity, by-time). Each is blind to what the others surface; useful when one search angle won't find everything.
- Completeness critic: a final agent that asks "what's missing — modality not run, claim unverified, source unread?" What it finds becomes the next round of work.
- No silent caps: if a workflow bounds coverage (top-N, no-retry, sampling), \`log()\` what was dropped — silent truncation reads as "covered everything" when it didn't.

Scale to what the user asked for. "find any bugs" → a few finders, single-vote verify. "thoroughly audit this" or "be comprehensive" → larger finder pool, 3–5 vote adversarial pass, synthesis stage. When unsure, lean toward thoroughness for research/review/audit requests and toward brevity for quick checks.

These patterns aren't exhaustive — compose novel harnesses when the task calls for it (tournament brackets, self-repair loops, staged escalation, whatever fits).

Use this tool for multi-step orchestration where control flow should be deterministic (loops, conditionals, fan-out) rather than model-driven.

## Resume

The tool result includes a runId. To resume after a pause, kill, or script edit, relaunch with SubagentWorkflow({scriptPath, resumeFromRunId}) — the longest unchanged prefix of agent() calls returns cached results instantly; the first edited/new call and everything after it runs live. Same script + same args → 100% cache hit. It is a prefix and not a lookup: a later call that still matches is not reused once an earlier one has changed. A journaled failure ends the prefix, so resuming a run that died at agent 5 retries exactly agent 5. Same session only (also after a restart or /resume of it), and the run must have finished — stop it from /agents → Workflows first. A child replayed this way can still be continued with opts.resume. Before diagnosing why a completed workflow returned an empty or unexpected result, Read the run's \`<run id>.workflow.jsonl\` beside its script — it records each agent's actual return value; do not assume cached results are non-empty. Date.now()/Math.random()/new Date() are unavailable in scripts (they would break this) — stamp results after the workflow returns, or pass timestamps via args.`;
var MODEL_SENTENCE = "opts.model overrides the model for this agent call. Default to omitting it — the agent inherits the main-loop model (the resolved session model), which is almost always correct. Only set it when you're highly confident a different tier fits the task; when unsure, omit.";
var EFFORT_SENTENCE = "opts.effort overrides the reasoning effort for this agent call ('minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max') — omit to inherit the agent definition's own level, then the parent's; use 'low' for cheap mechanical stages and higher tiers only for the hardest verify/judge stages.";
var PHASE_MODEL_SENTENCE = " Add `model` to a phase entry when that phase uses a specific model override.";
function workflowToolDescription(allowModelOverride2) {
  if (allowModelOverride2)
    return fullWorkflowToolDescription;
  return fullWorkflowToolDescription.replace(MODEL_SENTENCE, "opts.model and opts.effort are ignored in this project: every agent runs on the main session's current model and reasoning effort, unless its agent definition sets its own — omit both.").replace(` ${EFFORT_SENTENCE}`, "").replace(PHASE_MODEL_SENTENCE, "").replace("gate: 'npm test', effort: 'low'}", "gate: 'npm test'}");
}

// dist/index.js
init_worktree();
function textResult2(msg, details, isError = false) {
  return {
    content: [{ type: "text", text: msg }],
    details,
    ...isError ? { isError: true } : {}
  };
}
function errorResult(msg) {
  return textResult2(msg, undefined, true);
}
function renderRunningAgentStatus(frame, statsText, activity, theme) {
  const container = new Container;
  container.addChild(new Text2(theme.fg("accent", frame) + (statsText ? " " + statsText : ""), 0, 0));
  container.addChild(new Text2(theme.fg("dim", `  ⎿  ${activity}`), 0, 0));
  return container;
}
var BACKGROUND_FOLLOW_UP = `You will be notified when this agent completes — continue with other work meanwhile, and do not poll it.
` + "After the notification, get_subagent_result returns its full result. steer_subagent sends it a message mid-run.";
function stillRunningText(state) {
  const lead = state === "stopping" ? "Agent was stopped and is still winding down." : `Agent is still ${state}.`;
  return `${lead} A completion notification will arrive on its own when it finishes — continue with other work ` + "meanwhile, and do not call get_subagent_result for this agent again until that notification arrives.";
}
var BACKGROUND_HINT_DELAY_MS = 2000;
var DEFAULT_BACKGROUND_KEY = "ctrl+b";
function formatLifetimeTokens(o) {
  const t = getLifetimeTotal(o.lifetimeUsage);
  return t > 0 ? formatTokens(t) : "";
}
function createActivityTracker(maxTurns) {
  const state = {
    activeTools: new Map,
    toolUses: 0,
    turnCount: 1,
    maxTurns,
    responseText: "",
    session: undefined
  };
  const callbacks = {
    onToolActivity: (activity) => {
      if (activity.type === "start") {
        state.activeTools.set(activity.toolName + "_" + Date.now(), activity.toolName);
      } else {
        for (const [key, name] of state.activeTools) {
          if (name === activity.toolName) {
            state.activeTools.delete(key);
            break;
          }
        }
        state.toolUses++;
      }
    },
    onTextDelta: (_delta, fullText) => {
      state.responseText = fullText;
    },
    onTurnEnd: (turnCount) => {
      state.turnCount = turnCount;
    },
    onSessionCreated: (session) => {
      state.session = session;
    },
    onAssistantUsage: (_usage) => {}
  };
  return { state, callbacks };
}
var THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
function getStatusLabel(status, error) {
  switch (status) {
    case "error":
      return `Error: ${error ?? "unknown"}`;
    case "aborted":
      return "Aborted (max turns exceeded)";
    case "steered":
      return "Wrapped up (turn limit)";
    case "stopped":
      return "Stopped";
    default:
      return "Done";
  }
}
var NOTIFICATION_PREVIEW_LINES = 10;
function previewResult(result, maxLen, maxLines) {
  const lines = result.split(`
`);
  let head = lines.slice(0, maxLines).join(`
`);
  if (head.length > maxLen)
    head = head.slice(0, maxLen);
  if (head.length === result.length)
    return result;
  const headLines = head.split(`
`).length;
  const fullLines = result[head.length] === `
` ? headLines : headLines - 1;
  const totalBytes = Buffer.byteLength(result, "utf8");
  const missingBytes = totalBytes - Buffer.byteLength(head, "utf8");
  return `${head}
...(truncated: ${lines.length - fullLines} of ${lines.length} lines and ${missingBytes} of ${totalBytes} bytes ` + "not shown; use get_subagent_result for the full output)";
}
function formatTaskNotification(record, resultMaxLen, showCost = false, maxLines = NOTIFICATION_PREVIEW_LINES) {
  const status = getStatusLabel(record.status, record.error);
  const durationMs = record.completedAt ? record.completedAt - record.startedAt : 0;
  const totalTokens = getLifetimeTotal(record.lifetimeUsage);
  const contextPercent = getSessionContextPercent(record.session);
  const ctxXml = contextPercent !== null ? `<context_percent>${Math.round(contextPercent)}</context_percent>` : "";
  const compactXml = record.compactionCount ? `<compactions>${record.compactionCount}</compactions>` : "";
  const cost = showCost ? getLifetimeCost(record.lifetimeUsage) : 0;
  const costXml = cost > 0 ? `<estimated_cost_usd>${cost.toFixed(4)}</estimated_cost_usd>` : "";
  const resultPreview = record.result ? previewResult(record.result, resultMaxLen, maxLines) : "No output.";
  const resultBytes = record.result ? `<result_bytes>${Buffer.byteLength(record.result, "utf8")}</result_bytes>` : null;
  return [
    `<task-notification>`,
    `<task-id>${record.id}</task-id>`,
    record.toolCallId ? `<tool-use-id>${escapeXml(record.toolCallId)}</tool-use-id>` : null,
    record.outputFile ? `<output-file>${escapeXml(record.outputFile)}</output-file>` : null,
    record.sessionFile && isFailedStatus(record.status) ? `<session-file>${escapeXml(record.sessionFile)}</session-file>` : null,
    `<status>${escapeXml(status)}</status>`,
    record.invocation?.modelId ? `<model>${escapeXml(record.invocation.modelId)}</model>` : null,
    record.invocation?.modelId && record.invocation.thinking ? `<thinking>${escapeXml(record.invocation.thinking)}</thinking>` : null,
    record.modelNote ? `<model-note>${escapeXml(record.modelNote)}</model-note>` : null,
    `<summary>Agent "${escapeXml(record.description)}" ${record.status}${getStatusNote(record.status, record.stopCause)}</summary>`,
    resumeHintXml(record),
    `<result>${escapeXml(resultPreview)}</result>`,
    resultBytes,
    `<usage><total_tokens>${totalTokens}</total_tokens><tool_uses>${record.toolUses}</tool_uses>${ctxXml}${compactXml}${costXml}<duration_ms>${durationMs}</duration_ms></usage>`,
    `</task-notification>`
  ].filter(Boolean).join(`
`);
}
function buildDetails(base, record, activity, overrides) {
  return {
    ...base,
    toolUses: record.toolUses,
    tokens: formatLifetimeTokens(record),
    cost: getLifetimeCost(record.lifetimeUsage),
    turnCount: activity?.turnCount,
    maxTurns: activity?.maxTurns,
    durationMs: (record.completedAt ?? Date.now()) - record.startedAt,
    status: record.status,
    agentId: record.id,
    error: record.error,
    ...overrides
  };
}
function buildNotificationDetails(record, resultMaxLen, activity) {
  const totalTokens = getLifetimeTotal(record.lifetimeUsage);
  return {
    id: record.id,
    description: record.description,
    status: record.status,
    toolUses: record.toolUses,
    turnCount: activity?.turnCount ?? 0,
    maxTurns: activity?.maxTurns,
    totalTokens,
    totalCost: getLifetimeCost(record.lifetimeUsage),
    durationMs: record.completedAt ? record.completedAt - record.startedAt : 0,
    outputFile: record.outputFile,
    error: record.error,
    resultPreview: record.result ? record.result.length > resultMaxLen ? record.result.slice(0, resultMaxLen) + "…" : record.result : "No output."
  };
}
var DELIVERED_ENTRY_TYPE = "subagents:delivered";
function recordEntryData(record, pending = false) {
  return {
    id: record.id,
    type: record.type,
    description: record.description,
    status: record.status,
    result: record.result,
    error: record.error,
    ...record.status === "stopped" && record.stopCause ? { stopCause: record.stopCause } : {},
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    resume: resumeStateOf(record),
    ...pending ? { pending: true, toolUses: record.toolUses, lifetimeUsage: { ...record.lifetimeUsage }, outputFile: record.outputFile, toolCallId: record.toolCallId } : {}
  };
}
function resumeEntryData(record) {
  const resume = resumeStateOf(record);
  return resume ? { resume } : undefined;
}
function pendingResultsFromEntries(entries) {
  const pending = new Map;
  for (const entry of entries) {
    const e = entry;
    if (e?.type !== "custom" || !e.data)
      continue;
    if (e.customType === RECORD_ENTRY_TYPE && e.data.pending === true && typeof e.data.id === "string") {
      const d = e.data;
      pending.set(d.id, {
        id: d.id,
        type: String(d.type ?? ""),
        description: String(d.description ?? ""),
        status: d.status ?? "completed",
        stopCause: d.stopCause === "session-end" || d.stopCause === "user" ? d.stopCause : undefined,
        sessionFile: typeof d.resume?.sessionFile === "string" ? d.resume.sessionFile : undefined,
        result: typeof d.result === "string" ? d.result : undefined,
        error: typeof d.error === "string" ? d.error : undefined,
        startedAt: typeof d.startedAt === "number" ? d.startedAt : 0,
        completedAt: typeof d.completedAt === "number" ? d.completedAt : undefined,
        toolUses: typeof d.toolUses === "number" ? d.toolUses : 0,
        lifetimeUsage: d.lifetimeUsage ?? { input: 0, output: 0, cacheWrite: 0, cost: 0 },
        compactionCount: 0,
        outputFile: typeof d.outputFile === "string" ? d.outputFile : undefined,
        toolCallId: typeof d.toolCallId === "string" ? d.toolCallId : undefined
      });
    } else if (e.customType === DELIVERED_ENTRY_TYPE && Array.isArray(e.data.ids)) {
      for (const id of e.data.ids)
        if (typeof id === "string")
          pending.delete(id);
    }
  }
  return [...pending.values()];
}
var INTERRUPTED_NOTICE_ENTRY_TYPE = "subagents:interrupted-notice";
function interruptedAgentsFromEntries(entries) {
  const interrupted = new Map;
  for (const entry of entries) {
    const e = entry;
    if (e?.type !== "custom" || !e.data)
      continue;
    if (e.customType === RECORD_ENTRY_TYPE && typeof e.data.id === "string") {
      const d = e.data;
      const resume = d.resume;
      const cause = d.stopCause ?? resume?.stopCause;
      interrupted.delete(d.id);
      if (d.status === "stopped" && cause === "session-end" && typeof resume?.sessionFile === "string") {
        interrupted.set(d.id, { id: d.id, type: String(d.type ?? ""), description: String(d.description ?? "") });
      }
    } else if (e.customType === INTERRUPTED_NOTICE_ENTRY_TYPE && Array.isArray(e.data.ids)) {
      for (const id of e.data.ids)
        if (typeof id === "string")
          interrupted.delete(id);
    }
  }
  return [...interrupted.values()];
}
function formatInterruptedNotice(agents2) {
  const lines = agents2.map((a) => `- ${a.id} (${a.type}): ${a.description}`);
  return [
    `<interrupted-agents>`,
    `${agents2.length === 1 ? "1 background agent" : `${agents2.length} background agents`} of this session ${agents2.length === 1 ? "was" : "were"} still running when the session last ended, and ${agents2.length === 1 ? "was" : "were"} interrupted by that, not stopped by anyone. Each keeps its whole context: to finish its task, resume it with the Agent tool (\`resume: "<id>"\` and a prompt to continue) instead of starting a fresh agent, which would redo its work.`,
    ...lines,
    `</interrupted-agents>`
  ].join(`
`);
}
async function stopParkedAgents(manager, entry, write) {
  manager.setObservers({});
  const put = (record, pending) => {
    const [type, data] = isTopLevelAgent(record) ? [RECORD_ENTRY_TYPE, recordEntryData(record, pending)] : [RESUME_ENTRY_TYPE, resumeEntryData(record)];
    if (!data)
      return;
    if (!write?.(record.ownerSession, type, data))
      appendToSessionFile(record.ownerSession, type, data);
  };
  for (const record of entry.completed.splice(0))
    put(record, isTopLevelAgent(record) && !record.resultConsumed);
  const interrupted = manager.listAllAgents().filter((r) => r.status === "running" || r.status === "queued");
  manager.abortAll("session-end");
  await manager.awaitWorktreeCleanup(15000);
  for (const record of interrupted)
    put(record, false);
  await manager.dispose();
}
function recordParkedAgentsAtExit(manager, entry) {
  manager.setObservers({});
  const put = (record, pending) => {
    const data = isTopLevelAgent(record) ? recordEntryData(record, pending) : resumeEntryData(record);
    if (data)
      appendToSessionFile(record.ownerSession, isTopLevelAgent(record) ? RECORD_ENTRY_TYPE : RESUME_ENTRY_TYPE, data);
  };
  for (const record of entry.completed.splice(0))
    put(record, isTopLevelAgent(record) && !record.resultConsumed);
  for (const record of manager.listAllAgents()) {
    if (record.status !== "running" && record.status !== "queued")
      continue;
    record.status = "stopped";
    record.stopCause = "session-end";
    record.completedAt ??= Date.now();
    put(record, false);
  }
}
function formatToolsSuffix(cfg) {
  const tools = cfg?.builtinToolNames;
  if (!tools)
    return "*";
  if (tools.length === 0) {
    const noExtensionTools = cfg?.isolated === true || cfg?.extensions === false;
    return noExtensionTools ? "none" : "no built-ins, extension tools only";
  }
  const isFullSet = tools.length === BUILTIN_TOOL_NAMES.length && BUILTIN_TOOL_NAMES.every((t) => tools.includes(t));
  return isFullSet ? "*" : tools.join(", ");
}
var WORKFLOW_FILE_FLAG = "subagents-workflow-file";
var PACKAGE_NAME = "@kushalkhemka/opensec-pi-subagents";
var OWNER_KEY = Symbol.for("pi-subagents:owner");
var CONFLICT_WARNED_KEY = Symbol.for("pi-subagents:owner-conflict-warned");
function claimSubagentsOwner(pi, packageName) {
  const global = globalThis;
  const owner = global[OWNER_KEY];
  if (owner && owner.package !== packageName) {
    const message = `${packageName} is disabled: ${owner.package} is already loaded and registers the same tools. ` + "They cannot run together; uninstall one of them.";
    pi.on("session_start", (_event, ctx) => {
      if (ctx.hasUI)
        ctx.ui.notify(message, "warning");
      else if (!global[CONFLICT_WARNED_KEY]) {
        global[CONFLICT_WARNED_KEY] = true;
        console.warn(`[pi-subagents] ${message}`);
      }
    });
    return;
  }
  const claim = owner ?? { package: packageName, activations: 0 };
  claim.activations++;
  global[OWNER_KEY] = claim;
  let released = false;
  return () => {
    if (released)
      return;
    released = true;
    if (global[OWNER_KEY] === claim && --claim.activations <= 0)
      delete global[OWNER_KEY];
  };
}
function dist_default(pi) {
  if (inChildSessionContext())
    return;
  const releaseOwner = claimSubagentsOwner(pi, PACKAGE_NAME);
  if (!releaseOwner)
    return;
  useTreeKillingExec(pi);
  pi.registerMessageRenderer("subagent-notification", (message, { expanded }, theme) => {
    const d = message.details;
    if (!d)
      return;
    function renderOne(d2) {
      const isError = d2.status === "error" || d2.status === "stopped" || d2.status === "aborted";
      const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
      const statusText = isError ? d2.status : d2.status === "steered" ? "completed (steered)" : "completed";
      let line = `${icon} ${theme.bold(d2.description)} ${theme.fg("dim", statusText)}`;
      const parts = [];
      if (d2.turnCount > 0)
        parts.push(formatTurns(d2.turnCount, d2.maxTurns));
      if (d2.toolUses > 0)
        parts.push(`${d2.toolUses} tool use${d2.toolUses === 1 ? "" : "s"}`);
      if (d2.totalTokens > 0)
        parts.push(formatTokens(d2.totalTokens));
      if (showCost) {
        const costText = formatCost(d2.totalCost ?? 0);
        if (costText)
          parts.push(costText);
      }
      if (d2.durationMs > 0)
        parts.push(formatMs(d2.durationMs));
      if (parts.length) {
        line += `
  ` + parts.map((p2) => theme.fg("dim", p2)).join(" " + theme.fg("dim", "·") + " ");
      }
      if (expanded) {
        const lines = d2.resultPreview.split(`
`).slice(0, 30);
        for (const l of lines)
          line += `
` + theme.fg("dim", `  ${l}`);
      } else {
        const preview2 = d2.resultPreview.split(`
`)[0]?.slice(0, 80) ?? "";
        line += `
  ` + theme.fg("dim", `⎿  ${preview2}`);
      }
      if (d2.outputFile) {
        line += `
  ` + theme.fg("muted", `transcript: ${d2.outputFile}`);
      }
      return line;
    }
    const all = [d, ...d.others ?? []];
    const rendered = all.map(renderOne);
    if (showCost && all.length > 1) {
      const total = formatCost(all.reduce((sum, a) => sum + (a.totalCost ?? 0), 0));
      if (total) {
        const tokens = all.reduce((sum, a) => sum + a.totalTokens, 0);
        rendered.unshift(theme.fg("dim", `${all.length} agents · ${formatTokens(tokens)} · ${total}`));
      }
    }
    return new Text2(rendered.join(`
`), 0, 0);
  });
  pi.registerEntryRenderer(WORKFLOW_ENTRY_TYPE, (entry, _options, theme) => renderWorkflowEntryCard(entry.data, theme));
  pi.registerFlag(WORKFLOW_FILE_FLAG, {
    type: "string",
    description: `Run a workflow script at startup: --${WORKFLOW_FILE_FLAG}=<path>. ` + "Use the `=` form — the space form consumes the next argument, which would swallow a following prompt."
  });
  let projectTrusted = isProjectCodeTrusted(predictProjectTrust(process.cwd()), process.cwd());
  let strictAgentFiles = loadSettings(process.cwd(), projectTrusted).strictAgentFiles === true;
  const reloadCustomAgents = (strict = false) => {
    const userAgents = loadCustomAgents(process.cwd(), strict, { project: projectTrusted });
    registerAgents(userAgents);
  };
  reloadCustomAgents(strictAgentFiles);
  const agentActivity = new Map;
  let reportUsage = false;
  function isReportUsageEnabled() {
    return reportUsage;
  }
  function setReportUsage(b2) {
    reportUsage = b2;
    if (!b2)
      pendingUsage.drain();
  }
  let showCost = false;
  function isShowCostEnabled() {
    return showCost;
  }
  function setShowCost(b2) {
    showCost = b2;
    widget.update();
    fleet.update();
  }
  let showModel = false;
  function isShowModelEnabled() {
    return showModel;
  }
  function setShowModel(b2) {
    showModel = b2;
    widget.update();
  }
  let backgroundKeySetting;
  function setBackgroundKey(key) {
    backgroundKeySetting = key;
  }
  function getBackgroundKey() {
    const key = backgroundKeySetting ?? DEFAULT_BACKGROUND_KEY;
    return key === "off" ? undefined : key;
  }
  const pendingUsage = new PendingUsagePool;
  let disposed = false;
  let sessionGeneration = 0;
  const mentionClones = new Set;
  function flushPendingUsage(ctx = currentCtx) {
    if (!reportUsage || disposed || !ctx)
      return;
    try {
      const sessionManager = ctx.sessionManager;
      if (typeof sessionManager.appendUsage !== "function")
        return;
      const usage = pendingUsage.drain();
      if (usage)
        sessionManager.appendUsage("subagents", "pi-subagents", "subagents", usage, "subagent spend");
    } catch {}
  }
  function flushPendingUsageIfIdle() {
    try {
      if (currentCtx?.isIdle())
        flushPendingUsage();
    } catch {}
  }
  const outbox = new CompletionOutbox((message) => {
    if (disposed)
      return;
    pi.sendMessage({
      customType: "subagent-notification",
      content: message.content,
      display: true,
      details: message.details
    }, { deliverAs: "steer", triggerTurn: true });
  }, () => parentTurnActive());
  function parentTurnActive() {
    try {
      return currentCtx?.signal !== undefined;
    } catch {
      return false;
    }
  }
  const QUEUE_WAIT_POLL_MS = Math.floor(NOTIFICATION_HOLD_MS / 4);
  function sendIndividualNudge(record) {
    agentActivity.delete(record.id);
    widget.markFinished(record.id);
    fleet.onAgentFinished(record.id);
    try {
      const footer = record.outputFile ? `
Full transcript available at: ${record.outputFile}` : "";
      const message = {
        content: formatTaskNotification(record, 500, showCost) + footer,
        details: buildNotificationDetails(record, 500, agentActivity.get(record.id))
      };
      outbox.add({ ids: [record.id], build: () => message });
    } catch {}
    widget.update();
  }
  const groupJoin = new GroupJoinManager((records, partial) => {
    for (const r of records) {
      agentActivity.delete(r.id);
      widget.markFinished(r.id);
      fleet.onAgentFinished(r.id);
    }
    const members = records.filter((r) => !r.resultConsumed).flatMap((r) => {
      try {
        return [{ id: r.id, text: formatTaskNotification(r, 300, showCost), details: buildNotificationDetails(r, 300, agentActivity.get(r.id)) }];
      } catch {
        return [];
      }
    });
    if (members.length > 0) {
      outbox.add({
        ids: members.map((m2) => m2.id),
        build: (ids) => {
          const unread = members.filter((m2) => ids.includes(m2.id));
          const notifications = unread.map((m2) => m2.text).join(`

`);
          const label = partial ? `${unread.length} agent(s) finished (partial — others still running)` : `${unread.length} agent(s) finished`;
          const [first, ...rest] = unread;
          const details = first.details;
          if (rest.length > 0)
            details.others = rest.map((m2) => m2.details);
          return {
            content: `Background agent group completed: ${label}

${notifications}

Use get_subagent_result for full output.`,
            details
          };
        }
      });
    }
    widget.update();
  }, 30000);
  function buildEventData(record) {
    const durationMs = record.completedAt ? record.completedAt - record.startedAt : Date.now() - record.startedAt;
    const u = record.lifetimeUsage;
    const total = getLifetimeTotal(u);
    const tokens = total > 0 ? { input: u.input, output: u.output, total } : undefined;
    const usage = toReportedUsage(u);
    return {
      id: record.id,
      type: record.type,
      description: record.description,
      result: record.result,
      error: record.error,
      status: record.status,
      toolUses: record.toolUses,
      durationMs,
      tokens,
      usage
    };
  }
  let currentSession;
  let interruptedNotice = [];
  const ownedHere = (record) => record.ownerSession === currentSession;
  function writeEntry(owner, customType, data) {
    if (owner === currentSession) {
      try {
        pi.appendEntry(customType, data);
        return true;
      } catch {}
    }
    return appendToSessionFile(owner, customType, data);
  }
  function appendRecordEntry(record, pending = false) {
    writeEntry(record.ownerSession, RECORD_ENTRY_TYPE, recordEntryData(record, pending));
  }
  function appendResumeEntry(record) {
    const data = resumeEntryData(record);
    if (data)
      writeEntry(record.ownerSession, RESUME_ENTRY_TYPE, data);
  }
  function completeForeignAgent(record) {
    agentActivity.delete(record.id);
    appendRecordEntry(record, !record.resultConsumed);
  }
  function onAgentComplete(record) {
    if (disposed)
      return;
    if (!isTopLevelAgent(record)) {
      flushPendingUsageIfIdle();
      appendResumeEntry(record);
      return;
    }
    if (!ownedHere(record)) {
      completeForeignAgent(record);
      return;
    }
    flushPendingUsageIfIdle();
    const isError = record.status === "error" || record.status === "stopped" || record.status === "aborted";
    const eventData = buildEventData(record);
    if (isError) {
      pi.events.emit("subagents:failed", eventData);
    } else {
      pi.events.emit("subagents:completed", eventData);
    }
    appendRecordEntry(record);
    if (record.resultConsumed) {
      agentActivity.delete(record.id);
      widget.markFinished(record.id);
      fleet.onAgentFinished(record.id);
      widget.update();
      return;
    }
    if (turnGroupSpawns.includes(record.id)) {
      widget.update();
      return;
    }
    const result = groupJoin.onAgentComplete(record);
    if (result === "pass") {
      sendIndividualNudge(record);
    }
    widget.update();
  }
  function onAgentStart(record) {
    if (disposed || !isTopLevelAgent(record) || !ownedHere(record))
      return;
    if (currentCtx?.hasUI) {
      widget.ensureTimer();
      widget.update();
      fleet.ensureTimer();
      fleet.update();
    }
    pi.events.emit("subagents:started", {
      id: record.id,
      type: record.type,
      description: record.description
    });
  }
  function onAgentCompact(record, info) {
    if (disposed || !isTopLevelAgent(record) || !ownedHere(record))
      return;
    pi.events.emit("subagents:compacted", {
      id: record.id,
      type: record.type,
      description: record.description,
      reason: info.reason,
      tokensBefore: info.tokensBefore,
      compactionCount: record.compactionCount
    });
  }
  function onAgentUsage(record, usage) {
    if (reportUsage && ownedHere(record))
      pendingUsage.add(usage);
  }
  const managerObservers = {
    onComplete: onAgentComplete,
    onStart: onAgentStart,
    onCompact: onAgentCompact,
    onUsage: onAgentUsage
  };
  let manager = new AgentManager(onAgentComplete, undefined, onAgentStart, onAgentCompact, onAgentUsage);
  const MANAGER_KEY = Symbol.for("pi-subagents:manager");
  const spawnResolved = (piRef, ctxRef, type, prompt, options) => {
    reloadCustomAgents();
    const dispatch = resolveSpawnType(type);
    if (!dispatch.ok)
      throw new Error(dispatch.message);
    const { state, callbacks } = createActivityTracker(resolveEffectiveMaxTurns(dispatch.type, options?.maxTurns));
    const id = manager.spawn(piRef, ctxRef, dispatch.type, prompt, { ...options, ...callbacks });
    agentActivity.set(id, state);
    return id;
  };
  const spawnTopLevel = (piRef, ctxRef, type, prompt, options) => {
    const safeOptions = { ...options ?? {} };
    delete safeOptions.parentAgentId;
    delete safeOptions.workflowId;
    delete safeOptions.depth;
    delete safeOptions.maxSubagentDepth;
    delete safeOptions.configCwd;
    delete safeOptions.rootSessionId;
    delete safeOptions.resumeSessionFile;
    delete safeOptions.reclaim;
    delete safeOptions.carry;
    if (!isModelOverrideAllowed()) {
      delete safeOptions.model;
      delete safeOptions.thinkingLevel;
    }
    delete safeOptions.blocking;
    return spawnResolved(piRef, ctxRef, type, prompt, safeOptions);
  };
  const resolveAgentRef = (ref) => {
    const byId = manager.getRecord(ref);
    if (byId)
      return manager.isVisible(byId) ? byId : undefined;
    const resolved = manager.resolveMention(ref);
    return resolved?.kind === "live" ? resolved.record : undefined;
  };
  const registryEntry = {
    waitForAll: () => manager.waitForAll(),
    hasRunning: () => manager.hasRunning(),
    spawn: spawnTopLevel,
    getRecord: (id) => {
      const record = manager.getRecord(id);
      return record !== undefined && isTopLevelAgent(record) && manager.isVisible(record) ? record : undefined;
    }
  };
  const ownsManagerRegistry = globalThis[MANAGER_KEY] === undefined;
  if (ownsManagerRegistry) {
    globalThis[MANAGER_KEY] = registryEntry;
  }
  let currentCtx;
  let rpcHandle;
  let mentionProviderRegistered = false;
  const scheduler = new SubagentScheduler;
  function startScheduler(ctx) {
    try {
      const sessionId = ctx.sessionManager?.getSessionId?.();
      if (!sessionId)
        return;
      const path = resolveStorePath(ctx.cwd, sessionId);
      const store = new ScheduleStore(path);
      scheduler.start(pi, ctx, manager, store);
      pi.events.emit("subagents:scheduler_ready", { sessionId, jobCount: store.list().length });
    } catch (err) {
      console.warn("[pi-subagents] Failed to start scheduler:", err);
    }
  }
  pi.on("session_start", async (_event, ctx) => {
    disposed = false;
    currentCtx = ctx;
    currentSession = sessionFileOf(ctx);
    adoptParkedAgents();
    manager.setVisibleOwner(currentSession);
    syncProjectTrust(ctx);
    noticeSkippedProjectAgents(ctx);
    tidyAgentWorktrees(ctx);
    if (ctx.hasUI) {
      widget.setUICtx(ctx.ui);
      fleet.setUICtx(ctx.ui);
      watchHandoffKey(ctx.ui);
    }
    manager.clearCompleted(true);
    const branch = ctx.sessionManager?.getBranch?.() ?? [];
    manager.restoreTombstones(resumeStatesFromEntries(branch));
    deliverPendingResults(branch);
    const pendingIds = new Set(pendingResultsFromEntries(branch).map((r) => r.id));
    interruptedNotice = interruptedAgentsFromEntries(branch).filter((a) => {
      if (pendingIds.has(a.id))
        return false;
      const live = manager.getRecord(a.id);
      return !(live && (live.status === "running" || live.status === "queued" || manager.isRunActive(a.id)));
    });
    if (!rpcHandle) {
      rpcHandle = registerRpcHandlers({
        events: pi.events,
        pi,
        getCtx: () => currentCtx,
        manager: {
          spawn: spawnTopLevel,
          awaitStartup: (id) => manager.awaitStartup(id),
          getRecord: (id) => {
            const record = manager.getRecord(id);
            return record && manager.isVisible(record) ? record : undefined;
          },
          abort: (id) => manager.abort(id),
          consumeResult: (id) => {
            const record = resolveAgentRef(id);
            if (!record || record.parentAgentId)
              return false;
            if (manager.isRunActive(record.id))
              return false;
            record.resultConsumed = true;
            outbox.cancel(record.id);
            return true;
          }
        }
      });
      pi.events.emit("subagents:ready", {});
    }
    if (isSchedulingEnabled() && !scheduler.isActive())
      startScheduler(ctx);
    if (ctx.mode === "tui" && !mentionProviderRegistered) {
      mentionProviderRegistered = true;
      ctx.ui.addAutocompleteProvider((current) => createMentionProvider(current, () => mentionRoster(manager, mentionTypes(), (type) => getConfig(type).displayName), isAgentMentionsEnabled));
    }
    resolveWorkflowCollisions(ctx);
    runWorkflowFlag(ctx);
  });
  const mentionTypes = () => getAvailableTypes().map((name) => ({ name, description: getAgentConfig(name)?.description ?? name }));
  pi.on("input", async (event, ctx) => {
    if (event.source === "extension" || !isAgentMentionsEnabled())
      return { action: "continue" };
    const canDispatchDirectly = ctx.mode === "tui";
    if (!canDispatchDirectly && getAgentMentionMode() !== "model")
      return { action: "continue" };
    const mention = parseMention(event.text);
    if (!mention)
      return { action: "continue" };
    if (isReservedHandle(mention.handle)) {
      return { action: "transform", text: mention.message, ...event.images && { images: event.images } };
    }
    const alias = stripAgentPrefix(mention.handle);
    const resolved = manager.resolveMention(mention.handle) ?? (alias ? manager.resolveMention(alias) : undefined);
    if (resolved && !canDispatchDirectly)
      return { action: "continue" };
    if (resolved?.kind === "live") {
      const record = resolved.record;
      const target = `@${record.alias ?? record.handle ?? mention.handle}`;
      if (record.status === "running" || record.status === "queued") {
        record.resultConsumed = false;
        manager.steer(record.id, mention.message);
        pi.events.emit("subagents:steered", { id: record.id, message: mention.message });
        ctx.ui.notify(`Sent to ${target}`, "info");
        return { action: "handled" };
      }
      if (record.session) {
        let resumedRecord;
        try {
          resumedRecord = await startBackgroundResume(ctx, record.id, mention.message, {
            outputTranscript: resumeWritesTranscript(record.type)
          });
        } catch (err) {
          ctx.ui.notify(`Could not resume ${target}: ${err instanceof Error ? err.message : String(err)}`, "warning");
          return { action: "handled" };
        }
        ctx.ui.notify(resumedRecord ? `Resuming ${target}` : `Could not resume ${target} — it is still running.`, resumedRecord ? "info" : "warning");
        return { action: "handled" };
      }
    }
    if (resolved?.kind === "tombstone") {
      const entry = resolved.entry;
      const target = `@${entry.alias ?? entry.handle}`;
      if (!existsSync14(entry.sessionFile)) {
        manager.dropTombstone(entry.id);
        ctx.ui.notify(`Could not resume ${target} — its session is gone.`, "warning");
        return { action: "handled" };
      }
      if (reopenTypeProblem(entry.type)) {
        ctx.ui.notify(`Could not resume ${target} — the ${entry.type} agent is no longer available.`, "warning");
        return { action: "handled" };
      }
      try {
        await startBackgroundResume(ctx, entry.id, mention.message, {
          outputTranscript: resumeWritesTranscript(entry.type)
        });
        ctx.ui.notify(`Resuming ${target}`, "info");
      } catch (err) {
        ctx.ui.notify(`Could not resume ${target}: ${err instanceof Error ? err.message : String(err)}`, "warning");
      }
      return { action: "handled" };
    }
    const typeHandle = mention.handle;
    const type = resolveHandleToType(typeHandle, getAvailableTypes()) ?? (alias ? resolveHandleToType(alias, getAvailableTypes()) : undefined);
    if (!type)
      return { action: "continue" };
    if (getAgentMentionMode() === "model") {
      const label = `@${handleBase(type)}`;
      ctx.ui.notify(`Prompting ${label}…`, "info");
      const generation = sessionGeneration;
      const live = () => generation === sessionGeneration && !disposed;
      const cloneStop = new AbortController;
      mentionClones.add(cloneStop);
      runMentionClone({
        ctx,
        type,
        message: mention.message,
        agentTool: registeredAgentTool,
        signal: cloneStop.signal,
        onUsage: (usage) => {
          if (reportUsage && live())
            pendingUsage.add(usage);
        }
      }).then(async (result) => {
        if (!live())
          return;
        flushPendingUsageIfIdle();
        if (result.spawned)
          return;
        try {
          const id = spawnTopLevel(pi, ctx, type, mention.message, {
            description: describeMention(mention.message),
            isBackground: true
          });
          await manager.awaitStartup(id);
          if (live())
            ctx.ui.notify(`Started ${label} directly — ${result.error}`, "warning");
        } catch (err) {
          if (live()) {
            ctx.ui.notify(`Could not start ${label}: ${err instanceof Error ? err.message : String(err)}`, "error");
          }
        }
      }).catch(() => {}).finally(() => {
        mentionClones.delete(cloneStop);
      });
      return { action: "handled" };
    }
    try {
      const id = spawnTopLevel(pi, ctx, type, mention.message, {
        description: describeMention(mention.message),
        isBackground: true
      });
      await manager.awaitStartup(id);
      ctx.ui.notify(`Started @${handleBase(type)}`, "info");
    } catch (err) {
      ctx.ui.notify(`Could not start @${handleBase(type)}: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
    return { action: "handled" };
  });
  pi.on("session_before_switch", () => {});
  function adoptParkedAgents() {
    const parked = takeParkedSubagents(currentSession);
    if (!parked)
      return;
    if (!isCompatible(parked)) {
      parked.stop(writeEntry).catch(() => {});
      return;
    }
    const adopted = parked.manager;
    const fresh = manager;
    adopted.useServices(managerServices());
    adopted.setObservers(managerObservers);
    adopted.setMaxConcurrent(fresh.getMaxConcurrent());
    adopted.setMaxConcurrentForeground(fresh.getMaxConcurrentForeground());
    manager = adopted;
    widget.setManager(adopted);
    fleet.setManager(adopted);
    for (const [id, state] of parked.activity) {
      if (!agentActivity.has(id))
        agentActivity.set(id, state);
    }
    fresh.dispose();
    const settled = parked.completed;
    if (settled.length > 0)
      setTimeout(() => {
        for (const record of settled)
          onAgentComplete(record);
      }, 0);
  }
  function parkAgents(reason, targetSessionFile) {
    const parkedManager = manager;
    const entry = {
      protocol: HANDOFF_PROTOCOL,
      version: PACKAGE_VERSION,
      reason,
      sessionFile: currentSession,
      targetSessionFile,
      manager: parkedManager,
      activity: new Map(agentActivity),
      completed: [],
      stop: (write) => stopParkedAgents(parkedManager, entry, write)
    };
    parkedManager.setObservers({ onComplete: (record) => {
      entry.completed.push(record);
    } });
    parkedManager.detachPendingContexts();
    parkedManager.setVisibleOwner(null);
    parkSubagents(entry, () => recordParkedAgentsAtExit(parkedManager, entry));
  }
  function deliverPendingResults(branch) {
    const pending = pendingResultsFromEntries(branch);
    if (pending.length === 0)
      return;
    const ids = pending.map((r) => r.id);
    try {
      pi.appendEntry(DELIVERED_ENTRY_TYPE, { ids });
    } catch {
      return;
    }
    const records = pending.map((entry) => {
      const live2 = manager.getRecord(entry.id);
      return live2 && manager.isVisible(live2) ? live2 : entry;
    });
    const live = (r) => manager.getRecord(r.id) === r;
    for (const r of records) {
      agentActivity.delete(r.id);
      widget.markFinished(r.id);
      fleet.onAgentFinished(r.id);
    }
    const parts = records.flatMap((r) => {
      try {
        const text = live(r) ? formatTaskNotification(r, 500, showCost) : formatTaskNotification(r, 20000, showCost, Number.POSITIVE_INFINITY);
        return [{ id: r.id, text, details: buildNotificationDetails(r, 300) }];
      } catch {
        return [];
      }
    });
    if (parts.length > 0) {
      outbox.add({
        ids: parts.map((p2) => p2.id),
        build: (unreadIds) => {
          const unread = parts.filter((p2) => unreadIds.includes(p2.id));
          const [first, ...rest] = unread;
          const details = { ...first.details };
          if (rest.length > 0)
            details.others = rest.map((p2) => p2.details);
          const label = unread.length === 1 ? "An agent" : `${unread.length} agents`;
          return {
            content: `${label} of this session finished while another session was open.

${unread.map((p2) => p2.text).join(`

`)}`,
            details
          };
        }
      });
    }
    widget.update();
  }
  pi.on("session_shutdown", async (event) => {
    flushPendingUsage();
    disposed = true;
    interruptedNotice = [];
    sessionGeneration++;
    for (const stop of mentionClones)
      stop.abort();
    mentionClones.clear();
    rpcHandle?.unsubSpawn();
    rpcHandle?.unsubStop();
    rpcHandle?.unsubPing();
    rpcHandle?.unsubConsume();
    rpcHandle = undefined;
    currentCtx = undefined;
    if (ownsManagerRegistry && globalThis[MANAGER_KEY] === registryEntry) {
      delete globalThis[MANAGER_KEY];
    }
    releaseOwner();
    scheduler.stop();
    for (const task of workflowTasks.values())
      task.abortController.abort();
    workflowTasks.clear();
    const cutShort = manager.listAllAgents().filter((r) => r.status === "stopped" && r.stopCause === undefined && manager.isRunActive(r.id));
    for (const record of cutShort)
      record.stopCause = "session-end";
    const live = manager.listAllAgents().filter((r) => r.status === "running" || r.status === "queued");
    const { reason, targetSessionFile } = event ?? {};
    const switching = isSessionSwitch(reason) && (reason === "reload" ? currentSession !== undefined : typeof targetSessionFile === "string");
    const kept = new Set(switching ? live.filter((r) => isTopLevelAgent(r) && r.isBackground !== false && isSessionOnDisk(r.ownerSession)).map((r) => r.id) : []);
    const rootOf = (record) => {
      let current = record;
      for (let parent = current.parentAgentId;parent !== undefined; parent = current.parentAgentId) {
        const next = manager.getRecord(parent);
        if (!next)
          break;
        current = next;
      }
      return current.id;
    };
    const interrupted = [...cutShort, ...live.filter((r) => !kept.has(rootOf(r)))];
    const carried = switching && manager.listAllAgents().some((r) => isTopLevelAgent(r) && !ownedHere(r) && !r.resultConsumed && !manager.isRunActive(r.id) && isSessionOnDisk(r.ownerSession));
    const parking = kept.size > 0 || carried;
    if (kept.size > 0) {
      for (const record of interrupted)
        manager.abort(record.id, "session-end");
    } else {
      manager.abortAll("session-end");
    }
    await manager.awaitWorktreeCleanup(15000, kept.size > 0 ? new Set(interrupted.map((r) => r.id)) : undefined);
    for (const record of interrupted) {
      if (isTopLevelAgent(record))
        appendRecordEntry(record);
      else
        appendResumeEntry(record);
    }
    if (parking)
      parkAgents(reason, targetSessionFile);
    for (const id of outbox.pendingIds()) {
      const record = manager.getRecord(id);
      if (record && isTopLevelAgent(record) && !record.resultConsumed && !manager.isRunActive(id))
        appendRecordEntry(record, true);
    }
    outbox.dispose();
    groupJoin.dispose();
    turnGroupSpawns = [];
    fleet.dispose();
    unsubHandoffKey?.();
    unsubHandoffKey = undefined;
    handoffKeyUi = undefined;
    foregroundHandoffs.clear();
    try {
      widget.dispose();
    } catch {}
    refreshTicker.clear();
    if (parking)
      return;
    await manager.dispose(pi);
  });
  let widgetMode = "background";
  function getWidgetMode() {
    return widgetMode;
  }
  const refreshTicker = new RefreshTicker;
  const widget = new AgentWidget(manager, agentActivity, getWidgetMode, isShowCostEnabled, isShowModelEnabled, refreshTicker);
  function setWidgetMode(m2) {
    widgetMode = m2;
    widget.update();
  }
  const foregroundHandoffs = new Map;
  function sendForegroundToBackground(ids) {
    let sent = 0;
    for (const id of [...ids]) {
      const wake = foregroundHandoffs.get(id);
      if (!wake || !manager.sendToBackground(id))
        continue;
      foregroundHandoffs.delete(id);
      wake();
      sent++;
      const record = manager.getRecord(id);
      if (record) {
        pi.events.emit("subagents:created", {
          id,
          type: record.type,
          description: record.description,
          isBackground: true
        });
      }
    }
    if (sent > 0) {
      widget.ensureTimer();
      widget.update();
      fleet.ensureTimer();
      fleet.update();
    }
    return sent;
  }
  function backgroundActionFor(record, notify) {
    return {
      available: () => foregroundHandoffs.has(record.id),
      send: () => {
        if (sendForegroundToBackground([record.id]) > 0)
          notify(`Sent "${record.description}" to the background.`);
      }
    };
  }
  let handoffKeyUi;
  let unsubHandoffKey;
  function watchHandoffKey(ui) {
    if (ui === handoffKeyUi)
      return;
    unsubHandoffKey?.();
    handoffKeyUi = ui;
    unsubHandoffKey = ui.onTerminalInput((data) => {
      if (foregroundHandoffs.size === 0)
        return;
      const key = getBackgroundKey();
      if (key === undefined || isKeyRelease2(data) || !matchesKey5(data, key))
        return;
      if (!fleet.editorHasFocus())
        return;
      const sent = sendForegroundToBackground(foregroundHandoffs.keys());
      if (sent > 0)
        ui.notify(`Sent ${sent === 1 ? "1 agent" : `${sent} agents`} to the background.`, "info");
      return { consume: true };
    });
  }
  function getFullscreenScrollbar() {
    try {
      const mode = pi.getSettings().fullscreenScrollbar;
      return mode === "always" || mode === "hidden" ? mode : "auto";
    } catch {
      return "auto";
    }
  }
  function getViewerRenderOptions() {
    try {
      const settings = pi.getSettings();
      return {
        hideThinkingBlock: settings.hideThinkingBlock ?? false,
        outputPad: settings.outputPad === 0 ? 0 : 1,
        codeBlockIndent: settings.markdown?.codeBlockIndent ?? "  "
      };
    } catch {
      return {};
    }
  }
  const fleet = new FleetList(manager, agentActivity, isShowCostEnabled, getViewerRenderOptions, refreshTicker, backgroundActionFor, getFullscreenScrollbar);
  let fleetViewEnabled = true;
  function isFleetViewEnabled() {
    return fleetViewEnabled;
  }
  function setFleetViewEnabled(b2) {
    fleetViewEnabled = b2;
    fleet.setEnabled(b2);
  }
  let agentMentionMode = "model";
  function getAgentMentionMode() {
    return agentMentionMode;
  }
  function setAgentMentionMode(mode) {
    agentMentionMode = mode;
  }
  function isAgentMentionsEnabled() {
    return agentMentionMode !== "off";
  }
  let defaultJoinMode = "smart";
  function getDefaultJoinMode() {
    return defaultJoinMode;
  }
  function setDefaultJoinMode(mode) {
    defaultJoinMode = mode;
  }
  let backgroundByDefault = true;
  function getBackgroundByDefault() {
    return backgroundByDefault;
  }
  function setBackgroundByDefault(b2) {
    backgroundByDefault = b2;
  }
  let schedulingEnabled = true;
  function isSchedulingEnabled() {
    return schedulingEnabled;
  }
  function setSchedulingEnabled(b2) {
    schedulingEnabled = b2;
  }
  let workflowsEnabled = true;
  let workflowsPinned = false;
  function isWorkflowsEnabled() {
    return workflowsEnabled;
  }
  function isWorkflowsPinned() {
    return workflowsPinned;
  }
  function setWorkflowsEnabled(b2) {
    workflowsEnabled = b2;
    workflowsPinned = true;
  }
  function setDisableDefaultAgents(b2) {
    setDefaultsDisabled(b2);
    reloadCustomAgents();
  }
  let toolDescriptionMode = "full";
  function getToolDescriptionMode() {
    return toolDescriptionMode;
  }
  function setToolDescriptionMode(mode) {
    toolDescriptionMode = mode;
  }
  let turnGroupSpawns = [];
  let turnGroupCounter = 0;
  function joinTurnGroup(id, joinMode) {
    if (joinMode === "group" && parentTurnActive())
      turnGroupSpawns.push(id);
  }
  function registerTurnGroup() {
    const ids = turnGroupSpawns;
    turnGroupSpawns = [];
    if (ids.length < 2) {
      const record = ids.length === 1 ? manager.getRecord(ids[0]) : undefined;
      if (record?.completedAt != null && !record.resultConsumed)
        sendIndividualNudge(record);
      return;
    }
    const groupId = `turn-${++turnGroupCounter}`;
    groupJoin.registerGroup(groupId, ids);
    for (const id of ids) {
      const record = manager.getRecord(id);
      if (!record)
        continue;
      record.groupId = groupId;
      if (record.completedAt != null && !record.resultConsumed) {
        groupJoin.onAgentComplete(record);
      }
    }
  }
  function reopenTypeProblem(type) {
    reloadCustomAgents();
    const dispatch = resolveSpawnType(type);
    return !dispatch.ok || dispatch.fellBackFrom !== undefined ? `the ${type} agent is no longer available.` : undefined;
  }
  function resumeWritesTranscript(type) {
    return getAgentConfig(type)?.outputTranscript ?? getOutputTranscriptDefault();
  }
  function resumeWiring(ctx, id, opts, state) {
    return {
      onRecord: (rec) => {
        rec.toolCallId = opts.toolCallId;
        if (opts.joinMode)
          rec.joinMode = opts.joinMode;
        if (opts.outputTranscript) {
          rec.outputFile = createOutputFilePath(ctx.cwd, id, ctx.sessionManager.getSessionId());
          ensureOutputFile(rec.outputFile);
        }
      },
      onStarted: () => {
        const rec = manager.getRecord(id);
        state.session = rec?.session;
        if (rec?.session && rec.outputFile) {
          rec.outputCleanup = streamToOutputFile(rec.session, rec.outputFile, id, ctx.cwd, rec.session.messages.length);
        }
      }
    };
  }
  async function startBackgroundResume(ctx, id, prompt, opts) {
    const joinMode = resolveJoinMode(defaultJoinMode, true);
    const known = manager.getRecord(id) ?? manager.findTombstone(id);
    const knownMaxTurns = known?.maxTurns === 0 ? undefined : known?.maxTurns;
    const { state: bgState, callbacks: bgCallbacks } = createActivityTracker(opts.maxTurns ?? knownMaxTurns);
    const wiring = resumeWiring(ctx, id, { ...opts, joinMode }, bgState);
    const record = await manager.resume(id, prompt, undefined, {
      isBackground: true,
      pi,
      ctx,
      checkType: reopenTypeProblem,
      maxTurns: opts.maxTurns,
      onToolActivity: bgCallbacks.onToolActivity,
      onAssistantUsage: bgCallbacks.onAssistantUsage,
      onTurnEnd: bgCallbacks.onTurnEnd,
      ...wiring
    });
    if (!record)
      return;
    if (opts.toolCallId !== undefined)
      joinTurnGroup(id, joinMode);
    agentActivity.set(id, bgState);
    widget.markRunning(id);
    widget.ensureTimer();
    widget.update();
    fleet.ensureTimer();
    fleet.update();
    pi.events.emit("subagents:created", {
      id,
      type: record.type,
      description: record.description,
      isBackground: true
    });
    return record;
  }
  const codemodeAudit = createCodemodeAudit();
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName === "bash")
      boundBashTimeout(event.input, getToolTimeoutSeconds(), false);
    if (event.toolName === CODEMODE_TOOL_NAME)
      boundCodemodeTimeout(event.input, getCodemodeTimeoutSeconds());
    codemodeAudit.recordCall(event, ctx);
    return;
  });
  pi.on("tool_result", (event) => codemodeAudit.onToolResult(event));
  pi.on("before_agent_start", () => {
    const agents2 = interruptedNotice;
    interruptedNotice = [];
    if (disposed || agents2.length === 0)
      return;
    try {
      pi.appendEntry(INTERRUPTED_NOTICE_ENTRY_TYPE, { ids: agents2.map((a) => a.id) });
    } catch {
      return;
    }
    return {
      message: {
        customType: "subagents-interrupted",
        content: formatInterruptedNotice(agents2),
        display: true,
        details: { ids: agents2.map((a) => a.id) }
      }
    };
  });
  pi.on("agent_end", (_event, ctx) => {
    flushPendingUsage(ctx);
    outbox.onAgentEnd();
  });
  pi.on("agent_settled", () => outbox.onAgentEnd());
  pi.on("turn_end", (event) => {
    registerTurnGroup();
    outbox.onTurnEnd(event.message.role === "assistant" ? event.message.stopReason : undefined);
  });
  pi.on("tool_execution_start", async (_event, ctx) => {
    widget.setUICtx(ctx.ui);
    fleet.setUICtx(ctx.ui);
    watchHandoffKey(ctx.ui);
    widget.onTurnStart();
  });
  const buildTypeListText = () => {
    const available = getAvailableTypes();
    return available.map((name) => {
      const cfg = getAgentConfig(name);
      const modelSuffix = cfg?.model ? ` (${getModelLabelFromConfig(cfg.model)})` : "";
      const toolsSuffix = ` (Tools: ${formatToolsSuffix(cfg)})`;
      return `- ${name}: ${cfg?.description ?? name}${modelSuffix}${toolsSuffix}${overrideSuffix(name, cfg)}`;
    }).join(`
`);
  };
  const overrideSuffix = (name, cfg) => cfg?.source === "project" && DEFAULT_AGENTS.has(name) ? " (defined by this project, replacing the built-in)" : "";
  const firstSentence = (text) => {
    const match = text.match(/^.*?[.!?](?=\s|$)/s);
    return (match ? match[0] : text).replace(/\s+/g, " ").trim();
  };
  const buildCompactTypeListText = () => getAvailableTypes().map((name) => {
    const cfg = getAgentConfig(name);
    return `- ${name}: ${firstSentence(cfg?.description ?? name)} (Tools: ${formatToolsSuffix(cfg)})${overrideSuffix(name, cfg)}`;
  }).join(`
`);
  function getModelLabelFromConfig(model) {
    const name = model.includes("/") ? model.split("/").pop() : model;
    return name.replace(/-\d{8}$/, "");
  }
  const settingsAppliers = {
    setMaxConcurrent: (n) => manager.setMaxConcurrent(n),
    setMaxConcurrentForeground: (n) => manager.setMaxConcurrentForeground(n),
    setDefaultMaxTurns,
    setGraceTurns,
    setToolTimeoutSeconds,
    setCodemodeTimeoutSeconds,
    setDefaultJoinMode,
    setBackgroundByDefault,
    setSchedulingEnabled,
    setScopeModels: setScopeModelsEnabled,
    setAllowModelOverride: setModelOverrideAllowed,
    setStrictAgentFiles: (b2) => {
      strictAgentFiles = b2;
    },
    setDisableDefaultAgents,
    setToolDescriptionMode,
    setFleetView: setFleetViewEnabled,
    setAgentMentions: setAgentMentionMode,
    setRememberAgents,
    setWidgetMode,
    setOutputTranscript: setOutputTranscriptDefault,
    setWorktreeIsolation: setWorktreeIsolationEnabled,
    setWorkflowsEnabled,
    setMaxSubagentDepth,
    setFallbackSubagent,
    setReportUsage,
    setShowCost,
    setShowModel,
    setBackgroundKey,
    setWatchdogExemptTools
  };
  applyAndEmitLoaded(settingsAppliers, (event, payload) => pi.events.emit(event, payload), process.cwd(), projectTrusted);
  async function tidyAgentWorktrees(ctx) {
    try {
      const lines = await recoverLeftoverWorktrees(pi, ctx.cwd);
      const pruned = await pruneMergedAgentBranches(pi, ctx.cwd);
      if (pruned.length > 0) {
        lines.push(`Deleted ${pruned.length} merged pi-agent branch${pruned.length === 1 ? "" : "es"} older than ${MERGED_BRANCH_MAX_AGE_DAYS} days: ${pruned.join(", ")}.`);
      }
      if (lines.length === 0 || currentCtx !== ctx)
        return;
      const message = lines.join(`
`);
      if (ctx.hasUI)
        ctx.ui.notify(message, "warning");
      else
        console.warn(`[pi-subagents] ${message}`);
    } catch {}
  }
  function syncProjectTrust(ctx) {
    const trusted = isProjectCodeTrusted(isProjectTrustedBy(ctx), process.cwd());
    if (trusted === projectTrusted)
      return;
    projectTrusted = trusted;
    if (trusted)
      applySettings(loadSettings(process.cwd()), settingsAppliers);
    reloadCustomAgents();
    if (!trusted && existsSync14(join14(process.cwd(), ".pi", "subagents.json"))) {
      const message = "pi-subagents applied this project's .pi/subagents.json before Pi reported the folder as untrusted. " + "Restart pi to drop those settings.";
      if (ctx.hasUI)
        ctx.ui.notify(message, "warning");
      else
        console.warn(`[pi-subagents] ${message}`);
    }
  }
  const skippedProjectAgents = () => projectTrusted ? [] : projectAgentNames(process.cwd());
  let skippedAgentsNoticeFor;
  function noticeSkippedProjectAgents(ctx) {
    const skipped = skippedProjectAgents();
    if (skipped.length === 0 || skippedAgentsNoticeFor === process.cwd())
      return;
    skippedAgentsNoticeFor = process.cwd();
    const message = `pi-subagents did not load this project's agents (${skipped.join(", ")}): ` + `the project is not trusted in Pi. ${TRUST_PROJECT_HINT}`;
    if (ctx.hasUI)
      ctx.ui.notify(message, "warning");
    else
      console.warn(`[pi-subagents] ${message}`);
  }
  function skippedProjectAgentNote(requested) {
    const raw = typeof requested === "string" ? requested.trim() : "";
    if (!raw || !skippedProjectAgents().some((name) => name.toLowerCase() === raw.toLowerCase()))
      return "";
    return `"${raw}" is defined in this project's agent files, which are not loaded because the project ` + `is not trusted in Pi. Tell the user: ${TRUST_PROJECT_HINT}`;
  }
  const scheduleParamShape = {
    schedule: Type3.Optional(Type3.String({
      description: "Opt-in only — fire later instead of now. Omit to run immediately (the default, almost always correct). " + 'Formats: 6-field cron ("0 0 9 * * 1" = 9am Mon), interval ("5m"/"1h", at least 1m), one-shot ("+10m" or ISO). ' + "Forces run_in_background; incompatible with inherit_context and resume. Returns job ID."
    }))
  };
  const scheduleParam = isSchedulingEnabled() ? scheduleParamShape : {};
  const scheduleGuideline = isSchedulingEnabled() ? `
- Use \`schedule\` only when the user explicitly asked for scheduled / recurring / delayed execution (e.g. "every Monday", "in an hour"). Don't auto-schedule from vague intent like "monitor X" — run once now or ask.` : "";
  const isolationGuideline = isWorktreeIsolationEnabled() ? `
- Use isolation: "worktree" to give the agent its own git worktree (safe parallel file modifications); leave it unset, or pass "off", for none. The worktree is removed when the agent finishes; if it made changes, they are committed to a branch and the branch is named in the result.` : "";
  const modelOverrideAllowed = isModelOverrideAllowed();
  const modelGuideline = modelOverrideAllowed ? `- Use model to specify a different model (as "provider/modelId", or a short name such as "haiku"; the parent's provider is preferred, and a name matching models of several other providers is refused).
- Use thinking to control extended thinking level.
` : "";
  const modelParamShape = {
    model: Type3.Optional(Type3.String({
      description: `Optional model override. Accepts "provider/modelId", or a short name (e.g. "haiku"); the parent's provider is preferred, and a name matching models of several other providers is refused. Omit to use the agent type's default.`
    })),
    thinking: Type3.Optional(Type3.String({
      description: `Thinking level: ${THINKING_LEVELS.join(", ")}. Overrides agent default.`
    }))
  };
  const modelParams = modelOverrideAllowed ? modelParamShape : {};
  const isolationCompactGuideline = isWorktreeIsolationEnabled() ? `
- isolation: "worktree" gives the agent its own git worktree (removed on completion); changes land on a branch named in the result.` : "";
  const compactAgentToolDescription = `Launch an autonomous agent for complex, multi-step tasks. Agent types:
${buildCompactTypeListText()}

Custom agents: .pi/agents/<name>.md (project) or ${getAgentDir11()}/agents/<name>.md (global).

Notes:
- description: 3-5 words (shown in UI). Prompts must be self-contained — the agent has not seen this conversation.
- Parallel work: one message, multiple Agent calls — they run concurrently.
- Subagents run in the background by default; you'll be notified when one completes. Pass run_in_background: false only when your very next action depends on the result and nothing else could usefully happen while it runs. Never fabricate or predict a pending agent's results — if the user asks before the notification arrives, say it's still running.
- The result is not shown to the user — summarize it for them. Verify an agent's claimed code changes before reporting work done.
- resume continues a previous agent by ID; steer_subagent messages a running one.${isolationCompactGuideline}`;
  const fullAgentToolDescription = `Launch a new agent to handle complex, multi-step tasks autonomously. Each agent type has specific capabilities and tools available to it.

Available agent types and the tools they have access to:
${buildTypeListText()}

Custom agents can be defined in .pi/agents/<name>.md (project) or ${getAgentDir11()}/agents/<name>.md (global) — they are picked up automatically. Project-level agents override global ones. Creating a .md file with the same name as a default agent overrides it.

When using the Agent tool, specify a subagent_type parameter to select which agent type to use.

## When not to use

If the target is already known, use a direct tool — \`read\` for a known path, \`grep\`/\`find\` for a specific symbol or string. Reserve this tool for open-ended questions that span the codebase, or tasks that match an available agent type.

## Usage notes

- Always include a short (3-5 word) description summarizing what the agent will do (shown in UI).
- When you launch multiple agents for independent work, send them in a single message with multiple tool uses so they run concurrently. If the user specifies that they want you to run agents "in parallel", you MUST send a single message with multiple Agent tool use content blocks.
- When the agent is done, it returns a single message back to you. The result is not visible to the user — to show the user, send a text message with a concise summary.
- Trust but verify: an agent's summary describes what it intended to do, not necessarily what it did. When an agent writes or edits code, check the actual changes before reporting the work as done.
- Agents run in the background by default. When an agent runs in the background, you will be automatically notified when it completes — do NOT sleep, poll, or proactively check on its progress. Continue with other work or respond to the user instead.
- **Foreground vs background**: Pass \`run_in_background: false\` only when your very next action depends on the agent's result and nothing else could usefully happen while it runs — e.g., a research agent whose finding gates the edit you're about to make. Otherwise let it run in the background (the default) — this includes fire-and-forget work, independent investigations, and anything where the user might hand you something else in the meantime. Wanting the result "next" is not enough on its own.
- **Don't race**: after launching a background agent, you know nothing about its results. Never fabricate or predict them in any format — not as prose, summary, or structured output. The completion notification arrives in a later turn; it is never something you write yourself. If the user asks before it lands, say the agent is still running — give status, not a guess.
- Use resume with an agent ID to continue a previous agent's work. An agent that stopped or failed (a provider error, a restart of your own session) keeps its whole context: resume it rather than starting a fresh one, which would redo its work. A new (non-resume) Agent call starts a fresh agent with no memory of prior runs, so the prompt must be self-contained.
- Use steer_subagent to send mid-run messages to a running background agent.
- Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, etc.), since it is not aware of the user's intent.
- If an agent's description says it should be used proactively, try to use it without the user having to ask for it first.
${modelGuideline}- Use inherit_context if the agent needs the parent conversation history.${isolationGuideline}${scheduleGuideline}

## Writing the prompt

Brief the agent like a smart colleague who just walked into the room — it hasn't seen this conversation, doesn't know what you've tried, doesn't understand why this task matters.
- Explain what you're trying to accomplish and why.
- Describe what you've already learned or ruled out.
- Give enough context about the surrounding problem that the agent can make judgment calls rather than just following a narrow instruction.
- If you need a short response, say so ("report in under 200 words").
- Lookups: hand over the exact command. Investigations: hand over the question — prescribed steps become dead weight when the premise is wrong.

Terse command-style prompts produce shallow, generic work.

**Never delegate understanding.** Don't write "based on your findings, fix the bug" or "based on the research, implement it." Those phrases push synthesis onto the agent instead of doing it yourself. Write prompts that prove you understood: include file paths, line numbers, what specifically to change.`;
  const renderToolDescriptionTemplate = (template) => {
    const vars = {
      typeList: buildTypeListText,
      compactTypeList: buildCompactTypeListText,
      agentDir: getAgentDir11,
      isolationGuideline: () => isolationGuideline,
      scheduleGuideline: () => scheduleGuideline,
      modelGuideline: () => modelGuideline
    };
    return template.replace(/\{\{(\w+)\}\}/g, (raw, name) => {
      if (vars[name])
        return vars[name]();
      console.warn(`[pi-subagents] agent-tool-description.md: unknown placeholder ${raw} left as-is`);
      return raw;
    });
  };
  const loadCustomToolDescription = () => {
    for (const path of [
      ...projectTrusted ? [join14(process.cwd(), ".pi", "agent-tool-description.md")] : [],
      join14(getAgentDir11(), "agent-tool-description.md")
    ]) {
      try {
        if (!existsSync14(path))
          continue;
        const text = readFileSync10(path, "utf-8").trim();
        if (text)
          return renderToolDescriptionTemplate(text);
        console.warn(`[pi-subagents] ${path} is empty — ignoring`);
      } catch (err) {
        console.warn(`[pi-subagents] failed to read ${path}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return;
  };
  const agentToolDescription = (() => {
    const mode = getToolDescriptionMode();
    if (mode === "compact")
      return compactAgentToolDescription;
    if (mode === "custom") {
      const custom = loadCustomToolDescription();
      if (custom)
        return custom;
      console.warn('[pi-subagents] toolDescriptionMode is "custom" but no agent-tool-description.md found — using "full"');
    }
    return fullAgentToolDescription;
  })();
  const agentTool = defineTool3({
    name: SUBAGENT_TOOL_NAMES.AGENT,
    label: "Agent",
    description: agentToolDescription,
    promptSnippet: "Launch autonomous sub-agents for complex multi-step tasks",
    promptGuidelines: [
      "Use Agent with specialized agents when the task matches an agent type's description. Subagents are valuable for parallelizing independent queries or for protecting the main context window from excessive results, but should not be used excessively when not needed. Importantly, avoid duplicating work that subagents are already doing — if you delegate research to a subagent, do not also perform the same searches yourself.",
      "For broad codebase exploration or research, spawn Agent with an appropriate subagent_type (e.g. Explore). Otherwise use direct tools (read, grep, find) when the target is already known.",
      "When an agent runs in the background, you will be notified on completion — do not poll or sleep waiting for it. Continue with other work instead.",
      "Trust but verify: an agent's summary describes intent, not outcome. When an agent writes or edits code, check the actual changes before reporting work as done."
    ],
    parameters: Type3.Object({
      prompt: Type3.String({
        description: "The task for the agent to perform."
      }),
      description: Type3.String({
        description: "A short (3-5 word) description of the task (shown in UI)."
      }),
      name: Type3.Optional(Type3.String({
        description: 'Optional memorable name for this agent, e.g. "auth-audit", so it can be addressed as `@name` at the prompt and by steer_subagent / get_subagent_result. Letters, digits, `_` and `-`. Worth setting when several agents of the same type run at once; omit for one-off work. The agent stays reachable by its type either way.'
      })),
      subagent_type: Type3.String({
        description: `The type of specialized agent to use. Available types: ${getAvailableTypes().join(", ")}. Custom agents from .pi/agents/*.md (project) or ${getAgentDir11()}/agents/*.md (global) are also available.`
      }),
      ...modelParams,
      max_turns: Type3.Optional(Type3.Number({
        description: "Maximum number of agentic turns before stopping. Omit for unlimited (default).",
        minimum: 1
      })),
      run_in_background: Type3.Optional(Type3.Boolean({
        description: "Defaults to true — the agent runs detached, returning its ID immediately, and you are notified on completion. Set false only when your very next action depends on the result; the call then blocks and returns the agent's full output inline."
      })),
      resume: Type3.Optional(Type3.String({
        description: "Optional agent ID to resume from (the `Agent ID:` of an earlier result). Continues from previous context, with the agent's own model, working directory and worktree. Finished, stopped and failed agents stay resumable, with their context, as long as their saved session exists, also after a restart of your session. Resumes detached like any other spawn; pass run_in_background: false to block and get the result inline. An agent can only be resumed once its current run has finished — use steer_subagent to reach one mid-run."
      })),
      isolated: Type3.Optional(Type3.Boolean({
        description: "If true, agent gets no extension/MCP tools, skills or nested agents — only built-in tools. It still inherits the environment variables, model access, Pi settings and, for append-mode agents, the parent's system prompt; it is not a sandbox."
      })),
      inherit_context: Type3.Optional(Type3.Boolean({
        description: "If true, fork parent conversation into the agent. Default: false (fresh context)."
      })),
      ...isolationParam(isWorktreeIsolationEnabled()),
      ...scheduleParam
    }),
    prepareArguments: argumentRepair(AGENT_ARG_SHAPE),
    renderCall(args, theme, context) {
      const rowBackground = hasAgentBadge(args.subagent_type) ? theme.getBgAnsi(context.isPartial ? "toolPendingBg" : context.isError ? "toolErrorBg" : "toolSuccessBg") : "";
      const desc = args.description ?? "";
      const name = renderAgentName(args.subagent_type, theme, {
        fallbackColor: "toolTitle",
        restoreBackground: rowBackground,
        bold: true
      });
      return new Text2(rowBackground + "▸ " + name + (desc ? "  " + theme.fg("muted", desc) : ""), 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme, renderContext) {
      const details = result.details;
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";
      if (!details?.status || renderContext.isError && details.agentId === undefined) {
        return new Text2(text, 0, 0);
      }
      const stats2 = (d) => {
        const parts = [];
        if (d.modelName)
          parts.push(d.modelName);
        if (d.tags)
          parts.push(...d.tags);
        if (d.turnCount != null && d.turnCount > 0) {
          parts.push(formatTurns(d.turnCount, d.maxTurns));
        }
        if (d.toolUses > 0)
          parts.push(`${d.toolUses} tool use${d.toolUses === 1 ? "" : "s"}`);
        if (d.tokens)
          parts.push(d.tokens);
        if (showCost) {
          const costText = formatCost(d.cost ?? 0);
          if (costText)
            parts.push(costText);
        }
        return parts.map((p2) => fgPreservingNestedStyles(theme, "dim", p2)).join(" " + theme.fg("dim", "·") + " ");
      };
      if (isPartial || details.status === "running") {
        const frame = SPINNER[details.spinnerFrame ?? 0];
        const s3 = stats2(details);
        const status = renderRunningAgentStatus(frame, s3, details.activity ?? "thinking…", theme);
        const backgroundKey = getBackgroundKey();
        if (details.backgroundHint && backgroundKey && details.durationMs >= BACKGROUND_HINT_DELAY_MS) {
          status.addChild(new Text2(theme.fg("dim", `     (${backgroundKey} to run in background)`), 0, 0));
        }
        return status;
      }
      if (details.status === "background") {
        return new Text2(theme.fg("dim", `  ⎿  Running in background (ID: ${details.agentId})`), 0, 0);
      }
      if (details.status === "completed" || details.status === "steered") {
        const duration = formatMs(details.durationMs);
        const isSteered = details.status === "steered";
        const icon = isSteered ? theme.fg("warning", "✓") : theme.fg("success", "✓");
        const s3 = stats2(details);
        let line2 = icon + (s3 ? " " + s3 : "");
        line2 += " " + theme.fg("dim", "·") + " " + theme.fg("dim", duration);
        if (expanded) {
          const resultText = result.content[0]?.type === "text" ? result.content[0].text : "";
          if (resultText) {
            const lines = resultText.split(`
`).slice(0, 50);
            for (const l of lines) {
              line2 += `
` + theme.fg("dim", `  ${l}`);
            }
            if (resultText.split(`
`).length > 50) {
              line2 += `
` + theme.fg("muted", "  ... (use get_subagent_result with verbose for full output)");
            }
          }
        } else {
          const doneText = isSteered ? "Wrapped up (turn limit)" : "Done";
          line2 += `
` + theme.fg("dim", `  ⎿  ${doneText}`);
        }
        return new Text2(line2, 0, 0);
      }
      if (details.status === "stopped") {
        const s3 = stats2(details);
        let line2 = theme.fg("dim", "■") + (s3 ? " " + s3 : "");
        line2 += `
` + theme.fg("dim", "  ⎿  Stopped");
        return new Text2(line2, 0, 0);
      }
      if (details.status !== "error" && details.status !== "aborted") {
        return new Text2(text, 0, 0);
      }
      const s2 = stats2(details);
      let line = theme.fg("error", "✗") + (s2 ? " " + s2 : "");
      if (details.status === "error") {
        line += `
` + theme.fg("error", `  ⎿  Error: ${details.error ?? "unknown"}`);
      } else {
        line += `
` + theme.fg("warning", "  ⎿  Aborted (max turns exceeded)");
      }
      return new Text2(line, 0, 0);
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      widget.setUICtx(ctx.ui);
      reloadCustomAgents();
      const rawType = params.subagent_type;
      const dispatch = resolveSpawnType(rawType);
      if (!dispatch.ok && !params.resume) {
        const note = skippedProjectAgentNote(rawType);
        return errorResult(note ? `${dispatch.message} ${note}` : dispatch.message);
      }
      const subagentType = dispatch.ok ? dispatch.type : rawType;
      const requestedType = dispatch.ok && dispatch.fellBackFrom || subagentType;
      const skippedNote = dispatch.ok && dispatch.fellBackFrom ? skippedProjectAgentNote(dispatch.fellBackFrom) : "";
      const fallbackNote = dispatch.ok && dispatch.fellBackFrom !== undefined ? `Note: ${dispatch.fellBackFrom ? `Unknown agent type "${dispatch.fellBackFrom}"` : "No agent type given"} — using ${resolveType(subagentType) ? subagentType : "the fallback agent config"}.${skippedNote ? ` ${skippedNote}` : ""}

` : "";
      const displayName = getDisplayName(subagentType);
      const customConfig = getAgentConfig(subagentType);
      const resolvedConfig = resolveAgentInvocationConfig(customConfig, params, {
        worktreeAllowed: isWorktreeIsolationEnabled(),
        defaultRunInBackground: getBackgroundByDefault()
      });
      let model = ctx.model;
      let modelNote;
      if (resolvedConfig.modelInput) {
        const resolution = resolveModelDetailed(resolvedConfig.modelInput, ctx.modelRegistry, ctx.model?.provider);
        if (resolution.ok) {
          model = resolution.model;
        } else if (resolvedConfig.modelFromParams) {
          return errorResult(resolution.message);
        } else {
          modelNote = unresolvedModelNote(resolvedConfig.modelInput, unresolvedReason(resolution), model ?? "the parent's model");
        }
      }
      const spawnNotes = fallbackNote + (modelNote ? `${modelNote}

` : "");
      const scopeVerdict = checkModelScope({
        model,
        cwd: ctx.cwd,
        modelRegistry: ctx.modelRegistry,
        callerSupplied: resolvedConfig.modelFromParams,
        agentLabel: customConfig?.displayName ?? subagentType,
        modelInput: resolvedConfig.modelInput
      });
      if (scopeVerdict.kind === "error")
        return errorResult(scopeVerdict.message);
      if (scopeVerdict.kind === "warn")
        ctx.ui.notify(scopeVerdict.message, "warning");
      const thinking = resolvedConfig.thinking;
      const inheritContext = resolvedConfig.inheritContext;
      const runInBackground = resolvedConfig.runInBackground;
      const isolated = resolvedConfig.isolated;
      const isolation = resolvedConfig.isolation;
      const outputTranscript = customConfig?.outputTranscript ?? getOutputTranscriptDefault();
      const attachTranscript = (rec, agentId) => {
        if (!rec || !outputTranscript)
          return;
        rec.outputFile = createOutputFilePath(ctx.cwd, agentId, ctx.sessionManager.getSessionId());
        writeInitialEntry(rec.outputFile, agentId, params.prompt, ctx.cwd);
      };
      const { modelName, modelId } = model ? describeModel(model) : { modelName: undefined, modelId: undefined };
      const askedModel = ((asked) => {
        if (!asked)
          return;
        const resolvedAsked = resolveModel(asked, ctx.modelRegistry, ctx.model?.provider);
        if (typeof resolvedAsked === "string")
          return asked;
        return resolvedAsked.provider === model?.provider && resolvedAsked.id === model?.id ? undefined : asked;
      })(resolvedConfig.overridden?.model);
      const effectiveMaxTurns = normalizeMaxTurns(resolvedConfig.maxTurns ?? getDefaultMaxTurns());
      const agentInvocation = {
        modelName,
        modelId,
        thinking,
        requestedThinking: resolvedConfig.overridden?.thinking,
        requestedModel: askedModel,
        maxTurns: normalizeMaxTurns(resolvedConfig.maxTurns),
        isolated,
        inheritContext,
        runInBackground,
        isolation
      };
      const modeLabel = getPromptModeLabel(subagentType);
      const { tags: invocationTags } = buildInvocationTags(agentInvocation);
      const agentTags = modeLabel ? [modeLabel, ...invocationTags] : invocationTags;
      const detailBase = {
        displayName,
        description: params.description,
        subagentType,
        modelName,
        tags: agentTags.length > 0 ? agentTags : undefined
      };
      const detailBaseFor = (rec) => {
        if (!rec?.invocation)
          return detailBase;
        const type = rec.type;
        const { modelName: recModelName, tags } = buildInvocationTags(rec.invocation);
        const recModeLabel = getPromptModeLabel(type);
        const recTags = recModeLabel ? [recModeLabel, ...tags] : tags;
        return {
          displayName: getDisplayName(type),
          description: rec.description,
          subagentType: type,
          modelName: recModelName,
          tags: recTags.length > 0 ? recTags : undefined
        };
      };
      if (params.schedule) {
        if (!isSchedulingEnabled()) {
          return errorResult("Scheduling is disabled in this project. Enable via /agents → Settings → Scheduling.");
        }
        if (params.resume) {
          return errorResult("Cannot combine `schedule` with `resume` — schedules create fresh agents.");
        }
        if (params.inherit_context) {
          return errorResult("Cannot combine `schedule` with `inherit_context` — there is no parent conversation at fire time.");
        }
        if (params.run_in_background === false) {
          return errorResult("Cannot combine `schedule` with `run_in_background: false` — scheduled jobs always run in background.");
        }
        if (!scheduler.isActive()) {
          return errorResult("Scheduler is not active in this session yet. Try again after the session has fully started.");
        }
        try {
          const job = scheduler.addJob({
            name: params.description,
            description: params.description,
            schedule: params.schedule,
            subagent_type: requestedType,
            prompt: params.prompt,
            model: isModelOverrideAllowed() ? params.model : undefined,
            thinking,
            max_turns: effectiveMaxTurns,
            isolated,
            isolation
          });
          const next = scheduler.getNextRun(job.id);
          return textResult2(`${fallbackNote}Scheduled "${job.name}" (id: ${job.id}, type: ${job.scheduleType}). ` + `Next run: ${next ?? "(unknown)"}. ` + `Manage via /agents → Scheduled jobs.`);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      }
      if (params.resume) {
        const resumeMaxTurns = params.max_turns != null ? normalizeMaxTurns(params.max_turns) : undefined;
        const live = resolveAgentRef(params.resume);
        const resolved = live ? undefined : manager.resolveMention(params.resume);
        const evicted = resolved?.kind === "tombstone" ? resolved.entry : undefined;
        const target = live && isTopLevelAgent(live) ? live : evicted;
        if (!target) {
          return errorResult(`Agent not found: "${params.resume}". Agents stay resumable while their session file exists ` + `(subagent sessions are saved unless rememberAgents is off); this one is unknown or was never saved.`);
        }
        const id = target.id;
        if (live && !live.session) {
          return errorResult(`Agent "${params.resume}" has no session to resume — it never got far enough to start one.`);
        }
        if (live && (live.status === "running" || live.status === "queued")) {
          return errorResult(`Agent "${params.resume}" is still ${live.status} — it can only be resumed once its current run finishes.
` + `Use steer_subagent to send it a message mid-run. A completion notification arrives on its own when the run finishes.`);
        }
        const resumeTranscript = resumeWritesTranscript(target.type);
        if (runInBackground) {
          let record3;
          try {
            record3 = await startBackgroundResume(ctx, id, params.prompt, {
              outputTranscript: resumeTranscript,
              maxTurns: resumeMaxTurns,
              toolCallId
            });
          } catch (err) {
            return errorResult(err instanceof Error ? err.message : String(err));
          }
          if (!record3) {
            return errorResult(`Agent "${params.resume}" is still running — it can only be resumed once its current run finishes.`);
          }
          const isQueued = record3.status === "queued";
          return textResult2(`Agent ${isQueued ? "queued" : "resumed"} in background.
` + `Agent ID: ${id}
` + `Type: ${record3.type}
` + (record3.outputFile ? `Output file: ${record3.outputFile}
` : "") + (isQueued ? `Position: queued (max ${manager.getMaxConcurrent()} concurrent)
` : "") + `
${BACKGROUND_FOLLOW_UP}`, { ...detailBaseFor(record3), toolUses: record3.toolUses, tokens: "", durationMs: 0, status: "background", agentId: id });
        }
        const knownMaxTurns = target.maxTurns === 0 ? undefined : target.maxTurns;
        const { state: fgResumeState, callbacks: fgResumeCallbacks } = createActivityTracker(resumeMaxTurns ?? knownMaxTurns);
        const wiring = resumeWiring(ctx, id, { outputTranscript: resumeTranscript }, fgResumeState);
        let record2;
        try {
          record2 = await manager.resume(id, params.prompt, signal, {
            maxTurns: resumeMaxTurns,
            pi,
            ctx,
            checkType: reopenTypeProblem,
            onToolActivity: fgResumeCallbacks.onToolActivity,
            onAssistantUsage: fgResumeCallbacks.onAssistantUsage,
            onTurnEnd: fgResumeCallbacks.onTurnEnd,
            onRecord: (rec) => {
              wiring.onRecord(rec);
              agentActivity.set(id, fgResumeState);
              widget.markRunning(id);
              widget.ensureTimer();
              fleet.ensureTimer();
            },
            onStarted: wiring.onStarted
          });
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        } finally {
          agentActivity.delete(id);
          widget.markFinished(id);
          fleet.onAgentFinished(id);
        }
        if (!record2) {
          return errorResult(`Agent "${params.resume}" is still running — it can only be resumed once its current run finishes.
` + `Use steer_subagent to send it a message mid-run. A completion notification arrives on its own when the run finishes.`);
        }
        if (record2.outputCleanup) {
          try {
            record2.outputCleanup();
          } catch {}
          record2.outputCleanup = undefined;
        }
        if (record2.status === "error") {
          return textResult2(`Agent failed: ${record2.error}${partialOutputSuffix(record2)}${sessionFileLine(record2)}${agentIdLine(record2.id)}`, buildDetails(detailBaseFor(record2), record2), true);
        }
        return textResult2((getForegroundOutcomeNote(record2.status, record2.stopCause) ? `Agent resumed${getForegroundOutcomeNote(record2.status, record2.stopCause)}.

` : "") + (record2.result?.trim() || "No output.") + (isFailedStatus(record2.status) ? sessionFileLine(record2) : "") + agentIdLine(record2.id), buildDetails(detailBaseFor(record2), record2), isFailedStatus(record2.status));
      }
      const backgroundResult = (id, record2) => {
        const isQueued = record2?.status === "queued";
        return textResult2(`${spawnNotes}Agent ${isQueued ? "queued" : "started"} in background.
` + `Agent ID: ${id}
` + `Type: ${displayName}
` + `Description: ${params.description}
` + (record2?.outputFile ? `Output file: ${record2.outputFile}
` : "") + (isQueued ? `Position: queued (max ${manager.getMaxConcurrent()} concurrent)
` : "") + `
${BACKGROUND_FOLLOW_UP}
` + `Do not duplicate this agent's work.`, { ...detailBaseFor(record2), toolUses: 0, tokens: "", durationMs: 0, status: "background", agentId: id });
      };
      if (runInBackground) {
        const { state: bgState, callbacks: bgCallbacks } = createActivityTracker(effectiveMaxTurns);
        let id;
        const bgCwd = ctx.cwd;
        const origBgOnSession = bgCallbacks.onSessionCreated;
        bgCallbacks.onSessionCreated = (session) => {
          origBgOnSession(session);
          const rec = manager.getRecord(id);
          if (rec?.outputFile) {
            rec.outputCleanup = streamToOutputFile(session, rec.outputFile, id, bgCwd);
          }
        };
        id = manager.spawn(pi, ctx, subagentType, params.prompt, {
          description: params.description,
          name: params.name,
          model,
          maxTurns: effectiveMaxTurns,
          isolated,
          inheritContext,
          thinkingLevel: thinking,
          isBackground: true,
          isolation,
          invocation: agentInvocation,
          modelNote,
          rootSessionId: ctx.sessionManager.getSessionId(),
          ...bgCallbacks
        });
        const joinMode = resolveJoinMode(defaultJoinMode, true);
        const record2 = manager.getRecord(id);
        if (record2 && joinMode) {
          record2.joinMode = joinMode;
          record2.toolCallId = toolCallId;
          attachTranscript(record2, id);
        }
        await manager.awaitStartup(id);
        joinTurnGroup(id, joinMode);
        agentActivity.set(id, bgState);
        widget.ensureTimer();
        widget.update();
        fleet.ensureTimer();
        fleet.update();
        pi.events.emit("subagents:created", {
          id,
          type: subagentType,
          description: params.description,
          isBackground: true
        });
        return backgroundResult(id, record2);
      }
      let spinnerFrame = 0;
      const startedAt = Date.now();
      let fgId;
      let handoffId;
      let backgrounded = false;
      let queuedAhead;
      const streamUpdate = () => {
        if (backgrounded)
          return;
        const fgRecord = fgId ? manager.getRecord(fgId) : undefined;
        const details2 = {
          ...detailBaseFor(fgRecord),
          toolUses: fgState.toolUses,
          tokens: fgRecord ? formatLifetimeTokens(fgRecord) : "",
          cost: fgRecord ? getLifetimeCost(fgRecord.lifetimeUsage) : 0,
          turnCount: fgState.turnCount,
          maxTurns: fgState.maxTurns,
          durationMs: Date.now() - startedAt,
          status: "running",
          activity: queuedAhead === undefined ? describeActivity(fgState.activeTools, fgState.responseText) : `queued — waiting for a foreground slot${queuedAhead > 0 ? ` (${queuedAhead} ahead)` : ""}`,
          spinnerFrame: spinnerFrame % SPINNER.length,
          backgroundHint: handoffId !== undefined && foregroundHandoffs.keys().next().value === handoffId
        };
        onUpdate?.({
          content: [{ type: "text", text: `${fgState.toolUses} tool uses...` }],
          details: details2
        });
      };
      const { state: fgState, callbacks: fgCallbacks } = createActivityTracker(effectiveMaxTurns);
      const origOnSession = fgCallbacks.onSessionCreated;
      fgCallbacks.onSessionCreated = (session) => {
        origOnSession(session);
        if (queuedAhead !== undefined) {
          queuedAhead = undefined;
          streamUpdate();
        }
        for (const a of manager.listAgents()) {
          if (a.session === session) {
            fgId = a.id;
            agentActivity.set(a.id, fgState);
            widget.ensureTimer();
            fleet.ensureTimer();
            fleet.update();
            break;
          }
        }
        if (fgId) {
          const rec = manager.getRecord(fgId);
          if (rec?.outputFile) {
            rec.outputCleanup = streamToOutputFile(session, rec.outputFile, fgId, ctx.cwd);
          }
        }
      };
      const spinnerOwner = {};
      refreshTicker.set(spinnerOwner, 80, () => {
        spinnerFrame++;
        streamUpdate();
      });
      streamUpdate();
      let wakeBackgrounded;
      const handedOff = new Promise((resolve4) => {
        wakeBackgrounded = () => resolve4(undefined);
      });
      let fgResult;
      try {
        fgResult = await Promise.race([manager.spawnAndWait(pi, ctx, subagentType, params.prompt, {
          description: params.description,
          name: params.name,
          model,
          maxTurns: effectiveMaxTurns,
          isolated,
          inheritContext,
          thinkingLevel: thinking,
          isolation,
          invocation: agentInvocation,
          modelNote,
          signal,
          rootSessionId: ctx.sessionManager.getSessionId(),
          onQueued: (_id, ahead) => {
            queuedAhead = ahead;
            streamUpdate();
          },
          ...fgCallbacks
        }, (fgAgentId) => {
          const fgRec = manager.getRecord(fgAgentId);
          attachTranscript(fgRec, fgAgentId);
          handoffId = fgAgentId;
          foregroundHandoffs.set(fgAgentId, () => {
            if (fgRec) {
              fgRec.toolCallId = toolCallId;
              fgRec.joinMode = "async";
            }
            backgrounded = true;
            wakeBackgrounded();
          });
        }), handedOff]);
      } finally {
        refreshTicker.delete(spinnerOwner);
        if (handoffId !== undefined)
          foregroundHandoffs.delete(handoffId);
        if (fgId && !backgrounded) {
          agentActivity.delete(fgId);
          widget.markFinished(fgId);
          fleet.onAgentFinished(fgId);
        }
      }
      if (fgResult === undefined) {
        widget.update();
        return backgroundResult(handoffId, manager.getRecord(handoffId));
      }
      const record = fgResult.record;
      const tokenText = formatLifetimeTokens(record);
      const details = buildDetails(detailBaseFor(record), record, fgState, { tokens: tokenText });
      if (record.status === "error") {
        return textResult2(`${spawnNotes}Agent failed: ${record.error}${partialOutputSuffix(record)}${sessionFileLine(record)}${agentIdLine(record.id)}`, details, true);
      }
      const durationMs = (record.completedAt ?? Date.now()) - record.startedAt;
      const statsParts = [`${record.toolUses} tool uses`];
      if (tokenText)
        statsParts.push(tokenText);
      if (showCost) {
        const costText = formatCost(getLifetimeCost(record.lifetimeUsage));
        if (costText)
          statsParts.push(costText);
      }
      const modelText = runModelText(record);
      if (modelText)
        statsParts.push(modelText);
      const headline = record.status === "stopped" ? record.stopCause === "session-end" ? "Agent was interrupted by the session's end after" : "Agent was stopped by the user after" : record.status === "aborted" ? "Agent was aborted after" : "Agent completed in";
      return textResult2(`${spawnNotes}${headline} ${formatMs(durationMs)} (${statsParts.join(", ")})${getForegroundOutcomeNote(record.status, record.stopCause)}.

` + (record.result?.trim() || "No output.") + (isFailedStatus(record.status) ? sessionFileLine(record) : "") + agentIdLine(record.id), details, isFailedStatus(record.status));
    }
  });
  function withUsageReporting(tool) {
    return {
      ...tool,
      execute: async (toolCallId, ...rest) => {
        const result = await tool.execute(toolCallId, ...rest);
        if (!reportUsage || !toolCallId)
          return result;
        const usage = pendingUsage.drain();
        return usage ? { ...result, usage } : result;
      }
    };
  }
  function registerToolReportingUsage(tool) {
    pi.registerTool(withUsageReporting(tool));
  }
  const registeredAgentTool = withUsageReporting(agentTool);
  pi.registerTool(registeredAgentTool);
  const workflowTasks = new Map;
  function fleetWorkflows() {
    return [...workflowTasks.values()].map((task) => ({
      id: task.id,
      name: task.meta?.name ?? task.workflowName ?? task.id,
      status: task.status,
      doneCount: task.doneCount,
      totalCount: task.agentCount,
      startedAt: task.startTime,
      ...task.endTime !== undefined ? { completedAt: task.endTime } : {},
      tokens: task.totalTokens
    }));
  }
  async function runWorkflowTask(ctx, task) {
    try {
      const result = await runWorkflow({
        script: task.script,
        args: task.args,
        signal: task.abortController.signal,
        host: createWorkflowHost({
          pi,
          ctx,
          manager,
          signal: task.abortController.signal,
          rootSessionId: ctx.sessionManager.getSessionId(),
          workflowId: task.id
        }),
        onProgress: (entries) => updateWorkflowProgressBatch(task, entries),
        onControl: (control) => {
          task.control = control;
        },
        journal: {
          ...task.replay !== undefined ? { entries: task.replay } : {},
          ...task.journalPath !== undefined ? { append: (entry) => appendJournal(task.journalPath, entry) } : {}
        }
      });
      completeWorkflowTask(task, result);
    } catch (err) {
      failWorkflowTask(task, err instanceof Error ? err.message : String(err));
    }
  }
  function notifyWorkflowFinished(task) {
    widget.update();
    fleet.update();
    flushPendingUsageIfIdle();
    const result = workflowResultText(task);
    const message = {
      content: formatWorkflowNotification(task),
      details: {
        id: task.id,
        description: `Workflow ${task.workflowName ?? task.id}`,
        status: task.status === "completed" ? "completed" : task.status === "killed" ? "stopped" : "error",
        toolUses: task.totalToolCalls,
        turnCount: 0,
        totalTokens: task.totalTokens,
        durationMs: elapsedMs(task, Date.now()),
        error: task.error,
        resultPreview: result.length > 500 ? `${result.slice(0, 500)}…` : result
      }
    };
    outbox.add({ ids: [task.id], build: () => message });
  }
  const workflowTool = defineTool3({
    name: SUBAGENT_TOOL_NAMES.WORKFLOW,
    label: "SubagentWorkflow",
    description: renderToolDescriptionTemplate(workflowToolDescription(isModelOverrideAllowed())),
    promptSnippet: "Run a deterministic script that orchestrates many subagents",
    promptGuidelines: [
      "Use SubagentWorkflow when the number of agents depends on something discovered at runtime, when work flows through stages, or when findings should be independently verified. Use Agent for one delegated task or a handful you can name up front.",
      "Prefer `pipeline` over `parallel` — a barrier costs wall-clock whenever the stages are unevenly sized.",
      "A workflow runs in the background and notifies you when it finishes — do not poll or sleep waiting for it."
    ],
    parameters: Type3.Object({
      script: Type3.Optional(Type3.String({
        maxLength: 524288,
        description: "Inline workflow source. Must begin with `export const meta = { name, description }`."
      })),
      scriptPath: Type3.Optional(Type3.String({
        description: "Path to a workflow script file, absolute or relative to the project. Takes precedence over `script` — this is how you re-run an edited workflow."
      })),
      name: Type3.Optional(Type3.String({
        description: "Name of a saved workflow — `<name>.js` in .pi/workflows/, .agents/workflows/ or the user's agent dir. Lowest precedence: `scriptPath` and `script` both win over it."
      })),
      args: Type3.Optional(Type3.Any({
        description: "Exposed to the script as the global `args`, verbatim. Must be JSON-shaped."
      })),
      resumeFromRunId: Type3.Optional(Type3.String({
        pattern: "^wf_[a-z0-9-]{6,}$",
        description: "Run id of an earlier workflow in this session. Its unchanged leading agent() calls return their recorded results instantly; the first changed or failed call, and everything after it, runs live. Same script and args means nothing re-runs."
      })),
      title: Type3.Optional(Type3.String({ description: "Ignored — set the workflow title in the script's `meta` block." })),
      description: Type3.Optional(Type3.String({ description: "Ignored — set the workflow description in the script's `meta` block." }))
    }),
    renderCall(args, theme, context) {
      const parse = !context || context.argsComplete || context.executionStarted || !context.isPartial;
      return new Text2(`${theme.fg("toolTitle", "▸ ")}${theme.bold(theme.fg("toolTitle", "SubagentWorkflow"))}  ${theme.fg("muted", workflowCallName(args, { parse }))}`, 0, 0);
    },
    renderResult(result, _options, theme, renderContext) {
      const text = result.content[0]?.type === "text" ? result.content[0].text : "";
      const taskId = result.details?.taskId;
      const task = taskId !== undefined ? workflowTasks.get(taskId) : undefined;
      if (renderContext.isError || !task)
        return new Text2(text, 0, 0);
      return renderWorkflowCard({
        progress: task.workflowProgress,
        task: {
          status: task.status,
          workflowName: task.workflowName,
          startTime: task.startTime,
          endTime: task.endTime,
          totalPausedMs: task.totalPausedMs
        },
        meta: task.meta,
        agentCount: task.agentCount,
        totalTokens: task.totalTokens
      }, theme);
    },
    execute: async (toolCallId, params, _signal, _onUpdate, ctx) => {
      const resumeFrom = resolveResumeTarget(params.resumeFromRunId, workflowTasks, (id) => {
        try {
          const dir = sessionTaskDir(ctx.cwd, ctx.sessionManager.getSessionId());
          const journal = join14(dir, `${id}.workflow.jsonl`);
          if (!existsSync14(journal))
            return;
          const script = join14(dir, `${id}.workflow.js`);
          return { journalPath: journal, ...existsSync14(script) ? { scriptPath: script } : {} };
        } catch {
          return;
        }
      });
      if (resumeFrom !== undefined && !resumeFrom.ok)
        return textResult2(resumeFrom.message);
      const resolved = resolveWorkflowScript(params.script === undefined && params.scriptPath === undefined && params.name === undefined && resumeFrom !== undefined ? { scriptPath: resumeFrom.scriptPath } : params, ctx.cwd, isProjectCodeTrusted(isProjectTrustedBy(ctx), ctx.cwd));
      if (!resolved.ok)
        return textResult2(resolved.message);
      let meta;
      try {
        meta = extractMeta(resolved.script).meta;
      } catch (err) {
        return textResult2(err instanceof Error ? err.message : String(err));
      }
      const runId = workflowRunId();
      let savedPath;
      let journalPath;
      try {
        const dir = sessionTaskDir(ctx.cwd, ctx.sessionManager.getSessionId());
        savedPath = join14(dir, `${runId}.workflow.js`);
        writeFileSync4(savedPath, resolved.script, "utf-8");
        journalPath = join14(dir, `${runId}.workflow.jsonl`);
      } catch (err) {
        savedPath = undefined;
        journalPath = undefined;
        console.warn(`[pi-subagents] could not persist workflow script: ${err instanceof Error ? err.message : String(err)}`);
      }
      const replay = resumeFrom !== undefined ? readJournal(resumeFrom.journalPath) : undefined;
      const task = createWorkflowTask({
        id: runId,
        script: resolved.script,
        scriptPath: resolved.scriptPath ?? savedPath,
        args: params.args,
        meta,
        toolCallId,
        ...journalPath !== undefined ? { journalPath } : {},
        ...replay !== undefined && replay.length > 0 ? { replay, resumedFrom: resumeFrom.runId } : {}
      });
      workflowTasks.set(runId, task);
      pruneSettledWorkflowTasks(workflowTasks);
      widget.update();
      fleet.update();
      runWorkflowTask(ctx, task).then(() => {
        if (!disposed)
          notifyWorkflowFinished(task);
      }).catch(() => {});
      return {
        content: [{
          type: "text",
          text: `Workflow "${meta.name}" started in the background.
` + `Task ID: ${runId}
` + (task.scriptPath ? `Script: ${task.scriptPath}
` : "") + (task.resumedFrom !== undefined ? `Resuming ${task.resumedFrom}: ${task.replay?.length ?? 0} recorded call(s) available to replay.
` : params.resumeFromRunId !== undefined ? `Nothing to replay from ${params.resumeFromRunId} — every agent runs live.
` : "") + `
You will be notified when it finishes — do NOT poll or sleep waiting for it.
` + `To iterate, edit the script file and call SubagentWorkflow again with scriptPath.`
        }],
        details: { taskId: runId }
      };
    }
  });
  if (isWorkflowsEnabled())
    pi.registerTool(workflowTool);
  let collisionsChecked = false;
  function resolveWorkflowCollisions(ctx) {
    if (collisionsChecked)
      return;
    collisionsChecked = true;
    const warn = (message) => {
      if (ctx.hasUI)
        ctx.ui.notify(message, "warning");
      else
        console.warn(`[pi-subagents] ${message}`);
    };
    try {
      if (!isWorkflowsEnabled())
        return;
      const verdict = decideWorkflowCollision({
        tools: pi.getAllTools(),
        ownDescription: workflowTool.description,
        pinned: isWorkflowsPinned()
      });
      if (verdict.kind === "none")
        return;
      if (verdict.kind === "report") {
        warn(verdict.message);
        return;
      }
      workflowsEnabled = false;
      widget.update();
      fleet.update();
      warn(verdict.message);
      if (!verdict.withdraw)
        return;
      const active = pi.getActiveTools();
      if (active.includes(SUBAGENT_TOOL_NAMES.WORKFLOW)) {
        pi.setActiveTools(active.filter((name) => name !== SUBAGENT_TOOL_NAMES.WORKFLOW));
      }
    } catch {}
  }
  let workflowFlagHandled = false;
  function runWorkflowFlag(ctx) {
    if (workflowFlagHandled)
      return;
    const flag = pi.getFlag(WORKFLOW_FILE_FLAG);
    if (flag === undefined || flag === false)
      return;
    workflowFlagHandled = true;
    const report = (message, level) => {
      if (ctx.hasUI)
        ctx.ui.notify(message, level);
      else
        console.warn(`[pi-subagents] ${message}`);
    };
    if (!isWorkflowsEnabled()) {
      report(`--${WORKFLOW_FILE_FLAG} ignored: workflows are off. Turn them on in /agents → Settings → Workflows, ` + 'or set `"workflowsEnabled": true` in .pi/subagents.json.', "warning");
      return;
    }
    if (typeof flag !== "string" || flag.trim() === "") {
      report(`--${WORKFLOW_FILE_FLAG} needs a path: --${WORKFLOW_FILE_FLAG}=<path>`, "warning");
      return;
    }
    const path = isAbsolute4(flag.trim()) ? flag.trim() : join14(ctx.cwd, flag.trim());
    let script;
    try {
      script = readWorkflowScriptFile(path);
    } catch (err) {
      report(`Could not read ${path}: ${err instanceof Error ? err.message : String(err)}`, "warning");
      return;
    }
    let meta;
    try {
      meta = extractMeta(script).meta;
    } catch (err) {
      report(err instanceof Error ? err.message : String(err), "warning");
      return;
    }
    const task = createWorkflowTask({ id: workflowRunId(), script, scriptPath: path, meta });
    workflowTasks.set(task.id, task);
    pruneSettledWorkflowTasks(workflowTasks);
    widget.update();
    fleet.update();
    report(`Running workflow ${meta.name}…`, "info");
    runWorkflowTask(ctx, task).then(() => {
      if (disposed)
        return;
      pi.appendEntry(WORKFLOW_ENTRY_TYPE, workflowEntryData(task));
      pi.sendMessage({
        customType: "workflow-result",
        content: formatWorkflowNotification(task),
        display: false
      }, { deliverAs: "nextTurn" });
      widget.update();
      fleet.update();
      flushPendingUsageIfIdle();
    }).catch(() => {});
  }
  function evictedTopLevelAgent(ref) {
    const byId = manager.findTombstone(ref);
    if (byId)
      return isTopLevelAgent(byId) ? byId : undefined;
    const resolved = manager.resolveMention(ref);
    return resolved?.kind === "tombstone" ? resolved.entry : undefined;
  }
  function savedAgentResult(entry) {
    const saved = readSavedResult(entry.sessionFile);
    if (typeof saved === "string") {
      return errorResult(`Agent ${entry.id} finished and was released from memory, and its result cannot be read: ${saved}.`);
    }
    const status = entry.status ?? "unknown";
    const model = entry.model ?? saved.model;
    const thinking = entry.thinking ?? saved.thinking;
    let output = `Agent: ${entry.id}
` + `Type: ${getDisplayName(entry.type)} | Status: ${status}${getStatusNote(status, entry.stopCause)}
` + (model ? `Model: ${thinking ? `${model}, thinking: ${thinking}` : model}
` : "") + `Description: ${entry.description}
` + `(Read from the agent's saved session file, ${entry.sessionFile}: its in-memory record was released after it finished.)

`;
    if (status === "error") {
      output += `Error: ${saved.error ?? "not recorded in the saved session"}`;
      if (saved.text)
        output += `

Partial output before the failure:
${saved.text}`;
    } else {
      output += saved.text || "No output.";
    }
    outbox.cancel(entry.id);
    return textResult2(output, undefined, isFailedStatus(status));
  }
  registerToolReportingUsage(defineTool3({
    name: SUBAGENT_TOOL_NAMES.GET_RESULT,
    label: "Get Agent Result",
    description: "Retrieve a background agent's full result after its completion notification, which carries only a preview. " + "You are notified automatically when a background agent finishes, so do not call this to check on one that is " + "still running — continue with other work instead. Use the agent ID returned by Agent.",
    promptSnippet: "Retrieve a finished background agent's full result",
    parameters: Type3.Object({
      agent_id: Type3.String({
        description: "The agent ID to check. The agent's handle also works — its `name` if you gave it one, otherwise its type (`explore`, `explore-2`)."
      }),
      wait: Type3.Optional(Type3.Boolean({
        description: "If true, block until the agent finishes. Only when there is nothing else to do until it does; " + "otherwise keep working and let the completion notification arrive. Default: false."
      })),
      verbose: Type3.Optional(Type3.Boolean({
        description: "If true, include the agent's full conversation (messages + tool calls). Default: false."
      }))
    }),
    prepareArguments: argumentRepair(RESULT_ARG_SHAPE),
    execute: async (_toolCallId, params, signal, _onUpdate, _ctx) => {
      const record = resolveAgentRef(params.agent_id);
      if (!record) {
        const evicted = evictedTopLevelAgent(params.agent_id);
        if (evicted)
          return savedAgentResult(evicted);
      }
      if (!record || !isTopLevelAgent(record)) {
        return errorResult(`Agent not found: "${params.agent_id}". It may have been cleaned up.`);
      }
      if (params.wait && manager.isRunActive(record.id)) {
        while (record.status === "queued") {
          await abortable(record.startGate ?? new Promise((resolve4) => setTimeout(resolve4, QUEUE_WAIT_POLL_MS)), signal);
        }
        await abortable(manager.awaitStartup(record.id).catch(() => {}), signal);
        if (record.promise)
          await abortable(record.promise, signal);
      }
      const displayName = getDisplayName(record.type);
      const duration = formatDuration2(record.startedAt, record.completedAt);
      const tokens = formatLifetimeTokens(record);
      const contextPercent = getSessionContextPercent(record.session);
      const statsParts = [`Tool uses: ${record.toolUses}`];
      if (tokens)
        statsParts.push(tokens);
      if (showCost) {
        const costText = formatCost(getLifetimeCost(record.lifetimeUsage));
        if (costText)
          statsParts.push(`Cost: ${costText}`);
      }
      if (contextPercent !== null)
        statsParts.push(`Context: ${Math.round(contextPercent)}%`);
      if (record.compactionCount)
        statsParts.push(`Compactions: ${record.compactionCount}`);
      statsParts.push(`Duration: ${duration}`);
      const modelText = runModelText(record);
      let output = `Agent: ${record.id}
` + `Type: ${displayName} | Status: ${record.status}${getStatusNote(record.status, record.stopCause)} | ${statsParts.join(" | ")}
` + (modelText ? `Model: ${modelText}
` : "") + (record.modelNote ? `${record.modelNote}
` : "") + `Description: ${record.description}

`;
      const active = manager.isRunActive(record.id);
      if (record.status === "running" || record.status === "queued") {
        output += stillRunningText(record.status);
      } else if (record.status === "stopped" && active) {
        output += stillRunningText("stopping");
      } else if (record.status === "error") {
        output += `Error: ${record.error}${partialOutputSuffix(record)}${sessionFileLine(record)}`;
      } else {
        output += (record.result?.trim() || "No output.") + (isFailedStatus(record.status) ? sessionFileLine(record) : "");
      }
      if (!active) {
        record.resultConsumed = true;
        outbox.cancel(record.id);
      }
      if (params.verbose && record.session) {
        const conversation = getAgentConversation(record.session);
        if (conversation) {
          output += `

--- Agent Conversation ---
${conversation}`;
        }
      }
      return textResult2(output, undefined, isFailedStatus(record.status));
    }
  }));
  registerToolReportingUsage(defineTool3({
    name: SUBAGENT_TOOL_NAMES.STEER,
    label: "Steer Agent",
    description: "Send a steering message to a running agent. The message will interrupt the agent after its current tool execution " + "and be injected into its conversation, allowing you to redirect its work mid-run. Only works on running agents.",
    promptSnippet: "Send a steering message to redirect a running background agent",
    parameters: Type3.Object({
      agent_id: Type3.String({
        description: "The agent ID to steer (must be currently running). The agent's handle also works — its `name` if you gave it one, otherwise its type (`explore`, `explore-2`)."
      }),
      message: Type3.String({
        description: "The steering message to send. This will appear as a user message in the agent's conversation."
      })
    }),
    prepareArguments: argumentRepair(STEER_ARG_SHAPE),
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      const record = resolveAgentRef(params.agent_id);
      if (!record || !isTopLevelAgent(record)) {
        return errorResult(`Agent not found: "${params.agent_id}". It may have been cleaned up.`);
      }
      if (record.status !== "running") {
        return errorResult(`Agent "${params.agent_id}" is not running (status: ${record.status}). Cannot steer a non-running agent.`);
      }
      if (!record.session) {
        if (!record.pendingSteers)
          record.pendingSteers = [];
        record.pendingSteers.push(params.message);
        pi.events.emit("subagents:steered", { id: record.id, message: params.message });
        return textResult2(`Steering message queued for agent ${record.id}. It will be delivered once the session initializes.`);
      }
      try {
        await steerAgent(record.session, params.message);
        pi.events.emit("subagents:steered", { id: record.id, message: params.message });
        const tokens = formatLifetimeTokens(record);
        const contextPercent = getSessionContextPercent(record.session);
        const stateParts = [];
        if (tokens)
          stateParts.push(tokens);
        if (showCost) {
          const costText = formatCost(getLifetimeCost(record.lifetimeUsage));
          if (costText)
            stateParts.push(costText);
        }
        stateParts.push(`${record.toolUses} tool ${record.toolUses === 1 ? "use" : "uses"}`);
        if (contextPercent !== null)
          stateParts.push(`context ${Math.round(contextPercent)}% full`);
        if (record.compactionCount)
          stateParts.push(`${record.compactionCount} compaction${record.compactionCount === 1 ? "" : "s"}`);
        return textResult2(`Steering message sent to agent ${record.id}. The agent will process it after its current tool execution.
` + `Current state: ${stateParts.join(" · ")}`);
      } catch (err) {
        return errorResult(`Failed to steer agent: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }));
  function getModelLabel(type, registry, parentProvider) {
    const cfg = getAgentConfig(type);
    if (!cfg?.model)
      return "inherit";
    const label = getModelLabelFromConfig(cfg.model);
    if (!registry)
      return label;
    const resolution = resolveModelDetailed(cfg.model, registry, parentProvider);
    if (!resolution.ok)
      return `${label} (${resolution.reason === "ambiguous" ? "ambiguous" : "unavailable"}, fallback: inherit)`;
    const resolved = resolution.model;
    const resolvedFull = `${resolved.provider}/${resolved.id}`;
    const norm = (s2) => s2.toLowerCase().replace(/\./g, "-").replace(/-\d{8}$/, "");
    if (norm(cfg.model) === norm(resolvedFull))
      return label;
    return `${label} (→ ${resolvedFull.replace(/-\d{8}$/, "")})`;
  }
  async function showAgentsMenu(ctx) {
    reloadCustomAgents();
    const allNames = getAllTypes();
    const options = [];
    const agents2 = manager.listAgents().filter(isTopLevelAgent);
    if (agents2.length > 0) {
      const running = agents2.filter((a) => a.status === "running" || a.status === "queued").length;
      const done = agents2.filter((a) => a.status === "completed" || a.status === "steered").length;
      options.push(`Running agents (${agents2.length}) — ${running} running, ${done} done`);
    }
    if (allNames.length > 0) {
      options.push(`Agent types (${allNames.length})`);
    }
    if (scheduler.isActive()) {
      const jobCount = scheduler.list().length;
      options.push(`Scheduled jobs (${jobCount})`);
    }
    if (isWorkflowsEnabled()) {
      options.push(`Workflows (${workflowTasks.size})`);
    }
    options.push("Create new agent");
    options.push("Settings");
    const noAgentsMsg = allNames.length === 0 && agents2.length === 0 ? `No agents found. Create specialized subagents that can be delegated to.

` + `Each subagent has its own context window, custom system prompt, and specific tools.

` + `Try creating: Code Reviewer, Security Auditor, Test Writer, or Documentation Writer.

` : "";
    if (noAgentsMsg) {
      ctx.ui.notify(noAgentsMsg, "info");
    }
    const choice = await ctx.ui.select("Agents", options);
    if (!choice)
      return;
    if (choice.startsWith("Running agents (")) {
      await showRunningAgents(ctx);
      await showAgentsMenu(ctx);
    } else if (choice.startsWith("Agent types (")) {
      await showAllAgentsList(ctx);
      await showAgentsMenu(ctx);
    } else if (choice.startsWith("Scheduled jobs (")) {
      await showSchedulesMenu(ctx, scheduler);
      await showAgentsMenu(ctx);
    } else if (choice.startsWith("Workflows (")) {
      await showWorkflowsMenu(ctx, workflowMenuDeps);
      await showAgentsMenu(ctx);
    } else if (choice === "Create new agent") {
      await showCreateWizard(ctx);
    } else if (choice === "Settings") {
      await showSettings(ctx);
      await showAgentsMenu(ctx);
    }
  }
  async function showAllAgentsList(ctx) {
    const allNames = getAllTypes();
    if (allNames.length === 0) {
      ctx.ui.notify("No agents.", "info");
      return;
    }
    const sourceIndicator = (cfg) => {
      const disabled = cfg?.enabled === false;
      if (cfg?.source === "project")
        return disabled ? "✕• " : "•  ";
      if (cfg?.source === "global")
        return disabled ? "✕◦ " : "◦  ";
      if (disabled)
        return "✕  ";
      return "   ";
    };
    const items = allNames.map((name) => {
      const cfg = getAgentConfig(name);
      const disabled = cfg?.enabled === false;
      const model = getModelLabel(name, ctx.modelRegistry, ctx.model?.provider);
      return {
        id: name,
        label: `${sourceIndicator(cfg)}${name}`,
        currentValue: model,
        description: disabled ? "(disabled)" : cfg?.description ?? name,
        values: [model]
      };
    });
    const hasCustom = allNames.some((n) => {
      const c = getAgentConfig(n);
      return c && !c.isDefault && c.enabled !== false;
    });
    const hasDisabled = allNames.some((n) => getAgentConfig(n)?.enabled === false);
    const legendParts = [];
    if (hasCustom)
      legendParts.push("• = project  ◦ = global");
    if (hasDisabled)
      legendParts.push("✕ = disabled");
    const selected = await ctx.ui.custom((_tui, _theme, _kb, done) => {
      const slTheme = getSettingsListTheme();
      const list = new SettingsList(items, Math.min(items.length, 12), slTheme, (id) => done(id), () => done(undefined));
      const container = new Container;
      container.addChild(new Text2("Agent types", 0, 0));
      if (legendParts.length)
        container.addChild(new Text2(slTheme.hint(legendParts.join("  ")), 0, 0));
      container.addChild(new Spacer(1));
      container.addChild(list);
      return {
        render: (w2) => container.render(w2),
        invalidate: () => container.invalidate(),
        handleInput: (data) => list.handleInput?.(data)
      };
    });
    if (selected && getAgentConfig(selected)) {
      await showAgentDetail(ctx, selected);
      await showAllAgentsList(ctx);
    }
  }
  async function showRunningAgents(ctx) {
    const agents2 = manager.listAgents().filter(isTopLevelAgent);
    if (agents2.length === 0) {
      ctx.ui.notify("No agents.", "info");
      return;
    }
    const record = await selectItem(ctx.ui, "Running agents", agents2, (a) => {
      const dn = getDisplayName(a.type);
      const dur = formatDuration2(a.startedAt, a.completedAt);
      return `${dn} (${a.description}) · ${a.toolUses} tools · ${a.status} · ${dur}`;
    });
    if (!record)
      return;
    await viewAgentConversation(ctx, record);
    await showRunningAgents(ctx);
  }
  async function viewAgentConversation(ctx, record) {
    if (!record.session) {
      ctx.ui.notify(`Agent is ${record.status === "queued" ? "queued" : "expired"} — no session available.`, "info");
      return;
    }
    const session = record.session;
    const activity = agentActivity.get(record.id);
    let overlayOptions = getConversationOverlayOptions({ mode: "regular" });
    await ctx.ui.custom((tui, theme, keybindings, done) => {
      overlayOptions = getConversationOverlayOptions(tui);
      return new ConversationViewer(tui, session, record, activity, theme, done, () => {
        if (manager.abort(record.id)) {
          ctx.ui.notify(`Stopped "${record.description}".`, "info");
        }
      }, keybindings, (message) => manager.steer(record.id, message), showCost, backgroundActionFor(record, (message) => ctx.ui.notify(message, "info")), getFullscreenScrollbar(), getViewerRenderOptions());
    }, {
      overlay: true,
      overlayOptions: () => overlayOptions
    });
  }
  async function showAgentDetail(ctx, name) {
    const cfg = getAgentConfig(name);
    if (!cfg) {
      ctx.ui.notify(`Agent config not found for "${name}".`, "warning");
      return;
    }
    const file = locateAgentFile(name, cfg.sourcePath);
    const isDefault = cfg.isDefault === true;
    const disabled = cfg.enabled === false;
    let menuOptions;
    if (disabled && file) {
      menuOptions = isDefault ? ["Enable", "Edit", "Reset to default", "Delete", "Back"] : ["Enable", "Edit", "Delete", "Back"];
    } else if (isDefault && !file) {
      menuOptions = ["Eject (export as .md)", "Disable", "Back"];
    } else if (isDefault && file) {
      menuOptions = ["Edit", "Disable", "Reset to default", "Delete", "Back"];
    } else {
      menuOptions = ["Edit", "Disable", "Delete", "Back"];
    }
    const choice = await ctx.ui.select(name, menuOptions);
    if (!choice || choice === "Back")
      return;
    if (choice === "Edit" && file) {
      const content = readFileSync10(file.path, "utf-8");
      const edited = await ctx.ui.editor(`Edit ${name}`, content);
      if (edited !== undefined && edited !== content) {
        const { writeFileSync: writeFileSync5 } = await import("node:fs");
        writeFileSync5(file.path, edited, "utf-8");
        reloadCustomAgents();
        ctx.ui.notify(`Updated ${file.path}`, "info");
      }
    } else if (choice === "Delete") {
      if (file) {
        const confirmed = await ctx.ui.confirm("Delete agent", `Delete ${name} from ${file.location} (${file.path})?`);
        if (confirmed) {
          unlinkSync2(file.path);
          reloadCustomAgents();
          ctx.ui.notify(`Deleted ${file.path}`, "info");
        }
      }
    } else if (choice === "Reset to default" && file) {
      const confirmed = await ctx.ui.confirm("Reset to default", `Delete override ${file.path} and restore embedded default?`);
      if (confirmed) {
        unlinkSync2(file.path);
        reloadCustomAgents();
        ctx.ui.notify(`Restored default ${name}`, "info");
      }
    } else if (choice.startsWith("Eject")) {
      await ejectAgent(ctx, name, cfg);
    } else if (choice === "Disable") {
      await disableAgent(ctx, name);
    } else if (choice === "Enable") {
      await enableAgent(ctx, name);
    }
  }
  async function ejectAgent(ctx, name, cfg) {
    const location = await ctx.ui.select("Choose location", [
      "Project (.pi/agents/)",
      `Personal (${personalAgentsDir()})`
    ]);
    if (!location)
      return;
    const targetDir = location.startsWith("Project") ? projectAgentsDir() : personalAgentsDir();
    mkdirSync7(targetDir, { recursive: true });
    const targetPath = join14(targetDir, `${name}.md`);
    if (existsSync14(targetPath)) {
      const overwrite = await ctx.ui.confirm("Overwrite", `${targetPath} already exists. Overwrite?`);
      if (!overwrite)
        return;
    }
    const content = serializeAgentFile(cfg);
    const { writeFileSync: writeFileSync5 } = await import("node:fs");
    writeFileSync5(targetPath, content, "utf-8");
    reloadCustomAgents();
    ctx.ui.notify(`Ejected ${name} to ${targetPath}`, "info");
  }
  async function disableAgent(ctx, name) {
    const file = locateAgentFile(name, getAgentConfig(name)?.sourcePath);
    if (file) {
      const content = readFileSync10(file.path, "utf-8");
      const { content: updated, outcome } = disableInContent(content);
      if (outcome === "already-disabled") {
        ctx.ui.notify(`${name} is already disabled.`, "info");
        return;
      }
      if (outcome === "no-frontmatter") {
        ctx.ui.notify(`Cannot disable ${name}: ${file.path} has no frontmatter block.`, "error");
        return;
      }
      const { writeFileSync: writeFileSync6 } = await import("node:fs");
      writeFileSync6(file.path, updated, "utf-8");
      reloadCustomAgents();
      ctx.ui.notify(`Disabled ${name} (${file.path})`, "info");
      return;
    }
    const location = await ctx.ui.select("Choose location", [
      "Project (.pi/agents/)",
      `Personal (${personalAgentsDir()})`
    ]);
    if (!location)
      return;
    const targetDir = location.startsWith("Project") ? projectAgentsDir() : personalAgentsDir();
    mkdirSync7(targetDir, { recursive: true });
    const targetPath = join14(targetDir, `${name}.md`);
    const { writeFileSync: writeFileSync5 } = await import("node:fs");
    writeFileSync5(targetPath, `---
enabled: false
---
`, "utf-8");
    reloadCustomAgents();
    ctx.ui.notify(`Disabled ${name} (${targetPath})`, "info");
  }
  async function enableAgent(ctx, name) {
    const file = locateAgentFile(name, getAgentConfig(name)?.sourcePath);
    if (!file)
      return;
    const content = readFileSync10(file.path, "utf-8");
    const { content: updated, changed } = enableInContent(content);
    if (!changed && !isEmptyStub(updated)) {
      ctx.ui.notify(`${name} is not disabled in ${file.path}.`, "info");
      return;
    }
    const { writeFileSync: writeFileSync5 } = await import("node:fs");
    if (isEmptyStub(updated)) {
      unlinkSync2(file.path);
      reloadCustomAgents();
      ctx.ui.notify(`Enabled ${name} (removed ${file.path})`, "info");
    } else {
      writeFileSync5(file.path, updated, "utf-8");
      reloadCustomAgents();
      ctx.ui.notify(`Enabled ${name} (${file.path})`, "info");
    }
  }
  async function showCreateWizard(ctx) {
    const location = await ctx.ui.select("Choose location", [
      "Project (.pi/agents/)",
      `Personal (${personalAgentsDir()})`
    ]);
    if (!location)
      return;
    const targetDir = location.startsWith("Project") ? projectAgentsDir() : personalAgentsDir();
    const method = await ctx.ui.select("Creation method", [
      "Generate with Claude (recommended)",
      "Manual configuration"
    ]);
    if (!method)
      return;
    if (method.startsWith("Generate")) {
      await showGenerateWizard(ctx, targetDir);
    } else {
      await showManualWizard(ctx, targetDir);
    }
  }
  async function showGenerateWizard(ctx, targetDir) {
    const description = await ctx.ui.input("Describe what this agent should do");
    if (!description)
      return;
    const name = await ctx.ui.input("Agent name (filename, no spaces)");
    if (!name)
      return;
    mkdirSync7(targetDir, { recursive: true });
    const targetPath = join14(targetDir, `${name}.md`);
    if (existsSync14(targetPath)) {
      const overwrite = await ctx.ui.confirm("Overwrite", `${targetPath} already exists. Overwrite?`);
      if (!overwrite)
        return;
    }
    ctx.ui.notify("Generating agent definition...", "info");
    const generatePrompt = `Create a custom pi sub-agent definition file based on this description: "${description}"

Write a markdown file to: ${targetPath}

The file format is a markdown file with YAML frontmatter and a system prompt body:

\`\`\`markdown
---
description: <one-line description shown in UI>
color: <optional agent name badge color: red, blue, green, yellow, purple, orange, pink, cyan, an Agency Agents alias, or quoted "#RRGGBB">
tools: <comma-separated built-in tools: read, bash, edit, write, grep, find, ls. Use "none" for no tools. Omit for all tools>
model: <optional model as "provider/modelId", e.g. "anthropic/claude-haiku-4-5". Omit to inherit parent model>
thinking: <optional thinking level: ${THINKING_LEVELS.join(", ")}. Omit to inherit>
max_turns: <optional max agentic turns. 0 or omit for unlimited (default)>
prompt_mode: <"replace" (body IS the full system prompt) or "append" (body is appended to default prompt). Default: replace>
extensions: <true (inherit all MCP/extension tools), false (none), or comma-separated names. Default: true>
skills: <true (inherit all), false (none), or comma-separated skill names to preload into prompt. Default: true>
disallowed_tools: <comma-separated tool names to block, even if otherwise available. Omit for none>
inherit_context: <true to fork parent conversation into agent so it sees chat history. Default: false>
run_in_background: <pin this agent to background (true) or foreground (false). Omit to follow the backgroundByDefault setting, which is background>
output_transcript: <false to write no transcript file or path for this agent. Independent of persist_session. Default: true>
isolated: <true for no extension/MCP tools, only built-in tools. Default: false>
memory: <"user" (global), "project" (per-project), or "local" (gitignored per-project) for persistent memory. Omit for none>${isWorktreeIsolationEnabled() ? `
isolation: <"worktree" to run in isolated git worktree; "off" to refuse one even when the caller asks. Omit for normal>` : ""}
---

<system prompt body — instructions for the agent>
\`\`\`

Guidelines for choosing settings:
- For read-only tasks (review, analysis): tools: read, bash, grep, find, ls
- For code modification tasks: include edit, write
- Use prompt_mode: append if the agent should keep the default system prompt and add specialization on top
- Use prompt_mode: replace for fully custom agents with their own personality/instructions
- Set inherit_context: true if the agent needs to know what was discussed in the parent conversation
- Set isolated: true if the agent should NOT have access to MCP servers or other extensions
- Set output_transcript: false to skip writing this agent's transcript; this alone doesn't keep the run off disk (persist_session, isolation: worktree commits, and memory still write) — set those too if that's the goal
- Only include frontmatter fields that differ from defaults — omit fields where the default is fine

Write the file using the write tool. Only write the file, nothing else.`;
    const { record } = await manager.spawnAndWait(pi, ctx, "general-purpose", generatePrompt, {
      description: `Generate ${name} agent`,
      maxTurns: 5,
      bypassQueue: true
    });
    if (record.status === "error") {
      ctx.ui.notify(`Generation failed: ${record.error}`, "warning");
      return;
    }
    reloadCustomAgents();
    if (existsSync14(targetPath)) {
      ctx.ui.notify(`Created ${targetPath}`, "info");
    } else {
      ctx.ui.notify("Agent generation completed but file was not created. Check the agent output.", "warning");
    }
  }
  async function showManualWizard(ctx, targetDir) {
    const name = await ctx.ui.input("Agent name (filename, no spaces)");
    if (!name)
      return;
    const description = await ctx.ui.input("Description (one line)");
    if (!description)
      return;
    const toolChoice = await ctx.ui.select("Tools", ["all", "none", "read-only (read, bash, grep, find, ls)", "custom..."]);
    if (!toolChoice)
      return;
    let tools;
    if (toolChoice === "all") {
      tools = BUILTIN_TOOL_NAMES.join(", ");
    } else if (toolChoice === "none") {
      tools = "none";
    } else if (toolChoice.startsWith("read-only")) {
      tools = "read, bash, grep, find, ls";
    } else {
      const customTools = await ctx.ui.input("Tools (comma-separated)", BUILTIN_TOOL_NAMES.join(", "));
      if (!customTools)
        return;
      tools = customTools;
    }
    const modelChoice = await ctx.ui.select("Model", [
      "inherit (parent model)",
      "haiku",
      "sonnet",
      "opus",
      "custom..."
    ]);
    if (!modelChoice)
      return;
    let model;
    if (modelChoice === "haiku")
      model = "anthropic/claude-haiku-4-5";
    else if (modelChoice === "sonnet")
      model = "anthropic/claude-sonnet-4-6";
    else if (modelChoice === "opus")
      model = "anthropic/claude-opus-4-6";
    else if (modelChoice === "custom...") {
      model = await ctx.ui.input("Model (provider/modelId)") || undefined;
    }
    const thinkingChoice = await ctx.ui.select("Thinking level", ["inherit", ...THINKING_LEVELS]);
    if (!thinkingChoice)
      return;
    const systemPrompt = await ctx.ui.editor("System prompt", "");
    if (systemPrompt === undefined)
      return;
    const content = buildNewAgentFile({
      description,
      tools,
      model,
      thinking: thinkingChoice === "inherit" ? undefined : thinkingChoice,
      systemPrompt
    });
    mkdirSync7(targetDir, { recursive: true });
    const targetPath = join14(targetDir, `${name}.md`);
    if (existsSync14(targetPath)) {
      const overwrite = await ctx.ui.confirm("Overwrite", `${targetPath} already exists. Overwrite?`);
      if (!overwrite)
        return;
    }
    const { writeFileSync: writeFileSync5 } = await import("node:fs");
    writeFileSync5(targetPath, content, "utf-8");
    reloadCustomAgents();
    ctx.ui.notify(`Created ${targetPath}`, "info");
  }
  function snapshotSettings() {
    return {
      maxConcurrent: manager.getMaxConcurrent(),
      maxConcurrentForeground: manager.getMaxConcurrentForeground(),
      defaultMaxTurns: getDefaultMaxTurns() ?? 0,
      graceTurns: getGraceTurns(),
      toolTimeoutSeconds: getToolTimeoutSeconds(),
      codemodeTimeoutSeconds: getCodemodeTimeoutSeconds(),
      defaultJoinMode: getDefaultJoinMode(),
      backgroundByDefault: getBackgroundByDefault(),
      schedulingEnabled: isSchedulingEnabled(),
      scopeModels: isScopeModelsEnabled(),
      allowModelOverride: isModelOverrideAllowed(),
      strictAgentFiles,
      disableDefaultAgents: isDefaultsDisabled(),
      toolDescriptionMode: getToolDescriptionMode(),
      fleetView: isFleetViewEnabled(),
      agentMentions: getAgentMentionMode(),
      rememberAgents: getRememberAgents(),
      widgetMode: getWidgetMode(),
      outputTranscript: getOutputTranscriptDefault(),
      worktreeIsolation: isWorktreeIsolationEnabled(),
      workflowsEnabled: isWorkflowsPinned() ? isWorkflowsEnabled() : undefined,
      maxSubagentDepth: getMaxSubagentDepth(),
      fallbackSubagent: getFallbackSubagent(),
      reportUsage: isReportUsageEnabled(),
      showCost: isShowCostEnabled(),
      showModel: isShowModelEnabled(),
      backgroundKey: backgroundKeySetting,
      ...orchestrationSettingsAsWritten()
    };
  }
  const _settingsSnapshotIsComplete = true;
  const NUMERIC_IDS = new Set([
    "maxConcurrent",
    "maxConcurrentForeground",
    "defaultMaxTurns",
    "graceTurns",
    "toolTimeoutSeconds",
    "maxSubagentDepth"
  ]);
  async function showSettings(ctx) {
    function buildItems() {
      const mc = manager.getMaxConcurrent();
      const mcf = manager.getMaxConcurrentForeground();
      const dmt = getDefaultMaxTurns() ?? 0;
      const gt = getGraceTurns();
      const tts = getToolTimeoutSeconds();
      const msd = getMaxSubagentDepth();
      const fallbackValue = getFallbackSubagent() ?? "general-purpose";
      const fallbackValues = [...new Set([...getAvailableTypes(), NO_FALLBACK])];
      return [
        {
          id: "maxConcurrent",
          label: "Max concurrency",
          description: "Max concurrent background agents (Enter to type)",
          currentValue: String(mc),
          values: [String(mc)]
        },
        {
          id: "maxConcurrentForeground",
          label: "Max foreground concurrency",
          description: "Max concurrent foreground (blocking) agents (0 = unlimited, Enter to type)",
          currentValue: String(mcf),
          values: [String(mcf)]
        },
        {
          id: "defaultMaxTurns",
          label: "Default max turns",
          description: "Default max turns before wrap-up (0 = unlimited, Enter to type)",
          currentValue: String(dmt),
          values: [String(dmt)]
        },
        {
          id: "graceTurns",
          label: "Grace turns",
          description: "Grace turns after wrap-up steer (Enter to type)",
          currentValue: String(gt),
          values: [String(gt)]
        },
        {
          id: "toolTimeoutSeconds",
          label: "Tool timeout",
          description: "Seconds one subagent tool call may run before it is stopped and the agent continues (0 = no limit, Enter to type)",
          currentValue: String(tts),
          values: [String(tts)]
        },
        {
          id: "maxSubagentDepth",
          label: "Nested depth",
          description: "Hard cap on nested delegation — main is 0, its subagents 1 (0/1 = nesting off, Enter to type)",
          currentValue: String(msd),
          values: [String(msd)]
        },
        {
          id: "joinMode",
          label: "Join mode",
          description: "smart = each completion at the parent's next boundary, as in Claude Code; group = one notification per turn's batch",
          currentValue: getDefaultJoinMode() === "group" ? "group" : "smart",
          values: ["smart", "group"]
        },
        {
          id: "backgroundByDefault",
          label: "Background by default",
          description: "An Agent call that doesn't say runs detached (off = blocks the turn and returns inline)",
          currentValue: getBackgroundByDefault() ? "on" : "off",
          values: ["on", "off"]
        },
        {
          id: "schedulingEnabled",
          label: "Scheduling",
          description: "Schedule subagent feature (off removes `schedule` param from Agent tool spec on next pi session)",
          currentValue: isSchedulingEnabled() ? "on" : "off",
          values: ["on", "off"]
        },
        {
          id: "workflowsEnabled",
          label: "Workflows",
          description: "Scripted workflows, on unless another extension provides a workflow tool (off keeps the SubagentWorkflow tool out of the tool spec; applies on next pi session)",
          currentValue: isWorkflowsEnabled() ? "on" : "off",
          values: ["on", "off"]
        },
        {
          id: "scopeModels",
          label: "Scope models",
          description: "Validate subagent models against scoped models (/scoped-models)",
          currentValue: isScopeModelsEnabled() ? "on" : "off",
          values: ["on", "off"]
        },
        {
          id: "allowModelOverride",
          label: "Model override",
          description: "Let Agent calls, workflows and scheduled jobs pick a subagent's model and thinking level; off runs every subagent on your current model and thinking level unless its agent file sets one (the tool parameters change on next pi session)",
          currentValue: isModelOverrideAllowed() ? "on" : "off",
          values: ["on", "off"]
        },
        {
          id: "strictAgentFiles",
          label: "Strict agent files",
          description: "Fail startup on an unreadable/unparseable agent .md instead of skipping it with a warning",
          currentValue: strictAgentFiles ? "on" : "off",
          values: ["on", "off"]
        },
        {
          id: "disableDefaultAgents",
          label: "Disable defaults",
          description: "Hide built-in agents (general-purpose, Explore, Plan) — custom agents are unaffected",
          currentValue: isDefaultsDisabled() ? "on" : "off",
          values: ["on", "off"]
        },
        {
          id: "fallbackSubagent",
          label: "Fallback agent",
          description: `Agent used when subagent_type is unknown, disabled, or ambiguous; "${NO_FALLBACK}" rejects the call instead (strict dispatch)`,
          currentValue: fallbackValue,
          values: fallbackValues
        },
        {
          id: "outputTranscript",
          label: "Output transcript",
          description: "Write each subagent's .output transcript by default. A custom agent's output_transcript frontmatter overrides this.",
          currentValue: getOutputTranscriptDefault() ? "on" : "off",
          values: ["on", "off"]
        },
        {
          id: "worktreeIsolation",
          label: "Worktree isolation",
          description: "Allow isolation: worktree to copy the repo. Off refuses worktrees on every path immediately — for repos where a copy costs too much time or disk — and drops the `isolation` param from the Agent tool spec on next pi session.",
          currentValue: isWorktreeIsolationEnabled() ? "on" : "off",
          values: ["on", "off"]
        },
        {
          id: "reportUsage",
          label: "Report usage to session",
          description: "Add subagent tokens and cost to this session's own totals, so pi's footer and /cost stop reading a delegating session as nearly free. Reported on the next tool result (agents that finish in the background are counted on the one after). Context-window % is unaffected.",
          currentValue: isReportUsageEnabled() ? "on" : "off",
          values: ["on", "off"]
        },
        {
          id: "showCost",
          label: "Show cost",
          description: "Show an estimated `~$0.0042` beside subagent token counts in the widget, fleet view, results and notifications. Priced by pi from the model's rates — omitted entirely for a model it has no rates for.",
          currentValue: isShowCostEnabled() ? "on" : "off",
          values: ["on", "off"]
        },
        {
          id: "showModel",
          label: "Show model",
          description: "Name the model driving each agent, and the thinking level it is running at, on the widget's running rows. The Agent tool result and the conversation viewer show the pair either way — this adds it to the widget, where the row is already dense.",
          currentValue: isShowModelEnabled() ? "on" : "off",
          values: ["on", "off"]
        },
        {
          id: "fleetView",
          label: "Fleet view",
          description: "Claude Code-style main+subagents list below the editor (↓/← to navigate, Enter to view)",
          currentValue: isFleetViewEnabled() ? "on" : "off",
          values: ["on", "off"]
        },
        {
          id: "agentMentions",
          label: "Agent mentions",
          description: "Route `@handle message` at the prompt to that agent. model = an off-screen clone of this conversation calls the Agent tool, so the agent gets a context-written prompt, a transcript and per-tool detail, and the chat stays clean; direct = started here from your text, no model call. Messaging and resuming are direct either way.",
          currentValue: getAgentMentionMode(),
          values: ["model", "direct", "off"]
        },
        {
          id: "rememberAgents",
          label: "Remember agents",
          description: "Persist subagent sessions so `@handle` can resume one long after it finished (they also appear in /resume)",
          currentValue: getRememberAgents() ? "on" : "off",
          values: ["on", "off"]
        },
        {
          id: "widgetMode",
          label: "Widget",
          description: "Above-editor agent widget: all = every agent; background = hide foreground (they already render inline); off = hide the widget.",
          currentValue: getWidgetMode(),
          values: ["all", "background", "off"]
        },
        {
          id: "toolDescriptionMode",
          label: "Tool description",
          description: "Agent tool description sent to the LLM: full (rich, default), compact (~75% fewer tokens, for small/local models), or custom (.pi/agent-tool-description.md with {{placeholders}})",
          currentValue: getToolDescriptionMode(),
          values: ["full", "compact", "custom"]
        }
      ];
    }
    function applyValue(id, value) {
      if (id === "maxConcurrent") {
        const n = parseInt(value, 10);
        if (n >= 1) {
          manager.setMaxConcurrent(n);
          notifyApplied(ctx, `Max concurrency set to ${n}`);
        }
      } else if (id === "maxConcurrentForeground") {
        const n = parseInt(value, 10);
        if (n >= 0) {
          manager.setMaxConcurrentForeground(n);
          notifyApplied(ctx, n === 0 ? "Max foreground concurrency set to unlimited" : `Max foreground concurrency set to ${n}`);
        }
      } else if (id === "defaultMaxTurns") {
        const n = parseInt(value, 10);
        if (n === 0) {
          setDefaultMaxTurns(undefined);
          notifyApplied(ctx, "Default max turns set to unlimited");
        } else if (n >= 1) {
          setDefaultMaxTurns(n);
          notifyApplied(ctx, `Default max turns set to ${n}`);
        }
      } else if (id === "graceTurns") {
        const n = parseInt(value, 10);
        if (n >= 1) {
          setGraceTurns(n);
          notifyApplied(ctx, `Grace turns set to ${n}`);
        }
      } else if (id === "toolTimeoutSeconds") {
        const n = parseInt(value, 10);
        if (n >= 0) {
          setToolTimeoutSeconds(n);
          notifyApplied(ctx, n === 0 ? "Tool timeout off" : `Tool timeout set to ${getToolTimeoutSeconds()} s`);
        }
      } else if (id === "maxSubagentDepth") {
        const n = parseInt(value, 10);
        if (n >= 0) {
          setMaxSubagentDepth(n);
          notifyApplied(ctx, n <= 1 ? "Nested delegation disabled" : `Nested depth set to ${n}. Applies to agents started from now on.`);
        }
      } else if (id === "joinMode") {
        setDefaultJoinMode(value);
        notifyApplied(ctx, `Default join mode set to ${value}`);
      } else if (id === "backgroundByDefault") {
        const enabled = value === "on";
        setBackgroundByDefault(enabled);
        notifyApplied(ctx, enabled ? "Agent calls run in the background unless they pass run_in_background: false" : "Agent calls block and return inline unless they pass run_in_background: true");
      } else if (id === "schedulingEnabled") {
        const enabled = value === "on";
        if (enabled === isSchedulingEnabled()) {
          ctx.ui.notify(`Scheduling already ${enabled ? "enabled" : "disabled"}.`, "info");
        } else {
          setSchedulingEnabled(enabled);
          if (!enabled)
            scheduler.stop();
          notifyApplied(ctx, `Scheduling ${enabled ? "enabled" : "disabled"}. Tool spec change takes effect on next pi session.`);
        }
      } else if (id === "workflowsEnabled") {
        const enabled = value === "on";
        if (enabled === isWorkflowsEnabled()) {
          ctx.ui.notify(`Workflows already ${enabled ? "enabled" : "disabled"}.`, "info");
        } else {
          setWorkflowsEnabled(enabled);
          notifyApplied(ctx, `Workflows ${enabled ? "enabled" : "disabled"}. Tool spec change takes effect on next pi session.`);
        }
      } else if (id === "scopeModels") {
        const enabled = value === "on";
        setScopeModelsEnabled(enabled);
        notifyApplied(ctx, `Scope models ${enabled ? "enabled" : "disabled"}`);
      } else if (id === "allowModelOverride") {
        const enabled = value === "on";
        setModelOverrideAllowed(enabled);
        notifyApplied(ctx, enabled ? "Subagent calls may pick a model and thinking level. Tool spec change takes effect on next pi session." : "Subagents run on your current model and thinking level. Tool spec change takes effect on next pi session.");
      } else if (id === "strictAgentFiles") {
        const enabled = value === "on";
        strictAgentFiles = enabled;
        notifyApplied(ctx, `Strict agent files ${enabled ? "enabled" : "disabled"}. Takes effect on next pi session.`);
      } else if (id === "disableDefaultAgents") {
        const enabled = value === "on";
        setDisableDefaultAgents(enabled);
        notifyApplied(ctx, `Default agents ${enabled ? "disabled" : "enabled"}. Tool spec change takes effect on next pi session.`);
      } else if (id === "fallbackSubagent") {
        setFallbackSubagent(value);
        notifyApplied(ctx, value === NO_FALLBACK ? "Unknown or disabled agent types will now be rejected" : `Unknown agent types will fall back to ${value}`);
      } else if (id === "outputTranscript") {
        const enabled = value === "on";
        setOutputTranscriptDefault(enabled);
        notifyApplied(ctx, `Output transcript ${enabled ? "enabled" : "disabled"} by default`);
      } else if (id === "worktreeIsolation") {
        const enabled = value === "on";
        setWorktreeIsolationEnabled(enabled);
        notifyApplied(ctx, `Worktree isolation ${enabled ? "enabled" : "disabled"}. Tool parameter updates on next pi session.`);
      } else if (id === "toolDescriptionMode") {
        setToolDescriptionMode(value);
        notifyApplied(ctx, `Tool description set to ${value}. Takes effect on next pi session.`);
      } else if (id === "reportUsage") {
        const enabled = value === "on";
        setReportUsage(enabled);
        notifyApplied(ctx, enabled ? "Subagent usage now counted in this session's totals" : "Subagent usage no longer counted in this session's totals");
      } else if (id === "showCost") {
        const enabled = value === "on";
        setShowCost(enabled);
        notifyApplied(ctx, `Cost display ${enabled ? "enabled" : "disabled"}`);
      } else if (id === "showModel") {
        const enabled = value === "on";
        setShowModel(enabled);
        notifyApplied(ctx, `Model display ${enabled ? "enabled" : "disabled"}`);
      } else if (id === "fleetView") {
        const enabled = value === "on";
        setFleetViewEnabled(enabled);
        notifyApplied(ctx, `Fleet view ${enabled ? "enabled" : "disabled"}`);
      } else if (id === "agentMentions") {
        const mode = value;
        setAgentMentionMode(mode);
        notifyApplied(ctx, mode === "off" ? "Agent mentions disabled" : mode === "model" ? "Agent mentions on — a conversation clone starts a mentioned agent off-screen" : "Agent mentions on — a mentioned agent starts here, with no model call");
      } else if (id === "rememberAgents") {
        const enabled = value === "on";
        setRememberAgents(enabled);
        notifyApplied(ctx, `Remember agents ${enabled ? "enabled" : "disabled"}`);
      } else if (id === "widgetMode") {
        setWidgetMode(value);
        notifyApplied(ctx, `Widget set to ${value}`);
      }
    }
    let list;
    let currentIndex = 0;
    const result = await ctx.ui.custom((_tui, _theme, _kb, done) => {
      const items = buildItems();
      list = new SettingsList(items, items.length + 2, getSettingsListTheme(), (id, newValue) => {
        applyValue(id, newValue);
      }, () => done(undefined));
      const container = new Container;
      container.addChild(new Text2("⚙  Subagent Settings", 0, 0));
      container.addChild(new Spacer(1));
      container.addChild(list);
      return {
        render: (w2) => container.render(w2),
        invalidate: () => container.invalidate(),
        handleInput: (data) => {
          if (matchesKey5(data, "up")) {
            currentIndex = Math.max(0, currentIndex - 1);
          } else if (matchesKey5(data, "down")) {
            currentIndex = Math.min(items.length - 1, currentIndex + 1);
          }
          if (matchesKey5(data, Key2.enter) && NUMERIC_IDS.has(items[currentIndex].id)) {
            done(items[currentIndex].id);
            return;
          }
          list.handleInput?.(data);
        }
      };
    });
    if (result && NUMERIC_IDS.has(result)) {
      const current = result === "maxConcurrent" ? String(manager.getMaxConcurrent()) : result === "maxConcurrentForeground" ? String(manager.getMaxConcurrentForeground()) : result === "defaultMaxTurns" ? String(getDefaultMaxTurns() ?? 0) : result === "maxSubagentDepth" ? String(getMaxSubagentDepth()) : result === "toolTimeoutSeconds" ? String(getToolTimeoutSeconds()) : String(getGraceTurns());
      const label = result === "maxConcurrent" ? "Max concurrency (1+)" : result === "maxConcurrentForeground" ? "Max foreground concurrency (0 = unlimited)" : result === "defaultMaxTurns" ? "Default max turns (0 = unlimited)" : result === "maxSubagentDepth" ? "Nested depth (0/1 = nesting off)" : result === "toolTimeoutSeconds" ? "Tool timeout in seconds (0 = no limit)" : "Grace turns (1+)";
      let input = await ctx.ui.input(label, current);
      while (input != null) {
        const trimmed = input.trim();
        const n = Number(trimmed);
        if (trimmed !== "" && Number.isInteger(n)) {
          applyValue(result, String(n));
          await showSettings(ctx);
          return;
        }
        input = await ctx.ui.input(label, trimmed);
      }
    }
  }
  function notifyApplied(ctx, successMsg) {
    const { message, level } = saveAndEmitChanged(snapshotSettings(), successMsg, (event, payload) => pi.events.emit(event, payload));
    ctx.ui.notify(message, level);
  }
  pi.registerCommand("agents", {
    description: "Manage agents",
    handler: async (_args, ctx) => {
      await showAgentsMenu(ctx);
    }
  });
  const workflowMenuDeps = {
    tasks: workflowTasks,
    getRecord: (id) => manager.getRecord(id),
    viewAgentConversation,
    getCtx: () => currentCtx
  };
  fleet.setWorkflowSource(fleetWorkflows, (id) => openWorkflowFromFleet(id, workflowMenuDeps));
}
export {
  workflowEntryData,
  renderRunningAgentStatus,
  previewResult,
  pendingResultsFromEntries,
  interruptedAgentsFromEntries,
  formatToolsSuffix,
  formatInterruptedNotice,
  dist_default as default,
  WORKFLOW_FILE_FLAG,
  WORKFLOW_ENTRY_TYPE,
  FOREIGN_WORKFLOW_TOOL_NAMES
};
