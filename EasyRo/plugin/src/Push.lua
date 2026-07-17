-- Pushes file changes from SyncRo into Studio. Behavior is split across focused
-- submodules (PushApply, PushProps, PushTree); they are merged into the Push table
-- below so callers keep using the same `Push` API.
local Push = {}
Push.__index = Push

local Debug = require(script.Parent:WaitForChild("Debug"))

local Apply = require(script.Parent:WaitForChild("PushApply"))
local Props = require(script.Parent:WaitForChild("PushProps"))
local Tree = require(script.Parent:WaitForChild("PushTree"))

for _, mod in ipairs({Apply, Props, Tree}) do
	for k, v in pairs(mod) do
		Push[k] = v
	end
end

function Push.new()
	local self = setmetatable({}, Push)
	self.InstanceMap = {}
	return self
end

return Push
