using Kanban.Entities;
using Kanban.Models;
using Microsoft.EntityFrameworkCore;
using System.Linq;

namespace Kanban.Repositories
{
    public class KanbanRepository : IKanbanRepository
    {
        private readonly KanbanDbContext _context;
        private readonly IDBDateTimeProvider _dbDate;
        public KanbanRepository(KanbanDbContext context, IDBDateTimeProvider dbDate)
        {
            _context = context;
            _dbDate = dbDate;
        }

        public async Task<Board> AddBoard(long userId, string title)
        {
            var b = new Board
            {
                Title = title,
                IsActive = true,
                UserId = userId,
                BoardColumns = new List<BoardColumn> { new BoardColumn {
                    IsActive = true,
                    Title = "To Do"
                }, new BoardColumn {
                    IsActive = true,
                    Title = "Progress"
                },new BoardColumn {
                    IsActive = true,
                    Title = "Done"
                }}
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

        public async Task<BoardCard> AddCard(long userId, long columnId, string desc, DateOnly dueDate, int warningDays, string highlightColor)
        {
            var lastOrder = await _context.BoardCards
                .Where(c => c.BoardColumnId == columnId && c.IsActive)
                .MaxAsync(c => (int?)c.OrderNo) ?? 0;

            var b = new BoardCard
            {
                Desc = desc,
                BoardColumnId = columnId,
                IsActive = true,
                CreatedBy = userId,
                OrderNo = lastOrder + 1,
                DueDate = dueDate,
                WarningDays = warningDays,
                HighlightColor = highlightColor
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

        public async Task AddUserToBoard(long userId, long boardId, string roleCode)
        {
            var b = new BoardMember
            {
                BoardId = boardId,
                IsActive = true,
                RoleCode = roleCode,
                UserId = userId
            };
            await _context.BoardMembers.AddAsync(b);
            await _context.SaveChangesAsync();
        }

        public async Task DeleteBoard(long userId, long boardId)
        {
            if (await _context.BoardMembers.AnyAsync(x => x.BoardId == boardId && x.UserId == userId && x.RoleCode == "OWNER"))
            {
                await _context.Boards.Where(bc => bc.Id == boardId && bc.IsActive)
                    .ExecuteUpdateAsync(bc => bc.SetProperty(b => b.IsActive, false));
            }
            else
            {
                await _context.BoardMembers.Where(bc => bc.BoardId == boardId && bc.UserId == userId && bc.IsActive)
                   .ExecuteUpdateAsync(bc => bc.SetProperty(b => b.IsActive, false));
            }
        }

        public async Task SetAcceptedInvite(long inviteId)
        {
            await _context.Userinvites.Where(bc => bc.Id == inviteId)
                .ExecuteUpdateAsync(bc => bc.SetProperty(b => b.IsAccepted, true));
        }

        public async Task DeleteCard(long cardId)
        {
            await _context.BoardCards.Where(bc => bc.Id == cardId && bc.IsActive)
                .ExecuteUpdateAsync(bc => bc.SetProperty(b => b.IsActive, false));
        }

        public async Task DeleteColumn(long columnId)
        {
            await _context.BoardColumns.Where(bc => bc.Id == columnId && bc.IsActive)
                 .ExecuteUpdateAsync(bc => bc.SetProperty(b => b.IsActive, false));
        }

        public async Task<Board?> GetBoard(long boardId)
        {
            return await _context.Boards.AsNoTracking().AsNoTracking()
                .Where(b => b.Id == boardId && b.IsActive)
                .FirstOrDefaultAsync();
        }

        public async Task<List<BoardColumn>> GetBoardColumns_Cards(long boardId)
        {
            return await _context.BoardColumns.AsNoTracking()
                .Where(bc => bc.BoardId == boardId && bc.IsActive)
                .Include(bc => bc.BoardCards.Where(bc => bc.IsActive))
                .ToListAsync();
        }

        public async Task<List<BoardOwnerResultModel>> GetBoards(long userId)
        {
            return await _context.BoardMembers.AsNoTracking()
                .Where(b => b.UserId == userId && b.IsActive && b.Board.IsActive)
                .Select(b => new BoardOwnerResultModel { Board = b.Board, IsOwner = b.RoleCode == "OWNER" })
                .ToListAsync();
        }

        public async Task<string> GetBoardTitle(long boardId)
        {
            return await _context.Boards.AsNoTracking()
                .Where(b => b.Id == boardId && b.IsActive)
                .Select(b => b.Title)
                .FirstOrDefaultAsync() ?? "";
        }

        public async Task MoveCard(long userId, long cardId, long newColumnId, int newOrder)
        {
            var card = await _context.BoardCards
                .Where(c => c.Id == cardId && c.IsActive)
                .FirstOrDefaultAsync();

            if (card == null)
                throw new Exception("Card not found");

            var oldColumnId = card.BoardColumnId;

            await _context.BoardCards
                .Where(c => c.BoardColumnId == newColumnId && c.OrderNo >= newOrder && c.IsActive)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.OrderNo, x => x.OrderNo + 1));

            await _context.BoardCards
                .Where(c => c.Id == cardId)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(x => x.BoardColumnId, newColumnId)
                    .SetProperty(x => x.OrderNo, newOrder));

        }

        public async Task<bool> ValidateBoardWithBoardId(long userId, long boardId)
        {
            return await _context.BoardMembers.AnyAsync(b => b.UserId == userId && b.BoardId == boardId && b.IsActive && b.Board.IsActive);
        }

        public async Task<bool> ValidateBoardWithCardId(long userId, long cardId)
        {
            var r = await _context.BoardCards.AsNoTracking().Where(x => x.Id == cardId).Select(x => new { x.BoardColumn.BoardId }).FirstOrDefaultAsync();
            if (r == null)
            {
                return false;
            }
            return await ValidateBoardWithBoardId(userId, r.BoardId);
        }

        public async Task<Userinvite?> GetInvite(long id)
        {
            return await _context.Userinvites.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
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

        public async Task<Userinvite> AddInvite(long senderUserId, long boardId, string email)
        {
            var now = await _dbDate.Now();
            var invite = new Userinvite
            {
                BoardId = boardId,
                Email = email,
                IsAccepted = false,
                CreatedAt = now,
                ExpiresAt = now.AddMinutes(15),
                SenderUserId = senderUserId
            };
            await _context.Userinvites.AddAsync(invite);
            await _context.SaveChangesAsync();
            return invite;
        }
    }
}