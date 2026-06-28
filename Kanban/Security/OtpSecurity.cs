using System.Security.Cryptography;
using System.Text;

namespace Kanban.Security
{
    public static class OtpSecurity
    {
        public const int MaxFailedAttempts = 5;
        public static readonly TimeSpan FailedAttemptWindow = TimeSpan.FromMinutes(15);

        public static bool CodesMatch(string expected, string provided)
        {
            if (expected.Length != provided.Length)
                return false;

            return CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expected),
                Encoding.UTF8.GetBytes(provided));
        }
    }
}
