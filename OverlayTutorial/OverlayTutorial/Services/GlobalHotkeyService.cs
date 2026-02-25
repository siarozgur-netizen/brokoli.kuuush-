using System;
using System.Collections.Generic;
using OverlayTutorial.Interop;

namespace OverlayTutorial.Services;

public sealed class GlobalHotkeyService : IDisposable
{
    private readonly IntPtr _windowHandle;
    private readonly Dictionary<int, Action> _callbacks = new();
    private bool _isDisposed;

    public GlobalHotkeyService(IntPtr windowHandle)
    {
        _windowHandle = windowHandle;
    }

    public bool Register(int id, uint modifiers, uint virtualKey, Action callback)
    {
        ThrowIfDisposed();

        if (!NativeMethods.RegisterHotKey(_windowHandle, id, modifiers, virtualKey))
        {
            return false;
        }

        _callbacks[id] = callback;
        return true;
    }

    public bool HandleHotkey(IntPtr wParam)
    {
        if (_isDisposed)
        {
            return false;
        }

        var hotkeyId = wParam.ToInt32();
        if (_callbacks.TryGetValue(hotkeyId, out var callback))
        {
            callback();
            return true;
        }

        return false;
    }

    public void Dispose()
    {
        if (_isDisposed)
        {
            return;
        }

        foreach (var id in _callbacks.Keys)
        {
            _ = NativeMethods.UnregisterHotKey(_windowHandle, id);
        }

        _callbacks.Clear();
        _isDisposed = true;
    }

    private void ThrowIfDisposed()
    {
        if (_isDisposed)
        {
            throw new ObjectDisposedException(nameof(GlobalHotkeyService));
        }
    }
}
