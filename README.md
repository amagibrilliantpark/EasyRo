# EasyRo

A desktop app that brings AI-powered coding assistance to Roblox Studio. It connects an AI agent to your project through Rojo, so the AI can read and write code that syncs directly into Studio.

## What it does

You type what you want in a chat interface. The AI writes Luau code, creates files, and Rojo pushes those files into Roblox Studio in real time. No copy-pasting, no manual file management.

## How it works

EasyRo runs three things behind the scenes:

- **Electron app** — the UI you interact with
- **OpenCode server** — handles the AI conversations
- **Rojo** — syncs files between your computer and Roblox Studio

When you send a message, it goes to OpenCode. The AI reads your project files, writes code, and Rojo picks up the changes and sends them to Studio.

## Requirements

Before using EasyRo, you need:

- **OpenCode CLI** — install with `npm install -g opencode-ai` (requires [Node.js](https://nodejs.org) v18+)
- **Roblox Studio** with the **Rojo plugin** installed:
  - Open Roblox Studio
  - Go to Toolbox > Plugins
  - Search for "Rojo" and install it
  - The plugin appears under your Plugins tab

### Using OpenCode

You have two options for the AI backend:

1. **Free models** — OpenCode offers free models out of the box. Just install the CLI and start using it, no API key needed.
2. **Your own API key** — If you have any API key, you can connect it to use your preferred models.

To connect your own key, run `opencode` in a terminal and use the `/connect` command.

Rojo (`rojo.exe`) is included in the project — you don't need to install it separately.

## Usage

1. Open Roblox Studio and load your project
2. **Connect the Rojo plugin** — this is required for real-time sync:
   - In Studio, go to **Plugins > Rojo > Connect**
   - You should see a "Connected" status
   - Without this connection, changes won't sync to Studio
3. Start EasyRo
4. Type what you want in the chat — the AI writes code and Rojo syncs it to Studio

> **Important:** The Rojo plugin must be connected in Studio before you start coding. If it's not connected, the AI's changes will be saved to files but won't appear in Studio.

## Project structure

```
EasyRo/
├── src/                         # Roblox game source (synced via Rojo)
├── .sessions/                   # Session isolation (auto-created)
├── rojo.exe                     # Rojo binary
├── default.project.json         # Rojo project config
├── opencode.json                # OpenCode config
├── AGENTS.md                    # AI behavior instructions
└── desktop-app/
    ├── package.json             # Dependencies and build config
    ├── src/
    │   ├── main/                # Electron main process
    │   │   ├── main.js          # App entry, window, IPC
    │   │   ├── instance-manager.js  # Rojo/OpenCode process management
    │   │   └── session-manager.js   # Session isolation (junctions)
    │   ├── preload/
    │   │   └── preload.js       # Main ↔ Renderer bridge
    │   └── renderer/
    │       ├── index.html       # App layout
    │       ├── css/             # Styles
    │       └── js/              # UI logic
    └── templates/               # Rojo project templates
```

## Session isolation

Each AI session gets its own copy of the `src/` directory. When you switch sessions, the app swaps a directory junction so `src/` points to the active session's files. Different sessions don't interfere with each other.

## Platform support

| Platform | Status |
|----------|--------|
| Windows  | ✅ Supported (primary) |
| macOS    | ✅ Supported |
| Linux    | ✅ Supported |

**Note:** Directory junctions (session isolation) use Windows `mklink /J`. On macOS/Linux, symlinks are used instead. This is handled automatically.

---

## Development

### From source

```bash
cd desktop-app
npm install
npm start
```

### Build for your platform

```bash
cd desktop-app

# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux

# All platforms
npm run build
```

Build output goes to `desktop-app/dist/`.
