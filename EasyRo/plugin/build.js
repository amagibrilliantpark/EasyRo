const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "src");
const OUTPUT_FILE = path.join(__dirname, "..", "SyncRo.rbxmx");

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

let referentCounter = 0;
function nextReferent() {
  return `RBX${String(referentCounter++).padStart(8, "0")}`;
}

function buildModuleScript(name, source) {
  const ref = nextReferent();
  return `      <Item class="ModuleScript" referent="${ref}">
        <Properties>
          <string name="Name">${escapeXml(name)}</string>
          <string name="Source">${escapeXml(source)}</string>
        </Properties>
      </Item>`;
}

function main() {
  const files = {
    Connection: fs.readFileSync(path.join(SRC_DIR, "Connection.lua"), "utf-8"),
    Push: fs.readFileSync(path.join(SRC_DIR, "Push.lua"), "utf-8"),
    Pull: fs.readFileSync(path.join(SRC_DIR, "Pull.lua"), "utf-8"),
    UI: fs.readFileSync(path.join(SRC_DIR, "UI.lua"), "utf-8"),
    Debug: fs.readFileSync(path.join(SRC_DIR, "Debug.lua"), "utf-8"),
    init: fs.readFileSync(path.join(SRC_DIR, "init.server.lua"), "utf-8"),
  };

  const rootRef = nextReferent();

  const children = [
    buildModuleScript("Connection", files.Connection),
    buildModuleScript("Push", files.Push),
    buildModuleScript("Pull", files.Pull),
    buildModuleScript("UI", files.UI),
    buildModuleScript("Debug", files.Debug),
  ].join("\n");

  const rbxmx = `<roblox version="4">
    <Item class="Script" referent="${rootRef}">
      <Properties>
        <string name="Name">SyncRo</string>
        <string name="Source">${escapeXml(files.init)}</string>
        <token name="RunContext">6</token>
      </Properties>
${children}
    </Item>
</roblox>`;

  fs.writeFileSync(OUTPUT_FILE, rbxmx, "utf-8");
  console.log(`Plugin built: ${OUTPUT_FILE}`);
  console.log(`EasyRo'yu ve Roblox Studio'yu yeniden baslatarak degisiklikleri gorun.`);
}

main();
