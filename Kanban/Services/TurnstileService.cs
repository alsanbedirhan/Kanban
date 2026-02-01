using Kanban.Models;
using System.Text.Json;

namespace Kanban.Services
{
    public class TurnstileService : ITurnstileService
    {
        private readonly HttpClient _httpClient;
        private readonly TurnstileSettings? _turnstileSettings;

        public TurnstileService(HttpClient httpClient, IConfiguration config)
        {
            _httpClient = httpClient;
            _turnstileSettings = config.GetSection("TurnstileSettings").Get<TurnstileSettings>() ?? null;
        }

        public async Task<bool> VerifyAsync(string token)
        {
            if (string.IsNullOrWhiteSpace(token) || _turnstileSettings == null) return false;

            try
            {
                var requestContent = new FormUrlEncodedContent(new[]
                {
                    new KeyValuePair<string, string>("secret", _turnstileSettings.SecretKey),
                    new KeyValuePair<string, string>("response", token)
                });

                var response = await _httpClient.PostAsync("https://challenges.cloudflare.com/turnstile/v0/siteverify", requestContent);

                if (!response.IsSuccessStatusCode) return false;

                var jsonString = await response.Content.ReadAsStringAsync();
                var result = JsonSerializer.Deserialize<TurnstileResponse>(jsonString);

                return result.success;
            }
            catch (Exception ex)
            {
                return false;
            }
        }
    }

    public class TurnstileResponse
    {
        public bool success { get; set; }
    }
}
