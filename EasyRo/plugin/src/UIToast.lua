-- Toast notifications and widget cleanup.
local Theme = require(script.Parent:WaitForChild("UITheme"))
local COLORS = Theme.COLORS

local Toast = {}

function Toast:_ensureToastLayer()
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

function Toast:showToast(title, message, color)
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

function Toast:destroy()
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

return Toast
