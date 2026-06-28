local Players = game:GetService("Players")

Players.PlayerAdded:Connect(function(player)
	player.CharacterAdded:Connect(function(character)
		local humanoid = character:WaitForChild("Humanoid")
		humanoid.WalkSpeed = 32
		print(player.Name .. " karakteri yüklendi, hız ayarlandı!")
	end)
end)

print("Deneme server script çalışıyor!")
