if not plugin then
	return
end

local Connection = require(script.Connection)
local Push = require(script.Push)
local Pull = require(script.Pull)
local UI = require(script.UI)
local Debug = require(script:WaitForChild("Debug"))

local savedPort = "5000"
local connection = Connection.new("ws://127.0.0.1:" .. savedPort)

local push = Push.new()
local ui = nil
local pull = Pull.new(connection, ui)

Debug.log("Init", "Plugin loaded, port:", savedPort)

local function getFileName(path)
	if not path then return "unknown" end
	local parts = string.split(path, "/")
	return parts[#parts] or path
end

connection.OnMessage = function(msg)
	local ok, err = pcall(function()
		if not msg or type(msg) ~= "table" or not msg.type then
			Debug.warn("Init", "Received invalid message")
			return
		end

		Debug.log("Init", "Received:", msg.type)

		if msg.type == "connected" then
			Debug.log("Init", "Server connected! Sending status...")
			connection:send({
				type = "status",
				state = "connected",
				userId = plugin:GetStudioUserId()
			})
			pull:start()

		elseif msg.type == "full-sync" then
			local fileCount = msg.files and #msg.files or 0
			Debug.log("Init", "Full-sync received:", fileCount, "files")
			if ui then
				ui:addLog("incoming", "Full sync: " .. fileCount .. " files received")
				ui:updateSyncInfo(fileCount, "in")
			end
			pull:stop()
			local syncOk, syncErr = pcall(function()
				push:applyFullSync(msg.files)
			end)
			if syncOk then
				Debug.log("Init", "Full-sync applied successfully")
			else
				Debug.error("Init", "Full-sync failed:", tostring(syncErr))
				if ui then
					ui:addLog("error", "Full sync failed: " .. tostring(syncErr))
				end
			end
			pull:start()

		elseif msg.type == "file-changed" then
			push:applyFileChanged(msg.path, msg.instance)
			if ui then
				local fileName = getFileName(msg.path)
				ui:addLog("incoming", fileName .. " updated")
			end

		elseif msg.type == "file-removed" then
			push:applyFileRemoved(msg.path)
			if ui then
				local fileName = getFileName(msg.path)
				ui:addLog("remove", fileName .. " removed")
			end

		elseif msg.type == "dir-removed" then
			Debug.log("Init", "Dir removed:", msg.path)
			push:applyDirRemoved(msg.path)
			if ui then
				ui:addLog("remove", "Folder removed: " .. msg.path)
			end

		elseif msg.type == "dir-added" then
			Debug.log("Init", "Dir added:", msg.path)
			if ui then
				ui:addLog("add", "Folder added: " .. msg.path)
			end

		elseif msg.type == "server-status" then
			Debug.log("Init", "Server status:", msg.status or "unknown")
			-- Auto-save the port from server-status for dynamic port support
			if msg.port then
				plugin:SetSetting("SyncRoPort", tostring(msg.port))
				Debug.log("Init", "Auto-saved port:", msg.port)
			end

		elseif msg.type == "paused" then
			Debug.log("Init", "Sync paused by server")
			pull:stop()

		elseif msg.type == "resumed" then
			Debug.log("Init", "Sync resumed by server")
			pull:start()
			if ui then
				ui:addLog("info", "Sync resumed")
			end

		else
			Debug.warn("Init", "Unknown message type:", msg.type)
		end
	end)
	if not ok then
		Debug.error("Init", "Error handling message:", tostring(err))
	end
end

ui = UI.new(plugin, connection)
ui:create()
pull.UI = ui

plugin.Unloading:Connect(function()
	Debug.log("Init", "Plugin unloading")
	pull:stop()
	connection:disconnect()
	ui:destroy()
end)
