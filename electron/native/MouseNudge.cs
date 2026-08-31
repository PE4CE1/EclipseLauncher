using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace Eclipse
{
    class Program
    {
        [DllImport("user32.dll")]
        static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);

        const uint MOUSEEVENTF_MOVE = 0x0001;

        static void Main(string[] args)
        {
            mouse_event(MOUSEEVENTF_MOVE, 1, 0, 0, 0);
            Thread.Sleep(10);
            mouse_event(MOUSEEVENTF_MOVE, unchecked((uint)-1), 0, 0, 0);
        }
    }
}
