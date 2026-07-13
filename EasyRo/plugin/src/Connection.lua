local Connection = {}
Connection.__index = Connection

local Debug = require(script.Parent:WaitForChild("Debug"))

local INITIAL_RECONNECT_DELAY = 1
local MAX_RECONNECT_DELAY = 30
local MAX_RECONNECT_ATTEMPTS = 0

function Connection.new(url)
	Debug.log("Connection", "new() called with URL:", tostring(url))
	local self = setmetatable({}, Connection)
	self.Url = url
	self.WS = nil
	self.Connected = false
	self.Connecting = false
	self.Paused = false
	self.OnMessage = nil
	self.OnStatusChange = nil
	self.OnPause = nil
	self.OnResume = nil
	self._reconnectThread = nil
	self._shouldReconnect = true
	self._reconnectDelay = INITIAL_RECONNECT_DELAY
	self._reconnectAttempts = 0
	self._eventConnections = {}
	return self
end

function Connection:connect()
	if self.Connected or self.Connecting then
		Debug.log("Connection", "Already connected or connecting, skipping")
		return
	end

	self.Connecting = true

	if self.OnStatusChange then
		self.OnStatusChange("connecting")
	end

	pcall(function()
		if not game:GetService("HttpService").HttpEnabled then
			game:GetService("HttpService").HttpEnabled = true
		end
	end)

	Debug.log("Connection", "Attempting CreateWebStreamClient with URL:", tostring(self.Url))
	local ok, ws = pcall(function()
		return game:GetService("HttpService"):CreateWebStreamClient(
			Enum.WebStreamClientType.WebSocket,
			{ Url = self.Url }
		)
	end)

	Debug.log("Connection", "CreateWebStreamClient returned. OK:", tostring(ok), "Result:", tostring(ws))

	if not ok then
		self.Connecting = false
		Debug.error("Connection", "Connection failed:", tostring(ws))
		if self.OnStatusChange then
			self.OnStatusChange("disconnected")
		end
		self:_scheduleReconnect()
		return
	end

	self.WS = ws
	self:_cleanupEvents()

	ws.Opened:Connect(function()
		Debug.log("Connection", "WebSocket opened, connected to", self.Url)
		self.Connected = true
		self.Connecting = false
		self._reconnectDelay = INITIAL_RECONNECT_DELAY
		self._reconnectAttempts = 0
		if self.OnStatusChange then
			self.OnStatusChange("connected")
		end

		-- Heartbeat keep-alive. syncro.exe's server requires an APPLICATION-LEVEL
		-- {"type":"pong"} message to keep the connection alive; a raw WebSocket
		-- pong frame (handled automatically by the engine) is ignored, so the
		-- server drops idle connections after ~60s and the plugin reconnects.
		-- Roblox does not surface raw ping frames to Lua, so we send an app-level
		-- pong on a fixed interval. This MUST start here (in Opened) because
		-- self.Connected is still false while connect() is running.
		task.spawn(function()
			while self.Connected and self.WS == ws do
				task.wait(15)
				if self.Connected and self.WS == ws then
					pcall(function()
						self:send({ type = "pong" })
					end)
				end
			end
		end)
	end)

	local msgConn = ws.MessageReceived:Connect(function(data)
		local ok, msg = pcall(function()
			return game:GetService("HttpService"):JSONDecode(data)
		end)
		if ok and msg then
			local msgOk, msgErr = pcall(function()
				self:_handleMessage(msg)
			end)
			if not msgOk then
				Debug.error("Connection", "Error handling message:", tostring(msgErr))
			end
		end
	end)
	table.insert(self._eventConnections, msgConn)

	local closeConn = ws.Closed:Connect(function()
		Debug.log("Connection", "WebSocket Closed event fired")
		self.Connected = false
		self.Connecting = false
		Debug.log("Connection", "WebSocket closed")
		self:_cleanupEvents()
		self.WS = nil
		if self.OnStatusChange then
			self.OnStatusChange("disconnected")
		end
		self:_scheduleReconnect()
	end)
	table.insert(self._eventConnections, closeConn)

  local errConn = ws.Error:Connect(function(responseStatusCode, errorMessage)
    Debug.error("Connection", "WebSocket error:", responseStatusCode, tostring(errorMessage))
    self.Connected = false
    self.Connecting = false
    if self.OnStatusChange then
      self.OnStatusChange("disconnected")
    end
  end)
  table.insert(self._eventConnections, errConn)
end

function Connection:_cleanupEvents()
	if self._eventConnections then
		for _, conn in ipairs(self._eventConnections) do
			if conn.Connected then
				conn:Disconnect()
			end
		end
	end
	self._eventConnections = {}
end

function Connection:disconnect()
	self._shouldReconnect = false
	self:_cleanupEvents()
	if self.WS then
		local ok, err = pcall(function()
			self.WS:Close()
		end)
		if not ok then
			Debug.warn("Connection", "Error closing WebSocket:", tostring(err))
		end
		self.WS = nil
	end
	self.Connected = false
	self.Connecting = false
	if self._reconnectThread then
		self._reconnectThread:Cancel()
		self._reconnectThread = nil
	end
	if self.OnStatusChange then
		self.OnStatusChange("disconnected")
	end
end

function Connection:setUrl(newUrl)
	self.Url = newUrl
end

function Connection:reconnect()
	self._shouldReconnect = true
	self._reconnectDelay = INITIAL_RECONNECT_DELAY
	self._reconnectAttempts = 0
	if self.WS then
		local ok, err = pcall(function()
			self.WS:Close()
		end)
		if not ok then
			Debug.warn("Connection", "Error closing during reconnect:", tostring(err))
		end
		self.WS = nil
	end
	self.Connected = false
	self.Connecting = false
	task.wait(0.5)
	self:connect()
end

function Connection:send(data)
	if not self.Connected or not self.WS then
		Debug.warn("Connection", "Cannot send, not connected")
		return false
	end
	local ok, err = pcall(function()
		local json = game:GetService("HttpService"):JSONEncode(data)
		self.WS:Send(json)
	end)
	if not ok then
		Debug.error("Connection", "Send failed:", tostring(err))
		return false
	end
	return true
end

function Connection:_handleMessage(msg)
	if msg.type == "paused" then
		self.Paused = true
		if self.OnPause then
			self.OnPause()
		end
		if self.OnStatusChange then
			self.OnStatusChange("paused")
		end
	elseif msg.type == "resumed" then
		self.Paused = false
		if self.OnResume then
			self.OnResume()
		end
		if self.OnStatusChange then
			self.OnStatusChange("connected")
		end
	elseif self.OnMessage then
		self.OnMessage(msg)
	end
end

function Connection:_scheduleReconnect()
	Debug.log("Connection", "Scheduling reconnect in", self._reconnectDelay, "seconds...")
	if not self._shouldReconnect then
		return
	end
	if self._reconnectThread then
		return
	end

	self._reconnectAttempts = self._reconnectAttempts + 1

	if MAX_RECONNECT_ATTEMPTS > 0 and self._reconnectAttempts > MAX_RECONNECT_ATTEMPTS then
		Debug.error("Connection", "Max reconnect attempts reached, giving up")
		if self.OnStatusChange then
			self.OnStatusChange("disconnected")
		end
		return
	end

	Debug.log("Connection", "Scheduling reconnect in", self._reconnectDelay, "s (attempt " .. self._reconnectAttempts .. ")")

	if self.OnStatusChange then
		self.OnStatusChange("reconnecting")
	end

	local delay = self._reconnectDelay
	self._reconnectThread = task.delay(delay, function()
		self._reconnectThread = nil
		if not self.Connected and self._shouldReconnect then
			Debug.log("Connection", "Attempting reconnect... Attempt:", self._reconnectAttempts)
			self:connect()
		end
	end)

	self._reconnectDelay = math.min(self._reconnectDelay * 2, MAX_RECONNECT_DELAY)
end

return Connection
