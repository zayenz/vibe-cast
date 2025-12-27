import { execSync } from 'node:child_process';

// Usage: node scripts/kill-port.mjs 1420
const port = process.argv[2];
if (!port) process.exit(0);

function tryExec(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

// macOS/Linux: lsof
const pids = tryExec(`lsof -ti tcp:${port}`) || tryExec(`lsof -ti :${port}`);
if (!pids) process.exit(0);

for (const pid of pids.split('\n').map(s => s.trim()).filter(Boolean)) {
  try {
    process.kill(Number(pid), 'SIGTERM');
  } catch {
    // ignore
  }
}



