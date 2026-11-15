namespace Kanban.Services
{
    public interface IEmailService
    {
        Task<bool> SendEmail(string to, string subject, string bodyHtml,
            int maxAttempts = 3, bool waitForDelivery = true, TimeSpan? attemptTimeout = null);
        Task<bool> SendVerificationCode(string to, string code);
        Task<bool> SendInvite(string to, string senderFullName, string senderEmail, string boardTitle, string token);
    }
}
