# EasyRo

Roblox Studio AI assistant powered by OpenCode. Connects an AI (OpenCode) to your Roblox Studio project via Rojo.

## Getting Started

### Roblox Project

Build the place from scratch:

```bash
rojo build -o "EasyRo.rbxlx"
```

Open `EasyRo.rbxlx` in Roblox Studio and start the Rojo server:

```bash
rojo serve
```

### Desktop App

```bash
cd desktop-app
npm install
npm start          # development
npm run build:win  # build for Windows
```

The app auto-starts Rojo and OpenCode, connects them, and provides a chat UI.

## Project Structure

```
src/
├── server/    → ServerScriptService (*.server.luau)
├── client/    → StarterPlayerScripts (*.client.luau)
└── shared/    → ReplicatedStorage (*.luau)
```

## Session Isolation

Each AI chat session has its own snapshot of the `src/` directory, stored in `.sessions/`. When you switch sessions, the current files are saved and the target session's files are restored. This keeps file changes isolated per session without touching Rojo or using junctions.

For more help, check out [the Rojo documentation](https://rojo.space/docs).
