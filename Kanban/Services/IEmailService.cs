namespace Kanban.Services
{
    public interface IEmailService
    {
        Task SendEmail(string to, string subject, string bodyHtml);
        Task SendVerificationCode(string to, string code);
        Task SendInvite(string to, string senderFullName, string senderEmail, string boardTitle, string token);
    }
}
