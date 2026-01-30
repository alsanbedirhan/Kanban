using Kanban.Entities;
using Kanban.Models;
using Kanban.Repositories;
using Mailjet.Client.Resources;
using Microsoft.IdentityModel.Tokens;
using System.Collections.Generic;
using System.ComponentModel.Design;
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

        public async Task<ServiceResult<BoardCard>> AddCard(long userId, long boardId, long columnId, string desc, DateOnly dueDate,
            int warningDays, string highlightColor, long assigneeId)
        {
            try
            {
                var now = await _dbDate.Now();
                if (dueDate < DateOnly.FromDateTime(now.Date))
                {
                    return ServiceResult<BoardCard>.Fail("Due date cannot be in the past.");
                }
                if (!await _kanbanRepository.ValidateBoardWithBoardId(userId, boardId))
                {
                    return ServiceResult<BoardCard>.Fail("You do not have permission to access this board.");
                }
                return ServiceResult<BoardCard>.Ok(await _kanbanRepository.AddCard(userId, boardId, columnId, desc, dueDate, warningDays, highlightColor, assigneeId));
            }
            catch (Exception)
            {
                return ServiceResult<BoardCard>.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult<BoardColumn>> AddColumn(long userId, long boardId, string title)
        {
            try
            {
                if (!await _kanbanRepository.ValidateManageBoard(userId, boardId))
                {
                    return ServiceResult<BoardColumn>.Fail("You do not have permission to manage this board.");
                }
                return ServiceResult<BoardColumn>.Ok(await _kanbanRepository.AddColumn(boardId, title));
            }
            catch (Exception)
            {
                return ServiceResult<BoardColumn>.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> InviteUserToBoard(long senderUserId, string senderFullName, string senderEmail, long boardId, string email)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithBoardId(senderUserId, boardId))
                {
                    return ServiceResult<BoardCard>.Fail("You do not have permission to access this board.");
                }

                if (await _userRepository.CheckInvite(senderUserId, boardId, email))
                {
                    return ServiceResult<BoardCard>.Fail("An invitation has already been sent for this board.");
                }

                var u = await _userRepository.GetUserIdByEmail(email);
                if (u != null && await _kanbanRepository.CheckBoardMembers(u.Value, boardId))
                {
                    return ServiceResult<BoardCard>.Fail("User is already a member.");
                }

                if (u == null && await _userRepository.CheckInviteCountToday(email) > 0)
                {
                    return ServiceResult<BoardCard>.Fail("You have exceeded the daily invitation limit for non-members.");
                }

                var i = await _userRepository.AddInvite(senderUserId, boardId, email, (u != null ? u.Value : 0));

                var b = await _kanbanRepository.GetBoardTitle(boardId);

                var token = GenerateJwt(email, i.Id, boardId);

                await _emailService.SendInvite(email, senderFullName, senderEmail, b, token);

                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("A database error occurred, please try again.");
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
                return ServiceResult<Board>.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> DeleteBoard(long userId, long boardId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithBoardId(userId, boardId))
                {
                    return ServiceResult<List<BoardColumn>>.Fail("You do not have permission to access this board.");
                }
                await _kanbanRepository.DeleteBoard(userId, boardId);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> DeleteCard(long userId, long boardId, long cardId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithBoardId(userId, boardId))
                {
                    return ServiceResult.Fail("You do not have permission to access this board.");
                }
                var card = await _kanbanRepository.GetCardAssignee(cardId);

                if (card != null && card > 0 && userId != card)
                {
                    return ServiceResult.Fail("Only the assigned user can delete this card.");
                }
                await _kanbanRepository.DeleteCard(cardId);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> DeleteColumn(long userId, long boardId, long columnId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateManageBoard(userId, boardId))
                {
                    return ServiceResult.Fail("You do not have permission to manage this board.");
                }
                await _kanbanRepository.DeleteColumn(columnId);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult<List<BoardColumnResultModel>>> GetBoard(long userId, long boardId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithBoardId(userId, boardId))
                {
                    return ServiceResult<List<BoardColumnResultModel>>.Fail("You do not have permission to access this board.");
                }

                return ServiceResult<List<BoardColumnResultModel>>.Ok(await _kanbanRepository.GetBoardColumns_Cards(boardId));
            }
            catch (Exception)
            {
                return ServiceResult<List<BoardColumnResultModel>>.Fail("A database error occurred, please try again.");
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
                return ServiceResult<List<BoardOwnerResultModel>>.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> MoveCard(long userId, long boardId, long cardId, long newColumnId, int newOrder)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithBoardId(userId, boardId))
                {
                    return ServiceResult<List<BoardColumn>>.Fail("You do not have permission to access this board.");
                }

                var card = await _kanbanRepository.GetCardAssignee(cardId);

                if (card != null && card > 0 && userId != card)
                {
                    return ServiceResult<List<BoardColumn>>.Fail("Only the assigned user can move this card.");
                }

                await _kanbanRepository.MoveCard(userId, cardId, newColumnId, newOrder);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("A database error occurred, please try again.");
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
                var i = await _userRepository.GetInvite(v.InviteId);
                if (i == null || i.IsAccepted || v.Email != i.Email || v.BoardId != i.BoardId)
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
                await _userRepository.SetAcceptedInvite(v.InviteId, (u != null ? u.Value : 0));
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
                    return ServiceResult<List<BoardMemberResultModel>>.Fail("You do not have permission to access this board.");
                }
                return ServiceResult<List<BoardMemberResultModel>>.Ok(await _kanbanRepository.GetBoardMembers(boardId));
            }
            catch (Exception)
            {
                return ServiceResult<List<BoardMemberResultModel>>.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> DeleteMember(long userId, long boardId, long removeUserId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateManageBoard(userId, boardId))
                {
                    return ServiceResult.Fail("You do not have permission to manage this board.");
                }
                await _kanbanRepository.DeleteMember(boardId, removeUserId);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> PromoteToOwner(long userId, long boardId, long promoteUserId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateManageBoard(userId, boardId))
                {
                    return ServiceResult.Fail("You do not have permission to manage this board.");
                }
                await _kanbanRepository.PromoteToOwner(boardId, promoteUserId);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult<BoardRefresResultModel>> GetBoardVersion(long userId, long boardId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithBoardId(userId, boardId))
                {
                    return ServiceResult<BoardRefresResultModel>.Fail("You do not have permission to access this board."); // Or management permission depending on intent, but usually read access to version is fine
                }
                return ServiceResult<BoardRefresResultModel>.Ok(await _kanbanRepository.GetBoardVersion(boardId));
            }
            catch (Exception)
            {
                return ServiceResult<BoardRefresResultModel>.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> UpdateCard(long userId, long boardId, long cardId, string desc, DateOnly dueDate, int warningDays, string highlightColor, long assigneeId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithBoardId(userId, boardId))
                {
                    return ServiceResult<BoardCard>.Fail("You do not have permission to access this board.");
                }

                var card = await _kanbanRepository.GetCardAssignee(cardId);

                if (card != null && card > 0 && userId != card)
                {
                    return ServiceResult<List<BoardColumn>>.Fail("Only the assigned user can update this card.");
                }

                await _kanbanRepository.UpdateCard(userId, cardId, desc, dueDate, warningDays, highlightColor, assigneeId);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult<List<InviteResultModel>>> GetInvites(string email)
        {
            try
            {
                return ServiceResult<List<InviteResultModel>>.Ok(await _userRepository.GetInvites(email));
            }
            catch (Exception)
            {
                return ServiceResult<List<InviteResultModel>>.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> WorkInvite(string email, long userId, long inviteId, bool isAccepted)
        {
            try
            {
                var i = await _userRepository.GetInvite(inviteId);
                if (i == null)
                {
                    return ServiceResult.Fail("Invitation not found.");
                }
                if (i.IsUsed)
                {
                    return ServiceResult.Fail("Invitation has already been used.");
                }
                if (i.Email != email)
                {
                    return ServiceResult.Fail("Invitation does not match the email address.");
                }
                if (!await _kanbanRepository.ValidateBoardWithBoardId(i.SenderUserId, i.BoardId))
                {
                    return ServiceResult.Fail("The inviting user no longer has authority.");
                }
                await _kanbanRepository.WorkInvite(inviteId, userId, i.BoardId, isAccepted);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult<List<NotificationResultModel>>> GetNotifications(long userId)
        {
            try
            {
                return ServiceResult<List<NotificationResultModel>>.Ok(await _userRepository.GetNotifications(userId));
            }
            catch (Exception)
            {
                return ServiceResult<List<NotificationResultModel>>.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> DeleteNotification(long userId, long id)
        {
            try
            {
                if (!await _userRepository.CheckNotification(userId, id))
                {
                    return ServiceResult.Fail("You do not have permission to delete this notification.");
                }
                await _userRepository.DeleteNotification(id, userId);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> DeleteNotifications(long userId)
        {
            try
            {
                await _userRepository.DeleteNotifications(userId);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult<bool>> CheckUpdates(long userId, string email)
        {
            try
            {
                return ServiceResult<bool>.Ok(await _userRepository.CheckUpdates(userId, email));
            }
            catch (Exception)
            {
                return ServiceResult<bool>.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult<List<CommentResutModel>>> GetComments(long userId, long boardId, long cardId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithBoardId(userId, boardId))
                {
                    return ServiceResult<List<CommentResutModel>>.Fail("You do not have permission to access this board.");
                }

                return ServiceResult<List<CommentResutModel>>.Ok(await _kanbanRepository.GetComments(cardId));
            }
            catch (Exception)
            {
                return ServiceResult<List<CommentResutModel>>.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult<BoardCardComment>> AddComment(long userId, long boardId, long cardId, string message)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithBoardId(userId, boardId))
                {
                    return ServiceResult<BoardCardComment>.Fail("You do not have permission to access this board.");
                }

                return ServiceResult<BoardCardComment>.Ok(await _kanbanRepository.AddComment(userId, cardId, message));
            }
            catch (Exception)
            {
                return ServiceResult<BoardCardComment>.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> DeleteComment(long userId, long boardId, long commentId)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithBoardId(userId, boardId))
                {
                    return ServiceResult.Fail("You do not have permission to access this board.");
                }

                if (!await _kanbanRepository.ValidateComment(userId, commentId))
                {
                    return ServiceResult.Fail("You do not have permission to delete this comment.");
                }
                await _kanbanRepository.DeleteComment(commentId);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("A database error occurred, please try again.");
            }
        }

        public async Task<ServiceResult> UpdateBoardTitle(long userId, long boardId, string title)
        {
            try
            {
                if (!await _kanbanRepository.ValidateManageBoard(userId, boardId))
                {
                    return ServiceResult.Fail("You do not have permission to manage this board.");
                }

                await _kanbanRepository.UpdateBoardTitle(boardId, title);
                return ServiceResult.Ok();
            }
            catch (Exception)
            {
                return ServiceResult.Fail("A database error occurred, please try again.");
            }
        }
    }
}