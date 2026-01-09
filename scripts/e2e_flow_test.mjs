import { spawn, execSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { existsSync } from 'node:fs';

const API_BASE = 'http://localhost:8080';
const APP_PATH = './src-tauri/target/release/bundle/macos/VibeCast.app/Contents/MacOS/vibe_cast';

async function main() {
  console.log('🚀 Starting E2E Flow Test...');

  if (!existsSync(APP_PATH)) {
    console.error(`❌ App binary not found at ${APP_PATH}`);
    process.exit(1);
  }

  // Cleanup
  console.log('Cleaning up ports...');
  try { execSync('node scripts/kill-port.mjs 8080'); } catch {}

  // Launch App
  console.log('Launching app...');
  const appProcess = spawn(APP_PATH, [], { 
    stdio: 'inherit', // Let it log to stdout
    detached: false 
  });
  
  const cleanup = () => {
    console.log('Cleaning up...');
    try {
        process.kill(appProcess.pid);
    } catch {}
    try { execSync('node scripts/kill-port.mjs 8080'); } catch {}
  };
  
  process.on('SIGINT', () => { cleanup(); process.exit(); });
  // process.on('exit', cleanup); // 'exit' cannot have async work, but kill is sync.

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
      } catch {}
      await setTimeout(1000);
    }

    if (!connected) throw new Error('Server failed to start');
    console.log('✅ Server is online');

    await setTimeout(5000); // Give frontend time to hydrate

    // 2. Poll for report with retries on sending command
    console.log('Polling for E2E report...');
    let report = null;
    
    for (let attempt = 0; attempt < 5; attempt++) {
        // Send command every loop to ensure frontend gets it eventually
        console.log(`Sending report-status command (Attempt ${attempt + 1})...`);
        await fetch(`${API_BASE}/api/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'report-status', payload: null })
        });
        
        // Wait for response
        await setTimeout(2000);
        
        try {
            const res = await fetch(`${API_BASE}/api/e2e/last-report`);
            if (res.ok) {
                const text = await res.text();
                // Check if it's JSON and not the HTML fallback
                if (text.startsWith('{')) {
                    report = JSON.parse(text);
                    if (report) break;
                }
            }
        } catch (e) {
            console.log(`Fetch error: ${e.message}`);
        }
    }

    if (!report) {
      throw new Error('❌ Failed to retrieve E2E report (Expected failure during TDD phase)');
    }

    console.log('✅ Got Report:', report);

  } catch (err) {
    console.error(err.message);
    cleanup();
    process.exit(1);
  }
  
  cleanup();
  process.exit(0);
}

main();
