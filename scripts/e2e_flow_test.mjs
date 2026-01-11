import { spawn, execSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { existsSync } from 'node:fs';

const API_BASE = 'http://localhost:8080';
const APP_PATH = './src-tauri/target/release/bundle/macos/VibeCast.app/Contents/MacOS/vibe_cast';

async function sendCommand(command, payload) {
    console.log(`sending command: ${command}`, JSON.stringify(payload));
    const res = await fetch(`${API_BASE}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, payload })
    });
    if (!res.ok) throw new Error(`Command ${command} failed: ${res.statusText}`);
}

async function getReport() {
    // Trigger report generation
    await sendCommand('report-status', null);
    
    // Give it a moment to process and update state
    await setTimeout(500);
    
    const res = await fetch(`${API_BASE}/api/e2e/last-report`);
    if (!res.ok) throw new Error(`Failed to get report: ${res.statusText}`);
    const text = await res.text();
    // Check if it's JSON and not the HTML fallback
    if (!text.startsWith('{')) return null;
    return JSON.parse(text);
}

async function waitForCondition(description, checkFn, timeoutMs = 15000) {
    console.log(`Waiting for: ${description}...`);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            if (await checkFn()) {
                console.log(`✅ ${description} - PASS`);
                return;
            }
        } catch (e) {
            console.log(`Check failed: ${e.message}`);
        }
        await setTimeout(1000);
    }
    throw new Error(`Timeout waiting for: ${description}`);
}

async function main() {
  console.log('🚀 Starting E2E Flow Test...');

  if (!existsSync(APP_PATH)) {
    console.error(`❌ App binary not found at ${APP_PATH}`);
    process.exit(1);
  }

  // Cleanup
  console.log('Cleaning up ports...');
  try { execSync('node scripts/kill-port.mjs 8080'); } catch { /* ignore */ }

  // Launch App
  console.log('Launching app...');
  const appProcess = spawn(APP_PATH, [], { 
    stdio: 'inherit',
    detached: false 
  });
  
  const cleanup = () => {
    console.log('Cleaning up...');
    try { process.kill(appProcess.pid); } catch { /* ignore */ }
    try { execSync('node scripts/kill-port.mjs 8080'); } catch { /* ignore */ }
  };
  
  process.on('SIGINT', () => { cleanup(); process.exit(); });

  try {
    // Wait for server
    console.log('Waiting for API server...');
    let connected = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`${API_BASE}/api/status`);
        if (res.ok) {
          connected = true;
          break;
        }
      } catch { /* ignore */ }
      await setTimeout(1000);
    }

    if (!connected) throw new Error('Server failed to start');
    console.log('✅ Server is online');

    await setTimeout(5000); // Give frontend time to hydrate

    // 1. Verify Initial State (Fireplace)
    await waitForCondition('Initial state is fireplace', async () => {
        const report = await getReport();
        console.log('Current report:', report);
        return report && report.activeVisualization === 'fireplace';
    });

    // 2. Switch to Techno
    console.log('Switching to techno...');
    await sendCommand('set-active-visualization', 'techno');
    
    await waitForCondition('State changed to techno', async () => {
        const report = await getReport();
        console.log('Current report:', report);
        return report && report.activeVisualization === 'techno';
    });

    // 3. Trigger Message
    console.log('Triggering message...');
    const msgId = 'e2e-test-msg-' + Date.now();
    await sendCommand('trigger-message', {
        id: msgId,
        text: 'E2E Flow Test',
        textStyle: 'scrolling-capitals'
    });

    await waitForCondition('Message is active', async () => {
        const report = await getReport();
        console.log('Current report:', report);
        return report && report.activeMessages.includes(msgId);
    });

    console.log('✅ All flow tests passed!');

  } catch (err) {
    console.error('❌ Test Failed:', err.message);
    cleanup();
    process.exit(1);
  }
  
  cleanup();
  process.exit(0);
}

main();