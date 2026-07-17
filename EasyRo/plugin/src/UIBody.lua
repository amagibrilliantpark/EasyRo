-- Widget construction: activity log and footer.
local Theme = require(script.Parent:WaitForChild("UITheme"))
local Debug = require(script.Parent:WaitForChild("Debug"))
local COLORS = Theme.COLORS

local Body = {}

function Body:_createActivityLog(parent)
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

function Body:_createFooter(parent)
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

return Body
