using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
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
    private const int ExitAppHotkeyId = 7;
    private const int TogglePlaybackHotkeyId = 8;
    private const int IncreaseVolumeHotkeyId = 9;
    private const int DecreaseVolumeHotkeyId = 10;
    private const int SeekBackwardHotkeyId = 11;
    private const int SeekForwardHotkeyId = 12;
    private const int ToggleMuteHotkeyId = 13;
    private const int NavigateHomeHotkeyId = 14;

    private const double MinOpacity = 0.40;
    private const double MaxOpacity = 1.00;
    private const double OpacityStep = 0.10;
    private const double DefaultOpacity = 1.00;
    private const string YouTubeHomeUrl = "https://www.youtube.com";
    private const string YouTubeSearchUrlPrefix = "https://www.youtube.com/results?search_query=";
    private const int LayoutAnimationMilliseconds = 160;
    private const int IndicatorVisibleMilliseconds = 1200;
    private const int HotkeyHintVisibleMilliseconds = 3000;
    private const double VolumeStep = 0.10;
    private static readonly bool EnableAudioFeedback = false;

    private readonly OverlayLayoutService _overlayLayoutService = new();
    private readonly ConfigService _configService = new();
    private GlobalHotkeyService? _globalHotkeyService;
    private OverlayWindowModeService? _overlayWindowModeService;
    private HwndSource? _hwndSource;
    private OverlayConfig _overlayConfig = new();
    private bool _isInteractMode;
    private bool _isWebViewInitialized;
    private double _currentOpacity = DefaultOpacity;
    private OverlayLayoutMode _layoutMode = OverlayLayoutMode.Normal;
    private readonly DispatcherTimer _indicatorHideTimer = new();
    private readonly DispatcherTimer _hotkeyHintHideTimer = new();
    private bool _pendingVideoUiOptimization;
    private int _layoutTransitionVersion;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        SourceInitialized += OnSourceInitialized;
        Closed += OnClosed;

        _indicatorHideTimer.Interval = TimeSpan.FromMilliseconds(IndicatorVisibleMilliseconds);
        _indicatorHideTimer.Tick += OnIndicatorHideTimerTick;
        _hotkeyHintHideTimer.Interval = TimeSpan.FromMilliseconds(HotkeyHintVisibleMilliseconds);
        _hotkeyHintHideTimer.Tick += OnHotkeyHintHideTimerTick;
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
        _layoutMode = GetInitialLayoutMode();

        RegisterGlobalHotkeys();
        SetInteractMode(_layoutMode == OverlayLayoutMode.Search, showIndicator: false);
        ApplyLayoutMode(_layoutMode, animate: false, showIndicator: false);
        UpdateSearchPlaceholderVisibility();
        ShowHotkeyHintIfNeeded();
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
        if (OverlayWebView.CoreWebView2 is not null)
        {
            OverlayWebView.CoreWebView2.SourceChanged -= OnWebViewSourceChanged;
        }
        _indicatorHideTimer.Tick -= OnIndicatorHideTimerTick;
        _hotkeyHintHideTimer.Tick -= OnHotkeyHintHideTimerTick;
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

        if (!_globalHotkeyService.Register(ExitAppHotkeyId, modifiers, (uint)'Q', ExitApplication))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to register Ctrl+Alt+Q hotkey.");
        }

        if (!_globalHotkeyService.Register(TogglePlaybackHotkeyId, modifiers, (uint)'P', TogglePlayback))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to register Ctrl+Alt+P hotkey.");
        }

        if (!_globalHotkeyService.Register(IncreaseVolumeHotkeyId, modifiers, NativeMethods.VK_RIGHT, IncreaseVolume))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to register Ctrl+Alt+Right hotkey.");
        }

        if (!_globalHotkeyService.Register(DecreaseVolumeHotkeyId, modifiers, NativeMethods.VK_LEFT, DecreaseVolume))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to register Ctrl+Alt+Left hotkey.");
        }

        if (!_globalHotkeyService.Register(SeekBackwardHotkeyId, modifiers, (uint)'K', SeekBackward) &&
            !_globalHotkeyService.Register(SeekBackwardHotkeyId, modifiers, NativeMethods.VK_OEM_COMMA, SeekBackward))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to register Ctrl+Alt+K (or Ctrl+Alt+,) hotkey.");
        }

        if (!_globalHotkeyService.Register(SeekForwardHotkeyId, modifiers, (uint)'L', SeekForward) &&
            !_globalHotkeyService.Register(SeekForwardHotkeyId, modifiers, NativeMethods.VK_OEM_PERIOD, SeekForward))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to register Ctrl+Alt+L (or Ctrl+Alt+.) hotkey.");
        }

        if (!_globalHotkeyService.Register(ToggleMuteHotkeyId, modifiers, (uint)'M', ToggleMute))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to register Ctrl+Alt+M hotkey.");
        }

        if (!_globalHotkeyService.Register(NavigateHomeHotkeyId, modifiers, (uint)'H', NavigateHome))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Failed to register Ctrl+Alt+H hotkey.");
        }
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        _ = hwnd;
        _ = wParam;
        _ = lParam;

        if (msg == NativeMethods.WM_NCHITTEST && !_isInteractMode)
        {
            handled = true;
            return new IntPtr(NativeMethods.HTTRANSPARENT);
        }

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
            PlayFeedbackTone();
            Hide();
            return;
        }

        Show();
        _overlayWindowModeService?.EnsureTopmost();
        ShowHotkeyFeedback("VISIBLE");
        PlayFeedbackTone();
    }

    private void ToggleInteractMode()
    {
        if (_layoutMode == OverlayLayoutMode.Search)
        {
            // No-op by design: search mode must stay interactive.
            return;
        }

        SetInteractMode(!_isInteractMode, showIndicator: true);
    }

    private void ToggleSearchMode()
    {
        if (_layoutMode == OverlayLayoutMode.Search)
        {
            EnterTheaterMode(animate: true, showIndicator: true);
            ShowHotkeyFeedback("THEATER MODE");
            PlayFeedbackTone();
            return;
        }

        _ = ExitWebContentFullscreenIfNeededAsync();
        ApplyLayoutMode(OverlayLayoutMode.Search, animate: true, showIndicator: true);
        NavigateToSearchHome();
        FocusSearchBarWithActivation();
        ShowHotkeyFeedback("SEARCH MODE");
        PlayFeedbackTone();
    }

    private void ExitApplication()
    {
        PlayFeedbackTone();
        Close();
    }

    private async void TogglePlayback()
    {
        if (OverlayWebView.CoreWebView2 is null)
        {
            return;
        }

        const string script = """
            (() => {
              const video = document.querySelector('video');
              if (!video) return false;
              if (video.paused) video.play();
              else video.pause();
              return true;
            })();
            """;

        try
        {
            _ = await OverlayWebView.CoreWebView2.ExecuteScriptAsync(script);
            ShowHotkeyFeedback("PLAY/PAUSE");
            PlayFeedbackTone();
        }
        catch
        {
            // Ignore script errors.
        }
    }

    private void IncreaseVolume()
    {
        _ = AdjustVolumeAsync(VolumeStep);
    }

    private void DecreaseVolume()
    {
        _ = AdjustVolumeAsync(-VolumeStep);
    }

    private void ToggleMute()
    {
        _ = ToggleMuteAsync();
    }

    private async Task AdjustVolumeAsync(double delta)
    {
        if (OverlayWebView.CoreWebView2 is null)
        {
            return;
        }

        var script = $$"""
            (() => {
              const video = document.querySelector('video');
              if (!video) return null;

              const nextVolume = Math.max(0, Math.min(1, (video.volume || 0) + ({{delta.ToString(System.Globalization.CultureInfo.InvariantCulture)}})));
              video.volume = nextVolume;
              if (nextVolume > 0 && video.muted) {
                video.muted = false;
              }

              return Math.round(nextVolume * 100);
            })();
            """;

        try
        {
            var result = await OverlayWebView.CoreWebView2.ExecuteScriptAsync(script);
            if (string.Equals(result, "null", StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            var trimmed = result.Trim('\"');
            if (int.TryParse(trimmed, out var percent))
            {
                ShowHotkeyFeedback($"VOLUME {percent}%");
            }
            else
            {
                ShowHotkeyFeedback("VOLUME");
            }

            PlayFeedbackTone();
        }
        catch
        {
            // Ignore script errors.
        }
    }

    private async Task ToggleMuteAsync()
    {
        if (OverlayWebView.CoreWebView2 is null)
        {
            return;
        }

        const string script = """
            (() => {
              const muteButton = document.querySelector('.ytp-mute-button');
              if (muteButton) {
                muteButton.click();
              }

              const video = document.querySelector('video');
              if (!video) {
                return null;
              }

              if (!muteButton) {
                video.muted = !video.muted;
              }

              if (!video.muted && video.volume === 0) {
                video.volume = 0.5;
              }

              return video.muted ? "ON" : "OFF";
            })();
            """;

        try
        {
            var result = await OverlayWebView.CoreWebView2.ExecuteScriptAsync(script);
            if (string.Equals(result, "null", StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            var state = result.Trim('\"');
            ShowHotkeyFeedback($"MUTE {state}");
            PlayFeedbackTone();
        }
        catch
        {
            // Ignore script errors.
        }
    }

    private void SeekBackward()
    {
        _ = SeekBySecondsAsync(-10);
    }

    private void SeekForward()
    {
        _ = SeekBySecondsAsync(10);
    }

    private void NavigateHome()
    {
        NavigateTo(YouTubeHomeUrl);
        ShowHotkeyFeedback("HOME");
        PlayFeedbackTone();
    }

    private async Task SeekBySecondsAsync(int seconds)
    {
        if (OverlayWebView.CoreWebView2 is null)
        {
            return;
        }

        var script = $$"""
            (() => {
              const video = document.querySelector('video');
              if (!video || !Number.isFinite(video.duration)) return false;
              const nextTime = Math.max(0, Math.min(video.duration, video.currentTime + ({{seconds}})));
              video.currentTime = nextTime;
              return true;
            })();
            """;

        try
        {
            var result = await OverlayWebView.CoreWebView2.ExecuteScriptAsync(script);
            if (!string.Equals(result, "true", StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            var label = seconds > 0 ? "+10s" : "-10s";
            ShowHotkeyFeedback($"SEEK {label}");
            PlayFeedbackTone();
        }
        catch
        {
            // Ignore script errors.
        }
    }

    private void IncreaseOpacity()
    {
        ApplyOpacity(_currentOpacity + OpacityStep, persist: true);
        ShowHotkeyFeedback($"OPACITY {(int)Math.Round(_currentOpacity * 100, MidpointRounding.AwayFromZero)}%");
    }

    private void DecreaseOpacity()
    {
        ApplyOpacity(_currentOpacity - OpacityStep, persist: true);
        ShowHotkeyFeedback($"OPACITY {(int)Math.Round(_currentOpacity * 100, MidpointRounding.AwayFromZero)}%");
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
        if (_layoutMode == OverlayLayoutMode.Search)
        {
            interactModeEnabled = true;
        }

        _isInteractMode = interactModeEnabled;

        var isPassMode = !_isInteractMode;
        _overlayWindowModeService?.SetPassMode(isPassMode);
        UpdateSearchInputAvailability();
        UpdateIndicatorText();

        if (showIndicator)
        {
            ShowModeIndicatorTemporarily();
            PlayFeedbackTone();
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
        OverlayWebView.CoreWebView2.SourceChanged += OnWebViewSourceChanged;

        _isWebViewInitialized = true;

        var startupUrl = GetStartupUrl(_overlayConfig.LastUrl);
        OverlayWebView.Source = new Uri(startupUrl);
    }

    private void OnWebViewNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        _ = sender;
        SetNavigationLoading(isLoading: false);

        if (!e.IsSuccess || OverlayWebView.Source is null)
        {
            return;
        }

        _overlayConfig.LastUrl = OverlayWebView.Source.ToString();
        _configService.Save(_overlayConfig);

        _ = ApplySearchModePageChromeAsync();

        if (_pendingVideoUiOptimization && IsVideoUrl(OverlayWebView.Source.ToString()))
        {
            _pendingVideoUiOptimization = false;
            _ = OptimizeVideoPageUiAsync();
        }
    }

    private void OnWebViewNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        _ = sender;
        SetNavigationLoading(isLoading: true);

        TrySwitchToTheaterFromUrl(e.Uri);
    }

    private void OnWebViewSourceChanged(object? sender, CoreWebView2SourceChangedEventArgs e)
    {
        _ = sender;
        _ = e;

        if (OverlayWebView.CoreWebView2 is null)
        {
            return;
        }

        TrySwitchToTheaterFromUrl(OverlayWebView.CoreWebView2.Source);
    }

    private void TrySwitchToTheaterFromUrl(string? url)
    {
        if (_layoutMode == OverlayLayoutMode.Search && IsVideoUrl(url))
        {
            _pendingVideoUiOptimization = true;
            Dispatcher.Invoke(() => EnterTheaterMode(animate: true, showIndicator: true));
        }
    }

    private void EnterTheaterMode(bool animate, bool showIndicator)
    {
        ApplyLayoutMode(OverlayLayoutMode.Normal, animate: animate, showIndicator: showIndicator);

        // Hard-enforce PASS after search->theater transitions to avoid sticky interaction state.
        _isInteractMode = false;
        _overlayWindowModeService?.SetPassMode(true);
        UpdateSearchInputAvailability();
        Keyboard.ClearFocus();
        _ = ApplySearchModePageChromeAsync();
    }

    private async Task OptimizeVideoPageUiAsync()
    {
        if (OverlayWebView.CoreWebView2 is null)
        {
            return;
        }

        const string optimizeScript = """
            (() => {
              const sizeButton = document.querySelector('.ytp-size-button');
              if (sizeButton) {
                const pressed = sizeButton.getAttribute('aria-pressed');
                if (pressed !== 'true') sizeButton.click();
              }

              const video = document.querySelector('video');
              if (video && video.paused) {
                const p = video.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});
              }

              const flexy = document.querySelector('ytd-watch-flexy');
              if (flexy) {
                flexy.setAttribute('theater', '');
                flexy.setAttribute('theater-requested_', '');
              }

              return true;
            })();
            """;

        for (var attempt = 0; attempt < 6; attempt++)
        {
            try
            {
                _ = await OverlayWebView.CoreWebView2.ExecuteScriptAsync(optimizeScript);
            }
            catch
            {
                // Ignore transient script errors while watch page is still loading.
            }

            await Task.Delay(220);
        }
    }

    private static string GetStartupUrl(string? lastUrl)
    {
        if (Uri.TryCreate(lastUrl, UriKind.Absolute, out var restored))
        {
            return restored.ToString();
        }

        return YouTubeSearchUrlPrefix;
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

    private async void FocusSearchBarWithActivation()
    {
        if (_layoutMode != OverlayLayoutMode.Search || !_isInteractMode || !IsVisible)
        {
            return;
        }

        Activate();
        await Dispatcher.InvokeAsync(
            () =>
            {
                Keyboard.Focus(SearchTextBox);
                SearchTextBox.Focus();
                SearchTextBox.SelectAll();
            },
            DispatcherPriority.Input);

        await Dispatcher.InvokeAsync(
            () =>
            {
                if (!SearchTextBox.IsKeyboardFocused)
                {
                    Keyboard.Focus(SearchTextBox);
                    SearchTextBox.Focus();
                    SearchTextBox.SelectAll();
                }
            },
            DispatcherPriority.Background);
    }

    private void UpdateSearchInputAvailability()
    {
        var searchMode = _layoutMode == OverlayLayoutMode.Search;
        var interactEnabled = searchMode || _isInteractMode;
        var searchAvailable = searchMode;

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

        var isSubmitKey = e.Key == Key.Enter || e.Key == Key.Return;
        if (!isSubmitKey || _layoutMode != OverlayLayoutMode.Search)
        {
            return;
        }

        SubmitSearchQuery();
        e.Handled = true;
    }

    private void OnWindowPreviewKeyDown(object sender, KeyEventArgs e)
    {
        _ = sender;

        var isSubmitKey = e.Key == Key.Enter || e.Key == Key.Return;
        if (!isSubmitKey || _layoutMode != OverlayLayoutMode.Search)
        {
            return;
        }

        SubmitSearchQuery();
        e.Handled = true;
    }

    private void SubmitSearchQuery()
    {
        var query = SearchTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(query))
        {
            return;
        }

        var encodedQuery = Uri.EscapeDataString(query);
        var targetUrl = $"{YouTubeSearchUrlPrefix}{encodedQuery}";

        NavigateTo(targetUrl);
        OverlayWebView.Focus();
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
        var transitionVersion = Interlocked.Increment(ref _layoutTransitionVersion);

        var screenWidth = SystemParameters.PrimaryScreenWidth;
        var screenHeight = SystemParameters.PrimaryScreenHeight;

        var size = mode == OverlayLayoutMode.Search
            ? _overlayLayoutService.CalculateSearchSize(screenWidth, screenHeight)
            : _overlayLayoutService.CalculateNormalSize(screenWidth, screenHeight);
        var position = _overlayLayoutService.CalculatePosition(screenWidth, screenHeight, size);

        var isSearchMode = mode == OverlayLayoutMode.Search;
        SearchRowDefinition.Height = new GridLength(isSearchMode ? 36 : 0);
        SearchBarContainer.Visibility = isSearchMode ? Visibility.Visible : Visibility.Collapsed;
        NavigationProgressBar.Visibility = Visibility.Collapsed;

        if (animate)
        {
            AnimateWindowLayout(position.X, position.Y, size.Width, size.Height);
            _ = EnsureFinalWindowBoundsAsync(position.X, position.Y, size.Width, size.Height, transitionVersion);
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
            FocusSearchBarWithActivation();
        }

        _ = ApplySearchModePageChromeAsync();
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
            : OverlayLayoutMode.Normal;
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
        NavigateTo(YouTubeSearchUrlPrefix);
    }

    private void NavigateTo(string url)
    {
        if (OverlayWebView.CoreWebView2 is not null)
        {
            OverlayWebView.CoreWebView2.Navigate(url);
            return;
        }

        OverlayWebView.Source = new Uri(url);
    }

    private OverlayLayoutMode GetInitialLayoutMode()
    {
        return OverlayLayoutMode.Search;
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

    private void ShowHotkeyFeedback(string message)
    {
        ModeIndicatorTextBlock.Text = message;
        ShowModeIndicatorTemporarily();
    }

    private void SetNavigationLoading(bool isLoading)
    {
        var shouldShow = isLoading && _layoutMode == OverlayLayoutMode.Search;
        NavigationProgressBar.Visibility = shouldShow ? Visibility.Visible : Visibility.Collapsed;
    }

    private void ShowHotkeyHintIfNeeded()
    {
        if (_overlayConfig.HasShownHotkeyHint)
        {
            return;
        }

        HotkeyHintTextBlock.Visibility = Visibility.Visible;
        _hotkeyHintHideTimer.Stop();
        _hotkeyHintHideTimer.Start();

        _overlayConfig.HasShownHotkeyHint = true;
        _configService.Save(_overlayConfig);
    }

    private void OnHotkeyHintHideTimerTick(object? sender, EventArgs e)
    {
        _ = sender;
        _hotkeyHintHideTimer.Stop();
        HotkeyHintTextBlock.Visibility = Visibility.Collapsed;
    }

    private static void PlayFeedbackTone()
    {
        if (!EnableAudioFeedback)
        {
            return;
        }

        try
        {
            _ = NativeMethods.MessageBeep(NativeMethods.MB_ICONASTERISK);
        }
        catch
        {
            // Ignore audio feedback issues.
        }
    }

    private async Task EnsureFinalWindowBoundsAsync(
        double targetLeft,
        double targetTop,
        double targetWidth,
        double targetHeight,
        int expectedTransitionVersion)
    {
        await Task.Delay(LayoutAnimationMilliseconds + 25);

        if (expectedTransitionVersion != _layoutTransitionVersion)
        {
            return;
        }

        Left = targetLeft;
        Top = targetTop;
        Width = targetWidth;
        Height = targetHeight;
    }

    private async Task ExitWebContentFullscreenIfNeededAsync()
    {
        if (OverlayWebView.CoreWebView2 is null)
        {
            return;
        }

        const string exitFullscreenScript = """
            (() => {
              if (!document.fullscreenElement) return false;
              const p = document.exitFullscreen();
              if (p && typeof p.catch === 'function') p.catch(() => {});
              return true;
            })();
            """;

        try
        {
            _ = await OverlayWebView.CoreWebView2.ExecuteScriptAsync(exitFullscreenScript);
        }
        catch
        {
            // Ignore fullscreen exit failures.
        }
    }

    private async Task ApplySearchModePageChromeAsync()
    {
        if (OverlayWebView.CoreWebView2 is null)
        {
            return;
        }

        var overflowY = _layoutMode == OverlayLayoutMode.Search ? "auto" : "hidden";
        var overscroll = _layoutMode == OverlayLayoutMode.Search ? "auto" : "none";
        const string styleId = "overlay-search-mode-style";
        var script = $$"""
            (() => {
              let style = document.getElementById('{{styleId}}');
              if (!style) {
                style = document.createElement('style');
                style.id = '{{styleId}}';
                document.documentElement.appendChild(style);
              }

              style.textContent = `
                ytd-masthead, #masthead-container, tp-yt-app-header-layout #masthead {
                  display: none !important;
                }
                ytd-app, ytd-page-manager, #page-manager {
                  margin-top: 0 !important;
                  padding-top: 0 !important;
                  overflow-y: {{overflowY}} !important;
                  overscroll-behavior: {{overscroll}} !important;
                }
                html, body, #content {
                  overflow-y: {{overflowY}} !important;
                  overscroll-behavior: {{overscroll}} !important;
                }
              `;
            })();
            """;

        try
        {
            _ = await OverlayWebView.CoreWebView2.ExecuteScriptAsync(script);
        }
        catch
        {
            // Ignore transient script injection errors while page transitions.
        }
    }
}
