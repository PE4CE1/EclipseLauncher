using System;
using System.IO;
using System.Reflection;
using System.Text;

internal static class FpsBatchProbe
{
    sealed class CountingStream : MemoryStream
    {
        public int Writes;
        public override void Write(byte[] buffer, int offset, int count) { Writes++; base.Write(buffer, offset, count); }
    }
    static int Main(string[] args)
    {
        try
        {
            Type broker = Assembly.LoadFrom(Path.GetFullPath(args[0])).GetType("FpsBroker", true);
            const BindingFlags flags = BindingFlags.Static | BindingFlags.NonPublic;
            FieldInfo output = broker.GetField("output", flags), generation = broker.GetField("generation", flags);
            MethodInfo write = broker.GetMethod("Write", flags), buffer = broker.GetMethod("BufferCsv", flags), flush = broker.GetMethod("FlushCsv", flags);
            var lines = new string[241];
            lines[0] = "Application,ProcessID,SwapChainAddress,MsBetweenPresents";
            for (int index = 1; index < lines.Length; index++) lines[index] = "game.exe,123,main,6.944";
            string baseline;
            int oldWrites, batchedWrites;
            using (var memory = new CountingStream())
            using (var writer = new StreamWriter(memory, new UTF8Encoding(false), 32768, true))
            {
                output.SetValue(null, writer);
                foreach (string line in lines) write.Invoke(null, new object[] { "!csv\t123\t" + line });
                baseline = Encoding.UTF8.GetString(memory.ToArray()).Replace("\r\n", "\n");
                oldWrites = memory.Writes;
            }
            using (var memory = new CountingStream())
            using (var writer = new StreamWriter(memory, new UTF8Encoding(false), 32768, true))
            {
                output.SetValue(null, writer); generation.SetValue(null, 7L);
                foreach (string line in lines) buffer.Invoke(null, new object[] { 123, 7L, line });
                if (memory.Length != 0) throw new Exception("Each frame must not flush the pipe.");
                flush.Invoke(null, new object[] { 7L });
                string result = Encoding.UTF8.GetString(memory.ToArray());
                if (result != baseline) throw new Exception("Batching changed or dropped frame data.");
                long length = memory.Length;
                buffer.Invoke(null, new object[] { 123, 6L, "stale frame" });
                flush.Invoke(null, new object[] { 7L });
                if (memory.Length != length) throw new Exception("Stale collector data was accepted.");
                batchedWrites = memory.Writes;
                if (batchedWrites >= oldWrites) throw new Exception("Pipe writes were not reduced.");
            }
            Console.WriteLine("{\"frames\":240,\"headerPreserved\":true,\"allFramesPreserved\":true,\"staleFramesRejected\":true,\"baselinePipeWrites\":" + oldWrites + ",\"batchedPipeWrites\":" + batchedWrites + "}");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
