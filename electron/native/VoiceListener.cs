using System;
using System.IO;
using System.Globalization;
using System.Speech.Recognition;
using System.Threading;
using System.Collections.Generic;

namespace EclipseVoice
{
    class Program
    {
        private static SpeechRecognitionEngine recognizer = null;
        private static bool isRunning = true;
        private const float MIN_CONFIDENCE = 0.88f;

        static void Main(string[] args)
        {
            string targetPhrase = args.Length > 0 ? string.Join(" ", args).ToLower().Trim() : "clip that";
            if (string.IsNullOrEmpty(targetPhrase)) targetPhrase = "clip that";

            InitRecognizer(targetPhrase);

            while (isRunning)
            {
                try
                {
                    string cmd = Console.ReadLine();
                    if (cmd == null || cmd == "exit" || cmd == "quit")
                    {
                        break;
                    }
                    if (cmd.StartsWith("phrase:"))
                    {
                        string newPhrase = cmd.Substring(7).Trim();
                        if (!string.IsNullOrEmpty(newPhrase))
                        {
                            InitRecognizer(newPhrase);
                        }
                    }
                }
                catch
                {
                    break;
                }
            }

            CleanupRecognizer();
        }

        private static void CleanupRecognizer()
        {
            try
            {
                if (recognizer != null)
                {
                    recognizer.RecognizeAsyncCancel();
                    recognizer.Dispose();
                    recognizer = null;
                }
            }
            catch {}
        }

        private static void InitRecognizer(string phrase)
        {
            try
            {
                CleanupRecognizer();

                string clean = phrase.ToLower().Trim();
                bool isGerman = clean.Contains("das") || clean.Contains("bitte") || clean.Contains("mal") || clean.Contains("speichern") || clean.Contains("aufnahme");
                RecognizerInfo bestRecognizer = null;

                foreach (RecognizerInfo ri in SpeechRecognitionEngine.InstalledRecognizers())
                {
                    if (isGerman && ri.Culture.Name.StartsWith("de", StringComparison.OrdinalIgnoreCase))
                    {
                        bestRecognizer = ri;
                        break;
                    }
                    else if (!isGerman && ri.Culture.Name.StartsWith("en", StringComparison.OrdinalIgnoreCase))
                    {
                        bestRecognizer = ri;
                        break;
                    }
                }

                if (bestRecognizer != null)
                {
                    recognizer = new SpeechRecognitionEngine(bestRecognizer);
                }
                else
                {
                    recognizer = new SpeechRecognitionEngine();
                }

                BuildGrammar(clean, isGerman);

                recognizer.SpeechRecognized += (s, e) =>
                {
                    // Strict confidence threshold: 0.88+ required, no accidental triggers
                    if (e.Result != null && e.Result.Confidence >= MIN_CONFIDENCE)
                    {
                        Console.WriteLine("{\"event\":\"hotword\",\"text\":\"" + EscapeJson(e.Result.Text) + "\",\"confidence\":" + e.Result.Confidence.ToString("0.00", CultureInfo.InvariantCulture) + "}");
                    }
                };

                recognizer.SetInputToDefaultAudioDevice();
                recognizer.RecognizeAsync(RecognizeMode.Multiple);

                Console.WriteLine("{\"event\":\"ready\",\"phrase\":\"" + EscapeJson(clean) + "\",\"culture\":\"" + recognizer.RecognizerInfo.Culture.Name + "\",\"minConfidence\":" + MIN_CONFIDENCE.ToString("0.00", CultureInfo.InvariantCulture) + "}");
            }
            catch (Exception ex)
            {
                Console.WriteLine("{\"event\":\"error\",\"message\":\"" + EscapeJson(ex.Message) + "\"}");
            }
        }

        private static void BuildGrammar(string phrase, bool isGerman)
        {
            if (recognizer == null) return;
            recognizer.UnloadAllGrammars();

            Choices choices = new Choices();
            
            // Only multi-word distinct phrases, NEVER single word "clip"
            if (!string.IsNullOrEmpty(phrase) && phrase.Length >= 4 && phrase != "clip")
            {
                choices.Add(phrase);
            }

            if (phrase == "clip that")
            {
                choices.Add("clip that");
                choices.Add("clip that now");
            }
            else if (phrase == "eclipse that")
            {
                choices.Add("eclipse that");
            }
            else if (phrase == "clip it")
            {
                choices.Add("clip it");
            }
            else if (phrase == "save clip")
            {
                choices.Add("save clip");
            }
            else if (phrase == "clip das")
            {
                choices.Add("clip das");
            }
            else if (phrase == "clip das mal")
            {
                choices.Add("clip das mal");
            }
            else if (isGerman)
            {
                choices.Add("clip das");
                choices.Add("clip das mal");
            }
            else
            {
                choices.Add("clip that");
                choices.Add("eclipse that");
            }

            GrammarBuilder gb = new GrammarBuilder(choices);
            gb.Culture = recognizer.RecognizerInfo.Culture;
            Grammar grammar = new Grammar(gb);
            grammar.Name = "EclipseHotwordGrammar";
            recognizer.LoadGrammar(grammar);
        }

        private static string EscapeJson(string s)
        {
            if (s == null) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "");
        }
    }
}
