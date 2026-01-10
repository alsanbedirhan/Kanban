using Kanban.Entities;
using Microsoft.EntityFrameworkCore;

namespace Kanban.Repositories
{
    public class KanbanRepository : IKanbanRepository
    {
        private readonly KanbanDbContext _context;
        public KanbanRepository(KanbanDbContext context)
        {
            _context = context;
        }
        public async Task<List<Board>> GetBoards(long userId)
        {
            return await _context.BoardMembers.AsNoTracking()
                .Where(b => b.UserId == userId && b.IsActive && b.Board.IsActive)
                .Select(b => b.Board)
                .ToListAsync();
        }
    }
}