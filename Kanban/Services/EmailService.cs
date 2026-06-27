using Azure;
using Azure.Communication.Email;
using Kanban.Models;

namespace Kanban.Services
{
    public class EmailService : IEmailService
    {
        private readonly EmailSettings? _emailSettings;
        private readonly EmailClient? _client;
        private readonly ILogger<EmailService> _logger;

        public EmailService(IConfiguration config, ILogger<EmailService> logger)
        {
            _logger = logger;
            _emailSettings = config.GetSection("EmailSettings").Get<EmailSettings>();

            if (_emailSettings == null
                || string.IsNullOrWhiteSpace(_emailSettings.ConnectionString)
                || string.IsNullOrWhiteSpace(_emailSettings.SenderEmail))
            {
                _logger.LogError("EmailSettings configuration is missing; Azure email sending is disabled.");
                return;
            }

            try
            {
                _client = new EmailClient(_emailSettings.ConnectionString);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while initializing the Azure Email Client.");
            }
        }

        public async Task SendEmail(string to, string subject, string bodyHtml)
        {
            if (_client == null || _emailSettings == null)
            {
                _logger.LogWarning("Email could not be sent (Azure configuration is missing). Recipient: {To}", to);
                return;
            }

            var emailMessage = new EmailMessage(
                senderAddress: _emailSettings.SenderEmail,
                recipientAddress: to,
                content: new EmailContent(subject)
                {
                    Html = bodyHtml
                }
            );

            const int maxRetries = 3;
            for (int attempt = 0; attempt < maxRetries; attempt++)
            {
                try
                {
                    var emailSendOperation = await _client.SendAsync(WaitUntil.Completed, emailMessage);

                    if (!emailSendOperation.HasCompleted || emailSendOperation.Value.Status != EmailSendStatus.Succeeded)
                    {
                        throw new Exception($"Azure Email API Error. Status: {emailSendOperation.Value.Status}");
                    }
                    return; // Başarılıysa döngüden çık
                }
                catch (Exception ex)
                {
                    if (attempt < maxRetries - 1)
                    {
                        int delaySeconds = 2 * (attempt + 1);
                        _logger.LogWarning(ex, "Azure email sending failed, retrying ({Try}/{Max}). Recipient: {To}", attempt + 1, maxRetries, to);
                        await Task.Delay(TimeSpan.FromSeconds(delaySeconds));
                    }
                    else
                    {
                        _logger.LogError(ex, "Azure email sending failed after {Max} attempts. Recipient: {To}", maxRetries, to);
                    }
                }
            }
        }

        public async Task SendVerificationCode(string to, string code)
        {
            string html = $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <style>
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f4f7f6;
            margin: 0;
            padding: 0;
        }}
        .container {{
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
            overflow: hidden;
        }}
        .header {{
            background-color: #4F46E5;
            color: #ffffff;
            text-align: center;
            padding: 30px 20px;
        }}
        .header h1 {{
            margin: 0;
            font-size: 24px;
            font-weight: 600;
        }}
        .content {{
            padding: 40px 30px;
            color: #333333;
            line-height: 1.6;
        }}
        .content p {{
            margin: 0 0 20px 0;
            font-size: 16px;
        }}
        .code-container {{
            text-align: center;
            margin: 35px 0;
        }}
        .code {{
            display: inline-block;
            font-size: 36px;
            font-weight: 700;
            color: #4F46E5;
            background-color: #EEF2FF;
            padding: 15px 40px;
            border-radius: 8px;
            letter-spacing: 8px;
        }}
        .footer {{
            background-color: #f9fafb;
            text-align: center;
            padding: 20px;
            font-size: 13px;
            color: #9ca3af;
            border-top: 1px solid #e5e7eb;
        }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>Email Verification</h1>
        </div>
        <div class='content'>
            <p>Hello,</p>
            <p>Please use the following verification code to complete your account confirmation. For your security, do not share this code with anyone.</p>
            
            <div class='code-container'>
                <div class='code'>{code}</div>
            </div>
            
            <p>This code will expire shortly.</p>
            <p style='color: #6b7280; font-size: 14px;'>If you did not request this, you can safely ignore this email.</p>
        </div>
        <div class='footer'>
            &copy; {DateTime.Now.Year} Kanflow. All rights reserved.
        </div>
    </div>
</body>
</html>";

            await SendEmail(to, "Account Verification Code", html);
        }

        public async Task SendInvite(string to, string senderFullName, string senderEmail, string boardTitle, string token)
        {
            string html = $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <style>
        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f4f7f6;
            margin: 0;
            padding: 0;
        }}
        .container {{
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
            overflow: hidden;
        }}
        .header {{
            background-color: #4F46E5;
            color: #ffffff;
            text-align: center;
            padding: 30px 20px;
        }}
        .header h1 {{
            margin: 0;
            font-size: 24px;
            font-weight: 600;
        }}
        .content {{
            padding: 40px 30px;
            color: #333333;
            line-height: 1.6;
        }}
        .content p {{
            margin: 0 0 20px 0;
            font-size: 16px;
        }}
        .button-container {{
            text-align: center;
            margin: 35px 0;
        }}
        .btn {{
            display: inline-block;
            background-color: #4F46E5;
            color: #ffffff !important;
            text-decoration: none;
            padding: 14px 32px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            transition: background-color 0.3s;
        }}
        .btn:hover {{
            background-color: #4338ca;
        }}
        .footer {{
            background-color: #f9fafb;
            text-align: center;
            padding: 20px;
            font-size: 13px;
            color: #9ca3af;
            border-top: 1px solid #e5e7eb;
        }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>Board Invitation</h1>
        </div>
        <div class='content'>
            <p>Hello,</p>
            <p><b>{senderFullName}</b> ({senderEmail}) has invited you to collaborate on the board <b>""{boardTitle}""</b>.</p>
            <p>Please log in to your Kanflow account to accept or decline this invitation.</p>
            
            <div class='button-container'>
                <a href='https://www.{_emailSettings?.Domain}?token={token}' class='btn'>Open Board</a>
            </div>
            
            <p style='color: #6b7280; font-size: 14px;'>If you did not expect this invitation, you can safely ignore this email.</p>
        </div>
        <div class='footer'>
            &copy; {DateTime.Now.Year} Kanflow. All rights reserved.
        </div>
    </div>
</body>
</html>";

            await SendEmail(to, $"Invitation to collaborate on {boardTitle}", html);
        }
    }
}