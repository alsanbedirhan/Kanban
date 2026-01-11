using Kanban.Entities;
using Kanban.Models;

namespace Kanban.Services
{
    public interface IKanbanService
    {
        Task<ServiceResult<List<BoardColumn>>> GetBoardColumns_Cards(long userId, long boardId);
        Task<ServiceResult<List<Board>>> GetBoards(long userId);
        Task<ServiceResult<Board>> CreateBoard(long userId, string title);
    }
}
