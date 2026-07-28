using System.Text.RegularExpressions;
using Ganss.Xss;

namespace Kanban.Security
{
    public static class InputSanitizer
    {
        private static readonly HtmlSanitizer HtmlSanitizer = CreateSanitizer();
        private static readonly Regex HexColorRegex = new(@"^#[0-9A-Fa-f]{6}$", RegexOptions.Compiled);

        private static HtmlSanitizer CreateSanitizer()
        {
            var sanitizer = new HtmlSanitizer();
            sanitizer.AllowedSchemes.Add("mailto");
            return sanitizer;
        }

        public static string SanitizeRichText(string? html)
        {
            if (string.IsNullOrWhiteSpace(html))
                return string.Empty;

            return HtmlSanitizer.Sanitize(html);
        }

        public static bool IsValidHexColor(string? color) =>
            !string.IsNullOrWhiteSpace(color) && HexColorRegex.IsMatch(color);

        public static string SanitizePlainText(string? text)
        {
            if (string.IsNullOrWhiteSpace(text))
                return string.Empty;

            return HtmlSanitizer.Sanitize(text).Trim();
        }

        public static string NormalizeHexColor(string? color, string fallback = "#ffffff") =>
            IsValidHexColor(color) ? color! : fallback;
    }
}
