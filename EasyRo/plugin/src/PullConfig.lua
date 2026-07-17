-- Pull configuration, value serialization, and path utilities.
local PullConfig = {}

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

function PullConfig:_getPropertiesForInstance(instance)
	local className = instance.ClassName
	local props = PROPERTIES_TO_WATCH[className] or PROPERTIES_TO_WATCH.default
	return props
end

function PullConfig:_serializeValue(value)
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

function PullConfig:_getSource(instance)
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

function PullConfig:_getParentPath(path)
	local parts = string.split(path, "/")
	if #parts <= 1 then
		return ""
	end
	table.remove(parts)
	return table.concat(parts, "/")
end

function PullConfig:_getFileName(path)
	if not path then return "unknown" end
	local parts = string.split(path, "/")
	return parts[#parts] or path
end

return PullConfig
