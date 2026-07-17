-- Logging, status display, and icon updates.
local Theme = require(script.Parent:WaitForChild("UITheme"))
local Debug = require(script.Parent:WaitForChild("Debug"))
local COLORS = Theme.COLORS
local ICON_READY = Theme.ICON_READY
local ICON_PENDING = Theme.ICON_PENDING
local ICON_ERROR = Theme.ICON_ERROR
local ICON_DEFAULT = Theme.ICON_DEFAULT

local Log = {}

function Log:addLog(logType, message)
	if not self.ActivityLog then return end

	local timestamp = os.date("%H:%M:%S")

	local colors = {
		info = COLORS.textDim,
		incoming = COLORS.accent,
		outgoing = COLORS.success,
		add = Color3.fromRGB(80, 180, 255),
		remove = COLORS.error,
		warning = COLORS.warning,
		error = COLORS.error,
	}

	local icons = {
		info = "●",
		incoming = "←",
		outgoing = "→",
		add = "+",
		remove = "-",
		warning = "⚠",
		error = "✕",
	}

	local entry = Instance.new("Frame")
	entry.Name = "Entry_" .. #self.ActivityEntries
	entry.Size = UDim2.new(1, 0, 0, 20)
	entry.BackgroundTransparency = 1
	entry.LayoutOrder = #self.ActivityEntries + 1
	entry.Parent = self.ActivityLog

	local icon = Instance.new("TextLabel")
	icon.Name = "Icon"
	icon.Size = UDim2.new(0, 16, 0, 20)
	icon.Position = UDim2.new(0, 0, 0, 0)
	icon.BackgroundTransparency = 1
	icon.Text = icons[logType] or "●"
	icon.TextColor3 = colors[logType] or COLORS.textDim
	icon.TextSize = 10
	icon.Font = Enum.Font.GothamBold
	icon.TextXAlignment = Enum.TextXAlignment.Center
	icon.Parent = entry

	local timeLabel = Instance.new("TextLabel")
	timeLabel.Name = "Time"
	timeLabel.Size = UDim2.new(0, 52, 0, 20)
	timeLabel.Position = UDim2.new(0, 18, 0, 0)
	timeLabel.BackgroundTransparency = 1
	timeLabel.Text = timestamp
	timeLabel.TextColor3 = COLORS.textDim
	timeLabel.TextSize = 9
	timeLabel.Font = Enum.Font.Code
	timeLabel.TextXAlignment = Enum.TextXAlignment.Left
	timeLabel.Parent = entry

	local msgLabel = Instance.new("TextLabel")
	msgLabel.Name = "Message"
	msgLabel.Size = UDim2.new(1, -82, 0, 20)
	msgLabel.Position = UDim2.new(0, 72, 0, 0)
	msgLabel.BackgroundTransparency = 1
	msgLabel.Text = message
	msgLabel.TextColor3 = colors[logType] or COLORS.textDim
	msgLabel.TextSize = 10
	msgLabel.Font = Enum.Font.Gotham
	msgLabel.TextXAlignment = Enum.TextXAlignment.Left
	msgLabel.TextTruncate = Enum.TextTruncate.AtEnd
	msgLabel.Parent = entry

	table.insert(self.ActivityEntries, entry)

	while #self.ActivityEntries > self.MaxLogEntries do
		local oldest = table.remove(self.ActivityEntries, 1)
		if oldest then
			oldest:Destroy()
		end
	end

	if self.ActivityLog then
		self.ActivityLog.CanvasPosition = Vector2.new(0, self.LogLayout.AbsoluteContentSize.Y)
	end
end

function Log:clearLog()
	for _, entry in ipairs(self.ActivityEntries) do
		if entry then
			entry:Destroy()
		end
	end
	self.ActivityEntries = {}
	self:addLog("info", "Log cleared")
end

function Log:setStatus(status)
	self.Status = status

	if status ~= self.NotifiedStatus then
		if status == "connected" then
			self:showToast("SyncRo Connected", "Syncing files in real-time", COLORS.success)
		elseif status == "disconnected" then
			self:showToast("SyncRo Disconnected", "Server connection lost", COLORS.error)
		elseif status == "paused" then
			self:showToast("SyncRo Paused", "Sync is paused", COLORS.warning)
		end
		self.NotifiedStatus = status
	end

	if not self.StatusLabel then
		return
	end

	if status == "connected" then
		self.StatusLabel.Text = "Connected"
		self.StatusLabel.TextColor3 = COLORS.success
		self.DetailLabel.Text = "Syncing files in real-time"
		self.StatusDot.BackgroundColor3 = COLORS.success
		self.ConnectBtn.Text = "  Reconnect"
		self:setIcon("ready")
		self:addLog("info", "Connected to server")
	elseif status == "connecting" then
		self.StatusLabel.Text = "Connecting..."
		self.StatusLabel.TextColor3 = COLORS.warning
		self.DetailLabel.Text = "Establishing connection..."
		self.StatusDot.BackgroundColor3 = COLORS.warning
		self:setIcon("pending")
	elseif status == "paused" then
		self.StatusLabel.Text = "Paused"
		self.StatusLabel.TextColor3 = COLORS.warning
		self.DetailLabel.Text = "Sync is paused"
		self.StatusDot.BackgroundColor3 = COLORS.warning
		self:setIcon("pending")
		self:addLog("warning", "Sync paused by server")
	elseif status == "reconnecting" then
		self.StatusLabel.Text = "Reconnecting..."
		self.StatusLabel.TextColor3 = COLORS.accent
		self.DetailLabel.Text = "Trying to reconnect..."
		self.StatusDot.BackgroundColor3 = COLORS.accent
		self:setIcon("pending")
		self:addLog("info", "Reconnecting to server...")
	else
		self.StatusLabel.Text = "Disconnected"
		self.StatusLabel.TextColor3 = COLORS.error
		self.DetailLabel.Text = "Server not found"
		self.StatusDot.BackgroundColor3 = COLORS.error
		self.ConnectBtn.Text = "  Connect"
		self:setIcon("error")
		self:addLog("error", "Disconnected from server")
	end
end

function Log:updateSyncInfo(fileCount, direction)
	if not self.SyncInfo then return end
	if direction == "in" then
		self.SyncInfo.Text = "← Last sync: " .. fileCount .. " file(s) received"
	elseif direction == "out" then
		self.SyncInfo.Text = "→ Last sync: " .. fileCount .. " file(s) sent"
	else
		self.SyncInfo.Text = ""
	end
end

function Log:setIcon(state)
	if not self.Button then return end

	local iconMap = {
		ready = ICON_READY,
		pending = ICON_PENDING,
		error = ICON_ERROR,
		default = ICON_DEFAULT,
	}

	local icon = iconMap[state] or ICON_DEFAULT
	if icon ~= "rbxassetid://0" then
		local ok, err = pcall(function()
			self.Button.Icon = icon
		end)
		if not ok then
			Debug.warn("UI", "Failed to set icon:", tostring(err))
		end
	end
end

return Log
