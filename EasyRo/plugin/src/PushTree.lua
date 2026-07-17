-- Push tree building, service/folder resolution, and instance creation.
local Debug = require(script.Parent:WaitForChild("Debug"))

local PushTree = {}

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

function PushTree:_resolveParent(relativePath, instanceData)
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

function PushTree:_resolveServicePath(servicePath)
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

function PushTree:_ensureFolder(relativePath)
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

function PushTree:_buildTree(files)
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

function PushTree:_createTree(node, parentInstance)
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

function PushTree:_createInstance(file)
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

function PushTree:_getParentPath(relativePath)
	local parts = string.split(relativePath, "/")
	table.remove(parts)
	if #parts == 0 then
		return ""
	end
	return table.concat(parts, "/")
end

function PushTree:_splitPath(relativePath)
	local parts = {}
	for part in string.gmatch(relativePath, "[^/]+") do
		table.insert(parts, part)
	end
	if #parts > 0 then
		table.remove(parts)
	end
	return parts
end

return PushTree
