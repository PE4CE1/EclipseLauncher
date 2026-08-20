using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace EclipseXInput
{
    [StructLayout(LayoutKind.Sequential)]
    public struct XINPUT_GAMEPAD
    {
        public UInt16 wButtons;
        public Byte bLeftTrigger;
        public Byte bRightTrigger;
        public Int16 sThumbLX;
        public Int16 sThumbLY;
        public Int16 sThumbRX;
        public Int16 sThumbRY;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct XINPUT_STATE
    {
        public UInt32 dwPacketNumber;
        public XINPUT_GAMEPAD Gamepad;
    }

    class Program
    {
        // P/Invoke XInput
        [DllImport("xinput1_4.dll", EntryPoint = "XInputGetState")]
        private static extern UInt32 XInput14_GetState(UInt32 dwUserIndex, ref XINPUT_STATE pState);

        [DllImport("xinput1_3.dll", EntryPoint = "XInputGetState")]
        private static extern UInt32 XInput13_GetState(UInt32 dwUserIndex, ref XINPUT_STATE pState);

        [DllImport("xinput9_1_0.dll", EntryPoint = "XInputGetState")]
        private static extern UInt32 XInput91_GetState(UInt32 dwUserIndex, ref XINPUT_STATE pState);

        private static int xinputVersion = 0; // 0 = unknown, 14 = 1.4, 13 = 1.3, 91 = 9.1.0

        private static UInt32 GetState(UInt32 userIndex, ref XINPUT_STATE state)
        {
            if (xinputVersion == 14)
            {
                try { return XInput14_GetState(userIndex, ref state); } catch { xinputVersion = 13; }
            }
            if (xinputVersion == 13)
            {
                try { return XInput13_GetState(userIndex, ref state); } catch { xinputVersion = 91; }
            }
            if (xinputVersion == 91)
            {
                try { return XInput91_GetState(userIndex, ref state); } catch { return 1167; }
            }

            // Detect available DLL
            try
            {
                UInt32 res = XInput14_GetState(userIndex, ref state);
                xinputVersion = 14;
                return res;
            }
            catch
            {
                try
                {
                    UInt32 res = XInput13_GetState(userIndex, ref state);
                    xinputVersion = 13;
                    return res;
                }
                catch
                {
                    try
                    {
                        UInt32 res = XInput91_GetState(userIndex, ref state);
                        xinputVersion = 91;
                        return res;
                    }
                    catch
                    {
                        xinputVersion = -1;
                        return 1167; // ERROR_DEVICE_NOT_CONNECTED
                    }
                }
            }
        }

        static void Main(string[] args)
        {
            Console.OutputEncoding = System.Text.Encoding.UTF8;
            var writer = new StreamWriter(Console.OpenStandardOutput(), System.Text.Encoding.UTF8);
            writer.AutoFlush = true;

            int lastButtons = -1;
            int lastLT = -1, lastRT = -1;
            int lastLX = 0, lastLY = 0, lastRX = 0, lastRY = 0;
            bool wasConnected = false;
            int heartbeat = 0;

            while (true)
            {
                bool found = false;
                XINPUT_STATE activeState = new XINPUT_STATE();

                for (uint i = 0; i < 4; i++)
                {
                    XINPUT_STATE s = new XINPUT_STATE();
                    if (GetState(i, ref s) == 0) // 0 = ERROR_SUCCESS
                    {
                        activeState = s;
                        found = true;
                        break;
                    }
                }

                if (found)
                {
                    var g = activeState.Gamepad;
                    bool changed = (g.wButtons != lastButtons) ||
                                   (Math.Abs(g.bLeftTrigger - lastLT) > 2) ||
                                   (Math.Abs(g.bRightTrigger - lastRT) > 2) ||
                                   (Math.Abs(g.sThumbLX - lastLX) > 200) ||
                                   (Math.Abs(g.sThumbLY - lastLY) > 200) ||
                                   (Math.Abs(g.sThumbRX - lastRX) > 200) ||
                                   (Math.Abs(g.sThumbRY - lastRY) > 200) ||
                                   !wasConnected;

                    heartbeat++;
                    // Emit on change or at least every ~50ms heartbeat
                    if (changed || heartbeat >= 5)
                    {
                        heartbeat = 0;
                        lastButtons = g.wButtons;
                        lastLT = g.bLeftTrigger;
                        lastRT = g.bRightTrigger;
                        lastLX = g.sThumbLX;
                        lastLY = g.sThumbLY;
                        lastRX = g.sThumbRX;
                        lastRY = g.sThumbRY;
                        wasConnected = true;

                        writer.WriteLine(string.Format("{{\"c\":1,\"b\":{0},\"lt\":{1},\"rt\":{2},\"lx\":{3},\"ly\":{4},\"rx\":{5},\"ry\":{6}}}",
                            g.wButtons, g.bLeftTrigger, g.bRightTrigger, g.sThumbLX, g.sThumbLY, g.sThumbRX, g.sThumbRY));
                    }
                }
                else
                {
                    if (wasConnected)
                    {
                        wasConnected = false;
                        lastButtons = -1;
                        writer.WriteLine("{\"c\":0}");
                    }
                }

                Thread.Sleep(10); // ~100Hz ultra responsive
            }
        }
    }
}
