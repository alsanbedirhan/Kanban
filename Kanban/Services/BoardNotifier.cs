using Kanban.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace Kanban.Services
{
    public interface IBoardNotifier
    {
        Task BoardChanged(long boardId);
        Task UserUpdatesChanged(long userId);
    }

    public class BoardNotifier : IBoardNotifier
    {
        public const string ConnectionHeader = "X-Board-Connection";

        private readonly IHubContext<BoardHub> _hub;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly ILogger<BoardNotifier> _logger;

        public BoardNotifier(IHubContext<BoardHub> hub, IHttpContextAccessor httpContextAccessor, ILogger<BoardNotifier> logger)
        {
            _hub = hub;
            _httpContextAccessor = httpContextAccessor;
            _logger = logger;
        }

        public async Task BoardChanged(long boardId)
        {
            var group = BoardHub.BoardGroup(boardId);
            var origin = _httpContextAccessor.HttpContext?.Request.Headers[ConnectionHeader].ToString();

            // The tab that made the change already refreshed itself.
            var clients = string.IsNullOrEmpty(origin)
                ? _hub.Clients.Group(group)
                : _hub.Clients.GroupExcept(group, origin);

            await Send(() => clients.SendAsync("BoardChanged", boardId));
        }

        public Task UserUpdatesChanged(long userId) =>
            Send(() => _hub.Clients.User(userId.ToString()).SendAsync("UpdatesChanged"));

        private async Task Send(Func<Task> send)
        {
            try
            {
                await send();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "SignalR notification failed.");
            }
        }
    }
}
