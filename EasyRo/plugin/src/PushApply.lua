-- Push apply operations: full-sync, file/dir changes and removals.
local Debug = require(script.Parent:WaitForChild("Debug"))

local PushApply = {}

function PushApply:applyFullSync(files)
	if not files then return end

	Debug.log("Push", "Applying full-sync:", #files, "files")
	self:_clearAll()

	local tree = self:_buildTree(files)
	self:_createTree(tree, nil)

	Debug.log("Push", "Full-sync complete")
	return true
end

function PushApply:applyFileChanged(relativePath, instanceData)
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

function PushApply:applyFileRemoved(relativePath)
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

function PushApply:applyDirRemoved(relativePath)
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

function PushApply:getAllTracked()
	local result = {}
	for path, inst in pairs(self.InstanceMap) do
		result[path] = inst
	end
	return result
end

return PushApply
