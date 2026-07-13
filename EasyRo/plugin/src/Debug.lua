local Debug = {}
Debug.Enabled = false

local PREFIX = "[SyncRo] "

function Debug.log(category, ...)
	if not Debug.Enabled then return end
	local parts = { PREFIX .. "[" .. category .. "]" }
	for i = 1, select("#", ...) do
		table.insert(parts, tostring(select(i, ...)))
	end
	print(table.concat(parts, " "))
end

function Debug.warn(category, ...)
	local parts = { PREFIX .. "[" .. category .. "] WARNING:" }
	for i = 1, select("#", ...) do
		table.insert(parts, tostring(select(i, ...)))
	end
	warn(table.concat(parts, " "))
end

function Debug.error(category, ...)
	local parts = { PREFIX .. "[" .. category .. "] ERROR:" }
	for i = 1, select("#", ...) do
		table.insert(parts, tostring(select(i, ...)))
	end
	warn(table.concat(parts, " "))
end

function Debug.dump(category, label, data)
	if not Debug.Enabled then return end
	local ok, encoded = pcall(function()
		return game:GetService("HttpService"):JSONEncode(data)
	end)
	if ok then
		print(PREFIX .. "[" .. category .. "] " .. label .. ": " .. encoded)
	else
		print(PREFIX .. "[" .. category .. "] " .. label .. ": (could not encode)")
	end
end

return Debug
