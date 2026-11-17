using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

[assembly: AssemblyTitle("Eclipse FPS Helper")]
[assembly: AssemblyDescription("Read-only frame-rate capture for Eclipse Launcher")]
[assembly: AssemblyProduct("Eclipse Launcher")]
[assembly: AssemblyVersion("2.0.0.0")]

internal static class FpsBroker
{
    static readonly object outputLock = new object();
    static StreamWriter output;
    static Process collector;
    static string session;
    static string executable;
    static long generation;
    static readonly StringBuilder pendingCsv = new StringBuilder(32768);
    static Timer flushTimer;

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetNamedPipeServerProcessId(IntPtr pipe, out uint serverPid);

    static int Main(string[] args)
    {
        int parentPid;
        if ((args.Length != 2 && args.Length != 3) || !Regex.IsMatch(args[0], "^EclipseFps_[a-f0-9]{32}$") ||
            !int.TryParse(args[1], out parentPid) || parentPid <= 0 || (args.Length == 3 && args[2] != "--collector")) return 2;
        try
        {
            if (args.Length == 3) return Collect(args[0], parentPid);
            bool elevated = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
            if (elevated) return Collect(args[0], parentPid);
            // Only this read-only helper is elevated, following an explicit UI action.
            using (Process helper = Process.Start(new ProcessStartInfo {
                FileName = Assembly.GetExecutingAssembly().Location,
                Arguments = args[0] + " " + parentPid + " --collector",
                UseShellExecute = true, Verb = "runas", WindowStyle = ProcessWindowStyle.Hidden
            })) { helper.WaitForExit(); return helper.ExitCode; }
        }
        catch (Win32Exception error) { return error.NativeErrorCode == 1223 ? 1223 : 3; }
        catch (Exception error) { try { Console.Error.WriteLine(error); } catch { } return 3; }
    }

    static int Collect(string pipeName, int parentPid)
    {
        executable = Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location), "PresentMon.exe");
        using (SHA256 hash = SHA256.Create())
        using (FileStream file = File.OpenRead(executable))
            if (BitConverter.ToString(hash.ComputeHash(file)).Replace("-", "").ToLowerInvariant() !=
                "b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af") return 4;

        using (var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous))
        {
            pipe.Connect(10000);
            uint serverPid;
            // Do not send elevated data to a pipe that has been replaced by another process.
            if (!GetNamedPipeServerProcessId(pipe.SafePipeHandle.DangerousGetHandle(), out serverPid) || serverPid != parentPid) return 5;
            using (output = new StreamWriter(pipe, new UTF8Encoding(false), 32768, true))
            using (var input = new StreamReader(pipe, Encoding.UTF8, false, 4096, true))
            {
                try
                {
                    Write("!ready");
                    string command;
                    while ((command = input.ReadLine()) != null)
                    {
                        if (command == "close") break;
                        int pid;
                        if (!command.StartsWith("target:", StringComparison.Ordinal) || command.Length > 24 ||
                            !int.TryParse(command.Substring(7), out pid) || pid < 0) break;
                        StopCollector();
                        if (pid > 0) StartCollector(pid);
                    }
                }
                finally { StopCollector(); }
            }
        }
        return 0;
    }

    static void Write(string line)
    {
        lock (outputLock)
        {
            try { output.WriteLine(line); output.Flush(); }
            catch (IOException) { }
            catch (ObjectDisposedException) { }
        }
    }

    static void BufferCsv(int pid, long token, string line)
    {
        lock (outputLock)
        {
            if (token != Interlocked.Read(ref generation)) return;
            pendingCsv.Append("!csv\t").Append(pid).Append('\t').Append(line).Append('\n');
            if (pendingCsv.Length >= 65536) FlushCsv(token);
        }
    }

    static void FlushCsv(long token)
    {
        lock (outputLock)
        {
            if (token != Interlocked.Read(ref generation) || pendingCsv.Length == 0) return;
            // Forward every original frame, but wake the launcher four times a
            // second instead of flushing a named pipe for every presented frame.
            string batch = pendingCsv.ToString();
            pendingCsv.Length = 0;
            try { output.Write(batch); output.Flush(); }
            catch (IOException) { }
            catch (ObjectDisposedException) { }
        }
    }

    static void StartCollector(int pid)
    {
        long token = Interlocked.Increment(ref generation);
        lock (outputLock) { pendingCsv.Length = 0; }
        flushTimer = new Timer(state => FlushCsv(token), null, 250, 250);
        session = "EclipseFps_" + Process.GetCurrentProcess().Id + "_" + token;
        var process = new Process { EnableRaisingEvents = true, StartInfo = new ProcessStartInfo {
            FileName = executable,
            Arguments = "--process_id " + pid + " --output_stdout --no_console_stats --no_track_display --no_track_gpu --no_track_input --v1_metrics --session_name " + session + " --terminate_on_proc_exit",
            UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden,
            RedirectStandardOutput = true, RedirectStandardError = true
        }};
        int denied = 0;
        process.OutputDataReceived += (sender, data) => {
            if (data.Data != null && token == Interlocked.Read(ref generation)) BufferCsv(pid, token, data.Data);
        };
        process.ErrorDataReceived += (sender, data) => {
            if (data.Data != null && token == Interlocked.Read(ref generation) && data.Data.IndexOf("access denied", StringComparison.OrdinalIgnoreCase) >= 0) {
                Interlocked.Exchange(ref denied, 1);
                Write("!status\t" + pid + "\tpermission-required");
            }
        };
        process.Exited += (sender, data) => {
            if (token == Interlocked.Read(ref generation)) {
                // Drain the final stderr event before choosing the exit status.
                ThreadPool.QueueUserWorkItem(state => {
                    try { process.WaitForExit(); FlushCsv(token);
                        if (token == Interlocked.Read(ref generation)) Write("!status\t" + pid + "\t" +
                            (Interlocked.CompareExchange(ref denied, 0, 0) != 0 ? "permission-required" : process.ExitCode == 0 ? "no-frames" : "error"));
                    } catch (InvalidOperationException) { }
                });
            }
        };
        collector = process;
        try { process.Start(); process.BeginOutputReadLine(); process.BeginErrorReadLine(); }
        catch { Write("!status\t" + pid + "\tunavailable"); StopCollector(); }
    }

    static void StopCollector()
    {
        Interlocked.Increment(ref generation);
        Timer timer = flushTimer; flushTimer = null;
        if (timer != null) timer.Dispose();
        lock (outputLock) { pendingCsv.Length = 0; }
        Process previous = collector;
        collector = null;
        if (previous == null) return;
        try
        {
            if (!previous.HasExited)
            {
                using (Process stop = Process.Start(new ProcessStartInfo {
                    FileName = executable, Arguments = "--session_name " + session + " --terminate_existing_session",
                    UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden
                })) { if (!stop.WaitForExit(1500)) stop.Kill(); }
                if (!previous.WaitForExit(500)) previous.Kill();
            }
        }
        catch (InvalidOperationException) { }
        catch (Win32Exception) { }
        finally {
            try { if (!previous.HasExited) previous.Kill(); } catch { }
            previous.Dispose();
        }
    }
}
