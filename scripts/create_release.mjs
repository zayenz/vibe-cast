import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

export function updateFiles(version) {
  // Update tauri.conf.json
  const tauriConfigPath = 'src-tauri/crates/app/tauri.conf.json';
  if (fs.existsSync(tauriConfigPath)) {
    const content = fs.readFileSync(tauriConfigPath, 'utf8');
    const json = JSON.parse(content);
    json.version = version;
    fs.writeFileSync(tauriConfigPath, JSON.stringify(json, null, 2)); // Prettier might formatting differences, but standard JSON is fine
    console.log(`Updated ${tauriConfigPath} to version ${version}`);
  } else {
    console.warn(`Warning: ${tauriConfigPath} not found`);
  }

  // Update Cargo.toml
  const cargoTomlPath = 'src-tauri/crates/app/Cargo.toml';
  if (fs.existsSync(cargoTomlPath)) {
    let content = fs.readFileSync(cargoTomlPath, 'utf8');
    // Replace the first occurrence of version = "..."
    // This assumes [package] version is the first one, which is standard
    content = content.replace(/^version = ".*"/m, `version = "${version}"`);
    fs.writeFileSync(cargoTomlPath, content);
    console.log(`Updated ${cargoTomlPath} to version ${version}`);
  } else {
    console.warn(`Warning: ${cargoTomlPath} not found`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const versionArg = args[0];

  if (!versionArg) {
    console.error('Usage: node scripts/create_release.mjs <version|patch|minor|major>');
    process.exit(1);
  }

  try {
    // 1. Update package.json using npm version
    console.log(`Running npm version ${versionArg}...`);
    // --no-git-tag-version prevents git tag and commit, we do it later
    execSync(`npm version ${versionArg} --no-git-tag-version`, { stdio: 'inherit' });

    // 2. Read new version
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const newVersion = packageJson.version;
    console.log(`New version: ${newVersion}`);

    // 3. Update other files
    updateFiles(newVersion);

    // 4. Git commit and tag
    console.log('Staging files...');
    execSync('git add package.json package-lock.json src-tauri/crates/app/tauri.conf.json src-tauri/crates/app/Cargo.toml', { stdio: 'inherit' });
    
    console.log('Committing...');
    execSync(`git commit -m "chore: bump version to ${newVersion}"`, { stdio: 'inherit' });
    
    console.log(`Tagging v${newVersion}...`);
    execSync(`git tag v${newVersion}`, { stdio: 'inherit' });

    console.log('Done! Run "git push && git push --tags" to publish.');

  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

// Only run main if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
