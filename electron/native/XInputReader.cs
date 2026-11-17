using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
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

    [StructLayout(LayoutKind.Sequential)]
    public struct SP_DEVICE_INTERFACE_DATA
    {
        public uint cbSize;
        public Guid interfaceClassGuid;
        public uint flags;
        public IntPtr reserved;
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

        // P/Invoke HID & Win32
        [DllImport("hid.dll", SetLastError = true)]
        static extern void HidD_GetHidGuid(out Guid hidGuid);

        [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Auto)]
        static extern IntPtr SetupDiGetClassDevs(ref Guid classGuid, string enumerator, IntPtr hwndParent, uint flags);

        [DllImport("setupapi.dll", SetLastError = true)]
        static extern bool SetupDiEnumDeviceInterfaces(IntPtr deviceInfoSet, IntPtr deviceInfoData, ref Guid interfaceClassGuid, uint memberIndex, ref SP_DEVICE_INTERFACE_DATA deviceInterfaceData);

        [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Auto)]
        static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr deviceInfoSet, ref SP_DEVICE_INTERFACE_DATA deviceInterfaceData, IntPtr deviceInterfaceDetailData, uint deviceInterfaceDetailDataSize, ref uint requiredSize, IntPtr deviceInfoData);

        [DllImport("setupapi.dll", SetLastError = true)]
        static extern bool SetupDiDestroyDeviceInfoList(IntPtr deviceInfoSet);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        static extern IntPtr CreateFile(string lpFileName, uint dwDesiredAccess, uint dwShareMode, IntPtr lpSecurityAttributes, uint dwCreationDisposition, uint dwFlagsAndAttributes, IntPtr hTemplateFile);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool CloseHandle(IntPtr hObject);

        [DllImport("hid.dll", SetLastError = true)]
        static extern bool HidD_GetInputReport(IntPtr hidDeviceObject, byte[] lpReportBuffer, int reportBufferLength);

        private static int xinputVersion = 0;

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
                        return 1167;
                    }
                }
            }
        }

        private static IntPtr FindSonyDeviceHandle(out bool isDualSense)
        {
            isDualSense = false;
            try
            {
                Guid hidGuid;
                HidD_GetHidGuid(out hidGuid);
                IntPtr hDevInfo = SetupDiGetClassDevs(ref hidGuid, null, IntPtr.Zero, 0x10 | 0x02);
                if (hDevInfo != IntPtr.Zero && hDevInfo.ToInt64() != -1)
                {
                    SP_DEVICE_INTERFACE_DATA dia = new SP_DEVICE_INTERFACE_DATA();
                    dia.cbSize = (uint)Marshal.SizeOf(dia);
                    uint index = 0;

                    while (SetupDiEnumDeviceInterfaces(hDevInfo, IntPtr.Zero, ref hidGuid, index++, ref dia))
                    {
                        uint reqSize = 0;
                        SetupDiGetDeviceInterfaceDetail(hDevInfo, ref dia, IntPtr.Zero, 0, ref reqSize, IntPtr.Zero);
                        if (reqSize == 0) continue;

                        IntPtr detailBuffer = Marshal.AllocHGlobal((int)reqSize);
                        Marshal.WriteInt32(detailBuffer, IntPtr.Size == 8 ? 8 : 5);

                        if (SetupDiGetDeviceInterfaceDetail(hDevInfo, ref dia, detailBuffer, reqSize, ref reqSize, IntPtr.Zero))
                        {
                            string path = Marshal.PtrToStringAuto(new IntPtr(detailBuffer.ToInt64() + 4));
                            Marshal.FreeHGlobal(detailBuffer);

                            if (string.IsNullOrEmpty(path)) continue;
                            string lower = path.ToLower();
                            if (lower.Contains("vid_054c") || lower.Contains("vid&0002054c") || lower.Contains("054c"))
                            {
                                IntPtr h = CreateFile(path, 0, 1 | 2, IntPtr.Zero, 3, 0, IntPtr.Zero);
                                if (h != IntPtr.Zero && h.ToInt64() != -1)
                                {
                                    isDualSense = lower.Contains("0ce6") || lower.Contains("0df2");
                                    SetupDiDestroyDeviceInfoList(hDevInfo);
                                    return h;
                                }
                            }
                        }
                        else
                        {
                            Marshal.FreeHGlobal(detailBuffer);
                        }
                    }
                    SetupDiDestroyDeviceInfoList(hDevInfo);
                }
            }
            catch {}
            return IntPtr.Zero;
        }

        private static bool ReadSonyControllerState(IntPtr handle, bool isDualSense, ref XINPUT_STATE state)
        {
            byte[] rep = new byte[78];
            bool ok = false;
            int mode = 0; // 1: DualSense BT (0x31), 2: DS4 BT (0x11), 3: DualSense USB (0x01), 4: DS4 USB (0x01)

            if (isDualSense)
            {
                rep[0] = 0x31;
                ok = HidD_GetInputReport(handle, rep, 78);
                if (ok) mode = 1;
                else
                {
                    rep = new byte[64];
                    rep[0] = 0x01;
                    ok = HidD_GetInputReport(handle, rep, 64);
                    if (ok) mode = 3;
                }
            }
            else
            {
                rep[0] = 0x11;
                ok = HidD_GetInputReport(handle, rep, 78);
                if (ok) mode = 2;
                else
                {
                    rep = new byte[64];
                    rep[0] = 0x01;
                    ok = HidD_GetInputReport(handle, rep, 64);
                    if (ok) mode = 4;
                }
            }

            if (!ok)
            {
                // Auto-detection fallback
                rep = new byte[78];
                rep[0] = 0x31;
                ok = HidD_GetInputReport(handle, rep, 78);
                if (ok) mode = 1;
                else
                {
                    rep = new byte[78];
                    rep[0] = 0x11;
                    ok = HidD_GetInputReport(handle, rep, 78);
                    if (ok) mode = 2;
                    else
                    {
                        rep = new byte[64];
                        rep[0] = 0x01;
                        ok = HidD_GetInputReport(handle, rep, 64);
                        if (ok) mode = isDualSense ? 3 : 4;
                    }
                }
            }

            if (!ok || mode == 0) return false;

            byte lx = 128, ly = 128, rx = 128, ry = 128;
            byte lt = 0, rt = 0;
            byte dpadRaw = 8, faceRaw = 0, shouldersRaw = 0, sysRaw = 0;

            switch (mode)
            {
                case 1: // DualSense BT (Report 0x31)
                    lx = rep[2];
                    ly = rep[3];
                    rx = rep[4];
                    ry = rep[5];
                    lt = rep[6];
                    rt = rep[7];
                    dpadRaw = (byte)(rep[9] & 0x0F);
                    faceRaw = (byte)(rep[9] & 0xF0);
                    shouldersRaw = rep[10];
                    sysRaw = rep[11];
                    break;

                case 2: // DualShock 4 BT (Report 0x11)
                    lx = rep[3];
                    ly = rep[4];
                    rx = rep[5];
                    ry = rep[6];
                    dpadRaw = (byte)(rep[7] & 0x0F);
                    faceRaw = (byte)(rep[7] & 0xF0);
                    shouldersRaw = rep[8];
                    sysRaw = rep[9];
                    lt = rep[10];
                    rt = rep[11];
                    break;

                case 3: // DualSense USB (Report 0x01)
                    lx = rep[1];
                    ly = rep[2];
                    rx = rep[3];
                    ry = rep[4];
                    lt = rep[5];
                    rt = rep[6];
                    dpadRaw = (byte)(rep[8] & 0x0F);
                    faceRaw = (byte)(rep[8] & 0xF0);
                    shouldersRaw = rep[9];
                    sysRaw = rep[10];
                    break;

                case 4: // DualShock 4 USB (Report 0x01)
                    lx = rep[1];
                    ly = rep[2];
                    rx = rep[3];
                    ry = rep[4];
                    dpadRaw = (byte)(rep[5] & 0x0F);
                    faceRaw = (byte)(rep[5] & 0xF0);
                    shouldersRaw = rep[6];
                    sysRaw = rep[7];
                    lt = rep[8];
                    rt = rep[9];
                    break;
            }

            // Sticks & Analog Triggers
            state.Gamepad.sThumbLX = (short)((lx - 128) * 256);
            state.Gamepad.sThumbLY = (short)((127 - ly) * 256);
            state.Gamepad.sThumbRX = (short)((rx - 128) * 256);
            state.Gamepad.sThumbRY = (short)((127 - ry) * 256);

            // Digital trigger backup
            if ((shouldersRaw & 0x04) != 0 && lt < 30) lt = 255;
            if ((shouldersRaw & 0x08) != 0 && rt < 30) rt = 255;
            state.Gamepad.bLeftTrigger = lt;
            state.Gamepad.bRightTrigger = rt;

            ushort btn = 0;

            // D-Pad (0..7: directions, 8: released/centered)
            if (dpadRaw == 0 || dpadRaw == 1 || dpadRaw == 7) btn |= 0x0001; // Up
            if (dpadRaw == 3 || dpadRaw == 4 || dpadRaw == 5) btn |= 0x0002; // Down
            if (dpadRaw == 5 || dpadRaw == 6 || dpadRaw == 7) btn |= 0x0004; // Left
            if (dpadRaw == 1 || dpadRaw == 2 || dpadRaw == 3) btn |= 0x0008; // Right

            // Face Buttons
            if ((faceRaw & 0x10) != 0) btn |= 0x4000; // Square -> X (btn 2)
            if ((faceRaw & 0x20) != 0) btn |= 0x1000; // Cross -> A (btn 0)
            if ((faceRaw & 0x40) != 0) btn |= 0x2000; // Circle -> B (btn 1)
            if ((faceRaw & 0x80) != 0) btn |= 0x8000; // Triangle -> Y (btn 3)

            // Shoulders & System
            if ((shouldersRaw & 0x01) != 0) btn |= 0x0100; // L1 (btn 4)
            if ((shouldersRaw & 0x02) != 0) btn |= 0x0200; // R1 (btn 5)
            if ((shouldersRaw & 0x10) != 0) btn |= 0x0020; // Share / Create -> Back (btn 8)
            if ((shouldersRaw & 0x20) != 0) btn |= 0x0010; // Options -> Start (btn 9)
            if ((shouldersRaw & 0x40) != 0) btn |= 0x0040; // L3 (btn 10)
            if ((shouldersRaw & 0x80) != 0) btn |= 0x0080; // R3 (btn 11)

            // System buttons
            if ((sysRaw & 0x01) != 0) btn |= 0x0400; // PS button
            if ((sysRaw & 0x02) != 0) btn |= 0x0800; // Touchpad click

            state.Gamepad.wButtons = btn;
            return true;
        }

        static void Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            var writer = new StreamWriter(Console.OpenStandardOutput(), Encoding.UTF8);
            writer.AutoFlush = true;

            int lastButtons = -1;
            int lastLT = -1, lastRT = -1;
            int lastLX = 0, lastLY = 0, lastRX = 0, lastRY = 0;
            bool wasConnected = false;
            int heartbeat = 0;

            IntPtr sonyHandle = IntPtr.Zero;
            bool isDualSense = false;
            int scanCounter = 0;

            while (true)
            {
                bool found = false;
                XINPUT_STATE activeState = new XINPUT_STATE();

                // 1. Try XInput (Xbox controllers & virtual ViGEmBus/Steam/DS4Windows)
                for (uint i = 0; i < 4; i++)
                {
                    XINPUT_STATE s = new XINPUT_STATE();
                    if (GetState(i, ref s) == 0)
                    {
                        activeState = s;
                        found = true;
                        break;
                    }
                }

                // 2. Fallback to Sony DualSense / DualShock Direct HID
                if (!found)
                {
                    if (sonyHandle == IntPtr.Zero)
                    {
                        scanCounter++;
                        if (scanCounter >= 20) // Check every ~200ms
                        {
                            scanCounter = 0;
                            sonyHandle = FindSonyDeviceHandle(out isDualSense);
                        }
                    }

                    if (sonyHandle != IntPtr.Zero)
                    {
                        bool ok = ReadSonyControllerState(sonyHandle, isDualSense, ref activeState);
                        if (ok)
                        {
                            found = true;
                        }
                        else
                        {
                            CloseHandle(sonyHandle);
                            sonyHandle = IntPtr.Zero;
                        }
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

                Thread.Sleep(10);
            }
        }
    }
}
