using Kanban.Entities;

namespace Kanban.Repositories
{
    public interface IKanbanRepository
    {
        Task<List<BoardColumn>> GetBoardColumns_Cards(long boardId);
        Task<List<Board>> GetBoards(long userId);
        Task<Board> AddBoard(long userId, string title);
        Task<BoardCard> AddCard(long userId, long columnId, string desc);
        Task MoveCard(long userId, long cardId, long newColumnId, int newOrder);
        Task<bool> ValidateBoardWithBoardId(long userId, long boardId);
        Task<bool> ValidateBoardWithColumnId(long userId, long columnId);
        Task<bool> ValidateBoardWithCardId(long userId, long cardId);
        Task DeleteColumn(long columnId);
        Task DeleteBoard(long boardId);
        Task DeleteCard(long cardId);
        Task<BoardColumn> AddColumn(long boardId, string title);
    }
}
