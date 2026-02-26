using System;
using OverlayTutorial.Interop;

namespace OverlayTutorial.Services;

public sealed class OverlayWindowModeService
{
    private readonly IntPtr _windowHandle;

    public OverlayWindowModeService(IntPtr windowHandle)
    {
        _windowHandle = windowHandle;
    }

    public void SetPassMode(bool passModeEnabled)
    {
        ApplyTransparentStyle(_windowHandle, passModeEnabled);

        _ = NativeMethods.EnumChildWindows(
            _windowHandle,
            (childHandle, _) =>
            {
                ApplyTransparentStyle(childHandle, passModeEnabled);
                return true;
            },
            IntPtr.Zero);
    }

    public void EnsureTopmost()
    {
        _ = NativeMethods.SetWindowPos(
            _windowHandle,
            NativeMethods.HWND_TOPMOST,
            0,
            0,
            0,
            0,
            NativeMethods.SWP_NOMOVE |
            NativeMethods.SWP_NOSIZE |
            NativeMethods.SWP_NOACTIVATE |
            NativeMethods.SWP_SHOWWINDOW);
    }

    private static void ApplyTransparentStyle(IntPtr handle, bool passModeEnabled)
    {
        var currentStyles = NativeMethods.GetWindowLongPtr(handle, NativeMethods.GWL_EXSTYLE).ToInt64();
        var updatedStyles = (uint)currentStyles;

        updatedStyles |= NativeMethods.WS_EX_LAYERED;

        if (passModeEnabled)
        {
            updatedStyles |= NativeMethods.WS_EX_TRANSPARENT;
        }
        else
        {
            updatedStyles &= ~NativeMethods.WS_EX_TRANSPARENT;
        }

        _ = NativeMethods.SetWindowLongPtr(handle, NativeMethods.GWL_EXSTYLE, new IntPtr((long)updatedStyles));
        _ = NativeMethods.SetWindowPos(
            handle,
            IntPtr.Zero,
            0,
            0,
            0,
            0,
            NativeMethods.SWP_NOMOVE |
            NativeMethods.SWP_NOSIZE |
            NativeMethods.SWP_NOZORDER |
            NativeMethods.SWP_NOACTIVATE |
            NativeMethods.SWP_FRAMECHANGED);
    }
}
