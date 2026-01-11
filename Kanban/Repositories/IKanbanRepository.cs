using Kanban.Entities;

namespace Kanban.Repositories
{
    public interface IKanbanRepository
    {
        Task<List<BoardColumn>> GetBoardColumns_Cards(long boardId);
        Task<List<Board>> GetBoards(long userId);
        Task<Board> AddBoard(long userId, string title);
        Task<bool> ValidateBoard(long userId, long boardId);
    }
}
