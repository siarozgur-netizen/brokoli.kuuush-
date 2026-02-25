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
        var currentStyles = NativeMethods.GetWindowLongPtr(_windowHandle, NativeMethods.GWL_EXSTYLE).ToInt64();
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

        _ = NativeMethods.SetWindowLongPtr(_windowHandle, NativeMethods.GWL_EXSTYLE, new IntPtr((long)updatedStyles));
        _ = NativeMethods.SetWindowPos(
            _windowHandle,
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
}
