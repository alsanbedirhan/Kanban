using Kanban.Repositories;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Kanban.Hubs
{
    [Authorize]
    public class BoardHub : Hub
    {
        private readonly IKanbanRepository _kanbanRepository;

        public BoardHub(IKanbanRepository kanbanRepository)
        {
            _kanbanRepository = kanbanRepository;
        }

        public static string BoardGroup(long boardId) => $"board:{boardId}";

        public async Task<bool> JoinBoard(long boardId)
        {
            if (!await _kanbanRepository.ValidateBoardWithBoardId(Context.User!.GetUserId(), boardId))
                return false;

            await Groups.AddToGroupAsync(Context.ConnectionId, BoardGroup(boardId));
            return true;
        }

        public Task LeaveBoard(long boardId) =>
            Groups.RemoveFromGroupAsync(Context.ConnectionId, BoardGroup(boardId));
    }
}
