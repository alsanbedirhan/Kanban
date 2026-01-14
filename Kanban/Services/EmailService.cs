using System.Net;
using System.Net.Mail;

namespace Kanban.Services
{
    public class EmailService(IConfiguration config) : IEmailService
    {
        private readonly string _smtpDomain = config["Mail:Domain"];
        private readonly string _smtpPass = config["Mail:Pass"];
        private readonly string _smtpEmail = config["Mail:Address"];

        public async Task SendEmail(string to, string subject, string bodyHtml)
        {
            if (string.IsNullOrEmpty(_smtpDomain) || string.IsNullOrEmpty(_smtpPass) || string.IsNullOrEmpty(_smtpEmail))
            {
                return;
            }

            var smtp = new SmtpClient(_smtpDomain, 465)
            {
                Credentials = new NetworkCredential(_smtpEmail, _smtpPass),
                EnableSsl = true,
                UseDefaultCredentials = false
            };

            var mail = new MailMessage()
            {
                From = new MailAddress(_smtpEmail, _smtpEmail),
                Subject = subject,
                Body = bodyHtml,
                IsBodyHtml = true
            };

            mail.To.Add(to);

            await smtp.SendMailAsync(mail);
        }

        public async Task SendVerificationCode(string to, string code)
        {
            string html = "<h3>Your verification code</h3>" +
                "<p>Please use the following verification code to complete your account setup:</p>" +
                "<p><b>" + code + "</b></p>" +
                "<p>This code will expire shortly.</p>";

            await SendEmail(to, "Verification Code", html);
        }

        public async Task SendInvite(string to, string senderFullName, string boardName)
        {
            string html = "<h3>New Board Invitation</h3>" +
                "<p><b>" + senderFullName + "</b> has invited you to collaborate on the board <b>" + boardName + "</b>.</p>" +
                "<p>Please log in to your Kanban account to accept or decline this invitation.</p>" +
                "<p><a href=\"https://www." + _smtpDomain + "\" style=\"font-weight:600;\">Open Kanban</a></p>" +
                "<p>If you did not expect this invitation, you can safely ignore this email.</p>";

            await SendEmail(to, "Board Invitation", html);
        }
    }
}
