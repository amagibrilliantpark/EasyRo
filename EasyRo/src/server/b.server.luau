local Players = game:GetService("Players")

Players.PlayerAdded:Connect(function(player)
	print(player.Name .. " oyuna katıldı!")
end)
