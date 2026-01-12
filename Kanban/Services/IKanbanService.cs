using Kanban.Entities;
using Kanban.Models;

namespace Kanban.Services
{
    public interface IKanbanService
    {
        Task<ServiceResult<List<BoardColumn>>> GetBoardColumns_Cards(long userId, long boardId);
        Task<ServiceResult<List<Board>>> GetBoards(long userId);
        Task<ServiceResult<Board>> CreateBoard(long userId, string title);
        Task<ServiceResult<BoardColumn>> AddColumn(long boardId, string title);
        Task<ServiceResult<BoardCard>> AddCard(long userId, long columnId, string desc);
        Task<ServiceResult> MoveCard(long userId, long boardId, long cardId, long newColumnId, int newOrder);
        Task<ServiceResult> DeleteColumn(long userId, long columnId);
        Task<ServiceResult> DeleteBoard(long userId, long boardId);
        Task<ServiceResult> DeleteCard(long userId, long cardId);
    }
}
