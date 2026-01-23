using Kanban.Entities;
using Kanban.Models;
using Kanban.Repositories;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace Kanban.Services
{
    public class KanbanService : IKanbanService
    {
        private readonly JwtSettings? _jwtSettings;
        private readonly IKanbanRepository _kanbanRepository;
        private readonly IEmailService _emailService;
        private readonly IUserRepository _userRepository;
        private readonly IDBDateTimeProvider _dbDate;
        public KanbanService(IConfiguration config, IKanbanRepository kanbanRepository,
            IUserRepository userRepository, IEmailService emailService, IDBDateTimeProvider dbDate)
        {
            _jwtSettings = config.GetSection("JwtSettingsKey").Get<JwtSettings>() ?? null;
            _kanbanRepository = kanbanRepository;
            _userRepository = userRepository;
            _emailService = emailService;
            _dbDate = dbDate;
        }

        public async Task<ServiceResult<BoardCard>> AddCard(long userId, long columnId, string desc, DateOnly dueDate, int warningDays, string highlightColor)
        {
            try
            {
                var now = await _dbDate.Now();
                if (dueDate < DateOnly.FromDateTime(now.Date))
                {
                    return ServiceResult<BoardCard>.Fail("Tarih bugünden önce olamaz.");
                }
                if (!await _kanbanRepository.ValidateBoardWithColumnId(userId, columnId))
                {
                    return ServiceResult<BoardCard>.Fail("Bu board'a erişim yetkiniz bulunmamaktadır.");
                }
                return ServiceResult<BoardCard>.Ok(await _kanbanRepository.AddCard(userId, columnId, desc, dueDate, warningDays, highlightColor));
            }
            catch (Exception)
            {
                return ServiceResult<BoardCard>.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public async Task<ServiceResult<BoardColumn>> AddColumn(long boardId, string title)
        {
            try
            {
                return ServiceResult<BoardColumn>.Ok(await _kanbanRepository.AddColumn(boardId, title));
            }
            catch (Exception)
            {
                return ServiceResult<BoardColumn>.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public async Task<ServiceResult> AddUserToBoard(long userId, long boardId, string roleCode)
        {
            try
            {
                await _kanbanRepository.AddUserToBoard(userId, boardId, roleCode);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public async Task<ServiceResult> InviteUserToBoard(long senderUserId, string senderFullName, string senderEmail, long boardId, string email)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithBoardId(senderUserId, boardId))
                {
                    return ServiceResult<BoardCard>.Fail("Bu board'a erişim yetkiniz bulunmamaktadır.");
                }
                var u = await _userRepository.GetUserIdByEmail(email);
                if (u != null && await _kanbanRepository.CheckBoardMembers(u.Value, boardId))
                {
                    return ServiceResult<BoardCard>.Fail("Kullanıcı zaten üye.");
                }

                var i = await _kanbanRepository.AddInvite(senderUserId, boardId, email);

                var b = await _kanbanRepository.GetBoardTitle(boardId);

                var token = GenerateJwt(email, i.Id, boardId);

                await _emailService.SendInvite(email, senderFullName, senderEmail, b, token);

                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public async Task<ServiceResult<Board>> CreateBoard(long userId, string title)
        {
            try
            {
                return ServiceResult<Board>.Ok(await _kanbanRepository.AddBoard(userId, title));
            }
            catch (Exception)
            {
                return ServiceResult<Board>.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public async Task<ServiceResult> DeleteBoard(long userId, long boardId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithBoardId(userId, boardId))
                {
                    return ServiceResult<List<BoardColumn>>.Fail("Bu board'a erişim yetkiniz bulunmamaktadır.");
                }
                await _kanbanRepository.DeleteBoard(userId, boardId);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public async Task<ServiceResult> DeleteCard(long userId, long cardId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithCardId(userId, cardId))
                {
                    return ServiceResult<List<BoardColumn>>.Fail("Bu board'a erişim yetkiniz bulunmamaktadır.");
                }
                await _kanbanRepository.DeleteCard(cardId);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public async Task<ServiceResult> DeleteColumn(long userId, long columnId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithColumnId(userId, columnId))
                {
                    return ServiceResult<List<BoardColumn>>.Fail("Bu board'a erişim yetkiniz bulunmamaktadır.");
                }
                await _kanbanRepository.DeleteColumn(columnId);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public async Task<ServiceResult<List<BoardColumn>>> GetBoard(long userId, long boardId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithBoardId(userId, boardId))
                {
                    return ServiceResult<List<BoardColumn>>.Fail("Bu board'a erişim yetkiniz bulunmamaktadır.");
                }

                return ServiceResult<List<BoardColumn>>.Ok(await _kanbanRepository.GetBoardColumns_Cards(boardId));
            }
            catch (Exception)
            {
                return ServiceResult<List<BoardColumn>>.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public async Task<ServiceResult<List<BoardOwnerResultModel>>> GetBoards(long userId)
        {
            try
            {
                return ServiceResult<List<BoardOwnerResultModel>>.Ok(await _kanbanRepository.GetBoards(userId));
            }
            catch (Exception)
            {
                return ServiceResult<List<BoardOwnerResultModel>>.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public async Task<ServiceResult> MoveCard(long userId, long boardId, long cardId, long newColumnId, int newOrder)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithBoardId(userId, boardId))
                {
                    return ServiceResult<List<BoardColumn>>.Fail("Bu board'a erişim yetkiniz bulunmamaktadır.");
                }
                await _kanbanRepository.MoveCard(userId, cardId, newColumnId, newOrder);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public string GenerateJwt(string email, long inviteId, long boardId)
        {
            var claims = new[]
            {
            new Claim(ClaimTypes.Email, email),
            new Claim("InviteId", inviteId.ToString()),
            new Claim("BoardId", boardId.ToString())
        };

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.Key));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: _jwtSettings.Issuer,
                audience: _jwtSettings.Audience,
                claims: claims,
                expires: DateTime.UtcNow.AddMinutes(15),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        public async Task<ServiceResult<InviteStatus>> VerifyActivationToken(long activeUserId, string token)
        {
            try
            {
                var handler = new JwtSecurityTokenHandler();

                var validations = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = _jwtSettings.Issuer,
                    ValidAudience = _jwtSettings.Audience,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.Key)),
                    ClockSkew = TimeSpan.Zero
                };

                var claims = handler.ValidateToken(token, validations, out var tokenSecure) ?? throw new Exception();

                var v = new BoardUserInviteModel
                {
                    InviteId = long.Parse(claims.FindFirst("InviteId")!.Value),
                    Email = claims.FindFirst(ClaimTypes.Email)!.Value,
                    BoardId = long.Parse(claims.FindFirst("BoardId")!.Value),
                };
                var now = await _dbDate.Now();
                var i = await _kanbanRepository.GetInvite(v.InviteId);
                if (i == null || i.IsAccepted || v.Email != i.Email || v.BoardId != i.BoardId || i.ExpiresAt < now)
                {
                    throw new Exception();
                }
                var u = await _userRepository.GetUserIdByEmail(v.Email);
                if (u != null)
                {
                    if (await _kanbanRepository.CheckBoardMembers(u.Value, v.BoardId))
                    {
                        return ServiceResult<InviteStatus>.Ok(InviteStatus.ALREADY);
                    }
                    if (activeUserId > 0 && activeUserId != u.Value)
                    {
                        return ServiceResult<InviteStatus>.Ok(InviteStatus.WRONG_ACC);
                    }
                }
                await _kanbanRepository.SetAcceptedInvite(v.InviteId);
                if (u != null)
                {
                    await _kanbanRepository.AddUserToBoard(u.Value, v.BoardId, "MEMBER");
                    var r = ServiceResult<InviteStatus>.Ok(InviteStatus.ADDED);
                    r.ErrorMessage = i.Email;
                    return r;
                }
                var res = ServiceResult<InviteStatus>.Ok(InviteStatus.REGISTER);
                res.ErrorMessage = i.Email;
                return res;
            }
            catch
            {
                return ServiceResult<InviteStatus>.Ok(InviteStatus.ERROR);
            }
        }

        public async Task<ServiceResult<List<BoardMemberResultModel>>> GetBoardMembers(long userId, long boardId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithBoardId(userId, boardId))
                {
                    return ServiceResult<List<BoardMemberResultModel>>.Fail("Bu board'a erişim yetkiniz bulunmamaktadır.");
                }
                return ServiceResult<List<BoardMemberResultModel>>.Ok(await _kanbanRepository.GetBoardMembers(boardId));
            }
            catch (Exception)
            {
                return ServiceResult<List<BoardMemberResultModel>>.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public async Task<ServiceResult> DeleteMember(long userId, long boardId, long removeUserId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateManageBoard(userId, boardId))
                {
                    return ServiceResult.Fail("Bu board'a yönetim yetkiniz bulunmamaktadır.");
                }
                await _kanbanRepository.DeleteMember(boardId, removeUserId);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public async Task<ServiceResult> PromoteToOwner(long userId, long boardId, long promoteUserId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateManageBoard(userId, boardId))
                {
                    return ServiceResult.Fail("Bu board'a yönetim yetkiniz bulunmamaktadır.");
                }
                await _kanbanRepository.PromoteToOwner(boardId, promoteUserId);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public async Task<ServiceResult> UpdateAvatar(long userId, string avatar)
        {
            try
            {
                await _userRepository.UpdateAvatar(userId, avatar);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }

        public async Task<ServiceResult<BoardRefresResultModel>> GetBoardVersion(long userId, long boardId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithBoardId(userId, boardId))
                {
                    return ServiceResult<BoardRefresResultModel>.Fail("Bu board'a yönetim yetkiniz bulunmamaktadır.");
                }
                return ServiceResult<BoardRefresResultModel>.Ok(await _kanbanRepository.GetBoardVersion(boardId));
            }
            catch (Exception)
            {
                return ServiceResult<BoardRefresResultModel>.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }
    }
}
