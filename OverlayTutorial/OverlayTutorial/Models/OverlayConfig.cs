namespace OverlayTutorial.Models;

public sealed class OverlayConfig
{
    public double Opacity { get; set; } = 1.00;
    public string? LastUrl { get; set; }
    public string PreferredLayoutMode { get; set; } = "Search";
}
