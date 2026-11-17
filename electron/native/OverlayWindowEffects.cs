using System;
using System.Runtime.InteropServices;

internal static class OverlayWindowEffects
{
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr window, uint attribute, ref int value, uint size);

    private static int Main(string[] args)
    {
        long handle; uint expected, actual;
        if (args.Length != 2 || !long.TryParse(args[0], out handle) || handle <= 0 || !uint.TryParse(args[1], out expected)) return 2;
        var window = new IntPtr(handle);
        if (GetWindowThreadProcessId(window, out actual) == 0 || actual != expected) return 3;
        // Only this HUD window changes; desktop-wide animation preferences stay intact.
        const uint TransitionsForceDisabled = 3;
        int disabled = 1;
        if (DwmSetWindowAttribute(window, TransitionsForceDisabled, ref disabled, 4) < 0) return 4;
        Console.Write("1");
        return 0;
    }
}
