-- Shared UI theme constants (colors + icons) used across UI submodules.
local Theme = {}

Theme.COLORS = {
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

Theme.ICON_DEFAULT = "rbxassetid://122938149261388"
Theme.ICON_READY = "rbxassetid://96268949025540"
Theme.ICON_PENDING = "rbxassetid://121504636070088"
Theme.ICON_ERROR = "rbxassetid://128202884165853"

Theme.ICON_IN = "rbxassetid://6031265976"
Theme.ICON_OUT = "rbxassetid://6031265978"
Theme.ICON_ADD = "rbxassetid://6031265974"
Theme.ICON_REMOVE = "rbxassetid://6031265980"

return Theme
