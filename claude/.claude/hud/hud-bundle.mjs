#!/usr/bin/env node

// dist/hud/stdin.js
import { existsSync as existsSync2, readFileSync, writeFileSync, mkdirSync as mkdirSync2 } from "fs";
import { join as join3 } from "path";

// dist/lib/worktree-paths.js
import { createHash } from "crypto";
import { execSync } from "child_process";
import { existsSync, mkdirSync, realpathSync, readdirSync } from "fs";
import { homedir as homedir2 } from "os";
import { resolve, normalize as normalize2, relative, sep as sep2, join as join2, isAbsolute, basename, dirname } from "path";

// dist/utils/config-dir.js
import { join, normalize, parse, sep } from "path";
import { homedir } from "os";
function stripTrailingSep(p) {
  if (!p.endsWith(sep)) {
    return p;
  }
  return p === parse(p).root ? p : p.slice(0, -1);
}
function getClaudeConfigDir() {
  const home = homedir();
  const configured = process.env.CLAUDE_CONFIG_DIR?.trim();
  if (!configured) {
    return stripTrailingSep(normalize(join(home, ".claude")));
  }
  if (configured === "~") {
    return stripTrailingSep(normalize(home));
  }
  if (configured.startsWith("~/") || configured.startsWith("~\\")) {
    return stripTrailingSep(normalize(join(home, configured.slice(2))));
  }
  return stripTrailingSep(normalize(configured));
}

// dist/lib/worktree-paths.js
var OmcPaths = {
  ROOT: ".omc",
  STATE: ".omc/state",
  SESSIONS: ".omc/state/sessions",
  PLANS: ".omc/plans",
  RESEARCH: ".omc/research",
  NOTEPAD: ".omc/notepad.md",
  PROJECT_MEMORY: ".omc/project-memory.json",
  DRAFTS: ".omc/drafts",
  NOTEPADS: ".omc/notepads",
  LOGS: ".omc/logs",
  SCIENTIST: ".omc/scientist",
  AUTOPILOT: ".omc/autopilot",
  SKILLS: ".omc/skills",
  SHARED_MEMORY: ".omc/state/shared-memory",
  DEEPINIT_MANIFEST: ".omc/deepinit-manifest.json"
};
var MAX_WORKTREE_CACHE_SIZE = 8;
var worktreeCacheMap = /* @__PURE__ */ new Map();
function getWorktreeRoot(cwd) {
  const effectiveCwd = cwd || process.cwd();
  if (worktreeCacheMap.has(effectiveCwd)) {
    const root = worktreeCacheMap.get(effectiveCwd);
    worktreeCacheMap.delete(effectiveCwd);
    worktreeCacheMap.set(effectiveCwd, root);
    return root || null;
  }
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      cwd: effectiveCwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5e3
    }).trim();
    if (worktreeCacheMap.size >= MAX_WORKTREE_CACHE_SIZE) {
      const oldest = worktreeCacheMap.keys().next().value;
      if (oldest !== void 0) {
        worktreeCacheMap.delete(oldest);
      }
    }
    worktreeCacheMap.set(effectiveCwd, root);
    return root;
  } catch {
    return null;
  }
}
function validatePath(inputPath) {
  if (inputPath.includes("..")) {
    throw new Error(`Invalid path: path traversal not allowed (${inputPath})`);
  }
  if (inputPath.startsWith("~") || isAbsolute(inputPath)) {
    throw new Error(`Invalid path: absolute paths not allowed (${inputPath})`);
  }
}
var dualDirWarnings = /* @__PURE__ */ new Set();
function getProjectIdentifier(worktreeRoot) {
  const root = worktreeRoot || getWorktreeRoot() || process.cwd();
  let source;
  try {
    const remoteUrl = execSync("git remote get-url origin", {
      cwd: root,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    source = remoteUrl || root;
  } catch {
    source = root;
  }
  let primaryRoot = root;
  try {
    const commonDir = execSync("git rev-parse --path-format=absolute --git-common-dir", {
      cwd: root,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5e3
    }).trim();
    const isGitDir = basename(commonDir) === ".git";
    const isSubmodule = commonDir.includes(`${sep2}.git${sep2}modules`);
    if (isGitDir && !isSubmodule) {
      const resolved = dirname(commonDir);
      if (resolved && resolved !== root) {
        primaryRoot = resolved;
      }
    }
  } catch {
  }
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
  const dirName = basename(primaryRoot).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${dirName}-${hash}`;
}
function getOmcRoot(worktreeRoot) {
  const customDir = process.env.OMC_STATE_DIR;
  if (customDir) {
    const root2 = worktreeRoot || getWorktreeRoot() || process.cwd();
    const projectId = getProjectIdentifier(root2);
    const centralizedPath = join2(customDir, projectId);
    const legacyPath = join2(root2, OmcPaths.ROOT);
    const warningKey = `${legacyPath}:${centralizedPath}`;
    if (!dualDirWarnings.has(warningKey) && existsSync(legacyPath) && existsSync(centralizedPath)) {
      dualDirWarnings.add(warningKey);
      console.warn(`[omc] Both legacy state dir (${legacyPath}) and centralized state dir (${centralizedPath}) exist. Using centralized dir. Consider migrating data from the legacy dir and removing it.`);
    }
    return centralizedPath;
  }
  const root = worktreeRoot || getWorktreeRoot() || process.cwd();
  return join2(root, OmcPaths.ROOT);
}
function resolveOmcPath(relativePath, worktreeRoot) {
  validatePath(relativePath);
  const omcDir = getOmcRoot(worktreeRoot);
  const fullPath = normalize2(resolve(omcDir, relativePath));
  const relativeToOmc = relative(omcDir, fullPath);
  if (relativeToOmc.startsWith("..") || relativeToOmc.startsWith(sep2 + "..")) {
    throw new Error(`Path escapes omc boundary: ${relativePath}`);
  }
  return fullPath;
}
var SESSION_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,255}$/;
function validateSessionId(sessionId) {
  if (!sessionId) {
    throw new Error("Session ID cannot be empty");
  }
  if (sessionId.includes("..") || sessionId.includes("/") || sessionId.includes("\\")) {
    throw new Error(`Invalid session ID: path traversal not allowed (${sessionId})`);
  }
  if (!SESSION_ID_REGEX.test(sessionId)) {
    throw new Error(`Invalid session ID: must be alphanumeric with hyphens/underscores, max 256 chars (${sessionId})`);
  }
}
function resolveSessionStatePath(stateName, sessionId, worktreeRoot) {
  validateSessionId(sessionId);
  const normalizedName = stateName.endsWith("-state") ? stateName : `${stateName}-state`;
  return resolveOmcPath(`state/sessions/${sessionId}/${normalizedName}.json`, worktreeRoot);
}
function getSessionStateDir(sessionId, worktreeRoot) {
  validateSessionId(sessionId);
  return join2(getOmcRoot(worktreeRoot), "state", "sessions", sessionId);
}
function ensureSessionStateDir(sessionId, worktreeRoot) {
  const sessionDir = getSessionStateDir(sessionId, worktreeRoot);
  if (!existsSync(sessionDir)) {
    try {
      mkdirSync(sessionDir, { recursive: true });
    } catch (err) {
      if (err.code !== "EEXIST")
        throw err;
    }
  }
  return sessionDir;
}
function resolveToWorktreeRoot(directory) {
  if (directory) {
    const resolved = resolve(directory);
    const root = getWorktreeRoot(resolved);
    if (root)
      return root;
    console.error("[worktree] non-git directory provided, falling back to process root", {
      directory: resolved
    });
  }
  return getWorktreeRoot(process.cwd()) || process.cwd();
}
function resolveTranscriptPath(transcriptPath, cwd) {
  if (!transcriptPath)
    return void 0;
  if (existsSync(transcriptPath))
    return transcriptPath;
  const worktreeSegmentPattern = /--claude-worktrees-[^/\\]+/;
  if (worktreeSegmentPattern.test(transcriptPath)) {
    const resolved = transcriptPath.replace(worktreeSegmentPattern, "");
    if (existsSync(resolved))
      return resolved;
  }
  const effectiveCwd = cwd || process.cwd();
  const worktreeMarker = ".claude/worktrees/";
  const markerIdx = effectiveCwd.indexOf(worktreeMarker);
  if (markerIdx !== -1) {
    const mainProjectRoot = effectiveCwd.substring(0, markerIdx > 0 && effectiveCwd[markerIdx - 1] === sep2 ? markerIdx - 1 : markerIdx);
    const lastSep = transcriptPath.lastIndexOf("/");
    const sessionFile = lastSep !== -1 ? transcriptPath.substring(lastSep + 1) : "";
    if (sessionFile) {
      const projectsDir = join2(getClaudeConfigDir(), "projects");
      if (existsSync(projectsDir)) {
        const encodedMain = mainProjectRoot.replace(/[/\\.]/g, "-");
        const resolvedPath = join2(projectsDir, encodedMain, sessionFile);
        if (existsSync(resolvedPath))
          return resolvedPath;
      }
    }
  }
  try {
    const gitCommonDir = execSync("git rev-parse --git-common-dir", {
      cwd: effectiveCwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    const absoluteCommonDir = resolve(effectiveCwd, gitCommonDir);
    let mainRepoRoot = dirname(absoluteCommonDir);
    if (mainRepoRoot.endsWith(join2(".git", "worktrees"))) {
      mainRepoRoot = dirname(dirname(mainRepoRoot));
    }
    try {
      mainRepoRoot = realpathSync(mainRepoRoot);
    } catch {
    }
    const worktreeTop = execSync("git rev-parse --show-toplevel", {
      cwd: effectiveCwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    if (mainRepoRoot !== worktreeTop) {
      const lastSep = transcriptPath.lastIndexOf("/");
      const sessionFile = lastSep !== -1 ? transcriptPath.substring(lastSep + 1) : "";
      if (sessionFile) {
        const projectsDir = join2(getClaudeConfigDir(), "projects");
        if (existsSync(projectsDir)) {
          const encodedMain = mainRepoRoot.replace(/[/\\.]/g, "-");
          const resolvedPath = join2(projectsDir, encodedMain, sessionFile);
          if (existsSync(resolvedPath))
            return resolvedPath;
        }
      }
    }
  } catch {
  }
  return transcriptPath;
}
function validateWorkingDirectory(workingDirectory) {
  const trustedRoot = getWorktreeRoot(process.cwd()) || process.cwd();
  if (!workingDirectory) {
    return trustedRoot;
  }
  const resolved = resolve(workingDirectory);
  let trustedRootReal;
  try {
    trustedRootReal = realpathSync(trustedRoot);
  } catch {
    trustedRootReal = trustedRoot;
  }
  const providedRoot = getWorktreeRoot(resolved);
  if (providedRoot) {
    let providedRootReal;
    try {
      providedRootReal = realpathSync(providedRoot);
    } catch {
      throw new Error(`workingDirectory '${workingDirectory}' does not exist or is not accessible.`);
    }
    if (providedRootReal !== trustedRootReal) {
      console.error("[worktree] workingDirectory resolved to different git worktree root, using trusted root", {
        workingDirectory: resolved,
        providedRoot: providedRootReal,
        trustedRoot: trustedRootReal
      });
      return trustedRoot;
    }
    return providedRoot;
  }
  let resolvedReal;
  try {
    resolvedReal = realpathSync(resolved);
  } catch {
    throw new Error(`workingDirectory '${workingDirectory}' does not exist or is not accessible.`);
  }
  const rel = relative(trustedRootReal, resolvedReal);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`workingDirectory '${workingDirectory}' is outside the trusted worktree root '${trustedRoot}'.`);
  }
  return trustedRoot;
}

// dist/hud/stdin.js
var TRANSIENT_CONTEXT_PERCENT_TOLERANCE = 3;
function getStdinCachePath() {
  const root = getWorktreeRoot() || process.cwd();
  return join3(root, ".omc", "state", "hud-stdin-cache.json");
}
function writeStdinCache(stdin) {
  try {
    const root = getWorktreeRoot() || process.cwd();
    const cacheDir = join3(root, ".omc", "state");
    if (!existsSync2(cacheDir)) {
      mkdirSync2(cacheDir, { recursive: true });
    }
    writeFileSync(getStdinCachePath(), JSON.stringify(stdin));
  } catch {
  }
}
function readStdinCache() {
  try {
    const cachePath = getStdinCachePath();
    if (!existsSync2(cachePath)) {
      return null;
    }
    return JSON.parse(readFileSync(cachePath, "utf-8"));
  } catch {
    return null;
  }
}
async function readStdin() {
  if (process.stdin.isTTY) {
    return null;
  }
  const chunks = [];
  try {
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const raw = chunks.join("");
    if (!raw.trim()) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function getCurrentUsage(stdin) {
  return stdin.context_window?.current_usage;
}
function clampPercent(value) {
  if (value == null || !isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}
function parseResetDate(value) {
  if (value == null) {
    return null;
  }
  const numericValue = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (Number.isFinite(numericValue)) {
    const millis = Math.abs(numericValue) < 1e12 ? numericValue * 1e3 : numericValue;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}
function getTotalTokens(stdin) {
  const usage = getCurrentUsage(stdin);
  return (usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0);
}
function getRoundedNativeContextPercent(stdin) {
  const nativePercent = stdin?.context_window?.used_percentage;
  if (typeof nativePercent !== "number" || Number.isNaN(nativePercent)) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round(nativePercent)));
}
function getManualContextPercent(stdin) {
  const size = stdin.context_window?.context_window_size;
  if (!size || size <= 0) {
    return null;
  }
  const totalTokens = getTotalTokens(stdin);
  return Math.min(100, Math.round(totalTokens / size * 100));
}
function isSameContextStream(current, previous) {
  return current.cwd === previous.cwd && current.transcript_path === previous.transcript_path && current.context_window?.context_window_size === previous.context_window?.context_window_size;
}
function stabilizeContextPercent(stdin, previousStdin) {
  if (getRoundedNativeContextPercent(stdin) !== null) {
    return stdin;
  }
  if (!previousStdin || !isSameContextStream(stdin, previousStdin)) {
    return stdin;
  }
  const previousNativePercent = getRoundedNativeContextPercent(previousStdin);
  if (previousNativePercent === null) {
    return stdin;
  }
  const manualPercent = getManualContextPercent(stdin);
  if (manualPercent !== null && Math.abs(manualPercent - previousNativePercent) > TRANSIENT_CONTEXT_PERCENT_TOLERANCE) {
    return stdin;
  }
  return {
    ...stdin,
    context_window: {
      ...stdin.context_window,
      used_percentage: previousStdin.context_window?.used_percentage ?? previousNativePercent
    }
  };
}
function getContextPercent(stdin) {
  const nativePercent = getRoundedNativeContextPercent(stdin);
  if (nativePercent !== null) {
    return nativePercent;
  }
  return getManualContextPercent(stdin) ?? 0;
}
function getRateLimitsFromStdin(stdin) {
  const fiveHour = stdin.rate_limits?.five_hour?.used_percentage;
  const sevenDay = stdin.rate_limits?.seven_day?.used_percentage;
  if (fiveHour == null && sevenDay == null) {
    return null;
  }
  return {
    fiveHourPercent: clampPercent(fiveHour),
    weeklyPercent: sevenDay == null ? void 0 : clampPercent(sevenDay),
    fiveHourResetsAt: parseResetDate(stdin.rate_limits?.five_hour?.resets_at),
    weeklyResetsAt: parseResetDate(stdin.rate_limits?.seven_day?.resets_at)
  };
}
function getModelName(stdin) {
  return stdin.model?.display_name ?? stdin.model?.id ?? "Unknown";
}

// dist/hud/transcript.js
import { createReadStream, existsSync as existsSync3, statSync, openSync, readSync, closeSync } from "fs";
import { createInterface } from "readline";
import { basename as basename2 } from "path";
var MAX_TAIL_BYTES = 4 * 1024 * 1024;
var MAX_AGENT_MAP_SIZE = 100;
var PERMISSION_TOOLS = [
  "Edit",
  "Write",
  "Bash",
  "proxy_Edit",
  "proxy_Write",
  "proxy_Bash"
];
var PERMISSION_THRESHOLD_MS = 3e3;
var pendingPermissionMap = /* @__PURE__ */ new Map();
var THINKING_PART_TYPES = ["thinking", "reasoning"];
var THINKING_RECENCY_MS = 3e4;
var transcriptCache = /* @__PURE__ */ new Map();
var TRANSCRIPT_CACHE_MAX_SIZE = 20;
async function parseTranscript(transcriptPath, options) {
  pendingPermissionMap.clear();
  const result = {
    agents: [],
    todos: [],
    lastActivatedSkill: void 0,
    toolCallCount: 0,
    agentCallCount: 0,
    skillCallCount: 0,
    lastToolName: null
  };
  if (!transcriptPath || !existsSync3(transcriptPath)) {
    return result;
  }
  let cacheKey = null;
  try {
    const stat = statSync(transcriptPath);
    cacheKey = `${transcriptPath}:${stat.size}:${stat.mtimeMs}`;
    const cached = transcriptCache.get(transcriptPath);
    if (cached?.cacheKey === cacheKey) {
      return finalizeTranscriptResult(cloneTranscriptData(cached.baseResult), options, cached.pendingPermissions);
    }
  } catch {
    return result;
  }
  const agentMap = /* @__PURE__ */ new Map();
  const backgroundAgentMap = /* @__PURE__ */ new Map();
  const latestTodos = [];
  const sessionTokenTotals = {
    inputTokens: 0,
    outputTokens: 0,
    seenUsage: false
  };
  let sessionTotalsReliable = false;
  const observedSessionIds = /* @__PURE__ */ new Set();
  try {
    const stat = statSync(transcriptPath);
    const fileSize = stat.size;
    if (fileSize > MAX_TAIL_BYTES) {
      const lines = readTailLines(transcriptPath, fileSize, MAX_TAIL_BYTES);
      for (const line of lines) {
        if (!line.trim())
          continue;
        try {
          const entry = JSON.parse(line);
          processEntry(entry, agentMap, latestTodos, result, MAX_AGENT_MAP_SIZE, backgroundAgentMap, sessionTokenTotals, observedSessionIds);
        } catch {
        }
      }
      sessionTotalsReliable = sessionTokenTotals.seenUsage;
    } else {
      const fileStream = createReadStream(transcriptPath);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      for await (const line of rl) {
        if (!line.trim())
          continue;
        try {
          const entry = JSON.parse(line);
          processEntry(entry, agentMap, latestTodos, result, MAX_AGENT_MAP_SIZE, backgroundAgentMap, sessionTokenTotals, observedSessionIds);
        } catch {
        }
      }
      sessionTotalsReliable = observedSessionIds.size <= 1;
    }
  } catch {
    return finalizeTranscriptResult(result, options, []);
  }
  const running = Array.from(agentMap.values()).filter((a) => a.status === "running");
  const completed = Array.from(agentMap.values()).filter((a) => a.status === "completed");
  result.agents = [
    ...running,
    ...completed.slice(-(10 - running.length))
  ].slice(0, 10);
  result.todos = latestTodos;
  if (sessionTotalsReliable && sessionTokenTotals.seenUsage) {
    result.sessionTotalTokens = sessionTokenTotals.inputTokens + sessionTokenTotals.outputTokens;
  }
  const pendingPermissions = Array.from(pendingPermissionMap.values()).map(clonePendingPermission);
  const finalized = finalizeTranscriptResult(result, options, pendingPermissions);
  if (cacheKey) {
    if (transcriptCache.size >= TRANSCRIPT_CACHE_MAX_SIZE) {
      transcriptCache.clear();
    }
    transcriptCache.set(transcriptPath, {
      cacheKey,
      baseResult: cloneTranscriptData(finalized),
      pendingPermissions
    });
  }
  return finalized;
}
function cloneDate(value) {
  return value ? new Date(value.getTime()) : void 0;
}
function clonePendingPermission(permission) {
  return {
    ...permission,
    timestamp: new Date(permission.timestamp.getTime())
  };
}
function cloneTranscriptData(result) {
  return {
    ...result,
    agents: result.agents.map((agent) => ({
      ...agent,
      startTime: new Date(agent.startTime.getTime()),
      endTime: cloneDate(agent.endTime)
    })),
    todos: result.todos.map((todo) => ({ ...todo })),
    sessionStart: cloneDate(result.sessionStart),
    lastActivatedSkill: result.lastActivatedSkill ? {
      ...result.lastActivatedSkill,
      timestamp: new Date(result.lastActivatedSkill.timestamp.getTime())
    } : void 0,
    pendingPermission: result.pendingPermission ? clonePendingPermission(result.pendingPermission) : void 0,
    thinkingState: result.thinkingState ? {
      ...result.thinkingState,
      lastSeen: cloneDate(result.thinkingState.lastSeen)
    } : void 0,
    lastRequestTokenUsage: result.lastRequestTokenUsage ? { ...result.lastRequestTokenUsage } : void 0
  };
}
function finalizeTranscriptResult(result, options, pendingPermissions) {
  const staleMinutes = options?.staleTaskThresholdMinutes ?? 30;
  const staleAgentThresholdMs = staleMinutes * 60 * 1e3;
  const now = Date.now();
  for (const agent of result.agents) {
    if (agent.status === "running") {
      const runningTime = now - agent.startTime.getTime();
      if (runningTime > staleAgentThresholdMs) {
        agent.status = "completed";
        agent.endTime = new Date(agent.startTime.getTime() + staleAgentThresholdMs);
      }
    }
  }
  result.pendingPermission = void 0;
  for (const permission of pendingPermissions) {
    const age = now - permission.timestamp.getTime();
    if (age <= PERMISSION_THRESHOLD_MS) {
      result.pendingPermission = clonePendingPermission(permission);
      break;
    }
  }
  if (result.thinkingState?.lastSeen) {
    const age = now - result.thinkingState.lastSeen.getTime();
    result.thinkingState.active = age <= THINKING_RECENCY_MS;
  }
  return result;
}
function readTailLines(filePath, fileSize, maxBytes) {
  const startOffset = Math.max(0, fileSize - maxBytes);
  const bytesToRead = fileSize - startOffset;
  const fd = openSync(filePath, "r");
  const buffer = Buffer.alloc(bytesToRead);
  try {
    readSync(fd, buffer, 0, bytesToRead, startOffset);
  } finally {
    closeSync(fd);
  }
  const content = buffer.toString("utf8");
  const lines = content.split("\n");
  if (startOffset > 0 && lines.length > 0) {
    lines.shift();
  }
  return lines;
}
function extractBackgroundAgentId(content) {
  const text = typeof content === "string" ? content : content.find((c) => c.type === "text")?.text || "";
  const match = text.match(/agentId:\s*([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}
function parseTaskOutputResult(content) {
  const text = typeof content === "string" ? content : content.find((c) => c.type === "text")?.text || "";
  const taskIdMatch = text.match(/<task-id>([^<]+)<\/task-id>/) || text.match(/<task_id>([^<]+)<\/task_id>/);
  const statusMatch = text.match(/<status>([^<]+)<\/status>/);
  const toolUseIdMatch = text.match(/<tool-use-id>([^<]+)<\/tool-use-id>/) || text.match(/<tool_use_id>([^<]+)<\/tool_use_id>/);
  if (taskIdMatch && statusMatch) {
    return {
      taskId: taskIdMatch[1],
      toolUseId: toolUseIdMatch ? toolUseIdMatch[1] : null,
      status: statusMatch[1]
    };
  }
  return null;
}
function extractTargetSummary(input, toolName) {
  if (!input || typeof input !== "object")
    return "...";
  const inp = input;
  if (toolName.includes("Edit") || toolName.includes("Write")) {
    const filePath = inp.file_path;
    if (filePath) {
      return basename2(filePath) || filePath;
    }
  }
  if (toolName.includes("Bash")) {
    const cmd = inp.command;
    if (cmd) {
      const trimmed = cmd.trim().substring(0, 20);
      return trimmed.length < cmd.trim().length ? `${trimmed}...` : trimmed;
    }
  }
  return "...";
}
function processEntry(entry, agentMap, latestTodos, result, maxAgentMapSize = 50, backgroundAgentMap, sessionTokenTotals, observedSessionIds) {
  const timestamp = entry.timestamp ? new Date(entry.timestamp) : /* @__PURE__ */ new Date();
  if (entry.sessionId) {
    observedSessionIds?.add(entry.sessionId);
  }
  const usage = extractLastRequestTokenUsage(entry.message?.usage);
  if (usage) {
    result.lastRequestTokenUsage = usage;
    if (sessionTokenTotals) {
      sessionTokenTotals.inputTokens += usage.inputTokens;
      sessionTokenTotals.outputTokens += usage.outputTokens;
      sessionTokenTotals.seenUsage = true;
    }
  }
  if (!result.sessionStart && entry.timestamp) {
    result.sessionStart = timestamp;
  }
  const content = entry.message?.content;
  if (typeof content === "string") {
    if (content.includes("<task-notification>") || content.includes("<task_id>") || content.includes("<task-id>")) {
      const taskOutput = parseTaskOutputResult(content);
      if (taskOutput && taskOutput.status === "completed") {
        let toolUseId;
        if (taskOutput.toolUseId) {
          toolUseId = taskOutput.toolUseId;
        } else if (backgroundAgentMap) {
          toolUseId = backgroundAgentMap.get(taskOutput.taskId);
        }
        if (toolUseId) {
          const agent = agentMap.get(toolUseId);
          if (agent && agent.status === "running") {
            agent.status = "completed";
            agent.endTime = timestamp;
          }
        }
      }
    }
    return;
  }
  if (!content || !Array.isArray(content))
    return;
  for (const block of content) {
    if (THINKING_PART_TYPES.includes(block.type)) {
      result.thinkingState = {
        active: true,
        lastSeen: timestamp
      };
    }
    if (block.type === "tool_use" && block.id && block.name) {
      result.toolCallCount++;
      result.lastToolName = block.name;
      if (block.name === "Task" || block.name === "proxy_Task" || block.name === "Agent") {
        result.agentCallCount++;
        const input = block.input;
        const agentEntry = {
          id: block.id,
          type: input?.subagent_type ?? "unknown",
          model: input?.model,
          description: input?.description,
          status: "running",
          startTime: timestamp
        };
        if (agentMap.size >= maxAgentMapSize) {
          let oldestCompleted = null;
          let oldestTime = Infinity;
          for (const [id, agent] of agentMap) {
            if (agent.status === "completed" && agent.startTime) {
              const time = agent.startTime.getTime();
              if (time < oldestTime) {
                oldestTime = time;
                oldestCompleted = id;
              }
            }
          }
          if (oldestCompleted) {
            agentMap.delete(oldestCompleted);
          }
        }
        agentMap.set(block.id, agentEntry);
      } else if (block.name === "TodoWrite" || block.name === "proxy_TodoWrite") {
        const input = block.input;
        if (input?.todos && Array.isArray(input.todos)) {
          latestTodos.length = 0;
          latestTodos.push(...input.todos.map((t) => ({
            content: t.content,
            status: t.status,
            activeForm: t.activeForm
          })));
        }
      } else if (block.name === "Skill" || block.name === "proxy_Skill") {
        result.skillCallCount++;
        const input = block.input;
        if (input?.skill) {
          result.lastActivatedSkill = {
            name: input.skill,
            args: input.args,
            timestamp
          };
        }
      }
      if (PERMISSION_TOOLS.includes(block.name)) {
        pendingPermissionMap.set(block.id, {
          toolName: block.name.replace("proxy_", ""),
          targetSummary: extractTargetSummary(block.input, block.name),
          timestamp
        });
      }
    }
    if (block.type === "tool_result" && block.tool_use_id) {
      pendingPermissionMap.delete(block.tool_use_id);
      const agent = agentMap.get(block.tool_use_id);
      if (agent) {
        const blockContent = block.content;
        const ASYNC_LAUNCH_PREFIX = "Async agent launched";
        const startsWithAsyncLaunch = (text) => !!text && text.trimStart().startsWith(ASYNC_LAUNCH_PREFIX);
        const isBackgroundLaunch = typeof blockContent === "string" ? startsWithAsyncLaunch(blockContent) : Array.isArray(blockContent) && blockContent.length > 0 && typeof blockContent[0] === "object" && blockContent[0] !== null && blockContent[0].type === "text" && startsWithAsyncLaunch(blockContent[0].text);
        if (isBackgroundLaunch) {
          if (backgroundAgentMap && blockContent) {
            const bgAgentId = extractBackgroundAgentId(blockContent);
            if (bgAgentId) {
              backgroundAgentMap.set(bgAgentId, block.tool_use_id);
            }
          }
        } else {
          agent.status = "completed";
          agent.endTime = timestamp;
        }
      }
      if (block.content) {
        const taskOutput = parseTaskOutputResult(block.content);
        if (taskOutput && taskOutput.status === "completed") {
          let toolUseId;
          if (taskOutput.toolUseId) {
            toolUseId = taskOutput.toolUseId;
          } else if (backgroundAgentMap) {
            toolUseId = backgroundAgentMap.get(taskOutput.taskId);
          }
          if (toolUseId) {
            const bgAgent = agentMap.get(toolUseId);
            if (bgAgent && bgAgent.status === "running") {
              bgAgent.status = "completed";
              bgAgent.endTime = timestamp;
            }
          }
        }
      }
    }
  }
}
function extractLastRequestTokenUsage(usage) {
  if (!usage)
    return null;
  const inputTokens = getNumericUsageValue(usage.input_tokens);
  const outputTokens = getNumericUsageValue(usage.output_tokens);
  const reasoningTokens = getNumericUsageValue(usage.reasoning_tokens ?? usage.output_tokens_details?.reasoning_tokens ?? usage.output_tokens_details?.reasoningTokens ?? usage.completion_tokens_details?.reasoning_tokens ?? usage.completion_tokens_details?.reasoningTokens);
  if (inputTokens == null && outputTokens == null) {
    return null;
  }
  const normalized = {
    inputTokens: Math.max(0, Math.round(inputTokens ?? 0)),
    outputTokens: Math.max(0, Math.round(outputTokens ?? 0))
  };
  if (reasoningTokens != null && reasoningTokens > 0) {
    normalized.reasoningTokens = Math.max(0, Math.round(reasoningTokens));
  }
  return normalized;
}
function getNumericUsageValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// dist/hud/state.js
import { existsSync as existsSync6, readFileSync as readFileSync3, mkdirSync as mkdirSync5, unlinkSync as unlinkSync2 } from "fs";
import { join as join6 } from "path";

// dist/lib/atomic-write.js
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import * as crypto from "crypto";
function ensureDirSync(dir) {
  if (fsSync.existsSync(dir)) {
    return;
  }
  try {
    fsSync.mkdirSync(dir, { recursive: true });
  } catch (err) {
    if (err.code === "EEXIST") {
      return;
    }
    throw err;
  }
}
function atomicWriteFileSync(filePath, content) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tempPath = path.join(dir, `.${base}.tmp.${crypto.randomUUID()}`);
  let fd = null;
  let success = false;
  try {
    ensureDirSync(dir);
    fd = fsSync.openSync(tempPath, "wx", 384);
    fsSync.writeSync(fd, content, 0, "utf-8");
    fsSync.fsyncSync(fd);
    fsSync.closeSync(fd);
    fd = null;
    fsSync.renameSync(tempPath, filePath);
    success = true;
    try {
      const dirFd = fsSync.openSync(dir, "r");
      try {
        fsSync.fsyncSync(dirFd);
      } finally {
        fsSync.closeSync(dirFd);
      }
    } catch {
    }
  } finally {
    if (fd !== null) {
      try {
        fsSync.closeSync(fd);
      } catch {
      }
    }
    if (!success) {
      try {
        fsSync.unlinkSync(tempPath);
      } catch {
      }
    }
  }
}
function atomicWriteJsonSync(filePath, data) {
  const jsonContent = JSON.stringify(data, null, 2);
  atomicWriteFileSync(filePath, jsonContent);
}

// dist/hud/mission-board.js
import { existsSync as existsSync5, mkdirSync as mkdirSync4, readFileSync as readFileSync2, readdirSync as readdirSync2 } from "node:fs";
import { join as join5 } from "node:path";

// dist/utils/string-width.js
function isCJKCharacter(codePoint) {
  return (
    // CJK Unified Ideographs (Chinese characters)
    codePoint >= 19968 && codePoint <= 40959 || // CJK Unified Ideographs Extension A
    codePoint >= 13312 && codePoint <= 19903 || // CJK Unified Ideographs Extension B-F (rare characters)
    codePoint >= 131072 && codePoint <= 191471 || // CJK Compatibility Ideographs
    codePoint >= 63744 && codePoint <= 64255 || // Hangul Syllables (Korean)
    codePoint >= 44032 && codePoint <= 55215 || // Hangul Jamo (Korean components)
    codePoint >= 4352 && codePoint <= 4607 || // Hangul Compatibility Jamo
    codePoint >= 12592 && codePoint <= 12687 || // Hangul Jamo Extended-A
    codePoint >= 43360 && codePoint <= 43391 || // Hangul Jamo Extended-B
    codePoint >= 55216 && codePoint <= 55295 || // Hiragana (Japanese)
    codePoint >= 12352 && codePoint <= 12447 || // Katakana (Japanese)
    codePoint >= 12448 && codePoint <= 12543 || // Katakana Phonetic Extensions
    codePoint >= 12784 && codePoint <= 12799 || // Full-width ASCII variants
    codePoint >= 65281 && codePoint <= 65376 || // Full-width punctuation and symbols
    codePoint >= 65504 && codePoint <= 65510 || // CJK Symbols and Punctuation
    codePoint >= 12288 && codePoint <= 12351 || // Enclosed CJK Letters and Months
    codePoint >= 12800 && codePoint <= 13055 || // CJK Compatibility
    codePoint >= 13056 && codePoint <= 13311 || // CJK Compatibility Forms
    codePoint >= 65072 && codePoint <= 65103
  );
}
function isZeroWidth(codePoint) {
  return (
    // Zero-width characters
    codePoint === 8203 || // Zero Width Space
    codePoint === 8204 || // Zero Width Non-Joiner
    codePoint === 8205 || // Zero Width Joiner
    codePoint === 65279 || // Byte Order Mark / Zero Width No-Break Space
    // Combining diacritical marks (they modify previous character)
    codePoint >= 768 && codePoint <= 879 || // Combining Diacritical Marks Extended
    codePoint >= 6832 && codePoint <= 6911 || // Combining Diacritical Marks Supplement
    codePoint >= 7616 && codePoint <= 7679 || // Combining Diacritical Marks for Symbols
    codePoint >= 8400 && codePoint <= 8447 || // Combining Half Marks
    codePoint >= 65056 && codePoint <= 65071
  );
}
function getCharWidth(char) {
  const codePoint = char.codePointAt(0);
  if (codePoint === void 0)
    return 0;
  if (isZeroWidth(codePoint))
    return 0;
  if (isCJKCharacter(codePoint))
    return 2;
  return 1;
}
function stringWidth(str) {
  if (!str)
    return 0;
  const stripped = stripAnsi(str);
  let width = 0;
  for (const char of stripped) {
    width += getCharWidth(char);
  }
  return width;
}
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
}
function truncateToWidth(str, maxWidth, suffix = "...") {
  if (!str || maxWidth <= 0)
    return "";
  const strWidth = stringWidth(str);
  if (strWidth <= maxWidth)
    return str;
  const suffixWidth = stringWidth(suffix);
  const targetWidth = maxWidth - suffixWidth;
  if (targetWidth <= 0) {
    return truncateToWidthNoSuffix(suffix, maxWidth);
  }
  return truncateToWidthNoSuffix(str, targetWidth) + suffix;
}
function truncateToWidthNoSuffix(str, maxWidth) {
  let width = 0;
  let result = "";
  for (const char of str) {
    const charWidth = getCharWidth(char);
    if (width + charWidth > maxWidth)
      break;
    result += char;
    width += charWidth;
  }
  return result;
}

// dist/team/worker-canonicalization.js
function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function hasAssignedTasks(worker) {
  return Array.isArray(worker.assigned_tasks) && worker.assigned_tasks.length > 0;
}
function workerPriority(worker) {
  if (hasText(worker.pane_id))
    return 4;
  if (typeof worker.pid === "number" && Number.isFinite(worker.pid))
    return 3;
  if (hasAssignedTasks(worker))
    return 2;
  if (typeof worker.index === "number" && worker.index > 0)
    return 1;
  return 0;
}
function mergeAssignedTasks(primary, secondary) {
  const merged = [];
  for (const taskId of [...primary ?? [], ...secondary ?? []]) {
    if (typeof taskId !== "string" || taskId.trim() === "" || merged.includes(taskId))
      continue;
    merged.push(taskId);
  }
  return merged;
}
function backfillText(primary, secondary) {
  return hasText(primary) ? primary : secondary;
}
function backfillBoolean(primary, secondary) {
  return typeof primary === "boolean" ? primary : secondary;
}
function backfillNumber(primary, secondary, predicate) {
  const isUsable = (value) => typeof value === "number" && Number.isFinite(value) && (predicate ? predicate(value) : true);
  return isUsable(primary) ? primary : isUsable(secondary) ? secondary : void 0;
}
function chooseWinningWorker(existing, incoming) {
  const existingPriority = workerPriority(existing);
  const incomingPriority = workerPriority(incoming);
  if (incomingPriority > existingPriority)
    return { winner: incoming, loser: existing };
  if (incomingPriority < existingPriority)
    return { winner: existing, loser: incoming };
  if ((incoming.index ?? 0) >= (existing.index ?? 0))
    return { winner: incoming, loser: existing };
  return { winner: existing, loser: incoming };
}
function canonicalizeWorkers(workers) {
  const byName = /* @__PURE__ */ new Map();
  const duplicateNames = /* @__PURE__ */ new Set();
  for (const worker of workers) {
    const name = typeof worker.name === "string" ? worker.name.trim() : "";
    if (!name)
      continue;
    const normalized = {
      ...worker,
      name,
      assigned_tasks: Array.isArray(worker.assigned_tasks) ? worker.assigned_tasks : []
    };
    const existing = byName.get(name);
    if (!existing) {
      byName.set(name, normalized);
      continue;
    }
    duplicateNames.add(name);
    const { winner, loser } = chooseWinningWorker(existing, normalized);
    byName.set(name, {
      ...winner,
      name,
      assigned_tasks: mergeAssignedTasks(winner.assigned_tasks, loser.assigned_tasks),
      pane_id: backfillText(winner.pane_id, loser.pane_id),
      pid: backfillNumber(winner.pid, loser.pid),
      index: backfillNumber(winner.index, loser.index, (value) => value > 0) ?? 0,
      role: backfillText(winner.role, loser.role) ?? winner.role,
      worker_cli: backfillText(winner.worker_cli, loser.worker_cli),
      working_dir: backfillText(winner.working_dir, loser.working_dir),
      worktree_path: backfillText(winner.worktree_path, loser.worktree_path),
      worktree_branch: backfillText(winner.worktree_branch, loser.worktree_branch),
      worktree_detached: backfillBoolean(winner.worktree_detached, loser.worktree_detached),
      team_state_root: backfillText(winner.team_state_root, loser.team_state_root)
    });
  }
  return {
    workers: Array.from(byName.values()),
    duplicateNames: Array.from(duplicateNames.values())
  };
}

// dist/hud/mission-board.js
var DEFAULT_CONFIG = {
  enabled: false,
  maxMissions: 2,
  maxAgentsPerMission: 3,
  maxTimelineEvents: 3,
  persistCompletedForMinutes: 20
};
var STATUS_ORDER = {
  running: 0,
  blocked: 1,
  waiting: 2,
  done: 3
};
var DEFAULT_MISSION_BOARD_CONFIG = DEFAULT_CONFIG;
function resolveConfig(config) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    enabled: config?.enabled ?? DEFAULT_CONFIG.enabled
  };
}
function stateFilePath(directory) {
  return join5(getOmcRoot(directory), "state", "mission-state.json");
}
function readJsonSafe(path4) {
  if (!existsSync5(path4))
    return null;
  try {
    return JSON.parse(readFileSync2(path4, "utf-8"));
  } catch {
    return null;
  }
}
function readJsonLinesSafe(path4) {
  if (!existsSync5(path4))
    return [];
  try {
    return readFileSync2(path4, "utf-8").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}
function writeState(directory, state) {
  const stateDir = join5(getOmcRoot(directory), "state");
  if (!existsSync5(stateDir)) {
    mkdirSync4(stateDir, { recursive: true });
  }
  atomicWriteJsonSync(stateFilePath(directory), state);
  return state;
}
function parseTime(value) {
  if (!value)
    return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function compactText(value, width = 64) {
  const trimmed = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!trimmed)
    return null;
  return truncateToWidth(trimmed, width);
}
function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    return "--:--";
  return date.toISOString().slice(11, 16);
}
function latest(...values) {
  return values.filter((value) => Boolean(value)).sort((left, right) => parseTime(right) - parseTime(left))[0];
}
function summarizeTask(task) {
  if (!task)
    return null;
  return compactText(task.result || task.summary || task.error || task.subject || task.description, 56);
}
function readMissionBoardState(directory) {
  return readJsonSafe(stateFilePath(directory));
}
function deriveTeamStatus(taskCounts, agents) {
  if (taskCounts.inProgress > 0 || agents.some((agent) => agent.status === "running")) {
    return "running";
  }
  if (taskCounts.blocked > 0 || taskCounts.failed > 0 || agents.some((agent) => agent.status === "blocked")) {
    return "blocked";
  }
  if (taskCounts.total > 0 && taskCounts.completed === taskCounts.total) {
    return "done";
  }
  return "waiting";
}
function deriveWorkerStatus(workerStatus, task) {
  if (workerStatus?.state === "blocked" || workerStatus?.state === "failed" || task?.status === "blocked" || task?.status === "failed")
    return "blocked";
  if (workerStatus?.state === "working" || task?.status === "in_progress")
    return "running";
  if (workerStatus?.state === "done" || task?.status === "completed")
    return "done";
  return "waiting";
}
function collectTeamMission(teamRoot, teamName, config) {
  const teamConfig = readJsonSafe(join5(teamRoot, "config.json"));
  if (!teamConfig)
    return null;
  const workers = canonicalizeWorkers((Array.isArray(teamConfig.workers) ? teamConfig.workers : []).map((worker, index) => ({
    name: worker.name ?? "",
    index: index + 1,
    role: worker.role ?? "worker",
    assigned_tasks: Array.isArray(worker.assigned_tasks) ? worker.assigned_tasks : []
  }))).workers;
  const tasksDir = join5(teamRoot, "tasks");
  const tasks = existsSync5(tasksDir) ? readdirSync2(tasksDir).filter((entry) => /^(?:task-)?\d+\.json$/i.test(entry)).map((entry) => readJsonSafe(join5(tasksDir, entry))).filter((task) => Boolean(task?.id)) : [];
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const taskCounts = {
    total: tasks.length,
    pending: tasks.filter((task) => task.status === "pending").length,
    blocked: tasks.filter((task) => task.status === "blocked").length,
    inProgress: tasks.filter((task) => task.status === "in_progress").length,
    completed: tasks.filter((task) => task.status === "completed").length,
    failed: tasks.filter((task) => task.status === "failed").length
  };
  const timeline = [];
  for (const event of readJsonLinesSafe(join5(teamRoot, "events.jsonl"))) {
    if (!event.created_at || !event.type)
      continue;
    if (event.type === "task_completed" || event.type === "task_failed") {
      timeline.push({
        id: `event:${event.event_id || `${event.type}:${event.created_at}`}`,
        at: event.created_at,
        kind: event.type === "task_completed" ? "completion" : "failure",
        agent: event.worker || "leader-fixed",
        detail: compactText(`${event.type === "task_completed" ? "completed" : "failed"} task ${event.task_id ?? "?"}`, 72) || event.type,
        sourceKey: `event:${event.event_id || event.type}`
      });
    } else if (event.type === "team_leader_nudge" || event.type === "worker_idle" || event.type === "worker_stopped") {
      timeline.push({
        id: `event:${event.event_id || `${event.type}:${event.created_at}`}`,
        at: event.created_at,
        kind: "update",
        agent: event.worker || "leader-fixed",
        detail: compactText(event.reason || event.type.replace(/_/g, " "), 72) || event.type,
        sourceKey: `event:${event.event_id || event.type}`
      });
    }
  }
  for (const worker of workers) {
    const workerName = worker.name?.trim();
    if (!workerName)
      continue;
    const mailbox = readJsonSafe(join5(teamRoot, "mailbox", `${workerName}.json`));
    for (const message of mailbox?.messages ?? []) {
      if (!message.created_at || !message.body)
        continue;
      timeline.push({
        id: `handoff:${message.message_id || `${workerName}:${message.created_at}`}`,
        at: message.created_at,
        kind: "handoff",
        agent: workerName,
        detail: compactText(message.body, 72) || "handoff",
        sourceKey: `handoff:${message.message_id || workerName}`
      });
    }
  }
  timeline.sort((left, right) => parseTime(left.at) - parseTime(right.at));
  const agents = workers.slice(0, config.maxAgentsPerMission).map((worker) => {
    const workerName = worker.name?.trim() || "worker";
    const workerStatus = readJsonSafe(join5(teamRoot, "workers", workerName, "status.json"));
    const heartbeat = readJsonSafe(join5(teamRoot, "workers", workerName, "heartbeat.json"));
    const ownedTasks = tasks.filter((task) => task.owner === workerName);
    const currentTask = (workerStatus?.current_task_id ? taskById.get(workerStatus.current_task_id) : void 0) || ownedTasks.find((task) => task.status === "in_progress") || ownedTasks.find((task) => task.status === "blocked") || (worker.assigned_tasks || []).map((taskId) => taskById.get(taskId)).find(Boolean) || void 0;
    const completedTask = [...ownedTasks].filter((task) => task.status === "completed" || task.status === "failed").sort((left, right) => parseTime(right.completed_at) - parseTime(left.completed_at))[0];
    const latestTimeline = [...timeline].reverse().find((entry) => entry.agent === workerName);
    const ownership = Array.from(new Set([
      ...worker.assigned_tasks || [],
      ...ownedTasks.map((task) => task.id || "")
    ].filter(Boolean))).map((taskId) => `#${taskId}`).join(",");
    return {
      name: workerName,
      role: worker.role,
      ownership: ownership || void 0,
      status: deriveWorkerStatus(workerStatus ?? null, currentTask),
      currentStep: compactText(workerStatus?.reason || (currentTask?.id && currentTask.subject ? `#${currentTask.id} ${currentTask.subject}` : currentTask?.subject) || currentTask?.description, 56),
      latestUpdate: compactText(workerStatus?.reason || latestTimeline?.detail || summarizeTask(currentTask), 64),
      completedSummary: summarizeTask(completedTask),
      updatedAt: latest(workerStatus?.updated_at, heartbeat?.last_turn_at, latestTimeline?.at, completedTask?.completed_at)
    };
  });
  const createdAt = teamConfig.created_at || latest(...timeline.map((entry) => entry.at)) || (/* @__PURE__ */ new Date()).toISOString();
  const updatedAt = latest(createdAt, ...timeline.map((entry) => entry.at), ...agents.map((agent) => agent.updatedAt)) || createdAt;
  return {
    id: `team:${teamName}`,
    source: "team",
    teamName,
    name: teamName,
    objective: compactText(teamConfig.task, 72) || teamName,
    createdAt,
    updatedAt,
    status: deriveTeamStatus(taskCounts, agents),
    workerCount: workers.length,
    taskCounts,
    agents,
    timeline: timeline.slice(-config.maxTimelineEvents)
  };
}
function mergeMissions(previous, teamMissions, config) {
  const previousMissions = previous?.missions || [];
  const sessionMissions = previousMissions.filter((mission) => mission.source === "session");
  const currentIds = new Set(teamMissions.map((mission) => mission.id));
  const cutoff = Date.now() - config.persistCompletedForMinutes * 6e4;
  const preservedTeams = previousMissions.filter((mission) => mission.source === "team" && !currentIds.has(mission.id) && mission.status === "done" && parseTime(mission.updatedAt) >= cutoff);
  return [...teamMissions, ...sessionMissions, ...preservedTeams].sort((left, right) => {
    const statusDelta = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
    if (statusDelta !== 0)
      return statusDelta;
    return parseTime(right.updatedAt) - parseTime(left.updatedAt);
  }).slice(0, config.maxMissions);
}
function refreshMissionBoardState(directory, rawConfig = DEFAULT_CONFIG) {
  const config = resolveConfig(rawConfig);
  const previous = readMissionBoardState(directory);
  const teamsRoot = join5(getOmcRoot(directory), "state", "team");
  const teamMissions = existsSync5(teamsRoot) ? readdirSync2(teamsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => collectTeamMission(join5(teamsRoot, entry.name), entry.name, config)).filter((mission) => Boolean(mission)) : [];
  const state = {
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    missions: mergeMissions(previous, teamMissions, config)
  };
  return writeState(directory, state);
}
function renderMissionBoard(state, rawConfig = DEFAULT_CONFIG) {
  if (!state || !Array.isArray(state.missions) || state.missions.length === 0)
    return [];
  const config = resolveConfig(rawConfig);
  const lines = [];
  for (const mission of state.missions.slice(0, config.maxMissions)) {
    const summary = [
      `${mission.taskCounts.completed}/${mission.taskCounts.total} done`,
      ...mission.taskCounts.inProgress > 0 ? [`${mission.taskCounts.inProgress} active`] : [],
      ...mission.taskCounts.blocked > 0 ? [`${mission.taskCounts.blocked} blocked`] : [],
      ...mission.taskCounts.pending > 0 ? [`${mission.taskCounts.pending} waiting`] : [],
      ...mission.taskCounts.failed > 0 ? [`${mission.taskCounts.failed} failed`] : []
    ].join(" \xB7 ");
    lines.push(`MISSION ${mission.name} [${mission.status}] \xB7 ${summary} \xB7 ${mission.objective}`);
    for (const agent of mission.agents.slice(0, config.maxAgentsPerMission)) {
      const badge = agent.status === "running" ? "run" : agent.status === "blocked" ? "blk" : agent.status === "done" ? "done" : "wait";
      const detail = agent.status === "done" ? agent.completedSummary || agent.latestUpdate || agent.currentStep || "done" : agent.latestUpdate || agent.currentStep || "no update";
      lines.push(`  [${badge}] ${agent.name}${agent.role ? ` (${agent.role})` : ""}${agent.ownership ? ` \xB7 own:${agent.ownership}` : ""} \xB7 ${detail}`);
    }
    if (mission.timeline.length > 0) {
      const timeline = mission.timeline.slice(-config.maxTimelineEvents).map((entry) => {
        const label = entry.kind === "completion" ? "done" : entry.kind === "failure" ? "fail" : entry.kind;
        return `${formatTime(entry.at)} ${label} ${entry.agent}: ${entry.detail}`;
      }).join(" | ");
      lines.push(`  timeline: ${timeline}`);
    }
  }
  return lines;
}

// dist/hud/types.js
var DEFAULT_ELEMENT_ORDER = {
  line1: ["hostname", "cwd", "gitRepo", "gitBranch", "gitStatus", "model", "apiKeySource", "profile"],
  main: [
    "omcLabel",
    "rateLimits",
    "customBuckets",
    "permission",
    "thinking",
    "promptTime",
    "session",
    "tokens",
    "ralph",
    "autopilot",
    "prd",
    "skills",
    "lastSkill",
    "contextBar",
    "agents",
    "background",
    "callCounts",
    "lastTool",
    "sessionSummary"
  ],
  detail: ["missionBoard", "agents", "contextWarning", "todos"]
};
var DEFAULT_HUD_USAGE_POLL_INTERVAL_MS = 90 * 1e3;
var DEFAULT_HUD_CONFIG = {
  preset: "focused",
  elements: {
    cwd: false,
    // Disabled by default for backward compatibility
    cwdFormat: "relative",
    useHyperlinks: false,
    gitRepo: false,
    // Disabled by default for backward compatibility
    gitBranch: false,
    // Disabled by default for backward compatibility
    gitStatus: false,
    // Disabled by default for backward compatibility
    gitInfoPosition: "above",
    // Git info above main HUD line (backward compatible)
    model: false,
    // Disabled by default for backward compatibility
    modelFormat: "short",
    // Short names by default for backward compatibility
    omcLabel: true,
    rateLimits: true,
    // Show rate limits by default
    ralph: true,
    autopilot: true,
    prdStory: true,
    activeSkills: true,
    contextBar: true,
    agents: true,
    agentsFormat: "multiline",
    // Multi-line for rich agent visualization
    agentsMaxLines: 5,
    // Show up to 5 agent detail lines
    backgroundTasks: true,
    todos: true,
    lastSkill: true,
    permissionStatus: false,
    // Disabled: heuristic-based, causes false positives
    thinking: true,
    thinkingFormat: "text",
    // Text format for backward compatibility
    apiKeySource: false,
    // Disabled by default
    hostname: false,
    profile: true,
    // Show profile name when CLAUDE_CONFIG_DIR is set
    missionBoard: false,
    // Opt-in mission board for whole-run progress tracking
    promptTime: true,
    // Show last prompt time by default
    sessionHealth: true,
    showSessionDuration: true,
    showHealthIndicator: true,
    showTokens: false,
    useBars: false,
    // Disabled by default for backwards compatibility
    showCallCounts: true,
    // Show tool/agent/skill call counts by default (Issue #710)
    callCountsFormat: "auto",
    // Preserve platform-based emoji/ASCII defaults unless explicitly overridden
    showLastTool: false,
    sessionSummary: false,
    // Disabled by default - opt-in AI-generated session summary
    maxOutputLines: 4,
    safeMode: true
    // Enabled by default to prevent terminal rendering corruption (Issue #346)
  },
  thresholds: {
    contextWarning: 70,
    contextCompactSuggestion: 80,
    contextCritical: 85,
    ralphWarning: 7
  },
  staleTaskThresholdMinutes: 10,
  contextLimitWarning: {
    threshold: 80,
    autoCompact: false
  },
  missionBoard: DEFAULT_MISSION_BOARD_CONFIG,
  usageApiPollIntervalMs: DEFAULT_HUD_USAGE_POLL_INTERVAL_MS,
  wrapMode: "truncate"
};
var PRESET_CONFIGS = {
  minimal: {
    cwd: false,
    cwdFormat: "folder",
    useHyperlinks: false,
    gitRepo: false,
    gitBranch: false,
    gitStatus: false,
    gitInfoPosition: "above",
    model: false,
    modelFormat: "short",
    omcLabel: true,
    rateLimits: true,
    ralph: true,
    autopilot: true,
    prdStory: false,
    activeSkills: true,
    lastSkill: true,
    contextBar: false,
    agents: true,
    agentsFormat: "count",
    agentsMaxLines: 0,
    backgroundTasks: false,
    todos: true,
    permissionStatus: false,
    thinking: false,
    thinkingFormat: "text",
    apiKeySource: false,
    hostname: false,
    profile: true,
    missionBoard: false,
    promptTime: false,
    sessionHealth: false,
    showSessionDuration: true,
    showHealthIndicator: true,
    showTokens: false,
    useBars: false,
    showCallCounts: false,
    showLastTool: false,
    sessionSummary: false,
    maxOutputLines: 2,
    safeMode: true
  },
  focused: {
    cwd: false,
    cwdFormat: "relative",
    useHyperlinks: false,
    gitRepo: false,
    gitBranch: true,
    gitStatus: true,
    gitInfoPosition: "above",
    model: false,
    modelFormat: "short",
    omcLabel: true,
    rateLimits: true,
    ralph: true,
    autopilot: true,
    prdStory: true,
    activeSkills: true,
    lastSkill: true,
    contextBar: true,
    agents: true,
    agentsFormat: "multiline",
    agentsMaxLines: 3,
    backgroundTasks: true,
    todos: true,
    permissionStatus: false,
    thinking: true,
    thinkingFormat: "text",
    apiKeySource: false,
    hostname: false,
    profile: true,
    missionBoard: false,
    promptTime: true,
    sessionHealth: true,
    showSessionDuration: true,
    showHealthIndicator: true,
    showTokens: false,
    useBars: true,
    showCallCounts: true,
    showLastTool: false,
    sessionSummary: false,
    // Opt-in: sends transcript to claude -p
    maxOutputLines: 4,
    safeMode: true
  },
  full: {
    cwd: false,
    cwdFormat: "relative",
    useHyperlinks: false,
    gitRepo: true,
    gitBranch: true,
    gitStatus: true,
    gitInfoPosition: "above",
    model: false,
    modelFormat: "short",
    omcLabel: true,
    rateLimits: true,
    ralph: true,
    autopilot: true,
    prdStory: true,
    activeSkills: true,
    lastSkill: true,
    contextBar: true,
    agents: true,
    agentsFormat: "multiline",
    agentsMaxLines: 10,
    backgroundTasks: true,
    todos: true,
    permissionStatus: false,
    thinking: true,
    thinkingFormat: "text",
    apiKeySource: true,
    hostname: false,
    profile: true,
    missionBoard: false,
    promptTime: true,
    sessionHealth: true,
    showSessionDuration: true,
    showHealthIndicator: true,
    showTokens: false,
    useBars: true,
    showCallCounts: true,
    showLastTool: false,
    sessionSummary: false,
    // Opt-in: sends transcript to claude -p
    maxOutputLines: 12,
    safeMode: true
  },
  opencode: {
    cwd: false,
    cwdFormat: "relative",
    useHyperlinks: false,
    gitRepo: false,
    gitBranch: true,
    gitStatus: false,
    gitInfoPosition: "above",
    model: false,
    modelFormat: "short",
    omcLabel: true,
    rateLimits: false,
    ralph: true,
    autopilot: true,
    prdStory: false,
    activeSkills: true,
    lastSkill: true,
    contextBar: true,
    agents: true,
    agentsFormat: "codes",
    agentsMaxLines: 0,
    backgroundTasks: false,
    todos: true,
    permissionStatus: false,
    thinking: true,
    thinkingFormat: "text",
    apiKeySource: false,
    hostname: false,
    profile: true,
    missionBoard: false,
    promptTime: true,
    sessionHealth: true,
    showSessionDuration: true,
    showHealthIndicator: true,
    showTokens: false,
    useBars: false,
    showCallCounts: true,
    showLastTool: false,
    sessionSummary: false,
    maxOutputLines: 4,
    safeMode: true
  },
  dense: {
    cwd: false,
    cwdFormat: "relative",
    useHyperlinks: false,
    gitRepo: true,
    gitBranch: true,
    gitStatus: true,
    gitInfoPosition: "above",
    model: false,
    modelFormat: "short",
    omcLabel: true,
    rateLimits: true,
    ralph: true,
    autopilot: true,
    prdStory: true,
    activeSkills: true,
    lastSkill: true,
    contextBar: true,
    agents: true,
    agentsFormat: "multiline",
    agentsMaxLines: 5,
    backgroundTasks: true,
    todos: true,
    permissionStatus: false,
    thinking: true,
    thinkingFormat: "text",
    apiKeySource: true,
    hostname: false,
    profile: true,
    missionBoard: false,
    promptTime: true,
    sessionHealth: true,
    showSessionDuration: true,
    showHealthIndicator: true,
    showTokens: false,
    useBars: true,
    showCallCounts: true,
    showLastTool: false,
    sessionSummary: false,
    // Opt-in: sends transcript to claude -p
    maxOutputLines: 6,
    safeMode: true
  }
};

// dist/hud/background-cleanup.js
var STALE_TASK_THRESHOLD_MS = 30 * 60 * 1e3;
function getTaskStartMs(task) {
  const raw = task.startedAt ?? task.startTime;
  if (!raw)
    return NaN;
  return new Date(raw).getTime();
}
async function cleanupStaleBackgroundTasks(thresholdMs = STALE_TASK_THRESHOLD_MS, directory, sessionId) {
  const state = readHudState(directory, sessionId);
  if (!state || !state.backgroundTasks) {
    return 0;
  }
  const now = Date.now();
  const originalCount = state.backgroundTasks.length;
  let statusChanged = false;
  for (const task of state.backgroundTasks) {
    if (task.status === "running") {
      const startMs = getTaskStartMs(task);
      if (Number.isNaN(startMs)) {
        task.status = "failed";
        task.completedAt = (/* @__PURE__ */ new Date()).toISOString();
        statusChanged = true;
      } else {
        const taskAge = now - startMs;
        if (taskAge > thresholdMs) {
          task.status = "failed";
          task.completedAt = (/* @__PURE__ */ new Date()).toISOString();
          statusChanged = true;
        }
      }
    }
  }
  state.backgroundTasks = state.backgroundTasks.filter((task) => {
    if (task.status === "running")
      return true;
    if (task.completedAt) {
      const completedMs = new Date(task.completedAt).getTime();
      if (Number.isNaN(completedMs))
        return true;
      return now - completedMs < thresholdMs;
    }
    return true;
  });
  if (state.backgroundTasks.length > 20) {
    const running = state.backgroundTasks.filter((t) => t.status === "running");
    const nonRunning = state.backgroundTasks.filter((t) => t.status !== "running").slice(-Math.max(0, 20 - running.length));
    state.backgroundTasks = [...running, ...nonRunning];
  }
  const removedCount = originalCount - state.backgroundTasks.length;
  if (removedCount > 0 || statusChanged) {
    state.timestamp = (/* @__PURE__ */ new Date()).toISOString();
    writeHudState(state, directory, sessionId);
  }
  return removedCount;
}
async function detectOrphanedTasks(directory, sessionId) {
  const state = readHudState(directory, sessionId);
  if (!state || !state.backgroundTasks) {
    return [];
  }
  const orphaned = [];
  for (const task of state.backgroundTasks) {
    if (task.status === "running") {
      const taskAge = Date.now() - new Date(task.startedAt).getTime();
      const TWO_HOURS_MS = 2 * 60 * 60 * 1e3;
      if (taskAge > TWO_HOURS_MS) {
        orphaned.push(task);
      }
    }
  }
  return orphaned;
}
async function markOrphanedTasksAsStale(directory, sessionId) {
  const state = readHudState(directory, sessionId);
  if (!state || !state.backgroundTasks) {
    return 0;
  }
  const orphaned = await detectOrphanedTasks(directory, sessionId);
  let marked = 0;
  for (const orphanedTask of orphaned) {
    const task = state.backgroundTasks.find((t) => t.id === orphanedTask.id);
    if (task && task.status === "running") {
      task.status = "completed";
      marked++;
    }
  }
  if (marked > 0) {
    writeHudState(state, directory, sessionId);
  }
  return marked;
}

// dist/hud/state.js
function getLocalStateFilePath(directory) {
  const baseDir = validateWorkingDirectory(directory);
  const omcStateDir = join6(getOmcRoot(baseDir), "state");
  return join6(omcStateDir, "hud-state.json");
}
function getLegacyRootStateFilePath(directory) {
  const baseDir = validateWorkingDirectory(directory);
  return join6(getOmcRoot(baseDir), "hud-state.json");
}
function getStateFilePath(directory, sessionId) {
  const baseDir = validateWorkingDirectory(directory);
  if (sessionId) {
    return resolveSessionStatePath("hud", sessionId, baseDir);
  }
  return getLocalStateFilePath(baseDir);
}
function getSettingsFilePath() {
  return join6(getClaudeConfigDir(), "settings.json");
}
function getConfigFilePath() {
  return join6(getClaudeConfigDir(), ".omc", "hud-config.json");
}
function readJsonFile(filePath) {
  if (!existsSync6(filePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync3(filePath, "utf-8"));
  } catch {
    return null;
  }
}
function getLegacyHudConfig() {
  return readJsonFile(getConfigFilePath());
}
function mergeElements(primary, secondary) {
  return {
    ...primary ?? {},
    ...secondary ?? {}
  };
}
function mergeThresholds(primary, secondary) {
  return {
    ...primary ?? {},
    ...secondary ?? {}
  };
}
function mergeContextLimitWarning(primary, secondary) {
  return {
    ...primary ?? {},
    ...secondary ?? {}
  };
}
function mergeMissionBoardConfig(primary, secondary) {
  return {
    ...primary ?? {},
    ...secondary ?? {}
  };
}
function ensureStateDir(directory) {
  const baseDir = validateWorkingDirectory(directory);
  const omcStateDir = join6(getOmcRoot(baseDir), "state");
  if (!existsSync6(omcStateDir)) {
    mkdirSync5(omcStateDir, { recursive: true });
  }
}
function ensureHudStateDir(directory, sessionId) {
  if (sessionId) {
    ensureSessionStateDir(sessionId, validateWorkingDirectory(directory));
    return;
  }
  ensureStateDir(directory);
}
function readHudState(directory, sessionId) {
  if (sessionId) {
    const sessionStateFile = getStateFilePath(directory, sessionId);
    if (!existsSync6(sessionStateFile)) {
      return null;
    }
    try {
      const content = readFileSync3(sessionStateFile, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.error("[HUD] Failed to read session state:", error instanceof Error ? error.message : error);
      return null;
    }
  }
  const localStateFile = getLocalStateFilePath(directory);
  if (existsSync6(localStateFile)) {
    try {
      const content = readFileSync3(localStateFile, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.error("[HUD] Failed to read local state:", error instanceof Error ? error.message : error);
    }
  }
  const legacyStateFile = getLegacyRootStateFilePath(directory);
  if (existsSync6(legacyStateFile)) {
    try {
      const content = readFileSync3(legacyStateFile, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.error("[HUD] Failed to read legacy state:", error instanceof Error ? error.message : error);
      return null;
    }
  }
  return null;
}
function writeHudState(state, directory, sessionId) {
  try {
    ensureHudStateDir(directory, sessionId);
    const stateFile = getStateFilePath(directory, sessionId);
    const nextState = sessionId ? { ...state, sessionId } : state;
    atomicWriteJsonSync(stateFile, nextState);
    if (sessionId) {
      const legacyCandidates = [
        getLegacyRootStateFilePath(directory)
      ];
      for (const legacyFile of legacyCandidates) {
        if (!existsSync6(legacyFile)) {
          continue;
        }
        try {
          const content = readFileSync3(legacyFile, "utf-8");
          const legacyState = JSON.parse(content);
          if (!legacyState.sessionId || legacyState.sessionId === sessionId) {
            unlinkSync2(legacyFile);
          }
        } catch {
        }
      }
    }
    return true;
  } catch (error) {
    console.error("[HUD] Failed to write state:", error instanceof Error ? error.message : error);
    return false;
  }
}
function getRunningTasks(state) {
  if (!state)
    return [];
  return state.backgroundTasks.filter((task) => task.status === "running");
}
function readHudConfig() {
  const settingsFile = getSettingsFilePath();
  const legacyConfig = getLegacyHudConfig();
  if (existsSync6(settingsFile)) {
    try {
      const content = readFileSync3(settingsFile, "utf-8");
      const settings = JSON.parse(content);
      if (settings.omcHud) {
        return mergeWithDefaults({
          ...legacyConfig,
          ...settings.omcHud,
          elements: mergeElements(legacyConfig?.elements, settings.omcHud.elements),
          thresholds: mergeThresholds(legacyConfig?.thresholds, settings.omcHud.thresholds),
          contextLimitWarning: mergeContextLimitWarning(legacyConfig?.contextLimitWarning, settings.omcHud.contextLimitWarning),
          missionBoard: mergeMissionBoardConfig(legacyConfig?.missionBoard, settings.omcHud.missionBoard)
        });
      }
    } catch (error) {
      console.error("[HUD] Failed to read settings.json:", error instanceof Error ? error.message : error);
    }
  }
  if (legacyConfig) {
    return mergeWithDefaults(legacyConfig);
  }
  return DEFAULT_HUD_CONFIG;
}
function mergeWithDefaults(config) {
  const preset = config.preset ?? DEFAULT_HUD_CONFIG.preset;
  const presetElements = PRESET_CONFIGS[preset] ?? {};
  const missionBoardEnabled = config.missionBoard?.enabled ?? config.elements?.missionBoard ?? DEFAULT_HUD_CONFIG.missionBoard?.enabled ?? false;
  const missionBoard = {
    ...DEFAULT_MISSION_BOARD_CONFIG,
    ...DEFAULT_HUD_CONFIG.missionBoard,
    ...config.missionBoard,
    enabled: missionBoardEnabled
  };
  return {
    preset,
    elements: {
      ...DEFAULT_HUD_CONFIG.elements,
      // Base defaults
      ...presetElements,
      // Preset overrides
      ...config.elements
      // User overrides
    },
    thresholds: {
      ...DEFAULT_HUD_CONFIG.thresholds,
      ...config.thresholds
    },
    staleTaskThresholdMinutes: config.staleTaskThresholdMinutes ?? DEFAULT_HUD_CONFIG.staleTaskThresholdMinutes,
    contextLimitWarning: {
      ...DEFAULT_HUD_CONFIG.contextLimitWarning,
      ...config.contextLimitWarning
    },
    missionBoard,
    usageApiPollIntervalMs: config.usageApiPollIntervalMs ?? DEFAULT_HUD_CONFIG.usageApiPollIntervalMs,
    ...config.elementOrder !== void 0 ? { elementOrder: config.elementOrder } : {},
    wrapMode: config.wrapMode ?? DEFAULT_HUD_CONFIG.wrapMode,
    ...config.rateLimitsProvider ? { rateLimitsProvider: config.rateLimitsProvider } : {},
    ...config.maxWidth != null ? { maxWidth: config.maxWidth } : {},
    ...config.layout ? { layout: config.layout } : {}
  };
}
async function initializeHUDState(directory, sessionId) {
  const removedStale = await cleanupStaleBackgroundTasks(void 0, directory, sessionId);
  const markedOrphaned = await markOrphanedTasksAsStale(directory, sessionId);
  if (removedStale > 0 || markedOrphaned > 0) {
    console.error(`HUD cleanup: removed ${removedStale} stale tasks, marked ${markedOrphaned} orphaned tasks`);
  }
}

// dist/hud/omc-state.js
import { existsSync as existsSync7, readFileSync as readFileSync4, statSync as statSync2, readdirSync as readdirSync3 } from "fs";
import { join as join7 } from "path";
var MAX_STATE_AGE_MS = 2 * 60 * 60 * 1e3;
function isStateFileStale(filePath) {
  try {
    const stat = statSync2(filePath);
    const age = Date.now() - stat.mtimeMs;
    return age > MAX_STATE_AGE_MS;
  } catch {
    return true;
  }
}
function resolveStatePath(directory, filename, sessionId) {
  const omcRoot = getOmcRoot(directory);
  if (sessionId) {
    const sessionPath = join7(omcRoot, "state", "sessions", sessionId, filename);
    return existsSync7(sessionPath) ? sessionPath : null;
  }
  let bestPath = null;
  let bestMtime = 0;
  const sessionsDir = join7(omcRoot, "state", "sessions");
  if (existsSync7(sessionsDir)) {
    try {
      const entries = readdirSync3(sessionsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory())
          continue;
        const sessionFile = join7(sessionsDir, entry.name, filename);
        if (existsSync7(sessionFile)) {
          try {
            const mtime = statSync2(sessionFile).mtimeMs;
            if (mtime > bestMtime) {
              bestMtime = mtime;
              bestPath = sessionFile;
            }
          } catch {
          }
        }
      }
    } catch {
    }
  }
  const newPath = join7(omcRoot, "state", filename);
  if (existsSync7(newPath)) {
    try {
      const mtime = statSync2(newPath).mtimeMs;
      if (mtime > bestMtime) {
        bestMtime = mtime;
        bestPath = newPath;
      }
    } catch {
      if (!bestPath)
        bestPath = newPath;
    }
  }
  const legacyPath = join7(omcRoot, filename);
  if (existsSync7(legacyPath)) {
    try {
      const mtime = statSync2(legacyPath).mtimeMs;
      if (mtime > bestMtime) {
        bestPath = legacyPath;
      }
    } catch {
      if (!bestPath)
        bestPath = legacyPath;
    }
  }
  return bestPath;
}
function readRalphStateForHud(directory, sessionId) {
  const stateFile = resolveStatePath(directory, "ralph-state.json", sessionId);
  if (!stateFile) {
    return null;
  }
  if (isStateFileStale(stateFile)) {
    return null;
  }
  try {
    const content = readFileSync4(stateFile, "utf-8");
    const state = JSON.parse(content);
    if (!state.active) {
      return null;
    }
    return {
      active: state.active,
      iteration: state.iteration,
      maxIterations: state.max_iterations,
      prdMode: state.prd_mode,
      currentStoryId: state.current_story_id
    };
  } catch {
    return null;
  }
}
function readUltraworkStateForHud(directory, sessionId) {
  const localFile = resolveStatePath(directory, "ultrawork-state.json", sessionId);
  if (!localFile || isStateFileStale(localFile)) {
    return null;
  }
  try {
    const content = readFileSync4(localFile, "utf-8");
    const state = JSON.parse(content);
    if (!state.active) {
      return null;
    }
    return {
      active: state.active,
      reinforcementCount: state.reinforcement_count
    };
  } catch {
    return null;
  }
}
function readPrdStateForHud(directory) {
  let prdPath = join7(directory, "prd.json");
  if (!existsSync7(prdPath)) {
    prdPath = join7(getOmcRoot(directory), "prd.json");
    if (!existsSync7(prdPath)) {
      return null;
    }
  }
  try {
    const content = readFileSync4(prdPath, "utf-8");
    const prd = JSON.parse(content);
    if (!prd.userStories || !Array.isArray(prd.userStories)) {
      return null;
    }
    const stories = prd.userStories;
    const completed = stories.filter((s) => s.passes).length;
    const total = stories.length;
    const incomplete = stories.filter((s) => !s.passes).sort((a, b) => a.priority - b.priority);
    return {
      currentStoryId: incomplete[0]?.id || null,
      completed,
      total
    };
  } catch {
    return null;
  }
}
function readAutopilotStateForHud(directory, sessionId) {
  const stateFile = resolveStatePath(directory, "autopilot-state.json", sessionId);
  if (!stateFile) {
    return null;
  }
  if (isStateFileStale(stateFile)) {
    return null;
  }
  try {
    const content = readFileSync4(stateFile, "utf-8");
    const state = JSON.parse(content);
    if (!state.active) {
      return null;
    }
    const phase = state.phase ?? state.current_phase;
    if (!phase) {
      return null;
    }
    return {
      active: state.active,
      phase,
      iteration: state.iteration,
      maxIterations: state.max_iterations,
      tasksCompleted: state.execution?.tasks_completed,
      tasksTotal: state.execution?.tasks_total,
      filesCreated: state.execution?.files_created?.length
    };
  } catch {
    return null;
  }
}

// dist/hud/usage-api.js
import { existsSync as existsSync8, readFileSync as readFileSync7, writeFileSync as writeFileSync2, renameSync as renameSync2, unlinkSync as unlinkSync4, mkdirSync as mkdirSync6 } from "fs";
import { join as join8, dirname as dirname4 } from "path";
import { execFileSync as execFileSync2 } from "child_process";
import { createHash as createHash2 } from "crypto";
import { userInfo } from "os";
import https from "https";

// dist/utils/ssrf-guard.js
var BLOCKED_HOST_PATTERNS = [
  // Exact matches
  /^localhost$/i,
  /^127\.[0-9]+\.[0-9]+\.[0-9]+$/,
  // Loopback
  /^10\.[0-9]+\.[0-9]+\.[0-9]+$/,
  // Class A private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\.[0-9]+\.[0-9]+$/,
  // Class B private
  /^192\.168\.[0-9]+\.[0-9]+$/,
  // Class C private
  /^169\.254\.[0-9]+\.[0-9]+$/,
  // Link-local
  /^(0|22[4-9]|23[0-9])\.[0-9]+\.[0-9]+\.[0-9]+$/,
  // Multicast, reserved
  /^\[?::1\]?$/,
  // IPv6 loopback
  /^\[?fc00:/i,
  // IPv6 unique local
  /^\[?fe80:/i,
  // IPv6 link-local
  /^\[?::ffff:/i,
  // IPv6-mapped IPv4 (all private ranges accessible via this prefix)
  /^\[?0{0,4}:{0,2}ffff:/i
  // IPv6-mapped IPv4 expanded forms
];
var ALLOWED_SCHEMES = ["https:", "http:"];
function validateUrlForSSRF(urlString) {
  if (!urlString || typeof urlString !== "string") {
    return { allowed: false, reason: "URL is empty or invalid" };
  }
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return { allowed: false, reason: "Invalid URL format" };
  }
  if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
    return { allowed: false, reason: `Protocol '${parsed.protocol}' is not allowed` };
  }
  const hostname2 = parsed.hostname.toLowerCase();
  for (const pattern of BLOCKED_HOST_PATTERNS) {
    if (pattern.test(hostname2)) {
      return {
        allowed: false,
        reason: `Hostname '${hostname2}' resolves to a blocked internal/private address`
      };
    }
  }
  if (/^0x[0-9a-f]+$/i.test(hostname2)) {
    return {
      allowed: false,
      reason: `Hostname '${hostname2}' looks like a hex-encoded IP address`
    };
  }
  if (/^\d+$/.test(hostname2) && hostname2.length > 3) {
    return {
      allowed: false,
      reason: `Hostname '${hostname2}' looks like a decimal-encoded IP address`
    };
  }
  if (/^0\d+\./.test(hostname2)) {
    return {
      allowed: false,
      reason: `Hostname '${hostname2}' looks like an octal-encoded IP address`
    };
  }
  if (parsed.username || parsed.password) {
    return { allowed: false, reason: "URLs with embedded credentials are not allowed" };
  }
  const dangerousPaths = [
    "/metadata",
    "/meta-data",
    "/latest/meta-data",
    "/computeMetadata"
  ];
  const pathLower = parsed.pathname.toLowerCase();
  for (const dangerous of dangerousPaths) {
    if (pathLower.startsWith(dangerous)) {
      return {
        allowed: false,
        reason: `Path '${parsed.pathname}' is blocked (cloud metadata access)`
      };
    }
  }
  return { allowed: true };
}
function validateAnthropicBaseUrl(urlString) {
  const result = validateUrlForSSRF(urlString);
  if (!result.allowed) {
    return result;
  }
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return { allowed: false, reason: "Invalid URL" };
  }
  if (parsed.protocol === "http:") {
    console.warn("[SSRF Guard] Warning: Using HTTP instead of HTTPS for ANTHROPIC_BASE_URL");
  }
  return { allowed: true };
}

// dist/lib/file-lock.js
import { openSync as openSync3, closeSync as closeSync3, unlinkSync as unlinkSync3, writeSync as writeSync2, readFileSync as readFileSync6, statSync as statSync3, constants as fsConstants } from "fs";
import * as path3 from "path";

// dist/platform/index.js
import * as path2 from "path";
import { readFileSync as readFileSync5 } from "fs";

// dist/platform/process-utils.js
import { execFileSync, execFile } from "child_process";
import { promisify } from "util";
import * as fsPromises from "fs/promises";
var execFileAsync = promisify(execFile);
function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0)
    return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "EPERM") {
      return true;
    }
    return false;
  }
}

// dist/platform/index.js
var PLATFORM = process.platform;
function isWSL() {
  if (process.env.WSLENV !== void 0) {
    return true;
  }
  try {
    const procVersion = readFileSync5("/proc/version", "utf8");
    return procVersion.toLowerCase().includes("microsoft");
  } catch {
    return false;
  }
}

// dist/lib/file-lock.js
var DEFAULT_STALE_LOCK_MS = 3e4;
var DEFAULT_RETRY_DELAY_MS = 50;
function isLockStale(lockPath, staleLockMs) {
  try {
    const stat = statSync3(lockPath);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < staleLockMs)
      return false;
    try {
      const raw = readFileSync6(lockPath, "utf-8");
      const payload = JSON.parse(raw);
      if (payload.pid && isProcessAlive(payload.pid))
        return false;
    } catch {
    }
    return true;
  } catch {
    return false;
  }
}
function lockPathFor(filePath) {
  return filePath + ".lock";
}
function tryAcquireSync(lockPath, staleLockMs) {
  ensureDirSync(path3.dirname(lockPath));
  try {
    const fd = openSync3(lockPath, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 384);
    try {
      const payload = JSON.stringify({ pid: process.pid, timestamp: Date.now() });
      writeSync2(fd, payload, null, "utf-8");
    } catch (writeErr) {
      try {
        closeSync3(fd);
      } catch {
      }
      try {
        unlinkSync3(lockPath);
      } catch {
      }
      throw writeErr;
    }
    return { fd, path: lockPath };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "EEXIST") {
      if (isLockStale(lockPath, staleLockMs)) {
        try {
          unlinkSync3(lockPath);
        } catch {
        }
        try {
          const fd = openSync3(lockPath, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 384);
          try {
            const payload = JSON.stringify({ pid: process.pid, timestamp: Date.now() });
            writeSync2(fd, payload, null, "utf-8");
          } catch (writeErr) {
            try {
              closeSync3(fd);
            } catch {
            }
            try {
              unlinkSync3(lockPath);
            } catch {
            }
            throw writeErr;
          }
          return { fd, path: lockPath };
        } catch {
          return null;
        }
      }
      return null;
    }
    throw err;
  }
}
function releaseFileLockSync(handle) {
  try {
    closeSync3(handle.fd);
  } catch {
  }
  try {
    unlinkSync3(handle.path);
  } catch {
  }
}
function sleep(ms) {
  return new Promise((resolve4) => setTimeout(resolve4, ms));
}
async function acquireFileLock(lockPath, opts) {
  const staleLockMs = opts?.staleLockMs ?? DEFAULT_STALE_LOCK_MS;
  const timeoutMs = opts?.timeoutMs ?? 0;
  const retryDelayMs = opts?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const handle = tryAcquireSync(lockPath, staleLockMs);
  if (handle || timeoutMs <= 0)
    return handle;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(Math.min(retryDelayMs, deadline - Date.now()));
    const retryHandle = tryAcquireSync(lockPath, staleLockMs);
    if (retryHandle)
      return retryHandle;
  }
  return null;
}
function releaseFileLock(handle) {
  releaseFileLockSync(handle);
}
async function withFileLock(lockPath, fn, opts) {
  const handle = await acquireFileLock(lockPath, opts);
  if (!handle) {
    throw new Error(`Failed to acquire file lock: ${lockPath}`);
  }
  try {
    return await fn();
  } finally {
    releaseFileLock(handle);
  }
}

// dist/hud/usage-api.js
var CACHE_TTL_FAILURE_MS = 15 * 1e3;
var CACHE_TTL_TRANSIENT_NETWORK_MS = 2 * 60 * 1e3;
var MAX_RATE_LIMITED_BACKOFF_MS = 5 * 60 * 1e3;
var API_TIMEOUT_MS = 1e4;
var MAX_STALE_DATA_MS = 15 * 60 * 1e3;
var TOKEN_REFRESH_URL_HOSTNAME = "platform.claude.com";
var USAGE_CACHE_LOCK_OPTS = { staleLockMs: API_TIMEOUT_MS + 5e3 };
var TOKEN_REFRESH_URL_PATH = "/v1/oauth/token";
var DEFAULT_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
var ZAI_UNIT_WEEK = 6;
function isZaiHost(urlString) {
  try {
    const url = new URL(urlString);
    const hostname2 = url.hostname.toLowerCase();
    return hostname2 === "z.ai" || hostname2.endsWith(".z.ai");
  } catch {
    return false;
  }
}
function isMinimaxHost(urlString) {
  try {
    const url = new URL(urlString);
    const hostname2 = url.hostname.toLowerCase();
    return hostname2 === "minimax.io" || hostname2.endsWith(".minimax.io") || hostname2 === "minimaxi.com" || hostname2.endsWith(".minimaxi.com") || hostname2 === "minimax.com" || hostname2.endsWith(".minimax.com");
  } catch {
    return false;
  }
}
function getLegacyCachePath() {
  return join8(getClaudeConfigDir(), "plugins", "oh-my-claudecode", ".usage-cache.json");
}
function getCachePath(source) {
  return join8(getClaudeConfigDir(), "plugins", "oh-my-claudecode", `.usage-cache-${source}.json`);
}
function migrateLegacyCache(source) {
  try {
    const legacyPath = getLegacyCachePath();
    if (!existsSync8(legacyPath))
      return;
    if (existsSync8(getCachePath(source)))
      return;
    const content = readFileSync7(legacyPath, "utf-8");
    const cache = JSON.parse(content);
    if (cache.source !== source)
      return;
    const newPath = getCachePath(source);
    const cacheDir = dirname4(newPath);
    if (!existsSync8(cacheDir)) {
      mkdirSync6(cacheDir, { recursive: true });
    }
    writeFileSync2(newPath, content);
  } catch {
  }
}
function readCache(source) {
  try {
    const cachePath = getCachePath(source);
    if (!existsSync8(cachePath))
      return null;
    const content = readFileSync7(cachePath, "utf-8");
    const cache = JSON.parse(content);
    if (cache.data) {
      if (cache.data.fiveHourResetsAt) {
        cache.data.fiveHourResetsAt = new Date(cache.data.fiveHourResetsAt);
      }
      if (cache.data.weeklyResetsAt) {
        cache.data.weeklyResetsAt = new Date(cache.data.weeklyResetsAt);
      }
      if (cache.data.sonnetWeeklyResetsAt) {
        cache.data.sonnetWeeklyResetsAt = new Date(cache.data.sonnetWeeklyResetsAt);
      }
      if (cache.data.opusWeeklyResetsAt) {
        cache.data.opusWeeklyResetsAt = new Date(cache.data.opusWeeklyResetsAt);
      }
      if (cache.data.monthlyResetsAt) {
        cache.data.monthlyResetsAt = new Date(cache.data.monthlyResetsAt);
      }
      if (cache.data.extraUsageResetsAt) {
        cache.data.extraUsageResetsAt = new Date(cache.data.extraUsageResetsAt);
      }
    }
    return cache;
  } catch {
    return null;
  }
}
function writeCache(opts) {
  try {
    const cachePath = getCachePath(opts.source);
    const cacheDir = dirname4(cachePath);
    if (!existsSync8(cacheDir)) {
      mkdirSync6(cacheDir, { recursive: true });
    }
    const cache = {
      timestamp: Date.now(),
      data: opts.data,
      error: opts.error,
      errorReason: opts.errorReason,
      source: opts.source,
      rateLimited: opts.rateLimited || void 0,
      rateLimitedCount: opts.rateLimitedCount && opts.rateLimitedCount > 0 ? opts.rateLimitedCount : void 0,
      rateLimitedUntil: opts.rateLimitedUntil,
      lastSuccessAt: opts.lastSuccessAt
    };
    writeFileSync2(cachePath, JSON.stringify(cache, null, 2));
  } catch {
  }
}
function sanitizePollIntervalMs(value) {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_HUD_USAGE_POLL_INTERVAL_MS;
  }
  return Math.max(1e3, Math.floor(value));
}
function getUsagePollIntervalMs() {
  try {
    return sanitizePollIntervalMs(readHudConfig().usageApiPollIntervalMs);
  } catch {
    return DEFAULT_HUD_USAGE_POLL_INTERVAL_MS;
  }
}
function getRateLimitedBackoffMs(pollIntervalMs, count) {
  const normalizedPollIntervalMs = sanitizePollIntervalMs(pollIntervalMs);
  return Math.min(normalizedPollIntervalMs * Math.pow(2, Math.max(0, count - 1)), MAX_RATE_LIMITED_BACKOFF_MS);
}
function getTransientNetworkBackoffMs(pollIntervalMs) {
  return Math.max(CACHE_TTL_TRANSIENT_NETWORK_MS, sanitizePollIntervalMs(pollIntervalMs));
}
function isCacheValid(cache, pollIntervalMs) {
  if (cache.rateLimited) {
    if (cache.rateLimitedUntil != null) {
      return Date.now() < cache.rateLimitedUntil;
    }
    const count = cache.rateLimitedCount || 1;
    return Date.now() - cache.timestamp < getRateLimitedBackoffMs(pollIntervalMs, count);
  }
  const ttl = cache.error ? cache.errorReason === "network" ? getTransientNetworkBackoffMs(pollIntervalMs) : CACHE_TTL_FAILURE_MS : sanitizePollIntervalMs(pollIntervalMs);
  return Date.now() - cache.timestamp < ttl;
}
function hasUsableStaleData(cache) {
  if (!cache?.data) {
    return false;
  }
  if (cache.lastSuccessAt && Date.now() - cache.lastSuccessAt > MAX_STALE_DATA_MS) {
    return false;
  }
  return true;
}
function getCachedUsageResult(cache) {
  if (cache.rateLimited) {
    if (!hasUsableStaleData(cache) && cache.data) {
      return { rateLimits: null, error: "rate_limited" };
    }
    return { rateLimits: cache.data, error: "rate_limited", stale: cache.data ? true : void 0 };
  }
  if (cache.error) {
    const errorReason = cache.errorReason || "network";
    if (hasUsableStaleData(cache)) {
      return { rateLimits: cache.data, error: errorReason, stale: true };
    }
    return { rateLimits: null, error: errorReason };
  }
  return { rateLimits: cache.data };
}
function createRateLimitedCacheEntry(source, data, pollIntervalMs, previousCount, lastSuccessAt) {
  const timestamp = Date.now();
  const rateLimitedCount = previousCount + 1;
  return {
    timestamp,
    data,
    error: false,
    errorReason: "rate_limited",
    source,
    rateLimited: true,
    rateLimitedCount,
    rateLimitedUntil: timestamp + getRateLimitedBackoffMs(pollIntervalMs, rateLimitedCount),
    lastSuccessAt
  };
}
function getKeychainServiceName() {
  const configDir = process.env.CLAUDE_CONFIG_DIR;
  if (configDir) {
    const hash = createHash2("sha256").update(configDir).digest("hex").slice(0, 8);
    return `Claude Code-credentials-${hash}`;
  }
  return "Claude Code-credentials";
}
function isCredentialExpired(creds) {
  return creds.expiresAt != null && creds.expiresAt <= Date.now();
}
function readKeychainCredential(serviceName, account) {
  try {
    const args = account ? ["find-generic-password", "-s", serviceName, "-a", account, "-w"] : ["find-generic-password", "-s", serviceName, "-w"];
    const result = execFileSync2("/usr/bin/security", args, {
      encoding: "utf-8",
      timeout: 2e3,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    if (!result)
      return null;
    const parsed = JSON.parse(result);
    const creds = parsed.claudeAiOauth || parsed;
    if (!creds.accessToken)
      return null;
    return {
      accessToken: creds.accessToken,
      expiresAt: creds.expiresAt,
      refreshToken: creds.refreshToken,
      source: "keychain"
    };
  } catch {
    return null;
  }
}
function readKeychainCredentials() {
  if (process.platform !== "darwin")
    return null;
  const serviceName = getKeychainServiceName();
  const candidateAccounts = [];
  try {
    const username = userInfo().username?.trim();
    if (username) {
      candidateAccounts.push(username);
    }
  } catch {
  }
  candidateAccounts.push(void 0);
  let expiredFallback = null;
  for (const account of candidateAccounts) {
    const creds = readKeychainCredential(serviceName, account);
    if (!creds)
      continue;
    if (!isCredentialExpired(creds)) {
      return creds;
    }
    expiredFallback ??= creds;
  }
  return expiredFallback;
}
function readFileCredentials() {
  try {
    const credPath = join8(getClaudeConfigDir(), ".credentials.json");
    if (!existsSync8(credPath))
      return null;
    const content = readFileSync7(credPath, "utf-8");
    const parsed = JSON.parse(content);
    const creds = parsed.claudeAiOauth || parsed;
    if (creds.accessToken) {
      return {
        accessToken: creds.accessToken,
        expiresAt: creds.expiresAt,
        refreshToken: creds.refreshToken,
        source: "file"
      };
    }
  } catch {
  }
  return null;
}
function getCredentials() {
  const keychainCreds = readKeychainCredentials();
  if (keychainCreds)
    return keychainCreds;
  return readFileCredentials();
}
function validateCredentials(creds) {
  if (!creds.accessToken)
    return false;
  return !isCredentialExpired(creds);
}
function refreshAccessToken(refreshToken) {
  return new Promise((resolve4) => {
    const clientId = process.env.CLAUDE_CODE_OAUTH_CLIENT_ID || DEFAULT_OAUTH_CLIENT_ID;
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId
    }).toString();
    const req = https.request({
      hostname: TOKEN_REFRESH_URL_HOSTNAME,
      path: TOKEN_REFRESH_URL_PATH,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body)
      },
      timeout: API_TIMEOUT_MS
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.access_token) {
              resolve4({
                accessToken: parsed.access_token,
                refreshToken: parsed.refresh_token || refreshToken,
                expiresAt: parsed.expires_in ? Date.now() + parsed.expires_in * 1e3 : parsed.expires_at
              });
              return;
            }
          } catch {
          }
        }
        if (process.env.OMC_DEBUG) {
          console.error(`[usage-api] Token refresh failed: HTTP ${res.statusCode}`);
        }
        resolve4(null);
      });
    });
    req.on("error", () => resolve4(null));
    req.on("timeout", () => {
      req.destroy();
      resolve4(null);
    });
    req.end(body);
  });
}
function fetchUsageFromApi(accessToken) {
  return new Promise((resolve4) => {
    const req = https.request({
      hostname: "api.anthropic.com",
      path: "/api/oauth/usage",
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        "Content-Type": "application/json"
      },
      timeout: API_TIMEOUT_MS
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            resolve4({ data: JSON.parse(data) });
          } catch {
            resolve4({ data: null });
          }
        } else if (res.statusCode === 429) {
          if (process.env.OMC_DEBUG) {
            console.error(`[usage-api] Anthropic API returned 429 (rate limited)`);
          }
          resolve4({ data: null, rateLimited: true });
        } else {
          resolve4({ data: null });
        }
      });
    });
    req.on("error", () => resolve4({ data: null }));
    req.on("timeout", () => {
      req.destroy();
      resolve4({ data: null });
    });
    req.end();
  });
}
function fetchUsageFromZai() {
  return new Promise((resolve4) => {
    const baseUrl = process.env.ANTHROPIC_BASE_URL;
    const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
    if (!baseUrl || !authToken) {
      resolve4({ data: null });
      return;
    }
    const validation = validateAnthropicBaseUrl(baseUrl);
    if (!validation.allowed) {
      console.error(`[SSRF Guard] Blocking usage API call: ${validation.reason}`);
      resolve4({ data: null });
      return;
    }
    try {
      const url = new URL(baseUrl);
      const baseDomain = `${url.protocol}//${url.host}`;
      const quotaLimitUrl = `${baseDomain}/api/monitor/usage/quota/limit`;
      const urlObj = new URL(quotaLimitUrl);
      const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: "GET",
        headers: {
          "Authorization": authToken,
          "Content-Type": "application/json",
          "Accept-Language": "en-US,en"
        },
        timeout: API_TIMEOUT_MS
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              resolve4({ data: JSON.parse(data) });
            } catch {
              resolve4({ data: null });
            }
          } else if (res.statusCode === 429) {
            if (process.env.OMC_DEBUG) {
              console.error(`[usage-api] z.ai API returned 429 (rate limited)`);
            }
            resolve4({ data: null, rateLimited: true });
          } else {
            resolve4({ data: null });
          }
        });
      });
      req.on("error", () => resolve4({ data: null }));
      req.on("timeout", () => {
        req.destroy();
        resolve4({ data: null });
      });
      req.end();
    } catch {
      resolve4({ data: null });
    }
  });
}
function writeBackCredentials(creds) {
  try {
    const credPath = join8(getClaudeConfigDir(), ".credentials.json");
    if (!existsSync8(credPath))
      return;
    const content = readFileSync7(credPath, "utf-8");
    const parsed = JSON.parse(content);
    if (parsed.claudeAiOauth) {
      parsed.claudeAiOauth.accessToken = creds.accessToken;
      if (creds.expiresAt != null) {
        parsed.claudeAiOauth.expiresAt = creds.expiresAt;
      }
      if (creds.refreshToken) {
        parsed.claudeAiOauth.refreshToken = creds.refreshToken;
      }
    } else {
      parsed.accessToken = creds.accessToken;
      if (creds.expiresAt != null) {
        parsed.expiresAt = creds.expiresAt;
      }
      if (creds.refreshToken) {
        parsed.refreshToken = creds.refreshToken;
      }
    }
    const tmpPath = `${credPath}.tmp.${process.pid}`;
    try {
      writeFileSync2(tmpPath, JSON.stringify(parsed, null, 2), { mode: 384 });
      renameSync2(tmpPath, credPath);
    } catch (writeErr) {
      try {
        if (existsSync8(tmpPath)) {
          unlinkSync4(tmpPath);
        }
      } catch {
      }
      throw writeErr;
    }
  } catch {
    if (process.env.OMC_DEBUG) {
      console.error("[usage-api] Failed to write back refreshed credentials");
    }
  }
}
function clamp(v) {
  if (v == null || !isFinite(v))
    return 0;
  return Math.max(0, Math.min(100, v));
}
function parseUsageResponse(response) {
  const fiveHour = response.five_hour?.utilization;
  const sevenDay = response.seven_day?.utilization;
  if (fiveHour == null && sevenDay == null)
    return null;
  const parseDate = (dateStr) => {
    if (!dateStr)
      return null;
    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  };
  const sonnetSevenDay = response.seven_day_sonnet?.utilization;
  const sonnetResetsAt = response.seven_day_sonnet?.resets_at;
  const result = {
    fiveHourPercent: clamp(fiveHour),
    weeklyPercent: clamp(sevenDay),
    fiveHourResetsAt: parseDate(response.five_hour?.resets_at),
    weeklyResetsAt: parseDate(response.seven_day?.resets_at)
  };
  if (sonnetSevenDay != null) {
    result.sonnetWeeklyPercent = clamp(sonnetSevenDay);
    result.sonnetWeeklyResetsAt = parseDate(sonnetResetsAt);
  }
  const opusSevenDay = response.seven_day_opus?.utilization;
  const opusResetsAt = response.seven_day_opus?.resets_at;
  if (opusSevenDay != null) {
    result.opusWeeklyPercent = clamp(opusSevenDay);
    result.opusWeeklyResetsAt = parseDate(opusResetsAt);
  }
  const extra = response.extra_usage;
  if (extra != null && extra.limit_usd != null && extra.limit_usd > 0) {
    const spentUsd = extra.spent_usd ?? 0;
    result.extraUsageSpentUsd = spentUsd;
    result.extraUsageLimitUsd = extra.limit_usd;
    result.extraUsagePercent = extra.utilization != null ? clamp(extra.utilization) : clamp(spentUsd / extra.limit_usd * 100);
    result.extraUsageResetsAt = parseDate(extra.resets_at);
  }
  return result;
}
function parseZaiResponse(response) {
  const limits = response.data?.limits;
  if (!limits || limits.length === 0)
    return null;
  const allTokensLimits = limits.filter((l) => l.type === "TOKENS_LIMIT");
  const timeLimit = limits.find((l) => l.type === "TIME_LIMIT");
  if (allTokensLimits.length === 0 && !timeLimit)
    return null;
  const parseResetTime = (timestamp) => {
    if (!timestamp)
      return null;
    try {
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  };
  const sortByResetTime = (a, b) => {
    const aTime = a.nextResetTime && a.nextResetTime > 0 ? a.nextResetTime : Infinity;
    const bTime = b.nextResetTime && b.nextResetTime > 0 ? b.nextResetTime : Infinity;
    if (aTime !== bTime)
      return aTime - bTime;
    return (a.percentage ?? 0) - (b.percentage ?? 0);
  };
  const weeklyByUnit = allTokensLimits.find((l) => l.unit === ZAI_UNIT_WEEK);
  let fiveHourBucket;
  let weeklyBucket;
  if (weeklyByUnit) {
    weeklyBucket = weeklyByUnit;
    fiveHourBucket = allTokensLimits.filter((l) => l.unit !== ZAI_UNIT_WEEK).slice().sort(sortByResetTime)[0];
  } else {
    const sorted = allTokensLimits.slice().sort(sortByResetTime);
    fiveHourBucket = sorted[0];
    weeklyBucket = sorted[1];
  }
  if (allTokensLimits.length > 2 && process.env.OMC_DEBUG) {
    console.error(`[usage-api] z.ai returned ${allTokensLimits.length} TOKENS_LIMIT entries; using unit-based classification`);
  }
  const result = {
    fiveHourPercent: clamp(fiveHourBucket?.percentage),
    fiveHourResetsAt: parseResetTime(fiveHourBucket?.nextResetTime),
    monthlyPercent: timeLimit ? clamp(timeLimit.percentage) : void 0,
    monthlyResetsAt: timeLimit ? parseResetTime(timeLimit.nextResetTime) ?? null : void 0
  };
  if (weeklyBucket) {
    result.weeklyPercent = clamp(weeklyBucket.percentage);
    result.weeklyResetsAt = parseResetTime(weeklyBucket.nextResetTime);
  }
  return result;
}
function fetchUsageFromMinimax(apiKey) {
  return new Promise((resolve4) => {
    const baseUrl = process.env.ANTHROPIC_BASE_URL;
    if (!baseUrl) {
      resolve4({ data: null });
      return;
    }
    const validation = validateAnthropicBaseUrl(baseUrl);
    if (!validation.allowed) {
      console.error(`[SSRF Guard] Blocking usage API call: ${validation.reason}`);
      resolve4({ data: null });
      return;
    }
    try {
      const url = new URL(baseUrl);
      const baseDomain = `${url.protocol}//${url.host}`;
      const quotaUrl = `${baseDomain}/v1/api/openplatform/coding_plan/remains`;
      const urlObj = new URL(quotaUrl);
      const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: "GET",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: API_TIMEOUT_MS
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              resolve4({ data: JSON.parse(data) });
            } catch {
              resolve4({ data: null });
            }
          } else if (res.statusCode === 429) {
            if (process.env.OMC_DEBUG) {
              console.error(`[usage-api] MiniMax API returned 429 (rate limited)`);
            }
            resolve4({ data: null, rateLimited: true });
          } else {
            resolve4({ data: null });
          }
        });
      });
      req.on("error", () => resolve4({ data: null }));
      req.on("timeout", () => {
        req.destroy();
        resolve4({ data: null });
      });
      req.end();
    } catch {
      resolve4({ data: null });
    }
  });
}
function parseMinimaxResponse(response) {
  if (response.base_resp?.status_code != null && response.base_resp.status_code !== 0) {
    return null;
  }
  const models = response.model_remains;
  if (!models || models.length === 0)
    return null;
  const codingModel = models.find((m) => m.model_name.toLowerCase().startsWith("minimax-m"));
  if (!codingModel) {
    if (process.env.OMC_DEBUG) {
      console.error("[usage-api] No MiniMax-M* model found in coding plan response");
    }
    return null;
  }
  const intervalTotal = codingModel.current_interval_total_count;
  const intervalUsed = intervalTotal - codingModel.current_interval_usage_count;
  const intervalPercent = intervalTotal > 0 ? intervalUsed / intervalTotal * 100 : 0;
  const weeklyTotal = codingModel.current_weekly_total_count;
  const weeklyUsed = weeklyTotal - codingModel.current_weekly_usage_count;
  const weeklyPercent = weeklyTotal > 0 ? weeklyUsed / weeklyTotal * 100 : 0;
  const parseResetTime = (timestamp) => {
    if (!timestamp)
      return null;
    try {
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  };
  return {
    fiveHourPercent: clamp(intervalPercent),
    fiveHourResetsAt: parseResetTime(codingModel.end_time),
    weeklyPercent: clamp(weeklyPercent),
    weeklyResetsAt: parseResetTime(codingModel.weekly_end_time)
  };
}
async function fetchAndCacheUsage(opts) {
  const { source, fetchFn, parseFn, cache, pollIntervalMs } = opts;
  const result = await fetchFn();
  if (result.rateLimited) {
    const prevLastSuccess = cache?.lastSuccessAt;
    const rateLimitedCache = createRateLimitedCacheEntry(source, cache?.data || null, pollIntervalMs, cache?.rateLimitedCount || 0, prevLastSuccess);
    writeCache({
      data: rateLimitedCache.data,
      error: rateLimitedCache.error,
      source,
      rateLimited: true,
      rateLimitedCount: rateLimitedCache.rateLimitedCount,
      rateLimitedUntil: rateLimitedCache.rateLimitedUntil,
      errorReason: "rate_limited",
      lastSuccessAt: rateLimitedCache.lastSuccessAt
    });
    if (rateLimitedCache.data) {
      if (prevLastSuccess && Date.now() - prevLastSuccess > MAX_STALE_DATA_MS) {
        return { rateLimits: null, error: "rate_limited" };
      }
      return { rateLimits: rateLimitedCache.data, error: "rate_limited", stale: true };
    }
    return { rateLimits: null, error: "rate_limited" };
  }
  if (!result.data) {
    const fallbackData = hasUsableStaleData(cache) ? cache.data : null;
    writeCache({
      data: fallbackData,
      error: true,
      source,
      errorReason: "network",
      lastSuccessAt: cache?.lastSuccessAt
    });
    if (fallbackData) {
      return { rateLimits: fallbackData, error: "network", stale: true };
    }
    return { rateLimits: null, error: "network" };
  }
  const usage = parseFn(result.data);
  writeCache({ data: usage, error: !usage, source, lastSuccessAt: Date.now() });
  return { rateLimits: usage };
}
async function getUsage() {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const isMinimax = baseUrl != null && isMinimaxHost(baseUrl);
  const isZai = baseUrl != null && isZaiHost(baseUrl);
  const minimaxApiKey = process.env.MINIMAX_API_KEY || authToken;
  const currentSource = isMinimax ? "minimax" : isZai && authToken ? "zai" : "anthropic";
  const pollIntervalMs = getUsagePollIntervalMs();
  migrateLegacyCache(currentSource);
  const initialCache = readCache(currentSource);
  if (initialCache && isCacheValid(initialCache, pollIntervalMs) && initialCache.source === currentSource) {
    return getCachedUsageResult(initialCache);
  }
  try {
    return await withFileLock(lockPathFor(getCachePath(currentSource)), async () => {
      const cache = readCache(currentSource);
      if (cache && isCacheValid(cache, pollIntervalMs) && cache.source === currentSource) {
        return getCachedUsageResult(cache);
      }
      if (isMinimax) {
        if (!minimaxApiKey) {
          writeCache({ data: null, error: true, source: "minimax", errorReason: "no_credentials" });
          return { rateLimits: null, error: "no_credentials" };
        }
        return fetchAndCacheUsage({
          source: "minimax",
          fetchFn: () => fetchUsageFromMinimax(minimaxApiKey),
          parseFn: parseMinimaxResponse,
          cache,
          pollIntervalMs
        });
      }
      if (isZai && authToken) {
        return fetchAndCacheUsage({
          source: "zai",
          fetchFn: () => fetchUsageFromZai(),
          parseFn: parseZaiResponse,
          cache,
          pollIntervalMs
        });
      }
      let creds = getCredentials();
      if (creds) {
        if (!validateCredentials(creds)) {
          if (creds.refreshToken) {
            const refreshed = await refreshAccessToken(creds.refreshToken);
            if (refreshed) {
              creds = { ...creds, ...refreshed };
              writeBackCredentials(creds);
            } else {
              writeCache({ data: null, error: true, source: "anthropic", errorReason: "auth" });
              return { rateLimits: null, error: "auth" };
            }
          } else {
            writeCache({ data: null, error: true, source: "anthropic", errorReason: "auth" });
            return { rateLimits: null, error: "auth" };
          }
        }
        const accessToken = creds.accessToken;
        return fetchAndCacheUsage({
          source: "anthropic",
          fetchFn: () => fetchUsageFromApi(accessToken),
          parseFn: parseUsageResponse,
          cache,
          pollIntervalMs
        });
      }
      writeCache({ data: null, error: true, source: "anthropic", errorReason: "no_credentials" });
      return { rateLimits: null, error: "no_credentials" };
    }, USAGE_CACHE_LOCK_OPTS);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Failed to acquire file lock")) {
      if (initialCache?.data) {
        return { rateLimits: initialCache.data, stale: true };
      }
      return { rateLimits: null, error: "network" };
    }
    return { rateLimits: null, error: "network" };
  }
}

// dist/hud/custom-rate-provider.js
import { spawn } from "child_process";
import { existsSync as existsSync9, readFileSync as readFileSync8, writeFileSync as writeFileSync3, mkdirSync as mkdirSync7 } from "fs";
import { join as join9, dirname as dirname5 } from "path";
var CACHE_TTL_MS = 3e4;
var DEFAULT_TIMEOUT_MS = 800;
function getCachePath2() {
  return join9(getClaudeConfigDir(), "plugins", "oh-my-claudecode", ".custom-rate-cache.json");
}
function readCache2() {
  try {
    const p = getCachePath2();
    if (!existsSync9(p))
      return null;
    return JSON.parse(readFileSync8(p, "utf-8"));
  } catch {
    return null;
  }
}
function writeCache2(buckets) {
  try {
    const p = getCachePath2();
    const dir = dirname5(p);
    if (!existsSync9(dir))
      mkdirSync7(dir, { recursive: true });
    const cache = { timestamp: Date.now(), buckets };
    writeFileSync3(p, JSON.stringify(cache, null, 2));
  } catch {
  }
}
function isCacheValid2(cache) {
  return Date.now() - cache.timestamp < CACHE_TTL_MS;
}
function spawnWithTimeout(cmd, timeoutMs) {
  return new Promise((resolve4, reject) => {
    const [executable, ...args] = Array.isArray(cmd) ? cmd : ["sh", "-c", cmd];
    const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
        }
      }, 200);
      reject(new Error(`Custom rate limit command timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (!timedOut) {
        if (code === 0) {
          resolve4(stdout);
        } else {
          reject(new Error(`Command exited with code ${code}`));
        }
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      if (!timedOut)
        reject(err);
    });
  });
}
function parseOutput(raw, periods) {
  let parsed;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || parsed.version !== 1 || !Array.isArray(parsed.buckets)) {
    return null;
  }
  const buckets = parsed.buckets.filter((b) => {
    if (typeof b.id !== "string" || typeof b.label !== "string")
      return false;
    if (!b.usage || typeof b.usage.type !== "string")
      return false;
    const u = b.usage;
    if (u.type === "percent")
      return typeof u.value === "number";
    if (u.type === "credit") {
      return typeof u.used === "number" && typeof u.limit === "number";
    }
    if (u.type === "string")
      return typeof u.value === "string";
    return false;
  });
  if (periods && periods.length > 0) {
    return buckets.filter((b) => periods.includes(b.id));
  }
  return buckets;
}
async function executeCustomProvider(config) {
  const cache = readCache2();
  if (cache && isCacheValid2(cache)) {
    return { buckets: cache.buckets, stale: false };
  }
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const stdout = await spawnWithTimeout(config.command, timeoutMs);
    const buckets = parseOutput(stdout, config.periods);
    if (buckets === null) {
      if (process.env.OMC_DEBUG) {
        console.error("[custom-rate-provider] Invalid output format from command");
      }
      if (cache)
        return { buckets: cache.buckets, stale: true };
      return { buckets: [], stale: false, error: "invalid output" };
    }
    writeCache2(buckets);
    return { buckets, stale: false };
  } catch (err) {
    if (process.env.OMC_DEBUG) {
      console.error("[custom-rate-provider] Command failed:", err instanceof Error ? err.message : err);
    }
    if (cache)
      return { buckets: cache.buckets, stale: true };
    return { buckets: [], stale: false, error: "command failed" };
  }
}

// dist/hud/colors.js
var RESET = "\x1B[0m";
var DIM = "\x1B[2m";
var BOLD = "\x1B[1m";
var RED = "\x1B[31m";
var GREEN = "\x1B[32m";
var YELLOW = "\x1B[33m";
var MAGENTA = "\x1B[35m";
var CYAN = "\x1B[36m";
function green(text) {
  return `${GREEN}${text}${RESET}`;
}
function red(text) {
  return `${RED}${text}${RESET}`;
}
function cyan(text) {
  return `${CYAN}${text}${RESET}`;
}
function dim(text) {
  return `${DIM}${text}${RESET}`;
}
function bold(text) {
  return `${BOLD}${text}${RESET}`;
}
function getModelTierColor(model) {
  if (!model)
    return CYAN;
  const tier = model.toLowerCase();
  if (tier.includes("opus"))
    return MAGENTA;
  if (tier.includes("sonnet"))
    return YELLOW;
  if (tier.includes("haiku"))
    return GREEN;
  return CYAN;
}
function getDurationColor(durationMs) {
  const minutes = durationMs / 6e4;
  if (minutes >= 5)
    return RED;
  if (minutes >= 2)
    return YELLOW;
  return GREEN;
}

// dist/hud/elements/ralph.js
var RED2 = "\x1B[31m";
var YELLOW2 = "\x1B[33m";
var GREEN2 = "\x1B[32m";
function renderRalph(state, thresholds) {
  if (!state?.active) {
    return null;
  }
  const { iteration, maxIterations } = state;
  const warningThreshold = thresholds.ralphWarning;
  const criticalThreshold = Math.floor(maxIterations * 0.9);
  let color;
  if (iteration >= criticalThreshold) {
    color = RED2;
  } else if (iteration >= warningThreshold) {
    color = YELLOW2;
  } else {
    color = GREEN2;
  }
  return `ralph:${color}${iteration}/${maxIterations}${RESET}`;
}

// dist/hud/elements/agents.js
var CYAN2 = "\x1B[36m";
var AGENT_TYPE_CODES = {
  // ============================================================
  // BUILD/ANALYSIS LANE
  // ============================================================
  // Explore - 'E' for Explore (haiku)
  explore: "e",
  // Analyst - 'T' for aTalyst (A taken by Architect)
  analyst: "T",
  // opus
  // Planner - 'P' for Planner
  planner: "P",
  // opus
  // Architect - 'A' for Architect
  architect: "A",
  // opus
  // Debugger - 'g' for debuGger (d taken by designer)
  debugger: "g",
  // sonnet
  // Executor - 'x' for eXecutor (sonnet default, opus for complex tasks)
  executor: "x",
  // sonnet/opus
  // Verifier - 'V' for Verifier (but vision uses 'v'... use uppercase 'V' for governance role)
  verifier: "V",
  // sonnet
  // ============================================================
  // REVIEW LANE
  // ============================================================
  // Style Reviewer - 'Y' for stYle
  "style-reviewer": "y",
  // haiku
  // API Reviewer - 'I' for Interface/API
  "api-reviewer": "i",
  // sonnet
  // Security Reviewer - 'K' for Security (S taken by Scientist)
  "security-reviewer": "K",
  // sonnet
  // Performance Reviewer - 'O' for perfOrmance
  "performance-reviewer": "o",
  // sonnet
  // Code Reviewer - 'R' for Review (uppercase, opus tier)
  "code-reviewer": "R",
  // opus
  // ============================================================
  // DOMAIN SPECIALISTS
  // ============================================================
  // Dependency Expert - 'L' for Library expert
  "dependency-expert": "l",
  // sonnet
  // Test Engineer - 'T' (but analyst uses 'T'... use uppercase 'T')
  "test-engineer": "t",
  // sonnet
  // Quality Strategist - 'Qs' for Quality Strategist (disambiguated from quality-reviewer)
  "quality-strategist": "Qs",
  // sonnet
  // Designer - 'd' for Designer
  designer: "d",
  // sonnet
  // Writer - 'W' for Writer
  writer: "w",
  // haiku
  // QA Tester - 'Q' for QA
  "qa-tester": "q",
  // sonnet
  // Scientist - 'S' for Scientist
  scientist: "s",
  // sonnet
  // Git Master - 'M' for Master
  "git-master": "m",
  // sonnet
  // ============================================================
  // PRODUCT LANE
  // ============================================================
  // Product Manager - 'Pm' for Product Manager (disambiguated from planner)
  "product-manager": "Pm",
  // sonnet
  // UX Researcher - 'u' for Ux
  "ux-researcher": "u",
  // sonnet
  // Information Architect - 'Ia' for Information Architect (disambiguated from api-reviewer)
  "information-architect": "Ia",
  // sonnet
  // Product Analyst - 'a' for analyst
  "product-analyst": "a",
  // sonnet
  // ============================================================
  // COORDINATION
  // ============================================================
  // Critic - 'C' for Critic
  critic: "C",
  // opus
  // Vision - 'V' for Vision (lowercase since sonnet)
  vision: "v",
  // sonnet
  // Document Specialist - 'D' for Document
  "document-specialist": "D",
  // sonnet
  // ============================================================
  // BACKWARD COMPATIBILITY (Deprecated)
  // ============================================================
  // Researcher - 'r' for Researcher (deprecated, points to document-specialist)
  researcher: "r"
  // sonnet
};
function getAgentCode(agentType, model) {
  const parts = agentType.split(":");
  const shortName = parts[parts.length - 1] || agentType;
  let code = AGENT_TYPE_CODES[shortName];
  if (!code) {
    code = shortName.charAt(0).toUpperCase();
  }
  if (model) {
    const tier = model.toLowerCase();
    if (code.length === 1) {
      code = tier.includes("opus") ? code.toUpperCase() : code.toLowerCase();
    } else {
      const first = tier.includes("opus") ? code[0].toUpperCase() : code[0].toLowerCase();
      code = first + code.slice(1);
    }
  }
  return code;
}
function formatDuration(durationMs) {
  const seconds = Math.floor(durationMs / 1e3);
  const minutes = Math.floor(seconds / 60);
  if (seconds < 10) {
    return "";
  } else if (seconds < 60) {
    return `(${seconds}s)`;
  } else if (minutes < 10) {
    return `(${minutes}m)`;
  } else {
    return "!";
  }
}
function renderAgents(agents) {
  const running = agents.filter((a) => a.status === "running").length;
  if (running === 0) {
    return null;
  }
  return `agents:${CYAN2}${running}${RESET}`;
}
function sortByFreshest(agents) {
  return [...agents].sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
}
function renderAgentsCoded(agents) {
  const running = sortByFreshest(agents.filter((a) => a.status === "running"));
  if (running.length === 0) {
    return null;
  }
  const codes = running.map((a) => {
    const code = getAgentCode(a.type, a.model);
    const color = getModelTierColor(a.model);
    return `${color}${code}${RESET}`;
  });
  return `agents:${codes.join("")}`;
}
function renderAgentsCodedWithDuration(agents) {
  const running = sortByFreshest(agents.filter((a) => a.status === "running"));
  if (running.length === 0) {
    return null;
  }
  const now = Date.now();
  const codes = running.map((a) => {
    const code = getAgentCode(a.type, a.model);
    const durationMs = now - a.startTime.getTime();
    const duration = formatDuration(durationMs);
    const modelColor = getModelTierColor(a.model);
    if (duration === "!") {
      const durationColor = getDurationColor(durationMs);
      return `${modelColor}${code}${durationColor}!${RESET}`;
    } else if (duration) {
      return `${modelColor}${code}${dim(duration)}${RESET}`;
    } else {
      return `${modelColor}${code}${RESET}`;
    }
  });
  return `agents:${codes.join("")}`;
}
function renderAgentsDetailed(agents) {
  const running = sortByFreshest(agents.filter((a) => a.status === "running"));
  if (running.length === 0) {
    return null;
  }
  const now = Date.now();
  const names = running.map((a) => {
    const parts = a.type.split(":");
    let name = parts[parts.length - 1] || a.type;
    if (name === "executor")
      name = "exec";
    if (name === "deep-executor")
      name = "exec";
    if (name === "designer")
      name = "design";
    if (name === "qa-tester")
      name = "qa";
    if (name === "scientist")
      name = "sci";
    if (name === "security-reviewer")
      name = "sec";
    if (name === "build-fixer")
      name = "debug";
    if (name === "code-reviewer")
      name = "review";
    if (name === "git-master")
      name = "git";
    if (name === "style-reviewer")
      name = "style";
    if (name === "quality-reviewer")
      name = "review";
    if (name === "api-reviewer")
      name = "api-rev";
    if (name === "performance-reviewer")
      name = "perf";
    if (name === "dependency-expert")
      name = "dep-exp";
    if (name === "document-specialist")
      name = "doc-spec";
    if (name === "test-engineer")
      name = "test-eng";
    if (name === "quality-strategist")
      name = "qs";
    if (name === "debugger")
      name = "debug";
    if (name === "verifier")
      name = "verify";
    if (name === "product-manager")
      name = "pm";
    if (name === "ux-researcher")
      name = "uxr";
    if (name === "information-architect")
      name = "ia";
    if (name === "product-analyst")
      name = "pa";
    const durationMs = now - a.startTime.getTime();
    const duration = formatDuration(durationMs);
    return duration ? `${name}${duration}` : name;
  });
  return `agents:[${CYAN2}${names.join(",")}${RESET}]`;
}
function truncateDescription(desc, maxWidth = 20) {
  if (!desc)
    return "...";
  return truncateToWidth(desc, maxWidth);
}
function getShortAgentName(agentType) {
  const parts = agentType.split(":");
  const name = parts[parts.length - 1] || agentType;
  const abbrevs = {
    // Build/Analysis Lane
    "executor": "exec",
    "deep-executor": "exec",
    // deprecated alias
    "debugger": "debug",
    "verifier": "verify",
    // Review Lane
    "style-reviewer": "style",
    "quality-reviewer": "review",
    // deprecated alias
    "api-reviewer": "api-rev",
    "security-reviewer": "sec",
    "performance-reviewer": "perf",
    "code-reviewer": "review",
    // Domain Specialists
    "dependency-expert": "dep-exp",
    "document-specialist": "doc-spec",
    "test-engineer": "test-eng",
    "quality-strategist": "qs",
    "build-fixer": "debug",
    // deprecated alias
    "designer": "design",
    "qa-tester": "qa",
    "scientist": "sci",
    "git-master": "git",
    // Product Lane
    "product-manager": "pm",
    "ux-researcher": "uxr",
    "information-architect": "ia",
    "product-analyst": "pa",
    // Backward compat
    "researcher": "dep-exp"
  };
  return abbrevs[name] || name;
}
function renderAgentsWithDescriptions(agents) {
  const running = sortByFreshest(agents.filter((a) => a.status === "running"));
  if (running.length === 0) {
    return null;
  }
  const now = Date.now();
  const entries = running.map((a) => {
    const code = getAgentCode(a.type, a.model);
    const color = getModelTierColor(a.model);
    const desc = truncateDescription(a.description, 25);
    const durationMs = now - a.startTime.getTime();
    const duration = formatDuration(durationMs);
    let entry = `${color}${code}${RESET}:${dim(desc)}`;
    if (duration && duration !== "!") {
      entry += dim(duration);
    } else if (duration === "!") {
      const durationColor = getDurationColor(durationMs);
      entry += `${durationColor}!${RESET}`;
    }
    return entry;
  });
  return entries.join(dim(" | "));
}
function renderAgentsDescOnly(agents) {
  const running = sortByFreshest(agents.filter((a) => a.status === "running"));
  if (running.length === 0) {
    return null;
  }
  const now = Date.now();
  const descriptions = running.map((a) => {
    const color = getModelTierColor(a.model);
    const shortName = getShortAgentName(a.type);
    const desc = a.description ? truncateDescription(a.description, 20) : shortName;
    const durationMs = now - a.startTime.getTime();
    const duration = formatDuration(durationMs);
    if (duration === "!") {
      const durationColor = getDurationColor(durationMs);
      return `${color}${desc}${durationColor}!${RESET}`;
    } else if (duration) {
      return `${color}${desc}${dim(duration)}${RESET}`;
    }
    return `${color}${desc}${RESET}`;
  });
  return `[${descriptions.join(dim(", "))}]`;
}
function formatDurationPadded(durationMs) {
  const seconds = Math.floor(durationMs / 1e3);
  const minutes = Math.floor(seconds / 60);
  if (seconds < 10) {
    return "    ";
  } else if (seconds < 60) {
    return `${seconds}s`.padStart(4);
  } else if (minutes < 10) {
    return `${minutes}m`.padStart(4);
  } else {
    return `${minutes}m`.padStart(4);
  }
}
function renderAgentsMultiLine(agents, maxLines = 5) {
  const running = sortByFreshest(agents.filter((a) => a.status === "running"));
  if (running.length === 0) {
    return { headerPart: null, detailLines: [] };
  }
  const headerPart = `agents:${CYAN2}${running.length}${RESET}`;
  const now = Date.now();
  const detailLines = [];
  const displayCount = Math.min(running.length, maxLines);
  running.slice(0, maxLines).forEach((a, index) => {
    const isLast = index === displayCount - 1 && running.length <= maxLines;
    const prefix = isLast ? "\u2514\u2500" : "\u251C\u2500";
    const code = getAgentCode(a.type, a.model);
    const color = getModelTierColor(a.model);
    const shortName = getShortAgentName(a.type).padEnd(12);
    const durationMs = now - a.startTime.getTime();
    const duration = formatDurationPadded(durationMs);
    const durationColor = getDurationColor(durationMs);
    const desc = a.description || "...";
    const truncatedDesc = truncateToWidth(desc, 45);
    detailLines.push(`${dim(prefix)} ${color}${code}${RESET} ${dim(shortName)}${durationColor}${duration}${RESET}  ${truncatedDesc}`);
  });
  if (running.length > maxLines) {
    const remaining = running.length - maxLines;
    detailLines.push(`${dim(`\u2514\u2500 +${remaining} more agents...`)}`);
  }
  return { headerPart, detailLines };
}
function renderAgentsByFormat(agents, format) {
  switch (format) {
    case "count":
      return renderAgents(agents);
    case "codes":
      return renderAgentsCoded(agents);
    case "codes-duration":
      return renderAgentsCodedWithDuration(agents);
    case "detailed":
      return renderAgentsDetailed(agents);
    case "descriptions":
      return renderAgentsWithDescriptions(agents);
    case "tasks":
      return renderAgentsDescOnly(agents);
    case "multiline":
      return renderAgentsMultiLine(agents).headerPart;
    default:
      return renderAgentsCoded(agents);
  }
}

// dist/hud/elements/todos.js
var GREEN3 = "\x1B[32m";
var YELLOW3 = "\x1B[33m";
var CYAN3 = "\x1B[36m";
var DIM2 = "\x1B[2m";
function renderTodosWithCurrent(todos) {
  if (todos.length === 0) {
    return null;
  }
  const completed = todos.filter((t) => t.status === "completed").length;
  const total = todos.length;
  const inProgress = todos.find((t) => t.status === "in_progress");
  const percent = completed / total * 100;
  let color;
  if (percent >= 80) {
    color = GREEN3;
  } else if (percent >= 50) {
    color = YELLOW3;
  } else {
    color = CYAN3;
  }
  let result = `todos:${color}${completed}/${total}${RESET}`;
  if (inProgress) {
    const activeText = inProgress.activeForm || inProgress.content || "...";
    const truncated = truncateToWidth(activeText, 30);
    result += ` ${DIM2}(working: ${truncated})${RESET}`;
  }
  return result;
}

// dist/hud/elements/skills.js
var MAGENTA2 = "\x1B[35m";
var BRIGHT_MAGENTA = "\x1B[95m";
function truncate(str, maxWidth) {
  return truncateToWidth(str, maxWidth);
}
function getSkillDisplayName(skillName) {
  return skillName.split(":").pop() || skillName;
}
function isActiveMode(skillName, ultrawork, ralph) {
  if (skillName === "ultrawork" && ultrawork?.active)
    return true;
  if (skillName === "ralph" && ralph?.active)
    return true;
  if (skillName === "ultrawork+ralph" && ultrawork?.active && ralph?.active)
    return true;
  return false;
}
function renderSkills(ultrawork, ralph, lastSkill) {
  const parts = [];
  if (ralph?.active && ultrawork?.active) {
    parts.push(`${BRIGHT_MAGENTA}ultrawork+ralph${RESET}`);
  } else if (ultrawork?.active) {
    parts.push(`${MAGENTA2}ultrawork${RESET}`);
  } else if (ralph?.active) {
    parts.push(`${MAGENTA2}ralph${RESET}`);
  }
  if (lastSkill && !isActiveMode(lastSkill.name, ultrawork, ralph)) {
    const argsDisplay = lastSkill.args ? `(${truncate(lastSkill.args, 15)})` : "";
    const displayName = getSkillDisplayName(lastSkill.name);
    parts.push(cyan(`skill:${displayName}${argsDisplay}`));
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
function renderLastSkill(lastSkill) {
  if (!lastSkill)
    return null;
  const argsDisplay = lastSkill.args ? `(${truncate(lastSkill.args, 15)})` : "";
  const displayName = getSkillDisplayName(lastSkill.name);
  return cyan(`skill:${displayName}${argsDisplay}`);
}

// dist/hud/elements/context.js
var GREEN4 = "\x1B[32m";
var YELLOW4 = "\x1B[33m";
var RED3 = "\x1B[31m";
var DIM3 = "\x1B[2m";
var CONTEXT_DISPLAY_HYSTERESIS = 2;
var CONTEXT_DISPLAY_STATE_TTL_MS = 5e3;
var lastDisplayedPercent = null;
var lastDisplayedSeverity = null;
var lastDisplayScope = null;
var lastDisplayUpdatedAt = 0;
function clampContextPercent(percent) {
  return Math.min(100, Math.max(0, Math.round(percent)));
}
function getContextSeverity(safePercent, thresholds) {
  if (safePercent >= thresholds.contextCritical) {
    return "critical";
  }
  if (safePercent >= thresholds.contextCompactSuggestion) {
    return "compact";
  }
  if (safePercent >= thresholds.contextWarning) {
    return "warning";
  }
  return "normal";
}
function getContextDisplayStyle(safePercent, thresholds) {
  const severity = getContextSeverity(safePercent, thresholds);
  switch (severity) {
    case "critical":
      return { color: RED3, suffix: " CRITICAL" };
    case "compact":
      return { color: YELLOW4, suffix: " COMPRESS?" };
    case "warning":
      return { color: YELLOW4, suffix: "" };
    default:
      return { color: GREEN4, suffix: "" };
  }
}
function getStableContextDisplayPercent(percent, thresholds, displayScope) {
  const safePercent = clampContextPercent(percent);
  const severity = getContextSeverity(safePercent, thresholds);
  const nextScope = displayScope ?? null;
  const now = Date.now();
  if (nextScope !== lastDisplayScope) {
    lastDisplayedPercent = null;
    lastDisplayedSeverity = null;
    lastDisplayScope = nextScope;
  }
  if (lastDisplayedPercent === null || lastDisplayedSeverity === null || now - lastDisplayUpdatedAt > CONTEXT_DISPLAY_STATE_TTL_MS) {
    lastDisplayedPercent = safePercent;
    lastDisplayedSeverity = severity;
    lastDisplayUpdatedAt = now;
    return safePercent;
  }
  if (severity !== lastDisplayedSeverity) {
    lastDisplayedPercent = safePercent;
    lastDisplayedSeverity = severity;
    lastDisplayUpdatedAt = now;
    return safePercent;
  }
  if (Math.abs(safePercent - lastDisplayedPercent) <= CONTEXT_DISPLAY_HYSTERESIS) {
    lastDisplayUpdatedAt = now;
    return lastDisplayedPercent;
  }
  lastDisplayedPercent = safePercent;
  lastDisplayedSeverity = severity;
  lastDisplayUpdatedAt = now;
  return safePercent;
}
function renderContext(percent, thresholds, displayScope) {
  const safePercent = getStableContextDisplayPercent(percent, thresholds, displayScope);
  const { color, suffix } = getContextDisplayStyle(safePercent, thresholds);
  return `ctx:${color}${safePercent}%${suffix}${RESET}`;
}
function renderContextWithBar(percent, thresholds, barWidth = 10, displayScope) {
  const safePercent = getStableContextDisplayPercent(percent, thresholds, displayScope);
  const filled = Math.round(safePercent / 100 * barWidth);
  const empty = barWidth - filled;
  const { color, suffix } = getContextDisplayStyle(safePercent, thresholds);
  const bar = `${color}${"\u2588".repeat(filled)}${DIM3}${"\u2591".repeat(empty)}${RESET}`;
  return `ctx:[${bar}]${color}${safePercent}%${suffix}${RESET}`;
}

// dist/hud/elements/background.js
var CYAN4 = "\x1B[36m";
var GREEN5 = "\x1B[32m";
var YELLOW5 = "\x1B[33m";
var MAX_CONCURRENT = 5;
function renderBackground(tasks) {
  const running = tasks.filter((t) => t.status === "running").length;
  if (running === 0) {
    return null;
  }
  let color;
  if (running >= MAX_CONCURRENT) {
    color = YELLOW5;
  } else if (running >= MAX_CONCURRENT - 1) {
    color = CYAN4;
  } else {
    color = GREEN5;
  }
  return `bg:${color}${running}/${MAX_CONCURRENT}${RESET}`;
}

// dist/hud/elements/prd.js
var CYAN5 = "\x1B[36m";
var GREEN6 = "\x1B[32m";
function renderPrd(state) {
  if (!state) {
    return null;
  }
  const { currentStoryId, completed, total } = state;
  if (completed === total) {
    return `${GREEN6}PRD:done${RESET}`;
  }
  if (currentStoryId) {
    return `${CYAN5}${currentStoryId}${RESET}`;
  }
  return null;
}

// dist/hud/elements/limits.js
var GREEN7 = "\x1B[32m";
var YELLOW6 = "\x1B[33m";
var RED4 = "\x1B[31m";
var DIM4 = "\x1B[2m";
var WARNING_THRESHOLD = 70;
var CRITICAL_THRESHOLD = 90;
function getColor(percent) {
  if (percent >= CRITICAL_THRESHOLD) {
    return RED4;
  } else if (percent >= WARNING_THRESHOLD) {
    return YELLOW6;
  }
  return GREEN7;
}
function formatResetTime(date) {
  if (!date)
    return null;
  const now = Date.now();
  const resetMs = date.getTime();
  const diffMs = resetMs - now;
  if (diffMs <= 0)
    return null;
  const diffMinutes = Math.floor(diffMs / 6e4);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 0) {
    const remainingHours = diffHours % 24;
    return `${diffDays}d${remainingHours}h`;
  }
  const remainingMinutes = diffMinutes % 60;
  return `${diffHours}h${remainingMinutes}m`;
}
function renderRateLimits(limits, stale) {
  if (!limits)
    return null;
  const staleMarker = stale ? `${DIM4}*${RESET}` : "";
  const resetPrefix = stale ? "~" : "";
  const fiveHour = Math.min(100, Math.max(0, Math.round(limits.fiveHourPercent)));
  const fiveHourColor = getColor(fiveHour);
  const fiveHourReset = formatResetTime(limits.fiveHourResetsAt);
  const fiveHourPart = fiveHourReset ? `5h:${fiveHourColor}${fiveHour}%${RESET}${staleMarker}${DIM4}(${resetPrefix}${fiveHourReset})${RESET}` : `5h:${fiveHourColor}${fiveHour}%${RESET}${staleMarker}`;
  const parts = [fiveHourPart];
  if (limits.weeklyPercent != null) {
    const weekly = Math.min(100, Math.max(0, Math.round(limits.weeklyPercent)));
    const weeklyColor = getColor(weekly);
    const weeklyReset = formatResetTime(limits.weeklyResetsAt);
    const weeklyPart = weeklyReset ? `${DIM4}wk:${RESET}${weeklyColor}${weekly}%${RESET}${staleMarker}${DIM4}(${resetPrefix}${weeklyReset})${RESET}` : `${DIM4}wk:${RESET}${weeklyColor}${weekly}%${RESET}${staleMarker}`;
    parts.push(weeklyPart);
  }
  if (limits.monthlyPercent != null) {
    const monthly = Math.min(100, Math.max(0, Math.round(limits.monthlyPercent)));
    const monthlyColor = getColor(monthly);
    const monthlyReset = formatResetTime(limits.monthlyResetsAt);
    const monthlyPart = monthlyReset ? `${DIM4}mo:${RESET}${monthlyColor}${monthly}%${RESET}${staleMarker}${DIM4}(${resetPrefix}${monthlyReset})${RESET}` : `${DIM4}mo:${RESET}${monthlyColor}${monthly}%${RESET}${staleMarker}`;
    parts.push(monthlyPart);
  }
  if (limits.sonnetWeeklyPercent != null) {
    const sonnet = Math.min(100, Math.max(0, Math.round(limits.sonnetWeeklyPercent)));
    const sonnetColor = getColor(sonnet);
    const sonnetReset = formatResetTime(limits.sonnetWeeklyResetsAt);
    const sonnetPart = sonnetReset ? `${DIM4}sn:${RESET}${sonnetColor}${sonnet}%${RESET}${staleMarker}${DIM4}(${resetPrefix}${sonnetReset})${RESET}` : `${DIM4}sn:${RESET}${sonnetColor}${sonnet}%${RESET}${staleMarker}`;
    parts.push(sonnetPart);
  }
  if (limits.opusWeeklyPercent != null) {
    const opus = Math.min(100, Math.max(0, Math.round(limits.opusWeeklyPercent)));
    const opusColor = getColor(opus);
    const opusReset = formatResetTime(limits.opusWeeklyResetsAt);
    const opusPart = opusReset ? `${DIM4}op:${RESET}${opusColor}${opus}%${RESET}${staleMarker}${DIM4}(${resetPrefix}${opusReset})${RESET}` : `${DIM4}op:${RESET}${opusColor}${opus}%${RESET}${staleMarker}`;
    parts.push(opusPart);
  }
  if (limits.extraUsagePercent != null && limits.extraUsageLimitUsd != null) {
    const extra = Math.min(100, Math.max(0, Math.round(limits.extraUsagePercent)));
    const extraColor = getColor(extra);
    const extraReset = formatResetTime(limits.extraUsageResetsAt);
    const dollarPart = `${DIM4}($${(limits.extraUsageSpentUsd ?? 0).toFixed(2)}/$${limits.extraUsageLimitUsd.toFixed(2)})${RESET}`;
    const extraPart = extraReset ? `${DIM4}extra:${RESET}${extraColor}${extra}%${RESET}${staleMarker}${dollarPart}${DIM4}(${resetPrefix}${extraReset})${RESET}` : `${DIM4}extra:${RESET}${extraColor}${extra}%${RESET}${staleMarker}${dollarPart}`;
    parts.push(extraPart);
  }
  return parts.join(" ");
}
function renderRateLimitsWithBar(limits, barWidth = 8, stale) {
  if (!limits)
    return null;
  const staleMarker = stale ? `${DIM4}*${RESET}` : "";
  const resetPrefix = stale ? "~" : "";
  const fiveHour = Math.min(100, Math.max(0, Math.round(limits.fiveHourPercent)));
  const fiveHourColor = getColor(fiveHour);
  const fiveHourFilled = Math.round(fiveHour / 100 * barWidth);
  const fiveHourEmpty = barWidth - fiveHourFilled;
  const fiveHourBar = `${fiveHourColor}${"\u2588".repeat(fiveHourFilled)}${DIM4}${"\u2591".repeat(fiveHourEmpty)}${RESET}`;
  const fiveHourReset = formatResetTime(limits.fiveHourResetsAt);
  const fiveHourPart = fiveHourReset ? `5h:[${fiveHourBar}]${fiveHourColor}${fiveHour}%${RESET}${staleMarker}${DIM4}(${resetPrefix}${fiveHourReset})${RESET}` : `5h:[${fiveHourBar}]${fiveHourColor}${fiveHour}%${RESET}${staleMarker}`;
  const parts = [fiveHourPart];
  if (limits.weeklyPercent != null) {
    const weekly = Math.min(100, Math.max(0, Math.round(limits.weeklyPercent)));
    const weeklyColor = getColor(weekly);
    const weeklyFilled = Math.round(weekly / 100 * barWidth);
    const weeklyEmpty = barWidth - weeklyFilled;
    const weeklyBar = `${weeklyColor}${"\u2588".repeat(weeklyFilled)}${DIM4}${"\u2591".repeat(weeklyEmpty)}${RESET}`;
    const weeklyReset = formatResetTime(limits.weeklyResetsAt);
    const weeklyPart = weeklyReset ? `${DIM4}wk:${RESET}[${weeklyBar}]${weeklyColor}${weekly}%${RESET}${staleMarker}${DIM4}(${resetPrefix}${weeklyReset})${RESET}` : `${DIM4}wk:${RESET}[${weeklyBar}]${weeklyColor}${weekly}%${RESET}${staleMarker}`;
    parts.push(weeklyPart);
  }
  if (limits.monthlyPercent != null) {
    const monthly = Math.min(100, Math.max(0, Math.round(limits.monthlyPercent)));
    const monthlyColor = getColor(monthly);
    const monthlyFilled = Math.round(monthly / 100 * barWidth);
    const monthlyEmpty = barWidth - monthlyFilled;
    const monthlyBar = `${monthlyColor}${"\u2588".repeat(monthlyFilled)}${DIM4}${"\u2591".repeat(monthlyEmpty)}${RESET}`;
    const monthlyReset = formatResetTime(limits.monthlyResetsAt);
    const monthlyPart = monthlyReset ? `${DIM4}mo:${RESET}[${monthlyBar}]${monthlyColor}${monthly}%${RESET}${staleMarker}${DIM4}(${resetPrefix}${monthlyReset})${RESET}` : `${DIM4}mo:${RESET}[${monthlyBar}]${monthlyColor}${monthly}%${RESET}${staleMarker}`;
    parts.push(monthlyPart);
  }
  if (limits.sonnetWeeklyPercent != null) {
    const sonnet = Math.min(100, Math.max(0, Math.round(limits.sonnetWeeklyPercent)));
    const sonnetColor = getColor(sonnet);
    const sonnetFilled = Math.round(sonnet / 100 * barWidth);
    const sonnetEmpty = barWidth - sonnetFilled;
    const sonnetBar = `${sonnetColor}${"\u2588".repeat(sonnetFilled)}${DIM4}${"\u2591".repeat(sonnetEmpty)}${RESET}`;
    const sonnetReset = formatResetTime(limits.sonnetWeeklyResetsAt);
    const sonnetPart = sonnetReset ? `${DIM4}sn:${RESET}[${sonnetBar}]${sonnetColor}${sonnet}%${RESET}${staleMarker}${DIM4}(${resetPrefix}${sonnetReset})${RESET}` : `${DIM4}sn:${RESET}[${sonnetBar}]${sonnetColor}${sonnet}%${RESET}${staleMarker}`;
    parts.push(sonnetPart);
  }
  if (limits.opusWeeklyPercent != null) {
    const opus = Math.min(100, Math.max(0, Math.round(limits.opusWeeklyPercent)));
    const opusColor = getColor(opus);
    const opusFilled = Math.round(opus / 100 * barWidth);
    const opusEmpty = barWidth - opusFilled;
    const opusBar = `${opusColor}${"\u2588".repeat(opusFilled)}${DIM4}${"\u2591".repeat(opusEmpty)}${RESET}`;
    const opusReset = formatResetTime(limits.opusWeeklyResetsAt);
    const opusPart = opusReset ? `${DIM4}op:${RESET}[${opusBar}]${opusColor}${opus}%${RESET}${staleMarker}${DIM4}(${resetPrefix}${opusReset})${RESET}` : `${DIM4}op:${RESET}[${opusBar}]${opusColor}${opus}%${RESET}${staleMarker}`;
    parts.push(opusPart);
  }
  if (limits.extraUsagePercent != null && limits.extraUsageLimitUsd != null) {
    const extra = Math.min(100, Math.max(0, Math.round(limits.extraUsagePercent)));
    const extraColor = getColor(extra);
    const extraFilled = Math.round(extra / 100 * barWidth);
    const extraEmpty = barWidth - extraFilled;
    const extraBar = `${extraColor}${"\u2588".repeat(extraFilled)}${DIM4}${"\u2591".repeat(extraEmpty)}${RESET}`;
    const extraReset = formatResetTime(limits.extraUsageResetsAt);
    const dollarPart = `${DIM4}($${(limits.extraUsageSpentUsd ?? 0).toFixed(2)}/$${limits.extraUsageLimitUsd.toFixed(2)})${RESET}`;
    const extraPart = extraReset ? `${DIM4}extra:${RESET}[${extraBar}]${extraColor}${extra}%${RESET}${staleMarker}${dollarPart}${DIM4}(${resetPrefix}${extraReset})${RESET}` : `${DIM4}extra:${RESET}[${extraBar}]${extraColor}${extra}%${RESET}${staleMarker}${dollarPart}`;
    parts.push(extraPart);
  }
  return parts.join(" ");
}
function renderRateLimitsError(result) {
  if (!result?.error)
    return null;
  if (result.error === "no_credentials")
    return null;
  if (result.error === "rate_limited") {
    return result.rateLimits ? null : `${DIM4}[API 429]${RESET}`;
  }
  if (result.error === "auth")
    return `${YELLOW6}[API auth]${RESET}`;
  return `${YELLOW6}[API err]${RESET}`;
}
function bucketUsagePercent(usage) {
  if (usage.type === "percent")
    return usage.value;
  if (usage.type === "credit" && usage.limit > 0)
    return usage.used / usage.limit * 100;
  return null;
}
function renderBucketUsageValue(usage) {
  if (usage.type === "percent")
    return `${Math.round(usage.value)}%`;
  if (usage.type === "credit")
    return `${usage.used}/${usage.limit}`;
  return usage.value;
}
function renderCustomBuckets(result, thresholdPercent = 85) {
  if (result.error && result.buckets.length === 0) {
    return `${YELLOW6}[cmd:err]${RESET}`;
  }
  if (result.buckets.length === 0)
    return null;
  const staleMarker = result.stale ? `${DIM4}*${RESET}` : "";
  const parts = result.buckets.map((bucket) => {
    const pct = bucketUsagePercent(bucket.usage);
    const color = pct != null ? getColor(pct) : "";
    const colorReset = pct != null ? RESET : "";
    const usageStr = renderBucketUsageValue(bucket.usage);
    let resetPart = "";
    if (bucket.resetsAt && pct != null && pct >= thresholdPercent) {
      const d = new Date(bucket.resetsAt);
      if (!isNaN(d.getTime())) {
        const str = formatResetTime(d);
        if (str)
          resetPart = `${DIM4}(${str})${RESET}`;
      }
    }
    return `${DIM4}${bucket.label}:${RESET}${color}${usageStr}${colorReset}${staleMarker}${resetPart}`;
  });
  return parts.join(" ");
}

// dist/hud/elements/permission.js
var YELLOW7 = "\x1B[33m";
var DIM5 = "\x1B[2m";
function renderPermission(pending) {
  if (!pending)
    return null;
  return `${YELLOW7}APPROVE?${RESET} ${DIM5}${pending.toolName.toLowerCase()}${RESET}:${pending.targetSummary}`;
}

// dist/hud/elements/thinking.js
var CYAN6 = "\x1B[36m";
function renderThinking(state, format = "text") {
  if (!state?.active)
    return null;
  switch (format) {
    case "bubble":
      return "\u{1F4AD}";
    case "brain":
      return "\u{1F9E0}";
    case "face":
      return "\u{1F914}";
    case "text":
      return `${CYAN6}thinking${RESET}`;
    default:
      return "\u{1F4AD}";
  }
}

// dist/hud/elements/session.js
var GREEN8 = "\x1B[32m";
var YELLOW8 = "\x1B[33m";
var RED5 = "\x1B[31m";
function renderSession(session) {
  if (!session)
    return null;
  const color = session.health === "critical" ? RED5 : session.health === "warning" ? YELLOW8 : GREEN8;
  return `session:${color}${session.durationMinutes}m${RESET}`;
}

// dist/cli/utils/formatting.js
function formatTokenCount(tokens) {
  if (tokens < 1e3)
    return `${tokens}`;
  if (tokens < 1e6)
    return `${(tokens / 1e3).toFixed(1)}k`;
  return `${(tokens / 1e6).toFixed(2)}M`;
}

// dist/hud/elements/token-usage.js
function renderTokenUsage(usage, sessionTotalTokens) {
  if (!usage)
    return null;
  const hasUsage = usage.inputTokens > 0 || usage.outputTokens > 0;
  if (!hasUsage)
    return null;
  const parts = [
    `tok:i${formatTokenCount(usage.inputTokens)}/o${formatTokenCount(usage.outputTokens)}`
  ];
  if (usage.reasoningTokens && usage.reasoningTokens > 0) {
    parts.push(`r${formatTokenCount(usage.reasoningTokens)}`);
  }
  if (sessionTotalTokens && sessionTotalTokens > 0) {
    parts.push(`s${formatTokenCount(sessionTotalTokens)}`);
  }
  return parts.join(" ");
}

// dist/hud/elements/prompt-time.js
function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1e3);
  if (totalSeconds < 60)
    return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60)
    return `${totalMinutes}m${totalSeconds % 60}s`;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h${totalMinutes % 60}m`;
}
function renderPromptTime(promptTime, now) {
  if (!promptTime)
    return null;
  if (now) {
    const elapsed = now.getTime() - promptTime.getTime();
    if (elapsed >= 0) {
      return `${dim("\u23F1")}${formatElapsed(elapsed)}`;
    }
  }
  const hours = String(promptTime.getHours()).padStart(2, "0");
  const minutes = String(promptTime.getMinutes()).padStart(2, "0");
  const seconds = String(promptTime.getSeconds()).padStart(2, "0");
  return `${dim("prompt:")}${hours}:${minutes}:${seconds}`;
}

// dist/hud/elements/autopilot.js
var CYAN7 = "\x1B[36m";
var GREEN9 = "\x1B[32m";
var YELLOW9 = "\x1B[33m";
var RED6 = "\x1B[31m";
var MAGENTA3 = "\x1B[35m";
var PHASE_NAMES = {
  expansion: "Expand",
  planning: "Plan",
  execution: "Build",
  qa: "QA",
  validation: "Verify",
  complete: "Done",
  failed: "Failed"
};
var PHASE_INDEX = {
  expansion: 1,
  planning: 2,
  execution: 3,
  qa: 4,
  validation: 5,
  complete: 5,
  failed: 0
};
function renderAutopilot(state, _thresholds) {
  if (!state?.active) {
    return null;
  }
  const { phase, iteration, maxIterations, tasksCompleted, tasksTotal, filesCreated } = state;
  const phaseNum = PHASE_INDEX[phase] || 0;
  const phaseName = PHASE_NAMES[phase] || phase;
  let phaseColor;
  switch (phase) {
    case "complete":
      phaseColor = GREEN9;
      break;
    case "failed":
      phaseColor = RED6;
      break;
    case "validation":
      phaseColor = MAGENTA3;
      break;
    case "qa":
      phaseColor = YELLOW9;
      break;
    default:
      phaseColor = CYAN7;
  }
  let output = `${CYAN7}[AUTOPILOT]${RESET} Phase ${phaseColor}${phaseNum}/5${RESET}: ${phaseName}`;
  if (iteration > 1) {
    output += ` (iter ${iteration}/${maxIterations})`;
  }
  if (phase === "execution" && tasksTotal && tasksTotal > 0) {
    const taskColor = tasksCompleted === tasksTotal ? GREEN9 : YELLOW9;
    output += ` | Tasks: ${taskColor}${tasksCompleted || 0}/${tasksTotal}${RESET}`;
  }
  if (filesCreated && filesCreated > 0) {
    output += ` | ${filesCreated} files`;
  }
  return output;
}

// dist/hud/elements/cwd.js
import { homedir as homedir3 } from "node:os";
import { basename as basename4, dirname as dirname6, join as join10 } from "node:path";
function osc8Link(url, text) {
  return `\x1B]8;;${url}\x1B\\${text}\x1B]8;;\x1B\\`;
}
function pathToFileUrl(absPath) {
  const normalized = absPath.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${normalized}`;
  }
  return `file://${normalized}`;
}
function renderCwd(cwd, format = "relative", useHyperlinks = false) {
  if (!cwd)
    return null;
  let displayPath;
  switch (format) {
    case "relative": {
      const home = homedir3();
      displayPath = cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd;
      break;
    }
    case "absolute":
      displayPath = cwd;
      break;
    case "folder": {
      const parent = basename4(dirname6(cwd));
      const folder = basename4(cwd);
      displayPath = parent ? join10(parent, folder) : folder;
      break;
    }
    default:
      displayPath = cwd;
  }
  const rendered = `${dim(displayPath)}`;
  if (useHyperlinks) {
    const url = pathToFileUrl(cwd);
    return osc8Link(url, rendered);
  }
  return rendered;
}

// dist/hud/elements/hostname.js
import { hostname } from "node:os";
function renderHostname() {
  const full = hostname();
  if (!full)
    return null;
  const short = full.split(".")[0];
  if (!short)
    return null;
  return cyan(`host:${short}`);
}

// dist/hud/elements/git.js
import { execSync as execSync2 } from "node:child_process";
import { realpathSync as realpathSync2 } from "node:fs";
import { resolve as resolve2, basename as basename5 } from "node:path";
var CACHE_TTL_MS2 = 3e4;
var repoCache = /* @__PURE__ */ new Map();
var branchCache = /* @__PURE__ */ new Map();
var worktreeCache = /* @__PURE__ */ new Map();
var statusCache = /* @__PURE__ */ new Map();
function getGitRepoName(cwd) {
  const key = cwd ? resolve2(cwd) : process.cwd();
  const cached = repoCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }
  let result = null;
  try {
    const url = execSync2("git remote get-url origin", {
      cwd,
      encoding: "utf-8",
      timeout: 1e3,
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32" ? "cmd.exe" : void 0
    }).trim();
    if (!url) {
      result = null;
    } else {
      const match = url.match(/\/([^/]+?)(?:\.git)?$/) || url.match(/:([^/]+?)(?:\.git)?$/);
      result = match ? match[1].replace(/\.git$/, "") : null;
    }
  } catch {
    result = null;
  }
  repoCache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS2 });
  return result;
}
function getGitBranch(cwd) {
  const key = cwd ? resolve2(cwd) : process.cwd();
  const cached = branchCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }
  let result = null;
  try {
    const branch = execSync2("git branch --show-current", {
      cwd,
      encoding: "utf-8",
      timeout: 1e3,
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32" ? "cmd.exe" : void 0
    }).trim();
    result = branch || null;
  } catch {
    result = null;
  }
  branchCache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS2 });
  return result;
}
function getWorktreeInfo(cwd) {
  const key = cwd ? resolve2(cwd) : process.cwd();
  const cached = worktreeCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }
  const execOpts = {
    cwd,
    encoding: "utf-8",
    timeout: 1e3,
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32" ? "cmd.exe" : void 0
  };
  let result = { isWorktree: false, worktreeName: null };
  try {
    const gitDir = execSync2("git rev-parse --git-dir", execOpts).trim();
    const gitCommonDir = execSync2("git rev-parse --git-common-dir", execOpts).trim();
    let resolvedGitDir = resolve2(key, gitDir);
    let resolvedCommonDir = resolve2(key, gitCommonDir);
    try {
      resolvedGitDir = realpathSync2(resolvedGitDir);
    } catch {
    }
    try {
      resolvedCommonDir = realpathSync2(resolvedCommonDir);
    } catch {
    }
    if (resolvedGitDir !== resolvedCommonDir) {
      result = { isWorktree: true, worktreeName: basename5(resolvedGitDir) };
    }
  } catch {
  }
  worktreeCache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS2 });
  return result;
}
function renderGitRepo(cwd) {
  const repo = getGitRepoName(cwd);
  if (!repo)
    return null;
  return `${dim("repo:")}${cyan(repo)}`;
}
function renderGitBranch(cwd) {
  const branch = getGitBranch(cwd);
  if (!branch)
    return null;
  const wtInfo = getWorktreeInfo(cwd);
  if (wtInfo.isWorktree && wtInfo.worktreeName) {
    return `${dim("branch:")}${cyan(branch)} ${dim("(wt:")}${cyan(wtInfo.worktreeName)}${dim(")")}`;
  }
  return `${dim("branch:")}${cyan(branch)}`;
}
function getGitStatusCounts(cwd) {
  const key = cwd ? resolve2(cwd) : process.cwd();
  const cached = statusCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }
  let result = null;
  try {
    const output = execSync2("git --no-optional-locks status --porcelain -b", {
      cwd,
      encoding: "utf-8",
      timeout: 1e3,
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32" ? "cmd.exe" : void 0
    }).trim();
    let staged = 0, modified = 0, untracked = 0, ahead = 0, behind = 0;
    if (output) {
      const lines = output.split("\n");
      const branchLine = lines[0];
      const aheadMatch = branchLine.match(/\bahead (\d+)/);
      const behindMatch = branchLine.match(/\bbehind (\d+)/);
      if (aheadMatch)
        ahead = parseInt(aheadMatch[1], 10);
      if (behindMatch)
        behind = parseInt(behindMatch[1], 10);
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line || line.length < 2)
          continue;
        const idx = line[0];
        const wt = line[1];
        if (idx === "?") {
          untracked++;
        } else {
          if (idx !== " " && idx !== "?")
            staged++;
          if (wt === "M" || wt === "D")
            modified++;
        }
      }
    }
    result = { staged, modified, untracked, ahead, behind };
  } catch {
    result = null;
  }
  statusCache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS2 });
  return result;
}
function renderGitStatus(cwd) {
  const counts = getGitStatusCounts(cwd);
  if (!counts)
    return null;
  const { staged, modified, untracked, ahead, behind } = counts;
  if (staged === 0 && modified === 0 && untracked === 0 && ahead === 0 && behind === 0) {
    return null;
  }
  const parts = [];
  if (staged > 0)
    parts.push(`${green("+")}${staged}`);
  if (modified > 0)
    parts.push(`${red("!")}${modified}`);
  if (untracked > 0)
    parts.push(`${cyan("?")}${untracked}`);
  if (ahead > 0)
    parts.push(`${green("\u21E1")}${ahead}`);
  if (behind > 0)
    parts.push(`${red("\u21E3")}${behind}`);
  return parts.join(" ");
}

// dist/hud/elements/model.js
function extractVersion(modelId) {
  const idMatch = modelId.match(/(?:opus|sonnet|haiku)-(\d+)-(\d+)/i);
  if (idMatch)
    return `${idMatch[1]}.${idMatch[2]}`;
  const displayMatch = modelId.match(/(?:opus|sonnet|haiku)\s+(\d+(?:\.\d+)?)/i);
  if (displayMatch)
    return displayMatch[1];
  return null;
}
function formatModelName(modelId, format = "short") {
  if (!modelId)
    return null;
  if (format === "full") {
    return truncateToWidth(modelId, 40);
  }
  const id = modelId.toLowerCase();
  let shortName = null;
  if (id.includes("opus"))
    shortName = "Opus";
  else if (id.includes("sonnet"))
    shortName = "Sonnet";
  else if (id.includes("haiku"))
    shortName = "Haiku";
  if (!shortName) {
    return truncateToWidth(modelId, 20);
  }
  if (format === "versioned") {
    const version = extractVersion(id);
    if (version)
      return `${shortName} ${version}`;
  }
  return shortName;
}
function renderModel(modelId, format = "short") {
  const name = formatModelName(modelId, format);
  if (!name)
    return null;
  return cyan(name);
}

// dist/hud/elements/api-key-source.js
import { existsSync as existsSync10, readFileSync as readFileSync9 } from "fs";
import { join as join11 } from "path";
function settingsFileHasApiKey(filePath) {
  try {
    if (!existsSync10(filePath))
      return false;
    const content = readFileSync9(filePath, "utf-8");
    const settings = JSON.parse(content);
    const env = settings?.env;
    if (typeof env !== "object" || env === null)
      return false;
    return "ANTHROPIC_API_KEY" in env;
  } catch {
    return false;
  }
}
function detectApiKeySource(cwd) {
  if (cwd) {
    const projectSettings = join11(cwd, ".claude", "settings.local.json");
    if (settingsFileHasApiKey(projectSettings))
      return "project";
  }
  const globalSettings = join11(getClaudeConfigDir(), "settings.json");
  if (settingsFileHasApiKey(globalSettings))
    return "global";
  if (process.env.ANTHROPIC_API_KEY)
    return "env";
  return null;
}
function renderApiKeySource(source) {
  if (!source)
    return null;
  return `${dim("key:")}${cyan(source)}`;
}

// dist/hud/elements/call-counts.js
function shouldUseAscii(format = "auto") {
  if (format === "ascii")
    return true;
  if (format === "emoji")
    return false;
  return process.platform === "win32" || isWSL();
}
function getIcons(format = "auto") {
  const useAscii = shouldUseAscii(format);
  return {
    tool: useAscii ? "T:" : "\u{1F527}",
    agent: useAscii ? "A:" : "\u{1F916}",
    skill: useAscii ? "S:" : "\u26A1"
  };
}
function renderCallCounts(toolCalls, agentInvocations, skillUsages, format = "auto") {
  const parts = [];
  const icons = getIcons(format);
  if (toolCalls > 0) {
    parts.push(`${icons.tool}${toolCalls}`);
  }
  if (agentInvocations > 0) {
    parts.push(`${icons.agent}${agentInvocations}`);
  }
  if (skillUsages > 0) {
    parts.push(`${icons.skill}${skillUsages}`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

// dist/hud/elements/context-warning.js
var YELLOW10 = "\x1B[33m";
var RED7 = "\x1B[31m";
var BOLD2 = "\x1B[1m";
function renderContextLimitWarning(contextPercent, threshold, autoCompact) {
  const safePercent = Math.min(100, Math.max(0, Math.round(contextPercent)));
  if (safePercent < threshold) {
    return null;
  }
  const isCritical = safePercent >= 90;
  const color = isCritical ? RED7 : YELLOW10;
  const icon = isCritical ? "!!" : "!";
  const action = autoCompact ? "(auto-compact queued)" : "run /compact";
  return `${color}${BOLD2}[${icon}] ctx ${safePercent}% >= ${threshold}% threshold - ${action}${RESET}`;
}

// dist/hud/elements/session-summary.js
function renderSessionSummary(summaryState) {
  if (!summaryState?.summary)
    return null;
  return dim("summary:") + summaryState.summary;
}

// dist/hud/elements/last-tool.js
function renderLastTool(lastToolName) {
  if (!lastToolName)
    return null;
  return `${dim("tool:")}${lastToolName}`;
}

// dist/hud/render.js
var ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/;
var PLAIN_SEPARATOR = " | ";
var DIM_SEPARATOR = dim(PLAIN_SEPARATOR);
function buildMainElementOrder(elementOrder) {
  if (!Array.isArray(elementOrder) || elementOrder.length === 0) {
    return DEFAULT_ELEMENT_ORDER.main;
  }
  const known = new Set(DEFAULT_ELEMENT_ORDER.main);
  const seen = /* @__PURE__ */ new Set();
  const configured = elementOrder.filter((name) => {
    if (!known.has(name) || seen.has(name)) {
      return false;
    }
    seen.add(name);
    return true;
  });
  const remaining = DEFAULT_ELEMENT_ORDER.main.filter((name) => !configured.includes(name));
  return [...configured, ...remaining];
}
function truncateLineToMaxWidth(line, maxWidth) {
  if (maxWidth <= 0)
    return "";
  if (stringWidth(line) <= maxWidth)
    return line;
  const ELLIPSIS = "...";
  const ellipsisWidth = 3;
  const targetWidth = Math.max(0, maxWidth - ellipsisWidth);
  let visibleWidth = 0;
  let result = "";
  let hasAnsi = false;
  let i = 0;
  while (i < line.length) {
    const remaining = line.slice(i);
    const ansiMatch = remaining.match(ANSI_REGEX);
    if (ansiMatch && ansiMatch.index === 0) {
      result += ansiMatch[0];
      hasAnsi = true;
      i += ansiMatch[0].length;
      continue;
    }
    const codePoint = line.codePointAt(i);
    const codeUnits = codePoint > 65535 ? 2 : 1;
    const char = line.slice(i, i + codeUnits);
    const charWidth = getCharWidth(char);
    if (visibleWidth + charWidth > targetWidth)
      break;
    result += char;
    visibleWidth += charWidth;
    i += codeUnits;
  }
  const reset = hasAnsi ? "\x1B[0m" : "";
  return result + reset + ELLIPSIS;
}
function wrapLineToMaxWidth(line, maxWidth) {
  if (maxWidth <= 0)
    return [""];
  if (stringWidth(line) <= maxWidth)
    return [line];
  const separator = line.includes(DIM_SEPARATOR) ? DIM_SEPARATOR : line.includes(PLAIN_SEPARATOR) ? PLAIN_SEPARATOR : null;
  if (!separator) {
    return [truncateLineToMaxWidth(line, maxWidth)];
  }
  const segments = line.split(separator);
  if (segments.length <= 1) {
    return [truncateLineToMaxWidth(line, maxWidth)];
  }
  const wrapped = [];
  let current = segments[0] ?? "";
  for (let i = 1; i < segments.length; i += 1) {
    const nextSegment = segments[i] ?? "";
    const candidate = `${current}${separator}${nextSegment}`;
    if (stringWidth(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (stringWidth(current) > maxWidth) {
      wrapped.push(truncateLineToMaxWidth(current, maxWidth));
    } else {
      wrapped.push(current);
    }
    current = nextSegment;
  }
  if (stringWidth(current) > maxWidth) {
    wrapped.push(truncateLineToMaxWidth(current, maxWidth));
  } else {
    wrapped.push(current);
  }
  return wrapped;
}
function applyMaxWidthByMode(lines, maxWidth, wrapMode) {
  if (!maxWidth || maxWidth <= 0)
    return lines;
  if (wrapMode === "wrap") {
    return lines.flatMap((line) => wrapLineToMaxWidth(line, maxWidth));
  }
  return lines.map((line) => truncateLineToMaxWidth(line, maxWidth));
}
function limitOutputLines(lines, maxLines) {
  const limit = Math.max(1, maxLines ?? DEFAULT_HUD_CONFIG.elements.maxOutputLines);
  if (lines.length <= limit) {
    return lines;
  }
  const truncatedCount = lines.length - limit + 1;
  return [...lines.slice(0, limit - 1), `... (+${truncatedCount} lines)`];
}
async function render(context, config) {
  const { elements: enabledElements } = config;
  const rendered = /* @__PURE__ */ new Map();
  const renderedDetail = /* @__PURE__ */ new Map();
  if (enabledElements.hostname) {
    const hostnameElement = renderHostname();
    if (hostnameElement)
      rendered.set("hostname", hostnameElement);
  }
  if (enabledElements.cwd) {
    const cwdElement = renderCwd(context.cwd, enabledElements.cwdFormat || "relative", enabledElements.useHyperlinks ?? false);
    if (cwdElement)
      rendered.set("cwd", cwdElement);
  }
  if (enabledElements.gitRepo) {
    const gitRepoElement = renderGitRepo(context.cwd);
    if (gitRepoElement)
      rendered.set("gitRepo", gitRepoElement);
  }
  if (enabledElements.gitBranch) {
    const gitBranchElement = renderGitBranch(context.cwd);
    if (gitBranchElement)
      rendered.set("gitBranch", gitBranchElement);
  }
  if (enabledElements.gitStatus) {
    const gitStatusElement = renderGitStatus(context.cwd);
    if (gitStatusElement)
      rendered.set("gitStatus", gitStatusElement);
  }
  if (enabledElements.model && context.modelName) {
    const modelElement = renderModel(context.modelName, enabledElements.modelFormat);
    if (modelElement)
      rendered.set("model", modelElement);
  }
  if (enabledElements.apiKeySource && context.apiKeySource) {
    const keySource = renderApiKeySource(context.apiKeySource);
    if (keySource)
      rendered.set("apiKeySource", keySource);
  }
  if (enabledElements.profile && context.profileName) {
    rendered.set("profile", bold(`profile:${context.profileName}`));
  }
  if (enabledElements.omcLabel) {
    const versionTag = context.omcVersion ? `#${context.omcVersion}` : "";
    if (context.updateAvailable) {
      rendered.set("omcLabel", bold(`[OMC${versionTag}] -> ${context.updateAvailable} omc update`));
    } else {
      rendered.set("omcLabel", bold(`[OMC${versionTag}]`));
    }
  }
  if (enabledElements.rateLimits && context.rateLimitsResult) {
    if (context.rateLimitsResult.rateLimits) {
      const stale = context.rateLimitsResult.stale;
      const limits = enabledElements.useBars ? renderRateLimitsWithBar(context.rateLimitsResult.rateLimits, void 0, stale) : renderRateLimits(context.rateLimitsResult.rateLimits, stale);
      if (limits)
        rendered.set("rateLimits", limits);
    } else {
      const errorIndicator = renderRateLimitsError(context.rateLimitsResult);
      if (errorIndicator)
        rendered.set("rateLimits", errorIndicator);
    }
  }
  if (context.customBuckets) {
    const thresholdPercent = config.rateLimitsProvider?.resetsAtDisplayThresholdPercent;
    const custom = renderCustomBuckets(context.customBuckets, thresholdPercent);
    if (custom)
      rendered.set("customBuckets", custom);
  }
  if (enabledElements.permissionStatus && context.pendingPermission) {
    const permission = renderPermission(context.pendingPermission);
    if (permission)
      rendered.set("permission", permission);
  }
  if (enabledElements.thinking && context.thinkingState) {
    const thinking = renderThinking(context.thinkingState, enabledElements.thinkingFormat);
    if (thinking)
      rendered.set("thinking", thinking);
  }
  if (enabledElements.promptTime) {
    const prompt = renderPromptTime(context.promptTime, /* @__PURE__ */ new Date());
    if (prompt)
      rendered.set("promptTime", prompt);
  }
  if (enabledElements.sessionHealth && context.sessionHealth) {
    const showDuration = enabledElements.showSessionDuration ?? true;
    if (showDuration) {
      const session = renderSession(context.sessionHealth);
      if (session)
        rendered.set("session", session);
    }
  }
  if (enabledElements.showTokens === true) {
    const tokenUsage = renderTokenUsage(context.lastRequestTokenUsage, context.sessionTotalTokens);
    if (tokenUsage)
      rendered.set("tokens", tokenUsage);
  }
  if (enabledElements.ralph && context.ralph) {
    const ralph = renderRalph(context.ralph, config.thresholds);
    if (ralph)
      rendered.set("ralph", ralph);
  }
  if (enabledElements.autopilot && context.autopilot) {
    const autopilot = renderAutopilot(context.autopilot, config.thresholds);
    if (autopilot)
      rendered.set("autopilot", autopilot);
  }
  if (enabledElements.prdStory && context.prd) {
    const prd = renderPrd(context.prd);
    if (prd)
      rendered.set("prd", prd);
  }
  if (enabledElements.activeSkills) {
    const skills = renderSkills(context.ultrawork, context.ralph, enabledElements.lastSkill ?? true ? context.lastSkill : null);
    if (skills)
      rendered.set("skills", skills);
  }
  if ((enabledElements.lastSkill ?? true) && !enabledElements.activeSkills) {
    const lastSkillElement = renderLastSkill(context.lastSkill);
    if (lastSkillElement)
      rendered.set("lastSkill", lastSkillElement);
  }
  if (enabledElements.contextBar) {
    const ctx = enabledElements.useBars ? renderContextWithBar(context.contextPercent, config.thresholds, 10, context.contextDisplayScope) : renderContext(context.contextPercent, config.thresholds, context.contextDisplayScope);
    if (ctx)
      rendered.set("contextBar", ctx);
  }
  if (enabledElements.agents) {
    const format = enabledElements.agentsFormat || "codes";
    if (format === "multiline") {
      const maxLines = enabledElements.agentsMaxLines || 5;
      const result = renderAgentsMultiLine(context.activeAgents, maxLines);
      if (result.headerPart)
        rendered.set("agents", result.headerPart);
      if (result.detailLines.length > 0) {
        renderedDetail.set("agents", result.detailLines);
      }
    } else {
      const agents = renderAgentsByFormat(context.activeAgents, format);
      if (agents)
        rendered.set("agents", agents);
    }
  }
  if (enabledElements.backgroundTasks) {
    const bg = renderBackground(context.backgroundTasks);
    if (bg)
      rendered.set("background", bg);
  }
  const showCounts = enabledElements.showCallCounts ?? true;
  if (showCounts) {
    const counts = renderCallCounts(context.toolCallCount, context.agentCallCount, context.skillCallCount, enabledElements.callCountsFormat ?? "auto");
    if (counts)
      rendered.set("callCounts", counts);
  }
  if (enabledElements.showLastTool === true) {
    const tool = renderLastTool(context.lastToolName ?? null);
    if (tool)
      rendered.set("lastTool", tool);
  }
  if (enabledElements.sessionSummary && context.sessionSummary) {
    const summary = renderSessionSummary(context.sessionSummary);
    if (summary)
      rendered.set("sessionSummary", summary);
  }
  if (context.missionBoard && (config.missionBoard?.enabled ?? config.elements.missionBoard ?? false)) {
    const mbLines = renderMissionBoard(context.missionBoard, config.missionBoard);
    if (mbLines.length > 0)
      renderedDetail.set("missionBoard", mbLines);
  }
  const ctxWarning = renderContextLimitWarning(context.contextPercent, config.contextLimitWarning.threshold, config.contextLimitWarning.autoCompact);
  if (ctxWarning)
    renderedDetail.set("contextWarning", [ctxWarning]);
  if (enabledElements.todos) {
    const todos = renderTodosWithCurrent(context.todos);
    if (todos)
      renderedDetail.set("todos", [todos]);
  }
  const safeArray = (v, fallback) => Array.isArray(v) ? v : fallback;
  const effectiveLayout = {
    line1: safeArray(config.layout?.line1, DEFAULT_ELEMENT_ORDER.line1),
    // `layout.main` remains the advanced authoritative layout control.
    // `elementOrder` is a narrow convenience alias for the main HUD line only.
    main: safeArray(config.layout?.main, buildMainElementOrder(config.elementOrder)),
    detail: safeArray(config.layout?.detail, DEFAULT_ELEMENT_ORDER.detail)
  };
  function collectInline(order) {
    const result = [];
    for (const name of order) {
      const el = rendered.get(name);
      if (el) {
        result.push(el);
      } else {
        const lines = renderedDetail.get(name);
        if (lines && lines.length > 0)
          result.push(lines.join(" "));
      }
    }
    return result;
  }
  function collectDetailLines(order) {
    const result = [];
    for (const name of order) {
      const lines = renderedDetail.get(name);
      if (lines)
        result.push(...lines);
      if (!lines) {
        const inline = rendered.get(name);
        if (inline)
          result.push(inline);
      }
    }
    return result;
  }
  const gitElements = collectInline(effectiveLayout.line1);
  const elements = collectInline(effectiveLayout.main);
  const detailLines = collectDetailLines(effectiveLayout.detail);
  const outputLines = [];
  const gitInfoLine = gitElements.length > 0 ? gitElements.join(dim(PLAIN_SEPARATOR)) : null;
  const headerLine = elements.length > 0 ? elements.join(dim(PLAIN_SEPARATOR)) : null;
  const gitPosition = config.elements.gitInfoPosition ?? "above";
  if (gitPosition === "above") {
    if (gitInfoLine) {
      outputLines.push(gitInfoLine);
    }
    if (headerLine) {
      outputLines.push(headerLine);
    }
  } else {
    if (headerLine) {
      outputLines.push(headerLine);
    }
    if (gitInfoLine) {
      outputLines.push(gitInfoLine);
    }
  }
  const widthAdjustedLines = applyMaxWidthByMode([...outputLines, ...detailLines], config.maxWidth, config.wrapMode);
  const limitedLines = limitOutputLines(widthAdjustedLines, config.elements.maxOutputLines);
  const finalLines = config.maxWidth && config.maxWidth > 0 ? limitedLines.map((line) => truncateLineToMaxWidth(line, config.maxWidth)) : limitedLines;
  return finalLines.join("\n");
}

// dist/hud/sanitize.js
var CSI_NON_SGR_REGEX = /\x1b\[\??[0-9;]*[A-LN-Za-ln-z]/g;
var OSC_REGEX = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
var SIMPLE_ESC_REGEX = /\x1b[^[\]]/g;
function stripAnsi2(text) {
  return text.replace(CSI_NON_SGR_REGEX, "").replace(OSC_REGEX, "").replace(SIMPLE_ESC_REGEX, "");
}
function replaceUnicodeBlocks(text) {
  return text.replace(/█/g, "#").replace(/░/g, "-").replace(/▓/g, "=").replace(/▒/g, "-");
}
function sanitizeOutput(output) {
  let sanitized = stripAnsi2(output);
  sanitized = replaceUnicodeBlocks(sanitized);
  const lines = sanitized.split("\n").map((line) => line.trimEnd());
  sanitized = lines.join("\n");
  sanitized = sanitized.replace(/^\n+|\n+$/g, "");
  return sanitized;
}

// dist/lib/version.js
import { readFileSync as readFileSync10 } from "fs";
import { join as join12, dirname as dirname7 } from "path";
import { fileURLToPath } from "url";
function getRuntimePackageVersion() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname2 = dirname7(__filename);
    for (let i = 0; i < 5; i++) {
      const candidate = join12(__dirname2, ...Array(i + 1).fill(".."), "package.json");
      try {
        const pkg = JSON.parse(readFileSync10(candidate, "utf-8"));
        if (pkg.name && pkg.version) {
          return pkg.version;
        }
      } catch {
        continue;
      }
    }
  } catch {
  }
  try {
    const __filename = fileURLToPath(import.meta.url);
    const pathMatch = __filename.match(/oh-my-claudecode\/(\d+\.\d+\.\d+[^/]*)\//);
    if (pathMatch?.[1]) {
      return pathMatch[1];
    }
  } catch {
  }
  return "unknown";
}

// dist/features/auto-update.js
import { readFileSync as readFileSync16, writeFileSync as writeFileSync6, existsSync as existsSync17, mkdirSync as mkdirSync10 } from "fs";
import { join as join19, dirname as dirname11 } from "path";
import { execSync as execSync5, execFileSync as execFileSync3 } from "child_process";

// dist/installer/index.js
import { existsSync as existsSync15, mkdirSync as mkdirSync9, writeFileSync as writeFileSync5, readFileSync as readFileSync14, copyFileSync, chmodSync, readdirSync as readdirSync6, cpSync, unlinkSync as unlinkSync6, rmSync as rmSync2, realpathSync as realpathSync3 } from "fs";
import { join as join17, dirname as dirname10, resolve as resolve3 } from "path";
import { fileURLToPath as fileURLToPath3 } from "url";
import { homedir as homedir8 } from "os";
import { execSync as execSync4 } from "child_process";

// dist/installer/hooks.js
import { join as join13, dirname as dirname8 } from "path";
import { readFileSync as readFileSync11, existsSync as existsSync11 } from "fs";
import { fileURLToPath as fileURLToPath2 } from "url";
import { homedir as homedir4 } from "os";
function getPackageDir() {
  if (typeof __dirname !== "undefined") {
    return join13(__dirname, "..");
  }
  try {
    const __filename = fileURLToPath2(import.meta.url);
    const __dirname2 = dirname8(__filename);
    return join13(__dirname2, "..", "..");
  } catch {
    return process.cwd();
  }
}
function loadTemplate(filename) {
  const templatePath = join13(getPackageDir(), "templates", "hooks", filename);
  if (!existsSync11(templatePath)) {
    return "";
  }
  return readFileSync11(templatePath, "utf-8");
}
function isWindows() {
  return process.platform === "win32";
}
function normalizePath(value) {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}
function isDefaultClaudeConfigDir() {
  return normalizePath(getClaudeConfigDir()) === normalizePath(join13(homedir4(), ".claude"));
}
function quoteCommandPath(path4) {
  return `"${path4.replace(/"/g, '\\"')}"`;
}
function buildHookCommand(filename) {
  if (isWindows()) {
    if (isDefaultClaudeConfigDir()) {
      return `node "\${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/${filename}"`;
    }
    return `node ${quoteCommandPath(join13(getClaudeConfigDir(), "hooks", filename).replace(/\\/g, "/"))}`;
  }
  if (isDefaultClaudeConfigDir()) {
    return `node "\${CLAUDE_CONFIG_DIR:-$HOME/.claude}/hooks/${filename}"`;
  }
  return `node ${quoteCommandPath(join13(getClaudeConfigDir(), "hooks", filename).replace(/\\/g, "/"))}`;
}
var KEYWORD_DETECTOR_SCRIPT_NODE = loadTemplate("keyword-detector.mjs");
var STOP_CONTINUATION_SCRIPT_NODE = loadTemplate("stop-continuation.mjs");
var PERSISTENT_MODE_SCRIPT_NODE = loadTemplate("persistent-mode.mjs");
var CODE_SIMPLIFIER_SCRIPT_NODE = loadTemplate("code-simplifier.mjs");
var SESSION_START_SCRIPT_NODE = loadTemplate("session-start.mjs");
var POST_TOOL_USE_SCRIPT_NODE = loadTemplate("post-tool-use.mjs");
var HOOKS_SETTINGS_CONFIG_NODE = {
  hooks: {
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: "command",
            command: buildHookCommand("keyword-detector.mjs")
          }
        ]
      }
    ],
    SessionStart: [
      {
        hooks: [
          {
            type: "command",
            command: buildHookCommand("session-start.mjs")
          }
        ]
      }
    ],
    PreToolUse: [
      {
        hooks: [
          {
            type: "command",
            command: buildHookCommand("pre-tool-use.mjs")
          }
        ]
      }
    ],
    PostToolUse: [
      {
        hooks: [
          {
            type: "command",
            command: buildHookCommand("post-tool-use.mjs")
          }
        ]
      }
    ],
    PostToolUseFailure: [
      {
        hooks: [
          {
            type: "command",
            command: buildHookCommand("post-tool-use-failure.mjs")
          }
        ]
      }
    ],
    Stop: [
      {
        hooks: [
          {
            type: "command",
            command: buildHookCommand("persistent-mode.mjs")
          }
        ]
      },
      {
        hooks: [
          {
            type: "command",
            command: buildHookCommand("code-simplifier.mjs")
          }
        ]
      }
    ]
  }
};

// dist/utils/resolve-node.js
import { existsSync as existsSync12, readdirSync as readdirSync4 } from "fs";
import { execSync as execSync3 } from "child_process";
import { join as join14 } from "path";
import { homedir as homedir5 } from "os";

// dist/installer/mcp-registry.js
import { existsSync as existsSync14, mkdirSync as mkdirSync8, readFileSync as readFileSync13, writeFileSync as writeFileSync4 } from "fs";
import { homedir as homedir7 } from "os";
import { dirname as dirname9, join as join16 } from "path";

// dist/utils/paths.js
import { join as join15 } from "path";
import { existsSync as existsSync13, readFileSync as readFileSync12, readdirSync as readdirSync5, statSync as statSync4, unlinkSync as unlinkSync5, rmSync, symlinkSync } from "fs";
import { homedir as homedir6 } from "os";
var STALE_THRESHOLD_MS = 24 * 60 * 60 * 1e3;

// dist/lib/paths.js
var OMC_PLUGIN_MARKETPLACE_SLUG = "omc";
var OMC_PLUGIN_PACKAGE_NAME = "oh-my-claudecode";
var OMC_PLUGIN_CACHE_REL = `plugins/cache/${OMC_PLUGIN_MARKETPLACE_SLUG}/${OMC_PLUGIN_PACKAGE_NAME}`;
var OMC_PLUGIN_MARKETPLACE_REL = `plugins/marketplaces/${OMC_PLUGIN_MARKETPLACE_SLUG}`;
var OMC_CONFIG_FILE_REL = ".omc-config.json";

// dist/installer/index.js
var CLAUDE_CONFIG_DIR = getClaudeConfigDir();
var AGENTS_DIR = join17(CLAUDE_CONFIG_DIR, "agents");
var COMMANDS_DIR = join17(CLAUDE_CONFIG_DIR, "commands");
var SKILLS_DIR = join17(CLAUDE_CONFIG_DIR, "skills");
var HOOKS_DIR = join17(CLAUDE_CONFIG_DIR, "hooks");
var HUD_DIR = join17(CLAUDE_CONFIG_DIR, "hud");
var SETTINGS_FILE = join17(CLAUDE_CONFIG_DIR, "settings.json");
var VERSION_FILE = join17(CLAUDE_CONFIG_DIR, ".omc-version.json");
var VERSION = getRuntimePackageVersion();

// dist/lib/security-config.js
import { existsSync as existsSync16, readFileSync as readFileSync15 } from "fs";
import { join as join18 } from "path";

// dist/features/auto-update.js
var REPO_OWNER = "Yeachan-Heo";
var REPO_NAME = "oh-my-claudecode";
var GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
var GITHUB_RAW_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}`;
var CLAUDE_CONFIG_DIR2 = getClaudeConfigDir();
var VERSION_FILE2 = join19(CLAUDE_CONFIG_DIR2, ".omc-version.json");
var CONFIG_FILE = join19(CLAUDE_CONFIG_DIR2, OMC_CONFIG_FILE_REL);
function compareVersions(a, b) {
  const cleanA = a.replace(/^v/, "");
  const cleanB = b.replace(/^v/, "");
  const partsA = cleanA.split(".").map((n) => parseInt(n, 10) || 0);
  const partsB = cleanB.split(".").map((n) => parseInt(n, 10) || 0);
  const maxLength = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxLength; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB)
      return -1;
    if (numA > numB)
      return 1;
  }
  return 0;
}
var SILENT_UPDATE_STATE_FILE = join19(CLAUDE_CONFIG_DIR2, ".omc-silent-update.json");

// dist/hud/index.js
import { writeFileSync as writeFileSync7, mkdirSync as mkdirSync11, existsSync as existsSync18, readFileSync as readFileSync17 } from "fs";
import { access as access2, readFile as readFile3 } from "fs/promises";
import { join as join20, basename as basename6, dirname as dirname12 } from "path";
import { homedir as homedir9 } from "os";
import { spawn as spawn2 } from "child_process";
import { fileURLToPath as fileURLToPath4 } from "url";
function extractSessionIdFromPath(transcriptPath) {
  if (!transcriptPath)
    return null;
  const match = transcriptPath.match(/([0-9a-f-]{36})(?:\.jsonl)?$/i);
  return match ? match[1] : null;
}
function readSessionSummary(stateDir, sessionId) {
  const statePath = join20(stateDir, `session-summary-${sessionId}.json`);
  if (!existsSync18(statePath))
    return null;
  try {
    return JSON.parse(readFileSync17(statePath, "utf-8"));
  } catch {
    return null;
  }
}
var lastSummarySpawnTimestamp = 0;
var summaryProcessPid = null;
function _resetSummarySpawnTimestamp() {
  lastSummarySpawnTimestamp = 0;
  summaryProcessPid = null;
}
function _getSummaryProcessPid() {
  return summaryProcessPid;
}
function spawnSessionSummaryScript(transcriptPath, stateDir, sessionId) {
  if (summaryProcessPid !== null) {
    try {
      process.kill(summaryProcessPid, 0);
      return;
    } catch {
      summaryProcessPid = null;
    }
  }
  const now = Date.now();
  if (now - lastSummarySpawnTimestamp < 12e4) {
    return;
  }
  lastSummarySpawnTimestamp = now;
  const thisDir = dirname12(fileURLToPath4(import.meta.url));
  const scriptPath = join20(thisDir, "..", "..", "scripts", "session-summary.mjs");
  if (!existsSync18(scriptPath)) {
    if (process.env.OMC_DEBUG) {
      console.error("[HUD] session-summary script not found:", scriptPath);
    }
    return;
  }
  try {
    const child = spawn2("node", [scriptPath, transcriptPath, stateDir, sessionId], {
      stdio: "ignore",
      detached: true,
      env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: "session-summary" }
    });
    summaryProcessPid = child.pid ?? null;
    child.unref();
  } catch (error) {
    summaryProcessPid = null;
    if (process.env.OMC_DEBUG) {
      console.error("[HUD] Failed to spawn session-summary:", error instanceof Error ? error.message : error);
    }
  }
}
async function calculateSessionHealth(sessionStart, contextPercent) {
  const durationMs = sessionStart ? Date.now() - sessionStart.getTime() : 0;
  const durationMinutes = Math.floor(durationMs / 6e4);
  let health = "healthy";
  if (durationMinutes > 120 || contextPercent > 85)
    health = "critical";
  else if (durationMinutes > 60 || contextPercent > 70)
    health = "warning";
  return { durationMinutes, messageCount: 0, health };
}
function showDiagnostic() {
  const version = getRuntimePackageVersion();
  const configDir = getClaudeConfigDir();
  const hudScript = join20(configDir, "hud", "omc-hud.mjs");
  const settingsFile = join20(configDir, "settings.json");
  const hudExists = existsSync18(hudScript);
  let statusLineOk = false;
  try {
    const settings = JSON.parse(readFileSync17(settingsFile, "utf-8"));
    const sl = settings.statusLine;
    if (sl && typeof sl === "object" && typeof sl.command === "string") {
      statusLineOk = sl.command.includes("omc-hud");
    } else if (typeof sl === "string") {
      statusLineOk = sl.includes("omc-hud");
    }
  } catch {
  }
  const config = readHudConfig();
  const preset = config.preset ?? "focused";
  console.log(`[OMC] HUD v${version} | preset: ${preset}`);
  console.log(`  HUD script:  ${hudExists ? "installed" : "MISSING"}`);
  console.log(`  statusLine:  ${statusLineOk ? "configured" : "NOT configured"}`);
  if (!hudExists || !statusLineOk) {
    console.log("  Run /oh-my-claudecode:hud setup to fix.");
  } else {
    console.log("  HUD renders automatically inside Claude Code sessions.");
  }
}
async function main(watchMode = false, skipInit = false) {
  try {
    const previousStdinCache = readStdinCache();
    let stdin = await readStdin();
    if (stdin) {
      stdin = stabilizeContextPercent(stdin, previousStdinCache);
      writeStdinCache(stdin);
    } else if (watchMode) {
      stdin = previousStdinCache;
      if (!stdin) {
        console.log("[OMC] Starting...");
        return;
      }
    } else {
      showDiagnostic();
      return;
    }
    const cwd = resolveToWorktreeRoot(stdin.cwd || void 0);
    const config = { ...readHudConfig() };
    if (config.maxWidth === void 0) {
      const cols = process.stderr.columns || process.stdout.columns || parseInt(process.env.COLUMNS ?? "0", 10) || 0;
      if (cols > 0) {
        config.maxWidth = cols;
        if (config.wrapMode === "truncate")
          config.wrapMode = "wrap";
      }
    }
    const resolvedTranscriptPath = resolveTranscriptPath(stdin.transcript_path, cwd);
    const transcriptData = await parseTranscript(resolvedTranscriptPath, {
      staleTaskThresholdMinutes: config.staleTaskThresholdMinutes
    });
    const currentSessionId = extractSessionIdFromPath(resolvedTranscriptPath ?? stdin.transcript_path ?? "");
    if (!skipInit) {
      await initializeHUDState(cwd, currentSessionId ?? void 0);
    }
    const ralph = readRalphStateForHud(cwd, currentSessionId ?? void 0);
    const ultrawork = readUltraworkStateForHud(cwd, currentSessionId ?? void 0);
    const prd = readPrdStateForHud(cwd);
    const autopilot = readAutopilotStateForHud(cwd, currentSessionId ?? void 0);
    const hudState = readHudState(cwd, currentSessionId ?? void 0);
    const _backgroundTasks = hudState?.backgroundTasks || [];
    let sessionStart = transcriptData.sessionStart;
    const sameSession = hudState?.sessionId === currentSessionId;
    if (sameSession && hudState?.sessionStartTimestamp) {
      const persisted = new Date(hudState.sessionStartTimestamp);
      if (!isNaN(persisted.getTime())) {
        sessionStart = persisted;
      }
    } else if (sessionStart) {
      const stateToWrite = hudState || {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        backgroundTasks: []
      };
      stateToWrite.sessionStartTimestamp = sessionStart.toISOString();
      stateToWrite.sessionId = currentSessionId ?? void 0;
      stateToWrite.timestamp = (/* @__PURE__ */ new Date()).toISOString();
      writeHudState(stateToWrite, cwd, currentSessionId ?? void 0);
    }
    const stdinRateLimits = getRateLimitsFromStdin(stdin);
    const rateLimitsResult = config.elements.rateLimits === false ? null : stdinRateLimits ? { rateLimits: stdinRateLimits } : await getUsage();
    const customBuckets = config.rateLimitsProvider?.type === "custom" ? await executeCustomProvider(config.rateLimitsProvider) : null;
    let omcVersion = null;
    let updateAvailable = null;
    try {
      omcVersion = getRuntimePackageVersion();
      if (omcVersion === "unknown")
        omcVersion = null;
    } catch (error) {
      if (process.env.OMC_DEBUG) {
        console.error("[HUD] Version detection error:", error instanceof Error ? error.message : error);
      }
    }
    try {
      const updateCacheFile = join20(homedir9(), ".omc", "update-check.json");
      await access2(updateCacheFile);
      const content = await readFile3(updateCacheFile, "utf-8");
      const cached = JSON.parse(content);
      if (cached?.latestVersion && omcVersion && compareVersions(omcVersion, cached.latestVersion) < 0) {
        updateAvailable = cached.latestVersion;
      }
    } catch (error) {
      if (process.env.OMC_DEBUG) {
        console.error("[HUD] Update cache read error:", error instanceof Error ? error.message : error);
      }
    }
    let sessionSummary = null;
    const sessionSummaryEnabled = config.elements.sessionSummary ?? false;
    if (sessionSummaryEnabled && resolvedTranscriptPath && currentSessionId) {
      const omcStateDir = join20(getOmcRoot(cwd), "state");
      sessionSummary = readSessionSummary(omcStateDir, currentSessionId);
      const shouldSpawn = !sessionSummary?.generatedAt || Date.now() - new Date(sessionSummary.generatedAt).getTime() > 6e4;
      if (shouldSpawn) {
        spawnSessionSummaryScript(resolvedTranscriptPath, omcStateDir, currentSessionId);
      }
    }
    const missionBoardEnabled = config.missionBoard?.enabled ?? config.elements.missionBoard ?? false;
    const missionBoard = missionBoardEnabled ? await refreshMissionBoardState(cwd, config.missionBoard) : null;
    const contextPercent = getContextPercent(stdin);
    const context = {
      contextPercent,
      contextDisplayScope: currentSessionId ?? cwd,
      modelName: getModelName(stdin),
      ralph,
      ultrawork,
      prd,
      autopilot,
      activeAgents: transcriptData.agents.filter((a) => a.status === "running"),
      todos: transcriptData.todos,
      backgroundTasks: getRunningTasks(hudState),
      cwd,
      missionBoard,
      lastSkill: transcriptData.lastActivatedSkill || null,
      rateLimitsResult,
      customBuckets,
      pendingPermission: transcriptData.pendingPermission || null,
      thinkingState: transcriptData.thinkingState || null,
      sessionHealth: await calculateSessionHealth(sessionStart, contextPercent),
      lastRequestTokenUsage: transcriptData.lastRequestTokenUsage || null,
      sessionTotalTokens: transcriptData.sessionTotalTokens ?? null,
      omcVersion,
      updateAvailable,
      toolCallCount: transcriptData.toolCallCount,
      agentCallCount: transcriptData.agentCallCount,
      skillCallCount: transcriptData.skillCallCount,
      promptTime: hudState?.lastPromptTimestamp ? new Date(hudState.lastPromptTimestamp) : null,
      apiKeySource: config.elements.apiKeySource ? detectApiKeySource(cwd) : null,
      profileName: process.env.CLAUDE_CONFIG_DIR ? basename6(process.env.CLAUDE_CONFIG_DIR).replace(/^\./, "") : null,
      sessionSummary,
      lastToolName: transcriptData.lastToolName
    };
    if (process.env.OMC_DEBUG) {
      console.error("[HUD DEBUG] stdin.context_window:", JSON.stringify(stdin.context_window));
      console.error("[HUD DEBUG] sessionHealth:", JSON.stringify(context.sessionHealth));
    }
    if (config.contextLimitWarning.autoCompact && context.contextPercent >= config.contextLimitWarning.threshold) {
      try {
        const omcStateDir = join20(getOmcRoot(cwd), "state");
        mkdirSync11(omcStateDir, { recursive: true });
        const triggerFile = join20(omcStateDir, "compact-requested.json");
        writeFileSync7(triggerFile, JSON.stringify({
          requestedAt: (/* @__PURE__ */ new Date()).toISOString(),
          contextPercent: context.contextPercent,
          threshold: config.contextLimitWarning.threshold
        }));
      } catch (error) {
        if (process.env.OMC_DEBUG) {
          console.error("[HUD] Auto-compact trigger write error:", error instanceof Error ? error.message : error);
        }
      }
    }
    let output = await render(context, config);
    const useSafeMode = config.elements.safeMode !== false && (config.elements.safeMode || process.platform === "win32");
    if (useSafeMode) {
      output = sanitizeOutput(output);
      console.log(output);
    } else {
      const formattedOutput = output.replace(/ /g, "\xA0");
      console.log(formattedOutput);
    }
  } catch (error) {
    const isInstallError = error instanceof Error && (error.message.includes("ENOENT") || error.message.includes("MODULE_NOT_FOUND") || error.message.includes("Cannot find module"));
    if (isInstallError) {
      console.log("[OMC] run /omc-setup to install properly");
    } else {
      console.log("[OMC] HUD error - check stderr");
      console.error("[OMC HUD Error]", error instanceof Error ? error.message : error);
    }
  }
}
main();
export {
  _getSummaryProcessPid,
  _resetSummarySpawnTimestamp,
  main
};
