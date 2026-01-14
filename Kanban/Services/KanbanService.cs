using Kanban.Entities;
using Kanban.Repositories;

namespace Kanban.Services
{
    public class KanbanService : IKanbanService
    {
        private readonly IKanbanRepository _kanbanRepository;
        private readonly IEmailService _emailService;
        private readonly IUserRepository _userRepository;
        public KanbanService(IKanbanRepository kanbanRepository, IUserRepository userRepository, IEmailService emailService)
        {
            _kanbanRepository = kanbanRepository;
            _userRepository = userRepository;
            _emailService = emailService;
        }

        public async Task<ServiceResult<BoardCard>> AddCard(long userId, long columnId, string desc, DateOnly dueDate, int warningDays, string highlightColor)
        {
            try
            {
                if (dueDate < DateOnly.FromDateTime(DateTime.Today))
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

        public async Task<ServiceResult> InviteUserToBoard(long userId, string fullName, long boardId, string email)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithBoardId(userId, boardId))
                {
                    return ServiceResult<BoardCard>.Fail("Bu board'a erişim yetkiniz bulunmamaktadır.");
                }
                var u = await _userRepository.GetByEmail(email);
                if (u == null || !u.IsActive || !u.IsApproved)
                {
                    return ServiceResult.Fail("Mail adresi ile eşleşen kullanıcı bulunamadı, lütfen mail adresini kontrol ediniz.");
                }
                var b = await _kanbanRepository.GetBoard(boardId);
                if (b == null || !b.IsActive)
                {
                    return ServiceResult.Fail("Davetiye gönderilmek istenen board bulunamadı.");
                }

                await _emailService.SendInvite(email, fullName, b.Title);
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

        public async Task<ServiceResult<List<BoardColumn>>> GetBoardColumns_Cards(long userId, long boardId)
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

        public async Task<ServiceResult<List<Models.BoardOwnerResultModel>>> GetBoards(long userId)
        {
            try
            {
                return ServiceResult<List<Models.BoardOwnerResultModel>>.Ok(await _kanbanRepository.GetBoards(userId));
            }
            catch (Exception)
            {
                return ServiceResult<List<Models.BoardOwnerResultModel>>.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
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
    }
}
