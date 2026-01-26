using Kanban.Entities;
using Kanban.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using System.Linq;

namespace Kanban.Repositories
{
    public class KanbanRepository : IKanbanRepository
    {
        private readonly KanbanDbContext _context;
        private readonly IDBDateTimeProvider _dbDate;
        private readonly IMemoryCache _cache;
        public KanbanRepository(KanbanDbContext context, IMemoryCache cache, IDBDateTimeProvider dbDate)
        {
            _context = context;
            _cache = cache;
            _dbDate = dbDate;
        }

        private async Task SendNotification(long userId, string message)
        {
            var now = await _dbDate.Now();
            var notification = new UserNotification
            {
                UserId = userId,
                Message = message,
                CreatedAt = now,
                IsDeleted = false
            };

            await _context.UserNotifications.AddAsync(notification);
            await _context.SaveChangesAsync();

            _cache.Remove($"User_HasUpdates_{userId}");
        }

        public async Task<Board> AddBoard(long userId, string title)
        {
            var now = await _dbDate.Now();
            var b = new Board
            {
                Title = title,
                IsActive = true,
                UserId = userId,
                UpdatedAt = now,
                CreatedAt = now,
                BoardColumns = new List<BoardColumn> {
                    new BoardColumn { IsActive = true, Title = "To Do" },
                    new BoardColumn { IsActive = true, Title = "Progress" },
                    new BoardColumn { IsActive = true, Title = "Done" }
                }
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

        public async Task WorkInvite(long inviteId, long userId, long boardId, bool isAccepted)
        {
            await _context.UserInvites.Where(bc => bc.Id == inviteId)
                .ExecuteUpdateAsync(bc => bc
                .SetProperty(b => b.IsAccepted, isAccepted)
                .SetProperty(b => b.IsUsed, true));

            if (isAccepted)
            {
                await _context.BoardMembers.AddAsync(new BoardMember { BoardId = boardId, IsActive = true, RoleCode = "MEMBER", UserId = userId });
                await _context.SaveChangesAsync();

                var invite = await _context.UserInvites.AsNoTracking()
                    .Where(x => x.Id == inviteId)
                    .Select(x => new { x.SenderUserId, x.Board.Title })
                    .FirstOrDefaultAsync();

                if (invite != null)
                {
                    await SendNotification(invite.SenderUserId, $"Your invitation to board '{invite.Title}' was accepted.");
                    await SendNotification(userId, $"You successfully joined the board '{invite.Title}'.");
                }

                await TouchBoard(boardId);
            }
        }

        public async Task<BoardCard> AddCard(long userId, long boardId, long columnId, string desc, DateOnly dueDate, int warningDays, string highlightColor, long assigneeId)
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
                HighlightColor = highlightColor,
                AssigneeUserId = assigneeId > 0 ? assigneeId : null
            };

            await _context.BoardCards.AddAsync(b);
            await _context.SaveChangesAsync();

            if (assigneeId > 0 && assigneeId != userId)
            {
                await SendNotification(assigneeId, $"You have been assigned to a new card");
            }

            await TouchBoard(boardId);
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
            await TouchBoard(boardId);
            return b;
        }

        public async Task<bool> CheckBoardMembers(long userId, long boardId)
        {
            return await _context.BoardMembers.AnyAsync(x => x.BoardId == boardId && x.UserId == userId && x.IsActive);
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

            await TouchBoard(boardId);
        }

        public async Task DeleteCard(long cardId)
        {
            await _context.BoardCards.Where(bc => bc.Id == cardId && bc.IsActive)
                .ExecuteUpdateAsync(bc => bc.SetProperty(b => b.IsActive, false));

            var board = await _context.BoardCards
                .Where(c => c.Id == cardId)
                .Select(c => new { c.BoardColumn.BoardId })
                .FirstOrDefaultAsync();

            if (board != null) await TouchBoard(board.BoardId);
        }

        public async Task DeleteColumn(long columnId)
        {
            await _context.BoardColumns.Where(bc => bc.Id == columnId && bc.IsActive)
                 .ExecuteUpdateAsync(bc => bc.SetProperty(b => b.IsActive, false));

            var board = await _context.BoardColumns
             .Where(c => c.Id == columnId)
             .Select(c => new { c.BoardId })
             .FirstOrDefaultAsync();

            if (board != null) await TouchBoard(board.BoardId);
        }

        public async Task<Board?> GetBoard(long boardId)
        {
            return await _context.Boards.AsNoTracking()
                .Where(b => b.Id == boardId && b.IsActive)
                .FirstOrDefaultAsync();
        }

        public async Task<List<BoardColumnResultModel>> GetBoardColumns_Cards(long boardId)
        {
            return await _context.BoardColumns.AsNoTracking()
                .Where(bc => bc.BoardId == boardId && bc.IsActive)
                .Select(x => new BoardColumnResultModel
                {
                    Id = x.Id,
                    Title = x.Title,
                    Cards = x.BoardCards.Where(y => y.IsActive).Select(c => new BoardCardResultModel
                    {
                        Id = c.Id,
                        Desc = c.Desc,
                        Order = c.OrderNo,
                        DueDate = c.DueDate,
                        WarningDays = c.WarningDays,
                        HighlightColor = c.HighlightColor ?? "",
                        AssigneeAvatar = c.AssigneeUser != null ? c.AssigneeUser.Avatar : "",
                        AssigneeName = c.AssigneeUser != null ? c.AssigneeUser.FullName : "",
                        AssigneeId = c.AssigneeUser != null ? c.AssigneeUser.Id : 0
                    }).OrderBy(y => y.Order).ToList()
                }).ToListAsync();
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
                .Select(x => new { x.BoardColumnId, x.BoardColumn.BoardId })
                .FirstOrDefaultAsync();

            if (card == null) return;

            var boardId = card.BoardId;

            await _context.BoardCards
                .Where(c => c.BoardColumnId == newColumnId && c.OrderNo >= newOrder && c.IsActive)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.OrderNo, x => x.OrderNo + 1));

            await _context.BoardCards
                .Where(c => c.Id == cardId)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(x => x.BoardColumnId, newColumnId)
                    .SetProperty(x => x.OrderNo, newOrder));

            await TouchBoard(boardId);
        }

        public async Task<bool> ValidateBoardWithBoardId(long userId, long boardId)
        {
            var members = await GetCachedBoardMembers(boardId);
            return members.Any(m => m.UserId == userId);
        }

        public async Task<List<BoardMemberResultModel>> GetBoardMembers(long boardId)
        {
            return await _context.BoardMembers.AsNoTracking()
                .Where(bm => bm.BoardId == boardId && bm.IsActive)
                .Select(x => new BoardMemberResultModel { UserId = x.UserId, RoleCode = x.RoleCode, FullName = x.User.FullName, Email = x.User.Email })
                .ToListAsync();
        }

        public async Task<long?> GetCardAssignee(long cardId)
        {
            return await _context.BoardCards.AsNoTracking()
                .Where(bc => bc.Id == cardId && bc.IsActive)
                .Select(bc => bc.AssigneeUserId).FirstOrDefaultAsync();
        }

        public async Task<bool> ValidateManageBoard(long userId, long boardId)
        {
            var members = await GetCachedBoardMembers(boardId);
            return members.Any(m => m.UserId == userId && m.RoleCode == "OWNER");
        }

        public async Task DeleteMember(long boardId, long userId)
        {
            await _context.BoardMembers.Where(bc => bc.BoardId == boardId && bc.UserId == userId && bc.IsActive)
                    .ExecuteUpdateAsync(bc => bc.SetProperty(b => b.IsActive, false));

            var boardTitle = await GetBoardTitle(boardId);
            await SendNotification(userId, $"You have been removed from board '{boardTitle}'.");

            await TouchBoard(boardId);
        }

        public async Task PromoteToOwner(long boardId, long userId)
        {
            await _context.BoardMembers.Where(bc => bc.BoardId == boardId && bc.UserId == userId && bc.IsActive)
                    .ExecuteUpdateAsync(bc => bc.SetProperty(b => b.RoleCode, "OWNER"));

            var boardTitle = await GetBoardTitle(boardId);
            await SendNotification(userId, $"You have been promoted to OWNER of board '{boardTitle}'.");

            await TouchBoard(boardId);
        }

        public async Task<BoardRefresResultModel> GetBoardVersion(long boardId)
        {
            var now = await _dbDate.Now();
            string cacheKey = $"Board_{boardId}_Version";

            if (!_cache.TryGetValue(cacheKey, out DateTime lastActivity))
            {
                lastActivity = await _context.Boards
                    .Where(b => b.Id == boardId)
                    .Select(b => b.UpdatedAt)
                    .FirstOrDefaultAsync();

                _cache.Set(cacheKey, lastActivity, TimeSpan.FromHours(1));
            }

            return new BoardRefresResultModel { LastUpdate = lastActivity, Now = now };
        }

        private async Task TouchBoard(long boardId)
        {
            var now = await _dbDate.Now();
            await _context.Boards
                .Where(b => b.Id == boardId)
                .ExecuteUpdateAsync(x => x.SetProperty(b => b.UpdatedAt, now));

            _cache.Remove($"Board_{boardId}_Version");
            _cache.Remove($"Board_{boardId}_Members");
        }

        private async Task<List<BoardMember>> GetCachedBoardMembers(long boardId)
        {
            string cacheKey = $"Board_{boardId}_Members";

            if (!_cache.TryGetValue(cacheKey, out List<BoardMember> members))
            {
                members = await _context.BoardMembers
                    .AsNoTracking()
                    .Where(b => b.BoardId == boardId && b.IsActive)
                    .ToListAsync();

                _cache.Set(cacheKey, members, TimeSpan.FromHours(1));
            }
            return members;
        }

        public async Task UpdateCard(long userId, long cardId, string desc, DateOnly dueDate, int warningDays, string highlightColor, long assigneeId)
        {
            var board = await _context.BoardCards.Where(x => x.Id == cardId)
                .Select(c => new { c.BoardColumn.BoardId }).FirstOrDefaultAsync();

            await _context.BoardCards
            .Where(c => c.Id == cardId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.Desc, desc)
                .SetProperty(x => x.DueDate, dueDate)
                .SetProperty(x => x.AssigneeUserId, assigneeId > 0 ? assigneeId : null)
                .SetProperty(x => x.WarningDays, warningDays)
                .SetProperty(x => x.HighlightColor, highlightColor)
            );

            if (board != null) await TouchBoard(board.BoardId);
        }

        public async Task<List<CommentResutModel>> GetComments(long cardId)
        {
            return await _context.BoardCardComments.AsNoTracking()
                .Where(c => c.BoardCardId == cardId && !c.IsDeleted)
                .Select(c => new CommentResutModel
                {
                    Id = c.Id,
                    Message = c.Message,
                    CreatedAt = c.CreatedAt,
                    FullName = c.User.FullName,
                    UserId = c.UserId
                })
                .ToListAsync();
        }

        public async Task<BoardCardComment> AddComment(long userId, long cardId, string message)
        {
            var now = await _dbDate.Now();
            var comment = new BoardCardComment
            {
                BoardCardId = cardId,
                CreatedAt = now,
                IsDeleted = false,
                Message = message,
                UserId = userId
            };
            await _context.BoardCardComments.AddAsync(comment);
            await _context.SaveChangesAsync();

            var card = await _context.BoardCards.AsNoTracking().Select(c => new { c.Id, c.AssigneeUserId, c.Desc }).FirstOrDefaultAsync(c => c.Id == cardId);
            if (card != null && card.AssigneeUserId.HasValue && card.AssigneeUserId.Value != userId)
            {
                await SendNotification(card.AssigneeUserId.Value, $"New comment on card: {message}");
            }

            return comment;
        }

        public async Task DeleteComment(long commentId)
        {
            await _context.BoardCardComments.Where(c => c.Id == commentId && !c.IsDeleted)
                .ExecuteUpdateAsync(c => c.SetProperty(b => b.IsDeleted, true));
        }

        public Task<bool> ValidateComment(long userId, long commentId)
        {
            return _context.BoardCardComments.AnyAsync(c => c.Id == commentId && c.UserId == userId && !c.IsDeleted);
        }
    }
}