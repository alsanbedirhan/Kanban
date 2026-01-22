using Kanban.Models;
using Kanban.Repositories;
using Mailjet.Client;
using Mailjet.Client.Resources;
using Newtonsoft.Json.Linq;
using System.Net;
using System.Net.Mail;

namespace Kanban.Services
{
    public class EmailService : IEmailService
    {
        private readonly EmailSettings? _emailSettings;
        public EmailService(IConfiguration config)
        {
            _emailSettings = config.GetSection("EmailSettings").Get<EmailSettings>() ?? null;
        }
        public async Task SendEmail(string to, string subject, string bodyHtml)
        {
            MailjetClient client = new MailjetClient(_emailSettings.API_Key, _emailSettings.Secret_Key);

            MailjetRequest request = new MailjetRequest
            {
                Resource = Send.Resource,
            }
            .Property(Send.FromEmail, _emailSettings.Address)
            .Property(Send.FromName, "Kanflow")
            .Property(Send.Subject, subject)
            .Property(Send.HtmlPart, bodyHtml)
            .Property(Send.Recipients, new JArray {
                new JObject {
                    {"Email", to}
                }
            });

            try
            {
                MailjetResponse response = await client.PostAsync(request);

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine(response.StatusCode + ": " + response.Content);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
            }
        }
        public async Task SendVerificationCode(string to, string code)
        {
            string html = "<h3>Your verification code</h3>" +
                "<p>Please use the following verification code to complete your account setup:</p>" +
                "<p><b>" + code + "</b></p>" +
                "<p>This code will expire shortly.</p>";

            await SendEmail(to, "Verification Code", html);
        }

        public async Task SendInvite(string to, string senderFullName, string senderEmail, string boardTitle, string token)
        {
            string html = "<h3>New Board Invitation</h3>" +
                "<p><b>" + senderFullName + "</b> (" + senderEmail + ") has invited you to collaborate on the board <b>" + boardTitle + "</b>.</p>" +
                "<p>Please log in to your Kanban account to accept or decline this invitation.</p>" +
                "<p><a href=\"https://www." + _emailSettings.Domain + "?token=" + token + "\" style=\"font-weight:600;\">Open Kanban</a></p>" +
                "<p>If you did not expect this invitation, you can safely ignore this email.</p>";

            await SendEmail(to, "Board Invitation", html);
        }
    }
}
