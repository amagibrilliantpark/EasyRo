-- Provider status panel UI. Delegates widget construction and runtime behavior
-- to focused submodules (UIHeader, UIBody, UILog, UIToast); they are merged into
-- the UI table below so callers keep using the same `UI` API.
local UI = {}
UI.__index = UI

local Theme = require(script.Parent:WaitForChild("UITheme"))
local COLORS = Theme.COLORS

local Debug = require(script.Parent:WaitForChild("Debug"))

local Header = require(script.Parent:WaitForChild("UIHeader"))
local Body = require(script.Parent:WaitForChild("UIBody"))
local Log = require(script.Parent:WaitForChild("UILog"))
local Toast = require(script.Parent:WaitForChild("UIToast"))

for _, mod in ipairs({Header, Body, Log, Toast}) do
	for k, v in pairs(mod) do
		UI[k] = v
	end
end

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

return UI
