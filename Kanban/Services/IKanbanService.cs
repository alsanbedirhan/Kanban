using Kanban.Entities;
using Kanban.Models;

namespace Kanban.Services
{
    public interface IKanbanService
    {
        Task<ServiceResult<List<Board>>> GetBoards(long userId);
    }
}
