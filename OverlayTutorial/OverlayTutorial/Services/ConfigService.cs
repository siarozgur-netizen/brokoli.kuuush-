using System;
using System.IO;
using System.Text.Json;
using OverlayTutorial.Models;

namespace OverlayTutorial.Services;

public sealed class ConfigService
{
    private readonly string _configPath;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    public ConfigService()
    {
        var appDataPath = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        _configPath = Path.Combine(appDataPath, "OverlayTutorial", "config.json");
    }

    public OverlayConfig LoadOrDefault()
    {
        try
        {
            if (!File.Exists(_configPath))
            {
                return new OverlayConfig();
            }

            var json = File.ReadAllText(_configPath);
            var config = JsonSerializer.Deserialize<OverlayConfig>(json);
            return config ?? new OverlayConfig();
        }
        catch
        {
            return new OverlayConfig();
        }
    }

    public void Save(OverlayConfig config)
    {
        try
        {
            var directory = Path.GetDirectoryName(_configPath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var json = JsonSerializer.Serialize(config, JsonOptions);
            File.WriteAllText(_configPath, json);
        }
        catch
        {
            // Ignore write failures to keep overlay responsive.
        }
    }
}
