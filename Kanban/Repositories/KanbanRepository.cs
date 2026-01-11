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

        public async Task<Board> AddBoard(long userId, string title)
        {
            var b = new Board
            {
                Title = title,
                IsActive = true,
                UserId = userId
            };
            await _context.BoardMembers.AddAsync(new BoardMember
            {
                UserId = userId,
                Board = b,
                IsActive = true,
                RoleCode = "OWNER"
            });
            await _context.SaveChangesAsync();
            return b;
        }

        public async Task<List<BoardColumn>> GetBoardColumns_Cards(long boardId)
        {
            return await _context.BoardColumns.AsNoTracking()
                .Where(bc => bc.BoardId == boardId && bc.IsActive)
                .Include(bc => bc.BoardCards.Where(bc => bc.IsActive))
                .ToListAsync();
        }

        public async Task<List<Board>> GetBoards(long userId)
        {
            return await _context.BoardMembers.AsNoTracking()
                .Where(b => b.UserId == userId && b.IsActive && b.Board.IsActive)
                .Select(b => b.Board)
                .ToListAsync();
        }

        public async Task<bool> ValidateBoard(long userId, long boardId)
        {
            return await _context.BoardMembers.AnyAsync(b => b.UserId == userId && b.BoardId == boardId && b.IsActive && b.Board.IsActive);
        }
    }
}