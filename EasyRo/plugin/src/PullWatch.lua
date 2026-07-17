-- Pull instance watching: capture, watch containers/instances, untrack.
local Debug = require(script.Parent:WaitForChild("Debug"))

local PullWatch = {}

function PullWatch:_captureInstance(instance, path)
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

function PullWatch:_watchContainer(container, prefix)
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

function PullWatch:_watchInstance(instance, path, servicePrefix)
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

function PullWatch:_untrackInstance(instance)
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

return PullWatch
