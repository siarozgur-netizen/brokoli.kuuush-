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

    public double LoadOpacityOrDefault(double defaultOpacity)
    {
        try
        {
            if (!File.Exists(_configPath))
            {
                return defaultOpacity;
            }

            var json = File.ReadAllText(_configPath);
            var config = JsonSerializer.Deserialize<OverlayConfig>(json);
            return config?.Opacity ?? defaultOpacity;
        }
        catch
        {
            return defaultOpacity;
        }
    }

    public void SaveOpacity(double opacity)
    {
        try
        {
            var directory = Path.GetDirectoryName(_configPath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var config = new OverlayConfig
            {
                Opacity = opacity
            };

            var json = JsonSerializer.Serialize(config, JsonOptions);
            File.WriteAllText(_configPath, json);
        }
        catch
        {
            // Ignore write failures to keep overlay responsive.
        }
    }
}
