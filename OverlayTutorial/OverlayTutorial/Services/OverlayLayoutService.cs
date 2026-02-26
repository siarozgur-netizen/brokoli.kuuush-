using System.Windows;

namespace OverlayTutorial.Services;

public sealed class OverlayLayoutService
{
    private const double NormalWidthRatio = 0.26;
    private const double NormalAspectRatioWidth = 16.0;
    private const double NormalAspectRatioHeight = 9.0;
    private const double SearchWidthRatio = 0.18;
    private const double SearchAspectRatioWidth = 9.0;
    private const double SearchAspectRatioHeight = 16.0;
    private const double HorizontalMarginRatio = 0.03;
    private const double VerticalMarginRatio = 0.03;

    public Size CalculateNormalSize(double primaryScreenWidth, double primaryScreenHeight)
    {
        _ = primaryScreenHeight;

        var width = primaryScreenWidth * NormalWidthRatio;
        var height = width * (NormalAspectRatioHeight / NormalAspectRatioWidth);

        return new Size(width, height);
    }

    public Size CalculateSearchSize(double primaryScreenWidth, double primaryScreenHeight)
    {
        var width = primaryScreenWidth * SearchWidthRatio;
        var height = width * (SearchAspectRatioHeight / SearchAspectRatioWidth);

        var maxHeight = primaryScreenHeight - (primaryScreenHeight * VerticalMarginRatio * 2);
        if (height > maxHeight)
        {
            height = maxHeight;
            width = height * (SearchAspectRatioWidth / SearchAspectRatioHeight);
        }

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

        var size = CalculateNormalSize(primaryScreenWidth, primaryScreenHeight);
        var position = CalculatePosition(primaryScreenWidth, primaryScreenHeight, size);

        window.Width = size.Width;
        window.Height = size.Height;
        window.Left = position.X;
        window.Top = position.Y;
    }
}
