-- Pulls Studio changes into SyncRo. Behavior is split across focused submodules
-- (PullConfig, PullWatch, PullSend); they are merged into the Pull table below so
-- callers keep using the same `Pull` API.
local Pull = {}
Pull.__index = Pull

local Debug = require(script.Parent:WaitForChild("Debug"))

local Config = require(script.Parent:WaitForChild("PullConfig"))
local Watch = require(script.Parent:WaitForChild("PullWatch"))
local Send = require(script.Parent:WaitForChild("PullSend"))

for _, mod in ipairs({Config, Watch, Send}) do
	for k, v in pairs(mod) do
		Pull[k] = v
	end
end

function Pull.new(connection, ui)
	local self = setmetatable({}, Pull)
	self.Connection = connection
	self.UI = ui
	self._connections = {}
	self._instanceConnections = {}
	self._instanceData = {}
	self._changeBatch = {}
	self._retryQueue = {}
	self._running = false
	self._watchedPaths = {}
	return self
end

return Pull
