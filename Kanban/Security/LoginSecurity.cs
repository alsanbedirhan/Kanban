namespace Kanban.Security
{
    public static class LoginSecurity
    {
        public const int MaxFailedAttempts = 5;
        public static readonly TimeSpan FailedAttemptWindow = TimeSpan.FromMinutes(15);

        /// <summary>Valid BCrypt hash used when the account is unknown so Verify always runs.</summary>
        public static readonly string DummyPasswordHash =
            BCrypt.Net.BCrypt.HashPassword("__login_timing_dummy__", workFactor: 11);
    }
}
