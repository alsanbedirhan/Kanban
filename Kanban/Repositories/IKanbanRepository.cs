using Kanban.Entities;

namespace Kanban.Repositories
{
    public interface IKanbanRepository
    {
        Task<List<Board>> GetBoards(long userId);
    }
}
