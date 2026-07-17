-- Pull batch sending, retry queue, and lifecycle (start/stop).
local Debug = require(script.Parent:WaitForChild("Debug"))

local PullSend = {}

local MAX_RETRY_QUEUE = 500

function PullSend:_sendBatch()
	local batch = self._changeBatch
	self._changeBatch = {}

	if not self.Connection or not self.Connection.Connected then
		for _, change in ipairs(batch) do
			table.insert(self._retryQueue, change)
		end
		if #self._retryQueue > MAX_RETRY_QUEUE then
			local excess = #self._retryQueue - MAX_RETRY_QUEUE
			for i = 1, excess do
				table.remove(self._retryQueue, 1)
			end
			Debug.warn("Pull", "Retry queue exceeded max, dropped", excess, "old changes")
		end
		if #batch > 0 then
			Debug.log("Pull", "Not connected, queued", #batch, "changes for retry (total:", #self._retryQueue .. ")")
		end
		return
	end

	self:_flushRetryQueue()

	if #batch == 0 then return end

	Debug.log("Pull", "Sending batch:", #batch, "change(s)")

	if self.UI then
		for _, change in ipairs(batch) do
			if change.action == "add" then
				local fileName = self:_getFileName(change.path)
				self.UI:addLog("outgoing", fileName .. " created")
			elseif change.action == "delete" then
				local fileName = self:_getFileName(change.path)
				self.UI:addLog("outgoing", fileName .. " deleted")
			elseif change.action == "update" then
				local fileName = self:_getFileName(change.path)
				self.UI:addLog("outgoing", fileName .. " saved")
			elseif change.action == "rename" then
				local fileName = self:_getFileName(change.path)
				local newFileName = self:_getFileName(change.newPath)
				self.UI:addLog("outgoing", fileName .. " renamed to " .. newFileName)
			elseif change.action == "property-change" then
				local fileName = self:_getFileName(change.path)
				self.UI:addLog("outgoing", fileName .. "." .. change.propertyName)
			end
		end
		self.UI:updateSyncInfo(#batch, "out")
	end

	for _, change in ipairs(batch) do
		Debug.log("Pull", "  ->", change.action, change.path or "(no path)")
		self.Connection:send(change)
	end
end

function PullSend:_flushRetryQueue()
	if #self._retryQueue == 0 then return end
	if not self.Connection or not self.Connection.Connected then return end

	Debug.log("Pull", "Flushing retry queue:", #self._retryQueue, "changes")

	if self.UI then
		self.UI:addLog("info", "Flushing " .. #self._retryQueue .. " queued changes")
	end

	local queue = self._retryQueue
	self._retryQueue = {}
	for _, change in ipairs(queue) do
		Debug.log("Pull", "  retry ->", change.action, change.path or "(no path)")
		self.Connection:send(change)
	end
end

function PullSend:start()
	if self._running then return end
	self._running = true

	Debug.log("Pull", "Starting Studio watcher")

	local services = {
		game:GetService("ServerScriptService"),
		game:GetService("ReplicatedStorage"),
		game:GetService("StarterPlayer"),
	}

	local SEND_INTERVAL = 0.5
	task.spawn(function()
		while self._running do
			task.wait(SEND_INTERVAL)
			if self._running then
				pcall(function()
					self:_sendBatch()
				end)
			end
		end
	end)

	for _, service in ipairs(services) do
		local serviceName = service.Name
		local ok, err = pcall(function()
			self:_watchContainer(service, serviceName)
		end)
		if not ok then
			Debug.error("Pull", "Failed to watch", serviceName, tostring(err))
		end
	end

	Debug.log("Pull", "Studio watcher started")
end

function PullSend:stop()
	self._running = false
	for _, conn in ipairs(self._connections) do
		if conn.Connected then
			conn:Disconnect()
		end
	end
	self._connections = {}
	self._instanceConnections = {}
	self._instanceData = {}
	self._changeBatch = {}
	self._watchedPaths = {}
end

return PullSend
