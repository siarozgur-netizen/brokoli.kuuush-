using System.Windows;

namespace OverlayTutorial.Services;

public sealed class OverlayLayoutService
{
    private const double WidthRatio = 0.20;
    private const double AspectRatioWidth = 16.0;
    private const double AspectRatioHeight = 9.0;
    private const double HorizontalMarginRatio = 0.03;
    private const double VerticalMarginRatio = 0.03;

    public Size CalculateSize(double primaryScreenWidth, double primaryScreenHeight)
    {
        _ = primaryScreenHeight;

        var width = primaryScreenWidth * WidthRatio;
        var height = width * (AspectRatioHeight / AspectRatioWidth);

        return new Size(width, height);
    }

    public Point CalculatePosition(
        double primaryScreenWidth,
        double primaryScreenHeight,
        Size overlaySize)
    {
        var rightMargin = primaryScreenWidth * HorizontalMarginRatio;
        var topMargin = primaryScreenHeight * VerticalMarginRatio;

        var x = primaryScreenWidth - overlaySize.Width - rightMargin;
        var y = topMargin;

        return new Point(x, y);
    }

    public void ApplyLayout(Window window)
    {
        var primaryScreenWidth = SystemParameters.PrimaryScreenWidth;
        var primaryScreenHeight = SystemParameters.PrimaryScreenHeight;

        var size = CalculateSize(primaryScreenWidth, primaryScreenHeight);
        var position = CalculatePosition(primaryScreenWidth, primaryScreenHeight, size);

        window.Width = size.Width;
        window.Height = size.Height;
        window.Left = position.X;
        window.Top = position.Y;
    }
}
