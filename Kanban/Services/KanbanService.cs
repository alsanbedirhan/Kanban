using Kanban.Entities;
using Kanban.Repositories;

namespace Kanban.Services
{
    public class KanbanService : IKanbanService
    {
        private readonly IKanbanRepository _kanbanRepository;
        public KanbanService(IKanbanRepository kanbanRepository)
        {
            _kanbanRepository = kanbanRepository;
        }

        public async Task<ServiceResult<BoardCard>> AddCard(long userId, long columnId, string desc)
        {
            try
            {
                if (!await _kanbanRepository.ValidateBoardWithColumnId(userId, columnId))
                {
                    return ServiceResult<BoardCard>.Fail("Bu board'a erişim yetkiniz bulunmamaktadır.");
                }
                return ServiceResult<BoardCard>.Ok(await _kanbanRepository.AddCard(userId, columnId, desc));
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
                await _kanbanRepository.DeleteBoard(boardId);
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

        public async Task<ServiceResult<List<Board>>> GetBoards(long userId)
        {
            try
            {
                return ServiceResult<List<Board>>.Ok(await _kanbanRepository.GetBoards(userId));
            }
            catch (Exception)
            {
                return ServiceResult<List<Board>>.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
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
