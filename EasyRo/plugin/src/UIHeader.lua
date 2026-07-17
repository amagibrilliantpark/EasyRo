-- Widget construction: header, status card, and connection panel.
local Theme = require(script.Parent:WaitForChild("UITheme"))
local COLORS = Theme.COLORS

local Header = {}

function Header:_createHeader(parent)
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
	version.Text = "v1.0.0-beta"
	version.TextColor3 = COLORS.textDim
	version.TextSize = 10
	version.Font = Enum.Font.Gotham
	version.TextXAlignment = Enum.TextXAlignment.Right
	version.Parent = header
end

function Header:_createStatusCard(parent)
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

function Header:_createConnectionPanel(parent)
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

return Header
