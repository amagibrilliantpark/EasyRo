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
    PushApply: fs.readFileSync(path.join(SRC_DIR, "PushApply.lua"), "utf-8"),
    PushProps: fs.readFileSync(path.join(SRC_DIR, "PushProps.lua"), "utf-8"),
    PushTree: fs.readFileSync(path.join(SRC_DIR, "PushTree.lua"), "utf-8"),
    Pull: fs.readFileSync(path.join(SRC_DIR, "Pull.lua"), "utf-8"),
    PullConfig: fs.readFileSync(path.join(SRC_DIR, "PullConfig.lua"), "utf-8"),
    PullWatch: fs.readFileSync(path.join(SRC_DIR, "PullWatch.lua"), "utf-8"),
    PullSend: fs.readFileSync(path.join(SRC_DIR, "PullSend.lua"), "utf-8"),
    UI: fs.readFileSync(path.join(SRC_DIR, "UI.lua"), "utf-8"),
    UITheme: fs.readFileSync(path.join(SRC_DIR, "UITheme.lua"), "utf-8"),
    UIHeader: fs.readFileSync(path.join(SRC_DIR, "UIHeader.lua"), "utf-8"),
    UIBody: fs.readFileSync(path.join(SRC_DIR, "UIBody.lua"), "utf-8"),
    UILog: fs.readFileSync(path.join(SRC_DIR, "UILog.lua"), "utf-8"),
    UIToast: fs.readFileSync(path.join(SRC_DIR, "UIToast.lua"), "utf-8"),
    Debug: fs.readFileSync(path.join(SRC_DIR, "Debug.lua"), "utf-8"),
    init: fs.readFileSync(path.join(SRC_DIR, "init.server.lua"), "utf-8"),
  };

  const rootRef = nextReferent();

  const children = [
    buildModuleScript("Connection", files.Connection),
    buildModuleScript("Push", files.Push),
    buildModuleScript("PushApply", files.PushApply),
    buildModuleScript("PushProps", files.PushProps),
    buildModuleScript("PushTree", files.PushTree),
    buildModuleScript("Pull", files.Pull),
    buildModuleScript("PullConfig", files.PullConfig),
    buildModuleScript("PullWatch", files.PullWatch),
    buildModuleScript("PullSend", files.PullSend),
    buildModuleScript("UI", files.UI),
    buildModuleScript("UITheme", files.UITheme),
    buildModuleScript("UIHeader", files.UIHeader),
    buildModuleScript("UIBody", files.UIBody),
    buildModuleScript("UILog", files.UILog),
    buildModuleScript("UIToast", files.UIToast),
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
