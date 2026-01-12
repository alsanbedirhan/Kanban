using Kanban.Entities;
using Microsoft.EntityFrameworkCore;
using System.Linq;

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

        public async Task<BoardCard> AddCard(long userId, long columnId, string desc)
        {
            var b = new BoardCard
            {
                Desc = desc,
                BoardColumnId = columnId,
                IsActive = true,
                CreatedBy = userId
            };
            await _context.BoardCards.AddAsync(b);
            await _context.SaveChangesAsync();
            return b;
        }

        public async Task<BoardColumn> AddColumn(long boardId, string title)
        {
            var b = new BoardColumn
            {
                BoardId = boardId,
                Title = title,
                IsActive = true
            };
            await _context.BoardColumns.AddAsync(b);
            await _context.SaveChangesAsync();
            return b;
        }

        public async Task DeleteBoard(long boardId)
        {
            await _context.Boards.Where(bc => bc.Id == boardId && bc.IsActive)
                .ExecuteUpdateAsync(bc => bc.SetProperty(b => b.IsActive, false));
            await _context.SaveChangesAsync();
        }

        public async Task DeleteCard(long cardId)
        {
            await _context.BoardCards.Where(bc => bc.Id == cardId && bc.IsActive)
                .ExecuteUpdateAsync(bc => bc.SetProperty(b => b.IsActive, false));
            await _context.SaveChangesAsync();
        }

        public async Task DeleteColumn(long columnId)
        {
            await _context.BoardColumns.Where(bc => bc.Id == columnId && bc.IsActive)
                 .ExecuteUpdateAsync(bc => bc.SetProperty(b => b.IsActive, false));
            await _context.SaveChangesAsync();
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

        public async Task MoveCard(long userId, long cardId, long newColumnId, int newOrder)
        {
            await _context.BoardCards.Where(bc => bc.Id == cardId && bc.IsActive)
                .ExecuteUpdateAsync(bc => bc
                    .SetProperty(b => b.BoardColumnId, newColumnId)
                    .SetProperty(b => b.OrderNo, newOrder)
                    );
            await _context.SaveChangesAsync();
        }

        public async Task<bool> ValidateBoardWithBoardId(long userId, long boardId)
        {
            return await _context.BoardMembers.AnyAsync(b => b.UserId == userId && b.BoardId == boardId && b.IsActive && b.Board.IsActive);
        }

        public async Task<bool> ValidateBoardWithCardId(long userId, long cardId)
        {
            var r = await _context.BoardCards.AsNoTracking().Where(x => x.Id == cardId).Select(x => new { x.BoardColumnId }).FirstOrDefaultAsync();
            if (r == null)
            {
                return false;
            }
            return await ValidateBoardWithCardId(userId, r.BoardColumnId);
        }

        public async Task<bool> ValidateBoardWithColumnId(long userId, long columnId)
        {
            var r = await _context.BoardColumns.AsNoTracking().Where(x => x.Id == columnId).Select(x => new { x.BoardId }).FirstOrDefaultAsync();
            if (r == null)
            {
                return false;
            }
            return await ValidateBoardWithBoardId(userId, r.BoardId);
        }
    }
}