using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Input;
using Microsoft.Web.WebView2.Core;
using OverlayTutorial.Interop;
using OverlayTutorial.Models;
using OverlayTutorial.Services;

namespace OverlayTutorial;

public partial class MainWindow : Window
{
    private const int ToggleVisibilityHotkeyId = 1;
    private const int ToggleInteractHotkeyId = 2;
    private const int IncreaseOpacityHotkeyId = 3;
    private const int DecreaseOpacityHotkeyId = 4;
    private const int FocusSearchHotkeyId = 5;

    private const double MinOpacity = 0.40;
    private const double MaxOpacity = 1.00;
    private const double OpacityStep = 0.10;
    private const double DefaultOpacity = 1.00;
    private const string DefaultWebUrl = "https://www.youtube.com";
    private const string YouTubeSearchUrlPrefix = "https://www.youtube.com/results?search_query=";

    private readonly OverlayLayoutService _overlayLayoutService = new();
    private readonly ConfigService _configService = new();
    private GlobalHotkeyService? _globalHotkeyService;
    private OverlayWindowModeService? _overlayWindowModeService;
    private HwndSource? _hwndSource;
    private OverlayConfig _overlayConfig = new();
    private bool _isInteractMode;
    private bool _isWebViewInitialized;
    private double _currentOpacity = DefaultOpacity;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        SourceInitialized += OnSourceInitialized;
        Closed += OnClosed;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        _overlayLayoutService.ApplyLayout(this);
        try
        {
            await InitializeWebViewAsync();
        }
        catch
        {
            // Keep overlay running even if WebView2 initialization fails.
        }
    }

    private void OnSourceInitialized(object? sender, EventArgs e)
    {
        var handle = new WindowInteropHelper(this).Handle;

        _hwndSource = HwndSource.FromHwnd(handle);
        _hwndSource?.AddHook(WndProc);

        _overlayWindowModeService = new OverlayWindowModeService(handle);
        _globalHotkeyService = new GlobalHotkeyService(handle);

        _overlayConfig = _configService.LoadOrDefault();
        _currentOpacity = NormalizeOpacity(_overlayConfig.Opacity);
        _overlayConfig.Opacity = _currentOpacity;
        ApplyOpacity(_currentOpacity, persist: false);

        RegisterGlobalHotkeys();
        SetInteractMode(false);
        UpdateSearchPlaceholderVisibility();
    }

    private void OnClosed(object? sender, EventArgs e)
    {
        if (_hwndSource is not null)
        {
            _hwndSource.RemoveHook(WndProc);
        }

        _globalHotkeyService?.Dispose();
        OverlayWebView.NavigationCompleted -= OnWebViewNavigationCompleted;
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

        if (!_globalHotkeyService.Register(FocusSearchHotkeyId, modifiers, (uint)'F', FocusSearchBar))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to register Ctrl+Alt+F hotkey.");
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
            _overlayConfig.Opacity = normalized;
            _configService.Save(_overlayConfig);
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
        UpdateSearchInputAvailability();
        UpdateIndicatorText();
    }

    private void UpdateIndicatorText()
    {
        var mode = _isInteractMode ? "INTERACT" : "PASS";
        var percent = (int)Math.Round(_currentOpacity * 100, MidpointRounding.AwayFromZero);
        ModeIndicatorTextBlock.Text = $"{mode} {percent}%";
    }

    private async Task InitializeWebViewAsync()
    {
        if (_isWebViewInitialized)
        {
            return;
        }

        var userDataFolder = GetWebViewUserDataFolder();
        Directory.CreateDirectory(userDataFolder);

        var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: userDataFolder);
        await OverlayWebView.EnsureCoreWebView2Async(environment);
        OverlayWebView.NavigationCompleted += OnWebViewNavigationCompleted;

        _isWebViewInitialized = true;

        var startupUrl = GetStartupUrl(_overlayConfig.LastUrl);
        OverlayWebView.Source = new Uri(startupUrl);
    }

    private void OnWebViewNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        _ = sender;

        if (!e.IsSuccess || OverlayWebView.Source is null)
        {
            return;
        }

        _overlayConfig.LastUrl = OverlayWebView.Source.ToString();
        _configService.Save(_overlayConfig);
    }

    private static string GetStartupUrl(string? lastUrl)
    {
        if (string.IsNullOrWhiteSpace(lastUrl))
        {
            return DefaultWebUrl;
        }

        if (Uri.TryCreate(lastUrl, UriKind.Absolute, out var uri) &&
            (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
        {
            return uri.ToString();
        }

        return DefaultWebUrl;
    }

    private static string GetWebViewUserDataFolder()
    {
        var appDataPath = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        return Path.Combine(appDataPath, "OverlayTutorial", "WebViewProfile");
    }

    private void FocusSearchBar()
    {
        if (!_isInteractMode || !IsVisible)
        {
            return;
        }

        SearchTextBox.Focus();
        SearchTextBox.SelectAll();
    }

    private void UpdateSearchInputAvailability()
    {
        var interactEnabled = _isInteractMode;
        SearchBarContainer.IsHitTestVisible = interactEnabled;
        SearchTextBox.IsHitTestVisible = interactEnabled;
        SearchTextBox.IsEnabled = interactEnabled;
        SearchTextBox.Focusable = interactEnabled;

        if (!interactEnabled && SearchTextBox.IsKeyboardFocused)
        {
            Keyboard.ClearFocus();
        }

        UpdateSearchPlaceholderVisibility();
    }

    private void OnSearchTextBoxKeyDown(object sender, KeyEventArgs e)
    {
        _ = sender;

        if (e.Key != Key.Enter || !_isInteractMode)
        {
            return;
        }

        var query = SearchTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(query))
        {
            return;
        }

        var encodedQuery = Uri.EscapeDataString(query);
        var targetUrl = $"{YouTubeSearchUrlPrefix}{encodedQuery}";

        if (OverlayWebView.CoreWebView2 is not null)
        {
            OverlayWebView.CoreWebView2.Navigate(targetUrl);
        }
        else
        {
            OverlayWebView.Source = new Uri(targetUrl);
        }

        e.Handled = true;
    }

    private void OnSearchTextBoxTextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e)
    {
        _ = sender;
        _ = e;
        UpdateSearchPlaceholderVisibility();
    }

    private void OnSearchTextBoxGotFocus(object sender, RoutedEventArgs e)
    {
        _ = sender;
        _ = e;
        UpdateSearchPlaceholderVisibility();
    }

    private void OnSearchTextBoxLostFocus(object sender, RoutedEventArgs e)
    {
        _ = sender;
        _ = e;
        UpdateSearchPlaceholderVisibility();
    }

    private void UpdateSearchPlaceholderVisibility()
    {
        var shouldShow = string.IsNullOrWhiteSpace(SearchTextBox.Text) && !SearchTextBox.IsKeyboardFocused;
        SearchPlaceholderTextBlock.Visibility = shouldShow ? Visibility.Visible : Visibility.Collapsed;
    }
}
