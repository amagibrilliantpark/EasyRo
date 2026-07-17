-- Push property application and inline instances.
local Debug = require(script.Parent:WaitForChild("Debug"))

local PushProps = {}

function PushProps:_applyInlineInstance(instanceData)
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

function PushProps:_applyProperties(instance, properties)
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

function PushProps:_clearAll()
	for path, inst in pairs(self.InstanceMap) do
		if inst and inst.Parent then
			inst.Parent = nil
		end
	end
	self.InstanceMap = {}
end

return PushProps
