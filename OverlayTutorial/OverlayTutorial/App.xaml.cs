using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Threading;

namespace OverlayTutorial;

public partial class App : System.Windows.Application
{
    private static readonly object LogLock = new();
    private const int StartupFlashMilliseconds = 320;
    private const int StartupGuideMilliseconds = 5000;

    protected override void OnStartup(StartupEventArgs e)
    {
        RegisterGlobalExceptionHandlers();
        base.OnStartup(e);

        RunStartupSequence();
    }

    private async void RunStartupSequence()
    {
        StartupFlashWindow? flashWindow = null;
        try
        {
            flashWindow = new StartupFlashWindow();
            MainWindow = flashWindow;
            flashWindow.Show();
            await Task.Delay(StartupFlashMilliseconds);
        }
        catch
        {
            // If flash initialization fails, continue directly to main window.
        }

        var window = new MainWindow();
        MainWindow = window;
        window.Show();

        _ = ShowStartupGuideAsync();

        flashWindow?.Close();
    }

    private async Task ShowStartupGuideAsync()
    {
        StartupGuideWindow? guideWindow = null;
        try
        {
            guideWindow = new StartupGuideWindow();
            guideWindow.Show();
            await Task.Delay(StartupGuideMilliseconds);
        }
        catch
        {
            // Keep startup resilient even if guide window fails.
        }
        finally
        {
            guideWindow?.Close();
        }
    }

    private void RegisterGlobalExceptionHandlers()
    {
        DispatcherUnhandledException += OnDispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += OnCurrentDomainUnhandledException;
        TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;
    }

    private static void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        _ = sender;
        LogException("DispatcherUnhandledException", e.Exception);
        e.Handled = true;
    }

    private static void OnCurrentDomainUnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        _ = sender;
        if (e.ExceptionObject is Exception ex)
        {
            LogException("AppDomainUnhandledException", ex);
            return;
        }

        LogLine($"[{DateTime.UtcNow:O}] [AppDomainUnhandledException] Non-exception error object");
    }

    private static void OnUnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        _ = sender;
        LogException("TaskSchedulerUnobservedTaskException", e.Exception);
        e.SetObserved();
    }

    private static void LogException(string source, Exception exception)
    {
        LogLine($"[{DateTime.UtcNow:O}] [{source}] {exception}");
    }

    private static void LogLine(string message)
    {
        try
        {
            var appDataPath = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            var logDirectory = Path.Combine(appDataPath, "OverlayTutorial", "logs");
            Directory.CreateDirectory(logDirectory);
            var logPath = Path.Combine(logDirectory, "overlay.log");

            lock (LogLock)
            {
                File.AppendAllText(logPath, message + Environment.NewLine, Encoding.UTF8);
            }
        }
        catch
        {
            // Last-resort: ignore logging failures.
        }
    }
}
