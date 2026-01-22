using Kanban.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Net;
using System.Net.Mail;
using System.Threading.Tasks;

namespace Kanban.Repositories
{
    public class UserRepository : IUserRepository
    {
        private readonly KanbanDbContext _context;
        private readonly IDBDateTimeProvider _dbDate;

        public UserRepository(KanbanDbContext context, IDBDateTimeProvider dbDate)
        {
            _context = context;
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
        public async Task<User?> GetById(long id)
        {
            return await _context.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
        }
        public async Task<User?> GetByIdForUpdate(long id)
        {
            return await _context.Users.FirstOrDefaultAsync(x => x.Id == id);
        }
        public async Task SaveContext()
        {
            await _context.SaveChangesAsync();
        }

        public async Task SetCodeUsed(long id)
        {
            await _context.Userverifications.Where(x => x.Id == id)
                .ExecuteUpdateAsync(x => x.SetProperty(u => u.IsUsed, true));
        }

        public async Task<User> Create(User user)
        {
            await _context.Users.AddAsync(user);
            await SaveContext();
            return user;
        }

        public async Task<int> VerifyCountToday(string email)
        {
            var now = await _dbDate.Now();
            return await _context.Userverifications.CountAsync(x => x.Email == email && x.CreatedAt.Date == now.Date);
        }

        public async Task SaveVerifyCode(string email, string code)
        {
            var now = await _dbDate.Now();
            var uv = new Userverification
            {
                ExpiresAt = now.AddMinutes(5),
                Email = email,
                Code = code,
                CreatedAt = now
            };
            await _context.Userverifications.AddAsync(uv);
            await SaveContext();
        }

        public async Task<Userverification?> GetLastVerify(string email)
        {
            return await _context.Userverifications.AsNoTracking().Where(x => x.Email == email && !x.IsUsed)
                .OrderByDescending(x => x.Id).FirstOrDefaultAsync();
        }

        public async Task<long?> GetUserIdByEmail(string email)
        {
            return await _context.Users.AsNoTracking().Where(u => u.Email == email && u.IsActive)
                .Select(u => (long?)u.Id).FirstOrDefaultAsync();
        }
    }
}