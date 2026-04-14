using Kanban.Entities;
using Kanban.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using System;
using System.Net;
using System.Net.Mail;
using System.Threading.Tasks;

namespace Kanban.Repositories
{
    public class UserRepository : IUserRepository
    {
        private readonly IMemoryCache _cache;
        private readonly KanbanDbContext _context;
        private readonly IDBDateTimeProvider _dbDate;

        public UserRepository(KanbanDbContext context, IMemoryCache cache, IDBDateTimeProvider dbDate)
        {
            _context = context;
            _cache = cache;
            _dbDate = dbDate;
        }

        public async Task<User?> GetByEmail(string email)
        {
            return await _context.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Email == email);
        }
        public async Task<User?> GetByEmailForUpdate(string email)
        {
            return await _context.Users.FirstOrDefaultAsync(x => x.Email == email);
        }
        public async Task<User?> GetById(long userId)
        {
            return await _context.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == userId);
        }
        public async Task<User?> GetByIdForUpdate(long userId)
        {
            return await _context.Users.FirstOrDefaultAsync(x => x.Id == userId);
        }
        public async Task SaveContext()
        {
            await _context.SaveChangesAsync();
        }
        public async Task SetCodeUsed(long id)
        {
            await _context.UserVerifications.Where(x => x.Id == id)
                .ExecuteUpdateAsync(x => x.SetProperty(u => u.IsUsed, true));
        }
        public async Task ChangePassword(long userId, string pass)
        {
            var sec = Guid.NewGuid().ToString();
            await _context.Users.Where(x => x.Id == userId)
                .ExecuteUpdateAsync(x => x.SetProperty(u => u.HashPassword, pass)
                .SetProperty(u => u.SecurityStamp, sec));
            _cache.Remove($"SECURITY:{userId}");
            _cache.Set($"SECURITY:{userId}", sec, TimeSpan.FromHours(6));
        }
        public async Task<User> Create(User user)
        {
            await _context.Users.AddAsync(user);
            await SaveContext();

            await _context.UserNotes.AddAsync(new UserNote
            {
                UserId = user.Id,
                Title = "Note 1",
                Note = "",
                IsDeleted = false
            });

            var l = await _context.UserInvites.Where(x => x.Email == user.Email && x.IsAccepted && !x.IsUsed).ToListAsync();

            if (l.Any())
            {
                await _context.BoardMembers.AddRangeAsync(l.Select(bid => new BoardMember
                {
                    BoardId = bid.BoardId,
                    RoleCode = "MEMBER",
                    IsActive = true,
                    UserId = user.Id
                }));

                l.ForEach(i => i.IsUsed = true);
            }
            await SaveContext();
            return user;
        }
        public async Task<int> VerifyCountToday(string email)
        {
            var now = await _dbDate.Now();
            return await _context.UserVerifications.CountAsync(x => x.Email == email && x.CreatedAt.Date == now.Date);
        }
        public async Task<int> CheckInviteCountToday(string email)
        {
            var now = await _dbDate.Now();
            return await _context.UserInvites.CountAsync(x => x.Email == email && x.CreatedAt.Date == now.Date);
        }
        public async Task SaveVerifyCode(string email, string code)
        {
            var now = await _dbDate.Now();
            var uv = new UserVerification
            {
                ExpiresAt = now.AddMinutes(5),
                Email = email,
                Code = code,
                CreatedAt = now
            };
            await _context.UserVerifications.AddAsync(uv);
            await SaveContext();
        }
        public async Task<UserVerification?> GetLastVerify(string email)
        {
            return await _context.UserVerifications.AsNoTracking().Where(x => x.Email == email && !x.IsUsed)
                .OrderByDescending(x => x.Id).FirstOrDefaultAsync();
        }
        public async Task<long?> GetUserIdByEmail(string email)
        {
            return await _context.Users.AsNoTracking().Where(u => u.Email == email && u.IsActive)
                .Select(u => (long?)u.Id).FirstOrDefaultAsync();
        }
        public async Task UpdateAvatar(long userId, string avatar)
        {
            await _context.Users.Where(u => u.Id == userId && u.IsActive)
                .ExecuteUpdateAsync(u => u.SetProperty(user => user.Avatar, avatar));
            _cache.Remove($"AVATAR:{userId}");
            _cache.Set($"AVATAR:{userId}", avatar, TimeSpan.FromHours(6));
        }
        public async Task<bool> CheckInvite(long userId, long boardId, string email)
        {
            return await _context.UserInvites.AsNoTracking()
                .AnyAsync(i => i.BoardId == boardId && i.Email == email && !i.IsUsed);
        }
        public async Task<List<InviteResultModel>> GetInvites(string email)
        {
            return await _context.UserInvites.AsNoTracking()
                .Where(x => x.Email == email && !x.IsUsed && !x.IsAccepted)
                .Select(x => new InviteResultModel
                {
                    Id = x.Id,
                    BoardName = x.Board.Title,
                    InviterName = x.SenderUser.FullName
                })
                .ToListAsync();
        }
        public async Task<List<NotificationResultModel>> GetNotifications(long userId)
        {
            return await _context.UserNotifications.AsNoTracking()
                .Where(n => n.UserId == userId && !n.IsDeleted)
                .Select(x => new NotificationResultModel
                {
                    Id = x.Id,
                    Message = x.Message,
                    CreatedAt = x.CreatedAt
                })
                .OrderByDescending(n => n.CreatedAt)
                .ToListAsync();
        }
        public async Task<bool> CheckNotification(long userId, long id)
        {
            return await _context.UserNotifications
                .AnyAsync(n => n.UserId == userId && n.Id == id && !n.IsDeleted);
        }
        public async Task DeleteNotification(long id, long userId)
        {
            await _context.UserNotifications.Where(n => n.Id == id)
                .ExecuteUpdateAsync(n => n.SetProperty(x => x.IsDeleted, true));
            _cache.Remove($"User_HasUpdates_{userId}");
        }
        public async Task DeleteNotifications(long userId)
        {
            await _context.UserNotifications.Where(n => n.UserId == userId && !n.IsDeleted)
                .ExecuteUpdateAsync(n => n.SetProperty(x => x.IsDeleted, true));
            _cache.Remove($"User_HasUpdates_{userId}");
        }
        public async Task<UserInvite?> GetInvite(long id)
        {
            return await _context.UserInvites.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        }
        public async Task SetAcceptedInvite(long inviteId, long userId)
        {
            await _context.UserInvites.Where(bc => bc.Id == inviteId)
                .ExecuteUpdateAsync(bc => bc.SetProperty(b => b.IsAccepted, true));
            _cache.Remove($"User_HasUpdates_{userId}");
        }
        public async Task<UserInvite> AddInvite(long senderUserId, long boardId, string email, long userId)
        {
            var now = await _dbDate.Now();
            var invite = new UserInvite
            {
                BoardId = boardId,
                Email = email,
                IsAccepted = false,
                CreatedAt = now,
                SenderUserId = senderUserId
            };
            await _context.UserInvites.AddAsync(invite);
            await _context.SaveChangesAsync();
            if (userId > 0)
            {
                _cache.Remove($"User_HasUpdates_{userId}");
            }
            return invite;
        }
        public async Task<bool> CheckUpdates(long userId, string email)
        {
            string cacheKey = $"User_HasUpdates_{userId}";

            if (!_cache.TryGetValue(cacheKey, out bool hasUpdates))
            {
                bool hasNotif = await _context.UserNotifications.AnyAsync(x => x.UserId == userId && !x.IsDeleted);
                if (!hasNotif)
                {
                    bool hasInvite = await _context.UserInvites.AnyAsync(x => x.Email == email && !x.IsUsed);
                    hasUpdates = hasInvite;
                }
                else
                {
                    hasUpdates = true;
                }

                _cache.Set(cacheKey, hasUpdates, TimeSpan.FromHours(1));
            }

            return hasUpdates;
        }
        public async Task<string> GetHashPasswordByEmail(string email)
        {
            return await _context.Users.AsNoTracking()
                .Where(u => u.Email == email && u.IsActive)
                .Select(u => u.HashPassword)
                .FirstOrDefaultAsync() ?? string.Empty;
        }
        public async Task<string> GetAvatar(long userId)
        {
            string key = $"AVATAR:{userId}";
            if (!_cache.TryGetValue(key, out string? avatar) || string.IsNullOrEmpty(avatar))
            {
                avatar = await _context.Users.AsNoTracking()
                .Where(u => u.Id == userId && u.IsActive)
                .Select(u => u.Avatar)
                .FirstOrDefaultAsync() ?? string.Empty;

                _cache.Set(key, avatar, TimeSpan.FromHours(6));
            }
            return avatar;
        }
        public async Task<List<QuickNoteResultModel>> GetQuickNotes(long userId)
        {
            string key = $"NOTE:{userId}";
            if (!_cache.TryGetValue(key, out List<QuickNoteResultModel>? notes) || notes == null)
            {
                notes = await _context.UserNotes.AsNoTracking()
                    .Where(q => q.UserId == userId && !q.IsDeleted)
                    .OrderByDescending(x => x.Id)
                    .Select(q => new QuickNoteResultModel { Id = q.Id, Note = q.Note ?? "", Title = q.Title ?? "" })
                    .ToListAsync();

                _cache.Set(key, notes, TimeSpan.FromHours(6));
            }

            return notes;
        }
        public async Task<UserNote> AddQuickNote(long userId, string title, string note)
        {
            var n = new UserNote
            {
                UserId = userId,
                Title = title,
                Note = note,
                IsDeleted = false
            };
            await _context.UserNotes.AddAsync(n);
            await _context.SaveChangesAsync();
            return n;
        }
        public async Task RenameQuickNote(long noteId, string title)
        {
            await _context.UserNotes.Where(n => n.Id == noteId)
                .ExecuteUpdateAsync(n => n.SetProperty(x => x.Title, title));
        }
        public async Task UpdateQuickNote(long userId, long noteId, string note)
        {
            await _context.UserNotes.Where(n => n.Id == noteId)
                .ExecuteUpdateAsync(n => n.SetProperty(x => x.Note, note));

            _cache.Remove($"NOTE:{userId}");
        }
        public async Task<bool> ValidateQuickNote(long userId, long noteId)
        {
            return await _context.UserNotes.AnyAsync(c => c.Id == noteId && c.UserId == userId && !c.IsDeleted);
        }
        public async Task DeleteQuickNote(long noteId)
        {
            await _context.UserNotes.Where(n => n.Id == noteId)
                .ExecuteUpdateAsync(n => n.SetProperty(x => x.IsDeleted, true));
        }
        public async Task<int> GetQuickNoteCount(long userId)
        {
            var c = await GetQuickNotes(userId);
            return c.Count;
        }
    }
}