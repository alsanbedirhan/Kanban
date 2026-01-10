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

        public UserRepository(KanbanDbContext context)
        {
            _context = context;
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

        public async Task<User> Create(User user)
        {
            await _context.Users.AddAsync(user);
            await SaveContext();
            return user;
        }
    }
}