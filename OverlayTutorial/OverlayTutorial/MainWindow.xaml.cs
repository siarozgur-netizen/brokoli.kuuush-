using System.Windows;
using OverlayTutorial.Services;

namespace OverlayTutorial;

public partial class MainWindow : Window
{
    private readonly OverlayLayoutService _overlayLayoutService = new();

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        _overlayLayoutService.ApplyLayout(this);
    }
}
