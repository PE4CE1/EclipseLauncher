using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace EclipseController
{
    class Program
    {
        const uint GENERIC_READ = 0x80000000;
        const uint GENERIC_WRITE = 0x40000000;
        const uint FILE_SHARE_READ = 0x00000001;
        const uint FILE_SHARE_WRITE = 0x00000002;
        const uint OPEN_EXISTING = 3;

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

        [DllImport("hid.dll", SetLastError = true)]
        static extern bool HidD_GetAttributes(IntPtr hidDeviceObject, ref HIDD_ATTRIBUTES attributes);

        [DllImport("hid.dll", SetLastError = true)]
        static extern bool HidD_GetInputReport(IntPtr hidDeviceObject, byte[] lpReportBuffer, int reportBufferLength);

        [DllImport("hid.dll", SetLastError = true)]
        static extern bool HidD_SetOutputReport(IntPtr hidDeviceObject, byte[] lpReportBuffer, int reportBufferLength);

        [DllImport("hid.dll", SetLastError = true)]
        static extern bool HidD_GetFeature(IntPtr hidDeviceObject, byte[] lpReportBuffer, int reportBufferLength);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        static extern IntPtr CreateFile(string lpFileName, uint dwDesiredAccess, uint dwShareMode, IntPtr lpSecurityAttributes, uint dwCreationDisposition, uint dwFlagsAndAttributes, IntPtr hTemplateFile);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool CloseHandle(IntPtr hObject);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool WriteFile(IntPtr hFile, byte[] lpBuffer, uint nNumberOfBytesToWrite, out uint lpNumberOfBytesWritten, IntPtr lpOverlapped);

        [DllImport("xinput1_4.dll")]
        static extern uint XInput14_GetBatteryInformation(uint userIndex, byte devType, ref XINPUT_BATTERY_INFORMATION pBattery);

        [DllImport("xinput1_3.dll", EntryPoint = "XInputGetBatteryInformation")]
        static extern uint XInput13_GetBatteryInformation(uint userIndex, byte devType, ref XINPUT_BATTERY_INFORMATION pBattery);

        [DllImport("xinput1_4.dll")]
        static extern uint XInput14_SetState(uint userIndex, ref XINPUT_VIBRATION pVibration);

        [DllImport("xinput1_3.dll", EntryPoint = "XInputSetState")]
        static extern uint XInput13_SetState(uint userIndex, ref XINPUT_VIBRATION pVibration);

        [StructLayout(LayoutKind.Sequential)]
        struct SP_DEVICE_INTERFACE_DATA
        {
            public uint cbSize;
            public Guid interfaceClassGuid;
            public uint flags;
            public IntPtr reserved;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct HIDD_ATTRIBUTES
        {
            public uint Size;
            public ushort VendorID;
            public ushort ProductID;
            public ushort VersionNumber;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct XINPUT_BATTERY_INFORMATION
        {
            public byte BatteryType;
            public byte BatteryLevel;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct XINPUT_VIBRATION
        {
            public ushort wLeftMotorSpeed;
            public ushort wRightMotorSpeed;
        }

        static uint GetXInputBattery(uint userIndex, ref XINPUT_BATTERY_INFORMATION b)
        {
            try { return XInput14_GetBatteryInformation(userIndex, 0, ref b); }
            catch
            {
                try { return XInput13_GetBatteryInformation(userIndex, 0, ref b); }
                catch { return 1167; }
            }
        }

        static uint SetXInputVibration(uint userIndex, ushort left, ushort right)
        {
            XINPUT_VIBRATION v = new XINPUT_VIBRATION { wLeftMotorSpeed = left, wRightMotorSpeed = right };
            try { return XInput14_SetState(userIndex, ref v); }
            catch
            {
                try { return XInput13_SetState(userIndex, ref v); }
                catch { return 1167; }
            }
        }

        static uint[] crcTable;
        static void InitCRC()
        {
            if (crcTable != null) return;
            crcTable = new uint[256];
            for (uint i = 0; i < 256; i++)
            {
                uint c = i;
                for (int j = 0; j < 8; j++)
                {
                    if ((c & 1) != 0) c = 0xEDB88320 ^ (c >> 1);
                    else c = c >> 1;
                }
                crcTable[i] = c;
            }
        }

        static uint ComputeCRC(byte header, byte[] data, int len)
        {
            InitCRC();
            uint crc = 0xFFFFFFFF;
            crc = crcTable[(crc ^ header) & 0xFF] ^ (crc >> 8);
            for (int i = 0; i < len; i++)
            {
                crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >> 8);
            }
            return crc ^ 0xFFFFFFFF;
        }

        struct SonyDevice
        {
            public IntPtr handle;
            public bool isDS4;
            public byte seq;
        }

        static void SendSonyVibrationFrame(ref SonyDevice dev, byte leftMotor, byte rightMotor, byte r, byte g, byte b)
        {
            uint written;
            if (dev.isDS4)
            {
                // DS4 BT: report 0x11 (78 bytes)
                byte[] rep11 = new byte[78];
                rep11[0] = 0x11;
                rep11[1] = 0xC0; // enable rumble & CRC
                rep11[3] = 0x07; // motor + LED enable
                rep11[6] = rightMotor;
                rep11[7] = leftMotor;
                rep11[8] = r;
                rep11[9] = g;
                rep11[10] = b;
                uint crc11 = ComputeCRC(0xA2, rep11, 74);
                Array.Copy(BitConverter.GetBytes(crc11), 0, rep11, 74, 4);

                byte[] rep11_547 = new byte[547];
                Array.Copy(rep11, rep11_547, 78);
                WriteFile(dev.handle, rep11_547, 547, out written, IntPtr.Zero);
                WriteFile(dev.handle, rep11, (uint)rep11.Length, out written, IntPtr.Zero);
                HidD_SetOutputReport(dev.handle, rep11, rep11.Length);
                HidD_SetOutputReport(dev.handle, rep11_547, 547);

                // DS4 USB: report 0x05 (32 bytes)
                byte[] rep05 = new byte[32];
                rep05[0] = 0x05;
                rep05[1] = 0x03; // enable motor & LED
                rep05[4] = rightMotor;
                rep05[5] = leftMotor;
                rep05[6] = r;
                rep05[7] = g;
                rep05[8] = b;
                WriteFile(dev.handle, rep05, (uint)rep05.Length, out written, IntPtr.Zero);
                HidD_SetOutputReport(dev.handle, rep05, rep05.Length);
            }
            else
            {
                // DualSense BT: report 0x31 (78 bytes)
                byte[] rep31 = new byte[78];
                rep31[0] = 0x31;
                rep31[1] = (byte)((dev.seq++ & 0x0F) << 4);
                if (dev.seq >= 16) dev.seq = 0;
                rep31[2] = 0x10; // DS_OUTPUT_TAG

                rep31[3] = 0xFF; // valid_flag0 (compatible vib + haptics + all)
                rep31[4] = 0xF7; // valid_flag1 (lightbar + leds + all)
                rep31[5] = rightMotor;
                rep31[6] = leftMotor;

                if (leftMotor > 0 || rightMotor > 0)
                {
                    // R2 & L2 adaptive trigger vibration effect
                    rep31[13] = 0x26; // R2 mode (vibration)
                    rep31[14] = 0x00;
                    rep31[15] = 0x20;
                    rep31[16] = 0xFF; // freq
                    rep31[24] = 0x26; // L2 mode (vibration)
                    rep31[25] = 0x00;
                    rep31[26] = 0x20;
                    rep31[27] = 0xFF;
                }

                rep31[42] = 0x06; // valid_flag2 (lightbar setup + compatible vibration 2)
                rep31[44] = 0x02; // lightbar setup (enable LEDs = 0x02)
                rep31[47] = r;
                rep31[48] = g;
                rep31[49] = b;

                uint crc31 = ComputeCRC(0xA2, rep31, 74);
                Array.Copy(BitConverter.GetBytes(crc31), 0, rep31, 74, 4);

                byte[] rep31_547 = new byte[547];
                Array.Copy(rep31, rep31_547, 78);

                WriteFile(dev.handle, rep31_547, 547, out written, IntPtr.Zero);
                WriteFile(dev.handle, rep31, (uint)rep31.Length, out written, IntPtr.Zero);
                HidD_SetOutputReport(dev.handle, rep31, rep31.Length);
                HidD_SetOutputReport(dev.handle, rep31_547, 547);

                // DualSense USB: report 0x02 (48 bytes)
                byte[] rep02 = new byte[48];
                rep02[0] = 0x02;
                rep02[1] = 0xFF; // valid_flag0
                rep02[2] = 0xF7; // valid_flag1
                rep02[3] = rightMotor;
                rep02[4] = leftMotor;
                if (leftMotor > 0 || rightMotor > 0)
                {
                    rep02[11] = 0x26;
                    rep02[12] = 0x00;
                    rep02[13] = 0x20;
                    rep02[14] = 0xFF;
                    rep02[22] = 0x26;
                    rep02[23] = 0x00;
                    rep02[24] = 0x20;
                    rep02[25] = 0xFF;
                }
                rep02[39] = 0x06; // valid_flag2
                rep02[41] = 0x02; // lightbar setup
                rep02[44] = r;
                rep02[45] = g;
                rep02[46] = b;

                WriteFile(dev.handle, rep02, (uint)rep02.Length, out written, IntPtr.Zero);
                HidD_SetOutputReport(dev.handle, rep02, rep02.Length);
            }
        }

        static void Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            bool doVibrate = (args.Length > 0 && args[0] == "--vibrate");

            // ─── VIBRATION TEST MODE ──────────────────────────────────────────
            // Triggers vibration on ALL active controllers (XInput slots, DualSense BT/USB, DS4 BT/USB)
            if (doVibrate)
            {
                bool anyVibrated = false;
                var sonyDevices = new System.Collections.Generic.List<SonyDevice>();

                // 1. Enumerate and open all Sony devices (keep handles open during rumble)
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

                                if (lower.Contains("vid_054c") || lower.Contains("vid&0002054c"))
                                {
                                    IntPtr hDevice = CreateFile(path, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
                                    if (hDevice == IntPtr.Zero || hDevice.ToInt64() == -1)
                                    {
                                        hDevice = CreateFile(path, 0, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
                                    }

                                    if (hDevice != IntPtr.Zero && hDevice.ToInt64() != -1)
                                    {
                                        HIDD_ATTRIBUTES attr = new HIDD_ATTRIBUTES();
                                        attr.Size = (uint)Marshal.SizeOf(attr);
                                        HidD_GetAttributes(hDevice, ref attr);
                                        bool isDS4 = (attr.ProductID == 0x05C4 || attr.ProductID == 0x09CC);

                                        // Unlock full feature 0x31 / 0x11 mode
                                        byte[] feat = new byte[64];
                                        feat[0] = 0x05;
                                        HidD_GetFeature(hDevice, feat, 64);

                                        sonyDevices.Add(new SonyDevice { handle = hDevice, isDS4 = isDS4, seq = 0 });
                                        anyVibrated = true;
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

                // 2. Check and start XInput rumble on all 4 slots
                for (uint i = 0; i < 4; i++)
                {
                    if (SetXInputVibration(i, 65535, 65535) == 0)
                    {
                        anyVibrated = true;
                    }
                }

                // 3. Stream active vibration for ~500ms while keeping all device handles open
                for (int frame = 0; frame < 7; frame++)
                {
                    // Refresh XInput slots
                    for (uint i = 0; i < 4; i++)
                    {
                        SetXInputVibration(i, 65535, 65535);
                    }

                    // Send Sony active frame (full rumble motors + triggers + cyan lightbar)
                    for (int s = 0; s < sonyDevices.Count; s++)
                    {
                        var dev = sonyDevices[s];
                        SendSonyVibrationFrame(ref dev, 255, 255, 0, 255, 255);
                        sonyDevices[s] = dev;
                    }

                    Thread.Sleep(70);
                }

                // 4. Send stop vibration commands
                for (uint i = 0; i < 4; i++)
                {
                    SetXInputVibration(i, 0, 0);
                }

                for (int s = 0; s < sonyDevices.Count; s++)
                {
                    var dev = sonyDevices[s];
                    SendSonyVibrationFrame(ref dev, 0, 0, 0, 0, 0);
                    sonyDevices[s] = dev;
                }
                Thread.Sleep(50);
                for (int s = 0; s < sonyDevices.Count; s++)
                {
                    var dev = sonyDevices[s];
                    SendSonyVibrationFrame(ref dev, 0, 0, 0, 0, 0);
                    CloseHandle(dev.handle);
                }

                Console.WriteLine(string.Format("{{\"success\":{0}}}", anyVibrated.ToString().ToLower()));
                return;
            }

            // ─── BATTERY & MODEL QUERY MODE ──────────────────────────────────
            // 1. First check Sony DualSense / DualShock HID for live telemetry
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

                            bool isSony = lower.Contains("vid_054c") || lower.Contains("vid&0002054c");
                            bool isSwitch = lower.Contains("vid_057e") || lower.Contains("vid&0002057e");

                            if (!isSony && !isSwitch) continue;

                            IntPtr hDevice = CreateFile(path, 0, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
                            if (hDevice != IntPtr.Zero && hDevice.ToInt64() != -1)
                            {
                                HIDD_ATTRIBUTES attr = new HIDD_ATTRIBUTES();
                                attr.Size = (uint)Marshal.SizeOf(attr);
                                HidD_GetAttributes(hDevice, ref attr);

                                if (isSony)
                                {
                                    bool isDS4 = (attr.ProductID == 0x05C4 || attr.ProductID == 0x09CC);
                                    string model = "Sony PlayStation 5 DualSense™";
                                    bool isEdge = (attr.ProductID == 0x0DF2);
                                    if (isEdge) model = "Sony DualSense Edge™";
                                    else if (isDS4) model = "Sony PlayStation 4 DualShock® 4";

                                    int level = 100;
                                    bool charging = false;
                                    bool hasExactLevel = false;
                                    bool isBT = false;
                                    bool gotReport = false;

                                    if (isDS4)
                                    {
                                        // DS4 USB check: report 0x01
                                        byte[] rep01 = new byte[64];
                                        rep01[0] = 0x01;
                                        bool ok01 = HidD_GetInputReport(hDevice, rep01, rep01.Length);
                                        if (ok01 && rep01.Length > 30)
                                        {
                                            byte b30 = rep01[30];
                                            int cap = b30 & 0x0F;
                                            charging = ((b30 & 0x10) != 0);
                                            level = Math.Min(100, Math.Max(0, cap * 10));
                                            hasExactLevel = true;
                                            isBT = false;
                                            gotReport = true;
                                        }
                                        else
                                        {
                                            // DS4 BT check: report 0x11
                                            byte[] rep11 = new byte[78];
                                            rep11[0] = 0x11;
                                            bool ok11 = HidD_GetInputReport(hDevice, rep11, rep11.Length);
                                            if (ok11 && rep11.Length > 32)
                                            {
                                                byte b32 = rep11[32];
                                                int cap = b32 & 0x0F;
                                                charging = ((b32 & 0x10) != 0);
                                                level = Math.Min(100, Math.Max(0, cap * 10));
                                                hasExactLevel = true;
                                                isBT = true;
                                                gotReport = true;
                                            }
                                        }
                                    }
                                    else
                                    {
                                        // DualSense / DualSense Edge
                                        byte[] rep31 = new byte[78];
                                        rep31[0] = 0x31;
                                        bool ok31 = HidD_GetInputReport(hDevice, rep31, rep31.Length);

                                        if (ok31)
                                        {
                                            gotReport = true;
                                            isBT = true;
                                            byte b54 = rep31[54];
                                            int cap = b54 & 0x0F;
                                            int status = (b54 >> 4) & 0x0F;

                                            if (cap <= 10)
                                            {
                                                charging = (status == 1 || status == 2);
                                                if (status == 2) level = 100;
                                                else if (status == 1 && cap == 0) level = 10;
                                                else level = Math.Min(100, cap * 10);
                                                hasExactLevel = true;
                                            }
                                        }
                                        else
                                        {
                                            byte[] rep01 = new byte[64];
                                            rep01[0] = 0x01;
                                            bool ok01 = HidD_GetInputReport(hDevice, rep01, rep01.Length);

                                            if (ok01 && rep01.Length > 53)
                                            {
                                                gotReport = true;
                                                isBT = false;
                                                byte b53 = rep01[53];
                                                int cap = b53 & 0x0F;
                                                int status = (b53 >> 4) & 0x0F;

                                                if (cap <= 10)
                                                {
                                                    charging = (status == 1 || status == 2);
                                                    if (status == 2) level = 100;
                                                    else if (status == 1 && cap == 0) level = 10;
                                                    else level = Math.Min(100, cap * 10);
                                                    hasExactLevel = true;
                                                }
                                            }
                                        }
                                    }

                                    CloseHandle(hDevice);

                                    // Only accept Sony device if it is actively communicating!
                                    if (gotReport)
                                    {
                                        SetupDiDestroyDeviceInfoList(hDevInfo);
                                        string conn = isBT ? "bluetooth" : "usb";
                                        Console.WriteLine(string.Format("{{\"connected\":true,\"model\":\"{0}\",\"vendor\":\"sony\",\"connectionType\":\"{1}\",\"level\":{2},\"charging\":{3},\"hasExactLevel\":{4}}}",
                                            model, conn, level, charging.ToString().ToLower(), hasExactLevel.ToString().ToLower()));
                                        return;
                                    }
                                }
                                else if (isSwitch)
                                {
                                    CloseHandle(hDevice);
                                    SetupDiDestroyDeviceInfoList(hDevInfo);
                                    Console.WriteLine("{\"connected\":true,\"model\":\"Nintendo Switch Pro Controller\",\"vendor\":\"nintendo\",\"connectionType\":\"bluetooth\",\"level\":100,\"charging\":false,\"hasExactLevel\":false}");
                                    return;
                                }
                                else
                                {
                                    CloseHandle(hDevice);
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

            // 2. Check XInput slots 0..3 (Xbox controllers, Xbox Wireless Adapter, ViGEm)
            for (uint i = 0; i < 4; i++)
            {
                XINPUT_BATTERY_INFORMATION b = new XINPUT_BATTERY_INFORMATION();
                uint res = GetXInputBattery(i, ref b);
                if (res == 0 && b.BatteryType != 0) // 0 = DISCONNECTED
                {
                    bool isWired = (b.BatteryType == 1);
                    int level = 100;
                    bool charging = isWired;

                    if (!isWired)
                    {
                        switch (b.BatteryLevel)
                        {
                            case 0: level = 15; break;
                            case 1: level = 35; break;
                            case 2: level = 70; break;
                            case 3: level = 100; break;
                        }
                    }

                    string model = isWired ? "Xbox Controller (Kabel)" : "Xbox Wireless Controller";
                    string conn = isWired ? "usb" : "wireless";
                    Console.WriteLine(string.Format("{{\"connected\":true,\"model\":\"{0}\",\"vendor\":\"xbox\",\"connectionType\":\"{1}\",\"level\":{2},\"charging\":{3},\"hasExactLevel\":true,\"slot\":{4}}}",
                        model, conn, level, charging.ToString().ToLower(), i));
                    return;
                }
            }

            // 3. Fallback: Not connected
            Console.WriteLine("{\"connected\":false,\"model\":\"\",\"vendor\":\"unknown\",\"connectionType\":\"none\",\"level\":0,\"charging\":false,\"hasExactLevel\":false}");
        }
    }
}
