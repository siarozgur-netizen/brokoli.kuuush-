using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using OverlayTutorial.Interop;
using OverlayTutorial.Services;

namespace OverlayTutorial;

public partial class MainWindow : Window
{
    private const int ToggleVisibilityHotkeyId = 1;
    private const int ToggleInteractHotkeyId = 2;
    private const int IncreaseOpacityHotkeyId = 3;
    private const int DecreaseOpacityHotkeyId = 4;

    private const double MinOpacity = 0.40;
    private const double MaxOpacity = 1.00;
    private const double OpacityStep = 0.10;
    private const double DefaultOpacity = 1.00;

    private readonly OverlayLayoutService _overlayLayoutService = new();
    private readonly ConfigService _configService = new();
    private GlobalHotkeyService? _globalHotkeyService;
    private OverlayWindowModeService? _overlayWindowModeService;
    private HwndSource? _hwndSource;
    private bool _isInteractMode;
    private double _currentOpacity = DefaultOpacity;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        SourceInitialized += OnSourceInitialized;
        Closed += OnClosed;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        _overlayLayoutService.ApplyLayout(this);
    }

    private void OnSourceInitialized(object? sender, EventArgs e)
    {
        var handle = new WindowInteropHelper(this).Handle;

        _hwndSource = HwndSource.FromHwnd(handle);
        _hwndSource?.AddHook(WndProc);

        _overlayWindowModeService = new OverlayWindowModeService(handle);
        _globalHotkeyService = new GlobalHotkeyService(handle);

        _currentOpacity = NormalizeOpacity(_configService.LoadOpacityOrDefault(DefaultOpacity));
        ApplyOpacity(_currentOpacity, persist: false);

        RegisterGlobalHotkeys();
        SetInteractMode(false);
    }

    private void OnClosed(object? sender, EventArgs e)
    {
        if (_hwndSource is not null)
        {
            _hwndSource.RemoveHook(WndProc);
        }

        _globalHotkeyService?.Dispose();
    }

    private void RegisterGlobalHotkeys()
    {
        if (_globalHotkeyService is null)
        {
            return;
        }

        var modifiers = NativeMethods.MOD_CONTROL | NativeMethods.MOD_ALT;

        if (!_globalHotkeyService.Register(ToggleVisibilityHotkeyId, modifiers, (uint)'O', ToggleVisibility))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to register Ctrl+Alt+O hotkey.");
        }

        if (!_globalHotkeyService.Register(ToggleInteractHotkeyId, modifiers, (uint)'I', ToggleInteractMode))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to register Ctrl+Alt+I hotkey.");
        }

        if (!_globalHotkeyService.Register(IncreaseOpacityHotkeyId, modifiers, NativeMethods.VK_UP, IncreaseOpacity))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to register Ctrl+Alt+Up hotkey.");
        }

        if (!_globalHotkeyService.Register(DecreaseOpacityHotkeyId, modifiers, NativeMethods.VK_DOWN, DecreaseOpacity))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to register Ctrl+Alt+Down hotkey.");
        }
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        _ = hwnd;
        _ = lParam;

        if (msg == NativeMethods.WM_HOTKEY && _globalHotkeyService?.HandleHotkey(wParam) == true)
        {
            handled = true;
        }

        return IntPtr.Zero;
    }

    private void ToggleVisibility()
    {
        if (IsVisible)
        {
            Hide();
            return;
        }

        Show();
        _overlayWindowModeService?.EnsureTopmost();
    }

    private void ToggleInteractMode()
    {
        SetInteractMode(!_isInteractMode);
    }

    private void IncreaseOpacity()
    {
        ApplyOpacity(_currentOpacity + OpacityStep, persist: true);
    }

    private void DecreaseOpacity()
    {
        ApplyOpacity(_currentOpacity - OpacityStep, persist: true);
    }

    private void ApplyOpacity(double value, bool persist)
    {
        var normalized = NormalizeOpacity(value);
        _currentOpacity = normalized;
        Opacity = normalized;

        if (persist)
        {
            _configService.SaveOpacity(normalized);
        }

        UpdateIndicatorText();
    }

    private static double NormalizeOpacity(double value)
    {
        var rounded = Math.Round(value, 2, MidpointRounding.AwayFromZero);
        return Math.Clamp(rounded, MinOpacity, MaxOpacity);
    }

    private void SetInteractMode(bool interactModeEnabled)
    {
        _isInteractMode = interactModeEnabled;

        var isPassMode = !_isInteractMode;
        _overlayWindowModeService?.SetPassMode(isPassMode);
        UpdateIndicatorText();
    }

    private void UpdateIndicatorText()
    {
        var mode = _isInteractMode ? "INTERACT" : "PASS";
        var percent = (int)Math.Round(_currentOpacity * 100, MidpointRounding.AwayFromZero);
        ModeIndicatorTextBlock.Text = $"{mode} {percent}%";
    }
}
