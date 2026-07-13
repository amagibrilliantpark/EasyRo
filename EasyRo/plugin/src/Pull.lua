local Pull = {}
Pull.__index = Pull

local Debug = require(script.Parent:WaitForChild("Debug"))

local PROPERTIES_TO_WATCH = {
	default = {
		"Name", "Archivable", "Visible", "Enabled", "Locked",
		"Position", "Size", "Rotation", "CFrame", "Orientation",
		"Transparency", "CanCollide", "Anchored", "Material", "Color",
		"Shape", "CastShadow",
		"LightColor", "Brightness", "Range", "Shadows", "Face", "Angle",
		"Texture", "StudsPerTileU", "StudsPerTileV",
		"Color3", "Enabled", "Heat", "SecondaryColor",
		"Opacity", "RiseVelocity",
		"Image", "ImageColor3", "ImageTransparency", "ScaleType",
		"Text", "TextColor3", "TextSize", "Font", "TextTransparency",
		"TextWrapped", "TextXAlignment", "TextYAlignment", "PlaceholderText",
		"BackgroundColor3", "BackgroundTransparency", "BorderColor3",
		"BorderSizePixel", "ClearTextOnFocus", "AutoButtonColor",
		"CanvasSize", "ScrollBarThickness",
		"ClipsDescendants", "Active", "ResetOnSpawn",
		"WaterWaveSize", "WaterWaveSpeed", "WaterTransparency", "WaterReflectance",
		"WaterColor", "Ambient", "GlobalShadows", "Technology",
		"OutdoorAmbient", "ColorShift_Top", "ColorShift_Bottom",
		"EnvironmentDiffuseScale", "EnvironmentSpecularScale",
		"RespectFilteringEnabled",
		"CornerRadius", "PaddingBottom", "PaddingLeft", "PaddingRight", "PaddingTop",
		"AspectRatio", "AspectType", "DominantAxis",
		"MaxSize", "MinSize", "MaxTextSize", "MinTextSize",
		"Thickness",
		"SparkleColor",
		"Lifetime", "Rate", "Speed", "SpreadAngle",
		"LightEmission", "LightInfluence", "RotSpeed",
		"Drag", "LockedToPart", "EmissionDirection",
		"StudsOffset", "Adornee", "AlwaysOnTop", "MaxDistance",
		"LevelOfDetail",
	},
	Script = { "Source", "RunContext" },
	ModuleScript = { "Source" },
	LocalScript = { "Source", "RunContext" },
}

local MAX_RETRY_QUEUE = 500

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

function Pull:_getPropertiesForInstance(instance)
	local className = instance.ClassName
	local props = PROPERTIES_TO_WATCH[className] or PROPERTIES_TO_WATCH.default
	return props
end

function Pull:_captureInstance(instance, path)
	local isScript = instance:IsA("Script") or instance:IsA("ModuleScript") or instance:IsA("LocalScript")
	local data = {
		path = path,
		className = instance.ClassName,
		name = instance.Name,
		isScript = isScript,
	}

	if isScript then
		data.source = self:_getSource(instance)
	end

	local props = {}
	local propNames = self:_getPropertiesForInstance(instance)
	for _, propName in ipairs(propNames) do
		local ok, val = pcall(function()
			return instance[propName]
		end)
		if ok and val ~= nil then
			local serialized = self:_serializeValue(val)
			if serialized ~= nil then
				props[propName] = serialized
			end
		end
	end
	data.properties = props

	self._instanceData[path] = data
	return data
end

function Pull:_serializeValue(value)
	if type(value) == "boolean" or type(value) == "number" or type(value) == "string" then
		return value
	end

	if typeof(value) == "Color3" then
		return { value.R, value.G, value.B }
	end

	if typeof(value) == "Vector3" then
		return { value.X, value.Y, value.Z }
	end

	if typeof(value) == "Vector2" then
		return { value.X, value.Y }
	end

	if typeof(value) == "UDim" then
		return { value.Scale, value.Offset }
	end

	if typeof(value) == "UDim2" then
		return {
			{ value.X.Scale, value.X.Offset },
			{ value.Y.Scale, value.Y.Offset },
		}
	end

	if typeof(value) == "CFrame" then
		local components = { value:GetComponents() }
		return components
	end

	if typeof(value) == "EnumItem" then
		return value.Name
	end

	if typeof(value) == "BrickColor" then
		return value.Name
	end

	if typeof(value) == "NumberRange" then
		return { value.Min, value.Max }
	end

	if typeof(value) == "NumberSequence" then
		local keypoints = {}
		for _, kp in ipairs(value.Keypoints) do
			table.insert(keypoints, { kp.Time, kp.Value, kp.Envelope })
		end
		return keypoints
	end

	if typeof(value) == "ColorSequence" then
		local keypoints = {}
		for _, kp in ipairs(value.Keypoints) do
			table.insert(keypoints, { kp.Time, kp.Value.R, kp.Value.G, kp.Value.B })
		end
		return keypoints
	end

	if typeof(value) == "Region3" then
		local min = value.CFrame.Position - value.Size / 2
		local max = value.CFrame.Position + value.Size / 2
		return { { min.X, min.Y, min.Z }, { max.X, max.Y, max.Z } }
	end

	return nil
end

function Pull:_watchContainer(container, prefix)
	local ok, children = pcall(function()
		return container:GetChildren()
	end)
	if not ok or not children then
		Debug.error("Pull", "Failed to get children of", prefix)
		return
	end

	for _, child in ipairs(children) do
		local childPath = prefix ~= "" and (prefix .. "/" .. child.Name) or child.Name
		self:_watchInstance(child, childPath, prefix)
	end

	local childAdded = container.ChildAdded:Connect(function(child)
		task.wait()
		local childPath = prefix ~= "" and (prefix .. "/" .. child.Name) or child.Name

		self:_watchInstance(child, childPath, prefix)

		local data = self:_captureInstance(child, childPath)
		Debug.log("Pull", "Instance added:", childPath, "(" .. data.className .. ")")
		table.insert(self._changeBatch, {
			type = "studio-update",
			path = childPath,
			action = "add",
			source = data.source,
			className = data.className,
			properties = data.properties,
			isScript = data.isScript,
		})
	end)

	local childRemoved = container.ChildRemoved:Connect(function(child)
		local childPath = prefix ~= "" and (prefix .. "/" .. child.Name) or child.Name

		self:_untrackInstance(child)
		self._instanceData[childPath] = nil
		self._watchedPaths[childPath] = nil
		Debug.log("Pull", "Instance removed:", childPath)
		table.insert(self._changeBatch, {
			type = "studio-update",
			path = childPath,
			action = "delete"
		})
	end)

	table.insert(self._connections, childAdded)
	table.insert(self._connections, childRemoved)
end

function Pull:_watchInstance(instance, path, servicePrefix)
	local isScript = instance:IsA("Script") or instance:IsA("ModuleScript") or instance:IsA("LocalScript")

	if isScript then
		local sourceChanged = instance:GetPropertyChangedSignal("Source"):Connect(function()
			if instance.Parent then
				Debug.log("Pull", "Script source changed:", path)
				table.insert(self._changeBatch, {
					type = "studio-update",
					path = path,
					action = "update",
					source = instance.Source
				})
			end
		end)
		table.insert(self._connections, sourceChanged)

		local renamed = instance:GetPropertyChangedSignal("Name"):Connect(function()
			if instance.Parent then
				local parentPath = self:_getParentPath(path)
				local newPath = parentPath ~= "" and (parentPath .. "/" .. instance.Name) or instance.Name
				Debug.log("Pull", "Script renamed:", path, "->", newPath)
				table.insert(self._changeBatch, {
					type = "studio-update",
					path = path,
					newPath = newPath,
					action = "rename",
					source = instance.Source
				})
				self._watchedPaths[path] = nil
				path = newPath
				self._watchedPaths[newPath] = true
			end
		end)
		table.insert(self._connections, renamed)

		if not self._instanceConnections[instance] then
			self._instanceConnections[instance] = {}
		end
		table.insert(self._instanceConnections[instance], sourceChanged)
		table.insert(self._instanceConnections[instance], renamed)
	end

	local propNames = self:_getPropertiesForInstance(instance)
	local instanceConns = {}
	for _, propName in ipairs(propNames) do
		if propName ~= "Name" then
			local ok, signal = pcall(function()
				return instance:GetPropertyChangedSignal(propName)
			end)
			if ok and signal then
			local conn = signal:Connect(function()
				if instance.Parent then
						local ok2, val = pcall(function()
							return instance[propName]
						end)
						if ok2 and val ~= nil then
							local serialized = self:_serializeValue(val)
							if serialized ~= nil then
								Debug.log("Pull", "Property changed:", path, "." .. propName)
								table.insert(self._changeBatch, {
									type = "studio-update",
									path = path,
									action = "property-change",
									propertyName = propName,
									propertyValue = serialized,
									className = instance.ClassName,
								})
							end
						end
					end
				end)
				table.insert(self._connections, conn)
				table.insert(instanceConns, conn)
			end
		end
	end

	if not isScript then
		local renamed = instance:GetPropertyChangedSignal("Name"):Connect(function()
			if instance.Parent then
				local parentPath = self:_getParentPath(path)
				local newPath = parentPath ~= "" and (parentPath .. "/" .. instance.Name) or instance.Name
				Debug.log("Pull", "Instance renamed:", path, "->", newPath)
				table.insert(self._changeBatch, {
					type = "studio-update",
					path = path,
					newPath = newPath,
					action = "rename",
					className = instance.ClassName,
				})
				self._watchedPaths[path] = nil
				path = newPath
				self._watchedPaths[newPath] = true
			end
		end)
		table.insert(self._connections, renamed)
		table.insert(instanceConns, renamed)
	end

	if #instanceConns > 0 then
		if not self._instanceConnections[instance] then
			self._instanceConnections[instance] = {}
		end
		for _, conn in ipairs(instanceConns) do
			table.insert(self._instanceConnections[instance], conn)
		end
	end

	self._watchedPaths[path] = true

	if instance:IsA("Folder") or instance:IsA("Model") or isScript then
		self:_watchContainer(instance, path)
	end
end

function Pull:_untrackInstance(instance)
	local conns = self._instanceConnections[instance]
	if conns then
		for _, conn in ipairs(conns) do
			if conn.Connected then
				conn:Disconnect()
			end
		end
		self._instanceConnections[instance] = nil
	end
end

function Pull:_sendBatch()
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

function Pull:_flushRetryQueue()
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

function Pull:_getSource(instance)
	if instance:IsA("Script") or instance:IsA("ModuleScript") or instance:IsA("LocalScript") then
		local ok, source = pcall(function()
			return instance.Source
		end)
		if ok then
			return source
		end
	end
	return nil
end

function Pull:_getParentPath(path)
	local parts = string.split(path, "/")
	if #parts <= 1 then
		return ""
	end
	table.remove(parts)
	return table.concat(parts, "/")
end

function Pull:_getFileName(path)
	if not path then return "unknown" end
	local parts = string.split(path, "/")
	return parts[#parts] or path
end

function Pull:start()
	if self._running then return end
	self._running = true

	Debug.log("Pull", "Starting Studio watcher")

	local services = {
		game:GetService("Workspace"),
		game:GetService("ServerScriptService"),
		game:GetService("ReplicatedStorage"),
		game:GetService("StarterGui"),
		game:GetService("StarterPack"),
		game:GetService("StarterPlayer"),
		game:GetService("ServerStorage"),
		game:GetService("ReplicatedFirst"),
		game:GetService("Lighting"),
		game:GetService("SoundService"),
		game:GetService("Teams"),
		game:GetService("Players"),
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

function Pull:stop()
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

return Pull
