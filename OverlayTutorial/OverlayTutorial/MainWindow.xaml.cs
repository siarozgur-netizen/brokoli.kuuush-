using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Media.Animation;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Input;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using OverlayTutorial.Interop;
using OverlayTutorial.Models;
using OverlayTutorial.Services;

namespace OverlayTutorial;

public partial class MainWindow : Window
{
    private enum OverlayLayoutMode
    {
        Normal = 0,
        Search = 1
    }

    private const int ToggleVisibilityHotkeyId = 1;
    private const int ToggleInteractHotkeyId = 2;
    private const int IncreaseOpacityHotkeyId = 3;
    private const int DecreaseOpacityHotkeyId = 4;
    private const int FocusSearchHotkeyId = 5;
    private const int ToggleSearchModeHotkeyId = 6;

    private const double MinOpacity = 0.40;
    private const double MaxOpacity = 1.00;
    private const double OpacityStep = 0.10;
    private const double DefaultOpacity = 1.00;
    private const string YouTubeSearchUrlPrefix = "https://www.youtube.com/results?search_query=";
    private const int LayoutAnimationMilliseconds = 160;
    private const int IndicatorVisibleMilliseconds = 1200;

    private readonly OverlayLayoutService _overlayLayoutService = new();
    private readonly ConfigService _configService = new();
    private GlobalHotkeyService? _globalHotkeyService;
    private OverlayWindowModeService? _overlayWindowModeService;
    private HwndSource? _hwndSource;
    private OverlayConfig _overlayConfig = new();
    private bool _isInteractMode;
    private bool _isWebViewInitialized;
    private double _currentOpacity = DefaultOpacity;
    private OverlayLayoutMode _layoutMode = OverlayLayoutMode.Search;
    private readonly DispatcherTimer _indicatorHideTimer = new();

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        SourceInitialized += OnSourceInitialized;
        Closed += OnClosed;

        _indicatorHideTimer.Interval = TimeSpan.FromMilliseconds(IndicatorVisibleMilliseconds);
        _indicatorHideTimer.Tick += OnIndicatorHideTimerTick;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        ApplyLayoutMode(GetInitialLayoutMode(), animate: false, showIndicator: false);
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
        _layoutMode = ParseLayoutMode(_overlayConfig.PreferredLayoutMode);

        RegisterGlobalHotkeys();
        SetInteractMode(_layoutMode == OverlayLayoutMode.Search, showIndicator: false);
        ApplyLayoutMode(_layoutMode, animate: false, showIndicator: false);
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
        OverlayWebView.NavigationStarting -= OnWebViewNavigationStarting;
        _indicatorHideTimer.Tick -= OnIndicatorHideTimerTick;
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

        if (!_globalHotkeyService.Register(ToggleSearchModeHotkeyId, modifiers, (uint)'S', ToggleSearchMode))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to register Ctrl+Alt+S hotkey.");
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
        // Search mode must always be interactive; normal mode must stay pass-through.
        if (_layoutMode == OverlayLayoutMode.Search)
        {
            SetInteractMode(true, showIndicator: true);
        }
        else
        {
            SetInteractMode(false, showIndicator: true);
        }
    }

    private void ToggleSearchMode()
    {
        if (_layoutMode == OverlayLayoutMode.Search)
        {
            ApplyLayoutMode(OverlayLayoutMode.Normal, animate: true, showIndicator: true);
            return;
        }

        ApplyLayoutMode(OverlayLayoutMode.Search, animate: true, showIndicator: true);
        NavigateToSearchHome();
        FocusSearchBar();
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

    private void SetInteractMode(bool interactModeEnabled, bool showIndicator = false)
    {
        _isInteractMode = interactModeEnabled;

        var isPassMode = !_isInteractMode;
        _overlayWindowModeService?.SetPassMode(isPassMode);
        UpdateSearchInputAvailability();
        UpdateIndicatorText();

        if (showIndicator)
        {
            ShowModeIndicatorTemporarily();
        }
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
        OverlayWebView.NavigationStarting += OnWebViewNavigationStarting;

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

    private void OnWebViewNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        _ = sender;

        if (_layoutMode == OverlayLayoutMode.Search && IsVideoUrl(e.Uri))
        {
            Dispatcher.Invoke(() => ApplyLayoutMode(OverlayLayoutMode.Normal, animate: true, showIndicator: true));
        }
    }

    private static string GetStartupUrl(string? lastUrl)
    {
        if (string.IsNullOrWhiteSpace(lastUrl))
        {
            return $"{YouTubeSearchUrlPrefix}";
        }

        if (Uri.TryCreate(lastUrl, UriKind.Absolute, out var uri) &&
            (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
        {
            return uri.ToString();
        }

        return $"{YouTubeSearchUrlPrefix}";
    }

    private static string GetWebViewUserDataFolder()
    {
        var appDataPath = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        return Path.Combine(appDataPath, "OverlayTutorial", "WebViewProfile");
    }

    private void FocusSearchBar()
    {
        if (!_isInteractMode || !IsVisible || _layoutMode != OverlayLayoutMode.Search)
        {
            return;
        }

        SearchTextBox.Focus();
        SearchTextBox.SelectAll();
    }

    private void UpdateSearchInputAvailability()
    {
        var interactEnabled = _isInteractMode;
        var searchAvailable = interactEnabled && _layoutMode == OverlayLayoutMode.Search;

        OverlayWebView.IsHitTestVisible = interactEnabled;
        SearchBarContainer.IsHitTestVisible = searchAvailable;
        SearchTextBox.IsHitTestVisible = searchAvailable;
        SearchTextBox.IsEnabled = searchAvailable;
        SearchTextBox.Focusable = searchAvailable;

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

    private void ApplyLayoutMode(OverlayLayoutMode mode, bool animate, bool showIndicator = true)
    {
        _layoutMode = mode;
        _overlayConfig.PreferredLayoutMode = mode.ToString();
        _configService.Save(_overlayConfig);

        var screenWidth = SystemParameters.PrimaryScreenWidth;
        var screenHeight = SystemParameters.PrimaryScreenHeight;

        var size = mode == OverlayLayoutMode.Search
            ? _overlayLayoutService.CalculateSearchSize(screenWidth, screenHeight)
            : _overlayLayoutService.CalculateNormalSize(screenWidth, screenHeight);
        var position = _overlayLayoutService.CalculatePosition(screenWidth, screenHeight, size);

        var isSearchMode = mode == OverlayLayoutMode.Search;
        SearchRowDefinition.Height = new GridLength(isSearchMode ? 36 : 0);
        SearchBarContainer.Visibility = isSearchMode ? Visibility.Visible : Visibility.Collapsed;

        if (animate)
        {
            AnimateWindowLayout(position.X, position.Y, size.Width, size.Height);
        }
        else
        {
            Left = position.X;
            Top = position.Y;
            Width = size.Width;
            Height = size.Height;
        }

        if (!isSearchMode)
        {
            SetInteractMode(false, showIndicator);
        }
        else
        {
            SetInteractMode(true, showIndicator);
        }
    }

    private void AnimateWindowLayout(double targetLeft, double targetTop, double targetWidth, double targetHeight)
    {
        var duration = TimeSpan.FromMilliseconds(LayoutAnimationMilliseconds);
        var easing = new QuadraticEase { EasingMode = EasingMode.EaseOut };

        BeginAnimation(LeftProperty, new DoubleAnimation(targetLeft, duration) { EasingFunction = easing });
        BeginAnimation(TopProperty, new DoubleAnimation(targetTop, duration) { EasingFunction = easing });
        BeginAnimation(WidthProperty, new DoubleAnimation(targetWidth, duration) { EasingFunction = easing });
        BeginAnimation(HeightProperty, new DoubleAnimation(targetHeight, duration) { EasingFunction = easing });
    }

    private static OverlayLayoutMode ParseLayoutMode(string? modeValue)
    {
        return Enum.TryParse<OverlayLayoutMode>(modeValue, ignoreCase: true, out var parsedMode)
            ? parsedMode
            : OverlayLayoutMode.Search;
    }

    private static bool IsVideoUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return false;
        }

        return url.Contains("youtube.com/watch", StringComparison.OrdinalIgnoreCase) ||
               url.Contains("youtube.com/shorts", StringComparison.OrdinalIgnoreCase) ||
               url.Contains("youtu.be/", StringComparison.OrdinalIgnoreCase);
    }

    private void NavigateToSearchHome()
    {
        if (OverlayWebView.CoreWebView2 is not null)
        {
            OverlayWebView.CoreWebView2.Navigate($"{YouTubeSearchUrlPrefix}");
        }
        else
        {
            OverlayWebView.Source = new Uri($"{YouTubeSearchUrlPrefix}");
        }
    }

    private OverlayLayoutMode GetInitialLayoutMode()
    {
        return ParseLayoutMode(_overlayConfig.PreferredLayoutMode);
    }

    private void ShowModeIndicatorTemporarily()
    {
        ModeIndicatorTextBlock.Visibility = Visibility.Visible;
        _indicatorHideTimer.Stop();
        _indicatorHideTimer.Start();
    }

    private void OnIndicatorHideTimerTick(object? sender, EventArgs e)
    {
        _ = sender;
        _indicatorHideTimer.Stop();
        ModeIndicatorTextBlock.Visibility = Visibility.Collapsed;
    }
}
