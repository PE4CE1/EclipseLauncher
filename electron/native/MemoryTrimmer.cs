using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Eclipse
{
    class MemoryTrimmer
    {
        [DllImport("psapi.dll", SetLastError = true)]
        static extern int EmptyWorkingSet(IntPtr hwProc);

        static void Main(string[] args)
        {
            try
            {
                // If specific PIDs are provided, trim them
                if (args.Length > 0)
                {
                    foreach (string arg in args)
                    {
                        int pid;
                        if (int.TryParse(arg, out pid))
                        {
                            try
                            {
                                using (Process p = Process.GetProcessById(pid))
                                {
                                    EmptyWorkingSet(p.Handle);
                                }
                            }
                            catch { }
                        }
                    }
                    return;
                }

                // Automatic scan: trim all Eclipse Launcher, GameHub, and dev-mode Electron processes
                int myPid = Process.GetCurrentProcess().Id;
                foreach (Process p in Process.GetProcesses())
                {
                    try
                    {
                        if (p.Id == myPid) continue;
                        string name = p.ProcessName;
                        if (name.IndexOf("Eclipse", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            name.IndexOf("GameHub", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            name.IndexOf("electron", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            EmptyWorkingSet(p.Handle);
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }
    }
}
