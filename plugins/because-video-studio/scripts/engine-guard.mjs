#!/usr/bin/env node
// PreToolUse hook (Bash / PowerShell). Inside the studio workspace, every video is built by the engine its brief names:
//   engine: seek-t        the studio engine (default)
//   engine: hyperframes   only when the person asked for HyperFrames
// Remotion is left out (a company licence is needed above 3 employees). Outside the workspace this hook does nothing,
// so people's other projects are never policed. Exit 2 blocks the command and tells Claude why.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname, isAbsolute, relative } from 'node:path';
import { homedir } from 'node:os';

let input = '';
for await (const chunk of process.stdin) input += chunk;
let cmd = '', cwd = process.cwd();
try { const j = JSON.parse(input); cmd = j.tool_input?.command ?? ''; cwd = j.cwd ?? cwd; } catch { process.exit(0); }

const CONFIG = process.env.BVS_CONFIG ?? join(homedir(), '.because-video-studio', 'config.json');   // BVS_CONFIG: tests only
let ws;
try { ws = resolve(JSON.parse(readFileSync(CONFIG, 'utf8')).workspace); } catch { process.exit(0); }
const inside = (p) => { const r = relative(ws, resolve(cwd, p)); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };

// paths the command mentions (quoted or bare), plus where it runs
const paths = [cwd, ...[...cmd.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]).filter((t) => /[\/\\]/.test(t))];
if (!paths.some(inside)) process.exit(0);

const block = (msg) => { process.stderr.write(`[because-video-studio] ${msg}\n`); process.exit(2); };

if (/\bremotion\b/i.test(cmd) && /\b(npx|render|studio|bunx|pnpm|npm)\b/i.test(cmd))
  block('Remotion is left out of Because Video Studio (it needs a paid company licence for a team this size). Build with the studio engine, or with HyperFrames if the person asked for it.');

if (/\bhyperframes\b/i.test(cmd)) {
  if (/\bhyperframes(@[\w.]+)?\s+(skills|doctor|docs|upgrade|--version|-v|--help|-h)\b/i.test(cmd)) process.exit(0);
  // the brief of the video this command touches: walk up from each mentioned path
  const engines = new Set();
  for (const p of paths.filter(inside)) {
    let d = resolve(cwd, p);
    for (let i = 0; i < 6 && inside(d); i++, d = dirname(d)) {
      const b = join(d, 'brief.md');
      if (existsSync(b)) { const m = readFileSync(b, 'utf8').match(/^\s*-?\s*engine:\s*([\w-]+)/mi); engines.add(m ? m[1].toLowerCase() : 'seek-t'); break; }
    }
  }
  if (!engines.has('hyperframes'))
    block('This video is built with the studio engine (its brief says engine: seek-t, or has no engine line). Use HyperFrames only when the person asked for it: then set "engine: hyperframes" in the video\'s brief.md and tell them our detailed checks only partly apply.');
}
process.exit(0);
