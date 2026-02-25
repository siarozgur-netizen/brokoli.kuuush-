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

    private readonly OverlayLayoutService _overlayLayoutService = new();
    private GlobalHotkeyService? _globalHotkeyService;
    private OverlayWindowModeService? _overlayWindowModeService;
    private HwndSource? _hwndSource;
    private bool _isInteractMode;

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

    private void SetInteractMode(bool interactModeEnabled)
    {
        _isInteractMode = interactModeEnabled;

        var isPassMode = !_isInteractMode;
        _overlayWindowModeService?.SetPassMode(isPassMode);
        ModeIndicatorTextBlock.Text = isPassMode ? "PASS" : "INTERACT";
    }
}
