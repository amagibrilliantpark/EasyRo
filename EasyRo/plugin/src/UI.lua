local UI = {}
UI.__index = UI

local Debug = require(script.Parent:WaitForChild("Debug"))

local ICON_DEFAULT = "rbxassetid://122938149261388"
local ICON_READY = "rbxassetid://96268949025540"
local ICON_PENDING = "rbxassetid://121504636070088"
local ICON_ERROR = "rbxassetid://128202884165853"

local COLORS = {
	bg = Color3.fromRGB(15, 25, 35),
	card = Color3.fromRGB(22, 32, 51),
	accent = Color3.fromRGB(232, 98, 26),
	accentDark = Color3.fromRGB(180, 75, 20),
	text = Color3.fromRGB(255, 255, 255),
	textDim = Color3.fromRGB(140, 160, 180),
	success = Color3.fromRGB(40, 200, 80),
	warning = Color3.fromRGB(240, 190, 0),
	error = Color3.fromRGB(255, 80, 80),
	grid = Color3.fromRGB(26, 42, 58),
	inputBg = Color3.fromRGB(20, 30, 45),
	logBg = Color3.fromRGB(12, 20, 30),
}

local ICON_IN = "rbxassetid://6031265976"
local ICON_OUT = "rbxassetid://6031265978"
local ICON_ADD = "rbxassetid://6031265974"
local ICON_REMOVE = "rbxassetid://6031265980"

function UI.new(plugin, connection)
	local self = setmetatable({}, UI)
	self.Plugin = plugin
	self.Connection = connection
	self.Toolbar = nil
	self.Button = nil
	self.Status = "disconnected"
	self.Widget = nil
	self.ConnectBtn = nil
	self.DisconnectBtn = nil
	self.PortInput = nil
	self.StatusCard = nil
	self.ActivityLog = nil
	self.ActivityEntries = {}
	self.MaxLogEntries = 50
	self.ToastGui = nil
	self.ToastId = 0
	self.NotifiedStatus = nil
	return self
end

function UI:create()
	self.Toolbar = self.Plugin:CreateToolbar("SyncRo")

	self.Button = self.Toolbar:CreateButton(
		"SyncRoToggle",
		"SyncRo — Click to open status panel",
		"",
		"SyncRo"
	)
	self.Button.ClickableWhenViewportHidden = true

	local savedPort = "5000"

	local widgetInfo = DockWidgetPluginGuiInfo.new(
		Enum.InitialDockState.Right,
		false,
		false,
		320,
		480,
		280,
		400
	)

	self.Widget = self.Plugin:CreateDockWidgetPluginGuiAsync("SyncRoStatus", widgetInfo)
	self.Widget.Title = "SyncRo"
	self.Widget:BindToClose(function()
		if self.Widget then
			self.Widget.Enabled = false
		end
	end)

	local bg = Instance.new("Frame")
	bg.Name = "Background"
	bg.Size = UDim2.new(1, 0, 1, 0)
	bg.BackgroundColor3 = COLORS.bg
	bg.BorderSizePixel = 0
	bg.Parent = self.Widget

	local gridFrame = Instance.new("Frame")
	gridFrame.Name = "GridOverlay"
	gridFrame.Size = UDim2.new(1, 0, 1, 0)
	gridFrame.BackgroundTransparency = 1
	gridFrame.BorderSizePixel = 0
	gridFrame.ZIndex = 1
	gridFrame.Parent = bg

	for i = 1, 8 do
		local hLine = Instance.new("Frame")
		hLine.Name = "HLine" .. i
		hLine.Size = UDim2.new(1, 0, 0, 1)
		hLine.Position = UDim2.new(0, 0, 0, i * 50)
		hLine.BackgroundColor3 = COLORS.grid
		hLine.BackgroundTransparency = 0.7
		hLine.BorderSizePixel = 0
		hLine.ZIndex = 1
		hLine.Parent = gridFrame
	end

	for i = 1, 9 do
		local vLine = Instance.new("Frame")
		vLine.Name = "VLine" .. i
		vLine.Size = UDim2.new(0, 1, 1, 0)
		vLine.Position = UDim2.new(0, i * 35, 0, 0)
		vLine.BackgroundColor3 = COLORS.grid
		vLine.BackgroundTransparency = 0.7
		vLine.BorderSizePixel = 0
		vLine.ZIndex = 1
		vLine.Parent = gridFrame
	end

	local contentFrame = Instance.new("Frame")
	contentFrame.Name = "Content"
	contentFrame.Size = UDim2.new(1, 0, 1, 0)
	contentFrame.BackgroundTransparency = 1
	contentFrame.BorderSizePixel = 0
	contentFrame.ZIndex = 2
	contentFrame.Parent = bg

	local layout = Instance.new("UIListLayout")
	layout.Name = "Layout"
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Padding = UDim.new(0, 8)
	layout.Parent = contentFrame

	local padding = Instance.new("UIPadding")
	padding.PaddingTop = UDim.new(0, 12)
	padding.PaddingBottom = UDim.new(0, 12)
	padding.PaddingLeft = UDim.new(0, 12)
	padding.PaddingRight = UDim.new(0, 12)
	padding.Parent = contentFrame

	self:_createHeader(contentFrame)
	self:_createStatusCard(contentFrame)
	self:_createConnectionPanel(contentFrame)
	self:_createActivityLog(contentFrame)
	self:_createFooter(contentFrame)

	self.Button.Click:Connect(function()
		if self.Widget then
			self.Widget.Enabled = not self.Widget.Enabled
		end
	end)

	self.Connection.OnStatusChange = function(status)
		task.spawn(function()
			self:setStatus(status)
		end)
	end

	task.defer(function()
		self:setIcon("default")
	end)
	self.Connection:connect()

	return self
end

function UI:_createHeader(parent)
	local header = Instance.new("Frame")
	header.Name = "Header"
	header.Size = UDim2.new(1, 0, 0, 50)
	header.BackgroundTransparency = 1
	header.LayoutOrder = 1
	header.Parent = parent

	local logoOrange = Instance.new("Frame")
	logoOrange.Name = "LogoOrange"
	logoOrange.Size = UDim2.new(0, 34, 0, 34)
	logoOrange.Position = UDim2.new(0, 6, 0, 8)
	logoOrange.BackgroundColor3 = COLORS.accent
	logoOrange.BorderSizePixel = 0
	logoOrange.ZIndex = 1
	logoOrange.Parent = header

	local logoOrangeCorner = Instance.new("UICorner")
	logoOrangeCorner.CornerRadius = UDim.new(0, 8)
	logoOrangeCorner.Parent = logoOrange

	local logoDark = Instance.new("Frame")
	logoDark.Name = "LogoDark"
	logoDark.Size = UDim2.new(0, 34, 0, 34)
	logoDark.Position = UDim2.new(0, 0, 0, 0)
	logoDark.BackgroundColor3 = Color3.fromRGB(22, 32, 48)
	logoDark.BorderSizePixel = 0
	logoDark.ZIndex = 2
	logoDark.Parent = header

	local logoDarkCorner = Instance.new("UICorner")
	logoDarkCorner.CornerRadius = UDim.new(0, 8)
	logoDarkCorner.Parent = logoDark

	local logoInner = Instance.new("Frame")
	logoInner.Name = "LogoInner"
	logoInner.Size = UDim2.new(0, 12, 0, 12)
	logoInner.Position = UDim2.new(0, 8, 0, 6)
	logoInner.BackgroundColor3 = COLORS.accent
	logoInner.BorderSizePixel = 0
	logoInner.ZIndex = 3
	logoInner.Parent = logoDark

	local logoInnerCorner = Instance.new("UICorner")
	logoInnerCorner.CornerRadius = UDim.new(0, 3)
	logoInnerCorner.Parent = logoInner

	local title = Instance.new("TextLabel")
	title.Name = "Title"
	title.Size = UDim2.new(0, 60, 1, 0)
	title.Position = UDim2.new(0, 42, 0, 0)
	title.BackgroundTransparency = 1
	title.Text = "Sync"
	title.TextColor3 = COLORS.text
	title.TextSize = 24
	title.Font = Enum.Font.GothamBold
	title.TextXAlignment = Enum.TextXAlignment.Left
	title.Parent = header

	local titleRo = Instance.new("TextLabel")
	titleRo.Name = "TitleRo"
	titleRo.Size = UDim2.new(0, 30, 1, 0)
	titleRo.Position = UDim2.new(0, 100, 0, 0)
	titleRo.BackgroundTransparency = 1
	titleRo.Text = "Ro"
	titleRo.TextColor3 = COLORS.accent
	titleRo.TextSize = 24
	titleRo.Font = Enum.Font.Gotham
	titleRo.TextXAlignment = Enum.TextXAlignment.Left
	titleRo.Parent = header

	local version = Instance.new("TextLabel")
	version.Name = "Version"
	version.Size = UDim2.new(0, 40, 0, 16)
	version.Position = UDim2.new(1, -40, 0, 4)
	version.BackgroundTransparency = 1
	version.Text = "v1.0 beta"
	version.TextColor3 = COLORS.textDim
	version.TextSize = 10
	version.Font = Enum.Font.Gotham
	version.TextXAlignment = Enum.TextXAlignment.Right
	version.Parent = header
end

function UI:_createStatusCard(parent)
	local card = Instance.new("Frame")
	card.Name = "StatusCard"
	card.Size = UDim2.new(1, 0, 0, 70)
	card.BackgroundColor3 = COLORS.card
	card.BorderSizePixel = 0
	card.LayoutOrder = 2
	card.Parent = parent

	local cardCorner = Instance.new("UICorner")
	cardCorner.CornerRadius = UDim.new(0, 10)
	cardCorner.Parent = card

	local cardStroke = Instance.new("UIStroke")
	cardStroke.Color = COLORS.grid
	cardStroke.Thickness = 1
	cardStroke.Parent = card

	local statusDot = Instance.new("Frame")
	statusDot.Name = "StatusDot"
	statusDot.Size = UDim2.new(0, 12, 0, 12)
	statusDot.Position = UDim2.new(0, 16, 0, 18)
	statusDot.BackgroundColor3 = COLORS.error
	statusDot.BorderSizePixel = 0
	statusDot.Parent = card

	local dotCorner = Instance.new("UICorner")
	dotCorner.CornerRadius = UDim.new(1, 0)
	dotCorner.Parent = statusDot

	local statusLabel = Instance.new("TextLabel")
	statusLabel.Name = "StatusLabel"
	statusLabel.Size = UDim2.new(1, -44, 0, 20)
	statusLabel.Position = UDim2.new(0, 36, 0, 14)
	statusLabel.BackgroundTransparency = 1
	statusLabel.Text = "Disconnected"
	statusLabel.TextColor3 = COLORS.error
	statusLabel.TextSize = 16
	statusLabel.Font = Enum.Font.GothamBold
	statusLabel.TextXAlignment = Enum.TextXAlignment.Left
	statusLabel.Parent = card
	self.StatusLabel = statusLabel
	self.StatusDot = statusDot

	local detailLabel = Instance.new("TextLabel")
	detailLabel.Name = "DetailLabel"
	detailLabel.Size = UDim2.new(1, -44, 0, 14)
	detailLabel.Position = UDim2.new(0, 36, 0, 36)
	detailLabel.BackgroundTransparency = 1
	detailLabel.Text = "Server not found"
	detailLabel.TextColor3 = COLORS.textDim
	detailLabel.TextSize = 11
	detailLabel.Font = Enum.Font.Gotham
	detailLabel.TextXAlignment = Enum.TextXAlignment.Left
	detailLabel.Parent = card
	self.DetailLabel = detailLabel

	local syncInfo = Instance.new("TextLabel")
	syncInfo.Name = "SyncInfo"
	syncInfo.Size = UDim2.new(1, -16, 0, 14)
	syncInfo.Position = UDim2.new(0, 8, 1, -20)
	syncInfo.BackgroundTransparency = 1
	syncInfo.Text = ""
	syncInfo.TextColor3 = COLORS.textDim
	syncInfo.TextSize = 10
	syncInfo.Font = Enum.Font.Gotham
	syncInfo.TextXAlignment = Enum.TextXAlignment.Left
	syncInfo.Parent = card
	self.SyncInfo = syncInfo

	self.StatusCard = card
end

function UI:_createConnectionPanel(parent)
	local panel = Instance.new("Frame")
	panel.Name = "ConnectionPanel"
	panel.Size = UDim2.new(1, 0, 0, 90)
	panel.BackgroundColor3 = COLORS.card
	panel.BorderSizePixel = 0
	panel.LayoutOrder = 3
	panel.Parent = parent

	local panelCorner = Instance.new("UICorner")
	panelCorner.CornerRadius = UDim.new(0, 10)
	panelCorner.Parent = panel

	local portLabel = Instance.new("TextLabel")
	portLabel.Name = "PortLabel"
	portLabel.Size = UDim2.new(0, 40, 0, 24)
	portLabel.Position = UDim2.new(0, 12, 0, 12)
	portLabel.BackgroundTransparency = 1
	portLabel.Text = "Port"
	portLabel.TextColor3 = COLORS.textDim
	portLabel.TextSize = 12
	portLabel.Font = Enum.Font.GothamMedium
	portLabel.TextXAlignment = Enum.TextXAlignment.Left
	portLabel.Visible = false  -- Hide port label for dynamic port support
	portLabel.Parent = panel

	local portInput = Instance.new("TextBox")
	portInput.Name = "PortInput"
	portInput.Size = UDim2.new(0, 70, 0, 28)
	portInput.Position = UDim2.new(0, 56, 0, 10)
	portInput.BackgroundColor3 = COLORS.inputBg
	portInput.BorderSizePixel = 0
	portInput.Text = "5000"
	portInput.TextColor3 = COLORS.text
	portInput.TextSize = 13
	portInput.Font = Enum.Font.GothamMedium
	portInput.PlaceholderText = "5000"
	portInput.ClearTextOnFocus = false
	portInput.Visible = false  -- Hide port input for dynamic port support
	portInput.Parent = panel

	local inputCorner = Instance.new("UICorner")
	inputCorner.CornerRadius = UDim.new(0, 6)
	inputCorner.Parent = portInput

	local connectBtn = Instance.new("TextButton")
	connectBtn.Name = "ConnectBtn"
	connectBtn.Size = UDim2.new(1, -24, 0, 32)
	connectBtn.Position = UDim2.new(0, 12, 0, 48)
	connectBtn.BackgroundColor3 = COLORS.accent
	connectBtn.BorderSizePixel = 0
	connectBtn.Text = "  Connect"
	connectBtn.TextColor3 = COLORS.text
	connectBtn.TextSize = 13
	connectBtn.Font = Enum.Font.GothamBold
	connectBtn.Parent = panel

	local btnCorner = Instance.new("UICorner")
	btnCorner.CornerRadius = UDim.new(0, 8)
	btnCorner.Parent = connectBtn

	local btnIcon = Instance.new("TextLabel")
	btnIcon.Name = "Icon"
	btnIcon.Size = UDim2.new(0, 20, 0, 20)
	btnIcon.Position = UDim2.new(0.5, -40, 0.5, -10)
	btnIcon.BackgroundTransparency = 1
	btnIcon.Text = "⚡"
	btnIcon.TextSize = 14
	btnIcon.Parent = connectBtn
	btnIcon.Visible = false

	self.PortInput = portInput
	self.ConnectBtn = connectBtn

	connectBtn.MouseButton1Click:Connect(function()
		local port = portInput.Text:match("%d+")
		if not port then
			port = "5000"
		end
		self.Plugin:SetSetting("SyncRoPort", port)
		self.Connection:setUrl("ws://127.0.0.1:" .. port)
		self.Connection:reconnect()
		self:addLog("info", "Connecting to port " .. port .. "...")
	end)
end

function UI:_createActivityLog(parent)
	local logContainer = Instance.new("Frame")
	logContainer.Name = "LogContainer"
	logContainer.Size = UDim2.new(1, 0, 1, -260)
	logContainer.BackgroundColor3 = COLORS.card
	logContainer.BorderSizePixel = 0
	logContainer.LayoutOrder = 4
	logContainer.Parent = parent

	local logCorner = Instance.new("UICorner")
	logCorner.CornerRadius = UDim.new(0, 10)
	logCorner.Parent = logContainer

	local logHeader = Instance.new("Frame")
	logHeader.Name = "LogHeader"
	logHeader.Size = UDim2.new(1, 0, 0, 32)
	logHeader.BackgroundTransparency = 1
	logHeader.Parent = logContainer

	local logTitle = Instance.new("TextLabel")
	logTitle.Name = "LogTitle"
	logTitle.Size = UDim2.new(0, 100, 0, 32)
	logTitle.Position = UDim2.new(0, 12, 0, 0)
	logTitle.BackgroundTransparency = 1
	logTitle.Text = "Activity Log"
	logTitle.TextColor3 = COLORS.text
	logTitle.TextSize = 12
	logTitle.Font = Enum.Font.GothamBold
	logTitle.TextXAlignment = Enum.TextXAlignment.Left
	logTitle.Parent = logHeader

	local clearBtn = Instance.new("TextButton")
	clearBtn.Name = "ClearBtn"
	clearBtn.Size = UDim2.new(0, 50, 0, 20)
	clearBtn.Position = UDim2.new(1, -62, 0, 6)
	clearBtn.BackgroundColor3 = COLORS.inputBg
	clearBtn.BorderSizePixel = 0
	clearBtn.Text = "Clear"
	clearBtn.TextColor3 = COLORS.textDim
	clearBtn.TextSize = 10
	clearBtn.Font = Enum.Font.Gotham
	clearBtn.Parent = logHeader

	local clearCorner = Instance.new("UICorner")
	clearCorner.CornerRadius = UDim.new(0, 4)
	clearCorner.Parent = clearBtn

	local scrollFrame = Instance.new("ScrollingFrame")
	scrollFrame.Name = "LogScroll"
	scrollFrame.Size = UDim2.new(1, -16, 1, -40)
	scrollFrame.Position = UDim2.new(0, 8, 0, 36)
	scrollFrame.BackgroundTransparency = 1
	scrollFrame.BorderSizePixel = 0
	scrollFrame.ScrollBarThickness = 4
	scrollFrame.ScrollBarImageColor3 = COLORS.grid
	scrollFrame.CanvasSize = UDim2.new(0, 0, 0, 0)
	scrollFrame.AutomaticCanvasSize = Enum.AutomaticSize.Y
	scrollFrame.Parent = logContainer

	local logLayout = Instance.new("UIListLayout")
	logLayout.Name = "Layout"
	logLayout.SortOrder = Enum.SortOrder.LayoutOrder
	logLayout.Padding = UDim.new(0, 4)
	logLayout.Parent = scrollFrame

	local logPadding = Instance.new("UIPadding")
	logPadding.PaddingTop = UDim.new(0, 4)
	logPadding.PaddingBottom = UDim.new(0, 4)
	logPadding.Parent = scrollFrame

	self.ActivityLog = scrollFrame
	self.LogLayout = logLayout

	clearBtn.MouseButton1Click:Connect(function()
		self:clearLog()
	end)

	self:addLog("info", "SyncRo initialized")
end

function UI:_createFooter(parent)
	local footer = Instance.new("Frame")
	footer.Name = "Footer"
	footer.Size = UDim2.new(1, 0, 0, 32)
	footer.BackgroundTransparency = 1
	footer.LayoutOrder = 5
	footer.Parent = parent

	local savedDebug = self.Plugin:GetSetting("SyncRoDebug") or false
	Debug.Enabled = savedDebug

	local debugBtn = Instance.new("TextButton")
	debugBtn.Name = "DebugBtn"
	debugBtn.Size = UDim2.new(1, 0, 0, 28)
	debugBtn.Position = UDim2.new(0, 0, 0, 4)
	debugBtn.BackgroundColor3 = savedDebug and COLORS.accent or COLORS.inputBg
	debugBtn.BorderSizePixel = 0
	debugBtn.Text = savedDebug and "  Debug: ON" or "  Debug: OFF"
	debugBtn.TextColor3 = COLORS.text
	debugBtn.TextSize = 12
	debugBtn.Font = Enum.Font.GothamMedium
	debugBtn.TextXAlignment = Enum.TextXAlignment.Left
	debugBtn.Parent = footer

	local debugCorner = Instance.new("UICorner")
	debugCorner.CornerRadius = UDim.new(0, 6)
	debugCorner.Parent = debugBtn

	self.DebugBtn = debugBtn

	debugBtn.MouseButton1Click:Connect(function()
		Debug.Enabled = not Debug.Enabled
		self.Plugin:SetSetting("SyncRoDebug", Debug.Enabled)
		debugBtn.Text = Debug.Enabled and "  Debug: ON" or "  Debug: OFF"
		debugBtn.BackgroundColor3 = Debug.Enabled and COLORS.accent or COLORS.inputBg
		if Debug.Enabled then
			self:addLog("info", "Debug logging enabled")
		else
			self:addLog("info", "Debug logging disabled")
		end
	end)
end

function UI:addLog(logType, message)
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

function UI:clearLog()
	for _, entry in ipairs(self.ActivityEntries) do
		if entry then
			entry:Destroy()
		end
	end
	self.ActivityEntries = {}
	self:addLog("info", "Log cleared")
end

function UI:setStatus(status)
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

function UI:updateSyncInfo(fileCount, direction)
	if not self.SyncInfo then return end
	if direction == "in" then
		self.SyncInfo.Text = "← Last sync: " .. fileCount .. " file(s) received"
	elseif direction == "out" then
		self.SyncInfo.Text = "→ Last sync: " .. fileCount .. " file(s) sent"
	else
		self.SyncInfo.Text = ""
	end
end

function UI:setIcon(state)
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

function UI:_ensureToastLayer()
	if self.ToastGui and self.ToastGui.Parent then
		return self.ToastGui
	end
	local CoreGui = game:GetService("CoreGui")
	local gui = Instance.new("ScreenGui")
	gui.Name = "SyncRoToasts"
	gui.ResetOnSpawn = false
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	gui.DisplayOrder = 1000
	gui.Parent = CoreGui
	self.ToastGui = gui
	return gui
end

function UI:showToast(title, message, color)
	local gui
	local ok = pcall(function()
		gui = self:_ensureToastLayer()
	end)
	if not ok or not gui then
		return
	end

	local TweenService = game:GetService("TweenService")

	self.ToastId += 1
	local myId = self.ToastId

	local existing = gui:FindFirstChild("Toast")
	if existing then
		existing:Destroy()
	end

	local card = Instance.new("Frame")
	card.Name = "Toast"
	card.AnchorPoint = Vector2.new(1, 1)
	card.Position = UDim2.new(1, 340, 1, -16)
	card.Size = UDim2.new(0, 300, 0, 62)
	card.BackgroundColor3 = COLORS.card
	card.BorderSizePixel = 0
	card.Parent = gui

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 10)
	corner.Parent = card

	local stroke = Instance.new("UIStroke")
	stroke.Color = COLORS.grid
	stroke.Thickness = 1
	stroke.Parent = card

	local bar = Instance.new("Frame")
	bar.Name = "Accent"
	bar.Size = UDim2.new(0, 4, 1, -16)
	bar.Position = UDim2.new(0, 8, 0, 8)
	bar.BackgroundColor3 = color
	bar.BorderSizePixel = 0
	bar.Parent = card

	local barCorner = Instance.new("UICorner")
	barCorner.CornerRadius = UDim.new(1, 0)
	barCorner.Parent = bar

	local closeBtn = Instance.new("TextButton")
	closeBtn.Name = "Close"
	closeBtn.Size = UDim2.new(0, 20, 0, 20)
	closeBtn.Position = UDim2.new(1, -26, 0, 6)
	closeBtn.BackgroundTransparency = 1
	closeBtn.Text = "×"
	closeBtn.TextColor3 = COLORS.textDim
	closeBtn.TextSize = 20
	closeBtn.Font = Enum.Font.GothamBold
	closeBtn.AutoButtonColor = false
	closeBtn.Parent = card

	closeBtn.MouseEnter:Connect(function()
		closeBtn.TextColor3 = COLORS.text
	end)
	closeBtn.MouseLeave:Connect(function()
		closeBtn.TextColor3 = COLORS.textDim
	end)

	local titleLabel = Instance.new("TextLabel")
	titleLabel.Name = "Title"
	titleLabel.Size = UDim2.new(1, -66, 0, 18)
	titleLabel.Position = UDim2.new(0, 22, 0, 12)
	titleLabel.BackgroundTransparency = 1
	titleLabel.Text = title
	titleLabel.TextColor3 = color
	titleLabel.TextSize = 14
	titleLabel.Font = Enum.Font.GothamBold
	titleLabel.TextXAlignment = Enum.TextXAlignment.Left
	titleLabel.Parent = card

	local msgLabel = Instance.new("TextLabel")
	msgLabel.Name = "Message"
	msgLabel.Size = UDim2.new(1, -40, 0, 16)
	msgLabel.Position = UDim2.new(0, 22, 0, 32)
	msgLabel.BackgroundTransparency = 1
	msgLabel.Text = message
	msgLabel.TextColor3 = COLORS.textDim
	msgLabel.TextSize = 12
	msgLabel.Font = Enum.Font.Gotham
	msgLabel.TextXAlignment = Enum.TextXAlignment.Left
	msgLabel.Parent = card

	local slideIn = TweenInfo.new(0.35, Enum.EasingStyle.Quart, Enum.EasingDirection.Out)
	TweenService:Create(card, slideIn, { Position = UDim2.new(1, -16, 1, -16) }):Play()

	local dismissed = false
	local function dismiss()
		if dismissed or not card.Parent then
			return
		end
		dismissed = true
		local slideOut = TweenInfo.new(0.3, Enum.EasingStyle.Quart, Enum.EasingDirection.In)
		local tween = TweenService:Create(card, slideOut, { Position = UDim2.new(1, 340, 1, -16) })
		tween.Completed:Connect(function()
			if card and card.Parent then
				card:Destroy()
			end
		end)
		tween:Play()
	end

	closeBtn.Activated:Connect(dismiss)

	task.delay(4, function()
		if self.ToastId ~= myId then
			return
		end
		dismiss()
	end)
end

function UI:destroy()
	if self.Button then
		self.Button:Destroy()
	end
	if self.Widget then
		self.Widget:Destroy()
	end
	if self.ToastGui then
		self.ToastGui:Destroy()
		self.ToastGui = nil
	end
end

return UI
