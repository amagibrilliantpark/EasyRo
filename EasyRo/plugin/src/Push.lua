local Push = {}
Push.__index = Push

local Debug = require(script.Parent:WaitForChild("Debug"))

local SERVICE_MAP = {
	ServerScriptService = game:GetService("ServerScriptService"),
	ServerStorage = game:GetService("ServerStorage"),
	ReplicatedStorage = game:GetService("ReplicatedStorage"),
	ReplicatedFirst = game:GetService("ReplicatedFirst"),
	StarterPlayer = game:GetService("StarterPlayer"),
	StarterGui = game:GetService("StarterGui"),
	StarterPack = game:GetService("StarterPack"),
	Workspace = game:GetService("Workspace"),
	Lighting = game:GetService("Lighting"),
	SoundService = game:GetService("SoundService"),
}

function Push.new()
	local self = setmetatable({}, Push)
	self.InstanceMap = {}
	return self
end

function Push:applyFullSync(files)
	if not files then return end

	Debug.log("Push", "Applying full-sync:", #files, "files")
	self:_clearAll()

	local tree = self:_buildTree(files)
	self:_createTree(tree, nil)

	Debug.log("Push", "Full-sync complete")
	return true
end

function Push:applyFileChanged(relativePath, instanceData)
	if not relativePath or not instanceData then return end

	Debug.log("Push", "File changed:", relativePath, "(" .. (instanceData.className or "?") .. ")")

	if instanceData.fileType == "inline" then
		local ok, err = pcall(function()
			self:_applyInlineInstance(instanceData)
		end)
		if not ok then
			Debug.error("Push", "Failed to apply inline instance:", tostring(err))
		end
		return
	end

	local existing = self.InstanceMap[relativePath]

	if existing and existing.Parent then
		if instanceData.source then
			local ok, err = pcall(function()
				existing.Source = instanceData.source
			end)
			if not ok then
				Debug.error("Push", "Failed to set Source on", relativePath, ":", tostring(err))
			end
		end
		if instanceData.properties then
			self:_applyProperties(existing, instanceData.properties)
		end
	else
		local parent = self:_resolveParent(relativePath, instanceData)
		if parent then
			local inst = self:_createInstance(instanceData)
			if inst then
				local ok, err = pcall(function()
					inst.Parent = parent
				end)
				if ok then
					self.InstanceMap[relativePath] = inst
					if instanceData.properties then
						self:_applyProperties(inst, instanceData.properties)
					end
				else
					Debug.error("Push", "Failed to parent instance:", relativePath, tostring(err))
				end
			end
		end
	end
end

function Push:applyFileRemoved(relativePath)
	Debug.log("Push", "File removed:", relativePath)
	local inst = self.InstanceMap[relativePath]
	if inst then
		local ok, err = pcall(function()
			if inst.Parent then
				inst.Parent = nil
			end
		end)
		if not ok then
			Debug.warn("Push", "Failed to remove instance:", relativePath, tostring(err))
		end
	end
	self.InstanceMap[relativePath] = nil
end

function Push:applyDirRemoved(relativePath)
	Debug.log("Push", "Dir removed:", relativePath)
	local inst = self.InstanceMap[relativePath]
	if inst then
		local ok, err = pcall(function()
			if inst.Parent then
				inst.Parent = nil
			end
		end)
		if not ok then
			Debug.warn("Push", "Failed to remove directory instance:", relativePath, tostring(err))
		end
	end
	self.InstanceMap[relativePath] = nil

	local prefix = relativePath .. "/"
	for path, childInst in pairs(self.InstanceMap) do
		if path:sub(1, #prefix) == prefix then
			pcall(function()
				if childInst.Parent then
					childInst.Parent = nil
				end
			end)
			self.InstanceMap[path] = nil
		end
	end
end

function Push:getAllTracked()
	local result = {}
	for path, inst in pairs(self.InstanceMap) do
		result[path] = inst
	end
	return result
end

function Push:_applyInlineInstance(instanceData)
	local service = self:_resolveServicePath(instanceData.servicePath)
	if not service then return end

	if #instanceData.servicePath == 1 then
		if instanceData.properties then
			self:_applyProperties(service, instanceData.properties)
		end
		return
	end

	local existing = service:FindFirstChild(instanceData.name)
	if existing then
		if instanceData.properties then
			self:_applyProperties(existing, instanceData.properties)
		end
	else
		local ok, inst = pcall(function()
			return Instance.new(instanceData.className)
		end)
		if ok and inst then
			inst.Name = instanceData.name
			if instanceData.properties then
				self:_applyProperties(inst, instanceData.properties)
			end
			inst.Parent = service
		end
	end
end

function Push:_applyProperties(instance, properties)
	if not properties or type(properties) ~= "table" then return end

	local ENUM_MAP = {
		Technology = {
			["Voxel"] = Enum.Technology.Voxel,
			["Compatibility"] = Enum.Technology.Compatibility,
			["ShadowMap"] = Enum.Technology.ShadowMap,
			["Future"] = Enum.Technology.Future,
		}
	}

	for propName, propValue in pairs(properties) do
		local ok, err = pcall(function()
			if type(propValue) == "table" and #propValue == 12 then
				instance[propName] = CFrame.new(unpack(propValue))
			elseif type(propValue) == "table" and #propValue == 3 and type(propValue[1]) == "number" then
				local isColor = propName:find("Color") or propName:find("Ambient") or propName:find("Diffuse") or propName:find("Specular") or propName:find("Emission") or propName:find("OutlineColor") or propName:find("BorderColor") or propName:find("TextColor3") or propName:find("ImageColor3") or propName:find("BackgroundColor3")
				if isColor then
					instance[propName] = Color3.new(propValue[1], propValue[2], propValue[3])
				else
					instance[propName] = Vector3.new(propValue[1], propValue[2], propValue[3])
				end
			elseif type(propValue) == "table" and #propValue == 2 and type(propValue[1]) == "table" and #propValue[1] == 2 then
				instance[propName] = UDim2.new(propValue[1][1], propValue[1][2], propValue[2][1], propValue[2][2])
			elseif type(propValue) == "table" and #propValue == 2 and type(propValue[1]) == "number" then
				if propName:find("Range") then
					instance[propName] = NumberRange.new(propValue[1], propValue[2])
				elseif propName:find("Size") and propName:find("Min") == nil and propName:find("Max") == nil then
					instance[propName] = Vector2.new(propValue[1], propValue[2])
				else
					instance[propName] = UDim.new(propValue[1], propValue[2])
				end
			elseif type(propValue) == "table" and #propValue == 2 and type(propValue[1]) == "table" and #propValue[1] == 3 then
				local min = Vector3.new(propValue[1][1], propValue[1][2], propValue[1][3])
				local max = Vector3.new(propValue[2][1], propValue[2][2], propValue[2][3])
				instance[propName] = Region3.new(min, max)
			elseif type(propValue) == "table" and #propValue > 0 and type(propValue[1]) == "table" and #propValue[1] == 3 then
				local keypoints = {}
				for _, kp in ipairs(propValue) do
					table.insert(keypoints, NumberSequenceKeypoint.new(kp[1], kp[2], kp[3]))
				end
				instance[propName] = NumberSequence.new(keypoints)
			elseif type(propValue) == "table" and #propValue > 0 and type(propValue[1]) == "table" and #propValue[1] == 4 then
				local keypoints = {}
				for _, kp in ipairs(propValue) do
					table.insert(keypoints, ColorSequenceKeypoint.new(kp[1], Color3.new(kp[2], kp[3], kp[4])))
				end
				instance[propName] = ColorSequence.new(keypoints)
			elseif ENUM_MAP[propName] and type(propValue) == "string" then
				local enumVal = ENUM_MAP[propName][propValue]
				if enumVal then
					instance[propName] = enumVal
				end
			elseif type(propValue) == "boolean" then
				instance[propName] = propValue
			elseif type(propValue) == "number" then
				instance[propName] = propValue
			elseif type(propValue) == "string" then
				instance[propName] = propValue
			end
		end)
		if not ok then
			Debug.error("Push", "Failed to set property '" .. propName .. "': " .. tostring(err))
		end
	end
end

function Push:_clearAll()
	for path, inst in pairs(self.InstanceMap) do
		if inst and inst.Parent then
			inst.Parent = nil
		end
	end
	self.InstanceMap = {}
end

function Push:_resolveParent(relativePath, instanceData)
	if instanceData.servicePath then
		return self:_resolveServicePath(instanceData.servicePath)
	end

	local parentPath = self:_getParentPath(relativePath)
	if parentPath == "" then
		return nil
	end

	local existing = self.InstanceMap[parentPath]
	if existing then
		return existing
	end

	return self:_ensureFolder(parentPath)
end

function Push:_resolveServicePath(servicePath)
	if not servicePath or #servicePath == 0 then
		return nil
	end

	local current = nil
	for i, name in ipairs(servicePath) do
		if i == 1 then
			current = SERVICE_MAP[name]
			if not current then
				current = game:FindFirstChild(name)
			end
		else
			if current then
				local child = current:FindFirstChild(name)
				if not child then
					child = Instance.new("Folder")
					child.Name = name
					child.Parent = current
				end
				current = child
			end
		end
	end

	return current
end

function Push:_ensureFolder(relativePath)
	local parts = string.split(relativePath, "/")
	local current = nil
	local accumulated = {}

	for _, part in ipairs(parts) do
		table.insert(accumulated, part)
		local fullPath = table.concat(accumulated, "/")

		if self.InstanceMap[fullPath .. "/"] then
			current = self.InstanceMap[fullPath .. "/"]
		elseif self.InstanceMap[fullPath] then
			current = self.InstanceMap[fullPath]
		else
			local folder = Instance.new("Folder")
			folder.Name = part
			folder.Parent = current
			self.InstanceMap[fullPath .. "/"] = folder
			current = folder
		end
	end

	return current
end

function Push:_buildTree(files)
	local root = { name = "SyncRo", children = {} }

	for _, file in ipairs(files) do
		if file.fileType == "inline" then
			continue
		end

		if file.isDir then
			local node = { name = file.name, isDir = true, children = {}, file = file }
			table.insert(root.children, node)
		else
			local parts = self:_splitPath(file.relativePath)
			local current = root
			for _, part in ipairs(parts) do
				local found = nil
				for _, child in ipairs(current.children) do
					if child.name == part and child.isDir then
						found = child
						break
					end
				end
				if not found then
					found = { name = part, isDir = true, children = {}, file = nil }
					table.insert(current.children, found)
				end
				current = found
			end
			current.file = file
			current.isDir = false
		end
	end

	return root
end

function Push:_createTree(node, parentInstance)
	if node.isDir and node.file == nil then
		local folder = Instance.new("Folder")
		folder.Name = node.name
		folder.Parent = parentInstance
		self.InstanceMap[node.name .. "/"] = folder
		for _, child in ipairs(node.children) do
			self:_createTree(child, folder)
		end
	elseif node.file then
		local targetParent = parentInstance

		if node.file.servicePath and not node.file.isDir then
			targetParent = self:_resolveServicePath(node.file.servicePath)
		end

		if node.file.isDir then
			local folder = Instance.new("Folder")
			folder.Name = node.file.name
			folder.Parent = targetParent
			self.InstanceMap[node.file.relativePath .. "/"] = folder
			for _, child in ipairs(node.children) do
				self:_createTree(child, folder)
			end
		else
			local inst = self:_createInstance(node.file)
			if inst then
				inst.Parent = targetParent
				self.InstanceMap[node.file.relativePath] = inst
				if node.file.properties then
					self:_applyProperties(inst, node.file.properties)
				end
			end
			for _, child in ipairs(node.children) do
				self:_createTree(child, inst)
			end
		end
	end
end

function Push:_createInstance(file)
	local inst = nil

	if file.className == "Script" or file.runContext then
		local ok, created = pcall(function()
			return Instance.new("Script")
		end)
		if ok and created then
			inst = created
			if file.runContext == "Server" then
				inst.RunContext = Enum.RunContext.Server
			elseif file.runContext == "Client" then
				inst.RunContext = Enum.RunContext.Client
			end
		end
	elseif file.className == "LocalScript" then
		local ok, created = pcall(function()
			return Instance.new("LocalScript")
		end)
		if ok and created then
			inst = created
		end
	else
		local ok, created = pcall(function()
			return Instance.new(file.className)
		end)
		if ok and created then
			inst = created
		else
			inst = Instance.new("ModuleScript")
		end
	end

	if not inst then
		Debug.error("Push", "Failed to create instance:", file.className)
		return nil
	end

	inst.Name = file.name or "Unnamed"
	if file.source then
		local ok, err = pcall(function()
			inst.Source = file.source
		end)
		if not ok then
			Debug.warn("Push", "Failed to set Source:", tostring(err))
		end
	end

	return inst
end

function Push:_getParentPath(relativePath)
	local parts = string.split(relativePath, "/")
	table.remove(parts)
	if #parts == 0 then
		return ""
	end
	return table.concat(parts, "/")
end

function Push:_splitPath(relativePath)
	local parts = {}
	for part in string.gmatch(relativePath, "[^/]+") do
		table.insert(parts, part)
	end
	if #parts > 0 then
		table.remove(parts)
	end
	return parts
end

return Push
